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
import { applySecondary, secondaryCommandStart, secondaryProblem, secondaryTurnEnd } from './rules/secondaries'
import { actionProblem, MISSION_ACTION, missionBattleEnd, missionCommandEnd, missionTurnEnd, missionTurnStart, PRIMARY } from './rules/missions'
import { applyMortalWounds, resolveGroup, type AttackContext, type AttackGroup, type RerollHook, type RerollKind } from './combat/attack'
import { moveProblem, planMove } from './rules/movement'
import { hasCover, nearestVisibleDistance, seesAny, unitCanSee } from './rules/visibility'
import { DOCTRINE_NAME, DOCTRINE_TEXT, DOCTRINES, doctrineLeft, HYPER_ADAPTATIONS, HYPER_NAME, HYPER_TEXT, MARTIAL_GRACE_SWIFT, MARTIAL_GRACE_TOKENS, RAD_COVER_WOUNDS } from './rules/detachments'
import { deploymentZone } from './rules/deployment'
import { pointInPolygon } from './geometry/geometry'
import { CRUSHING_MAX, EXPLOSIVES_DICE, EXPLOSIVES_RANGE, explosivesReach, hasBuff, LAST_STAND, meetsRequirement, reactionsIn, STRATAGEMS, targetedThisPhase, usedThisPhase } from './rules/stratagems'
import { baseRadius } from './geometry/geometry'
import type { Command, DiceEntry, GameState, ModelState, PendingReroll, Phase, PlayerId, ReactionWindow, StratagemId, UnitState, Validation, Vec, Weapon, WeaponProfile } from './types'
import { PHASES } from './types'

export const PHASE_NAME: Record<Phase, string> = {
  command: 'Фаза командования (Command)',
  movement: 'Фаза движения (Movement)',
  shooting: 'Фаза стрельбы (Shooting)',
  charge: 'Фаза атаки (Charge)',
  fight: 'Фаза боя (Fight)',
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
  if (hyper === 'swarming' && hasKeyword(target, 'INFANTRY', 'SWARM')) { out.sustained = true; out.notes.push('Роевые инстинкты: Sustained Hits 1') }
  if (hyper === 'aggression' && hasKeyword(target, 'MONSTER', 'VEHICLE')) { out.lethal = true; out.notes.push('Гиперагрессия: Lethal Hits') }
  if (hyper === 'predators' && hasKeyword(target, 'CHARACTER')) { out.critPrecision = true; out.notes.push('Хищники Улья: криты с Precision') }
  if (faction === 'necrons' && isLed(s, unit)) { out.hitMod++; out.hitNotes.push('Командные протоколы +1') }
  return out
}

// notes that mark Stratagem effects on an attack group (see shootPlan)
const BLITZ_CRIT = 'Молниеносный огонь: крит на 5+'
const TYRANT_ALL = 'Тиран-завоеватель: переброс промахов'
const TYRANT_ONES = 'Тиран-завоеватель: переброс 1'
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
  const woundNotes = [duty ? 'Duty Eternal: сила больше стойкости' : guard ? 'Guardian Protocols: сила больше стойкости' : '', halo ? 'Зловещий ореол' : ''].filter(Boolean)
  return {
    woundMod: duty || guard || halo ? -1 : 0,
    woundModNote: woundNotes.length ? woundNotes.join(', ') : undefined,
    damageMod: hasAbility(target, 'dreadArd') || hasAbility(target, 'implacableResilience') ? -1 : 0,
    ...(fnp ? { fnp } : {}),
  }
}

/** Invulnerable save against ranged attacks: the general override, and the Rangers' 5+ (ranged attacks only). */
function rangedInvuln(s: GameState, target: UnitState): number | undefined {
  const v = [invulnOverrideOf(s, target), hasAbility(target, 'cameleoline') ? 5 : undefined, hasBuff(target, 'bulwarkImperative') ? 4 : undefined].filter((x): x is number => x !== undefined)
  return v.length ? Math.min(...v) : undefined
}

/** Implacable Eradication (Immortals): re-roll wound rolls of 1, or every failed one against a target within range of an objective. */
function eradication(s: GameState, unit: UnitState, target: UnitState, notes: string[]): { rerollWounds?: 'ones' | 'all' } {
  if (!hasAbility(unit, 'implacableEradication')) return {}
  const all = s.objectives.some((o) => unitNearObjective(target, o))
  notes.push(all ? 'Implacable Eradication: переброс ранений (цель у объекта)' : 'Implacable Eradication: переброс 1 на ранение')
  return { rerollWounds: all ? 'all' : 'ones' }
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
        if (!g.notes.includes('Rapid Fire')) g.notes.push(hasBuff(unit, 'closeRangeDakka') ? 'Rapid Fire (Дакка в упор)' : 'Rapid Fire')
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
  plan.cover = hasCover(s, plan.firingModels, target) || hasAbility(target, 'stealth') || hasBuff(target, 'smokescreen')
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
    if (psychicGuidance(s, unit)) { notes.push('Psychic Guidance +1'); hitMod++ }
    if (hasBuff(target, 'lightningFastReactions')) { notes.push('Молниеносная реакция −1'); hitMod-- }
    const det = detachmentAttack(s, unit, target)
    if (det.hitMod) { notes.push(...det.hitNotes); hitMod += det.hitMod }
    if (det.sustained && !(g.sustainedHits ?? g.profile.keywords.sustainedHits)) g.sustainedHits = 1
    g.notes.push(...det.notes)
    // Swift Demise (Windriders): re-roll hit rolls of 1; any failed hit if the target is the closest eligible one
    let rerollHits: AttackContext['rerollHits'] = bonus.rerollHits
    if (hasAbility(unit, 'swiftDemise')) rerollHits = isClosestTarget(s, unit, target) ? 'all' : 'ones'
    if (bonus.rerollHits) g.notes.push(bonus.rerollHits === 'all' ? 'Breaching Command: переброс попаданий' : 'Breaching Command: переброс 1')
    // Ignores Cover (weapon keyword or Omnispex) cancels the cover bonus; Protector improves BS by 1
    if (alphaWarrior(s, unit) && !(g.profile.keywords.sustainedHits ?? 0)) {
      g.profile = { ...g.profile, keywords: { ...g.profile.keywords, sustainedHits: 1 } }
      g.notes.push('Alpha Warrior: Sustained Hits 1')
    }
    const exposed = target.drivenFromCover === unit.owner
    const storm = hasBuff(unit, 'stormOfDevastation')
    const ignores = g.profile.keywords.ignoresCover || omnispex || exposed || storm
    if (plan.cover && ignores) g.notes.push(exposed && !g.profile.keywords.ignoresCover && !omnispex && !storm ? 'Driven from Cover: без укрытия' : storm && !g.profile.keywords.ignoresCover && !omnispex ? 'Опустошительный шторм: без укрытия' : 'игнорирует укрытие')
    const dosage = hasBuff(unit, 'lethalDosage')
    if (dosage) g.notes.push('Смертельная доза: Lethal Hits')
    const tyrantReroll: AttackContext['rerollHits'] = g.notes.includes(TYRANT_ALL) ? 'all' : g.notes.includes(TYRANT_ONES) ? 'ones' : undefined
    if (tyrantReroll && rerollHits !== 'all') rerollHits = tyrantReroll
    if (bonus.betterAp) { g.profile = { ...g.profile, ap: g.profile.ap - 1 }; g.notes.push('Conqueror: AP +1') }
    if (hasBuff(target, 'armourOfContempt') && g.profile.ap < 0) { g.profile = { ...g.profile, ap: g.profile.ap + 1 }; g.notes.push('Доспех презрения: AP хуже на 1') }
    if (bonus.galvanic) g.notes.push('Galvanic Field: Lethal Hits')
    const protector = bonus.imp === 'protector'
    g.ctx = {
      hitMod,
      hitModNotes: notes,
      skillWorsen: (plan.cover && !ignores ? 1 : 0) - (protector ? 1 : 0),
      ...(protector ? { skillNote: 'Protector: BS на 1 лучше' } : {}),
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
      g.notes.push('Огонь на опережение: попадание только на «6»')
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
    notes.push(led ? 'Голодная пустота +1 S, +1 AP' : 'Голодная пустота +1 S')
  }
  if (hasBuff(unit, 'hitEmHarder')) notes.push('Бей сильнее!: Lethal Hits')
  if (hasBuff(unit, 'adrenalSurge')) notes.push('Адреналиновый всплеск: крит на 5+')
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
  // Bladeguard: once per turn, when selected to fight, +1 to melee hit rolls (a unit fights once per turn here)
  if (hasAbility(unit, 'bladeguard')) { hitMod++; hitModNotes.push('Bladeguard +1') }
  // Doctrina Imperatives: Conqueror improves WS and (near BATTLELINE) AP; Protector of the target subtracts 1 from melee hit rolls
  const bonus = attackerBonuses(s, unit)
  if (bonus.imp === 'conqueror') { skillWorsen--; skillNote = 'Conqueror: WS на 1 лучше'; notes.push('Conqueror: WS +1') }
  if (bonus.betterAp) { p = { ...p, ap: p.ap - 1 }; notes.push('Conqueror: AP +1') }
  if (imperativeOf(s, target) === 'protector' && battlelineSupport(s, target)) { hitMod--; hitModNotes.push('Protector цели −1') }
  if (hasBuff(target, 'lightningFastReactions')) { hitMod--; hitModNotes.push('Молниеносная реакция −1') }
  const det = detachmentAttack(s, unit, target)
  if (det.hitMod) { hitMod += det.hitMod; hitModNotes.push(...det.hitNotes) }
  // Get Stuck In (War Horde): Orks' melee attacks have Sustained Hits 1; Swarming Instincts gives the same
  const stuckIn = datasheetOf(unit).faction === 'orks' && detachmentOn(s, unit.owner)
  if ((stuckIn || det.sustained) && !(p.keywords.sustainedHits ?? 0)) {
    p = { ...p, keywords: { ...p.keywords, sustainedHits: 1 } }
    if (stuckIn) notes.push('Ввяжись в драку: Sustained Hits 1')
  }
  notes.push(...det.notes)
  if (hasBuff(target, 'armourOfContempt') && p.ap < 0) { p = { ...p, ap: p.ap + 1 }; notes.push('Доспех презрения: AP хуже на 1') }
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
  if (s.winner) return fail('Битва окончена.')
  const who = actor(s)
  // the Tyranids choose their Hyper-adaptation before the battle starts
  if (hyperPending(s)) {
    if (cmd.type !== 'hyperAdaptation') return fail('Тираниды выбирают гиперадаптацию на всю битву (правило детачмента): до этого ход не начинается.')
    return HYPER_ADAPTATIONS.includes(cmd.choice) ? OK : fail('Неизвестная гиперадаптация.')
  }
  if (cmd.type === 'hyperAdaptation') return fail('Гиперадаптация выбирается один раз, в начале битвы.')
  // an attack paused for a Command Re-roll: only the answer
  if (s.pendingReroll)
    return cmd.type === 'rerollChoice' ? OK : fail(`Атака ждёт решения стороны «${FACTION_NAME[s.pendingReroll.player]}»: перебросить кубик или нет.`)
  if (cmd.type === 'rerollChoice') return fail('Сейчас нечего перебрасывать.')
  // a reaction window: only the reacting player's reactions for this window, or passing
  if (s.reaction) {
    if (cmd.type === 'passReaction') return OK
    if (cmd.type !== 'stratagem' || STRATAGEMS[cmd.id]?.window !== s.reaction.window)
      return fail(`Ход ждёт ответа стороны «${FACTION_NAME[s.reaction.player]}»: реакция или пропуск.`)
  } else if (cmd.type === 'passReaction') return fail('Сейчас нет окна реакции.')
  if (s.pendingCharge && cmd.type !== 'chargeMove' && cmd.type !== 'skipCharge' && !(cmd.type === 'stratagem' && cmd.id === 'commandReroll'))
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

  if (cmd.type === 'doctrine') {
    if (who !== 'marines') return fail('Боевые доктрины — правило армии Космодесанта.')
    if (s.phase !== 'command') return fail('Боевая доктрина выбирается в фазе командования.')
    const p = s.players.marines
    if (p.doctrine) return fail('Доктрина уже выбрана в этом ходу.')
    if (!DOCTRINES.includes(cmd.doctrine)) return fail('Неизвестная доктрина.')
    if (!doctrineLeft(p.doctrinesUsed ?? [], cmd.doctrine, detachmentOn(s, 'marines') ? undefined : 0))
      return fail(`«${DOCTRINE_NAME[cmd.doctrine]}» больше выбрать нельзя: каждая доктрина — раз за битву${detachmentOn(s, 'marines') ? ', и одна из них — ещё раз (Дисциплина Кодекса)' : ''}.`)
    return OK
  }

  if (cmd.type === 'secondary') {
    const p = secondaryProblem(s, who, cmd.op, cmd.card)
    return p ? fail(p) : OK
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
    case 'stratagem':
      return stratagemProblem(s, unit, cmd)
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
      const m = Math.min(...alive(unit).map((x) => profileOf(x).m)) + (hasBuff(unit, 'fungusFuelInjection') ? FUNGUS_BONUS : 0)
      const max = (cmd.mode === 'advance' ? m + (unit.advanceRoll ?? 0) : m) + (cmd.swift ? swiftBonusOf(s, unit.owner) : 0) - (cmd.fly ? FLY_PENALTY : 0)
      const p = moveProblem(s, unit, cmd.positions, max, cmd.mode, [], !!cmd.fly)
      return p ? fail(p) : OK
    }
    case 'rerollAdvance':
      if (unit.advanceRoll === null || unit.move !== 'none') return fail('Нет броска продвижения для переброса.')
      if (!hasAbility(unit, 'waaagh') && !hasAbility(unit, 'superlativeStrategist')) return fail('Переброс продвижения дают только Waaagh! и Superlative Strategist.')
      if (unit.advanceRerolled) return fail('Кубик нельзя перебрасывать больше одного раза.')
      return OK
    case 'startAction': {
      const p = actionProblem(s, unit, cmd.objectiveId)
      return p ? fail(p) : OK
    }
    case 'shoot': {
      if (s.phase !== 'shooting') return fail('Стрелять можно только в фазе стрельбы.')
      if (unit.action) return fail('Отряд выполняет действие миссии и не стреляет в этот ход.')
      if (unit.shot) return fail('Отряд уже стрелял в этой фазе.')
      if (unit.move === 'fallBack' && !canActAfterFallBack(s, unit) && !hasAbility(unit, 'warConstruct')) return fail('Отряд отступил (Fall Back) в этот ход и не может стрелять.')
      const target = findUnit(s, cmd.targetId)
      if (!target || isDestroyed(target) || target.owner === unit.owner) return fail('Недопустимая цель.')
      const plan = shootPlan(s, unit, target, cmd)
      return plan.problem ? fail(plan.problem) : OK
    }
    case 'declareCharge': {
      if (s.phase !== 'charge') return fail('Атаку (charge) объявляют в фазе атаки.')
      if (unit.chargeDeclared) return fail('Отряд уже объявлял атаку в этой фазе.')
      if (unit.action) return fail('Отряд выполняет действие миссии и не может атаковать в этот ход.')
      if (isEngaged(s, unit)) return fail('Отряд уже в контакте с врагом.')
      if (unit.move === 'fallBack' && !canActAfterFallBack(s, unit)) return fail('Отряд отступил (Fall Back) в этот ход и не может атаковать.')
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
    case 'engrammatic': {
      if (!hasAbility(unit, 'engrammaticLogic')) return fail('У этого отряда нет Энграмматической логики (Engrammatic Logic).')
      if (unit.engrammaticUsed) return fail('Энграмматическая логика уже применена в этой битве (раз за битву).')
      const target = findUnit(s, cmd.targetId)
      if (!target || isDestroyed(target) || target.owner !== unit.owner) return fail('Цель — союзный отряд.')
      if (!target.battleShocked) return fail('Этот отряд не в боевом шоке.')
      if (target.id !== unit.id && unitDistance(unit, target) > ENGRAMMATIC_RANGE + 1e-6) return fail(`Отряд дальше ${ENGRAMMATIC_RANGE}″.`)
      return OK
    }
    case 'grenadePack': {
      if (!hasAbility(unit, 'grenadePack')) return fail('У этого отряда нет гранатного налёта.')
      if (s.phase !== 'movement' || unit.move === 'none') return fail('Гранатный налёт — после движения отряда в фазе движения.')
      if (unit.grenadePackUsed) return fail('Гранатный налёт уже был в этот ход (раз за ход).')
      const target = findUnit(s, cmd.targetId)
      if (!target || isDestroyed(target) || target.owner === unit.owner) return fail('Недопустимая цель для гранатного налёта.')
      if (unitDistance(unit, target) > GRENADE_PACK_RANGE + 1e-6) return fail(`Гранатный налёт: цель дальше ${GRENADE_PACK_RANGE}″.`)
      if (!alive(unit).some((m) => seesAny(s, m, target))) return fail('Гранатный налёт: цель не видна.')
      return OK
    }
    case 'wraithForm': {
      if (!hasAbility(unit, 'wraithForm')) return fail('У этого отряда нет Фазовой формы (Wraith Form).')
      if (s.phase !== 'movement' || unit.move !== 'normal') return fail('Фазовая форма применяется сразу после обычного движения.')
      if (!unit.wraithTargets?.includes(cmd.targetId)) return fail('Отряд не пролетал сквозь эту цель в последнем движении.')
      return OK
    }
    case 'bombSquig': {
      if (!hasAbility(unit, 'bombSquig')) return fail('У этого отряда нет бомбосквига.')
      if (unit.bombSquigUsed) return fail('Бомбосквиг уже взорван в этой битве (раз за битву).')
      if (s.phase !== 'movement') return fail('Бомбосквиг выпускают в фазе движения.')
      if (unit.move !== 'normal') return fail('Бомбосквиг выпускают после обычного движения отряда (не после продвижения или отступления).')
      const target = findUnit(s, cmd.targetId)
      if (!target || isDestroyed(target) || target.owner === unit.owner) return fail('Недопустимая цель для бомбосквига.')
      if (unitDistance(unit, target) > BOMB_SQUIG_RANGE + 1e-6) return fail(`Бомбосквиг: цель дальше ${BOMB_SQUIG_RANGE}″.`)
      if (!alive(unit).some((m) => seesAny(s, m, target))) return fail('Бомбосквиг: цель не видна.')
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
      if (cmd.finestHour && !hasAbility(unit, 'finestHour')) return fail('У этого отряда нет способности «Звёздный час» (Finest Hour).')
      if (cmd.finestHour && unit.finestHourUsed) return fail('«Звёздный час» уже использован в этой битве (раз за битву).')
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
  const ld = psychicGuidance(s, u) ? Math.min(6, profileOf(alive(u)[0]).ld) : profileOf(alive(u)[0]).ld
  return { dice, total, ld, pass: total >= ld, label: `${synapse ? '3D6 (Synapse)' : '2D6'}${interference ? ` (помехи ${interference})` : ''}` }
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
  addLog(s, 'Оба игрока получают 1 очко командования (CP).', 'beginner')
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
    pushDice(s, `Боевой шок: ${u.name}`, [{ label, target: `${ld}+`, dice: dice.map((v) => ({ value: v, success: pass })), note: `Сумма ${total} против Ld ${ld}+` }],
      pass ? `${u.name}: проверка пройдена${was ? ' — боевой шок снят' : ''}.` : `${u.name}: провал — отряд в боевом шоке (OC = 0, отступление опасно).`)
    addLog(s, pass ? `${u.name} проходит проверку боевого шока (${total} ≥ ${ld}).` : `${u.name} проваливает проверку боевого шока (${total} < ${ld}) и получает Battle-shock.`, 'minimal')
  }
  s.shockPending = null
  updateObjectiveControl(s)
  // a mission scores at the end of the Command phase and of the turn (rules/missions.ts)
  if (s.mission) return
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
  // Disruption Bombardment lasts until the end of the disrupted unit's owner's turn
  for (const u of s.units) if (u.owner === s.activePlayer) delete u.disrupted
  updateObjectiveControl(s)
  missionTurnEnd(s)
  secondaryTurnEnd(s)
  checkWinner(s)
  if (s.winner) return
  const second = other(s, s.firstPlayer)
  if (s.activePlayer === second) {
    if (s.round >= s.maxRounds) {
      missionBattleEnd(s)
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
  missionTurnStart(s)
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
  pushDice(s, `Реанимация: ${u.name}`, [{ label: bonus ? `D3+${bonus}` : 'D3', target: '—', dice, note: `Лечение ${v} ран: восстановлено ${healed}, возвращено моделей ${revived}.` }],
    `${u.name}: ${source} — ${healed} ран восстановлено, ${revived} модел. возвращено.`)
  addLog(s, `${u.name}: ${source} — лечение ${bonus ? `D3+${bonus}` : 'D3'} = ${v}${healed ? `, восстановлено ран: ${healed}` : ''}${revived ? `, возвращено моделей: ${revived}` : ''}.`, 'standard')
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
  addLog(s, `Радиационная бомбардировка (Rad-Zone Corps): обстрел зоны расстановки противника — отрядов под ударом: ${targets.length}.`, 'minimal')
  for (const u of targets) {
    const cover = woundsOf(u) <= RAD_COVER_WOUNDS
    const v = r.d6()
    const hit = v >= (cover ? 5 : 3)
    if (cover) u.battleShocked = true
    const mw = hit ? rollDie(r, 'D3') : 0
    pushDice(s, `Радиационная бомбардировка: ${u.name}`, [{ label: 'D6', target: cover ? '5+' : '3+', dice: [{ value: v, success: hit }], note: cover ? 'Отряд залёг: боевой шок, на 5+ — D3 смертельных ран.' : 'Отряд держится: на 3+ — D3 смертельных ран.' }],
      `${u.name}: ${cover ? 'залёг (боевой шок)' : 'держится'}${hit ? ` — ${mw} смертельн. ран` : ' — без потерь'}.`)
    addLog(s, `${u.name}: ${cover ? 'залегает — отряд в боевом шоке' : 'держится'}${hit ? `, ${mw} смертельн. ран` : ', обстрел мимо'}.`, 'standard')
    if (mw) applyMortalWounds(s, u, mw, 'радиационная бомбардировка')
    if (isDestroyed(u)) addLog(s, `Отряд «${u.name}» уничтожен!`, 'minimal')
  }
  checkWinner(s)
}

/** Fallout, at the start of the Mechanicus Command phase in rounds 2–5: 3+ — 1 mortal wound and a Battle-shock test. */
function radFallout(s: GameState, r: Roller) {
  const targets = radTargets(s)
  if (!targets.length) return
  addLog(s, `Радиоактивные осадки (Rad-Zone Corps): отрядов в зоне расстановки противника — ${targets.length}.`, 'standard')
  for (const u of targets) {
    const v = r.d6()
    pushDice(s, `Радиоактивные осадки: ${u.name}`, [{ label: 'D6', target: '3+', dice: [{ value: v, success: v >= 3 }], note: '3+ — 1 смертельная рана и проверка боевого шока' }],
      v >= 3 ? `${u.name}: смертельная рана и проверка боевого шока.` : `${u.name}: без последствий.`)
    if (v < 3) continue
    applyMortalWounds(s, u, 1, 'радиоактивные осадки')
    if (isDestroyed(u)) { addLog(s, `Отряд «${u.name}» уничтожен!`, 'minimal'); continue }
    const t = leadershipRoll(s, u, r)
    if (!t.pass) u.battleShocked = true
    pushDice(s, `Боевой шок: ${u.name}`, [{ label: t.label, target: `${t.ld}+`, dice: t.dice.map((x) => ({ value: x, success: t.pass })), note: `Сумма ${t.total} против Ld ${t.ld}+` }],
      t.pass ? `${u.name}: проверка пройдена.` : `${u.name}: провал — отряд в боевом шоке.`)
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
  // Rites of Thermal Appeasement (Hellblasters): +1 to Hazardous rolls, so only a 1 fails
  const failOn = hasAbility(u, 'thermalAppeasement') ? 1 : 2
  const failed = dice.filter((v) => v <= failOn).length
  pushDice(s, `Опасность (Hazard): ${u.name}`, [{ label: 'Hazard', target: `${failOn + 1}+`, dice: dice.map((v) => ({ value: v, success: v > failOn })), note: `${why}: ${failOn === 1 ? '1 (Rites of Thermal Appeasement +1)' : '1–2'} = 1 смертельная рана` }],
    failed ? `${failed} провал(а) — смертельные раны.` : 'Все броски опасности пройдены.')
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
      addLog(s, `${FACTION_NAME[s.reaction!.player]}: без реакции.`, 'beginner')
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
    case 'startAction': {
      const u = findUnit(s, cmd.unitId)!
      const id = PRIMARY[s.mission!.primary].action!
      u.action = { id, objectiveId: cmd.objectiveId }
      u.shot = true
      const n = s.objectives.findIndex((o) => o.id === cmd.objectiveId) + 1
      addLog(s, `${u.name} начинает действие «${MISSION_ACTION[id].name}» у цели Ц${n}: в этот ход отряд не стреляет и не атакует; действие завершится в конце хода, если цель останется за вами.`, 'minimal')
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
    case 'doctrine': {
      const p = s.players.marines
      p.doctrine = cmd.doctrine
      p.doctrinesUsed = [...(p.doctrinesUsed ?? []), cmd.doctrine]
      addLog(s, `Боевая доктрина «${DOCTRINE_NAME[cmd.doctrine]}»: до следующей фазы командования ${DOCTRINE_TEXT[cmd.doctrine]}.`, 'minimal')
      break
    }
    case 'hyperAdaptation':
      s.players.tyranids.hyperAdaptation = cmd.choice
      addLog(s, `Тираниды: гиперадаптация «${HYPER_NAME[cmd.choice]}» на всю битву — ${HYPER_TEXT[cmd.choice]}.`, 'minimal')
      break
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
    case 'engrammatic': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      u.engrammaticUsed = true
      t.battleShocked = false
      addLog(s, `${u.name}: Энграмматическая логика — «${t.name}» выходит из боевого шока.`, 'minimal')
      break
    }
    case 'grenadePack': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      u.grenadePackUsed = true
      const dice = rollMany(r, alive(u).length)
      const n = Math.min(6, dice.filter((v) => v >= 4).length)
      pushDice(s, `Гранатный налёт: ${u.name} → ${t.name}`, [{ label: 'D6 за модель', target: '4+', dice: dice.map((v) => ({ value: v, success: v >= 4 })), note: `Каждая 4+ — 1 смертельная рана (не больше 6): ${n}.` }],
        n ? `${u.name} забрасывает «${t.name}» гранатами: ${n} смертельн. ран.` : `Гранаты «${u.name}» не причинили вреда «${t.name}».`)
      if (n) applyMortalWounds(s, t, n, `гранатный налёт «${u.name}»`)
      if (isDestroyed(t)) addLog(s, `Отряд «${t.name}» уничтожен!`, 'minimal')
      checkWinner(s)
      break
    }
    case 'wraithForm': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      delete u.wraithTargets
      const dice = rollMany(r, alive(u).length)
      const n = dice.filter((v) => v >= 4).length
      pushDice(s, `Фазовая форма: ${u.name} → ${t.name}`, [{ label: 'D6 за модель', target: '4+', dice: dice.map((v) => ({ value: v, success: v >= 4 })), note: `Каждая 4+ — 1 смертельная рана: ${n}.` }],
        n ? `${u.name} проходит сквозь «${t.name}»: ${n} смертельн. ран.` : `${u.name} проходит сквозь «${t.name}» без вреда.`)
      if (n) applyMortalWounds(s, t, n, `Фазовая форма «${u.name}»`)
      if (isDestroyed(t)) addLog(s, `Отряд «${t.name}» уничтожен!`, 'minimal')
      checkWinner(s)
      break
    }
    case 'bombSquig': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      u.bombSquigUsed = true
      const v = r.d6()
      if (v < 3) {
        pushDice(s, `Бомбосквиг: ${u.name}`, [{ label: 'D6', target: '3+', dice: [{ value: v, success: false }], note: 'На 3+ сквиг добегает и взрывается.' }], `Сквиг «${u.name}» не добежал до «${t.name}».`)
        addLog(s, `${u.name}: бомбосквиг не добежал до «${t.name}» (выпало ${v}).`, 'standard')
        break
      }
      const n = rollDie(r, 'D3')
      pushDice(s, `Бомбосквиг: ${u.name}`, [{ label: 'D6', target: '3+', dice: [{ value: v, success: true }], note: `Взрыв: ${n} смертельн. ран.` }], `Бомбосквиг взрывается у «${t.name}».`)
      applyMortalWounds(s, t, n, `бомбосквиг «${u.name}»`)
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
      pushDice(s, `Продвижение: ${u.name}`, [{ label: 'D6', target: '—', dice: [{ value: v2, success: true, rerolledFrom: prev ?? undefined }], note: prev ? `Переброс (${hasAbility(u, 'waaagh') ? 'Waaagh!' : 'Superlative Strategist'}): было ${prev}` : undefined }],
        `${u.name}: продвижение (Advance) на M + ${v2}". После продвижения отряд не может атаковать (charge) и стреляет только оружием Assault.`)
      addLog(s, `${u.name} продвигается: бросок D6 = ${v2}.`, 'minimal')
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
        addLog(s, `${u.name}: Swift as the Wind — +${swiftBonusOf(s, u.owner)}″ к движению (жетон Боевого фокуса, осталось ${s.players[u.owner].focus}).`, 'standard')
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
    case 'shoot':
      if (!openTargetReaction(s, cmd)) attack(s, cmd, r)
      break
    case 'rerollChoice': {
      const pr = s.pendingReroll!
      s.pendingReroll = null
      if (!cmd.reroll) addLog(s, `${FACTION_NAME[pr.player]}: без переброса.`, 'beginner')
      attack(s, pr.cmd, r, pr.dice, { ...pr.decided, [pr.dice.length - 1]: cmd.reroll })
      break
    }
    case 'declareCharge': {
      const u = findUnit(s, cmd.unitId)!
      u.chargeDeclared = true
      const dice = rollMany(r, 2)
      const roll = Math.max(0, dice[0] + dice[1] - (u.disrupted ? DISRUPTION : 0))
      const targets = chargeTargetsFor(s, u, roll)
      pushDice(s, `Бросок атаки: ${u.name}`, [{ label: '2D6', target: '—', dice: dice.map((x) => ({ value: x, success: targets.length > 0 })), note: `Максимальная дистанция атаки ${roll}"${u.disrupted ? ` (−${DISRUPTION}: Disruption Bombardment)` : ''}` }],
        targets.length ? `Бросок ${roll}": доступные цели — ${targets.map((x) => x.name).join(', ')}.` : `Бросок ${roll}" — недостаточно, атака провалена.`)
      s.lastCharge = { unitId: u.id, dice }
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
  addLog(s, `${u.name} сражается с отрядом «${t.name}»${cmd.finestHour ? ' — «Звёздный час»: +3 атаки, Devastating Wounds' : ''}.`, 'minimal')
  for (const g of groups) {
    if (isDestroyed(t)) break
    const res = resolveGroup(r, u.name, g, t, g.ctx, reroll)
    pushDice(s, `Бой: ${u.name} → ${t.name}: ${g.weaponName}${g.notes.length ? ` [${g.notes.join(', ')}]` : ''}`, res.steps, res.summary)
    addLog(s, res.summary, 'standard')
  }
  if (!groups.length) addLog(s, `${u.name}: ни одна модель не в зоне контакта (${ENGAGEMENT_RANGE}").`, 'standard')
  lastStand(s, u, t, before, r)
  deadlyDemise(s, before, r)
  if (isDestroyed(t)) addLog(s, `Отряд «${t.name}» уничтожен!`, 'minimal')
  checkWinner(s)
  s.fight!.selecting = other(s, s.fight!.selecting)
  advanceFight(s)
}

// ---------------------------------------------------------------- Command Re-roll in the middle of an attack

/** Expected damage a single re-roll must add (or prevent) before the game stops to offer it. */
export const REROLL_WORTH = 1.5
const REROLL_KIND: Record<RerollKind, string> = { attacks: 'число атак', hit: 'попадание', wound: 'ранение', save: 'спасбросок', damage: 'урон' }

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
  addLog(s, `${FACTION_NAME[me]}: стратагема «Командный переброс» — ${u.name} перебрасывает ${REROLL_KIND[kind]} (выпало «${value}»), −${STRATAGEMS.commandReroll.cost} CP.`, 'minimal')
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
  pushDice(s, `${info.name}: ${t.name}`, [{ label: 'D6', target: bonus ? '3+' : '4+', dice: dice.map((v) => ({ value: v, success: v + bonus >= 4 })), note: `Убито моделей: ${fallen.length}; успевают ударить перед смертью: ${saved.length}${bonus ? ' (+1: WAAAGH!)' : ''}` }],
    saved.length ? `${t.name}: ${saved.length} павш. модел. успевают ударить.` : `${t.name}: павшие не успели ударить.`)
  if (!saved.length || isDestroyed(attacker)) return
  const groups = meleePlan(s, t, attacker, saved)
  if (!groups.length) { addLog(s, `${t.name}: павшие модели не были в зоне контакта с «${attacker.name}» — ударить некому.`, 'standard'); return }
  addLog(s, `${t.name}: «${info.name}» — ${saved.length} павш. модел. бьют «${attacker.name}» перед смертью.`, 'minimal')
  for (const g of groups) {
    if (isDestroyed(attacker)) break
    const res = resolveGroup(r, t.name, g, attacker, g.ctx)
    pushDice(s, `${info.name}: ${t.name} → ${attacker.name}: ${g.weaponName}${g.notes.length ? ` [${g.notes.join(', ')}]` : ''}`, res.steps, res.summary)
    addLog(s, res.summary, 'standard')
  }
  if (isDestroyed(attacker)) addLog(s, `Отряд «${attacker.name}» уничтожен!`, 'minimal')
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
  pushDice(s, 'Бросок за первый ход', [{ label: `${FACTION_NAME[west]} / ${FACTION_NAME[east]}`, target: '—', dice: rolls.map((v) => ({ value: v, success: true })) }], `Первым ходит: ${FACTION_NAME[s.firstPlayer]}.`)
  addLog(s, `===== Раунд 1 ===== Первым ходит: ${FACTION_NAME[s.firstPlayer]}.`, 'minimal')
  if (s.mission) addLog(s, `Основная миссия (обе стороны): ${PRIMARY[s.mission.primary].name} (${PRIMARY[s.mission.primary].nameEn}).`, 'minimal')
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
    add('advance', 'Объявить продвижение (Advance): M + D6', { type: 'declareAdvance', unitId })
    add('reroll', 'Перебросить продвижение (Waaagh!)', { type: 'rerollAdvance', unitId })
    if (hasAbility(u, 'guide'))
      for (const e of enemiesOf(s, u)) add(`guide:${e.id}`, `Guide: пометить «${e.name}»`, { type: 'guide', unitId, targetId: e.id })
    if (hasAbility(u, 'grenadePack') && !u.grenadePackUsed && u.move !== 'none')
      for (const e of enemiesOf(s, u)) add(`grenade:${e.id}`, `💥 Гранатный налёт на «${e.name}» (D6 за модель, 4+ — смертельная рана)`, { type: 'grenadePack', unitId, targetId: e.id })
    for (const id of u.wraithTargets ?? []) add(`wraith:${id}`, `👻 Фазовая форма сквозь «${findUnit(s, id)?.name ?? id}» (D6 за модель, 4+ — смертельная рана)`, { type: 'wraithForm', unitId, targetId: id })
    if (hasAbility(u, 'bombSquig') && !u.bombSquigUsed && u.move === 'normal')
      for (const e of enemiesOf(s, u)) add(`squig:${e.id}`, `💣 Бомбосквиг в «${e.name}» (3+: D3 смертельн. ран)`, { type: 'bombSquig', unitId, targetId: e.id })
  }
  if (hasAbility(u, 'engrammaticLogic') && !u.engrammaticUsed)
    for (const f of s.units.filter((x) => x.owner === u.owner && !isDestroyed(x) && x.battleShocked))
      add(`engram:${f.id}`, `Энграмматическая логика: снять боевой шок с «${f.name}» (раз за битву)`, { type: 'engrammatic', unitId, targetId: f.id })
  if (hasAbility(u, 'defendDivineWork')) add('divineWork', 'Защита божественного труда (4+ инвуль, раз за битву)', { type: 'divineWork', unitId })
  if (s.phase === 'shooting') {
    const act = s.mission && PRIMARY[s.mission.primary].action
    if (act)
      s.objectives.forEach((o, i) => {
        if (unitNearObjective(u, o))
          add(`action:${o.id}`, `🛰 Действие «${MISSION_ACTION[act].name}» у цели Ц${i + 1} (вместо стрельбы)`, { type: 'startAction', unitId, objectiveId: o.id })
      })
    for (const e of enemiesOf(s, u)) add(`shoot:${e.id}`, `Стрелять по «${e.name}»`, { type: 'shoot', unitId, targetId: e.id })
  }
  if (s.phase === 'charge') {
    if (s.pendingCharge?.unitId === unitId) {
      for (const t of s.pendingCharge.targets) add(`charge:${t}`, `Атаковать «${findUnit(s, t)!.name}»`, { type: 'chargeMove', unitId, targetIds: [t] })
      add('skipCharge', 'Отказаться от перемещения', { type: 'skipCharge', unitId })
    } else add('declareCharge', 'Объявить атаку (Charge): бросок 2D6', { type: 'declareCharge', unitId })
  }
  if (s.phase === 'fight')
    for (const e of enemiesOf(s, u)) {
      add(`fight:${e.id}`, `Сражаться с «${e.name}»`, { type: 'fight', unitId, targetId: e.id })
      if (hasAbility(u, 'finestHour') && !u.finestHourUsed)
        add(`finest:${e.id}`, `⭐ Сражаться с «${e.name}» — Звёздный час (+3 A, Devastating Wounds, раз за битву)`, { type: 'fight', unitId, targetId: e.id, finestHour: true })
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
  strat('strat:reroll', `🎲 Командный переброс (${cost('commandReroll')}): перебросить ${s.phase === 'charge' ? 'бросок атаки' : 'продвижение'}`, { type: 'stratagem', id: 'commandReroll', unitId })
  strat('strat:bravery', `🦁 Безумная храбрость (${cost('insaneBravery')}): снять боевой шок, раз за битву`, { type: 'stratagem', id: 'insaneBravery', unitId })
  for (const e of enemiesOf(s, u)) {
    strat(`strat:explosives:${e.id}`, `💣 Взрывчатка (${cost('explosives')}) в «${e.name}»: 6D6, 4+ — смертельная рана`, { type: 'stratagem', id: 'explosives', unitId, targetId: e.id })
    strat(`strat:crush:${e.id}`, `🐘 Сокрушительный удар (${cost('crushingImpact')}) по «${e.name}»: D6 × Стойкость, 5+ — рана врагу, 1 — себе`, { type: 'stratagem', id: 'crushingImpact', unitId, targetId: e.id })
  }
  // the army's own (detachment) Stratagems
  for (const info of Object.values(STRATAGEMS)) {
    if (info.faction !== u.owner) continue
    // Extinction Order: only objectives with an enemy unit on them (elsewhere it does nothing)
    if (info.id === 'extinctionOrder') {
      s.objectives.forEach((o, i) => {
        if (enemiesOf(s, u).some((e) => alive(e).length > 0 && unitNearObjective(e, o)))
          strat(`strat:${info.id}:${o.id}`, `📜 ${info.name} (${info.cost} CP): цель Ц${i + 1}`, { type: 'stratagem', id: info.id, unitId, targetId: o.id })
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
  addLog(s, `${u.name} ${snap ? 'ведёт огонь на опережение по' : 'стреляет по'} отряду «${t.name}»${plan.cover ? ' (цель в укрытии: навык −1)' : ''}.`, 'minimal')
  for (const sk of plan.skipped) addLog(s, sk, 'beginner')
  let repulsed = 0
  let scored = false
  for (const g of plan.groups) {
    if (isDestroyed(t)) break
    const res = resolveGroup(r, u.name, g, t, g.ctx, reroll)
    repulsed += res.repulsed
    if (res.steps.some((st) => st.label === 'Попадание' && (st.target === 'авто' || st.dice.some((d) => d.success)))) scored = true
    pushDice(s, `${u.name} → ${t.name}: ${g.weaponName}${g.notes.length ? ` [${g.notes.join(', ')}]` : ''}`, res.steps, res.summary)
    addLog(s, res.summary, 'standard')
  }
  // Disruption Bombardment (Barbgaunts): an INFANTRY target it hit is disrupted until the end of its owner's next turn
  if (scored && hasAbility(u, 'disruptionBombardment') && !isDestroyed(t) && hasKeyword(t, 'INFANTRY') && !t.disrupted) {
    t.disrupted = true
    addLog(s, `${u.name}: «${t.name}» под подавляющим обстрелом (Disruption Bombardment) — до конца своего следующего хода −2″ к движению, −2 к броскам продвижения и атаки.`, 'standard')
  }
  // Driven from Cover (Infernus): the target it hit loses cover against this army's shooting until the end of the turn
  if (scored && hasAbility(u, 'drivenFromCover') && !isDestroyed(t) && t.drivenFromCover !== u.owner) {
    t.drivenFromCover = u.owner
    addLog(s, `${u.name}: «${t.name}» выкурен из укрытия (Driven from Cover) — до конца хода союзная стрельба по нему не учитывает укрытие.`, 'standard')
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
}

// ---------------------------------------------------------------- stratagems (stage 1: own turn only)

function stratagemProblem(s: GameState, unit: UnitState, cmd: Extract<Command, { type: 'stratagem' }>): Validation {
  const info = STRATAGEMS[cmd.id]
  if (!info) return fail('Неизвестная стратагема.')
  const me = unit.owner
  if (info.faction === me && !detachmentOn(s, me)) return fail(`«${info.name}» — стратагема детачмента, а армия собрана без детачмента: доступны только общие стратагемы.`)
  const turn = info.turn ?? 'own'
  if (turn === 'own' && s.activePlayer !== me) return fail(`«${info.name}» применяется только в свой ход.`)
  if (turn === 'opponent' && (s.reaction?.player !== me || s.reaction.window !== info.window))
    return fail(`«${info.name}» — реакция в ход противника: её предлагают в нужный момент его хода.`)
  if (info.window && (s.reaction?.window !== info.window || s.reaction.player !== me)) return fail(`«${info.name}» предлагается в нужный момент (окно перед действием), сейчас её применить нельзя.`)
  if (!info.phases.includes(s.phase)) return fail(`«${info.name}» применяется в фазе: ${info.phases.map((p) => PHASE_NAME[p]).join(' или ')}.`)
  if (s.players[me].cp < info.cost) return fail(`Не хватает очков командования: нужно ${info.cost} CP, есть ${s.players[me].cp}.`)
  if (usedThisPhase(s, me, cmd.id)) return fail(`«${info.name}» уже применялась в этой фазе (каждая стратагема — раз за фазу).`)
  if (info.faction && info.faction !== me) return fail(`«${info.name}» — стратагема другой армии.`)
  if (!meetsRequirement(unit, info)) return fail(`«${info.name}»: нужен ${info.requires!.label}.`)
  if (targetedThisPhase(s, unit)) return fail('На этот отряд уже применяли стратагему в этой фазе (одна стратагема на отряд за фазу).')
  if (cmd.id !== 'insaneBravery' && unit.battleShocked) return fail('Отряд в боевом шоке: на него нельзя применять стратагемы.')
  const target = cmd.targetId ? findUnit(s, cmd.targetId) : undefined
  switch (cmd.id) {
    case 'commandReroll': {
      if (s.phase === 'charge') return s.lastCharge?.unitId === unit.id ? OK : fail('Перебросить можно только что брошенный бросок атаки (charge) этого отряда.')
      if (unit.advanceRoll === null || unit.move !== 'none') return fail('Нет броска продвижения для переброса.')
      if (unit.advanceRerolled) return fail('Кубик нельзя перебрасывать больше одного раза.')
      return OK
    }
    case 'insaneBravery':
      // the engine rolls battle-shock tests automatically when the Command phase starts, so the Stratagem is offered
      // right after a failed test and turns it into a pass (see docs/stratagems.md)
      if (s.players[me].braveryUsed) return fail('«Безумная храбрость» уже применялась в этой битве (раз за битву).')
      return s.shockPending?.includes(unit.id) ? OK : fail('Только для отряда, которому сейчас предстоит проверка боевого шока.')
    case 'explosives': {
      if (unit.shot) return fail('Отряд уже стрелял в этой фазе.')
      if (unit.move === 'advance' || unit.move === 'fallBack') return fail('После продвижения или отступления взрывчатку не бросить.')
      if (isEngaged(s, unit)) return fail('Отряд в контакте с врагом.')
      if (!target || target.owner === me || isDestroyed(target)) return fail('Выберите вражеский отряд.')
      if (isEngaged(s, target)) return fail('Цель в контакте с другим отрядом — бросать в свалку нельзя.')
      if (!explosivesReach(unit, target)) return fail(`Взрывчатку бросают не дальше ${EXPLOSIVES_RANGE}″.`)
      if (!unitCanSee(s, unit, target)) return fail('Цель не видна: линию видимости перекрывает укрытие.')
      return OK
    }
    case 'fireOverwatch': {
      if (isEngaged(s, unit)) return fail('Отряд в контакте с врагом.')
      if (!target || target.owner === me || isDestroyed(target)) return fail('Выберите вражеский отряд.')
      if (unitDistance(unit, target) > OVERWATCH_RANGE + EPS) return fail(`Огонь на опережение — только по врагу в пределах ${OVERWATCH_RANGE}″.`)
      const plan = shootPlan(s, unit, target, { snap: true })
      return plan.problem ? fail(plan.problem) : OK
    }
    case 'smokescreen':
      return OK
    case 'heroicIntervention': {
      if (isEngaged(s, unit)) return fail('Отряд уже в контакте с врагом.')
      if (hasKeyword(unit, 'VEHICLE') && !hasKeyword(unit, 'CHARACTER', 'WALKER')) return fail('Технике перехват доступен, только если она персонаж или шагоход (WALKER).')
      if (!target || target.owner === me || isDestroyed(target)) return fail('Выберите вражеский отряд.')
      if (!target.charged) return fail('Перехват — только против отряда, который атаковал (charge) в эту фазу.')
      if (unitDistance(unit, target) > CHARGE_RANGE + EPS) return fail(`Враг дальше ${CHARGE_RANGE}″.`)
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
      if (s.reaction?.unitId !== unit.id) return fail(cmd.id === 'undyingLegions' ? 'Только для отряда, который только что потерял модели от атак врага.' : 'Только для отряда, который враг сейчас выбрал целью.')
      if (cmd.id === 'lightningFastReactions' && hasKeyword(unit, 'WRAITH CONSTRUCT')) return fail('Не для конструктов-призраков (WRAITH CONSTRUCT).')
      if (cmd.id === 'balefulHalo' && hasKeyword(unit, 'VEHICLE')) return fail('Не для техники (VEHICLE).')
      if (cmd.id === 'orksNeverBeaten' && hasKeyword(unit, 'TITANIC')) return fail('Не для TITANIC.')
      if (LAST_STAND.includes(cmd.id) && unit.fought) return fail('Отряд уже сражался в этой фазе.')
      if (cmd.id === 'undyingLegions' && !hasAbility(unit, 'reanimation')) return fail('У отряда нет протоколов реанимации.')
      if (cmd.id === 'undyingLegions' && !reanimationNeeded(unit)) return fail('Отряду нечего лечить.')
      return OK
    }
    case 'epicChallenge':
      return enemiesOf(s, unit).some((e) => validate(s, { type: 'fight', unitId: unit.id, targetId: e.id }).ok) ? OK : fail('Отряд сейчас не может сражаться.')
    case 'stormOfDevastation':
    case 'closeRangeDakka':
    case 'conqueringTyrant':
    case 'blitzingFirepower':
    case 'lethalDosage':
      return unit.shot ? fail('Отряд уже стрелял в этой фазе.') : OK
    case 'fungusFuelInjection':
      return unit.move === 'none' ? OK : fail('Отряд уже двигался в этой фазе.')
    case 'suddenStorm':
      return OK
    case 'feignedRetreat':
      return unit.move === 'fallBack' ? OK : fail('Только для отряда, который отступил (Fall Back) в этой фазе.')
    case 'aggressorImperative':
      if (unit.move !== 'none' || unit.advanceRoll !== null) return fail('Отряд уже двигался или объявил продвижение.')
      return isEngaged(s, unit) ? fail('Отряд в контакте с врагом — продвигаться нельзя.') : OK
    case 'hitEmHarder':
    case 'hungryVoid':
    case 'adrenalSurge':
      return enemiesOf(s, unit).some((e) => validate(s, { type: 'fight', unitId: unit.id, targetId: e.id }).ok) ? OK : fail('Отряд сейчас не может сражаться.')
    case 'extinctionOrder': {
      const o = s.objectives.find((x) => x.id === cmd.targetId)
      if (!o) return fail('Выберите цель на поле.')
      if (Math.min(...alive(unit).map((m) => dist(m.pos, o.pos))) > EXTINCTION_RANGE + EPS) return fail(`Цель дальше ${EXTINCTION_RANGE}″ от Техножреца.`)
      return OK
    }
    case 'crushingImpact': {
      if (!unit.charged) return fail('Применяется после того, как этот отряд завершил атаку (charge).')
      if (!target || target.owner === me || isDestroyed(target)) return fail('Выберите вражеский отряд.')
      if (!engagedUnits(s, unit).some((e) => e.id === target.id)) return fail('Цель должна быть в контакте с техникой.')
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
  return out
}

/** Open a reaction window for the player whose turn it is not, if they have a reaction to use; true when opened. */
function openReaction(s: GameState, window: ReactionWindow, next: Phase, player = other(s, s.activePlayer), about: { unitId?: string; attack?: PendingReroll['cmd'] } = {}): boolean {
  s.reaction = { player, window, next, ...about }
  if (reactionCommands(s).length) {
    const u = about.unitId ? findUnit(s, about.unitId)! : undefined
    const text = window === 'beforeShockTests' ? `${FACTION_NAME[player]}: перед проверками боевого шока можно применить «Безумную храбрость».`
      : window === 'onTargeted' ? `${FACTION_NAME[player]}: отряд «${u!.name}» выбран целью — можно ответить стратагемой до бросков.`
      : window === 'afterAttacks' ? `${FACTION_NAME[player]}: отряд «${u!.name}» потерял модели — можно запустить реанимацию стратагемой.`
      : `${FACTION_NAME[player]} может ответить реакцией (стратагемой в ход противника).`
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
  addLog(s, `${FACTION_NAME[me]}: стратагема «${info.name}» (${info.nameEn}) — ${u.name}, −${info.cost} CP.`, 'minimal')
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
      pushDice(s, `Героический перехват: ${u.name} → ${t!.name}`, [{ label: '2D6', target: '—', dice: dice.map((x) => ({ value: x, success: !!pos })), note: `Нужно ${fmt(d)}", выпало ${roll}"` }],
        pos ? `${u.name} врывается в бой с «${t!.name}».` : `${u.name} не успевает: выпало ${roll}", а нужно ${fmt(d)}".`)
      if (pos) {
        movedTo(u, pos)
        addLog(s, `${u.name}: героический перехват — отряд врывается в бой с «${t!.name}» (без «Бьёт первым»).`, 'minimal')
      } else addLog(s, `${u.name}: героический перехват не удался — выпало ${roll}", а до врага ${fmt(d)}".`, 'minimal')
      break
    }
    case 'aggressorImperative': {
      u.advanceRoll = 6
      u.advanceRerolled = true
      addLog(s, `${u.name}: продвижение без броска — M + 6".`, 'minimal')
      break
    }
    case 'extinctionOrder': {
      const o = s.objectives.find((x) => x.id === cmd.targetId)!
      const foes = enemiesOf(s, u).filter((e) => alive(e).length && unitNearObjective(e, o))
      if (!foes.length) addLog(s, 'На этой цели нет вражеских отрядов — приказ ничего не дал.', 'minimal')
      for (const e of foes) {
        const v = r.d6()
        pushDice(s, `Приказ об истреблении: ${e.name}`, [{ label: 'D6', target: '4+', dice: [{ value: v, success: v >= 4 }], note: '4+ — смертельная рана и проверка боевого шока' }],
          v >= 4 ? `${e.name}: смертельная рана и проверка боевого шока.` : `${e.name}: без последствий.`)
        if (v < 4) continue
        applyMortalWounds(s, e, 1, `приказ об истреблении «${u.name}»`)
        if (isDestroyed(e)) { addLog(s, `Отряд «${e.name}» уничтожен!`, 'minimal'); continue }
        const { dice, total, ld, pass, label } = leadershipRoll(s, e, r)
        if (!pass) e.battleShocked = true
        pushDice(s, `Боевой шок: ${e.name}`, [{ label, target: `${ld}+`, dice: dice.map((x) => ({ value: x, success: pass })), note: `Сумма ${total} против Ld ${ld}+` }],
          pass ? `${e.name}: проверка пройдена.` : `${e.name}: провал — отряд в боевом шоке.`)
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
        pushDice(s, `Командный переброс атаки: ${u.name}`, [{ label: '2D6', target: '—', dice: dice.map((x, i) => ({ value: x, success: targets.length > 0, rerolledFrom: prev[i] })), note: `Было ${prev[0] + prev[1]}, стало ${roll}"` }],
          targets.length ? `Переброс: ${roll}" — доступные цели: ${targets.map((x) => x.name).join(', ')}.` : `Переброс: ${roll}" — снова недостаточно, атака провалена.`)
        if (targets.length) s.pendingCharge = { unitId: u.id, roll, dice, targets: targets.map((x) => x.id) }
        else {
          s.pendingCharge = null
          addLog(s, `${u.name}: после переброса выпало ${roll}" — атака провалена.`, 'minimal')
        }
      } else {
        const prev = u.advanceRoll
        const v2 = r.d6()
        u.advanceRoll = v2
        u.advanceRerolled = true
        pushDice(s, `Командный переброс продвижения: ${u.name}`, [{ label: 'D6', target: '—', dice: [{ value: v2, success: true, rerolledFrom: prev ?? undefined }], note: `Было ${prev}` }], `${u.name}: продвижение теперь M + ${v2}".`)
        addLog(s, `${u.name}: переброс продвижения — D6 = ${v2}.`, 'minimal')
      }
      break
    }
    case 'undyingLegions':
      reanimateUnit(s, u, r, isLed(s, u) ? 1 : 0, '«Протокол бессмертных легионов»')
      break
    case 'insaneBravery': {
      const was = u.battleShocked
      u.battleShocked = false
      s.players[me].braveryUsed = true
      s.shockPending = (s.shockPending ?? []).filter((id) => id !== u.id)
      addLog(s, `${u.name}: проверка боевого шока автоматически пройдена${was ? ' — боевой шок снят' : ''}.`, 'minimal')
      break
    }
    case 'explosives': {
      u.shot = true
      const dice = rollMany(r, EXPLOSIVES_DICE)
      const n = dice.filter((v) => v >= 4).length
      pushDice(s, `Взрывчатка: ${u.name} → ${t!.name}`, [{ label: `${EXPLOSIVES_DICE}D6`, target: '4+', dice: dice.map((v) => ({ value: v, success: v >= 4 })), note: `Каждая 4+ — 1 смертельная рана: ${n}.` }],
        n ? `${u.name} бросает взрывчатку в «${t!.name}»: ${n} смертельн. ран.` : `Взрывчатка «${u.name}» не причинила вреда «${t!.name}».`)
      if (n) applyMortalWounds(s, t!, n, `взрывчатка «${u.name}»`)
      if (isDestroyed(t!)) addLog(s, `Отряд «${t!.name}» уничтожен!`, 'minimal')
      checkWinner(s)
      break
    }
    case 'crushingImpact': {
      // the model with the highest Toughness among those engaged with the target
      const T = Math.max(...alive(u).filter((m) => modelEngagedWith(m, t!)).map((m) => profileOf(m).t))
      const dice = rollMany(r, T)
      const hit = Math.min(CRUSHING_MAX, dice.filter((v) => v >= 5).length)
      const self = Math.min(CRUSHING_MAX, dice.filter((v) => v === 1).length)
      pushDice(s, `Сокрушительный удар: ${u.name} → ${t!.name}`, [{ label: `${T}D6 (Стойкость)`, target: '5+', dice: dice.map((v) => ({ value: v, success: v >= 5 })), note: `5+ — рана врагу: ${hit}; 1 — рана себе: ${self} (не больше ${CRUSHING_MAX} каждому).` }],
        `${u.name} врезается в «${t!.name}»: ${hit} смертельн. ран врагу${self ? `, ${self} — себе` : ''}.`)
      if (hit) applyMortalWounds(s, t!, hit, `сокрушительный удар «${u.name}»`)
      if (self) applyMortalWounds(s, u, self, 'отдача сокрушительного удара')
      if (isDestroyed(t!)) addLog(s, `Отряд «${t!.name}» уничтожен!`, 'minimal')
      if (isDestroyed(u)) addLog(s, `Отряд «${u.name}» уничтожен!`, 'minimal')
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

