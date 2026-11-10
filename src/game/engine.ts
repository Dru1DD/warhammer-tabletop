// Rules engine: the single source of truth for legality and outcomes.
// validate(state, cmd) never mutates; apply(state, cmd, roller) returns a new state.

import { FACTION_NAME } from './data/datasheets'
import { rollDie, rollMany, type Roller } from './dice/dice'
import { dist, withinRange, EPS, add, sub, scale, len } from './geometry/geometry'
import {
  battlelineSupport, feelNoPainOf, hasWargear, holdScoutedObjectives, imperativeOf, invulnOverrideOf, ledUnitOf, leadersOf, neurostaticMod,
  addLog, alive, atHalfStrength, CHARGE_RANGE, checkCoherency, CONSOLIDATE, datasheetOf, engagedUnits, ENGAGEMENT_RANGE,
  enemiesOf, findUnit, fmt, hasAbility, hasKeyword, inSynapseRange, isDestroyed, isEngaged, isFlyer, isMV, modelDistance, modelEngagedWith,
  other, PILE_IN, profileOf, radiusOf, sidesOf, SYNAPSE_RANGE, unitDistance, unitNearObjective, unitsOf,
  updateObjectiveControl, weaponsOf, OBJECTIVE_MARKER_MM,
} from './gameState'
import { healUnit } from './rules/heal'
import { applyMortalWounds, resolveGroup, type AttackContext, type AttackGroup } from './combat/attack'
import { moveProblem, planMove } from './rules/movement'
import { hasCover, nearestVisibleDistance, seesAny } from './rules/visibility'
import { baseRadius } from './geometry/geometry'
import type { Command, DiceEntry, GameState, ModelState, Phase, PlayerId, UnitState, Validation, Vec, Weapon, WeaponProfile } from './types'
import { PHASES } from './types'

export const PHASE_NAME: Record<Phase, string> = {
  command: 'Фаза командования (Command)',
  movement: 'Фаза движения (Movement)',
  shooting: 'Фаза стрельбы (Shooting)',
  charge: 'Фаза атаки (Charge)',
  fight: 'Фаза боя (Fight)',
}

export const VP_PER_OBJECTIVE = 5
export const SWIFT_BONUS = 2
export const FLY_PENALTY = 2
export const GUIDE_RANGE = 18
/** Battle Focus tokens per battle round (Incursion). */
export const BATTLE_FOCUS_TOKENS = 2

const fail = (reason: string): Validation => ({ ok: false, reason })
const OK: Validation = { ok: true }

/** Player who must make the next decision. */
export function actor(s: GameState): PlayerId {
  if (s.phase === 'fight' && s.fight) return s.fight.selecting
  return s.activePlayer
}

const riled = (s: GameState, u: UnitState) => hasAbility(u, 'waaagh') && s.players[u.owner].riledTurns > 0

/** Onslaught (Hive Tyrant aura, Psychic): a friendly TYRANIDS unit within 6″ of the source has Assault + Lethal Hits on ranged weapons. */
export const inOnslaught = (s: GameState, u: UnitState) =>
  datasheetOf(u).faction === 'tyranids' &&
  s.units.some((x) => x.owner === u.owner && !isDestroyed(x) && hasAbility(x, 'onslaught') && (x.id === u.id || unitDistance(u, x) <= SYNAPSE_RANGE))

/** Guide (Farseer): friendly AELDARI models get +1 to hit against the unit marked by Guide. */
const guided = (s: GameState, attacker: UnitState, target: UnitState) =>
  hasKeyword(attacker, 'AELDARI') && s.players[attacker.owner].guide === target.id

/** One Shot weapons already used by this model. */
const spentKey = (m: ModelState, w: Weapon) => `${m.id}:${w.id}`
const isSpent = (u: UnitState, m: ModelState, w: Weapon) => !!u.spent?.includes(spentKey(m, w))

/** Melee weapons a model swings: its first non-Extra-Attacks weapon plus every Extra Attacks weapon. */
export function meleeWeaponsOf(m: ModelState): Weapon[] {
  const melee = weaponsOf(m).filter((w) => w.profiles[0].range === 'melee')
  const primary = melee.find((w) => !w.profiles[0].keywords.extraAttacks)
  return [...(primary ? [primary] : []), ...melee.filter((w) => w.profiles[0].keywords.extraAttacks)]
}

/** The unit's army can still "charge/shoot" in the situation (Bounding Leap, Adaptable Predators, Waaagh!). */
const canChargeAfterAdvance = (s: GameState, u: UnitState) => riled(s, u) || hasAbility(u, 'boundingLeap')
const canActAfterFallBack = (u: UnitState) => hasAbility(u, 'adaptablePredators')

/** Lethal Hits marked "non-MONSTER/VEHICLE" (and Tactical Precision) don't work against M/V targets. */
const lethalVs = (p: WeaponProfile, attacker: UnitState, target: UnitState) => {
  const k = p.keywords.lethalHits
  const kw = k === true || (k === 'nonMV' && !isMV(target))
  return kw || (hasAbility(attacker, 'tacticalPrecision') && !isMV(target))
}

/** Defensive abilities of the target that modify the wound roll / damage. */
function defenceMods(s: GameState, p: WeaponProfile, target: UnitState) {
  const t = Math.max(...alive(target).map((m) => profileOf(m).t))
  const duty = hasAbility(target, 'dutyEternal') && p.s > t
  const fnp = feelNoPainOf(s, target)
  return {
    woundMod: duty ? -1 : 0,
    woundModNote: duty ? 'Duty Eternal: сила больше стойкости' : undefined,
    damageMod: hasAbility(target, 'dreadArd') || hasAbility(target, 'implacableResilience') ? -1 : 0,
    ...(fnp ? { fnp } : {}),
  }
}

/** Doctrina Imperatives / Breaching Command / Galvanic Field: attacker-side modifiers shared by shooting and melee. */
function attackerBonuses(s: GameState, unit: UnitState) {
  const imp = imperativeOf(s, unit)
  const support = imp === 'conqueror' || hasAbility(unit, 'breachingCommand') ? battlelineSupport(s, unit) : false
  return {
    imp,
    /** Conqueror: AP of every attack improved by 1 while BATTLELINE or near friendly BATTLELINE */
    betterAp: imp === 'conqueror' && support,
    /** Breaching Command: re-roll hit rolls of 1, or any failed hit near friendly BATTLELINE */
    rerollHits: hasAbility(unit, 'breachingCommand') ? (battlelineSupport(s, unit) ? 'all' as const : 'ones' as const) : undefined,
    /** Galvanic Field: a Manipulus leading the unit gives its weapons Lethal Hits */
    galvanic: leadersOf(s, unit, 'galvanicField').length > 0,
  }
}

// ---------------------------------------------------------------- shooting

export interface ShootPlan {
  groups: (AttackGroup & { ctx: AttackContext })[]
  firingModels: ModelState[]
  /** One Shot weapons that fire in this plan (`modelId:weaponId`) */
  oneShots: string[]
  hazardousModels: number
  skipped: string[]
  cover: boolean
  problem: string | null
}

/** `target` is the closest enemy unit that `unit` could target (visible enemy units, nearest by distance). */
function isClosestTarget(s: GameState, unit: UnitState, target: UnitState): boolean {
  const d = unitDistance(unit, target)
  return !enemiesOf(s, unit).some((e) => e.id !== target.id && unitDistance(unit, e) < d - 1e-9 && alive(unit).some((m) => seesAny(s, m, e)))
}

export function shootPlan(
  s: GameState,
  unit: UnitState,
  target: UnitState,
  opts: {
    profiles?: Record<string, number>
    usePistols?: boolean
    useAmmoRunts?: boolean
    /** AI scoring: skip the line of sight check for a model none of whose weapons reaches any target model. The
     * groups (and so the damage and Hazardous count) are unchanged; only `skipped` and the `problem` text may differ. */
    rangeFirst?: boolean
  } = {},
): ShootPlan {
  const plan: ShootPlan = { groups: [], firingModels: [], oneShots: [], hazardousModels: 0, skipped: [], cover: false, problem: null }
  const engaged = isEngaged(s, unit)
  const advanced = unit.move === 'advance'
  const onslaught = inOnslaught(s, unit)
  const bonus = attackerBonuses(s, unit)
  const assaultAll = riled(s, unit) || onslaught || bonus.imp === 'conqueror'
  const mv = isMV(unit)
  if (engaged && advanced) return { ...plan, problem: 'Отряд продвинулся (Advance) и находится в контакте — стрелять нельзя.' }
  if (engaged && !engagedUnits(s, unit).some((e) => e.id === target.id))
    return { ...plan, problem: mv
      ? 'Техника в контакте с врагом стреляет только по отряду, с которым она в контакте.'
      : 'Отряд в контакте с врагом: стрелять можно только из оружия ближнего боя (Close-quarters) и только по отряду, с которым он в контакте.' }

  const byKey = new Map<string, AttackGroup & { ctx: AttackContext }>()
  let anyVisible = false
  let closest = Infinity
  for (const m of alive(unit)) {
    const ranged = weaponsOf(m).filter((w) => w.profiles[0].range !== 'melee')
    const cq = ranged.filter((w) => w.profiles[0].keywords.closeQuarters)
    const main = ranged.filter((w) => !w.profiles[0].keywords.closeQuarters)
    // close-quarters shooting (10.06): MONSTER/VEHICLE may use any non-Blast ranged weapon
    let chosen = engaged && mv
      ? ranged.filter((w) => !w.profiles[Math.min(opts.profiles?.[w.id] ?? 0, w.profiles.length - 1)].keywords.blast)
      : engaged || opts.usePistols || main.length === 0 ? cq : main
    if (advanced && !engaged) {
      const before = chosen.length
      chosen = chosen.filter((w) => assaultAll || w.profiles[opts.profiles?.[w.id] ?? 0].keywords.assault)
      if (before > chosen.length) plan.skipped.push(`${profileOf(m).name}: после продвижения (Advance) стреляет только оружие Assault.`)
    }
    chosen = chosen.filter((w) => !(w.profiles[0].keywords.oneShot && isSpent(unit, m, w)))
    if (opts.rangeFirst) {
      // a weapon fires only at a visible target model within its range, so no model in reach means nothing fires
      let reach = -Infinity
      for (const w of chosen) reach = Math.max(reach, w.profiles[Math.min(opts.profiles?.[w.id] ?? 0, w.profiles.length - 1)].range as number)
      if (!alive(target).some((t) => withinRange(modelDistance(m, t), reach))) continue
    }
    const d = nearestVisibleDistance(s, m, target)
    if (d === Infinity) {
      if (chosen.length) plan.skipped.push(`${profileOf(m).name}: нет линии видимости до цели.`)
      continue
    }
    anyVisible = true
    closest = Math.min(closest, d)
    let fired = false
    for (const w of chosen) {
      const idx = Math.min(opts.profiles?.[w.id] ?? 0, w.profiles.length - 1)
      const p = w.profiles[idx]
      const range = p.range as number
      if (!withinRange(d, range)) {
        plan.skipped.push(`${profileOf(m).name}: ${w.name} — цель на ${fmt(d)}", дальность ${range}".`)
        continue
      }
      fired = true
      if (p.keywords.hazardous) plan.hazardousModels++
      if (p.keywords.oneShot) plan.oneShots.push(spentKey(m, w))
      // Bladestorm (Dire Avengers): Sustained Hits 1 against a target within half range; such models form their own group
      const bladestorm = hasAbility(unit, 'bladestorm') && withinRange(d, range / 2)
      const key = `${w.id}:${idx}${bladestorm ? ':bs' : ''}`
      let g = byKey.get(key)
      if (!g) {
        g = { weaponName: w.name, profile: p, models: 0, attacks: 0, randomAttacks: 0, notes: bladestorm ? ['Bladestorm: Sustained Hits 1'] : [], sustainedHits: bladestorm ? Math.max(1, p.keywords.sustainedHits ?? 0) : undefined, ctx: { hitMod: 0, hitModNotes: [], skillWorsen: 0, lethalHits: false } }
        byKey.set(key, g)
      }
      g.models++
      if (p.randomA) g.randomAttacks = (g.randomAttacks ?? 0) + 1
      let a = p.attacks
      if (p.keywords.rapidFire && withinRange(d, range / 2)) {
        a += p.keywords.rapidFire
        if (!g.notes.includes('Rapid Fire')) g.notes.push('Rapid Fire')
      }
      if (p.keywords.blast) {
        const extra = p.keywords.blast * Math.floor(alive(target).length / 5)
        a += extra
        if (extra && !g.notes.includes('Blast')) g.notes.push('Blast')
      }
      g.attacks += a
    }
    if (fired) plan.firingModels.push(m)
  }

  if (!anyVisible) return { ...plan, problem: 'Цель не видна: линию видимости (line of sight) перекрывает укрытие.' }
  if (byKey.size === 0)
    return { ...plan, problem: plan.skipped.length && closest < Infinity ? `Нет оружия, способного стрелять: ближайшая видимая модель цели на ${fmt(closest)}". ${plan.skipped[0]}` : 'Нет подходящего оружия.' }

  // Stealth: the target always has the benefit of cover against ranged attacks
  plan.cover = hasCover(s, plan.firingModels, target) || hasAbility(target, 'stealth')
  const omnispex = hasWargear(unit, 'omnispex')
  const bolter = hasAbility(unit, 'boltDiscipline') && s.objectives.some((o) => unitNearObjective(unit, o) || unitNearObjective(target, o))
  const runts = !!opts.useAmmoRunts && hasAbility(unit, 'ammoRunts') && !unit.ammoRuntsUsed
  for (const g of byKey.values()) {
    const notes: string[] = []
    let hitMod = 0
    if ((g.profile.keywords.heavy || bonus.imp === 'protector') && !engaged && unit.movedDistance <= 3 + EPS) { notes.push(g.profile.keywords.heavy ? 'Heavy +1' : 'Protector: Heavy +1'); hitMod++ }
    if (bolter) { notes.push('Болтерная дисциплина +1'); hitMod++ }
    if (runts) { notes.push('Гроты-подносчики +1'); hitMod++ }
    if (engaged && mv && !g.profile.keywords.closeQuarters) { notes.push('техника в контакте −1'); hitMod-- }
    if (guided(s, unit, target)) { notes.push('Guide +1'); hitMod++ }
    // Swift Demise (Windriders): re-roll hit rolls of 1; any failed hit if the target is the closest eligible one
    let rerollHits: AttackContext['rerollHits'] = bonus.rerollHits
    if (hasAbility(unit, 'swiftDemise')) rerollHits = isClosestTarget(s, unit, target) ? 'all' : 'ones'
    if (bonus.rerollHits) g.notes.push(bonus.rerollHits === 'all' ? 'Breaching Command: переброс попаданий' : 'Breaching Command: переброс 1')
    // Ignores Cover (weapon keyword or Omnispex) cancels the cover bonus; Protector improves BS by 1
    const ignores = g.profile.keywords.ignoresCover || omnispex
    if (plan.cover && ignores) g.notes.push('игнорирует укрытие')
    if (bonus.betterAp) { g.profile = { ...g.profile, ap: g.profile.ap - 1 }; g.notes.push('Conqueror: AP +1') }
    if (bonus.galvanic) g.notes.push('Galvanic Field: Lethal Hits')
    const protector = bonus.imp === 'protector'
    g.ctx = {
      hitMod,
      hitModNotes: notes,
      skillWorsen: (plan.cover && !ignores ? 1 : 0) - (protector ? 1 : 0),
      ...(protector ? { skillNote: 'Protector: BS на 1 лучше' } : {}),
      lethalHits: lethalVs(g.profile, unit, target) || onslaught || bonus.galvanic,
      invulnOverride: invulnOverrideOf(s, target),
      ...(g.profile.keywords.precision ? { precision: true } : {}),
      ...(rerollHits ? { rerollHits } : {}),
      ...defenceMods(s, g.profile, target),
    }
    if (onslaught && !g.notes.includes('Onslaught')) g.notes.push('Onslaught: Assault + Lethal Hits')
    plan.groups.push(g)
  }
  return plan
}

// ---------------------------------------------------------------- melee

/** Profile and context for one melee weapon of `unit` against `target` (shared by the engine and the AI). */
export function meleeSetup(s: GameState, unit: UnitState, target: UnitState, p0: WeaponProfile) {
  const notes: string[] = []
  let p = p0
  // Targeted Intercession: +1 S and +1 AP after charging
  if (hasAbility(unit, 'targetedIntercession') && unit.charged) {
    p = { ...p, s: p.s + 1, ap: p.ap - 1 }
    notes.push('Targeted Intercession +1 S/AP')
  }
  // Synapse: +1 Strength on melee attacks of a TYRANIDS unit in Synapse Range
  if (inSynapseRange(s, unit)) {
    p = { ...p, s: p.s + 1 }
    notes.push('Synapse +1 S')
  }
  const hitModNotes: string[] = []
  let hitMod = 0
  let skillWorsen = 0
  let skillNote: string | undefined
  if (guided(s, unit, target)) { hitMod++; hitModNotes.push('Guide +1') }
  // Doctrina Imperatives: Conqueror improves WS and (near BATTLELINE) AP; Protector of the target subtracts 1 from melee hit rolls
  const bonus = attackerBonuses(s, unit)
  if (bonus.imp === 'conqueror') { skillWorsen--; skillNote = 'Conqueror: WS на 1 лучше'; notes.push('Conqueror: WS +1') }
  if (bonus.betterAp) { p = { ...p, ap: p.ap - 1 }; notes.push('Conqueror: AP +1') }
  if (imperativeOf(s, target) === 'protector' && battlelineSupport(s, target)) { hitMod--; hitModNotes.push('Protector цели −1') }
  // Data-spike: the unit's melee skill is worsened by 1 until the end of the Fight phase
  if (unit.spiked) { skillWorsen++; notes.push('Data-spike: WS на 1 хуже') }
  if (bonus.rerollHits) notes.push(bonus.rerollHits === 'all' ? 'Breaching Command: переброс попаданий' : 'Breaching Command: переброс 1')
  if (bonus.galvanic) notes.push('Galvanic Field: Lethal Hits')
  // Whirling Onslaught (Skorpekh Destroyers): re-roll hit rolls of 1, or any hit roll after a charge
  const rerollHits: AttackContext['rerollHits'] = hasAbility(unit, 'whirlingOnslaught') ? (unit.charged ? 'all' : 'ones') : bonus.rerollHits
  if (rerollHits) notes.push(rerollHits === 'all' ? 'Whirling Onslaught: переброс попаданий' : 'Whirling Onslaught: переброс 1')
  const ctx: AttackContext = {
    hitMod, hitModNotes, skillWorsen,
    ...(skillNote ? { skillNote } : {}),
    lethalHits: lethalVs(p, unit, target) || (hasAbility(unit, 'tideOfMuscle') && unit.charged) || bonus.galvanic,
    invulnOverride: invulnOverrideOf(s, target),
    ...(p.keywords.precision ? { precision: true } : {}),
    ...(rerollHits ? { rerollHits } : {}),
    ...defenceMods(s, p, target),
  }
  return { profile: p, ctx, notes }
}

export function meleePlan(s: GameState, unit: UnitState, target: UnitState) {
  const groups: (AttackGroup & { ctx: AttackContext })[] = []
  const byKey = new Map<string, AttackGroup & { ctx: AttackContext }>()
  for (const m of alive(unit)) {
    if (!modelEngagedWith(m, target)) continue
    for (const w of meleeWeaponsOf(m)) {
      const { profile: p, ctx, notes } = meleeSetup(s, unit, target, w.profiles[0])
      let g = byKey.get(w.id)
      if (!g) {
        g = { weaponName: w.name, profile: p, models: 0, attacks: 0, randomAttacks: 0, notes, ctx }
        byKey.set(w.id, g)
        groups.push(g)
      }
      g.models++
      if (p.randomA) g.randomAttacks = (g.randomAttacks ?? 0) + 1
      g.attacks += p.attacks + (p.keywords.cleave ? p.keywords.cleave * Math.floor(alive(target).length / 5) : 0)
    }
  }
  return groups
}

// ---------------------------------------------------------------- charge

export function chargeTargetsFor(s: GameState, unit: UnitState, roll: number) {
  if (roll <= 2) return []
  return enemiesOf(s, unit).filter((e) => {
    const d = unitDistance(unit, e)
    return withinRange(d, CHARGE_RANGE) && withinRange(d, roll)
  })
}

function planCharge(s: GameState, unit: UnitState, targets: UnitState[], roll: number): Record<string, Vec> | null {
  const tModels = targets.flatMap(alive)
  const ids = targets.map((t) => t.id)
  const closest = (m: ModelState) => tModels.reduce((b, t) => (dist(m.pos, t.pos) < dist(m.pos, b.pos) ? t : b))
  const good = (pos: Record<string, Vec>) =>
    !moveProblem(s, unit, pos, roll, 'charge', ids) &&
    targets.every((t) => alive(unit).some((m) => modelEngagedWith(m, t, pos[m.id] ?? m.pos)))
  const p1 = planMove(s, unit, (m) => ({ pos: closest(m).pos, radius: radiusOf(closest(m)) }), roll, 'charge', ids)
  if (good(p1)) return p1
  // fallback: translate the whole unit toward the nearest target model
  const lead = [...alive(unit)].sort((a, b) => dist(a.pos, closest(a).pos) - dist(b.pos, closest(b).pos))[0]
  const tgt = closest(lead)
  const v = sub(tgt.pos, lead.pos)
  const need = Math.max(0, len(v) - radiusOf(lead) - radiusOf(tgt))
  for (const k of [1, 0.98, 0.95, 0.9, 0.85, 0.8]) {
    const step = Math.min(roll, need) * k
    const delta = scale(v, step / len(v))
    const pos: Record<string, Vec> = {}
    for (const m of alive(unit)) pos[m.id] = add(m.pos, delta)
    if (good(pos)) return pos
  }
  return null
}

// ---------------------------------------------------------------- validation

export function validate(s: GameState, cmd: Command): Validation {
  if (s.winner) return fail('Битва окончена.')
  const who = actor(s)
  if (s.pendingCharge && cmd.type !== 'chargeMove' && cmd.type !== 'skipCharge')
    return fail('Сначала завершите объявленную атаку (charge): выберите цели или откажитесь от перемещения.')

  if (cmd.type === 'endPhase') {
    if (s.phase === 'fight' && s.fight) return fail('В фазе боя ещё есть отряды, которые должны сражаться.')
    return OK
  }
  if (cmd.type === 'callWaaagh') {
    if (s.activePlayer !== 'orks') return fail('Waaagh! может объявить только игрок Орков в свой ход.')
    if (s.phase !== 'command') return fail('«Боевой клич» объявляется в фазе командования.')
    if (s.players.orks.waaaghUsed) return fail('Waaagh! уже был объявлен в этой битве (раз за битву).')
    return OK
  }
  if (cmd.type === 'callShadow') {
    const me = s.activePlayer
    if (s.phase !== 'command') return fail('«Тень в Варпе» (Shadow in the Warp) применяется в фазе командования.')
    if (s.players[me].shadowUsed === undefined) return fail('Тень в Варпе — правило армии Тиранидов.')
    if (s.players[me].shadowUsed) return fail('Тень в Варпе уже применена в этой битве (раз за битву).')
    if (!unitsOf(s, me).some((u) => hasAbility(u, 'shadowInTheWarp'))) return fail('На поле нет отряда с правилом «Тень в Варпе».')
    return OK
  }

  if (cmd.type === 'imperative') {
    if (s.phase !== 'command') return fail('Империатив (Doctrina Imperative) выбирается в фазе командования.')
    if (s.players[who].imperative === undefined) return fail('Доктрины Империатива — правило армии Адептус Механикус.')
    if (s.players[who].imperative !== null) return fail('Империатив уже выбран в этом ходу.')
    if (cmd.imperative !== 'protector' && cmd.imperative !== 'conqueror') return fail('Неизвестный Империатив.')
    return OK
  }

  const unit = findUnit(s, cmd.unitId)
  if (!unit || isDestroyed(unit)) return fail('Отряд не найден или уничтожен.')
  if (unit.owner !== who) return fail(`Сейчас решение принимает ${FACTION_NAME[who]}.`)

  switch (cmd.type) {
    case 'declareAdvance':
    case 'move': {
      if (s.phase !== 'movement') return fail('Двигаться можно только в фазе движения.')
      if (unit.move !== 'none') return fail('Отряд уже двигался в этой фазе.')
      const engaged = isEngaged(s, unit)
      if (cmd.type === 'move' && cmd.fly && !isFlyer(unit)) return fail('«Взлететь» (FLY) могут только модели с ключевым словом FLY.')
      if (cmd.type === 'move' && cmd.swift) {
        if (datasheetOf(unit).faction !== 'aeldari') return fail('Swift as the Wind — манёвр Боевого фокуса (Battle Focus) армии Аэльдари.')
        if ((s.players[unit.owner].focus ?? 0) <= 0) return fail('Нет жетонов Боевого фокуса (Battle Focus) в этом раунде.')
      }
      if (cmd.type === 'declareAdvance') {
        if (engaged) return fail('Отряд в контакте с врагом: можно только отступить (Fall Back) или остаться на месте.')
        if (unit.advanceRoll !== null) return fail('Продвижение уже объявлено.')
        return OK
      }
      if (cmd.mode === 'fallBack' && !engaged) return fail('Отступление (Fall Back) возможно только для отряда в контакте с врагом.')
      if (cmd.mode !== 'fallBack' && engaged) return fail('Отряд в контакте с врагом: обычное движение невозможно, только отступление (Fall Back).')
      if (cmd.mode === 'advance' && unit.advanceRoll === null) return fail('Сначала объявите продвижение и бросьте D6.')
      if (cmd.mode !== 'advance' && unit.advanceRoll !== null) return fail('Продвижение уже объявлено — двигайтесь в режиме продвижения.')
      const m = Math.min(...alive(unit).map((x) => profileOf(x).m))
      const max = (cmd.mode === 'advance' ? m + (unit.advanceRoll ?? 0) : m) + (cmd.swift ? SWIFT_BONUS : 0) - (cmd.fly ? FLY_PENALTY : 0)
      const p = moveProblem(s, unit, cmd.positions, max, cmd.mode, [], !!cmd.fly)
      return p ? fail(p) : OK
    }
    case 'rerollAdvance':
      if (unit.advanceRoll === null || unit.move !== 'none') return fail('Нет броска продвижения для переброса.')
      if (!hasAbility(unit, 'waaagh')) return fail('Переброс продвижения даёт только правило Waaagh!.')
      if (unit.advanceRerolled) return fail('Кубик нельзя перебрасывать больше одного раза.')
      return OK
    case 'shoot': {
      if (s.phase !== 'shooting') return fail('Стрелять можно только в фазе стрельбы.')
      if (unit.shot) return fail('Отряд уже стрелял в этой фазе.')
      if (unit.move === 'fallBack' && !canActAfterFallBack(unit)) return fail('Отряд отступил (Fall Back) в этот ход и не может стрелять.')
      const target = findUnit(s, cmd.targetId)
      if (!target || isDestroyed(target) || target.owner === unit.owner) return fail('Недопустимая цель.')
      const plan = shootPlan(s, unit, target, cmd)
      return plan.problem ? fail(plan.problem) : OK
    }
    case 'declareCharge': {
      if (s.phase !== 'charge') return fail('Атаку (charge) объявляют в фазе атаки.')
      if (unit.chargeDeclared) return fail('Отряд уже объявлял атаку в этой фазе.')
      if (isEngaged(s, unit)) return fail('Отряд уже в контакте с врагом.')
      if (unit.move === 'fallBack' && !canActAfterFallBack(unit)) return fail('Отряд отступил (Fall Back) в этот ход и не может атаковать.')
      if (unit.move === 'advance' && !canChargeAfterAdvance(s, unit)) return fail('Отряд продвинулся (Advance) в этот ход и не может атаковать.')
      const near = enemiesOf(s, unit).filter((e) => withinRange(unitDistance(unit, e), CHARGE_RANGE))
      if (near.length === 0) {
        const d = Math.min(...enemiesOf(s, unit).map((e) => unitDistance(unit, e)))
        return fail(`Нет врагов в пределах ${CHARGE_RANGE}" (ближайший — ${fmt(d)}").`)
      }
      return OK
    }
    case 'chargeMove':
    case 'skipCharge': {
      if (!s.pendingCharge || s.pendingCharge.unitId !== unit.id) return fail('Нет объявленной атаки для этого отряда.')
      if (cmd.type === 'skipCharge') return OK
      if (cmd.targetIds.length === 0) return fail('Выберите хотя бы одну цель атаки.')
      if (!cmd.targetIds.every((t) => s.pendingCharge!.targets.includes(t))) return fail('Цель недоступна при этом броске атаки.')
      const targets = cmd.targetIds.map((t) => findUnit(s, t)!)
      if (!planCharge(s, unit, targets, s.pendingCharge.roll))
        return fail('Не удалось построить допустимое перемещение атаки (подставки мешают или нарушается связность).')
      return OK
    }
    case 'divineWork': {
      if (!hasAbility(unit, 'defendDivineWork')) return fail('У этого отряда нет способности «Защита божественного труда».')
      if (s.players[unit.owner].divineUsed) return fail('Защита божественного труда уже применена в этой битве (раз за битву).')
      return OK
    }
    case 'guide': {
      if (s.phase !== 'movement') return fail('Guide применяется в фазе движения.')
      if (!hasAbility(unit, 'guide')) return fail('У этого отряда нет способности Guide.')
      if (unit.guided) return fail('Guide уже использован в этот ход.')
      const target = findUnit(s, cmd.targetId)
      if (!target || isDestroyed(target) || target.owner === unit.owner) return fail('Недопустимая цель для Guide.')
      if (unitDistance(unit, target) > GUIDE_RANGE + 1e-6) return fail(`Guide: цель дальше ${GUIDE_RANGE}″.`)
      if (!alive(unit).some((m) => seesAny(s, m, target))) return fail('Guide: цель не видна.')
      return OK
    }
    case 'fight': {
      if (s.phase !== 'fight' || !s.fight) return fail('Сейчас не фаза боя.')
      if (!fightCandidates(s, s.fight.selecting, s.fight.step).some((u) => u.id === unit.id))
        return fail(s.fight.step === 'first' ? 'Сначала сражаются отряды с правом «Бьёт первым» (Fights First) — например, совершившие атаку.' : 'Этот отряд не может сражаться (уже сражался или не в контакте).')
      const target = findUnit(s, cmd.targetId)
      if (!target || !engagedUnits(s, unit).some((e) => e.id === target.id)) return fail('Цель должна быть в зоне контакта с отрядом.')
      return OK
    }
  }
}

// ---------------------------------------------------------------- fight helpers

const fightEligible = (s: GameState, u: UnitState) => !isDestroyed(u) && !u.fought && (u.charged || isEngaged(s, u))

function fightCandidates(s: GameState, p: PlayerId, step: 'first' | 'rest') {
  return unitsOf(s, p).filter((u) => fightEligible(s, u) && (step === 'rest' || u.charged) && engagedUnits(s, u).length > 0)
}

function advanceFight(s: GameState) {
  if (!s.fight) return
  for (const u of s.units)
    if (fightEligible(s, u) && engagedUnits(s, u).length === 0) {
      u.fought = true
      addLog(s, `${u.name}: нет врагов в зоне контакта — сражаться не с кем.`, 'standard')
    }
  for (;;) {
    const f = s.fight
    const mine = fightCandidates(s, f.selecting, f.step)
    if (mine.length) return
    const theirs = fightCandidates(s, other(s, f.selecting), f.step)
    if (theirs.length) { f.selecting = other(s, f.selecting); return }
    if (f.step === 'first') { f.step = 'rest'; f.selecting = s.activePlayer; continue }
    s.fight = null
    consolidateAll(s)
    addLog(s, 'Все бои завершены. Можно завершить фазу.', 'beginner')
    return
  }
}

function pileInAll(s: GameState) {
  for (const p of [s.activePlayer, other(s, s.activePlayer)]) {
    for (const u of unitsOf(s, p)) {
      if (!(u.charged || isEngaged(s, u))) continue
      const near = enemiesOf(s, u).filter((e) => withinRange(unitDistance(u, e), 5))
      if (!near.length) continue
      const ids = near.map((e) => e.id)
      const em = near.flatMap(alive)
      const closest = (m: ModelState) => em.reduce((b, t) => (modelDistance(m, t) < modelDistance(m, b) ? t : b))
      const inContact = (m: ModelState) => em.some((e) => modelDistance(m, e) < 0.01)
      const pos = planMove(s, u, (m) => (inContact(m) ? { pos: m.pos, radius: 99 } : { pos: closest(m).pos, radius: radiusOf(closest(m)) }), PILE_IN, 'pileIn', ids)
      if (!moveProblem(s, u, pos, PILE_IN, 'pileIn', ids)) movedTo(u, pos)
      addLog(s, `${u.name}: подход (pile-in) до ${PILE_IN}" к ближайшему врагу.`, 'beginner')
    }
  }
}

function consolidateAll(s: GameState) {
  for (const p of [s.activePlayer, other(s, s.activePlayer)]) {
    for (const u of unitsOf(s, p)) {
      if (!u.fought) continue
      const near = enemiesOf(s, u).filter((e) => withinRange(unitDistance(u, e), CONSOLIDATE))
      let pos: Record<string, Vec> | null = null
      if (near.length) {
        const em = near.flatMap(alive)
        const ids = near.map((e) => e.id)
        const closest = (m: ModelState) => em.reduce((b, t) => (modelDistance(m, t) < modelDistance(m, b) ? t : b))
        pos = planMove(s, u, (m) => ({ pos: closest(m).pos, radius: radiusOf(closest(m)) }), CONSOLIDATE, 'consolidate', ids)
        if (moveProblem(s, u, pos, CONSOLIDATE, 'consolidate', ids)) pos = null
        else addLog(s, `${u.name}: закрепление (consolidate) к врагу.`, 'beginner')
      } else {
        const obj = s.objectives.find((o) => alive(u).some((m) => withinRange(dist(m.pos, o.pos) - radiusOf(m) - baseRadius(OBJECTIVE_MARKER_MM), CONSOLIDATE + 3)))
        if (obj && !unitNearObjective(u, obj)) {
          pos = planMove(s, u, () => ({ pos: obj.pos, radius: baseRadius(OBJECTIVE_MARKER_MM) }), CONSOLIDATE, 'consolidate')
          if (moveProblem(s, u, pos, CONSOLIDATE, 'consolidate')) pos = null
          else addLog(s, `${u.name}: закрепление (consolidate) к цели.`, 'beginner')
        }
      }
      if (pos) movedTo(u, pos)
    }
  }
}

function movedTo(u: UnitState, pos: Record<string, Vec>) {
  for (const m of alive(u)) {
    const p = pos[m.id]
    if (p) {
      u.movedDistance = Math.max(u.movedDistance, dist(m.pos, p))
      m.pos = { ...p }
    }
  }
}

// ---------------------------------------------------------------- turn flow

function resetTurnFlags(s: GameState) {
  for (const u of s.units) {
    u.move = 'none'
    u.movedDistance = 0
    u.advanceRoll = null
    u.advanceRerolled = false
    u.shot = false
    u.chargeDeclared = false
    u.charged = false
    u.fought = false
    delete u.guided
    delete u.spiked
    if (u.owner === s.activePlayer) delete u.warded
  }
}

/** Aeldari Battle Focus: tokens are refreshed at the start of every battle round. */
function refreshFocus(s: GameState) {
  for (const p of sidesOf(s)) if (s.players[p].focus !== undefined) s.players[p].focus = BATTLE_FOCUS_TOKENS
}

function enterPhase(s: GameState, phase: Phase, r: Roller) {
  s.phase = phase
  addLog(s, `— ${PHASE_NAME[phase]}: ${FACTION_NAME[s.activePlayer]} —`, 'minimal')
  if (phase === 'command') commandPhase(s, r)
  if (phase === 'fight') {
    selfDestruction(s, r)
    fightStartMechanicus(s, r)
    pileInAll(s)
    s.fight = { selecting: s.activePlayer, step: 'first' }
    advanceFight(s)
    if (!s.fight) addLog(s, 'Нет отрядов в контакте — фаза боя пропускается (можно завершить фазу).', 'beginner')
  }
  const hints: Partial<Record<Phase, string>> = {
    command: 'Оба игрока получают 1 CP; проверяется боевой шок (Battle-shock); затем подсчитываются очки за цели.',
    movement: 'Выберите отряд и переместите модели на расстояние до M. Нельзя заканчивать ход ближе 2" к врагу.',
    shooting: 'Выберите отряд и цель. Нужна линия видимости и дистанция оружия.',
    charge: `Отряд в пределах ${CHARGE_RANGE}" от врага может объявить атаку: бросок 2D6 определяет максимальную дистанцию.`,
    fight: 'Отряды в контакте сражаются. Сначала — те, кто атаковал (Fights First).',
  }
  if (hints[phase]) addLog(s, hints[phase]!, 'beginner')
}

/** Leadership roll: 2D6, or 3D6 for a TYRANIDS unit in Synapse Range (the total of all three dice, see docs). */
function leadershipRoll(s: GameState, u: UnitState, r: Roller, mod = 0) {
  const synapse = inSynapseRange(s, u)
  const dice = rollMany(r, synapse ? 3 : 2)
  const interference = neurostaticMod(s, u)
  const total = dice.reduce((a, b) => a + b, 0) + mod + interference
  const ld = profileOf(alive(u)[0]).ld
  return { dice, total, ld, pass: total >= ld, label: `${synapse ? '3D6 (Synapse)' : '2D6'}${interference ? ` (помехи ${interference})` : ''}` }
}

function commandPhase(s: GameState, r: Roller) {
  for (const p of sidesOf(s)) s.players[p].cp++
  if (s.players[s.activePlayer].guide !== undefined) s.players[s.activePlayer].guide = null
  if (s.players[s.activePlayer].imperative !== undefined) s.players[s.activePlayer].imperative = null
  addLog(s, 'Оба игрока получают 1 очко командования (CP).', 'beginner')
  for (const u of unitsOf(s, s.activePlayer)) {
    if (!u.battleShocked && !atHalfStrength(u)) continue
    const { dice, total, ld, pass, label } = leadershipRoll(s, u, r)
    const was = u.battleShocked
    u.battleShocked = !pass
    pushDice(s, `Боевой шок: ${u.name}`, [{ label, target: `${ld}+`, dice: dice.map((v) => ({ value: v, success: pass })), note: `Сумма ${total} против Ld ${ld}+` }],
      pass ? `${u.name}: проверка пройдена${was ? ' — боевой шок снят' : ''}.` : `${u.name}: провал — отряд в боевом шоке (OC = 0, отступление опасно).`)
    addLog(s, pass ? `${u.name} проходит проверку боевого шока (${total} ≥ ${ld}).` : `${u.name} проваливает проверку боевого шока (${total} < ${ld}) и получает Battle-shock.`, 'minimal')
  }
  updateObjectiveControl(s)
  if (s.round >= 2) {
    const held = s.objectives.filter((o) => o.controller === s.activePlayer).length
    if (held) {
      s.players[s.activePlayer].vp += held * VP_PER_OBJECTIVE
      addLog(s, `${FACTION_NAME[s.activePlayer]}: +${held * VP_PER_OBJECTIVE} ПО за удержание целей (${held}). [учебное правило]`, 'minimal')
    } else addLog(s, `${FACTION_NAME[s.activePlayer]} не контролирует ни одной цели — очков нет.`, 'standard')
  } else addLog(s, 'В первом раунде очки за цели не начисляются. [учебное правило]', 'beginner')
}

function endTurn(s: GameState, r: Roller) {
  for (const u of s.units) {
    if (isDestroyed(u)) continue
    let removed = 0
    while (alive(u).length > 1 && checkCoherency(alive(u).map((m) => ({ m, pos: m.pos })))) {
      const a = alive(u)
      const worst = a.reduce((b, m) => (sumDist(m, a) > sumDist(b, a) ? m : b))
      worst.destroyed = true
      removed++
    }
    if (removed) addLog(s, `${u.name}: ${removed} модель(и) убраны в конце хода из-за нарушения связности (coherency).`, 'minimal')
  }
  for (const p of sidesOf(s)) if (s.players[p].riledTurns > 0) s.players[p].riledTurns--
  updateObjectiveControl(s)
  checkWinner(s)
  if (s.winner) return
  const second = other(s, s.firstPlayer)
  if (s.activePlayer === second) {
    if (s.round >= s.maxRounds) {
      const [wa, wb] = sidesOf(s)
      const a = s.players[wa], b = s.players[wb]
      s.winner = a.vp > b.vp ? wa : b.vp > a.vp ? wb : 'draw'
      addLog(s, `Битва окончена после ${s.maxRounds} раундов. ${s.winner === 'draw' ? 'Ничья!' : `Победа: ${FACTION_NAME[s.winner]}!`} (${a.vp}:${b.vp})`, 'minimal')
      return
    }
    s.round++
    refreshFocus(s)
    addLog(s, `===== Раунд ${s.round} =====`, 'minimal')
  }
  s.activePlayer = other(s, s.activePlayer)
  resetTurnFlags(s)
  enterPhase(s, 'command', r)
}

const sumDist = (m: ModelState, all: ModelState[]) => all.reduce((acc, o) => acc + dist(m.pos, o.pos), 0)

function checkWinner(s: GameState) {
  if (s.winner) return
  enforceCrews(s)
  const [wa, wb] = sidesOf(s)
  const m = unitsOf(s, wa).length, o = unitsOf(s, wb).length
  if (m && o) return
  s.winner = m ? wa : o ? wb : 'draw'
  addLog(s, `Армия противника уничтожена. ${s.winner === 'draw' ? 'Ничья!' : `Победа: ${FACTION_NAME[s.winner]}!`}`, 'minimal')
}

/** Crewed Platform (Guardian Defenders): platforms are destroyed with the last non-platform model of the unit. */
function enforceCrews(s: GameState) {
  for (const u of s.units) {
    if (!hasAbility(u, 'crewedPlatform') || isDestroyed(u)) continue
    if (alive(u).some((m) => !profileOf(m).platform)) continue
    for (const m of u.models) if (!m.destroyed) m.destroyed = true
    addLog(s, `${u.name}: последний Страж погиб — платформы тяжёлого оружия уничтожены (Crewed Platform).`, 'standard')
  }
}

/** Reanimation Protocols (Necrons): at the end of your Command phase each such unit heals D3 wounds (revives models). */
function reanimate(s: GameState, r: Roller) {
  for (const u of unitsOf(s, s.activePlayer)) {
    if (!hasAbility(u, 'reanimation')) continue
    const lost = u.models.some((m) => (m.destroyed && !profileOf(m).character) || (!m.destroyed && m.wounds < profileOf(m).w))
    if (!lost) continue
    let v = rollDie(r, 'D3')
    const dice = [{ value: v, success: true } as DiceEntry['steps'][number]['dice'][number]]
    // Their Number is Legion: re-roll the dice that determine how many wounds are reanimated (we re-roll a 1)
    if (hasAbility(u, 'legion') && v === 1) {
      const again = rollDie(r, 'D3')
      dice.push({ value: again, success: true, rerolledFrom: v })
      v = again
    }
    const { healed, revived } = healUnit(s, u, v)
    pushDice(s, `Реанимация: ${u.name}`, [{ label: 'D3', target: '—', dice, note: `Лечение ${v} ран: восстановлено ${healed}, возвращено моделей ${revived}.` }],
      `${u.name}: Reanimation Protocols — ${healed} ран восстановлено, ${revived} модел. возвращено.`)
    addLog(s, `${u.name}: Reanimation Protocols — лечение D3 = ${v}${healed ? `, восстановлено ран: ${healed}` : ''}${revived ? `, возвращено моделей: ${revived}` : ''}.`, 'standard')
  }
}

/** Self-destruction (Canoptek Scarabs): at the start of the Fight phase an engaged swarm may sacrifice a model
 * (we do it automatically while at least two models remain): D6 (+1 vs VEHICLE): 2–5 = D3 mortal wounds, 6+ = 3. */
function selfDestruction(s: GameState, r: Roller) {
  const before = aliveIds(s)
  for (const u of s.units) {
    if (!hasAbility(u, 'selfDestruction') || isDestroyed(u) || alive(u).length < 2) continue
    const cand = alive(u)
      .map((m) => ({ m, foes: enemiesOf(s, u).filter((e) => modelEngagedWith(m, e)) }))
      .filter((x) => x.foes.length > 0)
      .sort((a, b) => a.m.wounds - b.m.wounds)
    if (!cand.length) continue
    const { m, foes } = cand[0]
    m.destroyed = true
    const woundsLeft = (e: UnitState) => alive(e).reduce((a, x) => a + x.wounds, 0)
    const target = [...foes].sort((a, b) => woundsLeft(b) - woundsLeft(a))[0]
    const raw = r.d6()
    const v = raw + (hasKeyword(target, 'VEHICLE') ? 1 : 0)
    const mw = v >= 6 ? 3 : v >= 2 ? rollDie(r, 'D3') : 0
    pushDice(s, `Самоуничтожение: ${u.name}`, [{ label: 'D6', target: '2+', dice: [{ value: raw, success: v >= 2 }], note: `${hasKeyword(target, 'VEHICLE') ? '+1 против техники; ' : ''}2–5: D3 смертельных ран, 6+: 3` }],
      mw ? `${u.name} → ${target.name}: ${mw} смертельн. ран.` : `${u.name}: самоуничтожение не причинило вреда.`)
    addLog(s, `${u.name}: модель самоуничтожается (Self-destruction) рядом с «${target.name}» — ${mw} смертельн. ран.`, 'standard')
    if (mw) applyMortalWounds(s, target, mw, 'самоуничтожение скарабеев')
  }
  deadlyDemise(s, before, r)
  checkWinner(s)
}

/** Start of the Fight phase, Adeptus Mechanicus: Data-spike (Tech-Priest Dominus vs engaged VEHICLEs: 4+ = D6 mortal wounds
 * and WS −1 until the end of the phase) and Voices in the Code (every enemy unit engaged with Sicarians takes a Battle-shock test).
 * Both are used automatically. */
function fightStartMechanicus(s: GameState, r: Roller) {
  const before = aliveIds(s)
  const voiced = new Set<string>()
  for (const u of s.units) {
    if (isDestroyed(u) || !hasAbility(u, 'dataSpike')) continue
    const target = engagedUnits(s, u).find((e) => hasKeyword(e, 'VEHICLE'))
    if (!target) continue
    const v = r.d6()
    const hit = v >= 4
    const mw = hit ? rollDie(r, 'D6') : 0
    if (hit) target.spiked = true
    pushDice(s, `Шип данных: ${u.name} → ${target.name}`, [{ label: 'D6', target: '4+', dice: [{ value: v, success: hit }], note: hit ? `Успех: D6 = ${mw} смертельных ран; WS оружия ближнего боя цели на 1 хуже до конца фазы.` : 'Провал: ничего не происходит.' }],
      hit ? `${u.name}: Data-spike — «${target.name}» получает ${mw} смертельн. ран и теряет точность.` : `${u.name}: Data-spike не сработал.`)
    addLog(s, `${u.name}: Data-spike против «${target.name}» — ${hit ? `${mw} смертельн. ран, WS −1` : 'не сработал'}.`, 'standard')
    if (mw) applyMortalWounds(s, target, mw, 'Data-spike')
  }
  for (const u of s.units) {
    if (isDestroyed(u) || !hasAbility(u, 'voicesInTheCode')) continue
    for (const e of engagedUnits(s, u)) {
      if (isDestroyed(e) || voiced.has(e.id)) continue
      voiced.add(e.id)
      const { dice, total, ld, pass, label } = leadershipRoll(s, e, r)
      if (!pass) e.battleShocked = true
      pushDice(s, `Голоса в коде: ${e.name}`, [{ label, target: `${ld}+`, dice: dice.map((x) => ({ value: x, success: pass })), note: `Сумма ${total} против Ld ${ld}+` }],
        pass ? `${e.name}: проверка пройдена.` : `${e.name}: провал — отряд в боевом шоке (Voices in the Code).`)
      addLog(s, `${e.name}: Voices in the Code — ${pass ? 'проверка боевого шока пройдена' : 'провал, боевой шок'} (${total} против ${ld}+).`, 'standard')
    }
  }
  deadlyDemise(s, before, r)
  checkWinner(s)
}

function pushDice(s: GameState, title: string, steps: DiceEntry['steps'], summary: string) {
  s.diceLog.push({ id: s.nextId++, round: s.round, player: actor(s), title, steps, summary })
  if (s.diceLog.length > 200) s.diceLog.splice(0, s.diceLog.length - 200)
}

const aliveIds = (s: GameState) => new Set(s.units.flatMap((u) => alive(u).map((m) => m.id)))

/** Deadly Demise X (24.08): each model with it that was destroyed since `before` rolls a D6;
 * on a 6 every unit within 6″ of it suffers X mortal wounds. No chain reactions. */
function deadlyDemise(s: GameState, before: Set<string>, r: Roller) {
  for (const u of s.units) {
    const x = hasAbility(u, 'deadlyDemiseD3') ? 'D3' : hasAbility(u, 'deadlyDemise1') ? 1 : null
    if (!x) continue
    for (const m of u.models) {
      if (!m.destroyed || !before.has(m.id)) continue
      const v = r.d6()
      if (v !== 6) {
        pushDice(s, `Deadly Demise: ${u.name}`, [{ label: 'D6', target: '6', dice: [{ value: v, success: false }], note: 'Только на 6 подбитая техника взрывается.' }], `${u.name}: обломки не взорвались.`)
        continue
      }
      const n = x === 'D3' ? rollDie(r, 'D3') : x
      const victims = s.units.filter((o) => !isDestroyed(o) && alive(o).some((om) => withinRange(modelDistance(m, om), 6)))
      pushDice(s, `Deadly Demise: ${u.name}`, [{ label: 'D6', target: '6', dice: [{ value: v, success: true }], note: `Взрыв: ${n} смертельн. ран каждому отряду в 6″.` }], `${u.name} взрывается: ${victims.map((o) => o.name).join(', ') || 'рядом никого'}.`)
      for (const o of victims) applyMortalWounds(s, o, n, `взрыв ${u.name} (Deadly Demise)`)
    }
  }
}

function hazard(s: GameState, u: UnitState, n: number, r: Roller, why: string) {
  if (n <= 0) return
  const dice = rollMany(r, n)
  const failed = dice.filter((v) => v <= 2).length
  pushDice(s, `Опасность (Hazard): ${u.name}`, [{ label: 'Hazard', target: '3+', dice: dice.map((v) => ({ value: v, success: v > 2 })), note: `${why}: 1–2 = 1 смертельная рана` }],
    failed ? `${failed} провал(а) — смертельные раны.` : 'Все броски опасности пройдены.')
  if (failed) applyMortalWounds(s, u, failed, why)
}

// ---------------------------------------------------------------- apply

export function apply(state: GameState, cmd: Command, r: Roller): GameState {
  const v = validate(state, cmd)
  if (!v.ok) throw new Error(v.reason)
  const s: GameState = structuredClone(state)

  switch (cmd.type) {
    case 'endPhase': {
      updateObjectiveControl(s)
      if (s.phase === 'movement')
        for (const u of s.units) if (u.advanceRoll !== null && u.move === 'none') u.move = 'advance'
      if (s.phase === 'command') {
        reanimate(s, r)
        holdScoutedObjectives(s, s.activePlayer)
      }
      const i = PHASES.indexOf(s.phase)
      if (i === PHASES.length - 1) endTurn(s, r)
      else enterPhase(s, PHASES[i + 1], r)
      break
    }
    case 'callWaaagh': {
      s.players.orks.waaaghUsed = true
      s.players.orks.riledTurns = 2
      addLog(s, 'WAAAGH! Боевой клич: до конца следующего хода Орки «разъярены» — 5+ непробиваемый спасбросок, всё оружие дальнего боя получает Assault, можно атаковать после продвижения.', 'minimal')
      break
    }
    case 'callShadow': {
      const me = s.activePlayer
      s.players[me].shadowUsed = true
      const mine = unitsOf(s, me).filter((u) => hasKeyword(u, 'SYNAPSE'))
      addLog(s, 'Тень в Варпе (Shadow in the Warp): каждый вражеский отряд проходит проверку боевого шока; в 6″ от отряда Synapse — с −1.', 'minimal')
      for (const e of unitsOf(s, other(s, me))) {
        const mod = mine.some((x) => unitDistance(e, x) <= SYNAPSE_RANGE) ? -1 : 0
        const { dice, total, ld, pass } = leadershipRoll(s, e, r, mod)
        if (!pass) e.battleShocked = true
        pushDice(s, `Тень в Варпе: ${e.name}`, [{ label: '2D6', target: `${ld}+`, dice: dice.map((v) => ({ value: v, success: pass })), note: `Сумма ${total}${mod ? ' (−1 рядом с Synapse)' : ''} против Ld ${ld}+` }],
          pass ? `${e.name}: проверка пройдена.` : `${e.name}: провал — отряд в боевом шоке.`)
      }
      break
    }
    case 'imperative': {
      s.players[s.activePlayer].imperative = cmd.imperative
      addLog(s, cmd.imperative === 'protector'
        ? 'Протектор (Protector Imperative): оружие дальнего боя Адептус Механикус получает Heavy и BS на 1 лучше; линейные отряды трудно бить в ближнем бою.'
        : 'Завоеватель (Conqueror Imperative): оружие дальнего боя получает Assault, WS ближнего боя на 1 лучше; линейные отряды получают AP +1.', 'minimal')
      break
    }
    case 'divineWork': {
      const u = findUnit(s, cmd.unitId)!
      const led = ledUnitOf(s, u)
      s.players[u.owner].divineUsed = true
      u.warded = true
      if (led) led.warded = true
      addLog(s, `${u.name}: Защита божественного труда — ${led ? `«${led.name}» и техножрец получают` : 'техножрец получает'} 4+ непробиваемый спасбросок до начала вашего следующего хода.`, 'minimal')
      break
    }
    case 'guide': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      s.players[u.owner].guide = t.id
      u.guided = true
      addLog(s, `${u.name}: Guide — союзные модели Аэльдари получают +1 к попаданию по «${t.name}» до начала следующей фазы командования.`, 'standard')
      break
    }
    case 'declareAdvance':
    case 'rerollAdvance': {
      const u = findUnit(s, cmd.unitId)!
      const prev = u.advanceRoll
      const v2 = r.d6()
      u.advanceRoll = v2
      if (cmd.type === 'rerollAdvance') u.advanceRerolled = true
      pushDice(s, `Продвижение: ${u.name}`, [{ label: 'D6', target: '—', dice: [{ value: v2, success: true, rerolledFrom: prev ?? undefined }], note: prev ? `Переброс (Waaagh!): было ${prev}` : undefined }],
        `${u.name}: продвижение (Advance) на M + ${v2}". После продвижения отряд не может атаковать (charge) и стреляет только оружием Assault.`)
      addLog(s, `${u.name} продвигается: бросок D6 = ${v2}.`, 'minimal')
      break
    }
    case 'move': {
      const u = findUnit(s, cmd.unitId)!
      movedTo(u, cmd.positions)
      u.move = cmd.mode
      if (cmd.swift) {
        s.players[u.owner].focus = (s.players[u.owner].focus ?? 1) - 1
        addLog(s, `${u.name}: Swift as the Wind — +${SWIFT_BONUS}″ к движению (жетон Боевого фокуса, осталось ${s.players[u.owner].focus}).`, 'standard')
      }
      if (cmd.fly) addLog(s, `${u.name} летит (take to the skies): −${FLY_PENALTY}″, игнорирует модели и тиррейн.`, 'standard')
      const label = { normal: 'обычное движение (Normal Move)', advance: 'продвижение (Advance)', fallBack: 'отступление (Fall Back)' }[cmd.mode]
      addLog(s, `${u.name}: ${label}, до ${fmt(u.movedDistance)}".`, 'standard')
      if (cmd.mode === 'fallBack') {
        addLog(s, 'Отступивший отряд не может стрелять и атаковать в этот ход.', 'beginner')
        if (u.battleShocked) {
          hazard(s, u, alive(u).length, r, 'Отчаянный побег (Desperate Escape)')
          if (!isDestroyed(u)) {
            const { dice, ld, pass, label } = leadershipRoll(s, u, r)
            u.battleShocked = !pass
            pushDice(s, `Боевой шок после побега: ${u.name}`, [{ label, target: `${ld}+`, dice: dice.map((x) => ({ value: x, success: pass })) }], pass ? 'Пройдено.' : 'Провал — отряд остаётся в боевом шоке.')
          }
        }
      }
      break
    }
    case 'shoot': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      const before = aliveIds(s)
      const plan = shootPlan(s, u, t, cmd)
      u.shot = true
      if (plan.oneShots.length) u.spent = [...(u.spent ?? []), ...plan.oneShots]
      if (cmd.useAmmoRunts && hasAbility(u, 'ammoRunts') && !u.ammoRuntsUsed) u.ammoRuntsUsed = true
      addLog(s, `${u.name} стреляет по отряду «${t.name}»${plan.cover ? ' (цель в укрытии: навык −1)' : ''}.`, 'minimal')
      for (const sk of plan.skipped) addLog(s, sk, 'beginner')
      let repulsed = 0
      for (const g of plan.groups) {
        if (isDestroyed(t)) break
        const res = resolveGroup(r, u.name, g, t, g.ctx)
        repulsed += res.repulsed
        pushDice(s, `${u.name} → ${t.name}: ${g.weaponName}${g.notes.length ? ` [${g.notes.join(', ')}]` : ''}`, res.steps, res.summary)
        addLog(s, res.summary, 'standard')
      }
      hazard(s, u, plan.hazardousModels, r, 'Перегрузка плазмы (Hazardous)')
      // Repulsor Grid: every unmodified 6 on the target's saves = 1 mortal wound for the shooter, after it has shot
      if (repulsed && !isDestroyed(u)) {
        pushDice(s, `Отталкивающая решётка: ${t.name} → ${u.name}`, [{ label: 'Спасброски «6»', target: '6', dice: Array.from({ length: repulsed }, () => ({ value: 6, success: true })), note: `Натуральных «6» в спасбросках: ${repulsed} — столько смертельных ран получает стрелок.` }],
          `${u.name} получает ${repulsed} смертельн. ран от Repulsor Grid «${t.name}».`)
        applyMortalWounds(s, u, repulsed, `Repulsor Grid «${t.name}»`)
      }
      deadlyDemise(s, before, r)
      if (isDestroyed(t)) addLog(s, `Отряд «${t.name}» уничтожен!`, 'minimal')
      checkWinner(s)
      break
    }
    case 'declareCharge': {
      const u = findUnit(s, cmd.unitId)!
      u.chargeDeclared = true
      const dice = rollMany(r, 2)
      const roll = dice[0] + dice[1]
      const targets = chargeTargetsFor(s, u, roll)
      pushDice(s, `Бросок атаки: ${u.name}`, [{ label: '2D6', target: '—', dice: dice.map((x) => ({ value: x, success: targets.length > 0 })), note: `Максимальная дистанция атаки ${roll}"` }],
        targets.length ? `Бросок ${roll}": доступные цели — ${targets.map((x) => x.name).join(', ')}.` : `Бросок ${roll}" — недостаточно, атака провалена.`)
      if (targets.length) s.pendingCharge = { unitId: u.id, roll, dice, targets: targets.map((x) => x.id) }
      else {
        const d = Math.min(...enemiesOf(s, u).map((e) => unitDistance(u, e)))
        addLog(s, `${u.name}: атака провалена — выпало ${roll}", а до ближайшего врага ${fmt(d)}"${roll === 2 ? ' (бросок 2 никогда не достаточен)' : ''}. Отряд остаётся на месте.`, 'minimal')
      }
      break
    }
    case 'skipCharge': {
      const u = findUnit(s, cmd.unitId)!
      s.pendingCharge = null
      addLog(s, `${u.name} отказывается от перемещения атаки.`, 'standard')
      break
    }
    case 'chargeMove': {
      const u = findUnit(s, cmd.unitId)!
      const targets = cmd.targetIds.map((id) => findUnit(s, id)!)
      const pos = planCharge(s, u, targets, s.pendingCharge!.roll)!
      movedTo(u, pos)
      u.charged = true
      s.pendingCharge = null
      addLog(s, `${u.name} атакует (charge) отряд «${targets.map((x) => x.name).join(', ')}» и получает «Бьёт первым» (Fights First).`, 'minimal')
      break
    }
    case 'fight': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      const before = aliveIds(s)
      u.fought = true
      const groups = meleePlan(s, u, t)
      addLog(s, `${u.name} сражается с отрядом «${t.name}».`, 'minimal')
      for (const g of groups) {
        if (isDestroyed(t)) break
        const res = resolveGroup(r, u.name, g, t, g.ctx)
        pushDice(s, `Бой: ${u.name} → ${t.name}: ${g.weaponName}${g.notes.length ? ` [${g.notes.join(', ')}]` : ''}`, res.steps, res.summary)
        addLog(s, res.summary, 'standard')
      }
      if (!groups.length) addLog(s, `${u.name}: ни одна модель не в зоне контакта (${ENGAGEMENT_RANGE}").`, 'standard')
      deadlyDemise(s, before, r)
      if (isDestroyed(t)) addLog(s, `Отряд «${t.name}» уничтожен!`, 'minimal')
      checkWinner(s)
      s.fight!.selecting = other(s, s.fight!.selecting)
      advanceFight(s)
      break
    }
  }
  enforceCrews(s)
  s.rng = r.state()
  return s
}

// ---------------------------------------------------------------- game setup

/** Roll off for first turn and start round 1. */
export function startGame(s0: GameState, r: Roller): GameState {
  const s = structuredClone(s0)
  let a = 0, b = 0
  const rolls: number[] = []
  while (a === b) { a = r.d6(); b = r.d6(); rolls.push(a, b) }
  const [west, east] = sidesOf(s)
  s.firstPlayer = a > b ? west : east
  s.activePlayer = s.firstPlayer
  refreshFocus(s)
  pushDice(s, 'Бросок за первый ход', [{ label: `${FACTION_NAME[west]} / ${FACTION_NAME[east]}`, target: '—', dice: rolls.map((v) => ({ value: v, success: true })) }], `Первым ходит: ${FACTION_NAME[s.firstPlayer]}.`)
  addLog(s, `===== Раунд 1 ===== Первым ходит: ${FACTION_NAME[s.firstPlayer]}.`, 'minimal')
  enterPhase(s, 'command', r)
  s.rng = r.state()
  return s
}

// ---------------------------------------------------------------- UI helpers

export interface ActionInfo {
  id: string
  label: string
  ok: boolean
  reason?: string
  cmd?: Command
}

/** Actions available to a unit in the current phase, with reasons. */
export function unitActions(s: GameState, unitId: string): ActionInfo[] {
  const u = findUnit(s, unitId)
  if (!u || isDestroyed(u)) return []
  const out: ActionInfo[] = []
  const add = (id: string, label: string, cmd: Command) => {
    const v = validate(s, cmd)
    out.push({ id, label, ok: v.ok, reason: v.ok ? undefined : v.reason, cmd })
  }
  if (s.phase === 'movement') {
    add('advance', 'Объявить продвижение (Advance): M + D6', { type: 'declareAdvance', unitId })
    add('reroll', 'Перебросить продвижение (Waaagh!)', { type: 'rerollAdvance', unitId })
    if (hasAbility(u, 'guide'))
      for (const e of enemiesOf(s, u)) add(`guide:${e.id}`, `Guide: пометить «${e.name}»`, { type: 'guide', unitId, targetId: e.id })
  }
  if (hasAbility(u, 'defendDivineWork')) add('divineWork', 'Защита божественного труда (4+ инвуль, раз за битву)', { type: 'divineWork', unitId })
  if (s.phase === 'shooting')
    for (const e of enemiesOf(s, u)) add(`shoot:${e.id}`, `Стрелять по «${e.name}»`, { type: 'shoot', unitId, targetId: e.id })
  if (s.phase === 'charge') {
    if (s.pendingCharge?.unitId === unitId) {
      for (const t of s.pendingCharge.targets) add(`charge:${t}`, `Атаковать «${findUnit(s, t)!.name}»`, { type: 'chargeMove', unitId, targetIds: [t] })
      add('skipCharge', 'Отказаться от перемещения', { type: 'skipCharge', unitId })
    } else add('declareCharge', 'Объявить атаку (Charge): бросок 2D6', { type: 'declareCharge', unitId })
  }
  if (s.phase === 'fight')
    for (const e of enemiesOf(s, u)) add(`fight:${e.id}`, `Сражаться с «${e.name}»`, { type: 'fight', unitId, targetId: e.id })
  return out.filter((a) => a.id !== 'reroll' || hasAbility(u, 'waaagh'))
}

export function maxMove(u: UnitState): number {
  const m = Math.min(...alive(u).map((x) => profileOf(x).m))
  return u.advanceRoll !== null ? m + u.advanceRoll : m
}

/** Move options the player may toggle: FLY ("take to the skies") and Aeldari Swift as the Wind. */
export interface MoveOptions { fly: boolean; swift: boolean }

/** Options that actually apply to this unit (stale toggles for a unit that cannot use them are ignored). */
export function effectiveMoveOptions(s: GameState, u: UnitState, o: MoveOptions): MoveOptions {
  return {
    fly: o.fly && isFlyer(u),
    swift: o.swift && datasheetOf(u).faction === 'aeldari' && (s.players[u.owner].focus ?? 0) > 0,
  }
}

/** Maximum distance of a move with the given options. */
export function moveAllowance(s: GameState, u: UnitState, o: MoveOptions): number {
  const e = effectiveMoveOptions(s, u, o)
  return maxMove(u) + (e.swift ? SWIFT_BONUS : 0) - (e.fly ? FLY_PENALTY : 0)
}

/** The move command for `positions`, with the toggled options that apply. */
export function moveCommand(s: GameState, u: UnitState, positions: Record<string, Vec>, o: MoveOptions): Command {
  const e = effectiveMoveOptions(s, u, o)
  return { type: 'move', unitId: u.id, mode: moveModeFor(s, u), positions, ...(e.fly ? { fly: true } : {}), ...(e.swift ? { swift: true } : {}) }
}

export function moveModeFor(s: GameState, u: UnitState): 'normal' | 'advance' | 'fallBack' {
  if (isEngaged(s, u)) return 'fallBack'
  return u.advanceRoll !== null ? 'advance' : 'normal'
}

