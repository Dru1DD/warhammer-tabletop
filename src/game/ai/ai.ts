// Utility-based AI. It only proposes commands; every command still goes
// through engine.validate / engine.apply, exactly like a human's.

import { FACTION_NAME } from '../data/datasheets'
import { dist, withinRange } from '../geometry/geometry'
import {
  alive, CHARGE_RANGE, datasheetOf, ledUnitOf, engagedUnits, enemiesOf, hasAbility, inSynapseRange, isFlyer, isMV, modelInTerrain, objectiveLevels, other, profileOf,
  sidesOf, unitDistance, unitNearObjective, unitsOf, unitsWithin, weaponsOf, fmt,
} from '../gameState'
import { actor, FLY_PENALTY, maxMove, meleePlan, meleeSetup, meleeWeaponsOf, shootPlan, SWIFT_BONUS, validate, moveModeFor } from '../engine'
import { moveProblem, planMove } from '../rules/movement'
import { EXPLOSIVES_DICE, STRATAGEMS } from '../rules/stratagems'
import { reactionAdvice } from '../reactionAdvice'

/** Army Stratagems the AI spends on a good volley / a good fight. */
const SHOOTING_BUFFS: StratagemId[] = ['stormOfDevastation', 'closeRangeDakka', 'conqueringTyrant', 'blitzingFirepower', 'lethalDosage']
const FIGHT_BUFFS: StratagemId[] = ['hitEmHarder', 'hungryVoid', 'adrenalSurge']
import type { AttackContext, AttackGroup } from '../combat/attack'
import { woundTarget } from '../combat/attack'
import { avgDie } from '../dice/dice'
import type { Command, GameState, PlayerId, StratagemId, UnitState, Vec } from '../types'
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
  /** Tyranids: value of keeping a non-Synapse unit inside Synapse Range */
  synapse?: number
  /** Adeptus Mechanicus: value of a Tech-Priest standing next to the unit it leads */
  support?: number
}

export const AI_WEIGHTS: Record<PlayerId, AiWeights> = {
  marines: { damageDealt: 1.0, damageTaken: 0.8, objective: 1.2, distance: 0.08, attackOpportunity: 0.25, survival: 1.0, positioning: 0.5 },
  orks: { damageDealt: 0.6, damageTaken: 0.6, objective: 1.0, distance: 0.2, attackOpportunity: 1.5, survival: 0.8, positioning: 0.4 },
  // Tyranids: a swarm that throws itself at the enemy, cares little about losses, stays inside Synapse Range
  tyranids: { damageDealt: 0.7, damageTaken: 0.35, objective: 1.0, distance: 0.2, attackOpportunity: 1.6, survival: 0.5, positioning: 0.2, synapse: 0.6 },
  // Necrons: methodical gunline that holds objectives and relies on Reanimation Protocols; melee cults and swarms hunt
  necrons: { damageDealt: 0.9, damageTaken: 0.7, objective: 1.1, distance: 0.1, attackOpportunity: 0.7, survival: 0.9, positioning: 0.5 },
  // Aeldari: fragile hit-and-run shooters: value survival and cover, avoid melee, fall back when losing a fight
  aeldari: { damageDealt: 1.0, damageTaken: 0.9, objective: 1.0, distance: 0.1, attackOpportunity: 0.3, survival: 1.1, positioning: 0.6 },
  // Adeptus Mechanicus: efficient ranged engagements, careful with expensive Kataphron and Tech-Priests, supports its escorts
  adeptus_mechanicus: { damageDealt: 1.0, damageTaken: 0.85, objective: 1.1, distance: 0.1, attackOpportunity: 0.5, survival: 1.0, positioning: 0.6, support: 0.8 },
}

/** Faction temperament: `aggressive` closes the distance to the enemy (original Orks behaviour), `retreats` falls back from a lost melee. */
export const AI_STYLE: Record<PlayerId, { aggressive: boolean; retreats: boolean }> = {
  marines: { aggressive: false, retreats: true },
  orks: { aggressive: true, retreats: false },
  tyranids: { aggressive: true, retreats: false },
  necrons: { aggressive: false, retreats: false },
  aeldari: { aggressive: false, retreats: true },
  adeptus_mechanicus: { aggressive: false, retreats: true },
}
/** Melee-first datasheets hunt the enemy even inside a shooting army. */
const HUNTERS = new Set(['hiveTyrant', 'skorpekhDestroyers', 'scarabSwarms', 'hormagaunts', 'sicarians'])
/** Expensive Adeptus Mechanicus platforms: the AI protects them (their expected losses weigh more). */
const VALUABLE = new Set(['breachers', 'destroyers', 'kastelans'])
const aggressive = (u: UnitState) => HUNTERS.has(u.datasheetId) || AI_STYLE[u.owner].aggressive
/** The Introductory Set and Combat Patrol units of Marines and Orks keep the exact original melee estimate (their
 * behaviour is pinned by the golden-master test); units added later use the full melee setup. */
const LEGACY_DATASHEETS = new Set(['lieutenant', 'intercessors', 'assaultIntercessors', 'redemptor', 'boyz', 'deffDread'])
const legacyUnit = (u: UnitState) => LEGACY_DATASHEETS.has(u.datasheetId)

/** Bomb Squig: expected models of `t` destroyed by D3 mortal wounds (after the 3+ roll), weighted by how much they matter. */
function squigValue(t: UnitState): number {
  const ws = alive(t).map((m) => m.wounds).sort((a, b) => a - b)
  let kills = 0
  for (const n of [1, 2, 3]) {
    let left = n
    for (const w of ws) {
      if (left < w) break
      left -= w
      kills += 1 / 3
    }
  }
  return (2 / 3) * (kills + 0.1) * unitValue(t)
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
  const antiRoll = p.keywords.anti && datasheetOf(target).keywords.includes(p.keywords.anti.keyword) ? p.keywords.anti.roll : 7
  let pw = pFace((v) => v !== 1 && (v === 6 || v >= antiRoll || v + wmod >= wt))
  if (p.keywords.twinLinked || g.ctx.rerollWounds === 'all') pw += (1 - pw) * pw // failed wound rolls are re-rolled
  else if (g.ctx.rerollWounds === 'ones') pw += pw / 6 // wound rolls of 1 are re-rolled
  let pHitNormal: number, pCrit: number
  if (p.skill === null) { pHitNormal = 1; pCrit = 0 } else {
    const psy = !!p.keywords.psychic
    // Snap Shooting hits only on an unmodified 6, Psychic weapons included
    const skill = g.ctx.snap ? 6 : Math.min(6, Math.max(2, p.skill + (psy ? 0 : g.ctx.skillWorsen)))
    const mod = g.ctx.snap ? 0 : psy ? Math.max(0, Math.max(-1, Math.min(1, g.ctx.hitMod))) : Math.max(-1, Math.min(1, g.ctx.hitMod))
    const critOn = g.ctx.critHitOn ?? 6
    pCrit = (7 - critOn) / 6
    pHitNormal = pFace((v) => v !== 1 && v < critOn && v + mod >= skill)
    if (g.ctx.rerollHits) {
      const r = g.ctx.rerollHits === 'ones' ? 1 / 6 : 1 - (pHitNormal + pCrit)
      const crit0 = pCrit
      pHitNormal += r * pHitNormal
      pCrit += r * crit0
    }
  }
  const lethal = g.ctx.lethalHits
  let woundsPerAttack = pHitNormal * pw + pCrit * (lethal ? 1 : pw)
  const sustained = g.sustainedHits ?? p.keywords.sustainedHits ?? 0
  if (sustained) woundsPerAttack += pCrit * sustained * pw
  const m = alive(target)[0]
  const pr = profileOf(m)
  const need = Math.min(pr.sv - p.ap, pr.invuln ?? 99, g.ctx.invulnOverride ?? 99)
  // Feel No Pain: a fraction of the damage is ignored
  const fnpLeft = g.ctx.fnp ? 1 - pFace((v) => v >= g.ctx.fnp!) : 1
  const pFail = pFace((v) => v === 1 || v < need) * fnpLeft
  const avgW = alive(target).reduce((a, x) => a + profileOf(x).w, 0) / alive(target).length
  const attacks = g.attacks + (g.randomAttacks ?? 0) * avgDie(p.randomA)
  const dmg = Math.max(1, p.d + avgDie(p.randomD) + (g.ctx.damageMod ?? 0))
  if (p.keywords.devastatingWounds) {
    // critical wounds skip the save and deal D mortal wounds
    let pcw = pFace((v) => v !== 1 && (v === 6 || v >= antiRoll))
    if (p.keywords.twinLinked) pcw += (1 - pcw) * pcw
    const share = Math.min(1, pcw / Math.max(pw, 1e-9))
    const mortal = p.d + avgDie(p.randomD)
    return attacks * woundsPerAttack * ((1 - share) * pFail * Math.min(dmg, avgW) + share * mortal * fnpLeft)
  }
  return attacks * woundsPerAttack * pFail * Math.min(dmg, avgW)
}

const shootValue = (s: GameState, u: UnitState, t: UnitState, opts: Parameters<typeof shootPlan>[3] = {}) => {
  const plan = shootPlan(s, u, t, { ...opts, rangeFirst: true })
  if (plan.problem) return { dmg: 0, plan }
  return { dmg: plan.groups.reduce((a, g) => a + expectedGroupDamage(g, t), 0), plan }
}

/** Longest range among the ranged weapons of the unit's living models (any profile). */
function maxRange(u: UnitState) {
  let r = -Infinity
  for (const m of alive(u)) for (const w of weaponsOf(m)) for (const p of w.profiles) if (p.range !== 'melee') r = Math.max(r, p.range)
  return r
}

/** Expected shooting damage only. A target beyond every weapon's range takes exactly 0 (shootPlan fires a weapon only
 * when the nearest visible target model is within range, and no model is nearer than `unitDistance`), so the line of
 * sight checks are skipped for it. */
const shootDamage = (s: GameState, u: UnitState, t: UnitState, d?: number) =>
  (d === undefined ? unitsWithin(u, t, maxRange(u)) : withinRange(d, maxRange(u))) ? shootValue(s, u, t).dmg : 0

/** Melee damage if every model got into combat (optimistic, used for planning). */
/** Expected melee wounds of every model of `u` against `t` (as if all of them reach), with the charge bonuses when `charged`. */
export function meleePotential(s: GameState, u: UnitState, t: UnitState, charged: boolean) {
  let total = 0
  const hypo = charged === u.charged ? u : { ...u, charged }
  const legacy = legacyUnit(u)
  for (const m of alive(u)) {
    for (const w of meleeWeaponsOf(m)) {
      const base = w.profiles[0]
      const setup = meleeSetup(s, hypo, t, base)
      const p = legacy ? base : setup.profile
      const ctx: AttackContext = legacy
        ? {
            hitMod: 0, hitModNotes: [], skillWorsen: 0,
            lethalHits: (hasAbility(u, 'tacticalPrecision') && !isMV(t)) || (hasAbility(u, 'tideOfMuscle') && charged),
            invulnOverride: t.owner === 'orks' && s.players.orks.riledTurns > 0 ? 5 : undefined,
            damageMod: hasAbility(t, 'dreadArd') || hasAbility(t, 'implacableResilience') ? -1 : 0,
          }
        : setup.ctx
      const g = {
        weaponName: w.name, profile: p, models: 1, notes: [],
        attacks: p.attacks + (p.keywords.cleave ? p.keywords.cleave * Math.floor(alive(t).length / 5) : 0),
        randomAttacks: p.randomA ? 1 : 0,
        ctx,
      }
      total += expectedGroupDamage(g, t)
    }
  }
  return total
}

/** P(2D6 >= n) */
export const p2d6AtLeast = (n: number) => {
  let c = 0
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= Math.max(3, n)) c++
  return c / 36
}

const unitValue = (u: UnitState) => (alive(u).some((m) => profileOf(m).character) ? 1.5 : VALUABLE.has(u.datasheetId) ? 1.3 : 1)

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
  // edge distance from this position to each enemy (asked for several times below)
  const dTo = new Map(enemies.map((e) => [e, unitDistance(hypo, e)]))
  if (mode !== 'fallBack') for (const e of enemies) dealt = Math.max(dealt, shootDamage(hs, hypo, e, dTo.get(e)))

  let charge = 0
  if (mode !== 'fallBack' && (mode !== 'advance' || s.players[u.owner].riledTurns > 0 || hasAbility(u, 'boundingLeap')))
    for (const e of enemies) {
      const d = dTo.get(e)!
      if (d <= CHARGE_RANGE) charge = Math.max(charge, p2d6AtLeast(Math.ceil(d)) * meleePotential(s, hypo, e, true))
    }

  let taken = 0
  if (level === 'standard')
    for (const e of enemies) {
      taken += shootDamage(hs, e, hypo)
      const d = dTo.get(e)!
      if (d <= CHARGE_RANGE) taken += p2d6AtLeast(Math.ceil(d)) * meleePotential(s, e, hypo, true) * 0.5
    }

  let obj = 0
  let nearestObj = Infinity
  for (const o of s.objectives) {
    const lv = objectiveLevels(hs, o)
    const mine = lv[u.owner], theirs = lv[other(s, u.owner)]
    if (unitNearObjective(hypo, o)) obj += mine > theirs ? 1 : 0.5
    nearestObj = Math.min(nearestObj, Math.min(...alive(hypo).map((m) => dist(m.pos, o.pos))))
  }
  const nearestEnemy = Math.min(...enemies.map((e) => dTo.get(e)!))
  const cover = alive(hypo).every((m) => modelInTerrain(s, m)) ? 1 : 0

  const distTerm = aggressive(u) ? nearestEnemy * 0.5 + nearestObj * 0.5 : nearestObj
  const synapse = w.synapse && datasheetOf(u).faction === 'tyranids' && inSynapseRange(hs, hypo) ? w.synapse : 0
  // Tech-Priests keep close to the unit they lead (Lord of the Machine Cult, Galvanic Field)
  const leader = hasAbility(u, 'lordOfMachineCult') || hasAbility(u, 'galvanicField')
  const support = w.support && leader && ledUnitOf(hs, hypo) ? w.support : 0
  const score =
    synapse +
    support +
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
    synapse ? 'остаётся в зоне Synapse' : '',
    support ? 'рядом с ведомым отрядом' : '',
    cover ? 'укрытие' : '',
    taken > 0.5 ? `риск получить ${fmt(taken)} урона` : '',
  ].filter(Boolean)
  return { score, why: parts.join(', ') }
}

function candidateGoals(s: GameState, u: UnitState, level: AiLevel): { pos: Vec; label: string }[] {
  const enemies = enemiesOf(s, u)
  const goals: { pos: Vec; label: string }[] = []
  if (hasAbility(u, 'lordOfMachineCult') || hasAbility(u, 'galvanicField')) {
    const mates = unitsOf(s, u.owner).filter((x) => x.id !== u.id && hasAbility(x, 'ledUnit'))
    const near = mates.sort((a, b) => unitDistance(u, a) - unitDistance(u, b))[0]
    if (near) goals.push({ pos: alive(near)[0].pos, label: 'к ведомому отряду' })
  }
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

interface BestMove { pos: Record<string, Vec>; score: number; why: string; label: string; fly: boolean }

/** FLY units also try "taking to the skies" (−2″, ignores models and terrain); the better-scored option wins. */
function bestMove(s: GameState, u: UnitState, level: AiLevel, mode: 'normal' | 'advance' | 'fallBack', max = maxMove(u)): BestMove | null {
  const centroid = (() => {
    const a = alive(u)
    return { x: a.reduce((t, m) => t + m.pos.x, 0) / a.length, y: a.reduce((t, m) => t + m.pos.y, 0) / a.length }
  })()
  let best: BestMove | null = null
  const ownEdge = sidesOf(s)[0] === u.owner ? 0 : s.board.width
  const goals = mode === 'fallBack'
    ? [{ pos: { x: ownEdge, y: centroid.y }, label: 'назад' }]
    : candidateGoals(s, u, level)
  // different goals often plan the very same positions (a blocked unit, goals in one direction): score each once
  const scored = new Map<string, { score: number; why: string }>()
  for (const fly of isFlyer(u) ? [false, true] : [false]) {
    const reach = max - (fly ? FLY_PENALTY : 0)
    for (const g of goals) {
      for (const k of [1, 0.66, 0.33]) {
        const offset = { x: g.pos.x - centroid.x, y: g.pos.y - centroid.y }
        const pos = planMove(s, u, (m) => ({ pos: { x: m.pos.x + offset.x, y: m.pos.y + offset.y }, radius: 0 }), reach * k, mode, [], 0, fly)
        if (moveProblem(s, u, pos, reach, mode, [], fly)) continue
        if (!Object.keys(pos).some((id) => dist(pos[id], alive(u).find((m) => m.id === id)!.pos) > 0.05)) continue
        const key = JSON.stringify(pos)
        let sc = scored.get(key)
        if (!sc) {
          sc = scorePosition(withPositions(s, u, pos), u, level, mode)
          scored.set(key, sc)
        }
        if (!best || sc.score > best.score) best = { pos, score: sc.score, why: sc.why, label: g.label, fly }
      }
    }
  }
  return best
}

/** Aeldari Battle Focus: use Swift as the Wind only when the move really needs the extra 2″. */
const swiftAvailable = (s: GameState, u: UnitState) => datasheetOf(u).faction === 'aeldari' && (s.players[u.owner].focus ?? 0) > 0
const longestStep = (u: UnitState, pos: Record<string, Vec>) => Math.max(0, ...alive(u).map((m) => (pos[m.id] ? dist(m.pos, pos[m.id]) : 0)))

/** Doctrina Imperatives: Protector rewards standing and shooting (Heavy, BS) and blunts enemy charges; Conqueror rewards
 * advancing (Assault) and fighting (WS, AP). The expected damage of both is compared, the better one is chosen. */
function chooseImperative(s: GameState, me: PlayerId, level: AiLevel): { imperative: 'protector' | 'conqueror'; why: string } {
  const mine = unitsOf(s, me).filter((u) => hasAbility(u, 'doctrina'))
  const nearest = (u: UnitState) => Math.min(...enemiesOf(s, u).map((e) => unitDistance(u, e)))
  if (level === 'beginner') {
    const close = mine.some((u) => nearest(u) <= CHARGE_RANGE)
    return close ? { imperative: 'conqueror', why: 'враг рядом, нужен ближний бой и натиск' } : { imperative: 'protector', why: 'враг далеко, лучше стрелять с места' }
  }
  const value = (imp: 'protector' | 'conqueror') => {
    const hs: GameState = { ...s, players: { ...s.players, [me]: { ...s.players[me], imperative: imp } } }
    let v = 0
    for (const raw of mine) {
      const u = hs.units.find((x) => x.id === raw.id)!
      // out of range of everyone: the unit will have to move, so Heavy does not count
      const hypo: UnitState = nearest(u) > 24 ? { ...u, movedDistance: 99 } : u
      let shoot = 0, melee = 0, taken = 0
      for (const e of enemiesOf(hs, u)) {
        shoot = Math.max(shoot, shootDamage(hs, hypo, e))
        const d = unitDistance(u, e)
        if (d <= CHARGE_RANGE) {
          const p = p2d6AtLeast(Math.ceil(d))
          melee = Math.max(melee, p * meleePotential(hs, u, e, true))
          taken += p * meleePotential(hs, e, u, true) * 0.5
        }
      }
      v += shoot + 0.6 * melee - 0.5 * taken
    }
    return v
  }
  const p = value('protector'), c = value('conqueror')
  return c > p + 0.05
    ? { imperative: 'conqueror', why: `ожидаемый результат ${fmt(c)} против ${fmt(p)}: натиск и ближний бой выгоднее` }
    : { imperative: 'protector', why: `ожидаемый результат ${fmt(p)} против ${fmt(c)}: огонь с места и защита выгоднее` }
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

  if (s.pendingReroll) {
    // the game stops only for a re-roll worth it; the beginner keeps its dice
    const pr = s.pendingReroll
    const reroll = level !== 'beginner'
    return { cmd: { type: 'rerollChoice', reroll }, explanation: reroll ? `${fac}: «Командный переброс» — в среднем +${fmt(pr.gain)} урона (${pr.weapon}).` : `${fac}: кубик оставлен.` }
  }

  if (s.reaction) {
    // a reaction in the opponent's turn: only when it is worth the CP (the beginner never reacts)
    const best = level === 'beginner' ? undefined : reactionAdvice(s).find((o) => o.worth)
    if (best) return { cmd: best.cmd, explanation: `${fac}: стратагема «${best.title}» — ${best.why}` }
    return { cmd: { type: 'passReaction' }, explanation: `${fac}: без реакций.` }
  }

  switch (s.phase) {
    case 'command': {
      // Extinction Order (Tech-Priest): an objective with enemy units on it
      if (level !== 'beginner' && s.players[me].cp >= 2)
        for (const u of mine)
          for (const o of s.objectives) {
            const cmd: Command = { type: 'stratagem', id: 'extinctionOrder', unitId: u.id, targetId: o.id }
            if (validate(s, cmd).ok && enemiesOf(s, u).some((e) => alive(e).length && unitNearObjective(e, o)))
              return { cmd, explanation: `${fac}: стратагема «Приказ об истреблении» — «${u.name}» бьёт по врагам на цели.` }
          }
      // Engrammatic Logic (Royal Warden): free a battle-shocked unit, the one that matters most for objectives
      for (const u of mine) {
        if (!hasAbility(u, 'engrammaticLogic') || u.engrammaticUsed) continue
        const freed = mine
          .filter((f) => validate(s, { type: 'engrammatic', unitId: u.id, targetId: f.id }).ok)
          .sort((a, b) => Number(s.objectives.some((o) => unitNearObjective(b, o))) - Number(s.objectives.some((o) => unitNearObjective(a, o))) || alive(b).length - alive(a).length)[0]
        if (freed) return { cmd: { type: 'engrammatic', unitId: u.id, targetId: freed.id }, explanation: `${fac}: «${u.name}» снимает боевой шок с «${freed.name}» (Engrammatic Logic).` }
      }
      if (validate(s, { type: 'imperative', imperative: 'protector' }).ok) {
        const imp = chooseImperative(s, me, level)
        return { cmd: { type: 'imperative', imperative: imp.imperative }, explanation: `${fac}: Империатив «${imp.imperative === 'protector' ? 'Протектор' : 'Завоеватель'}» — ${imp.why}.` }
      }
      if (me === 'orks' && validate(s, { type: 'callWaaagh' }).ok) {
        // Riled up lets Orks charge after advancing: worth it once M + D6 + 2D6 can plausibly reach.
        const reach = level === 'beginner' ? 9 : 6 + 3.5 + 7
        const close = mine.some((u) => enemiesOf(s, u).some((e) => unitDistance(u, e) <= reach))
        if (close || s.round >= 4) return { cmd: { type: 'callWaaagh' }, explanation: 'Орки: враг на дистанции рывка и атаки — время для WAAAGH!' }
      }
      if (me === 'tyranids' && validate(s, { type: 'callShadow' }).ok) {
        // Shadow in the Warp: worth it once there are enough healthy enemy units to threaten with battle-shock
        const healthy = unitsOf(s, other(s, me)).filter((e) => !e.battleShocked).length
        if (s.round >= 2 && healthy >= 2) return { cmd: { type: 'callShadow' }, explanation: 'Тираниды: Тень в Варпе — враг проходит проверку боевого шока.' }
      }
      return end(`${fac}: фаза командования завершена.`)
    }
    case 'movement': {
      for (const u of mine) {
        if (u.move !== 'none') continue
        const mode = moveModeFor(s, u)
        if (mode === 'fallBack') {
          if (level === 'beginner') continue
          const fb = bestMove(s, u, level, 'fallBack')
          const enemy = engagedUnits(s, u)[0]
          const mDealt = enemy ? meleePotential(s, u, enemy, false) : 0
          const mTaken = enemy ? meleePotential(s, enemy, u, false) : 0
          if (fb && AI_STYLE[me].retreats && mTaken > mDealt * 1.5)
            return { cmd: { type: 'move', unitId: u.id, mode: 'fallBack', positions: fb.pos, ...(fb.fly ? { fly: true } : {}) }, explanation: `${fac}: отряд «${u.name}» отступает — в рукопашной противник сильнее (ожид. урон по нам ${fmt(mTaken)} против ${fmt(mDealt)}).` }
          continue
        }
        const stay = scorePosition(s, u, level, 'stay')
        const swiftBonus = swiftAvailable(s, u) ? SWIFT_BONUS : 0
        if (u.advanceRoll !== null) {
          const adv = bestMove(s, u, level, 'advance', maxMove(u) + swiftBonus)
          if (adv && adv.score > stay.score) {
            const swift = swiftBonus > 0 && longestStep(u, adv.pos) > maxMove(u) - (adv.fly ? FLY_PENALTY : 0) + 0.01
            return { cmd: { type: 'move', unitId: u.id, mode: 'advance', positions: adv.pos, ...(adv.fly ? { fly: true } : {}), ...(swift ? { swift: true } : {}) }, explanation: `${fac}: отряд «${u.name}» продвигается ${adv.label}${adv.why ? ` (${adv.why})` : ''}${swift ? ' — Swift as the Wind' : ''}.` }
          }
          continue
        }
        const nm = bestMove(s, u, level, 'normal', maxMove(u) + swiftBonus)
        // Advance is scored like any other option, at the average roll (M + 3.5").
        const canAdvance = validate(s, { type: 'declareAdvance', unitId: u.id }).ok
        const adv = canAdvance ? bestMove(s, u, level, 'advance', maxMove(u) + 3.5 + swiftBonus) : null
        const options = [
          { kind: 'stay' as const, score: stay.score },
          ...(nm ? [{ kind: 'normal' as const, score: nm.score }] : []),
          ...(adv ? [{ kind: 'advance' as const, score: adv.score }] : []),
        ].sort((a, b) => b.score - a.score)
        const pick = options[0]
        if (pick.kind === 'advance' && pick.score > stay.score + 0.05)
          return { cmd: { type: 'declareAdvance', unitId: u.id }, explanation: `${fac}: отряд «${u.name}» продвигается (Advance) ${adv!.label}${adv!.why ? ` — ${adv!.why}` : ''}.` }
        if (pick.kind === 'normal' && nm && nm.score > stay.score + 0.05) {
          const swift = swiftBonus > 0 && longestStep(u, nm.pos) > maxMove(u) - (nm.fly ? FLY_PENALTY : 0) + 0.01
          return { cmd: { type: 'move', unitId: u.id, mode: 'normal', positions: nm.pos, ...(nm.fly ? { fly: true } : {}), ...(swift ? { swift: true } : {}) }, explanation: `${fac}: отряд «${u.name}» двигается ${nm.label}${nm.why ? ` — ${nm.why}` : ''}${nm.fly ? ' (летит)' : ''}${swift ? ' — Swift as the Wind' : ''}.` }
        }
      }
      // Defend the Divine Work (Manipulus): once per battle, when its unit is about to take a beating
      for (const u of mine) {
        const cmd: Command = { type: 'divineWork', unitId: u.id }
        if (!hasAbility(u, 'defendDivineWork') || !validate(s, cmd).ok) continue
        const led = ledUnitOf(s, u)
        const group = [u, ...(led ? [led] : [])]
        const wounds = group.reduce((n, g) => n + alive(g).reduce((a, m) => a + m.wounds, 0), 0)
        const risk = group.reduce((n, g) => n + enemiesOf(s, g).reduce((a, e) => a + shootDamage(s, e, g) + (unitDistance(e, g) <= CHARGE_RANGE ? p2d6AtLeast(Math.ceil(unitDistance(e, g))) * meleePotential(s, e, g, true) * 0.5 : 0), 0), 0)
        const engaged = group.some((g) => engagedUnits(s, g).length > 0)
        if (level === 'beginner' ? engaged : risk >= wounds * 0.6 || engaged)
          return { cmd, explanation: `${fac}: «${u.name}» применяет Защиту божественного труда — отряду угрожает ≈ ${fmt(risk)} урона, 4+ непробиваемый спасбросок.` }
      }
      // Guide (Farseer) at the end of the Movement phase: mark the enemy unit our army can hurt most
      for (const u of mine) {
        if (!hasAbility(u, 'guide') || u.guided) continue
        const marks = enemiesOf(s, u)
          .map((e) => ({ e, cmd: { type: 'guide', unitId: u.id, targetId: e.id } as Command }))
          .filter((x) => validate(s, x.cmd).ok)
          .sort((a, b) => unitDistance(u, a.e) - unitDistance(u, b.e))
        if (marks[0]) return { cmd: marks[0].cmd, explanation: `${fac}: «${u.name}» направляет союзников на «${marks[0].e.name}» (Guide: +1 к попаданию).` }
      }
      // Grenade Pack Flyover (Swooping Hawks): once per turn after moving, at the enemy unit it hurts most
      for (const u of mine) {
        if (!hasAbility(u, 'grenadePack') || u.grenadePackUsed || u.move === 'none') continue
        const best = enemiesOf(s, u)
          .filter((e) => validate(s, { type: 'grenadePack', unitId: u.id, targetId: e.id }).ok)
          .sort((a, b) => squigValue(b) - squigValue(a))[0]
        if (best) return { cmd: { type: 'grenadePack', unitId: u.id, targetId: best.id }, explanation: `${fac}: «${u.name}» забрасывает «${best.name}» гранатами (Grenade Pack Flyover: 4+ — смертельная рана за модель).` }
      }
      // Wraith Form (Canoptek Wraiths): after a normal move over enemy units, hurt the one where the wounds kill most
      for (const u of mine) {
        if (!u.wraithTargets?.length) continue
        const best = u.wraithTargets
          .map((id) => s.units.find((x) => x.id === id)!)
          .filter((e) => e && validate(s, { type: 'wraithForm', unitId: u.id, targetId: e.id }).ok)
          .sort((a, b) => squigValue(b) - squigValue(a))[0]
        if (best) return { cmd: { type: 'wraithForm', unitId: u.id, targetId: best.id }, explanation: `${fac}: «${u.name}» проходит сквозь «${best.name}» (Wraith Form: 4+ — смертельная рана за модель).` }
      }
      // Bomb Squig (Kommandos): once per battle after a normal move, at the enemy unit it hurts most
      for (const u of mine) {
        if (!hasAbility(u, 'bombSquig') || u.bombSquigUsed || u.move !== 'normal') continue
        const best = enemiesOf(s, u)
          .map((e) => ({ e, cmd: { type: 'bombSquig', unitId: u.id, targetId: e.id } as Command, v: squigValue(e) }))
          .filter((x) => validate(s, x.cmd).ok)
          .sort((a, b) => b.v - a.v)[0]
        if (best) return { cmd: best.cmd, explanation: `${fac}: «${u.name}» выпускает бомбосквига в «${best.e.name}» (3+: D3 смертельные раны).` }
      }
      return end(`${fac}: движение завершено.`)
    }
    case 'shooting': {
      // Driven from Cover (Infernus) shoots first, so the rest of the army fires at a target without cover
      const order = [...mine].sort((a, b) => Number(hasAbility(b, 'drivenFromCover')) - Number(hasAbility(a, 'drivenFromCover')))
      for (const u of order) {
        if (u.shot) continue
        if (level !== 'beginner') {
          const own = Math.max(0, ...enemiesOf(s, u).map((e) => shootValue(s, u, e).dmg))
          const boom = enemiesOf(s, u)
            .map((e) => ({ e, cmd: { type: 'stratagem', id: 'explosives', unitId: u.id, targetId: e.id } as Command }))
            .filter((x) => validate(s, x.cmd).ok)
            .map((x) => ({ ...x, dmg: Math.min(EXPLOSIVES_DICE / 2, alive(x.e).reduce((a, m) => a + m.wounds, 0)) }))
            .sort((a, b) => b.dmg - a.dmg)[0]
          if (boom && boom.dmg >= own + 1)
            return { cmd: boom.cmd, explanation: `${fac}: стратагема «Взрывчатка» — «${u.name}» бросает её в «${boom.e.name}» (≈ ${fmt(boom.dmg)} смертельн. ран против ≈ ${fmt(own)} от стрельбы).` }
        }
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
        // an army's shooting Stratagem on a volley worth it, keeping 1 CP in reserve
        if (best && level !== 'beginner' && best.dmg >= 2.5 && s.players[me].cp >= 2) {
          for (const id of SHOOTING_BUFFS) {
            const buff: Command = { type: 'stratagem', id, unitId: u.id }
            if (validate(s, buff).ok) return { cmd: buff, explanation: `${fac}: стратагема «${STRATAGEMS[id].name}» для «${u.name}» перед залпом по «${best.target}».` }
          }
        }
        if (best && best.dmg > 0.05)
          return { cmd: best.cmd, explanation: `${fac}: отряд «${u.name}» стреляет по «${best.target}» (ожидаемый урон ≈ ${fmt(best.dmg)}).` }
      }
      return end(`${fac}: подходящих целей для стрельбы больше нет.`)
    }
    case 'charge': {
      for (const u of mine) {
        for (const e of engagedUnits(s, u)) {
          const cmd: Command = { type: 'stratagem', id: 'crushingImpact', unitId: u.id, targetId: e.id }
          if (validate(s, cmd).ok) return { cmd, explanation: `${fac}: стратагема «Сокрушительный удар» — «${u.name}» врезается в «${e.name}».` }
        }
        const reroll: Command = { type: 'stratagem', id: 'commandReroll', unitId: u.id }
        if (level !== 'beginner' && validate(s, reroll).ok) {
          const d = Math.min(...enemiesOf(s, u).map((e) => unitDistance(u, e)).filter((x) => withinRange(x, CHARGE_RANGE)))
          if (Number.isFinite(d) && p2d6AtLeast(Math.ceil(d)) >= 0.3)
            return { cmd: reroll, explanation: `${fac}: стратагема «Командный переброс» — атака «${u.name}» сорвалась, перебрасываем (нужно ${Math.ceil(d)}", шанс ≈ ${Math.round(p2d6AtLeast(Math.ceil(d)) * 100)}%).` }
        }
      }
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
          if (!validate(s, cmd).ok) continue
          // Finest Hour (once per battle): spend it on a target worth it (a character, a vehicle or monster, or a tough unit)
          const finest: Command = { ...cmd, finestHour: true }
          const worthy = isMV(e) || alive(e).some((m) => profileOf(m).character) || alive(e).reduce((n, m) => n + m.wounds, 0) >= 8
          if (worthy && validate(s, finest).ok)
            return { cmd: finest, explanation: `${fac}: «${u.name}» сражается с «${e.name}» — «Звёздный час» (+3 атаки, Devastating Wounds).` }
          // an army's melee Stratagem before a fight worth it, keeping 1 CP in reserve
          if (level !== 'beginner' && expectedMelee(s, u, e) >= 2)
            for (const id of FIGHT_BUFFS) {
              const buff: Command = { type: 'stratagem', id, unitId: u.id }
              if (s.players[me].cp >= STRATAGEMS[id].cost + 1 && validate(s, buff).ok)
                return { cmd: buff, explanation: `${fac}: стратагема «${STRATAGEMS[id].name}» — «${u.name}» бьёт по «${e.name}».` }
            }
          return { cmd, explanation: `${fac}: отряд «${u.name}» сражается с «${e.name}».` }
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

