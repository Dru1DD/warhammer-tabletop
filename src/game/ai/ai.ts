// Utility-based AI. It only proposes commands; every command still goes
// through engine.validate / engine.apply, exactly like a human's.

import { FACTION_NAME } from '../data/datasheets'
import { dist, withinRange } from '../geometry/geometry'
import {
  alive, CHARGE_RANGE, engagedUnits, enemiesOf, hasAbility, isMV, modelInTerrain, objectiveLevels, profileOf,
  unitDistance, unitNearObjective, unitsOf, fmt,
} from '../gameState'
import { actor, maxMove, meleePlan, shootPlan, validate, moveModeFor } from '../engine'
import { moveProblem, planMove } from '../rules/movement'
import type { AttackContext, AttackGroup } from '../combat/attack'
import { woundTarget } from '../combat/attack'
import { avgDie } from '../dice/dice'
import type { Command, GameState, PlayerId, UnitState, Vec } from '../types'
import { WEAPONS } from '../data/datasheets'

export type AiLevel = 'beginner' | 'standard'

export interface AiWeights {
  damageDealt: number
  damageTaken: number
  objective: number
  distance: number
  attackOpportunity: number
  survival: number
  positioning: number
}

export const AI_WEIGHTS: Record<PlayerId, AiWeights> = {
  marines: { damageDealt: 1.0, damageTaken: 0.8, objective: 1.2, distance: 0.08, attackOpportunity: 0.25, survival: 1.0, positioning: 0.5 },
  orks: { damageDealt: 0.6, damageTaken: 0.6, objective: 1.0, distance: 0.2, attackOpportunity: 1.5, survival: 0.8, positioning: 0.4 },
}

export interface AiDecision {
  cmd: Command
  explanation: string
}

// ------------------------------------------------------------ expectations

const pFace = (ok: (v: number) => boolean) => [1, 2, 3, 4, 5, 6].filter(ok).length / 6

export function expectedGroupDamage(g: AttackGroup & { ctx: AttackContext }, target: UnitState): number {
  const p = g.profile
  const t = Math.max(...alive(target).map((m) => profileOf(m).t))
  const wt = woundTarget(p.s, t)
  const wmod = g.ctx.woundMod ?? 0
  const pw = pFace((v) => v !== 1 && (v === 6 || v + wmod >= wt))
  let pHitNormal: number, pCrit: number
  if (p.skill === null) { pHitNormal = 1; pCrit = 0 } else {
    const skill = Math.min(6, Math.max(2, p.skill + g.ctx.skillWorsen))
    const mod = Math.max(-1, Math.min(1, g.ctx.hitMod))
    pCrit = 1 / 6
    pHitNormal = pFace((v) => v !== 1 && v !== 6 && v + mod >= skill)
  }
  const woundsPerAttack = pHitNormal * pw + pCrit * (g.ctx.lethalHits ? 1 : pw)
  const m = alive(target)[0]
  const pr = profileOf(m)
  const need = Math.min(pr.sv - p.ap, pr.invuln ?? 99, g.ctx.invulnOverride ?? 99)
  const pFail = pFace((v) => v === 1 || v < need)
  const avgW = alive(target).reduce((a, x) => a + profileOf(x).w, 0) / alive(target).length
  const attacks = g.attacks + (g.randomAttacks ?? 0) * avgDie(p.randomA)
  const dmg = Math.max(1, p.d + avgDie(p.randomD) + (g.ctx.damageMod ?? 0))
  return attacks * woundsPerAttack * pFail * Math.min(dmg, avgW)
}

const shootValue = (s: GameState, u: UnitState, t: UnitState, opts: Parameters<typeof shootPlan>[3] = {}) => {
  const plan = shootPlan(s, u, t, opts)
  if (plan.problem) return { dmg: 0, plan }
  return { dmg: plan.groups.reduce((a, g) => a + expectedGroupDamage(g, t), 0), plan }
}

/** Melee damage if every model got into combat (optimistic, used for planning). */
function meleePotential(s: GameState, u: UnitState, t: UnitState, charged: boolean) {
  let total = 0
  for (const m of alive(u)) {
    const w = profileOf(m).weapons.map((id) => WEAPONS[id]).find((x) => x.profiles[0].range === 'melee')
    if (!w) continue
    const p = w.profiles[0]
    const g = {
      weaponName: w.name, profile: p, models: 1, notes: [],
      attacks: p.attacks + (p.keywords.cleave ? p.keywords.cleave * Math.floor(alive(t).length / 5) : 0),
      randomAttacks: p.randomA ? 1 : 0,
      ctx: {
        hitMod: 0, hitModNotes: [], skillWorsen: 0,
        lethalHits: (hasAbility(u, 'tacticalPrecision') && !isMV(t)) || (hasAbility(u, 'tideOfMuscle') && charged),
        invulnOverride: t.owner === 'orks' && s.players.orks.riledTurns > 0 ? 5 : undefined,
        damageMod: hasAbility(t, 'dreadArd') ? -1 : 0,
      },
    }
    total += expectedGroupDamage(g, t)
  }
  return total
}

/** P(2D6 >= n) */
export const p2d6AtLeast = (n: number) => {
  let c = 0
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= Math.max(3, n)) c++
  return c / 36
}

const unitValue = (u: UnitState) => (alive(u).some((m) => profileOf(m).character) ? 1.5 : 1)

// ------------------------------------------------------------ evaluation

function withPositions(s: GameState, u: UnitState, pos: Record<string, Vec>, patch: Partial<UnitState> = {}): GameState {
  return {
    ...s,
    units: s.units.map((x) => (x.id !== u.id ? x : { ...x, ...patch, models: x.models.map((m) => (pos[m.id] ? { ...m, pos: pos[m.id] } : m)) })),
  }
}

function scorePosition(s: GameState, u: UnitState, level: AiLevel, mode: 'normal' | 'advance' | 'fallBack' | 'stay'): { score: number; why: string } {
  const w = AI_WEIGHTS[u.owner]
  const enemies = enemiesOf(s, u)
  const me = s.units.find((x) => x.id === u.id)!
  const hypo: UnitState = { ...me, move: mode === 'stay' ? 'none' : mode, shot: false, movedDistance: me.movedDistance }
  const hs: GameState = { ...s, units: s.units.map((x) => (x.id === u.id ? hypo : x)) }

  let dealt = 0
  if (mode !== 'fallBack') for (const e of enemies) dealt = Math.max(dealt, shootValue(hs, hypo, e).dmg)

  let charge = 0
  if (mode !== 'fallBack' && (mode !== 'advance' || s.players[u.owner].riledTurns > 0))
    for (const e of enemies) {
      const d = unitDistance(hypo, e)
      if (d <= CHARGE_RANGE) charge = Math.max(charge, p2d6AtLeast(Math.ceil(d)) * meleePotential(s, hypo, e, true))
    }

  let taken = 0
  if (level === 'standard')
    for (const e of enemies) {
      taken += shootValue(hs, e, hypo).dmg
      const d = unitDistance(hypo, e)
      if (d <= CHARGE_RANGE) taken += p2d6AtLeast(Math.ceil(d)) * meleePotential(s, e, hypo, true) * 0.5
    }

  let obj = 0
  let nearestObj = Infinity
  for (const o of s.objectives) {
    const lv = objectiveLevels(hs, o)
    const mine = lv[u.owner], theirs = lv[u.owner === 'marines' ? 'orks' : 'marines']
    if (unitNearObjective(hypo, o)) obj += mine > theirs ? 1 : 0.5
    nearestObj = Math.min(nearestObj, Math.min(...alive(hypo).map((m) => dist(m.pos, o.pos))))
  }
  const nearestEnemy = Math.min(...enemies.map((e) => unitDistance(hypo, e)))
  const cover = alive(hypo).every((m) => modelInTerrain(s, m)) ? 1 : 0

  const distTerm = u.owner === 'orks' ? nearestEnemy * 0.5 + nearestObj * 0.5 : nearestObj
  const score =
    w.damageDealt * dealt +
    w.attackOpportunity * charge -
    w.damageTaken * w.survival * unitValue(u) * taken +
    w.objective * obj -
    w.distance * distTerm +
    w.positioning * cover
  const parts = [
    dealt > 0.3 ? `ожидаемый урон стрельбой ${fmt(dealt)}` : '',
    charge > 0.3 ? `шанс атаки (charge) с уроном ${fmt(charge)}` : '',
    obj ? 'контроль цели' : '',
    cover ? 'укрытие' : '',
    taken > 0.5 ? `риск получить ${fmt(taken)} урона` : '',
  ].filter(Boolean)
  return { score, why: parts.join(', ') }
}

function candidateGoals(s: GameState, u: UnitState, level: AiLevel): { pos: Vec; label: string }[] {
  const enemies = enemiesOf(s, u)
  const goals: { pos: Vec; label: string }[] = []
  const nearestEnemy = enemies.reduce((b, e) => (unitDistance(u, e) < unitDistance(u, b) ? e : b), enemies[0])
  if (nearestEnemy) goals.push({ pos: alive(nearestEnemy)[0].pos, label: 'к врагу' })
  const objs = [...s.objectives].sort((a, b) => dist(alive(u)[0].pos, a.pos) - dist(alive(u)[0].pos, b.pos))
  for (const o of level === 'beginner' ? objs.slice(0, 1) : objs) goals.push({ pos: o.pos, label: 'к цели' })
  if (level === 'standard')
    for (const t of s.terrain) {
      const c = t.poly.reduce((a, p) => ({ x: a.x + p.x / t.poly.length, y: a.y + p.y / t.poly.length }), { x: 0, y: 0 })
      goals.push({ pos: c, label: 'в укрытие' })
    }
  return goals
}

function bestMove(s: GameState, u: UnitState, level: AiLevel, mode: 'normal' | 'advance' | 'fallBack', max = maxMove(u)) {
  const centroid = (() => {
    const a = alive(u)
    return { x: a.reduce((t, m) => t + m.pos.x, 0) / a.length, y: a.reduce((t, m) => t + m.pos.y, 0) / a.length }
  })()
  let best: { pos: Record<string, Vec>; score: number; why: string; label: string } | null = null
  const goals = mode === 'fallBack'
    ? [{ pos: { x: u.owner === 'marines' ? 0 : s.board.width, y: centroid.y }, label: 'назад' }]
    : candidateGoals(s, u, level)
  for (const g of goals) {
    for (const k of [1, 0.66, 0.33]) {
      const offset = { x: g.pos.x - centroid.x, y: g.pos.y - centroid.y }
      const pos = planMove(s, u, (m) => ({ pos: { x: m.pos.x + offset.x, y: m.pos.y + offset.y }, radius: 0 }), max * k, mode)
      if (moveProblem(s, u, pos, max, mode)) continue
      if (!Object.keys(pos).some((id) => dist(pos[id], alive(u).find((m) => m.id === id)!.pos) > 0.05)) continue
      const sc = scorePosition(withPositions(s, u, pos), u, level, mode)
      if (!best || sc.score > best.score) best = { pos, score: sc.score, why: sc.why, label: g.label }
    }
  }
  return best
}

// ------------------------------------------------------------ decisions

export function decide(s: GameState, level: AiLevel = 'standard'): AiDecision | null {
  if (s.winner) return null
  const me = actor(s)
  const fac = FACTION_NAME[me]
  const mine = unitsOf(s, me)
  const end = (why: string): AiDecision => ({ cmd: { type: 'endPhase' }, explanation: why })

  if (s.pendingCharge) {
    const u = s.units.find((x) => x.id === s.pendingCharge!.unitId)!
    for (const t of s.pendingCharge.targets) {
      const cmd: Command = { type: 'chargeMove', unitId: u.id, targetIds: [t] }
      if (validate(s, cmd).ok) return { cmd, explanation: `${fac}: отряд «${u.name}» врывается в рукопашную!` }
    }
    return { cmd: { type: 'skipCharge', unitId: u.id }, explanation: `${fac}: перемещение атаки невозможно — отряд остаётся на месте.` }
  }

  switch (s.phase) {
    case 'command': {
      if (me === 'orks' && validate(s, { type: 'callWaaagh' }).ok) {
        // Riled up lets Orks charge after advancing: worth it once M + D6 + 2D6 can plausibly reach.
        const reach = level === 'beginner' ? 9 : 6 + 3.5 + 7
        const close = mine.some((u) => enemiesOf(s, u).some((e) => unitDistance(u, e) <= reach))
        if (close || s.round >= 4) return { cmd: { type: 'callWaaagh' }, explanation: 'Орки: враг на дистанции рывка и атаки — время для WAAAGH!' }
      }
      return end(`${fac}: фаза командования завершена.`)
    }
    case 'movement': {
      for (const u of mine) {
        if (u.move !== 'none') continue
        const mode = moveModeFor(s, u)
        const stay = scorePosition(s, u, level, 'stay')
        if (mode === 'fallBack') {
          if (level === 'beginner') continue
          const fb = bestMove(s, u, level, 'fallBack')
          const enemy = engagedUnits(s, u)[0]
          const mDealt = enemy ? meleePotential(s, u, enemy, false) : 0
          const mTaken = enemy ? meleePotential(s, enemy, u, false) : 0
          if (fb && me === 'marines' && mTaken > mDealt * 1.5)
            return { cmd: { type: 'move', unitId: u.id, mode: 'fallBack', positions: fb.pos }, explanation: `${fac}: отряд «${u.name}» отступает — в рукопашной противник сильнее (ожид. урон по нам ${fmt(mTaken)} против ${fmt(mDealt)}).` }
          continue
        }
        if (u.advanceRoll !== null) {
          const adv = bestMove(s, u, level, 'advance')
          if (adv && adv.score > stay.score) return { cmd: { type: 'move', unitId: u.id, mode: 'advance', positions: adv.pos }, explanation: `${fac}: отряд «${u.name}» продвигается ${adv.label}${adv.why ? ` (${adv.why})` : ''}.` }
          continue
        }
        const nm = bestMove(s, u, level, 'normal')
        // Advance is scored like any other option, at the average roll (M + 3.5").
        const canAdvance = validate(s, { type: 'declareAdvance', unitId: u.id }).ok
        const adv = canAdvance ? bestMove(s, u, level, 'advance', maxMove(u) + 3.5) : null
        const options = [
          { kind: 'stay' as const, score: stay.score },
          ...(nm ? [{ kind: 'normal' as const, score: nm.score }] : []),
          ...(adv ? [{ kind: 'advance' as const, score: adv.score }] : []),
        ].sort((a, b) => b.score - a.score)
        const pick = options[0]
        if (pick.kind === 'advance' && pick.score > stay.score + 0.05)
          return { cmd: { type: 'declareAdvance', unitId: u.id }, explanation: `${fac}: отряд «${u.name}» продвигается (Advance) ${adv!.label}${adv!.why ? ` — ${adv!.why}` : ''}.` }
        if (pick.kind === 'normal' && nm && nm.score > stay.score + 0.05)
          return { cmd: { type: 'move', unitId: u.id, mode: 'normal', positions: nm.pos }, explanation: `${fac}: отряд «${u.name}» двигается ${nm.label}${nm.why ? ` — ${nm.why}` : ''}.` }
      }
      return end(`${fac}: движение завершено.`)
    }
    case 'shooting': {
      for (const u of mine) {
        if (u.shot) continue
        let best: { cmd: Command; dmg: number; target: string } | null = null
        for (const e of enemiesOf(s, u)) {
          for (const opts of shootOptions(u, level)) {
            const cmd: Command = { type: 'shoot', unitId: u.id, targetId: e.id, ...opts }
            if (!validate(s, cmd).ok) continue
            let { dmg, plan } = shootValue(s, u, e, opts)
            dmg -= plan.hazardousModels * (1 / 3) * AI_WEIGHTS[me].survival * unitValue(u)
            if (opts.useAmmoRunts) dmg -= 0.8 // keep the once-per-battle bonus for a juicier moment
            if (!best || dmg > best.dmg) best = { cmd, dmg, target: e.name }
          }
        }
        if (best && best.dmg > 0.05)
          return { cmd: best.cmd, explanation: `${fac}: отряд «${u.name}» стреляет по «${best.target}» (ожидаемый урон ≈ ${fmt(best.dmg)}).` }
      }
      return end(`${fac}: подходящих целей для стрельбы больше нет.`)
    }
    case 'charge': {
      for (const u of mine) {
        const cmd: Command = { type: 'declareCharge', unitId: u.id }
        if (!validate(s, cmd).ok) continue
        const best = enemiesOf(s, u)
          .map((e) => ({ e, d: unitDistance(u, e) }))
          .filter((x) => withinRange(x.d, CHARGE_RANGE))
          .map((x) => ({ ...x, p: p2d6AtLeast(Math.ceil(x.d)), dealt: meleePotential(s, u, x.e, true), taken: meleePotential(s, x.e, u, false) }))
          .sort((a, b) => b.p * b.dealt - a.p * a.dealt)[0]
        if (!best) continue
        const eager = AI_WEIGHTS[me].attackOpportunity
        const worth = level === 'beginner' ? best.p > 0.4 : best.p * best.dealt * eager > best.taken * 0.5 && best.p > 0.15
        if (worth)
          return { cmd, explanation: `${fac}: отряд «${u.name}» объявляет атаку на «${best.e.name}» (нужно ${Math.ceil(best.d)}" на 2D6, шанс ≈ ${Math.round(best.p * 100)}%).` }
      }
      return end(`${fac}: атаки не объявлены.`)
    }
    case 'fight': {
      if (!s.fight) return end(`${fac}: бои завершены.`)
      for (const u of mine) {
        for (const e of engagedUnits(s, u).sort((a, b) => expectedMelee(s, u, b) - expectedMelee(s, u, a))) {
          const cmd: Command = { type: 'fight', unitId: u.id, targetId: e.id }
          if (validate(s, cmd).ok) return { cmd, explanation: `${fac}: отряд «${u.name}» сражается с «${e.name}».` }
        }
      }
      return null
    }
  }
}

const expectedMelee = (s: GameState, u: UnitState, t: UnitState) => meleePlan(s, u, t).reduce((a, g) => a + expectedGroupDamage(g, t), 0)

function shootOptions(u: UnitState, level: AiLevel) {
  const multi = [...new Set(alive(u).flatMap((m) => profileOf(m).weapons))].filter((id) => WEAPONS[id].profiles.length > 1 && WEAPONS[id].profiles[0].range !== 'melee')
  let combos: Record<string, number>[] = [{}]
  if (level === 'standard') for (const id of multi) combos = combos.flatMap((c) => WEAPONS[id].profiles.map((_, i) => ({ ...c, [id]: i })))
  const out: { profiles: Record<string, number>; usePistols?: boolean; useAmmoRunts?: boolean }[] = []
  for (const c of combos) {
    out.push({ profiles: c })
    out.push({ profiles: c, usePistols: true })
    if (level === 'standard' && hasAbility(u, 'ammoRunts') && !u.ammoRuntsUsed) out.push({ profiles: c, useAmmoRunts: true })
  }
  return out
}

/** Unused-model guard for tests: every AI command must be legal. */
export const aiCommandIsLegal = (s: GameState, d: AiDecision | null) => !d || validate(s, d.cmd).ok

