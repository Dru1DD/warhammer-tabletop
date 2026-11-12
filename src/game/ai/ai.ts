// Utility-based AI. It only proposes commands; every command still goes
// through engine.validate / engine.apply, exactly like a human's.

import { FACTION_NAME } from '../data/datasheets'
import { dist, withinRange } from '../geometry/geometry'
import {
  alive, CHARGE_RANGE, ENGAGEMENT_RANGE, OBJECTIVE_RANGE, datasheetOf, ledUnitOf, engagedUnits, enemiesOf, hasAbility, hasKeyword, inSynapseRange, isEngaged, isFlyer, isMV, modelInTerrain, objectiveLevels, other, profileOf,
  sidesOf, unitDistance, unitNearObjective, unitsOf, unitsWithin, weaponsOf, fmt,
} from '../gameState'
import { actor, FLY_PENALTY, hyperPending, maxMove, meleePlan, meleeSetup, meleeWeaponsOf, shootPlan, swiftBonusOf, validate, moveModeFor } from '../engine'
import { unitProfile } from '../army/roles'
import { DOCTRINE_NAME, HYPER_NAME } from '../rules/detachments'
import { moveProblem, planMove } from '../rules/movement'
import { EXPLOSIVES_DICE, STRATAGEMS } from '../rules/stratagems'
import { aiArrivalTarget, arrivalSpot, canDeepStrike, reservesOf } from '../rules/reserves'
import { aiDiscards, SECONDARY, secondaryGoals } from '../rules/secondaries'
import { inTerritory, MISSION_ACTION, objectiveWorth, PRIMARY, SABOTAGE_TERRITORY_BONUS } from '../rules/missions'
import { reactionAdvice } from '../reactionAdvice'

/** Army Stratagems the AI spends on a good volley / a good fight. */
const SHOOTING_BUFFS: StratagemId[] = ['stormOfDevastation', 'closeRangeDakka', 'conqueringTyrant', 'blitzingFirepower', 'lethalDosage']
const FIGHT_BUFFS: StratagemId[] = ['hitEmHarder', 'hungryVoid', 'adrenalSurge']
import type { AttackContext, AttackGroup } from '../combat/attack'
import { woundTarget } from '../combat/attack'
import { avgDie } from '../dice/dice'
import type { CombatDoctrine, Command, GameState, HyperAdaptation, PlayerId, StratagemId, UnitState, Vec } from '../types'
import { WEAPONS } from '../data/datasheets'
import { quote, tr } from '../../i18n/index'

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
/** How much a charge possible next turn is worth against one possible now (it is a turn later and the enemy reacts). */
export const NEXT_TURN_CHARGE = 0.5

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
  // a unit cannot lose more than it has: summed over every enemy gun, the risk of a big swarm ran past its own wounds
  // and froze it in place (battle of 12.11.2026: Hormagaunts, 17 wounds, «risk 28»)
  taken = Math.min(taken, alive(hypo).reduce((a, m) => a + m.wounds, 0))

  // aggressive armies value a charge NEXT turn too: after its own normal move, how likely 2D6 covers the rest. Without
  // it a melee swarm far from the enemy sees only the risk of walking into the guns and stays in cover.
  let approach = 0
  if (aggressive(u) && mode !== 'fallBack') {
    const m = Math.min(...alive(hypo).map((x) => profileOf(x).m))
    for (const e of enemies) {
      const need = Math.max(dTo.get(e)! - m, ENGAGEMENT_RANGE)
      if (need <= CHARGE_RANGE) approach = Math.max(approach, p2d6AtLeast(Math.ceil(need)) * meleePotential(s, hypo, e, true))
    }
  }

  let obj = 0
  let nearestObj = Infinity
  for (const o of s.objectives) {
    const lv = objectiveLevels(hs, o)
    const mine = lv[u.owner], theirs = lv[other(s, u.owner)]
    if (unitNearObjective(hypo, o)) obj += (mine > theirs ? 1 : 0.5) * objectiveWorth(s, u.owner, o)
    nearestObj = Math.min(nearestObj, Math.min(...alive(hypo).map((m) => dist(m.pos, o.pos))))
  }
  // secondary missions: places worth standing on (centre, enemy zone, a chosen objective)
  for (const g of secondaryGoals(s, u.owner)) if (alive(hypo).some((m) => dist(m.pos, g.pos) <= OBJECTIVE_RANGE)) obj += g.weight
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
    w.attackOpportunity * charge +
    w.attackOpportunity * NEXT_TURN_CHARGE * approach -
    w.damageTaken * w.survival * unitValue(u) * taken +
    w.objective * obj -
    w.distance * distTerm +
    w.positioning * cover
  const parts = [
    dealt > 0.3 ? tr('expected shooting damage {fmt}', { fmt: fmt(dealt) }) : '',
    charge > 0.3 ? tr('chance to charge, with {fmt} damage', { fmt: fmt(charge) }) : '',
    charge <= 0.3 && approach > 0.3 ? tr('a charge next turn, with {fmt} damage', { fmt: fmt(approach) }) : '',
    obj ? tr('objective control') : '',
    synapse ? tr('stays in the Synapse zone') : '',
    support ? tr('next to the led unit') : '',
    cover ? tr('cover') : '',
    taken > 0.5 ? tr('risk of taking {fmt} damage', { fmt: fmt(taken) }) : '',
  ].filter(Boolean)
  return { score, why: parts.join(', ') }
}

function candidateGoals(s: GameState, u: UnitState, level: AiLevel): { pos: Vec; label: string }[] {
  const enemies = enemiesOf(s, u)
  const goals: { pos: Vec; label: string }[] = []
  if (hasAbility(u, 'lordOfMachineCult') || hasAbility(u, 'galvanicField')) {
    const mates = unitsOf(s, u.owner).filter((x) => x.id !== u.id && hasAbility(x, 'ledUnit'))
    const near = mates.sort((a, b) => unitDistance(u, a) - unitDistance(u, b))[0]
    if (near) goals.push({ pos: alive(near)[0].pos, label: tr('toward the led unit') })
  }
  const nearestEnemy = enemies.reduce((b, e) => (unitDistance(u, e) < unitDistance(u, b) ? e : b), enemies[0])
  if (nearestEnemy) goals.push({ pos: alive(nearestEnemy)[0].pos, label: tr('toward the enemy') })
  const objs = [...s.objectives].sort((a, b) => dist(alive(u)[0].pos, a.pos) - dist(alive(u)[0].pos, b.pos))
  for (const o of level === 'beginner' ? objs.slice(0, 1) : objs) goals.push({ pos: o.pos, label: tr('toward the target') })
  if (level !== 'beginner') for (const g of secondaryGoals(s, u.owner)) goals.push({ pos: g.pos, label: g.label })
  if (level === 'standard')
    for (const t of s.terrain) {
      const c = t.poly.reduce((a, p) => ({ x: a.x + p.x / t.poly.length, y: a.y + p.y / t.poly.length }), { x: 0, y: 0 })
      goals.push({ pos: c, label: tr('into cover') })
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
    ? [{ pos: { x: ownEdge, y: centroid.y }, label: tr('back') }]
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
    return close ? { imperative: 'conqueror', why: tr('the enemy is close, melee and a push are needed') } : { imperative: 'protector', why: tr('the enemy is far, better to shoot from where you stand') }
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
    ? { imperative: 'conqueror', why: tr('expected result {fmt} vs {fmt2}: pushing in and melee are better', { fmt: fmt(c), fmt2: fmt(p) }) }
    : { imperative: 'protector', why: tr('expected result {fmt} vs {fmt2}: shooting from where you stand and defending are better', { fmt: fmt(p), fmt2: fmt(c) }) }
}

// ------------------------------------------------------------ decisions

/** Hyper-adaptations: Hyper-aggression when monsters and vehicles hold a good share of the enemy's wounds, else Swarming
 * Instincts (most armies are infantry). Hive Predators only pays against an army of characters. */
export function chooseHyper(s: GameState, me: PlayerId): { choice: HyperAdaptation; why: string } {
  const w = (u: UnitState) => alive(u).reduce((a, m) => a + m.wounds, 0)
  const foes = s.units.filter((u) => u.owner !== me && alive(u).length)
  const heavy = foes.filter((u) => hasKeyword(u, 'MONSTER', 'VEHICLE')).reduce((a, u) => a + w(u), 0)
  const all = foes.reduce((a, u) => a + w(u), 0)
  return heavy >= all * 0.35
    ? { choice: 'aggression', why: tr('the enemy has many monsters and vehicles ({percent}% of wounds)', { percent: Math.round((heavy / Math.max(1, all)) * 100) }) }
    : { choice: 'swarming', why: tr('the enemy is mostly infantry') }
}

/** Combat Doctrines: Tactical when a unit is locked in combat, Assault when an assault unit is an advance and a charge
 * away, Devastator early on while the guns walk forward; nothing when none of them helps (each one is once per battle). */
function chooseDoctrine(s: GameState, me: PlayerId): { doctrine: CombatDoctrine; why: string } | null {
  const mine = unitsOf(s, me).filter((u) => alive(u).length)
  const options: { doctrine: CombatDoctrine; why: string }[] = []
  if (mine.some((u) => isEngaged(s, u))) options.push({ doctrine: 'tactical', why: tr('the unit is locked in combat: it will fall back and still shoot') })
  const far = mine.some((u) => unitProfile(u).role === 'assault' && enemiesOf(s, u).some((e) => alive(e).length && unitDistance(u, e) > 8 && unitDistance(u, e) <= 14))
  if (far) options.push({ doctrine: 'assault', why: tr('the assault unit will reach with an advance and a charge') })
  if (s.round <= 2) options.push({ doctrine: 'devastator', why: tr('the army advances and shoots on the move') })
  return options.find((o) => validate(s, { type: 'doctrine', doctrine: o.doctrine }).ok) ?? null
}

export function decide(s: GameState, level: AiLevel = 'standard'): AiDecision | null {
  if (s.winner) return null
  const me = actor(s)
  const fac = FACTION_NAME[me]
  const mine = unitsOf(s, me)
  const end = (why: string): AiDecision => ({ cmd: { type: 'endPhase' }, explanation: why })

  if (hyperPending(s)) {
    const h = chooseHyper(s, me)
    return { cmd: { type: 'hyperAdaptation', choice: h.choice }, explanation: tr('{fac}: hyper-adaptation “{name}” — {why}.', { fac, name: HYPER_NAME[h.choice], why: h.why }) }
  }

  if (s.pendingCharge) {
    const u = s.units.find((x) => x.id === s.pendingCharge!.unitId)!
    for (const t of s.pendingCharge.targets) {
      const cmd: Command = { type: 'chargeMove', unitId: u.id, targetIds: [t] }
      if (validate(s, cmd).ok) return { cmd, explanation: tr('{fac}: unit “{name}” charges into melee!', { fac, name: u.name }) }
    }
    return { cmd: { type: 'skipCharge', unitId: u.id }, explanation: tr('{fac}: the charge move is impossible — the unit stays in place.', { fac }) }
  }

  if (s.pendingReroll) {
    // the game stops only for a re-roll worth it; the beginner keeps its dice
    const pr = s.pendingReroll
    const reroll = level !== 'beginner'
    return { cmd: { type: 'rerollChoice', reroll }, explanation: reroll ? tr('{fac}: “Command Re-roll” — on average +{fmt} damage ({weapon}).', { fac, fmt: fmt(pr.gain), weapon: pr.weapon }) : tr('{fac}: the die is kept.', { fac }) }
  }

  if (s.reaction) {
    // a reaction in the opponent's turn: only when it is worth the CP (the beginner never reacts)
    const best = level === 'beginner' ? undefined : reactionAdvice(s).find((o) => o.worth)
    if (best) return { cmd: best.cmd, explanation: tr('{fac}: Stratagem “{title}” — {why}', { fac, title: best.title, why: best.why }) }
    return { cmd: { type: 'passReaction' }, explanation: tr('{fac}: no reactions.', { fac }) }
  }

  switch (s.phase) {
    case 'command': {
      // Extinction Order (Tech-Priest): an objective with enemy units on it
      if (level !== 'beginner' && s.players[me].cp >= 2)
        for (const u of mine)
          for (const o of s.objectives) {
            const cmd: Command = { type: 'stratagem', id: 'extinctionOrder', unitId: u.id, targetId: o.id }
            if (validate(s, cmd).ok && enemiesOf(s, u).some((e) => alive(e).length && unitNearObjective(e, o)))
              return { cmd, explanation: tr('{fac}: Stratagem “Order of Eradication” — “{name}” strikes the enemies on the objective.', { fac, name: u.name }) }
          }
      // Engrammatic Logic (Royal Warden): free a battle-shocked unit, the one that matters most for objectives
      for (const u of mine) {
        if (!hasAbility(u, 'engrammaticLogic') || u.engrammaticUsed) continue
        const freed = mine
          .filter((f) => validate(s, { type: 'engrammatic', unitId: u.id, targetId: f.id }).ok)
          .sort((a, b) => Number(s.objectives.some((o) => unitNearObjective(b, o))) - Number(s.objectives.some((o) => unitNearObjective(a, o))) || alive(b).length - alive(a).length)[0]
        if (freed) return { cmd: { type: 'engrammatic', unitId: u.id, targetId: freed.id }, explanation: tr('{fac}: “{name}” removes Battle-shock from “{name2}” (Engrammatic Logic).', { fac, name: u.name, name2: freed.name }) }
      }
      if (me === 'marines' && level !== 'beginner') {
        const d = chooseDoctrine(s, me)
        if (d) return { cmd: { type: 'doctrine', doctrine: d.doctrine }, explanation: tr('{fac}: Combat Doctrine “{name}” — {why}.', { fac, name: DOCTRINE_NAME[d.doctrine], why: d.why }) }
      }
      if (validate(s, { type: 'imperative', imperative: 'protector' }).ok) {
        const imp = chooseImperative(s, me, level)
        return { cmd: { type: 'imperative', imperative: imp.imperative }, explanation: tr('{fac}: Imperative “{value}” — {why}.', { fac, value: imp.imperative === 'protector' ? tr('Protector') : tr('Conqueror'), why: imp.why }) }
      }
      if (me === 'orks' && validate(s, { type: 'callWaaagh' }).ok) {
        // Riled up lets Orks charge after advancing: worth it once M + D6 + 2D6 can plausibly reach.
        const reach = level === 'beginner' ? 9 : 6 + 3.5 + 7
        const close = mine.some((u) => enemiesOf(s, u).some((e) => unitDistance(u, e) <= reach))
        if (close || s.round >= 4) return { cmd: { type: 'callWaaagh' }, explanation: tr('Orks: the enemy is within dash and charge range — time for WAAAGH!') }
      }
      if (me === 'tyranids' && validate(s, { type: 'callShadow' }).ok) {
        // Shadow in the Warp: worth it once there are enough healthy enemy units to threaten with battle-shock
        const healthy = unitsOf(s, other(s, me)).filter((e) => !e.battleShocked).length
        if (s.round >= 2 && healthy >= 2) return { cmd: { type: 'callShadow' }, explanation: tr('Tyranids: Shadow in the Warp — the enemy takes a Battle-shock test.') }
      }
      return end(tr('{fac}: Command phase finished.', { fac }))
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
            return { cmd: { type: 'move', unitId: u.id, mode: 'fallBack', positions: fb.pos, ...(fb.fly ? { fly: true } : {}) }, explanation: tr('{fac}: unit “{name}” falls back — the enemy is stronger in melee (expected damage to us {fmt} vs {fmt2}).', { fac, name: u.name, fmt: fmt(mTaken), fmt2: fmt(mDealt) }) }
          continue
        }
        const stay = scorePosition(s, u, level, 'stay')
        const swiftBonus = swiftAvailable(s, u) ? swiftBonusOf(s, u.owner) : 0
        if (u.advanceRoll !== null) {
          const adv = bestMove(s, u, level, 'advance', maxMove(u) + swiftBonus)
          if (adv && adv.score > stay.score) {
            const swift = swiftBonus > 0 && longestStep(u, adv.pos) > maxMove(u) - (adv.fly ? FLY_PENALTY : 0) + 0.01
            return { cmd: { type: 'move', unitId: u.id, mode: 'advance', positions: adv.pos, ...(adv.fly ? { fly: true } : {}), ...(swift ? { swift: true } : {}) }, explanation: tr('{fac}: unit “{name}” advances {label}{value}{value2}.', { fac, name: u.name, label: adv.label, value: adv.why ? ` (${adv.why})` : '', value2: swift ? ' — Swift as the Wind' : '' }) }
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
          return { cmd: { type: 'declareAdvance', unitId: u.id }, explanation: tr('{fac}: unit “{name}” advances {label}{value}.', { fac, name: u.name, label: adv!.label, value: adv!.why ? ` — ${adv!.why}` : '' }) }
        if (pick.kind === 'normal' && nm && nm.score > stay.score + 0.05) {
          const swift = swiftBonus > 0 && longestStep(u, nm.pos) > maxMove(u) - (nm.fly ? FLY_PENALTY : 0) + 0.01
          return { cmd: { type: 'move', unitId: u.id, mode: 'normal', positions: nm.pos, ...(nm.fly ? { fly: true } : {}), ...(swift ? { swift: true } : {}) }, explanation: tr('{fac}: unit “{name}” moves {label}{value}{value2}{value3}.', { fac, name: u.name, label: nm.label, value: nm.why ? ` — ${nm.why}` : '', value2: nm.fly ? tr(' (flying)') : '', value3: swift ? ' — Swift as the Wind' : '' }) }
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
          return { cmd, explanation: tr('{fac}: “{name}” uses Divine Work Protection — the unit is threatened by ≈ {fmt} damage, 4+ invulnerable save.', { fac, name: u.name, fmt: fmt(risk) }) }
      }
      // Guide (Farseer) at the end of the Movement phase: mark the enemy unit our army can hurt most
      for (const u of mine) {
        if (!hasAbility(u, 'guide') || u.guided) continue
        const marks = enemiesOf(s, u)
          .map((e) => ({ e, cmd: { type: 'guide', unitId: u.id, targetId: e.id } as Command }))
          .filter((x) => validate(s, x.cmd).ok)
          .sort((a, b) => unitDistance(u, a.e) - unitDistance(u, b.e))
        if (marks[0]) return { cmd: marks[0].cmd, explanation: tr('{fac}: “{name}” directs allies at “{name2}” (Guide: +1 to hit).', { fac, name: u.name, name2: marks[0].e.name }) }
      }
      // Grenade Pack Flyover (Swooping Hawks): once per turn after moving, at the enemy unit it hurts most
      for (const u of mine) {
        if (!hasAbility(u, 'grenadePack') || u.grenadePackUsed || u.move === 'none') continue
        const best = enemiesOf(s, u)
          .filter((e) => validate(s, { type: 'grenadePack', unitId: u.id, targetId: e.id }).ok)
          .sort((a, b) => squigValue(b) - squigValue(a))[0]
        if (best) return { cmd: { type: 'grenadePack', unitId: u.id, targetId: best.id }, explanation: tr('{fac}: “{name}” bombards “{name2}” with grenades (Grenade Pack Flyover: 4+ — a mortal wound per model).', { fac, name: u.name, name2: best.name }) }
      }
      // Wraith Form (Canoptek Wraiths): after a normal move over enemy units, hurt the one where the wounds kill most
      for (const u of mine) {
        if (!u.wraithTargets?.length) continue
        const best = u.wraithTargets
          .map((id) => s.units.find((x) => x.id === id)!)
          .filter((e) => e && validate(s, { type: 'wraithForm', unitId: u.id, targetId: e.id }).ok)
          .sort((a, b) => squigValue(b) - squigValue(a))[0]
        if (best) return { cmd: { type: 'wraithForm', unitId: u.id, targetId: best.id }, explanation: tr('{fac}: “{name}” passes through “{name2}” (Wraith Form: 4+ — a mortal wound per model).', { fac, name: u.name, name2: best.name }) }
      }
      // Bomb Squig (Kommandos): once per battle after a normal move, at the enemy unit it hurts most
      for (const u of mine) {
        if (!hasAbility(u, 'bombSquig') || u.bombSquigUsed || u.move !== 'normal') continue
        const best = enemiesOf(s, u)
          .map((e) => ({ e, cmd: { type: 'bombSquig', unitId: u.id, targetId: e.id } as Command, v: squigValue(e) }))
          .filter((x) => validate(s, x.cmd).ok)
          .sort((a, b) => b.v - a.v)[0]
        if (best) return { cmd: best.cmd, explanation: tr('{fac}: “{name}” launches a bomb squig at “{name2}” (3+: D3 mortal wounds).', { fac, name: u.name, name2: best.e.name }) }
      }
      // reinforcements: units in Strategic Reserves arrive towards the objective nearest the enemy
      for (const u of reservesOf(s, me)) {
        const pos = arrivalSpot(s, u, aiArrivalTarget(s, me))
        if (pos) return { cmd: { type: 'arrive', unitId: u.id, positions: pos }, explanation: canDeepStrike(u) ? tr('{fac}: {name} arrives from Reserves with a Deep Strike.', { fac, name: quote(u.name) }) : tr('{fac}: {name} arrives from Reserves.', { fac, name: quote(u.name) }) }
      }
      return end(tr('{fac}: movement finished.', { fac }))
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
            return { cmd: boom.cmd, explanation: tr('{fac}: Stratagem “Explosives” — “{name}” throws them at “{name2}” (≈ {fmt} mortal wounds vs ≈ {fmt2} from shooting).', { fac, name: u.name, name2: boom.e.name, fmt: fmt(boom.dmg), fmt2: fmt(own) }) }
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
        // a mission action (Sabotage, Extract Intelligence) instead of a volley, when its VP are worth more
        const action = missionActionFor(s, u)
        if (action && (!best || action.vp >= best.dmg * 0.8))
          return { cmd: action.cmd, explanation: best
            ? tr('{fac}: “{name}” starts the mission action “{action}” at objective {obj} (≈ {vp} VP at the end of the turn, shooting would have dealt ≈ {dmg} damage).', { fac, name: u.name, action: action.name, obj: tr('O{value}', { value: action.n }), vp: action.vp, dmg: fmt(best.dmg) })
            : tr('{fac}: “{name}” starts the mission action “{action}” at objective {obj} (≈ {vp} VP at the end of the turn).', { fac, name: u.name, action: action.name, obj: tr('O{value}', { value: action.n }), vp: action.vp }) }
        // an army's shooting Stratagem on a volley worth it, keeping 1 CP in reserve
        if (best && level !== 'beginner' && best.dmg >= 2.5 && s.players[me].cp >= 2) {
          for (const id of SHOOTING_BUFFS) {
            const buff: Command = { type: 'stratagem', id, unitId: u.id }
            if (validate(s, buff).ok) return { cmd: buff, explanation: tr('{fac}: Stratagem “{name}” for “{name2}” before the volley at “{target}”.', { fac, name: STRATAGEMS[id].name, name2: u.name, target: best.target }) }
          }
        }
        if (best && best.dmg > 0.05)
          return { cmd: best.cmd, explanation: tr('{fac}: unit “{name}” shoots at “{target}” (expected damage ≈ {fmt}).', { fac, name: u.name, target: best.target, fmt: fmt(best.dmg) }) }
      }
      return end(tr('{fac}: no more suitable shooting targets.', { fac }))
    }
    case 'charge': {
      for (const u of mine) {
        for (const e of engagedUnits(s, u)) {
          const cmd: Command = { type: 'stratagem', id: 'crushingImpact', unitId: u.id, targetId: e.id }
          if (validate(s, cmd).ok) return { cmd, explanation: tr('{fac}: Stratagem “Crushing Blow” — “{name}” slams into “{name2}”.', { fac, name: u.name, name2: e.name }) }
        }
        const reroll: Command = { type: 'stratagem', id: 'commandReroll', unitId: u.id }
        if (level !== 'beginner' && validate(s, reroll).ok) {
          const d = Math.min(...enemiesOf(s, u).map((e) => unitDistance(u, e)).filter((x) => withinRange(x, CHARGE_RANGE)))
          if (Number.isFinite(d) && p2d6AtLeast(Math.ceil(d)) >= 0.3)
            return { cmd: reroll, explanation: tr('{fac}: Stratagem “Command Re-roll” — the charge of “{name}” failed, re-rolling (needs {ceil}", chance ≈ {round}%).', { fac, name: u.name, ceil: Math.ceil(d), round: Math.round(p2d6AtLeast(Math.ceil(d)) * 100) }) }
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
          return { cmd, explanation: tr('{fac}: unit “{name}” declares a charge against “{name2}” (needs {ceil}" on 2D6, chance ≈ {round}%).', { fac, name: u.name, name2: best.e.name, ceil: Math.ceil(best.d), round: Math.round(best.p * 100) }) }
      }
      return end(tr('{fac}: no charges declared.', { fac }))
    }
    case 'fight': {
      // stale Tactical secondaries go at the end of the turn, for 1 CP each
      const stale = !s.fight && me === s.activePlayer ? aiDiscards(s, me)[0] : undefined
      if (stale) return { cmd: { type: 'secondary', op: 'discard', card: stale }, explanation: tr('{fac}: the secondary {name} is not coming — discard it at the end of the turn for 1 CP.', { fac, name: quote(SECONDARY[stale].name) }) }
      if (!s.fight) return end(tr('{fac}: fights finished.', { fac }))
      for (const u of mine) {
        for (const e of engagedUnits(s, u).sort((a, b) => expectedMelee(s, u, b) - expectedMelee(s, u, a))) {
          const cmd: Command = { type: 'fight', unitId: u.id, targetId: e.id }
          if (!validate(s, cmd).ok) continue
          // Finest Hour (once per battle): spend it on a target worth it (a character, a vehicle or monster, or a tough unit)
          const finest: Command = { ...cmd, finestHour: true }
          const worthy = isMV(e) || alive(e).some((m) => profileOf(m).character) || alive(e).reduce((n, m) => n + m.wounds, 0) >= 8
          if (worthy && validate(s, finest).ok)
            return { cmd: finest, explanation: tr('{fac}: “{name}” fights “{name2}” — “Finest Hour” (+3 attacks, Devastating Wounds).', { fac, name: u.name, name2: e.name }) }
          // an army's melee Stratagem before a fight worth it, keeping 1 CP in reserve
          if (level !== 'beginner' && expectedMelee(s, u, e) >= 2)
            for (const id of FIGHT_BUFFS) {
              const buff: Command = { type: 'stratagem', id, unitId: u.id }
              if (s.players[me].cp >= STRATAGEMS[id].cost + 1 && validate(s, buff).ok)
                return { cmd: buff, explanation: tr('{fac}: Stratagem “{name}” — “{name2}” strikes “{name3}”.', { fac, name: STRATAGEMS[id].name, name2: u.name, name3: e.name }) }
            }
          return { cmd, explanation: tr('{fac}: unit “{name}” fights “{name2}”.', { fac, name: u.name, name2: e.name }) }
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


/** The best mission action this unit can start now, at an objective its side controls (the action completes only then). */
function missionActionFor(s: GameState, u: UnitState): { cmd: Command; vp: number; name: string; n: number } | null {
  const id = s.mission && PRIMARY[s.mission.primary].action
  if (!id) return null
  let best: { cmd: Command; vp: number; name: string; n: number } | null = null
  s.objectives.forEach((o, i) => {
    const cmd: Command = { type: 'startAction', unitId: u.id, objectiveId: o.id }
    if (!validate(s, cmd).ok) return
    const lv = objectiveLevels(s, o)
    if (!(lv[u.owner] > lv[other(s, u.owner)])) return
    const vp = MISSION_ACTION[id].vp + (id === 'sabotage' && inTerritory(s, other(s, u.owner), o) ? SABOTAGE_TERRITORY_BONUS : 0)
    if (!best || vp > best.vp) best = { cmd, vp, name: MISSION_ACTION[id].name, n: i + 1 }
  })
  return best
}
