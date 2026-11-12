// Rules engine: the single source of truth for legality and outcomes.
// validate(state, cmd) never mutates; apply(state, cmd, roller) returns a new state.

import { FACTION_NAME } from './data/datasheets'
import { rollDie, rollMany, type Roller } from './dice/dice'
import { dist, withinRange, EPS, add, sub, scale, len, sweptCircleHits } from './geometry/geometry'
import {
  alphaWarrior, battlelineSupport, feelNoPainOf, nobleLeads, ENGRAMMATIC_RANGE, psychicGuidance, GRENADE_PACK_RANGE, hasWargear, holdScoutedObjectives, imperativeOf, invulnOverrideOf, ledUnitOf, leadersOf, neurostaticMod,
  addLog, alive, atHalfStrength, CHARGE_RANGE, checkCoherency, CONSOLIDATE, datasheetOf, engagedUnits, ENGAGEMENT_RANGE,
  enemiesOf, findUnit, fmt, hasAbility, hasKeyword, inSynapseRange, isDestroyed, isEngaged, isFlyer, isMV, modelDistance, modelEngagedWith,
  LEADER_RANGE, other, PILE_IN, profileOf, radiusOf, sidesOf, SYNAPSE_RANGE, unitDistance, unitNearObjective, unitsOf,
  updateObjectiveControl, weaponsOf, OBJECTIVE_MARKER_MM,
} from './gameState'
import { healUnit } from './rules/heal'
import { aiArrivalTarget, arrivalProblem, arrivalSpot, arrive, expireReserves, reservesOf } from './rules/reserves'
import { applySecondary, secondaryCommandStart, secondaryProblem, secondaryTurnEnd } from './rules/secondaries'
import { actionProblem, MISSION_ACTION, missionBattleEnd, missionCommandEnd, missionTurnEnd, missionTurnStart, PRIMARY } from './rules/missions'
import { applyMortalWounds, resolveGroup, type AttackContext, type AttackGroup, type RerollHook, type RerollKind } from './combat/attack'
import { moveProblem, planMove } from './rules/movement'
import { hasCover, nearestVisibleDistance, seesAny, unitCanSee } from './rules/visibility'
import { DOCTRINE_NAME, DOCTRINE_TEXT, DOCTRINES, doctrineLeft, HYPER_ADAPTATIONS, HYPER_NAME, HYPER_TEXT, MARTIAL_GRACE_SWIFT, MARTIAL_GRACE_TOKENS, RAD_COVER_WOUNDS } from './rules/detachments'
import { deploymentZone } from './rules/deployment'
import { pointInPolygon } from './geometry/geometry'
import { CRUSHING_MAX, EXPLOSIVES_DICE, EXPLOSIVES_RANGE, explosivesReach, hasBuff, LAST_STAND, meetsRequirement, reactionsIn, showOfficialName, STRATAGEMS, targetedThisPhase, usedThisPhase } from './rules/stratagems'
import { baseRadius } from './geometry/geometry'
import type { Command, DiceEntry, GameState, ModelState, PendingReroll, Phase, PlayerId, ReactionWindow, StratagemId, UnitState, Validation, Vec, Weapon, WeaponProfile } from './types'
import { PHASES } from './types'
import { quote, tr } from '../i18n/index'

export const PHASE_NAME: Record<Phase, string> = {
  command: tr('Command phase'),
  movement: tr('Movement phase'),
  shooting: tr('Shooting phase'),
  charge: tr('Charge phase'),
  fight: tr('Fight phase'),
}

export const VP_PER_OBJECTIVE = 5
/** Swift as the Wind: 2″ (Martial Grace, the Warhost detachment rule, adds 1″: see `swiftBonusOf`) */
export const SWIFT_BONUS = 2
export const FLY_PENALTY = 2
export const GUIDE_RANGE = 18
/** Bomb Squig (Kommandos): range to the target unit */
export const BOMB_SQUIG_RANGE = 12
/** Battle Focus tokens per battle round (Incursion). */
export const BATTLE_FOCUS_TOKENS = 2

const fail = (reason: string): Validation => ({ ok: false, reason })
const OK: Validation = { ok: true }

/** Player who must make the next decision. */
export function actor(s: GameState): PlayerId {
  if (hyperPending(s)) return 'tyranids'
  if (s.pendingReroll) return s.pendingReroll.player
  if (s.reaction) return s.reaction.player
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
const canChargeAfterAdvance = (s: GameState, u: UnitState) => riled(s, u) || hasAbility(u, 'boundingLeap') || doctrineOf(s, u) === 'assault'
const canActAfterFallBack = (s: GameState, u: UnitState) => hasAbility(u, 'adaptablePredators') || hasAbility(u, 'adaptiveStrategy') || hasBuff(u, 'feignedRetreat') || doctrineOf(s, u) === 'tactical'

/** Space Marines Combat Doctrines: the doctrine active for this unit (Marines only). */
export const doctrineOf = (s: GameState, u: UnitState) => (datasheetOf(u).faction === 'marines' ? s.players[u.owner].doctrine ?? null : null)

/** The army plays with its detachment (rule and Stratagems); a pure custom list does not. */
export const detachmentOn = (s: GameState, p: PlayerId) => !s.players[p]?.noDetachment

/** Swift as the Wind for this army: 2″, plus 1″ from Martial Grace. */
export const swiftBonusOf = (s: GameState, p: PlayerId) => SWIFT_BONUS + (detachmentOn(s, p) ? MARTIAL_GRACE_SWIFT : 0)

/** Tyranids still have to choose their Hyper-adaptation (the battle waits for it). */
export const hyperPending = (s: GameState) => s.players.tyranids?.hyperAdaptation === null && !s.winner

/**
 * Detachment rules that change an attack of `unit` on `target`: Hyper-adaptations (Tyranids) and Command Protocols
 * (Necrons). Get Stuck In (Orks) is melee-only and lives in `meleeSetup`.
 */
function detachmentAttack(s: GameState, unit: UnitState, target: UnitState) {
  const out = { sustained: false, lethal: false, critPrecision: false, hitMod: 0, notes: [] as string[], hitNotes: [] as string[] }
  if (!detachmentOn(s, unit.owner)) return out
  const faction = datasheetOf(unit).faction
  const hyper = faction === 'tyranids' ? s.players[unit.owner].hyperAdaptation : null
  if (hyper === 'swarming' && hasKeyword(target, 'INFANTRY', 'SWARM')) { out.sustained = true; out.notes.push(tr('Swarming Instincts: Sustained Hits 1')) }
  if (hyper === 'aggression' && hasKeyword(target, 'MONSTER', 'VEHICLE')) { out.lethal = true; out.notes.push(tr('Hyper-aggression: Lethal Hits')) }
  if (hyper === 'predators' && hasKeyword(target, 'CHARACTER')) { out.critPrecision = true; out.notes.push(tr('Hive Predators: crits with Precision')) }
  if (faction === 'necrons' && isLed(s, unit)) { out.hitMod++; out.hitNotes.push(tr('Command Protocols +1')) }
  return out
}

// notes that mark Stratagem effects on an attack group (see shootPlan)
const BLITZ_CRIT = tr('Lightning Fire: critical on 5+')
const TYRANT_ALL = tr('Conqueror Tyrant: re-roll misses')
const TYRANT_ONES = tr('Conqueror Tyrant: re-roll 1s')
/** Fire Overwatch: range to the target */
const OVERWATCH_RANGE = 24
/** Fungus-Fuel Injection: extra Move */
const FUNGUS_BONUS = 2
/** Extinction Order: the objective must be within this distance of the Tech-Priest */
const EXTINCTION_RANGE = 24

/** A CHARACTER of the same army leads this unit. */
const isLed = (s: GameState, u: UnitState) =>
  s.units.some((l) => l.owner === u.owner && !isDestroyed(l) && hasKeyword(l, 'CHARACTER') && ledUnitOf(s, l)?.id === u.id) || necronLed(s, u)

/** Necrons have no leader attachment here: as for Guardian Protocols (docs/necrons.md), a friendly NECRONS CHARACTER
 * within 3″ of a non-CHARACTER Necrons unit counts as leading it. */
const necronLed = (s: GameState, u: UnitState) =>
  datasheetOf(u).faction === 'necrons' && !hasKeyword(u, 'CHARACTER') &&
  s.units.some((l) => l.id !== u.id && l.owner === u.owner && !isDestroyed(l) && hasKeyword(l, 'CHARACTER') && datasheetOf(l).faction === 'necrons' && unitDistance(u, l) <= LEADER_RANGE + EPS)

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
  const guard = !duty && hasAbility(target, 'guardianProtocols') && p.s > t && nobleLeads(s, target)
  // Rapid Regeneration: Feel No Pain 6+, or 5+ within Synapse Range, for the rest of the phase
  const regen = hasBuff(target, 'rapidRegeneration') ? (inSynapseRange(s, target) ? 5 : 6) : undefined
  const fnps = [feelNoPainOf(s, target), regen].filter((x): x is number => x !== undefined)
  const fnp = fnps.length ? Math.min(...fnps) : undefined
  // Baleful Halo: −1 to wound rolls; a roll is never modified by more than −1
  const halo = hasBuff(target, 'balefulHalo')
  const woundNotes = [duty ? tr('Duty Eternal: Strength beats Toughness') : guard ? tr('Guardian Protocols: Strength beats Toughness') : '', halo ? tr('Sinister Halo') : ''].filter(Boolean)
  return {
    woundMod: duty || guard || halo ? -1 : 0,
    woundModNote: woundNotes.length ? woundNotes.join(', ') : undefined,
    damageMod: hasAbility(target, 'dreadArd') || hasAbility(target, 'implacableResilience') ? -1 : 0,
    ...(fnp ? { fnp } : {}),
  }
}

/** Invulnerable save against ranged attacks: the general override, and the Rangers' 5+ (ranged attacks only). */
/** Emanatus Force Field (Onager Dunecrawler): friendly ADEPTUS MECHANICUS BATTLELINE within 6″ of it. */
export const EMANATUS_RANGE = 6
const emanatus = (s: GameState, target: UnitState) =>
  hasKeyword(target, 'BATTLELINE') && datasheetOf(target).faction === 'adeptus_mechanicus' &&
  s.units.some((x) => x.owner === target.owner && x.id !== target.id && !isDestroyed(x) && hasAbility(x, 'emanatusForceField') && unitDistance(x, target) <= EMANATUS_RANGE + EPS)

function rangedInvuln(s: GameState, target: UnitState): number | undefined {
  const v = [invulnOverrideOf(s, target), hasAbility(target, 'cameleoline') ? 5 : undefined, hasBuff(target, 'bulwarkImperative') ? 4 : undefined, emanatus(s, target) ? 4 : undefined].filter((x): x is number => x !== undefined)
  return v.length ? Math.min(...v) : undefined
}

/** Implacable Eradication (Immortals): re-roll wound rolls of 1, or every failed one against a target within range of an objective. */
function eradication(s: GameState, unit: UnitState, target: UnitState, notes: string[]): { rerollWounds?: 'ones' | 'all' } {
  if (!hasAbility(unit, 'implacableEradication')) return {}
  const all = s.objectives.some((o) => unitNearObjective(target, o))
  notes.push(all ? tr('Implacable Eradication: re-roll wounds (target on an objective)') : tr('Implacable Eradication: re-roll 1s to wound'))
  return { rerollWounds: all ? 'all' : 'ones' }
}

/** Doctrina Imperatives / Breaching Command / Galvanic Field: attacker-side modifiers shared by shooting and melee. */
/** Damaged: 1–4 wounds remaining (Onager Dunecrawler): −1 to its hit rolls. */
export const DAMAGED_WOUNDS = 4
export const isDamaged = (u: UnitState) => hasAbility(u, 'damaged1to4') && alive(u).some((m) => m.wounds <= DAMAGED_WOUNDS)

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
    /** Snap Shooting (Fire Overwatch): hits only on an unmodified 6, no modifiers or re-rolls */
    snap?: boolean
  } = {},
): ShootPlan {
  const plan: ShootPlan = { groups: [], firingModels: [], oneShots: [], hazardousModels: 0, skipped: [], cover: false, problem: null }
  const engaged = isEngaged(s, unit)
  const advanced = unit.move === 'advance'
  const onslaught = inOnslaught(s, unit)
  const bonus = attackerBonuses(s, unit)
  const assaultAll = riled(s, unit) || onslaught || bonus.imp === 'conqueror' || hasBuff(unit, 'suddenStorm') || doctrineOf(s, unit) === 'devastator'
  const mv = isMV(unit)
  if (engaged && advanced) return { ...plan, problem: tr('The unit Advanced and is in engagement range — it cannot shoot.') }
  if (engaged && !engagedUnits(s, unit).some((e) => e.id === target.id))
    return { ...plan, problem: mv
      ? tr('A vehicle in engagement range of an enemy shoots only at the unit it is engaged with.')
      : tr('The unit is in engagement range of the enemy: it can shoot only with close-quarters weapons (Close-quarters) and only at the unit it is engaged with.') }

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
    if (advanced && !engaged && !hasAbility(unit, 'elevatedStrider')) {
      const before = chosen.length
      chosen = chosen.filter((w) => assaultAll || w.profiles[opts.profiles?.[w.id] ?? 0].keywords.assault)
      if (before > chosen.length) plan.skipped.push(tr('{name}: after an Advance only Assault weapons shoot.', { name: profileOf(m).name }))
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
      if (chosen.length) plan.skipped.push(tr('{name}: no line of sight to the target.', { name: profileOf(m).name }))
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
        plan.skipped.push(tr('{name}: {name2} — target at {fmt}", range {range}".', { name: profileOf(m).name, name2: w.name, fmt: fmt(d), range }))
        continue
      }
      fired = true
      if (p.keywords.hazardous) plan.hazardousModels++
      if (p.keywords.oneShot) plan.oneShots.push(spentKey(m, w))
      // Bladestorm (Dire Avengers): Sustained Hits 1 against a target within half range; such models form their own group
      const bladestorm = hasAbility(unit, 'bladestorm') && withinRange(d, range / 2)
      // Blitzing Firepower (within 12″) and Conquering Tyrant (within half range) depend on this model's distance
      const blitz = hasBuff(unit, 'blitzingFirepower') && withinRange(d, 12)
      const tyrant = hasBuff(unit, 'conqueringTyrant') && withinRange(d, range / 2)
      const key = `${w.id}:${idx}${bladestorm ? ':bs' : ''}${blitz ? ':bf' : ''}${tyrant ? ':ct' : ''}`
      let g = byKey.get(key)
      if (!g) {
        g = { weaponName: w.name, profile: p, models: 0, attacks: 0, randomAttacks: 0, notes: bladestorm ? ['Bladestorm: Sustained Hits 1'] : [], sustainedHits: bladestorm ? Math.max(1, p.keywords.sustainedHits ?? 0) : undefined, ctx: { hitMod: 0, hitModNotes: [], skillWorsen: 0, lethalHits: false } }
        if (blitz) {
          if (g.sustainedHits ?? p.keywords.sustainedHits) g.notes.push(BLITZ_CRIT)
          else { g.sustainedHits = 1; g.notes.push('Blitzing Firepower: Sustained Hits 1') }
        }
        if (tyrant) g.notes.push(isLed(s, unit) ? TYRANT_ALL : TYRANT_ONES)
        byKey.set(key, g)
      }
      g.models++
      if (p.randomA) g.randomAttacks = (g.randomAttacks ?? 0) + 1
      let a = p.attacks
      const rapid = (p.keywords.rapidFire ?? 0) + (hasBuff(unit, 'closeRangeDakka') ? 1 : 0)
      if (rapid && withinRange(d, range / 2)) {
        a += rapid
        if (!g.notes.includes('Rapid Fire')) g.notes.push(hasBuff(unit, 'closeRangeDakka') ? tr('Rapid Fire (Dakka at close range)') : 'Rapid Fire')
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

  if (!anyVisible) return { ...plan, problem: tr('The target is not visible: cover blocks the line of sight.') }
  if (byKey.size === 0)
    return { ...plan, problem: plan.skipped.length && closest < Infinity ? tr('No weapon can shoot: the nearest visible target model is at {fmt}". {item}', { fmt: fmt(closest), item: plan.skipped[0] }) : tr('No suitable weapon.') }

  // Stealth: the target always has the benefit of cover against ranged attacks
  plan.cover = hasCover(s, plan.firingModels, target) || hasAbility(target, 'stealth') || hasBuff(target, 'smokescreen')
  const omnispex = hasWargear(unit, 'omnispex')
  const bolter = hasAbility(unit, 'boltDiscipline') && s.objectives.some((o) => unitNearObjective(unit, o) || unitNearObjective(target, o))
  const runts = !!opts.useAmmoRunts && hasAbility(unit, 'ammoRunts') && !unit.ammoRuntsUsed
  for (const g of byKey.values()) {
    const notes: string[] = []
    let hitMod = 0
    if ((g.profile.keywords.heavy || bonus.imp === 'protector') && !engaged && unit.movedDistance <= 3 + EPS) { notes.push(g.profile.keywords.heavy ? 'Heavy +1' : 'Protector: Heavy +1'); hitMod++ }
    if (bolter) { notes.push(tr('Bolter Discipline +1')); hitMod++ }
    if (runts) { notes.push(tr('Ammo Runts +1')); hitMod++ }
    if (engaged && mv && !g.profile.keywords.closeQuarters) { notes.push(tr('vehicle in engagement range −1')); hitMod-- }
    if (isDamaged(unit)) { notes.push(tr('damaged −1')); hitMod-- }
    if (guided(s, unit, target)) { notes.push('Guide +1'); hitMod++ }
    if (psychicGuidance(s, unit)) { notes.push('Psychic Guidance +1'); hitMod++ }
    if (hasBuff(target, 'lightningFastReactions')) { notes.push(tr('Lightning-fast Reactions −1')); hitMod-- }
    const det = detachmentAttack(s, unit, target)
    if (det.hitMod) { notes.push(...det.hitNotes); hitMod += det.hitMod }
    if (det.sustained && !(g.sustainedHits ?? g.profile.keywords.sustainedHits)) g.sustainedHits = 1
    g.notes.push(...det.notes)
    // Swift Demise (Windriders): re-roll hit rolls of 1; any failed hit if the target is the closest eligible one
    let rerollHits: AttackContext['rerollHits'] = bonus.rerollHits
    if (hasAbility(unit, 'swiftDemise')) rerollHits = isClosestTarget(s, unit, target) ? 'all' : 'ones'
    if (bonus.rerollHits) g.notes.push(bonus.rerollHits === 'all' ? tr('Breaching Command: re-roll hits') : tr('Breaching Command: re-roll 1s'))
    // Ignores Cover (weapon keyword or Omnispex) cancels the cover bonus; Protector improves BS by 1
    if (alphaWarrior(s, unit) && !(g.profile.keywords.sustainedHits ?? 0)) {
      g.profile = { ...g.profile, keywords: { ...g.profile.keywords, sustainedHits: 1 } }
      g.notes.push('Alpha Warrior: Sustained Hits 1')
    }
    const exposed = target.drivenFromCover === unit.owner
    const storm = hasBuff(unit, 'stormOfDevastation')
    const ignores = g.profile.keywords.ignoresCover || omnispex || exposed || storm
    if (plan.cover && ignores) g.notes.push(exposed && !g.profile.keywords.ignoresCover && !omnispex && !storm ? tr('Driven from Cover: no cover') : storm && !g.profile.keywords.ignoresCover && !omnispex ? tr('Devastating Storm: no cover') : tr('ignores cover'))
    const dosage = hasBuff(unit, 'lethalDosage')
    if (dosage) g.notes.push(tr('Deadly Dose: Lethal Hits'))
    const tyrantReroll: AttackContext['rerollHits'] = g.notes.includes(TYRANT_ALL) ? 'all' : g.notes.includes(TYRANT_ONES) ? 'ones' : undefined
    if (tyrantReroll && rerollHits !== 'all') rerollHits = tyrantReroll
    if (bonus.betterAp) { g.profile = { ...g.profile, ap: g.profile.ap - 1 }; g.notes.push('Conqueror: AP +1') }
    if (hasBuff(target, 'armourOfContempt') && g.profile.ap < 0) { g.profile = { ...g.profile, ap: g.profile.ap + 1 }; g.notes.push(tr('Armour of Contempt: AP worse by 1')) }
    if (bonus.galvanic) g.notes.push('Galvanic Field: Lethal Hits')
    const protector = bonus.imp === 'protector'
    g.ctx = {
      hitMod,
      hitModNotes: notes,
      skillWorsen: (plan.cover && !ignores ? 1 : 0) - (protector ? 1 : 0),
      ...(protector ? { skillNote: tr('Protector: BS 1 better') } : {}),
      lethalHits: lethalVs(g.profile, unit, target) || onslaught || bonus.galvanic || dosage || det.lethal,
      ...(det.critPrecision ? { critPrecision: true } : {}),
      invulnOverride: rangedInvuln(s, target),
      ...(g.notes.includes(BLITZ_CRIT) ? { critHitOn: 5 } : {}),
      ...(g.profile.keywords.precision ? { precision: true } : {}),
      ...(rerollHits ? { rerollHits } : {}),
      ...eradication(s, unit, target, g.notes),
      ...defenceMods(s, g.profile, target),
    }
    if (onslaught && !g.notes.includes('Onslaught')) g.notes.push('Onslaught: Assault + Lethal Hits')
    plan.groups.push(g)
  }
  if (opts.snap)
    for (const g of plan.groups) {
      const { rerollHits: _reroll, critHitOn: _crit, ...rest } = g.ctx
      g.ctx = { ...rest, hitMod: 0, hitModNotes: [], skillWorsen: 6, snap: true }
      g.notes.push(tr('Overwatch fire: hits only on a “6”'))
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
  // Alpha Warrior (Winged Prime): Sustained Hits 1 for the Prime and the Tyranid Warriors it leads
  if (alphaWarrior(s, unit) && !(p.keywords.sustainedHits ?? 0)) {
    p = { ...p, keywords: { ...p.keywords, sustainedHits: 1 } }
    notes.push('Alpha Warrior: Sustained Hits 1')
  }
  // Finest Hour (Captain): +3 A and Devastating Wounds for this fight
  if (unit.finestHour) {
    p = { ...p, attacks: p.attacks + 3, keywords: { ...p.keywords, devastatingWounds: true } }
    notes.push('Finest Hour +3 A, Devastating Wounds')
  }
  // Might Is Right (Warboss): +3 A and +2 S after charging
  if (hasAbility(unit, 'mightIsRight') && unit.charged) {
    p = { ...p, attacks: p.attacks + 3, s: p.s + 2 }
    notes.push('Might Is Right +3 A, +2 S')
  }
  // Protocol of the Hungry Void: +1 S, and +1 AP when a CHARACTER leads the unit
  if (hasBuff(unit, 'hungryVoid')) {
    const led = isLed(s, unit)
    p = { ...p, s: p.s + 1, ap: led ? p.ap - 1 : p.ap }
    notes.push(led ? tr('Hungry Void +1 S, +1 AP') : tr('Hungry Void +1 S'))
  }
  if (hasBuff(unit, 'hitEmHarder')) notes.push(tr('Hit ’Em Harder!: Lethal Hits'))
  if (hasBuff(unit, 'adrenalSurge')) notes.push(tr('Adrenal Surge: critical on 5+'))
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
  if (psychicGuidance(s, unit)) { hitMod++; hitModNotes.push('Psychic Guidance +1') }
  if (isDamaged(unit)) { hitMod--; hitModNotes.push(tr('damaged −1')) }
  // Bladeguard: once per turn, when selected to fight, +1 to melee hit rolls (a unit fights once per turn here)
  if (hasAbility(unit, 'bladeguard')) { hitMod++; hitModNotes.push('Bladeguard +1') }
  // Doctrina Imperatives: Conqueror improves WS and (near BATTLELINE) AP; Protector of the target subtracts 1 from melee hit rolls
  const bonus = attackerBonuses(s, unit)
  if (bonus.imp === 'conqueror') { skillWorsen--; skillNote = tr('Conqueror: WS 1 better'); notes.push('Conqueror: WS +1') }
  if (bonus.betterAp) { p = { ...p, ap: p.ap - 1 }; notes.push('Conqueror: AP +1') }
  if (imperativeOf(s, target) === 'protector' && battlelineSupport(s, target)) { hitMod--; hitModNotes.push(tr('Target’s Protector −1')) }
  if (hasBuff(target, 'lightningFastReactions')) { hitMod--; hitModNotes.push(tr('Lightning-fast Reactions −1')) }
  const det = detachmentAttack(s, unit, target)
  if (det.hitMod) { hitMod += det.hitMod; hitModNotes.push(...det.hitNotes) }
  // Get Stuck In (War Horde): Orks' melee attacks have Sustained Hits 1; Swarming Instincts gives the same
  const stuckIn = datasheetOf(unit).faction === 'orks' && detachmentOn(s, unit.owner)
  if ((stuckIn || det.sustained) && !(p.keywords.sustainedHits ?? 0)) {
    p = { ...p, keywords: { ...p.keywords, sustainedHits: 1 } }
    if (stuckIn) notes.push(tr('Get Stuck In: Sustained Hits 1'))
  }
  notes.push(...det.notes)
  if (hasBuff(target, 'armourOfContempt') && p.ap < 0) { p = { ...p, ap: p.ap + 1 }; notes.push(tr('Armour of Contempt: AP worse by 1')) }
  // Data-spike: the unit's melee skill is worsened by 1 until the end of the Fight phase
  if (unit.spiked) { skillWorsen++; notes.push(tr('Data-spike: WS 1 worse')) }
  if (bonus.rerollHits) notes.push(bonus.rerollHits === 'all' ? tr('Breaching Command: re-roll hits') : tr('Breaching Command: re-roll 1s'))
  if (bonus.galvanic) notes.push('Galvanic Field: Lethal Hits')
  // Whirling Onslaught (Skorpekh Destroyers): re-roll hit rolls of 1, or any hit roll after a charge
  const rerollHits: AttackContext['rerollHits'] = hasAbility(unit, 'whirlingOnslaught') ? (unit.charged ? 'all' : 'ones') : bonus.rerollHits
  if (rerollHits) notes.push(rerollHits === 'all' ? tr('Whirling Onslaught: re-roll hits') : tr('Whirling Onslaught: re-roll 1s'))
  const ctx: AttackContext = {
    hitMod, hitModNotes, skillWorsen,
    ...(skillNote ? { skillNote } : {}),
    lethalHits: lethalVs(p, unit, target) || (hasAbility(unit, 'tideOfMuscle') && unit.charged) || bonus.galvanic || hasBuff(unit, 'hitEmHarder') || det.lethal,
    ...(det.critPrecision ? { critPrecision: true } : {}),
    invulnOverride: invulnOverrideOf(s, target),
    ...(hasBuff(unit, 'adrenalSurge') ? { critHitOn: 5 } : {}),
    ...(p.keywords.precision || hasBuff(unit, 'epicChallenge') ? { precision: true } : {}),
    ...(rerollHits ? { rerollHits } : {}),
    ...eradication(s, unit, target, notes),
    ...defenceMods(s, p, target),
  }
  return { profile: p, ctx, notes }
}

/** `models`: who swings (default: the unit's living models; the fallen of A Worthy Death and its cousins otherwise). */
export function meleePlan(s: GameState, unit: UnitState, target: UnitState, models: ModelState[] = alive(unit)) {
  const groups: (AttackGroup & { ctx: AttackContext })[] = []
  const byKey = new Map<string, AttackGroup & { ctx: AttackContext }>()
  for (const m of models) {
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
  if (s.winner) return fail(tr('The battle is over.'))
  const who = actor(s)
  // the Tyranids choose their Hyper-adaptation before the battle starts
  if (hyperPending(s)) {
    if (cmd.type !== 'hyperAdaptation') return fail(tr('The Tyranids choose a hyper-adaptation for the whole battle (detachment rule): the turn does not start until then.'))
    return HYPER_ADAPTATIONS.includes(cmd.choice) ? OK : fail(tr('Unknown hyper-adaptation.'))
  }
  if (cmd.type === 'hyperAdaptation') return fail(tr('The hyper-adaptation is chosen once, at the start of the battle.'))
  // an attack paused for a Command Re-roll: only the answer
  if (s.pendingReroll)
    return cmd.type === 'rerollChoice' ? OK : fail(tr('The attack is waiting for the decision of side “{item}”: re-roll the die or not.', { item: FACTION_NAME[s.pendingReroll.player] }))
  if (cmd.type === 'rerollChoice') return fail(tr('There is nothing to re-roll right now.'))
  // a unit arriving from reserves: in its own Movement phase, or Rapid Ingress in the reaction window before shooting
  if (cmd.type === 'arrive') {
    const u = s.reserves?.find((x) => x.id === cmd.unitId)
    if (!u) return fail(tr('This unit is not in Reserves.'))
    if (!cmd.rapid && u.owner !== who) return fail(tr('{item} is making the decision now.', { item: FACTION_NAME[who] }))
    const p = arrivalProblem(s, u, cmd.positions, !!cmd.rapid)
    return p ? fail(p) : OK
  }
  // a reaction window: only the reacting player's reactions for this window, or passing
  if (s.reaction) {
    if (cmd.type === 'passReaction') return OK
    if (cmd.type !== 'stratagem' || STRATAGEMS[cmd.id]?.window !== s.reaction.window)
      return fail(tr('The turn is waiting for the answer of side “{item}”: a reaction or a pass.', { item: FACTION_NAME[s.reaction.player] }))
  } else if (cmd.type === 'passReaction') return fail(tr('There is no reaction window now.'))
  if (s.pendingCharge && cmd.type !== 'chargeMove' && cmd.type !== 'skipCharge' && !(cmd.type === 'stratagem' && cmd.id === 'commandReroll'))
    return fail(tr('First finish the declared charge: choose targets or give up the move.'))

  if (cmd.type === 'endPhase') {
    if (s.phase === 'fight' && s.fight) return fail(tr('There are still units in the Fight phase that must fight.'))
    return OK
  }
  if (cmd.type === 'callWaaagh') {
    if (s.activePlayer !== 'orks') return fail(tr('Waaagh! can only be called by the Ork player on their own turn.'))
    if (s.phase !== 'command') return fail(tr('The “Battle Cry” is called in the Command phase.'))
    if (s.players.orks.waaaghUsed) return fail(tr('Waaagh! has already been called in this battle (once per battle).'))
    return OK
  }
  if (cmd.type === 'callShadow') {
    const me = s.activePlayer
    if (s.phase !== 'command') return fail(tr('“Shadow in the Warp” is used in the Command phase.'))
    if (s.players[me].shadowUsed === undefined) return fail(tr('Shadow in the Warp is a Tyranid army rule.'))
    if (s.players[me].shadowUsed) return fail(tr('Shadow in the Warp has already been used in this battle (once per battle).'))
    if (!unitsOf(s, me).some((u) => hasAbility(u, 'shadowInTheWarp'))) return fail(tr('There is no unit with the “Shadow in the Warp” rule on the field.'))
    return OK
  }

  if (cmd.type === 'doctrine') {
    if (who !== 'marines') return fail(tr('Combat Doctrines are a Space Marines army rule.'))
    if (s.phase !== 'command') return fail(tr('A Combat Doctrine is chosen in the Command phase.'))
    const p = s.players.marines
    if (p.doctrine) return fail(tr('A doctrine has already been chosen this turn.'))
    if (!DOCTRINES.includes(cmd.doctrine)) return fail(tr('Unknown doctrine.'))
    if (!doctrineLeft(p.doctrinesUsed ?? [], cmd.doctrine, detachmentOn(s, 'marines') ? undefined : 0))
      return fail(detachmentOn(s, 'marines')
        ? tr('“{name}” can no longer be chosen: each doctrine is once per battle, and one of them once more (Codex Discipline).', { name: DOCTRINE_NAME[cmd.doctrine] })
        : tr('“{name}” can no longer be chosen: each doctrine is once per battle.', { name: DOCTRINE_NAME[cmd.doctrine] }))
    return OK
  }

  if (cmd.type === 'secondary') {
    const p = secondaryProblem(s, who, cmd.op, cmd.card)
    return p ? fail(p) : OK
  }

  if (cmd.type === 'imperative') {
    if (s.phase !== 'command') return fail(tr('The Imperative (Doctrina Imperative) is chosen in the Command phase.'))
    if (s.players[who].imperative === undefined) return fail(tr('Doctrina Imperatives are an Adeptus Mechanicus army rule.'))
    if (s.players[who].imperative !== null) return fail(tr('An Imperative has already been chosen this turn.'))
    if (cmd.imperative !== 'protector' && cmd.imperative !== 'conqueror') return fail(tr('Unknown Imperative.'))
    return OK
  }

  const unit = findUnit(s, cmd.unitId)
  if (!unit || isDestroyed(unit)) return fail(tr('The unit was not found or is destroyed.'))
  if (unit.owner !== who) return fail(tr('{item} is making the decision now.', { item: FACTION_NAME[who] }))

  switch (cmd.type) {
    case 'stratagem':
      return stratagemProblem(s, unit, cmd)
    case 'declareAdvance':
    case 'move': {
      if (s.phase !== 'movement') return fail(tr('You can only move in the Movement phase.'))
      if (unit.move !== 'none') return fail(tr('The unit has already moved in this phase.'))
      const engaged = isEngaged(s, unit)
      if (cmd.type === 'move' && cmd.fly && !isFlyer(unit)) return fail(tr('Only models with the FLY keyword can “Take to the Skies”.'))
      if (cmd.type === 'move' && cmd.swift) {
        if (datasheetOf(unit).faction !== 'aeldari') return fail(tr('Swift as the Wind is an Aeldari Battle Focus manoeuvre.'))
        if ((s.players[unit.owner].focus ?? 0) <= 0) return fail(tr('There are no Battle Focus tokens this round.'))
      }
      if (cmd.type === 'declareAdvance') {
        if (engaged) return fail(tr('The unit is in engagement range of the enemy: it can only Fall Back or stay put.'))
        if (unit.advanceRoll !== null) return fail(tr('An Advance has already been declared.'))
        return OK
      }
      if (cmd.mode === 'fallBack' && !engaged) return fail(tr('Fall Back is only possible for a unit in engagement range of the enemy.'))
      if (cmd.mode !== 'fallBack' && engaged) return fail(tr('The unit is in engagement range of the enemy: a normal move is impossible, only Fall Back.'))
      if (cmd.mode === 'advance' && unit.advanceRoll === null) return fail(tr('First declare an Advance and roll a D6.'))
      if (cmd.mode !== 'advance' && unit.advanceRoll !== null) return fail(tr('An Advance has already been declared — move in Advance mode.'))
      const m = Math.min(...alive(unit).map((x) => profileOf(x).m)) + (hasBuff(unit, 'fungusFuelInjection') ? FUNGUS_BONUS : 0)
      const max = (cmd.mode === 'advance' ? m + (unit.advanceRoll ?? 0) : m) + (cmd.swift ? swiftBonusOf(s, unit.owner) : 0) - (cmd.fly ? FLY_PENALTY : 0)
      const p = moveProblem(s, unit, cmd.positions, max, cmd.mode, [], !!cmd.fly)
      return p ? fail(p) : OK
    }
    case 'rerollAdvance':
      if (unit.advanceRoll === null || unit.move !== 'none') return fail(tr('There is no Advance roll to re-roll.'))
      if (!hasAbility(unit, 'waaagh') && !hasAbility(unit, 'superlativeStrategist')) return fail(tr('Only Waaagh! and Superlative Strategist allow re-rolling an Advance.'))
      if (unit.advanceRerolled) return fail(tr('A die cannot be re-rolled more than once.'))
      return OK
    case 'startAction': {
      const p = actionProblem(s, unit, cmd.objectiveId)
      return p ? fail(p) : OK
    }
    case 'shoot': {
      if (s.phase !== 'shooting') return fail(tr('You can only shoot in the Shooting phase.'))
      if (unit.action) return fail(tr('The unit is performing a mission action and does not shoot this turn.'))
      if (unit.shot) return fail(tr('The unit has already shot in this phase.'))
      if (unit.move === 'fallBack' && !canActAfterFallBack(s, unit) && !hasAbility(unit, 'warConstruct') && !hasAbility(unit, 'elevatedStrider')) return fail(tr('The unit fell back (Fall Back) this turn and cannot shoot.'))
      const target = findUnit(s, cmd.targetId)
      if (!target || isDestroyed(target) || target.owner === unit.owner) return fail(tr('Invalid target.'))
      const plan = shootPlan(s, unit, target, cmd)
      return plan.problem ? fail(plan.problem) : OK
    }
    case 'declareCharge': {
      if (s.phase !== 'charge') return fail(tr('A charge is declared in the Charge phase.'))
      if (unit.chargeDeclared) return fail(tr('The unit has already declared a charge in this phase.'))
      if (unit.action) return fail(tr('The unit is performing a mission action and cannot charge this turn.'))
      if (isEngaged(s, unit)) return fail(tr('The unit is already in engagement range of the enemy.'))
      if (unit.move === 'fallBack' && !canActAfterFallBack(s, unit)) return fail(tr('The unit fell back (Fall Back) this turn and cannot charge.'))
      if (unit.move === 'advance' && !canChargeAfterAdvance(s, unit)) return fail(tr('The unit Advanced this turn and cannot charge.'))
      const near = enemiesOf(s, unit).filter((e) => withinRange(unitDistance(unit, e), CHARGE_RANGE))
      if (near.length === 0) {
        const d = Math.min(...enemiesOf(s, unit).map((e) => unitDistance(unit, e)))
        return fail(tr('No enemies within {CHARGE_RANGE}" (nearest — {fmt}").', { CHARGE_RANGE, fmt: fmt(d) }))
      }
      return OK
    }
    case 'chargeMove':
    case 'skipCharge': {
      if (!s.pendingCharge || s.pendingCharge.unitId !== unit.id) return fail(tr('There is no declared charge for this unit.'))
      if (cmd.type === 'skipCharge') return OK
      if (cmd.targetIds.length === 0) return fail(tr('Choose at least one charge target.'))
      if (!cmd.targetIds.every((t) => s.pendingCharge!.targets.includes(t))) return fail(tr('The target is unavailable with this charge roll.'))
      const targets = cmd.targetIds.map((t) => findUnit(s, t)!)
      if (!planCharge(s, unit, targets, s.pendingCharge.roll))
        return fail(tr('Could not build a valid charge move (bases are in the way or coherency is broken).'))
      return OK
    }
    case 'divineWork': {
      if (!hasAbility(unit, 'defendDivineWork')) return fail(tr('This unit does not have the “Defend the Divine Work” ability.'))
      if (s.players[unit.owner].divineUsed) return fail(tr('Defend the Divine Work has already been used in this battle (once per battle).'))
      return OK
    }
    case 'engrammatic': {
      if (!hasAbility(unit, 'engrammaticLogic')) return fail(tr('This unit does not have Engrammatic Logic.'))
      if (unit.engrammaticUsed) return fail(tr('Engrammatic Logic has already been used in this battle (once per battle).'))
      const target = findUnit(s, cmd.targetId)
      if (!target || isDestroyed(target) || target.owner !== unit.owner) return fail(tr('The target is a friendly unit.'))
      if (!target.battleShocked) return fail(tr('This unit is not Battle-shocked.'))
      if (target.id !== unit.id && unitDistance(unit, target) > ENGRAMMATIC_RANGE + 1e-6) return fail(tr('The unit is farther than {ENGRAMMATIC_RANGE}″.', { ENGRAMMATIC_RANGE }))
      return OK
    }
    case 'grenadePack': {
      if (!hasAbility(unit, 'grenadePack')) return fail(tr('This unit has no grenade flyover.'))
      if (s.phase !== 'movement' || unit.move === 'none') return fail(tr('The grenade flyover is used after the unit’s move in the Movement phase.'))
      if (unit.grenadePackUsed) return fail(tr('The grenade flyover has already been used this turn (once per turn).'))
      const target = findUnit(s, cmd.targetId)
      if (!target || isDestroyed(target) || target.owner === unit.owner) return fail(tr('Invalid target for the grenade flyover.'))
      if (unitDistance(unit, target) > GRENADE_PACK_RANGE + 1e-6) return fail(tr('Grenade flyover: the target is farther than {GRENADE_PACK_RANGE}″.', { GRENADE_PACK_RANGE }))
      if (!alive(unit).some((m) => seesAny(s, m, target))) return fail(tr('Grenade flyover: the target is not visible.'))
      return OK
    }
    case 'wraithForm': {
      if (!hasAbility(unit, 'wraithForm')) return fail(tr('This unit does not have Wraith Form.'))
      if (s.phase !== 'movement' || unit.move !== 'normal') return fail(tr('Wraith Form is used right after a normal move.'))
      if (!unit.wraithTargets?.includes(cmd.targetId)) return fail(tr('The unit did not fly through this target in its last move.'))
      return OK
    }
    case 'bombSquig': {
      if (!hasAbility(unit, 'bombSquig')) return fail(tr('This unit has no bomb squig.'))
      if (unit.bombSquigUsed) return fail(tr('The bomb squig has already been detonated in this battle (once per battle).'))
      if (s.phase !== 'movement') return fail(tr('The bomb squig is released in the Movement phase.'))
      if (unit.move !== 'normal') return fail(tr('The bomb squig is released after the unit’s normal move (not after an Advance or Fall Back).'))
      const target = findUnit(s, cmd.targetId)
      if (!target || isDestroyed(target) || target.owner === unit.owner) return fail(tr('Invalid target for the bomb squig.'))
      if (unitDistance(unit, target) > BOMB_SQUIG_RANGE + 1e-6) return fail(tr('Bomb squig: the target is farther than {BOMB_SQUIG_RANGE}″.', { BOMB_SQUIG_RANGE }))
      if (!alive(unit).some((m) => seesAny(s, m, target))) return fail(tr('Bomb squig: the target is not visible.'))
      return OK
    }
    case 'guide': {
      if (s.phase !== 'movement') return fail(tr('Guide is used in the Movement phase.'))
      if (!hasAbility(unit, 'guide')) return fail(tr('This unit does not have the Guide ability.'))
      if (unit.guided) return fail(tr('Guide has already been used this turn.'))
      const target = findUnit(s, cmd.targetId)
      if (!target || isDestroyed(target) || target.owner === unit.owner) return fail(tr('Invalid target for Guide.'))
      if (unitDistance(unit, target) > GUIDE_RANGE + 1e-6) return fail(tr('Guide: the target is farther than {GUIDE_RANGE}″.', { GUIDE_RANGE }))
      if (!alive(unit).some((m) => seesAny(s, m, target))) return fail(tr('Guide: the target is not visible.'))
      return OK
    }
    case 'fight': {
      if (s.phase !== 'fight' || !s.fight) return fail(tr('It is not the Fight phase now.'))
      if (!fightCandidates(s, s.fight.selecting, s.fight.step).some((u) => u.id === unit.id))
        return fail(s.fight.step === 'first' ? tr('Units with Fights First fight first — for example those that charged.') : tr('This unit cannot fight (it has already fought or is not in engagement range).'))
      const target = findUnit(s, cmd.targetId)
      if (!target || !engagedUnits(s, unit).some((e) => e.id === target.id)) return fail(tr('The target must be in engagement range of the unit.'))
      if (cmd.finestHour && !hasAbility(unit, 'finestHour')) return fail(tr('This unit does not have the “Finest Hour” ability.'))
      if (cmd.finestHour && unit.finestHourUsed) return fail(tr('“Finest Hour” has already been used in this battle (once per battle).'))
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
      addLog(s, tr('{name}: no enemies in engagement range — nobody to fight.', { name: u.name }), 'standard')
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
    addLog(s, tr('All fights are finished. You can end the phase.'), 'beginner')
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
      addLog(s, tr('{name}: pile-in of up to {PILE_IN}" toward the nearest enemy.', { name: u.name, PILE_IN }), 'beginner')
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
        else addLog(s, tr('{name}: consolidates toward the enemy.', { name: u.name }), 'beginner')
      } else {
        const obj = s.objectives.find((o) => alive(u).some((m) => withinRange(dist(m.pos, o.pos) - radiusOf(m) - baseRadius(OBJECTIVE_MARKER_MM), CONSOLIDATE + 3)))
        if (obj && !unitNearObjective(u, obj)) {
          pos = planMove(s, u, () => ({ pos: obj.pos, radius: baseRadius(OBJECTIVE_MARKER_MM) }), CONSOLIDATE, 'consolidate')
          if (moveProblem(s, u, pos, CONSOLIDATE, 'consolidate')) pos = null
          else addLog(s, tr('{name}: consolidates toward the objective.', { name: u.name }), 'beginner')
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
    if (u.turnBuffs?.length) u.turnBuffs = []
    delete u.guided
    delete u.spiked
    delete u.drivenFromCover
    delete u.wraithTargets
    delete u.grenadePackUsed
    if (u.owner === s.activePlayer) delete u.warded
  }
}

/** Aeldari Battle Focus: tokens are refreshed at the start of every battle round. */
function refreshFocus(s: GameState) {
  // Martial Grace (Warhost): one more token every round
  for (const p of sidesOf(s)) if (s.players[p].focus !== undefined) s.players[p].focus = BATTLE_FOCUS_TOKENS + (detachmentOn(s, p) ? MARTIAL_GRACE_TOKENS : 0)
}

function enterPhase(s: GameState, phase: Phase, r: Roller) {
  s.phase = phase
  for (const p of sidesOf(s)) {
    s.players[p].stratagemsThisPhase = []
    s.players[p].stratagemUnitsThisPhase = []
    if (s.players[p].rapidIngressUsed) s.players[p].rapidIngressUsed = false
  }
  for (const u of s.units) {
    if (u.shockedThisPhase) u.shockedThisPhase = false
    if (u.phaseBuffs?.length) u.phaseBuffs = []
  }
  addLog(s, `— ${PHASE_NAME[phase]}: ${FACTION_NAME[s.activePlayer]} —`, 'minimal')
  if (phase === 'command') commandPhase(s, r)
  if (phase === 'fight') {
    selfDestruction(s, r)
    fightStartMechanicus(s, r)
    pileInAll(s)
    s.fight = { selecting: s.activePlayer, step: 'first' }
    advanceFight(s)
    if (!s.fight) addLog(s, tr('No units in engagement range — the Fight phase is skipped (you can end the phase).'), 'beginner')
  }
  const hints: Partial<Record<Phase, string>> = {
    command: tr('Both players get 1 CP; Battle-shock is checked; then objective points are scored.'),
    movement: tr('Choose a unit and move its models up to M. You cannot end the move closer than 2" to an enemy.'),
    shooting: tr('Choose a unit and a target. You need line of sight and weapon range.'),
    charge: tr('A unit within {CHARGE_RANGE}" of an enemy can declare a charge: a 2D6 roll sets the maximum distance.', { CHARGE_RANGE }),
    fight: tr('Units in engagement range fight. First — those that charged (Fights First).'),
  }
  if (hints[phase]) addLog(s, hints[phase]!, 'beginner')
}

/** Leadership roll: 2D6, or 3D6 for a TYRANIDS unit in Synapse Range (the total of all three dice, see docs). */
function leadershipRoll(s: GameState, u: UnitState, r: Roller, mod = 0) {
  const synapse = inSynapseRange(s, u)
  const dice = rollMany(r, synapse ? 3 : 2)
  const interference = neurostaticMod(s, u)
  const total = dice.reduce((a, b) => a + b, 0) + mod + interference
  const ld = psychicGuidance(s, u) ? Math.min(6, profileOf(alive(u)[0]).ld) : profileOf(alive(u)[0]).ld
  return { dice, total, ld, pass: total >= ld, label: `${synapse ? '3D6 (Synapse)' : '2D6'}${interference ? tr(' (interference {interference})', { interference }) : ''}` }
}

/** Chance that this unit fails its Battle-shock test (same dice and modifiers as `leadershipRoll`). */
export function shockFailChance(s: GameState, u: UnitState): number {
  const n = inSynapseRange(s, u) ? 3 : 2
  const mod = neurostaticMod(s, u)
  const ld = psychicGuidance(s, u) ? Math.min(6, profileOf(alive(u)[0]).ld) : profileOf(alive(u)[0]).ld
  let fails = 0
  for (let i = 0; i < 6 ** n; i++) {
    let sum = 0
    for (let k = 0, x = i; k < n; k++, x = Math.floor(x / 6)) sum += (x % 6) + 1
    if (sum + mod < ld) fails++
  }
  return fails / 6 ** n
}

function commandPhase(s: GameState, r: Roller) {
  // a combat doctrine lasts until the start of its player's next Command phase
  if (s.players[s.activePlayer].doctrine) s.players[s.activePlayer].doctrine = null
  if (s.activePlayer === 'adeptus_mechanicus' && s.round >= 2 && s.round <= 5 && detachmentOn(s, s.activePlayer)) radFallout(s, r)
  for (const p of sidesOf(s)) s.players[p].cp++
  if (s.players[s.activePlayer].guide !== undefined) s.players[s.activePlayer].guide = null
  if (s.players[s.activePlayer].imperative !== undefined) s.players[s.activePlayer].imperative = null
  addLog(s, tr('Both players get 1 Command Point (CP).'), 'beginner')
  secondaryCommandStart(s)
  s.shockPending = unitsOf(s, s.activePlayer).filter((u) => u.battleShocked || atHalfStrength(u)).map((u) => u.id)
  // Insane Bravery is used before the test: the player may answer first, then the tests are rolled
  if (!openReaction(s, 'beforeShockTests', 'command', s.activePlayer)) finishShockTests(s, r)
}

/** The Battle-shock tests still pending, then objectives and VP of the Command phase. */
function finishShockTests(s: GameState, r: Roller) {
  for (const id of s.shockPending ?? []) {
    const u = findUnit(s, id)!
    const { dice, total, ld, pass, label } = leadershipRoll(s, u, r)
    const was = u.battleShocked
    u.battleShocked = !pass
    if (!pass) u.shockedThisPhase = true
    pushDice(s, tr('Battle-shock: {name}', { name: u.name }), [{ label, target: `${ld}+`, dice: dice.map((v) => ({ value: v, success: pass })), note: tr('Total {total} vs Ld {ld}+', { total, ld }) }],
      pass ? tr('{name}: test passed{value}.', { name: u.name, value: was ? tr(' — Battle-shock removed') : '' }) : tr('{name}: failed — the unit is Battle-shocked (OC = 0, falling back is dangerous).', { name: u.name }))
    addLog(s, pass ? tr('{name} passes the Battle-shock test ({total} ≥ {ld}).', { name: u.name, total, ld }) : tr('{name} fails the Battle-shock test ({total} < {ld}) and becomes Battle-shocked.', { name: u.name, total, ld }), 'minimal')
  }
  s.shockPending = null
  updateObjectiveControl(s)
  // a mission scores at the end of the Command phase and of the turn (rules/missions.ts)
  if (s.mission) return
  if (s.round >= 2) {
    const held = s.objectives.filter((o) => o.controller === s.activePlayer).length
    if (held) {
      s.players[s.activePlayer].vp += held * VP_PER_OBJECTIVE
      addLog(s, tr('{item}: +{value} VP for holding objectives ({held}). [training rule]', { item: FACTION_NAME[s.activePlayer], value: held * VP_PER_OBJECTIVE, held }), 'minimal')
    } else addLog(s, tr('{item} controls no objectives — no points.', { item: FACTION_NAME[s.activePlayer] }), 'standard')
  } else addLog(s, tr('No objective points are scored in the first round. [training rule]'), 'beginner')
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
    if (removed) addLog(s, tr('{name}: {removed} model(s) removed at the end of the turn for breaking coherency.', { name: u.name, removed }), 'minimal')
  }
  for (const p of sidesOf(s)) if (s.players[p].riledTurns > 0) s.players[p].riledTurns--
  // Disruption Bombardment lasts until the end of the disrupted unit's owner's turn
  for (const u of s.units) if (u.owner === s.activePlayer) delete u.disrupted
  updateObjectiveControl(s)
  missionTurnEnd(s)
  secondaryTurnEnd(s)
  checkWinner(s)
  if (s.winner) return
  const second = other(s, s.firstPlayer)
  if (s.activePlayer === second) {
    expireReserves(s)
    if (s.round >= s.maxRounds) {
      missionBattleEnd(s)
      const [wa, wb] = sidesOf(s)
      const a = s.players[wa], b = s.players[wb]
      s.winner = a.vp > b.vp ? wa : b.vp > a.vp ? wb : 'draw'
      addLog(s, tr('The battle is over after {maxRounds} rounds. {value} ({vp}:{vp2})', { maxRounds: s.maxRounds, value: s.winner === 'draw' ? tr('Draw!') : tr('Victory: {item}!', { item: FACTION_NAME[s.winner] }), vp: a.vp, vp2: b.vp }), 'minimal')
      return
    }
    s.round++
    refreshFocus(s)
    addLog(s, tr('===== Round {round} =====', { round: s.round }), 'minimal')
  }
  s.activePlayer = other(s, s.activePlayer)
  resetTurnFlags(s)
  missionTurnStart(s)
  enterPhase(s, 'command', r)
}

const sumDist = (m: ModelState, all: ModelState[]) => all.reduce((acc, o) => acc + dist(m.pos, o.pos), 0)

function checkWinner(s: GameState) {
  if (s.winner) return
  enforceCrews(s)
  const [wa, wb] = sidesOf(s)
  const m = unitsOf(s, wa).length + reservesOf(s, wa).length, o = unitsOf(s, wb).length + reservesOf(s, wb).length
  if (m && o) return
  s.winner = m ? wa : o ? wb : 'draw'
  addLog(s, tr('The enemy army is destroyed. {value}', { value: s.winner === 'draw' ? tr('Draw!') : tr('Victory: {item}!', { item: FACTION_NAME[s.winner] }) }), 'minimal')
}

/** Crewed Platform (Guardian Defenders): platforms are destroyed with the last non-platform model of the unit. */
function enforceCrews(s: GameState) {
  for (const u of s.units) {
    if (!hasAbility(u, 'crewedPlatform') || isDestroyed(u)) continue
    if (alive(u).some((m) => !profileOf(m).platform)) continue
    for (const m of u.models) if (!m.destroyed) m.destroyed = true
    addLog(s, tr('{name}: the last Guardian died — the heavy weapon platforms are destroyed (Crewed Platform).', { name: u.name }), 'standard')
  }
}

/** Reanimation Protocols (Necrons): at the end of your Command phase each such unit heals D3 wounds (revives models). */
function reanimate(s: GameState, r: Roller) {
  for (const u of unitsOf(s, s.activePlayer)) {
    if (!hasAbility(u, 'reanimation')) continue
    if (!reanimationNeeded(u)) continue
    reanimateUnit(s, u, r)
  }
}

/** The unit has wounds to heal or models to bring back. */
const reanimationNeeded = (u: UnitState) => u.models.some((m) => (m.destroyed && !profileOf(m).character) || (!m.destroyed && m.wounds < profileOf(m).w))

/** Reanimation Protocols: heal D3 (+ `bonus`) wounds, bringing destroyed models back. */
function reanimateUnit(s: GameState, u: UnitState, r: Roller, bonus = 0, source = 'Reanimation Protocols') {
  let v = rollDie(r, 'D3')
  const dice = [{ value: v, success: true } as DiceEntry['steps'][number]['dice'][number]]
  // Their Number is Legion: re-roll the dice that determine how many wounds are reanimated (we re-roll a 1)
  if (hasAbility(u, 'legion') && v === 1) {
    const again = rollDie(r, 'D3')
    dice.push({ value: again, success: true, rerolledFrom: v })
    v = again
  }
  v += bonus
  const { healed, revived } = healUnit(s, u, v)
  pushDice(s, tr('Reanimation: {name}', { name: u.name }), [{ label: bonus ? `D3+${bonus}` : 'D3', target: '—', dice, note: tr('Healing {v} wounds: {healed} restored, {revived} models returned.', { v, healed, revived }) }],
    tr('{name}: {source} — {healed} wounds restored, {revived} models returned.', { name: u.name, source, healed, revived }))
  addLog(s, tr('{name}: {source} — healing {value} = {v}{value2}{value3}.', { name: u.name, source, value: bonus ? `D3+${bonus}` : 'D3', v, value2: healed ? tr(', wounds restored: {healed}', { healed }) : '', value3: revived ? tr(', models returned: {revived}', { revived }) : '' }), 'standard')
}

// ---------------------------------------------------------------- Rad-bombardment (Rad-Zone Corps)

const woundsOf = (u: UnitState) => alive(u).reduce((a, m) => a + m.wounds, 0)

/** Enemy units of the Adeptus Mechanicus with a model inside their own deployment zone. */
function radTargets(s: GameState): UnitState[] {
  const foe = other(s, 'adeptus_mechanicus')
  const zone = deploymentZone(s, foe)
  return unitsOf(s, foe).filter((u) => !isDestroyed(u) && alive(u).some((m) => pointInPolygon(m.pos, zone)))
}

/**
 * Bombardment, at the start of the first battle round: each such unit takes cover (battle-shocked; 5+: D3 mortal
 * wounds) or stands firm (3+: D3 mortal wounds). The owner's choice is made by the game: a unit that D3 mortal wounds
 * could wipe out (RAD_COVER_WOUNDS or fewer) takes cover, the others stand firm.
 */
function radBombardment(s: GameState, r: Roller) {
  if (!sidesOf(s).includes('adeptus_mechanicus') || !detachmentOn(s, 'adeptus_mechanicus')) return
  const targets = radTargets(s)
  addLog(s, tr('Rad-bombardment (Rad-Zone Corps): shelling of the enemy deployment zone — units under fire: {n}.', { n: targets.length }), 'minimal')
  for (const u of targets) {
    const cover = woundsOf(u) <= RAD_COVER_WOUNDS
    const v = r.d6()
    const hit = v >= (cover ? 5 : 3)
    if (cover) u.battleShocked = true
    const mw = hit ? rollDie(r, 'D3') : 0
    pushDice(s, tr('Rad-bombardment: {name}', { name: u.name }), [{ label: 'D6', target: cover ? '5+' : '3+', dice: [{ value: v, success: hit }], note: cover ? tr('The unit takes cover: Battle-shock, on a 5+ — D3 mortal wounds.') : tr('The unit stands firm: on a 3+ — D3 mortal wounds.') }],
      cover
        ? hit ? tr('{name}: takes cover (Battle-shock) — {mw} mortal wounds.', { name: u.name, mw }) : tr('{name}: takes cover (Battle-shock) — no losses.', { name: u.name })
        : hit ? tr('{name}: stands firm — {mw} mortal wounds.', { name: u.name, mw }) : tr('{name}: stands firm — no losses.', { name: u.name }))
    addLog(s, cover
      ? hit ? tr('{name}: takes cover — the unit is Battle-shocked, {mw} mortal wounds.', { name: u.name, mw }) : tr('{name}: takes cover — the unit is Battle-shocked, the shelling missed.', { name: u.name })
      : hit ? tr('{name}: stands firm, {mw} mortal wounds.', { name: u.name, mw }) : tr('{name}: stands firm, the shelling missed.', { name: u.name }), 'standard')
    if (mw) applyMortalWounds(s, u, mw, tr('rad-bombardment'))
    if (isDestroyed(u)) addLog(s, tr('Unit “{name}” is destroyed!', { name: u.name }), 'minimal')
  }
  checkWinner(s)
}

/** Fallout, at the start of the Mechanicus Command phase in rounds 2–5: 3+ — 1 mortal wound and a Battle-shock test. */
function radFallout(s: GameState, r: Roller) {
  const targets = radTargets(s)
  if (!targets.length) return
  addLog(s, tr('Fallout (Rad-Zone Corps): units in the enemy deployment zone — {n}.', { n: targets.length }), 'standard')
  for (const u of targets) {
    const v = r.d6()
    pushDice(s, tr('Fallout: {name}', { name: u.name }), [{ label: 'D6', target: '3+', dice: [{ value: v, success: v >= 3 }], note: tr('3+ — a mortal wound and a Battle-shock test') }],
      v >= 3 ? tr('{name}: a mortal wound and a Battle-shock test.', { name: u.name }) : tr('{name}: no effect.', { name: u.name }))
    if (v < 3) continue
    applyMortalWounds(s, u, 1, tr('fallout'))
    if (isDestroyed(u)) { addLog(s, tr('Unit “{name}” is destroyed!', { name: u.name }), 'minimal'); continue }
    const t = leadershipRoll(s, u, r)
    if (!t.pass) u.battleShocked = true
    pushDice(s, tr('Battle-shock: {name}', { name: u.name }), [{ label: t.label, target: `${t.ld}+`, dice: t.dice.map((x) => ({ value: x, success: t.pass })), note: tr('Total {total} vs Ld {ld}+', { total: t.total, ld: t.ld }) }],
      t.pass ? tr('{name}: test passed{value}.', { name: u.name, value: '' }) : tr('{name}: failed — the unit is Battle-shocked (OC = 0, falling back is dangerous).', { name: u.name }))
  }
  checkWinner(s)
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
    pushDice(s, tr('Self-destruction: {name}', { name: u.name }), [{ label: 'D6', target: '2+', dice: [{ value: raw, success: v >= 2 }], note: tr('{value}2–5: D3 mortal wounds, 6+: 3', { value: hasKeyword(target, 'VEHICLE') ? tr('+1 against vehicles; ') : '' }) }],
      mw ? tr('{name} → {name2}: {mw} mortal wounds.', { name: u.name, name2: target.name, mw }) : tr('{name}: the self-destruction did no harm.', { name: u.name }))
    addLog(s, tr('{name}: a model self-destructs next to “{name2}” — {mw} mortal wounds.', { name: u.name, name2: target.name, mw }), 'standard')
    if (mw) applyMortalWounds(s, target, mw, tr('scarab self-destruction'))
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
    pushDice(s, tr('Data-spike: {name} → {name2}', { name: u.name, name2: target.name }), [{ label: 'D6', target: '4+', dice: [{ value: v, success: hit }], note: hit ? tr('Success: D6 = {mw} mortal wounds; the WS of the target’s melee weapons is 1 worse until the end of the phase.', { mw }) : tr('Failure: nothing happens.') }],
      hit ? tr('{name}: Data-spike — “{name2}” takes {mw} mortal wounds and loses accuracy.', { name: u.name, name2: target.name, mw }) : tr('{name}: the Data-spike did not work.', { name: u.name }))
    addLog(s, tr('{name}: Data-spike against “{name2}” — {value}.', { name: u.name, name2: target.name, value: hit ? tr('{mw} mortal wounds, WS −1', { mw }) : tr('did not work') }), 'standard')
    if (mw) applyMortalWounds(s, target, mw, 'Data-spike')
  }
  for (const u of s.units) {
    if (isDestroyed(u) || !hasAbility(u, 'voicesInTheCode')) continue
    for (const e of engagedUnits(s, u)) {
      if (isDestroyed(e) || voiced.has(e.id)) continue
      voiced.add(e.id)
      const { dice, total, ld, pass, label } = leadershipRoll(s, e, r)
      if (!pass) e.battleShocked = true
      pushDice(s, tr('Voices in the Code: {name}', { name: e.name }), [{ label, target: `${ld}+`, dice: dice.map((x) => ({ value: x, success: pass })), note: tr('Total {total} vs Ld {ld}+', { total, ld }) }],
        pass ? tr('{name}: test passed.', { name: e.name }) : tr('{name}: failed — the unit is Battle-shocked (Voices in the Code).', { name: e.name }))
      addLog(s, tr('{name}: Voices in the Code — {value} ({total} vs {ld}+).', { name: e.name, value: pass ? tr('Battle-shock test passed') : tr('failed, Battle-shock'), total, ld }), 'standard')
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
        pushDice(s, `Deadly Demise: ${u.name}`, [{ label: 'D6', target: '6', dice: [{ value: v, success: false }], note: tr('A knocked-out vehicle explodes only on a 6.') }], tr('{name}: the wreck did not explode.', { name: u.name }))
        continue
      }
      const n = x === 'D3' ? rollDie(r, 'D3') : x
      const victims = s.units.filter((o) => !isDestroyed(o) && alive(o).some((om) => withinRange(modelDistance(m, om), 6)))
      pushDice(s, `Deadly Demise: ${u.name}`, [{ label: 'D6', target: '6', dice: [{ value: v, success: true }], note: tr('Explosion: {n} mortal wounds to each unit within 6″.', { n }) }], tr('{name} explodes: {value}.', { name: u.name, value: victims.map((o) => o.name).join(', ') || tr('nobody nearby') }))
      for (const o of victims) applyMortalWounds(s, o, n, tr('explosion of {name} (Deadly Demise)', { name: u.name }))
    }
  }
}

function hazard(s: GameState, u: UnitState, n: number, r: Roller, why: string) {
  if (n <= 0) return
  const dice = rollMany(r, n)
  // Rites of Thermal Appeasement (Hellblasters): +1 to Hazardous rolls, so only a 1 fails
  const failOn = hasAbility(u, 'thermalAppeasement') ? 1 : 2
  const failed = dice.filter((v) => v <= failOn).length
  pushDice(s, tr('Hazard: {name}', { name: u.name }), [{ label: 'Hazard', target: `${failOn + 1}+`, dice: dice.map((v) => ({ value: v, success: v > failOn })), note: tr('{why}: {value} = 1 mortal wound', { why, value: failOn === 1 ? '1 (Rites of Thermal Appeasement +1)' : '1–2' }) }],
    failed ? tr('{failed} failed — mortal wounds.', { failed }) : tr('All Hazard rolls passed.'))
  if (failed) applyMortalWounds(s, u, failed, why)
}

// ---------------------------------------------------------------- apply

export function apply(state: GameState, cmd: Command, r: Roller): GameState {
  const v = validate(state, cmd)
  if (!v.ok) throw new Error(v.reason)
  const s: GameState = structuredClone(state)
  // a charge roll can be re-rolled (Command Re-roll) only right after it was made
  if (!(cmd.type === 'stratagem' && cmd.id === 'commandReroll')) s.lastCharge = null

  switch (cmd.type) {
    case 'stratagem':
      applyStratagem(s, cmd, r)
      if (s.reaction && !s.winner && !reactionCommands(s).length) closeReaction(s, r)
      break
    case 'passReaction':
      addLog(s, tr('{item}: no reaction.', { item: FACTION_NAME[s.reaction!.player] }), 'beginner')
      closeReaction(s, r)
      break
    case 'endPhase': {
      updateObjectiveControl(s)
      if (s.phase === 'movement') {
        for (const u of s.units) if (u.advanceRoll !== null && u.move === 'none') u.move = 'advance'
        holdScoutedObjectives(s, s.activePlayer, 'thievinScavengers')
      }
      if (s.phase === 'command') {
        reanimate(s, r)
        holdScoutedObjectives(s, s.activePlayer)
        missionCommandEnd(s)
      }
      const i = PHASES.indexOf(s.phase)
      if (i === PHASES.length - 1) endTurn(s, r)
      else {
        const next = PHASES[i + 1]
        // the opponent may react at the end of the Movement phase and at the end of the Charge phase
        const window: ReactionWindow | null = s.phase === 'movement' ? 'beforeShooting' : s.phase === 'charge' ? 'afterCharges' : null
        if (!(window && openReaction(s, window, next))) enterPhase(s, next, r)
      }
      break
    }
    case 'secondary':
      applySecondary(s, s.activePlayer, cmd.op, cmd.card)
      break
    case 'arrive':
      arrive(s, cmd.unitId, cmd.positions, !!cmd.rapid)
      if (s.reaction && !reactionCommands(s).length) closeReaction(s, r)
      break
    case 'startAction': {
      const u = findUnit(s, cmd.unitId)!
      const id = PRIMARY[s.mission!.primary].action!
      u.action = { id, objectiveId: cmd.objectiveId }
      u.shot = true
      const n = s.objectives.findIndex((o) => o.id === cmd.objectiveId) + 1
      addLog(s, tr('{name} begins the action “{action}” at objective {obj}: the unit does not shoot or charge this turn; the action completes at the end of the turn if you keep the objective.', { name: u.name, action: MISSION_ACTION[id].name, obj: tr('O{value}', { value: n }) }), 'minimal')
      break
    }
    case 'callWaaagh': {
      s.players.orks.waaaghUsed = true
      s.players.orks.riledTurns = 2
      addLog(s, tr('WAAAGH! Battle Cry: until the end of the next turn the Orks are “enraged” — 5+ invulnerable save, all ranged weapons get Assault, they can charge after advancing.'), 'minimal')
      break
    }
    case 'callShadow': {
      const me = s.activePlayer
      s.players[me].shadowUsed = true
      const mine = unitsOf(s, me).filter((u) => hasKeyword(u, 'SYNAPSE'))
      addLog(s, tr('Shadow in the Warp: each enemy unit takes a Battle-shock test; within 6″ of a Synapse unit — with −1.'), 'minimal')
      for (const e of unitsOf(s, other(s, me))) {
        const mod = mine.some((x) => unitDistance(e, x) <= SYNAPSE_RANGE) ? -1 : 0
        const { dice, total, ld, pass } = leadershipRoll(s, e, r, mod)
        if (!pass) e.battleShocked = true
        pushDice(s, tr('Shadow in the Warp: {name}', { name: e.name }), [{ label: '2D6', target: `${ld}+`, dice: dice.map((v) => ({ value: v, success: pass })), note: tr('Total {total}{value} vs Ld {ld}+', { total, value: mod ? tr(' (−1 near Synapse)') : '', ld }) }],
          pass ? tr('{name}: test passed.', { name: e.name }) : tr('{name}: failed — the unit is Battle-shocked.', { name: e.name }))
      }
      break
    }
    case 'doctrine': {
      const p = s.players.marines
      p.doctrine = cmd.doctrine
      p.doctrinesUsed = [...(p.doctrinesUsed ?? []), cmd.doctrine]
      addLog(s, tr('Combat Doctrine “{name}”: until the next Command phase {text}.', { name: DOCTRINE_NAME[cmd.doctrine], text: DOCTRINE_TEXT[cmd.doctrine] }), 'minimal')
      break
    }
    case 'hyperAdaptation':
      s.players.tyranids.hyperAdaptation = cmd.choice
      addLog(s, tr('Tyranids: hyper-adaptation “{name}” for the whole battle — {text}.', { name: HYPER_NAME[cmd.choice], text: HYPER_TEXT[cmd.choice] }), 'minimal')
      break
    case 'imperative': {
      s.players[s.activePlayer].imperative = cmd.imperative
      addLog(s, cmd.imperative === 'protector'
        ? tr('Protector Imperative: Adeptus Mechanicus ranged weapons get Heavy and BS 1 better; battleline units are hard to hit in melee.')
        : tr('Conqueror Imperative: ranged weapons get Assault, melee WS 1 better; battleline units get AP +1.'), 'minimal')
      break
    }
    case 'divineWork': {
      const u = findUnit(s, cmd.unitId)!
      const led = ledUnitOf(s, u)
      s.players[u.owner].divineUsed = true
      u.warded = true
      if (led) led.warded = true
      addLog(s, tr('{name}: Defend the Divine Work — {value} 4+ invulnerable save until the start of your next turn.', { name: u.name, value: led ? tr('“{name}” and the Tech-Priest get', { name: led.name }) : tr('the Tech-Priest gets') }), 'minimal')
      break
    }
    case 'engrammatic': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      u.engrammaticUsed = true
      t.battleShocked = false
      addLog(s, tr('{name}: Engrammatic Logic — “{name2}” is no longer Battle-shocked.', { name: u.name, name2: t.name }), 'minimal')
      break
    }
    case 'grenadePack': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      u.grenadePackUsed = true
      const dice = rollMany(r, alive(u).length)
      const n = Math.min(6, dice.filter((v) => v >= 4).length)
      pushDice(s, tr('Grenade flyover: {name} → {name2}', { name: u.name, name2: t.name }), [{ label: tr('D6 per model'), target: '4+', dice: dice.map((v) => ({ value: v, success: v >= 4 })), note: tr('Each 4+ is 1 mortal wound (max 6): {n}.', { n }) }],
        n ? tr('{name} bombards “{name2}” with grenades: {n} mortal wounds.', { name: u.name, name2: t.name, n }) : tr('The grenades of “{name}” did no harm to “{name2}”.', { name: u.name, name2: t.name }))
      if (n) applyMortalWounds(s, t, n, tr('grenade flyover of “{name}”', { name: u.name }))
      if (isDestroyed(t)) addLog(s, tr('Unit “{name}” is destroyed!', { name: t.name }), 'minimal')
      checkWinner(s)
      break
    }
    case 'wraithForm': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      delete u.wraithTargets
      const dice = rollMany(r, alive(u).length)
      const n = dice.filter((v) => v >= 4).length
      pushDice(s, tr('Wraith Form: {name} → {name2}', { name: u.name, name2: t.name }), [{ label: tr('D6 per model'), target: '4+', dice: dice.map((v) => ({ value: v, success: v >= 4 })), note: tr('Each 4+ is 1 mortal wound: {n}.', { n }) }],
        n ? tr('{name} passes through “{name2}”: {n} mortal wounds.', { name: u.name, name2: t.name, n }) : tr('{name} passes through “{name2}” without harm.', { name: u.name, name2: t.name }))
      if (n) applyMortalWounds(s, t, n, tr('Wraith Form of “{name}”', { name: u.name }))
      if (isDestroyed(t)) addLog(s, tr('Unit “{name}” is destroyed!', { name: t.name }), 'minimal')
      checkWinner(s)
      break
    }
    case 'bombSquig': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      u.bombSquigUsed = true
      const v = r.d6()
      if (v < 3) {
        pushDice(s, tr('Bomb squig: {name}', { name: u.name }), [{ label: 'D6', target: '3+', dice: [{ value: v, success: false }], note: tr('On a 3+ the squig makes it and explodes.') }], tr('The squig “{name}” did not reach “{name2}”.', { name: u.name, name2: t.name }))
        addLog(s, tr('{name}: the bomb squig did not reach “{name2}” (rolled {v}).', { name: u.name, name2: t.name, v }), 'standard')
        break
      }
      const n = rollDie(r, 'D3')
      pushDice(s, tr('Bomb squig: {name}', { name: u.name }), [{ label: 'D6', target: '3+', dice: [{ value: v, success: true }], note: tr('Explosion: {n} mortal wounds.', { n }) }], tr('The bomb squig explodes next to “{name}”.', { name: t.name }))
      applyMortalWounds(s, t, n, tr('bomb squig “{name}”', { name: u.name }))
      break
    }
    case 'guide': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      s.players[u.owner].guide = t.id
      u.guided = true
      addLog(s, tr('{name}: Guide — friendly Aeldari models get +1 to hit against “{name2}” until the start of the next Command phase.', { name: u.name, name2: t.name }), 'standard')
      break
    }
    case 'declareAdvance':
    case 'rerollAdvance': {
      const u = findUnit(s, cmd.unitId)!
      const prev = u.advanceRoll
      const v2 = r.d6()
      u.advanceRoll = v2
      if (cmd.type === 'rerollAdvance') u.advanceRerolled = true
      pushDice(s, tr('Advance: {name}', { name: u.name }), [{ label: 'D6', target: '—', dice: [{ value: v2, success: true, rerolledFrom: prev ?? undefined }], note: prev ? tr('Re-roll ({value}): was {prev}', { value: hasAbility(u, 'waaagh') ? 'Waaagh!' : 'Superlative Strategist', prev }) : undefined }],
        tr('{name}: Advance of M + {v2}". After an Advance the unit cannot charge and shoots only with Assault weapons.', { name: u.name, v2 }))
      addLog(s, tr('{name} advances: D6 roll = {v2}.', { name: u.name, v2 }), 'minimal')
      break
    }
    case 'move': {
      const u = findUnit(s, cmd.unitId)!
      // Wraith Form: the enemy units some model passed over (its base swept across theirs) during this Normal move
      delete u.wraithTargets
      if (cmd.mode === 'normal' && hasAbility(u, 'wraithForm')) {
        const over = enemiesOf(s, u).filter((e) => alive(u).some((m) => {
          const to = cmd.positions[m.id]
          return !!to && alive(e).some((em) => sweptCircleHits(m.pos, to, radiusOf(m), em.pos, radiusOf(em)))
        }))
        if (over.length) u.wraithTargets = over.map((e) => e.id)
      }
      movedTo(u, cmd.positions)
      u.move = cmd.mode
      if (cmd.swift) {
        s.players[u.owner].focus = (s.players[u.owner].focus ?? 1) - 1
        addLog(s, tr('{name}: Swift as the Wind — +{SWIFT_BONUS}″ to movement (Battle Focus token, {focus} left).', { name: u.name, SWIFT_BONUS: swiftBonusOf(s, u.owner), focus: s.players[u.owner].focus }), 'standard')
      }
      if (cmd.fly) addLog(s, tr('{name} flies (take to the skies): −{FLY_PENALTY}″, ignores models and terrain.', { name: u.name, FLY_PENALTY }), 'standard')
      const label = { normal: tr('normal move'), advance: tr('Advance'), fallBack: tr('Fall Back') }[cmd.mode]
      addLog(s, tr('{name}: {label}, up to {fmt}".', { name: u.name, label, fmt: fmt(u.movedDistance) }), 'standard')
      if (cmd.mode === 'fallBack') {
        addLog(s, tr('A unit that fell back cannot shoot or charge this turn.'), 'beginner')
        if (u.battleShocked) {
          hazard(s, u, alive(u).length, r, tr('Desperate Escape'))
          if (!isDestroyed(u)) {
            const { dice, ld, pass, label } = leadershipRoll(s, u, r)
            u.battleShocked = !pass
            pushDice(s, tr('Battle-shock after escaping: {name}', { name: u.name }), [{ label, target: `${ld}+`, dice: dice.map((x) => ({ value: x, success: pass })) }], pass ? tr('Passed.') : tr('Failed — the unit stays Battle-shocked.'))
          }
        }
      }
      break
    }
    case 'shoot':
      if (!openTargetReaction(s, cmd)) attack(s, cmd, r)
      break
    case 'rerollChoice': {
      const pr = s.pendingReroll!
      s.pendingReroll = null
      if (!cmd.reroll) addLog(s, tr('{item}: no re-roll.', { item: FACTION_NAME[pr.player] }), 'beginner')
      attack(s, pr.cmd, r, pr.dice, { ...pr.decided, [pr.dice.length - 1]: cmd.reroll })
      break
    }
    case 'declareCharge': {
      const u = findUnit(s, cmd.unitId)!
      u.chargeDeclared = true
      const dice = rollMany(r, 2)
      const roll = Math.max(0, dice[0] + dice[1] - (u.disrupted ? DISRUPTION : 0))
      const targets = chargeTargetsFor(s, u, roll)
      pushDice(s, tr('Charge roll: {name}', { name: u.name }), [{ label: '2D6', target: '—', dice: dice.map((x) => ({ value: x, success: targets.length > 0 })), note: tr('Maximum charge distance {roll}"{value}', { roll, value: u.disrupted ? ` (−${DISRUPTION}: Disruption Bombardment)` : '' }) }],
        targets.length ? tr('A roll of {roll}": available targets — {list}.', { roll, list: targets.map((x) => x.name).join(', ') }) : tr('A roll of {roll}" is not enough, the charge failed.', { roll }))
      s.lastCharge = { unitId: u.id, dice }
      if (targets.length) s.pendingCharge = { unitId: u.id, roll, dice, targets: targets.map((x) => x.id) }
      else {
        const d = Math.min(...enemiesOf(s, u).map((e) => unitDistance(u, e)))
        addLog(s, tr('{name}: the charge failed — rolled {roll}", but the nearest enemy is at {fmt}"{value}. The unit stays in place.', { name: u.name, roll, fmt: fmt(d), value: roll === 2 ? tr(' (a roll of 2 is never enough)') : '' }), 'minimal')
      }
      break
    }
    case 'skipCharge': {
      const u = findUnit(s, cmd.unitId)!
      s.pendingCharge = null
      addLog(s, tr('{name} gives up the charge move.', { name: u.name }), 'standard')
      break
    }
    case 'chargeMove': {
      const u = findUnit(s, cmd.unitId)!
      const targets = cmd.targetIds.map((id) => findUnit(s, id)!)
      const pos = planCharge(s, u, targets, s.pendingCharge!.roll)!
      // Line-breakers: +2 if the charge started within 6″ of friendly ADEPTUS MECHANICUS BATTLELINE (measured before moving)
      const lineSupport = hasAbility(u, 'lineBreakers') && s.units.some((x) => x.owner === u.owner && x.id !== u.id && !isDestroyed(x) && hasKeyword(x, 'BATTLELINE') && datasheetOf(x).faction === 'adeptus_mechanicus' && unitDistance(u, x) <= LINE_BREAKERS_SUPPORT + EPS)
      movedTo(u, pos)
      u.charged = true
      s.pendingCharge = null
      addLog(s, tr('{name} charges unit “{list}” and gets Fights First.', { name: u.name, list: targets.map((x) => x.name).join(', ') }), 'minimal')
      if (hasAbility(u, 'lineBreakers')) lineBreakers(s, u, targets, lineSupport, r)
      break
    }
    case 'fight':
      if (!openTargetReaction(s, cmd)) attack(s, cmd, r)
      break
  }
  enforceCrews(s)
  s.rng = r.state()
  return s
}

/** The Fight command: the unit fights the target, then the selection passes on. */
function resolveFight(s: GameState, cmd: Extract<Command, { type: 'fight' }>, r: Roller, reroll?: RerollHook) {
  const u = findUnit(s, cmd.unitId)!
  const t = findUnit(s, cmd.targetId)!
  const before = aliveIds(s)
  u.fought = true
  if (cmd.finestHour) {
    u.finestHourUsed = true
    u.finestHour = true
  }
  const groups = meleePlan(s, u, t)
  delete u.finestHour
  addLog(s, tr('{name} fights unit “{name2}”{value}.', { name: u.name, name2: t.name, value: cmd.finestHour ? tr(' — “Finest Hour”: +3 attacks, Devastating Wounds') : '' }), 'minimal')
  for (const g of groups) {
    if (isDestroyed(t)) break
    const res = resolveGroup(r, u.name, g, t, g.ctx, reroll)
    pushDice(s, tr('Fight: {name} → {name2}: {weaponName}{value}', { name: u.name, name2: t.name, weaponName: g.weaponName, value: g.notes.length ? ` [${g.notes.join(', ')}]` : '' }), res.steps, res.summary)
    addLog(s, res.summary, 'standard')
  }
  if (!groups.length) addLog(s, tr('{name}: no model is within engagement range ({ENGAGEMENT_RANGE}").', { name: u.name, ENGAGEMENT_RANGE }), 'standard')
  lastStand(s, u, t, before, r)
  deadlyDemise(s, before, r)
  if (isDestroyed(t)) addLog(s, tr('Unit “{name}” is destroyed!', { name: t.name }), 'minimal')
  checkWinner(s)
  s.fight!.selecting = other(s, s.fight!.selecting)
  advanceFight(s)
}

// ---------------------------------------------------------------- Command Re-roll in the middle of an attack

/** Expected damage a single re-roll must add (or prevent) before the game stops to offer it. */
export const REROLL_WORTH = 1.5
const REROLL_KIND: Record<RerollKind, string> = { attacks: tr('number of attacks'), hit: tr('hit'), wound: tr('wound|alt'), save: tr('save'), damage: tr('damage') }

class RerollPause {
  at: Omit<PendingReroll, 'cmd' | 'dice' | 'decided'>
  constructor(at: RerollPause['at']) {
    this.at = at
  }
}

/** Can this unit's player still use a Command Re-roll on it in this phase? */
function canCommandReroll(s: GameState, u: UnitState) {
  const p = s.players[u.owner]
  return !u.battleShocked && p.cp >= STRATAGEMS.commandReroll.cost && !usedThisPhase(s, u.owner, 'commandReroll') && !targetedThisPhase(s, u)
}

function spendCommandReroll(s: GameState, u: UnitState, kind: RerollKind, value: number) {
  const me = u.owner
  s.players[me].cp -= STRATAGEMS.commandReroll.cost
  ;(s.players[me].stratagemsThisPhase ??= []).push('commandReroll')
  ;(s.players[me].stratagemUnitsThisPhase ??= []).push(u.id)
  addLog(s, tr('{item}: Stratagem “Command Re-roll” — {name} re-rolls {item2} (rolled “{value}”), −{cost} CP.', { item: FACTION_NAME[me], name: u.name, item2: REROLL_KIND[kind], value, cost: STRATAGEMS.commandReroll.cost }), 'minimal')
}

function attackBody(s: GameState, cmd: PendingReroll['cmd'], r: Roller, reroll?: RerollHook) {
  if (cmd.type === 'shoot') resolveShooting(s, findUnit(s, cmd.unitId)!, findUnit(s, cmd.targetId)!, cmd, r, false, reroll)
  else resolveFight(s, cmd, r, reroll)
  // Armour of Contempt lasts until that enemy unit has attacked
  const t = findUnit(s, cmd.targetId)!
  if (t.phaseBuffs?.includes('armourOfContempt')) t.phaseBuffs = t.phaseBuffs.filter((x) => x !== 'armourOfContempt')
}

/** An attack, then the target's `afterAttacks` window when it lost models and survived (Protocol of the Undying Legions). */
function attack(s: GameState, cmd: PendingReroll['cmd'], r: Roller, prefix: number[] = [], decided: Record<number, boolean> = {}) {
  const before = alive(findUnit(s, cmd.targetId)!).length
  runAttack(s, cmd, r, prefix, decided)
  if (s.pendingReroll || s.winner) return
  const t = findUnit(s, cmd.targetId)!
  if (!isDestroyed(t) && alive(t).length < before) openReaction(s, 'afterAttacks', s.phase, t.owner, { unitId: t.id })
}

/** `onTargeted`: before any dice, the target's player may react to the attack (Armour of Contempt, Rapid Regeneration…). */
function openTargetReaction(s: GameState, cmd: PendingReroll['cmd']): boolean {
  const t = findUnit(s, cmd.targetId)!
  return openReaction(s, 'onTargeted', s.phase, t.owner, { unitId: t.id, attack: cmd })
}

/**
 * A Worthy Death, Orks Is Never Beaten, Death Frenzy: each model of the target destroyed by this attack (if its unit has
 * not fought this phase) rolls a D6; on 4+ (Orks: +1 when riled up) it fights the attacker before it is removed. On the
 * tabletop the Space Marine and Ork models fight together with their unit later in the phase; here all three strike right
 * after the enemy's attacks, as Death Frenzy does (see docs/stratagems.md).
 */
function lastStand(s: GameState, attacker: UnitState, t: UnitState, before: Set<string>, r: Roller) {
  const id = LAST_STAND.find((x) => hasBuff(t, x))
  if (!id || t.fought) return
  const fallen = t.models.filter((m) => m.destroyed && before.has(m.id))
  if (!fallen.length) return
  const info = STRATAGEMS[id]
  const bonus = id === 'orksNeverBeaten' && riled(s, t) ? 1 : 0
  const dice = fallen.map(() => r.d6())
  const saved = fallen.filter((_, i) => dice[i] + bonus >= 4)
  pushDice(s, `${info.name}: ${t.name}`, [{ label: 'D6', target: bonus ? '3+' : '4+', dice: dice.map((v) => ({ value: v, success: v + bonus >= 4 })), note: tr('Models killed: {length}; strike back before dying: {length2}{value}', { length: fallen.length, length2: saved.length, value: bonus ? ' (+1: WAAAGH!)' : '' }) }],
    saved.length ? tr('{name}: {length} fallen models strike back.', { name: t.name, length: saved.length }) : tr('{name}: the fallen did not manage to strike.', { name: t.name }))
  if (!saved.length || isDestroyed(attacker)) return
  const groups = meleePlan(s, t, attacker, saved)
  if (!groups.length) { addLog(s, tr('{name}: the fallen models were not in engagement range of “{name2}” — nobody to strike.', { name: t.name, name2: attacker.name }), 'standard'); return }
  addLog(s, tr('{name}: “{name2}” — {length} fallen models strike “{name3}” before dying.', { name: t.name, name2: info.name, length: saved.length, name3: attacker.name }), 'minimal')
  for (const g of groups) {
    if (isDestroyed(attacker)) break
    const res = resolveGroup(r, t.name, g, attacker, g.ctx)
    pushDice(s, `${info.name}: ${t.name} → ${attacker.name}: ${g.weaponName}${g.notes.length ? ` [${g.notes.join(', ')}]` : ''}`, res.steps, res.summary)
    addLog(s, res.summary, 'standard')
  }
  if (isDestroyed(attacker)) addLog(s, tr('Unit “{name}” is destroyed!', { name: attacker.name }), 'minimal')
}

/**
 * Resolve a shot or a fight. Right after a die worth a Command Re-roll (REROLL_WORTH) for a player who can still use
 * one, the attack stops: nothing is applied, the dice so far are kept in `pendingReroll`, and `rerollChoice` replays
 * them and goes on. The dice after the paused one are not rolled until then.
 */
function runAttack(s: GameState, cmd: PendingReroll['cmd'], r: Roller, prefix: number[] = [], decided: Record<number, boolean> = {}) {
  const possible = sidesOf(s).some((p) => s.players[p].cp >= STRATAGEMS.commandReroll.cost && !usedThisPhase(s, p, 'commandReroll'))
  if (!possible && !prefix.length) return attackBody(s, cmd, r)
  const dice: number[] = []
  const roller: Roller = { d6: () => { const v = dice.length < prefix.length ? prefix[dice.length] : r.d6(); dice.push(v); return v }, state: () => r.state() }
  const trial = structuredClone(s)
  const attacker = findUnit(trial, cmd.unitId)!
  const target = findUnit(trial, cmd.targetId)!
  const hook: RerollHook = (pt) => {
    const at = dice.length - 1
    const u = pt.side === 'attacker' ? attacker : target
    if (at in decided) {
      if (decided[at]) spendCommandReroll(trial, u, pt.kind, pt.value)
      return decided[at]
    }
    if (pt.gain < REROLL_WORTH || !canCommandReroll(trial, u)) return false
    throw new RerollPause({ player: u.owner, unitId: u.id, attackerId: attacker.id, targetId: target.id, kind: pt.kind, value: pt.value, gain: pt.gain, weapon: pt.weapon })
  }
  try {
    attackBody(trial, cmd, roller, hook)
  } catch (e) {
    if (!(e instanceof RerollPause)) throw e
    s.pendingReroll = { ...e.at, cmd, dice: [...dice], decided }
    return
  }
  for (const k of Object.keys(s) as (keyof GameState)[]) if (!(k in trial)) delete s[k]
  Object.assign(s, trial)
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
  pushDice(s, tr('Roll for the first turn'), [{ label: `${FACTION_NAME[west]} / ${FACTION_NAME[east]}`, target: '—', dice: rolls.map((v) => ({ value: v, success: true })) }], tr('{item} goes first.', { item: FACTION_NAME[s.firstPlayer] }))
  addLog(s, tr('===== Round 1 ===== {item} goes first.', { item: FACTION_NAME[s.firstPlayer] }), 'minimal')
  if (s.mission) addLog(s, tr('Primary mission (both sides): {name} ({nameEn}).', { name: PRIMARY[s.mission.primary].name, nameEn: PRIMARY[s.mission.primary].nameEn }), 'minimal')
  // the start of the first battle round: the detachment rules that act then
  if (sidesOf(s).includes('tyranids') && detachmentOn(s, 'tyranids')) s.players.tyranids.hyperAdaptation = null
  radBombardment(s, r)
  // the first turn's kills are counted from here (Rad-bombardment comes before the battle's first turn)
  missionTurnStart(s)
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
    add('advance', tr('Declare an Advance: M + D6'), { type: 'declareAdvance', unitId })
    add('reroll', tr('Re-roll the Advance (Waaagh!)'), { type: 'rerollAdvance', unitId })
    if (hasAbility(u, 'guide'))
      for (const e of enemiesOf(s, u)) add(`guide:${e.id}`, tr('Guide: mark “{name}”', { name: e.name }), { type: 'guide', unitId, targetId: e.id })
    if (hasAbility(u, 'grenadePack') && !u.grenadePackUsed && u.move !== 'none')
      for (const e of enemiesOf(s, u)) add(`grenade:${e.id}`, tr('💥 Grenade flyover on “{name}” (D6 per model, 4+ is a mortal wound)', { name: e.name }), { type: 'grenadePack', unitId, targetId: e.id })
    for (const id of u.wraithTargets ?? []) add(`wraith:${id}`, tr('👻 Wraith Form through “{value}” (D6 per model, 4+ is a mortal wound)', { value: findUnit(s, id)?.name ?? id }), { type: 'wraithForm', unitId, targetId: id })
    if (hasAbility(u, 'bombSquig') && !u.bombSquigUsed && u.move === 'normal')
      for (const e of enemiesOf(s, u)) add(`squig:${e.id}`, tr('💣 Bomb squig at “{name}” (3+: D3 mortal wounds)', { name: e.name }), { type: 'bombSquig', unitId, targetId: e.id })
  }
  if (hasAbility(u, 'engrammaticLogic') && !u.engrammaticUsed)
    for (const f of s.units.filter((x) => x.owner === u.owner && !isDestroyed(x) && x.battleShocked))
      add(`engram:${f.id}`, tr('Engrammatic Logic: remove Battle-shock from “{name}” (once per battle)', { name: f.name }), { type: 'engrammatic', unitId, targetId: f.id })
  if (hasAbility(u, 'defendDivineWork')) add('divineWork', tr('Defend the Divine Work (4+ invulnerable, once per battle)'), { type: 'divineWork', unitId })
  if (s.phase === 'shooting') {
    const act = s.mission && PRIMARY[s.mission.primary].action
    if (act)
      s.objectives.forEach((o, i) => {
        if (unitNearObjective(u, o))
          add(`action:${o.id}`, tr('🛰 Action “{name}” at objective {obj} (instead of shooting)', { name: MISSION_ACTION[act].name, obj: tr('O{value}', { value: i + 1 }) }), { type: 'startAction', unitId, objectiveId: o.id })
      })
    for (const e of enemiesOf(s, u)) add(`shoot:${e.id}`, tr('Shoot “{name}”', { name: e.name }), { type: 'shoot', unitId, targetId: e.id })
  }
  if (s.phase === 'charge') {
    if (s.pendingCharge?.unitId === unitId) {
      for (const t of s.pendingCharge.targets) add(`charge:${t}`, tr('Charge “{name}”', { name: findUnit(s, t)!.name }), { type: 'chargeMove', unitId, targetIds: [t] })
      add('skipCharge', tr('Give up the move'), { type: 'skipCharge', unitId })
    } else add('declareCharge', tr('Declare a charge: 2D6 roll'), { type: 'declareCharge', unitId })
  }
  if (s.phase === 'fight')
    for (const e of enemiesOf(s, u)) {
      add(`fight:${e.id}`, tr('Fight “{name}”', { name: e.name }), { type: 'fight', unitId, targetId: e.id })
      if (hasAbility(u, 'finestHour') && !u.finestHourUsed)
        add(`finest:${e.id}`, tr('⭐ Fight “{name}” — Finest Hour (+3 A, Devastating Wounds, once per battle)', { name: e.name }), { type: 'fight', unitId, targetId: e.id, finestHour: true })
    }
  out.push(...stratagemActions(s, unitId))
  return out.filter((a) => a.id !== 'reroll' || hasAbility(u, 'waaagh') || hasAbility(u, 'superlativeStrategist'))
}

/** The Stratagems this unit can be the target of right now, one per target (listed only when usable). */
export function stratagemActions(s: GameState, unitId: string): ActionInfo[] {
  const u = findUnit(s, unitId)
  if (!u || isDestroyed(u)) return []
  const out: ActionInfo[] = []
  const strat = (id: string, label: string, cmd: Command) => {
    if (validate(s, cmd).ok) out.push({ id, label, ok: true, cmd })
  }
  const cost = (id: StratagemId) => `${STRATAGEMS[id].cost} CP`
  strat('strat:reroll', tr('🎲 Command Re-roll ({cost}): re-roll {value}', { cost: cost('commandReroll'), value: s.phase === 'charge' ? tr('charge roll') : tr('advance') }), { type: 'stratagem', id: 'commandReroll', unitId })
  strat('strat:bravery', tr('🦁 Insane Bravery ({cost}): remove Battle-shock, once per battle', { cost: cost('insaneBravery') }), { type: 'stratagem', id: 'insaneBravery', unitId })
  for (const e of enemiesOf(s, u)) {
    strat(`strat:explosives:${e.id}`, tr('💣 Explosives ({cost}) at “{name}”: 6D6, 4+ is a mortal wound', { cost: cost('explosives'), name: e.name }), { type: 'stratagem', id: 'explosives', unitId, targetId: e.id })
    strat(`strat:crush:${e.id}`, tr('🐘 Crushing Blow ({cost}) on “{name}”: D6 × Toughness, 5+ is a wound to the enemy, 1 to yourself', { cost: cost('crushingImpact'), name: e.name }), { type: 'stratagem', id: 'crushingImpact', unitId, targetId: e.id })
  }
  // the army's own (detachment) Stratagems
  for (const info of Object.values(STRATAGEMS)) {
    if (info.faction !== u.owner) continue
    // Extinction Order: only objectives with an enemy unit on them (elsewhere it does nothing)
    if (info.id === 'extinctionOrder') {
      s.objectives.forEach((o, i) => {
        if (enemiesOf(s, u).some((e) => alive(e).length > 0 && unitNearObjective(e, o)))
          strat(`strat:${info.id}:${o.id}`, tr('📜 {name} ({cost} CP): target T{value}', { name: info.name, cost: info.cost, value: i + 1 }), { type: 'stratagem', id: info.id, unitId, targetId: o.id })
      })
    } else strat(`strat:${info.id}`, `📜 ${info.name} (${info.cost} CP)`, { type: 'stratagem', id: info.id, unitId })
  }
  return out
}


/** Resolve a unit's shooting at a target: the Shooting phase, or Snap Shooting (Fire Overwatch) when `snap`. */
function resolveShooting(s: GameState, u: UnitState, t: UnitState, opts: { profiles?: Record<string, number>; usePistols?: boolean; useAmmoRunts?: boolean }, r: Roller, snap = false, reroll?: RerollHook) {
  const before = aliveIds(s)
  const plan = shootPlan(s, u, t, { ...opts, snap })
  u.shot = true
  if (plan.oneShots.length) u.spent = [...(u.spent ?? []), ...plan.oneShots]
  if (opts.useAmmoRunts && hasAbility(u, 'ammoRunts') && !u.ammoRuntsUsed) u.ammoRuntsUsed = true
  addLog(s, tr('{name} {value} unit “{name2}”{value2}.', { name: u.name, value: snap ? tr('fires overwatch at') : tr('shoots at'), name2: t.name, value2: plan.cover ? tr(' (target in cover: skill −1)') : '' }), 'minimal')
  for (const sk of plan.skipped) addLog(s, sk, 'beginner')
  let repulsed = 0
  let scored = false
  for (const g of plan.groups) {
    if (isDestroyed(t)) break
    const res = resolveGroup(r, u.name, g, t, g.ctx, reroll)
    repulsed += res.repulsed
    if (res.steps.some((st) => st.meta?.kind === 'hit' && (st.meta.auto || st.dice.some((d) => d.success)))) scored = true
    pushDice(s, `${u.name} → ${t.name}: ${g.weaponName}${g.notes.length ? ` [${g.notes.join(', ')}]` : ''}`, res.steps, res.summary)
    addLog(s, res.summary, 'standard')
  }
  // Disruption Bombardment (Barbgaunts): an INFANTRY target it hit is disrupted until the end of its owner's next turn
  if (scored && hasAbility(u, 'disruptionBombardment') && !isDestroyed(t) && hasKeyword(t, 'INFANTRY') && !t.disrupted) {
    t.disrupted = true
    addLog(s, tr('{name}: “{name2}” is under Disruption Bombardment — until the end of its next turn −2″ to movement, −2 to Advance and charge rolls.', { name: u.name, name2: t.name }), 'standard')
  }
  // Electro-shock (Corpuscarii): a target it hit, not a MONSTER or VEHICLE, is shocked until the end of its owner's next turn
  if (scored && !snap && hasAbility(u, 'electroShock') && !isDestroyed(t) && !isMV(t) && !t.disrupted) {
    t.disrupted = true
    addLog(s, tr('{name}: {target} is electro-shocked — until the end of its next turn −2″ to move, −2 to Advance and Charge rolls.', { name: u.name, target: quote(t.name) }), 'standard')
  }
  // Driven from Cover (Infernus): the target it hit loses cover against this army's shooting until the end of the turn
  if (scored && hasAbility(u, 'drivenFromCover') && !isDestroyed(t) && t.drivenFromCover !== u.owner) {
    t.drivenFromCover = u.owner
    addLog(s, tr('{name}: “{name2}” is driven from cover — until the end of the turn friendly shooting at it ignores cover.', { name: u.name, name2: t.name }), 'standard')
  }
  hazard(s, u, plan.hazardousModels, r, tr('Plasma overload (Hazardous)'))
  // Repulsor Grid: every unmodified 6 on the target's saves = 1 mortal wound for the shooter, after it has shot
  if (repulsed && !isDestroyed(u)) {
    pushDice(s, tr('Repulsor Grid: {name} → {name2}', { name: t.name, name2: u.name }), [{ label: tr('Saves of “6”'), target: '6', dice: Array.from({ length: repulsed }, () => ({ value: 6, success: true })), note: tr('Natural “6”s on saves: {repulsed} — that many mortal wounds go to the shooter.', { repulsed }) }],
      tr('{name} takes {repulsed} mortal wounds from the Repulsor Grid of “{name2}”.', { name: u.name, repulsed, name2: t.name }))
    applyMortalWounds(s, u, repulsed, `Repulsor Grid ${quote(t.name)}`)
  }
  deadlyDemise(s, before, r)
  if (isDestroyed(t)) addLog(s, tr('Unit “{name}” is destroyed!', { name: t.name }), 'minimal')
  checkWinner(s)
}

// ---------------------------------------------------------------- stratagems (stage 1: own turn only)

function stratagemProblem(s: GameState, unit: UnitState, cmd: Extract<Command, { type: 'stratagem' }>): Validation {
  const info = STRATAGEMS[cmd.id]
  if (!info) return fail(tr('Unknown Stratagem.'))
  const me = unit.owner
  if (info.faction === me && !detachmentOn(s, me)) return fail(tr('“{name}” is a detachment Stratagem, but the army is built without a detachment: only the shared Stratagems are available.', { name: info.name }))
  const turn = info.turn ?? 'own'
  if (turn === 'own' && s.activePlayer !== me) return fail(tr('“{name}” can only be used on your own turn.', { name: info.name }))
  if (turn === 'opponent' && (s.reaction?.player !== me || s.reaction.window !== info.window))
    return fail(tr('“{name}” is a reaction in the opponent’s turn: it is offered at the right moment of their turn.', { name: info.name }))
  if (info.window && (s.reaction?.window !== info.window || s.reaction.player !== me)) return fail(tr('“{name}” is offered at the right moment (a window before the action), it cannot be used now.', { name: info.name }))
  if (!info.phases.includes(s.phase)) return fail(tr('“{name}” is used in the phase: {list}.', { name: info.name, list: info.phases.map((p) => PHASE_NAME[p]).join(tr(' or ')) }))
  if (s.players[me].cp < info.cost) return fail(tr('Not enough Command Points: {cost} CP needed, you have {cp}.', { cost: info.cost, cp: s.players[me].cp }))
  if (usedThisPhase(s, me, cmd.id)) return fail(tr('“{name}” has already been used in this phase (each Stratagem once per phase).', { name: info.name }))
  if (info.faction && info.faction !== me) return fail(tr('“{name}” is a Stratagem of another army.', { name: info.name }))
  if (!meetsRequirement(unit, info)) return fail(tr('“{name}”: {label} needed.', { name: info.name, label: info.requires!.label }))
  if (targetedThisPhase(s, unit)) return fail(tr('A Stratagem has already been used on this unit in this phase (one Stratagem per unit per phase).'))
  if (cmd.id !== 'insaneBravery' && unit.battleShocked) return fail(tr('The unit is Battle-shocked: Stratagems cannot be used on it.'))
  const target = cmd.targetId ? findUnit(s, cmd.targetId) : undefined
  switch (cmd.id) {
    case 'commandReroll': {
      if (s.phase === 'charge') return s.lastCharge?.unitId === unit.id ? OK : fail(tr('Only the unit’s charge roll that was just made can be re-rolled.'))
      if (unit.advanceRoll === null || unit.move !== 'none') return fail(tr('There is no Advance roll to re-roll.'))
      if (unit.advanceRerolled) return fail(tr('A die cannot be re-rolled more than once.'))
      return OK
    }
    case 'insaneBravery':
      // the engine rolls battle-shock tests automatically when the Command phase starts, so the Stratagem is offered
      // right after a failed test and turns it into a pass (see docs/stratagems.md)
      if (s.players[me].braveryUsed) return fail(tr('“Insane Bravery” has already been used in this battle (once per battle).'))
      return s.shockPending?.includes(unit.id) ? OK : fail(tr('Only for a unit that is about to take a Battle-shock test.'))
    case 'explosives': {
      if (unit.shot) return fail(tr('The unit has already shot in this phase.'))
      if (unit.move === 'advance' || unit.move === 'fallBack') return fail(tr('Explosives cannot be thrown after an Advance or Fall Back.'))
      if (isEngaged(s, unit)) return fail(tr('The unit is in engagement range of the enemy.'))
      if (!target || target.owner === me || isDestroyed(target)) return fail(tr('Choose an enemy unit.'))
      if (isEngaged(s, target)) return fail(tr('The target is in engagement range of another unit — you cannot throw into a melee.'))
      if (!explosivesReach(unit, target)) return fail(tr('Explosives are thrown no farther than {EXPLOSIVES_RANGE}″.', { EXPLOSIVES_RANGE }))
      if (!unitCanSee(s, unit, target)) return fail(tr('The target is not visible: cover blocks the line of sight.|alt'))
      return OK
    }
    case 'fireOverwatch': {
      if (isEngaged(s, unit)) return fail(tr('The unit is in engagement range of the enemy.'))
      if (!target || target.owner === me || isDestroyed(target)) return fail(tr('Choose an enemy unit.'))
      if (unitDistance(unit, target) > OVERWATCH_RANGE + EPS) return fail(tr('Overwatch fire — only at an enemy within {OVERWATCH_RANGE}″.', { OVERWATCH_RANGE }))
      const plan = shootPlan(s, unit, target, { snap: true })
      return plan.problem ? fail(plan.problem) : OK
    }
    case 'smokescreen':
      return OK
    case 'heroicIntervention': {
      if (isEngaged(s, unit)) return fail(tr('The unit is already in engagement range of the enemy.'))
      if (hasKeyword(unit, 'VEHICLE') && !hasKeyword(unit, 'CHARACTER', 'WALKER')) return fail(tr('Heroic Intervention is available to a vehicle only if it is a character or a walker (WALKER).'))
      if (!target || target.owner === me || isDestroyed(target)) return fail(tr('Choose an enemy unit.'))
      if (!target.charged) return fail(tr('Intervention is only against a unit that charged in this phase.'))
      if (unitDistance(unit, target) > CHARGE_RANGE + EPS) return fail(tr('The enemy is farther than {CHARGE_RANGE}″.', { CHARGE_RANGE }))
      return OK
    }
    case 'armourOfContempt':
    case 'rapidRegeneration':
    case 'lightningFastReactions':
    case 'balefulHalo':
    case 'bulwarkImperative':
    case 'aWorthyDeath':
    case 'orksNeverBeaten':
    case 'deathFrenzy':
    case 'undyingLegions': {
      if (s.reaction?.unitId !== unit.id) return fail(cmd.id === 'undyingLegions' ? tr('Only for a unit that has just lost models to enemy attacks.') : tr('Only for a unit that the enemy has just chosen as a target.'))
      if (cmd.id === 'lightningFastReactions' && hasKeyword(unit, 'WRAITH CONSTRUCT')) return fail(tr('Not for wraith constructs (WRAITH CONSTRUCT).'))
      if (cmd.id === 'balefulHalo' && hasKeyword(unit, 'VEHICLE')) return fail(tr('Not for vehicles (VEHICLE).'))
      if (cmd.id === 'orksNeverBeaten' && hasKeyword(unit, 'TITANIC')) return fail(tr('Not for TITANIC.'))
      if (LAST_STAND.includes(cmd.id) && unit.fought) return fail(tr('The unit has already fought in this phase.'))
      if (cmd.id === 'undyingLegions' && !hasAbility(unit, 'reanimation')) return fail(tr('The unit has no reanimation protocols.'))
      if (cmd.id === 'undyingLegions' && !reanimationNeeded(unit)) return fail(tr('The unit has nothing to heal.'))
      return OK
    }
    case 'epicChallenge':
      return enemiesOf(s, unit).some((e) => validate(s, { type: 'fight', unitId: unit.id, targetId: e.id }).ok) ? OK : fail(tr('The unit cannot fight right now.'))
    case 'stormOfDevastation':
    case 'closeRangeDakka':
    case 'conqueringTyrant':
    case 'blitzingFirepower':
    case 'lethalDosage':
      return unit.shot ? fail(tr('The unit has already shot in this phase.')) : OK
    case 'fungusFuelInjection':
      return unit.move === 'none' ? OK : fail(tr('The unit has already moved in this phase.'))
    case 'suddenStorm':
      return OK
    case 'feignedRetreat':
      return unit.move === 'fallBack' ? OK : fail(tr('Only for a unit that fell back (Fall Back) in this phase.'))
    case 'aggressorImperative':
      if (unit.move !== 'none' || unit.advanceRoll !== null) return fail(tr('The unit has already moved or declared an Advance.'))
      return isEngaged(s, unit) ? fail(tr('The unit is in engagement range of the enemy — it cannot Advance.')) : OK
    case 'hitEmHarder':
    case 'hungryVoid':
    case 'adrenalSurge':
      return enemiesOf(s, unit).some((e) => validate(s, { type: 'fight', unitId: unit.id, targetId: e.id }).ok) ? OK : fail(tr('The unit cannot fight right now.'))
    case 'extinctionOrder': {
      const o = s.objectives.find((x) => x.id === cmd.targetId)
      if (!o) return fail(tr('Choose a target on the field.'))
      if (Math.min(...alive(unit).map((m) => dist(m.pos, o.pos))) > EXTINCTION_RANGE + EPS) return fail(tr('The target is farther than {EXTINCTION_RANGE}″ from the Tech-Priest.', { EXTINCTION_RANGE }))
      return OK
    }
    case 'crushingImpact': {
      if (!unit.charged) return fail(tr('Used after this unit has finished a charge.'))
      if (!target || target.owner === me || isDestroyed(target)) return fail(tr('Choose an enemy unit.'))
      if (!engagedUnits(s, unit).some((e) => e.id === target.id)) return fail(tr('The target must be in engagement range of the vehicle.'))
      return OK
    }
  }
}

/** Every reaction the reacting player could use now (one command per unit and target). */
export function reactionCommands(s: GameState): Command[] {
  if (!s.reaction) return []
  const me = s.reaction.player
  const foes = unitsOf(s, other(s, me)).filter((e) => !isDestroyed(e))
  const out: Command[] = []
  for (const id of reactionsIn(s.reaction.window))
    for (const u of unitsOf(s, me).filter((x) => !isDestroyed(x))) {
      const targeted = id === 'fireOverwatch' || id === 'heroicIntervention'
      const cmds: Command[] = targeted ? foes.map((e) => ({ type: 'stratagem', id, unitId: u.id, targetId: e.id })) : [{ type: 'stratagem', id, unitId: u.id }]
      for (const c of cmds) if (validate(s, c).ok) out.push(c)
    }
  // Rapid Ingress: one command per reserve unit that has a legal spot (the player picks the spot in the prompt)
  if (s.reaction.window === 'beforeShooting')
    for (const u of reservesOf(s, me)) {
      const pos = arrivalSpot(s, u, aiArrivalTarget(s, me), true)
      if (pos) out.push({ type: 'arrive', unitId: u.id, positions: pos, rapid: true })
    }
  return out
}

/** Open a reaction window for the player whose turn it is not, if they have a reaction to use; true when opened. */
function openReaction(s: GameState, window: ReactionWindow, next: Phase, player = other(s, s.activePlayer), about: { unitId?: string; attack?: PendingReroll['cmd'] } = {}): boolean {
  s.reaction = { player, window, next, ...about }
  if (reactionCommands(s).length) {
    const u = about.unitId ? findUnit(s, about.unitId)! : undefined
    const text = window === 'beforeShockTests' ? tr('{item}: “Insane Bravery” can be used before the Battle-shock tests.', { item: FACTION_NAME[player] })
      : window === 'onTargeted' ? tr('{item}: unit “{name}” was picked as a target — you can answer with a Stratagem before the rolls.', { item: FACTION_NAME[player], name: u!.name })
      : window === 'afterAttacks' ? tr('{item}: unit “{name}” lost models — a reanimation Stratagem can be used.', { item: FACTION_NAME[player], name: u!.name })
      : tr('{item} can answer with a reaction (a Stratagem on the opponent’s turn).', { item: FACTION_NAME[player] })
    addLog(s, text, 'standard')
    return true
  }
  s.reaction = null
  return false
}

/** Close the window and go on: the phase it was holding, the Battle-shock tests, or the attack that was waiting. */
function closeReaction(s: GameState, r: Roller) {
  const { next, window, attack: waiting } = s.reaction!
  s.reaction = null
  if (window === 'beforeShockTests') finishShockTests(s, r)
  else if (window === 'onTargeted') attack(s, waiting!, r)
  else if (window !== 'afterAttacks') enterPhase(s, next, r)
}

function applyStratagem(s: GameState, cmd: Extract<Command, { type: 'stratagem' }>, r: Roller) {
  const u = findUnit(s, cmd.unitId)!
  const me = u.owner
  const info = STRATAGEMS[cmd.id]
  s.players[me].cp -= info.cost
  ;(s.players[me].stratagemsThisPhase ??= []).push(cmd.id)
  ;(s.players[me].stratagemUnitsThisPhase ??= []).push(u.id)
  addLog(s, (showOfficialName ? tr('{item}: Stratagem “{name}” ({nameEn}) — {name2}, −{cost} CP.', { item: FACTION_NAME[me], name: info.name, nameEn: info.nameEn, name2: u.name, cost: info.cost }) : tr('{item}: Stratagem “{name}” — {name2}, −{cost} CP.', { item: FACTION_NAME[me], name: info.name, name2: u.name, cost: info.cost })), 'minimal')
  if (hasAbility(u, 'dataTether')) {
    const v = r.d6()
    if (v >= DATA_TETHER_ROLL) s.players[me].cp++
    pushDice(s, tr('Data-tether: {name}', { name: u.name }), [{ label: 'D6', target: `${DATA_TETHER_ROLL}+`, dice: [{ value: v, success: v >= DATA_TETHER_ROLL }] }], v >= DATA_TETHER_ROLL ? tr('{name}: Data-tether — +1 CP.', { name: u.name }) : tr('{name}: Data-tether — no CP returned.', { name: u.name }))
  }
  if (info.buff) {
    ;(info.buff === 'phase' ? (u.phaseBuffs ??= []) : (u.turnBuffs ??= [])).push(cmd.id)
    addLog(s, `${u.name}: ${info.text}`, 'standard')
  }
  const t = cmd.targetId ? findUnit(s, cmd.targetId) : undefined
  switch (cmd.id) {
    case 'fireOverwatch':
      resolveShooting(s, u, t!, {}, r, true)
      break
    case 'heroicIntervention': {
      const dice = rollMany(r, 2)
      const roll = Math.max(0, dice[0] + dice[1] - (u.disrupted ? DISRUPTION : 0))
      const d = unitDistance(u, t!)
      const pos = roll > 2 && withinRange(d, roll) ? planCharge(s, u, [t!], roll) : null
      pushDice(s, tr('Heroic Intervention: {name} → {name2}', { name: u.name, name2: t!.name }), [{ label: '2D6', target: '—', dice: dice.map((x) => ({ value: x, success: !!pos })), note: tr('Needs {fmt}", rolled {roll}"', { fmt: fmt(d), roll }) }],
        pos ? tr('{name} charges into combat with “{name2}”.', { name: u.name, name2: t!.name }) : tr('{name} does not make it: rolled {roll}", needs {fmt}".', { name: u.name, roll, fmt: fmt(d) }))
      if (pos) {
        movedTo(u, pos)
        addLog(s, tr('{name}: Heroic Intervention — the unit charges into combat with “{name2}” (without Fights First).', { name: u.name, name2: t!.name }), 'minimal')
      } else addLog(s, tr('{name}: Heroic Intervention failed — rolled {roll}", the enemy is at {fmt}".', { name: u.name, roll, fmt: fmt(d) }), 'minimal')
      break
    }
    case 'aggressorImperative': {
      u.advanceRoll = 6
      u.advanceRerolled = true
      addLog(s, tr('{name}: Advance without a roll — M + 6".', { name: u.name }), 'minimal')
      break
    }
    case 'extinctionOrder': {
      const o = s.objectives.find((x) => x.id === cmd.targetId)!
      const foes = enemiesOf(s, u).filter((e) => alive(e).length && unitNearObjective(e, o))
      if (!foes.length) addLog(s, tr('There are no enemy units on this objective — the order achieved nothing.'), 'minimal')
      for (const e of foes) {
        const v = r.d6()
        pushDice(s, tr('Order of Eradication: {name}', { name: e.name }), [{ label: 'D6', target: '4+', dice: [{ value: v, success: v >= 4 }], note: tr('4+ — a mortal wound and a Battle-shock test') }],
          v >= 4 ? tr('{name}: a mortal wound and a Battle-shock test.', { name: e.name }) : tr('{name}: no consequences.', { name: e.name }))
        if (v < 4) continue
        applyMortalWounds(s, e, 1, tr('order of eradication of “{name}”', { name: u.name }))
        if (isDestroyed(e)) { addLog(s, tr('Unit “{name}” is destroyed!', { name: e.name }), 'minimal'); continue }
        const { dice, total, ld, pass, label } = leadershipRoll(s, e, r)
        if (!pass) e.battleShocked = true
        pushDice(s, tr('Battle-shock: {name}', { name: e.name }), [{ label, target: `${ld}+`, dice: dice.map((x) => ({ value: x, success: pass })), note: tr('Total {total} vs Ld {ld}+', { total, ld }) }],
          pass ? tr('{name}: test passed.', { name: e.name }) : tr('{name}: failed — the unit is Battle-shocked.', { name: e.name }))
      }
      updateObjectiveControl(s)
      checkWinner(s)
      break
    }
    case 'commandReroll': {
      if (s.phase === 'charge') {
        const prev = s.lastCharge!.dice
        const dice = rollMany(r, 2)
        const roll = Math.max(0, dice[0] + dice[1] - (u.disrupted ? DISRUPTION : 0))
        const targets = chargeTargetsFor(s, u, roll)
        s.lastCharge = null
        pushDice(s, tr('Charge Command Re-roll: {name}', { name: u.name }), [{ label: '2D6', target: '—', dice: dice.map((x, i) => ({ value: x, success: targets.length > 0, rerolledFrom: prev[i] })), note: tr('Was {value}, now {roll}"', { value: prev[0] + prev[1], roll }) }],
          targets.length ? tr('Re-roll: {roll}" — available targets: {list}.', { roll, list: targets.map((x) => x.name).join(', ') }) : tr('Re-roll: {roll}" — still not enough, the charge failed.', { roll }))
        if (targets.length) s.pendingCharge = { unitId: u.id, roll, dice, targets: targets.map((x) => x.id) }
        else {
          s.pendingCharge = null
          addLog(s, tr('{name}: after the re-roll {roll}" came up — the charge failed.', { name: u.name, roll }), 'minimal')
        }
      } else {
        const prev = u.advanceRoll
        const v2 = r.d6()
        u.advanceRoll = v2
        u.advanceRerolled = true
        pushDice(s, tr('Advance Command Re-roll: {name}', { name: u.name }), [{ label: 'D6', target: '—', dice: [{ value: v2, success: true, rerolledFrom: prev ?? undefined }], note: tr('Was {prev}', { prev }) }], tr('{name}: the Advance is now M + {v2}".', { name: u.name, v2 }))
        addLog(s, tr('{name}: Advance re-roll — D6 = {v2}.', { name: u.name, v2 }), 'minimal')
      }
      break
    }
    case 'undyingLegions':
      reanimateUnit(s, u, r, isLed(s, u) ? 1 : 0, tr('“Immortal Legions Protocol”'))
      break
    case 'insaneBravery': {
      const was = u.battleShocked
      u.battleShocked = false
      s.players[me].braveryUsed = true
      s.shockPending = (s.shockPending ?? []).filter((id) => id !== u.id)
      addLog(s, tr('{name}: the Battle-shock test is passed automatically{value}.', { name: u.name, value: was ? tr(' — Battle-shock removed') : '' }), 'minimal')
      break
    }
    case 'explosives': {
      u.shot = true
      const dice = rollMany(r, EXPLOSIVES_DICE)
      const n = dice.filter((v) => v >= 4).length
      pushDice(s, tr('Explosives: {name} → {name2}', { name: u.name, name2: t!.name }), [{ label: `${EXPLOSIVES_DICE}D6`, target: '4+', dice: dice.map((v) => ({ value: v, success: v >= 4 })), note: tr('Each 4+ is 1 mortal wound: {n}.', { n }) }],
        n ? tr('{name} throws explosives at “{name2}”: {n} mortal wounds.', { name: u.name, name2: t!.name, n }) : tr('The explosives of “{name}” did no harm to “{name2}”.', { name: u.name, name2: t!.name }))
      if (n) applyMortalWounds(s, t!, n, tr('explosives of “{name}”', { name: u.name }))
      if (isDestroyed(t!)) addLog(s, tr('Unit “{name}” is destroyed!', { name: t!.name }), 'minimal')
      checkWinner(s)
      break
    }
    case 'crushingImpact': {
      // the model with the highest Toughness among those engaged with the target
      const T = Math.max(...alive(u).filter((m) => modelEngagedWith(m, t!)).map((m) => profileOf(m).t))
      const dice = rollMany(r, T)
      const hit = Math.min(CRUSHING_MAX, dice.filter((v) => v >= 5).length)
      const self = Math.min(CRUSHING_MAX, dice.filter((v) => v === 1).length)
      pushDice(s, tr('Crushing Blow: {name} → {name2}', { name: u.name, name2: t!.name }), [{ label: tr('{T}D6 (Toughness)', { T }), target: '5+', dice: dice.map((v) => ({ value: v, success: v >= 5 })), note: tr('5+ — a wound to the enemy: {hit}; 1 — a wound to yourself: {self} (max {CRUSHING_MAX} each).', { hit, self, CRUSHING_MAX }) }],
        tr('{name} slams into “{name2}”: {hit} mortal wounds to the enemy{value}.', { name: u.name, name2: t!.name, hit, value: self ? tr(', {self} to itself', { self }) : '' }))
      if (hit) applyMortalWounds(s, t!, hit, tr('crushing blow of “{name}”', { name: u.name }))
      if (self) applyMortalWounds(s, u, self, tr('recoil of the crushing blow'))
      if (isDestroyed(t!)) addLog(s, tr('Unit “{name}” is destroyed!', { name: t!.name }), 'minimal')
      if (isDestroyed(u)) addLog(s, tr('Unit “{name}” is destroyed!', { name: u.name }), 'minimal')
      checkWinner(s)
      break
    }
  }
}


/** Disruption Bombardment: −2″ to Move and −2 to Advance and Charge rolls */
export const DISRUPTION = 2

export function maxMove(u: UnitState): number {
  const cut = u.disrupted ? DISRUPTION : 0
  const m = Math.max(0, Math.min(...alive(u).map((x) => profileOf(x).m)) - cut) + (hasBuff(u, 'fungusFuelInjection') ? FUNGUS_BONUS : 0)
  return u.advanceRoll !== null ? m + Math.max(0, u.advanceRoll - cut) : m
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
  return maxMove(u) + (e.swift ? swiftBonusOf(s, u.owner) : 0) - (e.fly ? FLY_PENALTY : 0)
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


/** Line-breakers (Serberys Sulphurhounds): a D6 per model engaged with the charged unit, +2 near friendly BATTLELINE. */
export const LINE_BREAKERS_SUPPORT = 6
const LINE_BREAKERS_ROLL = 4
/** Broad Spectrum Data-tether: a Stratagem on the unit gives back 1 CP on this roll */
const DATA_TETHER_ROLL = 5

function lineBreakers(s: GameState, u: UnitState, targets: UnitState[], support: boolean, r: Roller) {
  const t = targets.find((x) => !isDestroyed(x) && alive(u).some((m) => modelEngagedWith(m, x)))
  if (!t) return
  const n = alive(u).filter((m) => modelEngagedWith(m, t)).length
  const bonus = support ? 2 : 0
  const dice = rollMany(r, n)
  const mw = dice.filter((v) => v + bonus >= LINE_BREAKERS_ROLL).length
  pushDice(s, tr('Line-breakers: {name} → {target}', { name: u.name, target: t.name }), [{ label: bonus ? tr('D6 × {n} (+2: friendly Battleline nearby)', { n }) : tr('D6 × {n}', { n }), target: `${LINE_BREAKERS_ROLL}+`, dice: dice.map((v) => ({ value: v, success: v + bonus >= LINE_BREAKERS_ROLL })) }],
    mw ? tr('{name}: {mw} mortal wounds from the line-breakers.', { name: t.name, mw }) : tr('{name}: line-breakers without wounds.', { name: u.name }))
  if (mw) applyMortalWounds(s, t, mw, tr('line-breakers'))
}
