import { DATASHEETS } from '../data/datasheets'
import { alive, isDestroyed, unitDistance, unitKeywords } from '../gameState'
import type { GameState, Phase, PlayerId, ReactionWindow, StratagemId, UnitState } from '../types'
import { locale, tr } from '../../i18n/index'

// Core Stratagems of the 11th edition that a player uses in their own turn (stage 1: no reactions in the opponent's
// turn yet). Each costs Command points (CP). A battle-shocked unit cannot be targeted by Stratagems (core rules
// 01.07), a unit can be targeted by one Stratagem per phase, and each Stratagem is used once per phase. Validation and
// effects live in the engine (validate / apply, command type 'stratagem'); this module holds the data and shared checks.

export interface StratagemInfo {
  id: StratagemId
  name: string
  nameEn: string
  cost: number
  phases: Phase[]
  /** what it does, in plain words */
  text: string
  /** when it pays off, for beginners */
  when: string
  /** the unit it targets must match: at least one group, every keyword of that group (datasheet keywords) */
  requires?: Requirement
  /** only this army has it (faction / detachment Stratagems); absent = every army */
  faction?: PlayerId
  /** whose turn: your own (default), either player's while it is your decision (selecting a unit to fight), or the
   * opponent's — a reaction, offered in a reaction window */
  turn?: 'own' | 'either' | 'opponent'
  /** for reactions: the window it is offered in */
  window?: ReactionWindow
  /** a lasting effect on the unit: until the end of the phase or of the turn (read by the engine's attack/move rules) */
  buff?: 'phase' | 'turn'
}

export interface Requirement {
  /** alternatives: [['EXPLOSIVES'], ['GRENADES']] = EXPLOSIVES or GRENADES; [['INFANTRY', 'SKITARII']] = both */
  any: string[][]
  /** for the player: "unit with EXPLOSIVES or GRENADES" */
  label: string
}

const matchesKeywords = (keywords: string[], r: Requirement) => r.any.some((group) => group.every((k) => keywords.includes(k)))

/** The unit fits the Stratagem's unit requirement (or the Stratagem has none). */
export const meetsRequirement = (u: UnitState, info: StratagemInfo) => !info.requires || matchesKeywords(unitKeywords(u), info.requires)

export interface Availability {
  info: StratagemInfo
  available: boolean
  /** why not, for the army screen: "no unit with EXPLOSIVES or GRENADES" */
  why?: string
}

/** Which Stratagems an army can use at all, given its datasheets: core ones plus its own faction's. */
export function stratagemAvailability(faction: PlayerId, datasheetIds: string[], noDetachment = false): Availability[] {
  const keywords = datasheetIds.map((id) => DATASHEETS[id]?.keywords ?? [])
  return Object.values(STRATAGEMS)
    .filter((info) => !info.faction || info.faction === faction)
    .map((info) => {
      if (info.faction && noDetachment) return { info, available: false, why: tr('army without a detachment: only shared Stratagems') }
      const ok = !info.requires || keywords.some((k) => matchesKeywords(k, info.requires!))
      return ok ? { info, available: true } : { info, available: false, why: tr('no unit: {label} needed', { label: info.requires!.label }) }
    })
}

export const STRATAGEMS = {
  commandReroll: {
    id: 'commandReroll',
    name: tr('Command Re-roll'),
    nameEn: 'Command Re-roll',
    cost: 1,
    phases: ['movement', 'charge'],
    text: tr('Re-roll the unit’s Advance roll or charge roll (both dice) that was just made. In the middle of an attack — one die: hit, wound, damage, number of attacks or save (the game will ask when it is worth it).'),
    when: tr('When the charge fell short by 1–3″ or the Advance came out too short, and an important objective depends on it.'),
  },
  insaneBravery: {
    id: 'insaneBravery',
    name: tr('Insane Bravery'),
    nameEn: 'Insane Bravery',
    cost: 1,
    phases: ['command'], window: 'beforeShockTests',
    text: tr('Before this unit’s Battle-shock test in your Command phase: the test is passed automatically (no roll needed). Once per battle.'),
    when: tr('When a unit on an objective is about to take the test and the chance of failing is high: in shock its OC = 0 and it will not hold the objective.'),
  },
  explosives: {
    id: 'explosives',
    name: tr('Explosives'),
    nameEn: 'Explosives',
    cost: 1,
    phases: ['shooting'],
    text: tr('A unit with the EXPLOSIVES (or GRENADES) keyword, instead of shooting, throws 6D6 at a visible enemy no farther than 8″, not in engagement range: each 4+ is a mortal wound.'),
    when: tr('When the unit’s normal shooting deals fewer than ~3 wounds, for example against an armoured target: mortal wounds go through any armour.'),
    requires: { any: [['EXPLOSIVES'], ['GRENADES']], label: tr('unit with EXPLOSIVES or GRENADES') },
  },
  crushingImpact: {
    id: 'crushingImpact',
    name: tr('Crushing Blow'),
    nameEn: 'Crushing Impact',
    cost: 1,
    phases: ['charge'],
    text: tr('A Monster or Vehicle after a charge rolls as many D6 as its Toughness: each 5+ is a mortal wound to an enemy in engagement range, each 1 — to its own unit (max 6 each).'),
    when: tr('Almost always when your Monster or Vehicle has slammed into an enemy and you have CP: on average a third of the dice wound the enemy.'),
    requires: { any: [['MONSTER'], ['VEHICLE']], label: tr('Monster or vehicle (MONSTER, VEHICLE)') },
  },
} as Record<StratagemId, StratagemInfo>

export const EXPLOSIVES_RANGE = 8
export const EXPLOSIVES_DICE = 6
/** Crushing Impact: at most this many mortal wounds per unit (the enemy's and your own) */
export const CRUSHING_MAX = 6

export const hasExplosives = (u: UnitState) => meetsRequirement(u, STRATAGEMS.explosives)

/** Used this phase by this player (each Stratagem once per phase). */
export const usedThisPhase = (s: GameState, p: PlayerId, id: StratagemId) => (s.players[p].stratagemsThisPhase ?? []).includes(id)

/** The unit was already the target of a Stratagem this phase (one per unit per phase). */
export const targetedThisPhase = (s: GameState, u: UnitState) => (s.players[u.owner].stratagemUnitsThisPhase ?? []).includes(u.id)

/** Explosives reach: an enemy unit within 8″ (visibility is checked by the engine). */
export const explosivesReach = (u: UnitState, e: UnitState) => !isDestroyed(e) && alive(e).length > 0 && unitDistance(u, e) <= EXPLOSIVES_RANGE + 1e-9

// ---------------------------------------------------------------- army (detachment) Stratagems

/** The detachment each army plays here: the generic one of its 11th edition faction page (Wahapedia). */
export const DETACHMENT: Record<PlayerId, string> = {
  marines: 'Gladius Task Force',
  orks: 'War Horde',
  tyranids: 'Invasion Fleet',
  necrons: 'Awakened Dynasty',
  aeldari: 'Warhost',
  adeptus_mechanicus: 'Rad-Zone Corps',
}

export const FACTION_STRATAGEMS: StratagemInfo[] = [
  {
    id: 'stormOfDevastation', faction: 'marines', name: tr('Devastating Storm'), nameEn: 'Storm of Devastation', cost: 1, phases: ['shooting'], buff: 'phase',
    text: tr('A unit that has not shot yet: until the end of the phase its ranged weapons ignore cover (Ignores Cover).'),
    when: tr('When the target sits in ruins or a crater: cover makes your shooting skill 1 worse.'),
  },
  {
    id: 'closeRangeDakka', faction: 'orks', name: tr('Close-range Dakka'), nameEn: 'Close-Range Dakka', cost: 1, phases: ['shooting'], buff: 'phase',
    text: tr('A unit that has not shot yet: until the end of the phase its ranged weapons get Rapid Fire 1 (or +1 to what they have) — an extra attack at half range.'),
    when: tr('When a big unit of Boyz stands at half range of its guns from the target.'),
  },
  {
    id: 'fungusFuelInjection', faction: 'orks', name: tr('Fungus Fuel'), nameEn: 'Fungus-Fuel Injection', cost: 1, phases: ['movement'], buff: 'phase',
    text: tr('A vehicle or mounted unit (VEHICLE, MOUNTED) that has not moved yet: +2″ to movement in this phase.'),
    when: tr('When a Deff Dread is a couple of inches short of an objective or charge range.'),
    requires: { any: [['VEHICLE'], ['MOUNTED']], label: tr('vehicle or mounted unit (VEHICLE, MOUNTED)') },
  },
  {
    id: 'hitEmHarder', faction: 'orks', name: tr('Hit ’Em Harder!'), nameEn: "Hit 'Em Harder", cost: 1, phases: ['fight'], turn: 'either', buff: 'phase',
    text: tr('A unit that is about to fight: its melee weapons get Lethal Hits — a 6 to hit wounds at once.'),
    when: tr('Against tough targets (vehicles, monsters, heavy infantry) where ordinary wounds go badly.'),
  },
  {
    id: 'adrenalSurge', faction: 'tyranids', name: tr('Adrenal Surge'), nameEn: 'Adrenal Surge', cost: 2, phases: ['fight'], buff: 'phase',
    text: tr('In your Fight phase a unit that has not fought yet: until the end of the phase a hit on 5+ counts as critical (Sustained and Lethal Hits trigger more often). Here — one unit at a time.'),
    when: tr('For a unit with Sustained or Lethal Hits that is about to strike an important target.'),
  },
  {
    id: 'suddenStorm', faction: 'necrons', name: tr('Sudden Storm Protocol'), nameEn: 'Protocol of the Sudden Storm', cost: 1, phases: ['movement'], buff: 'turn',
    text: tr('Until the end of the turn the unit’s ranged weapons get Assault: after an Advance it still shoots with all its weapons.'),
    when: tr('When you need to take an objective quickly without losing your shooting.'),
  },
  {
    id: 'conqueringTyrant', faction: 'necrons', name: tr('Conqueror Tyrant Protocol'), nameEn: 'Protocol of the Conquering Tyrant', cost: 1, phases: ['shooting'], buff: 'phase',
    text: tr('A unit that has not shot yet: against targets at half weapon range — re-roll hit rolls of 1, and if the unit is led by a character — re-roll any misses.'),
    when: tr('When a unit with a character shoots at a close target.'),
  },
  {
    id: 'hungryVoid', faction: 'necrons', name: tr('Hungry Void Protocol'), nameEn: 'Protocol of the Hungry Void', cost: 1, phases: ['fight'], turn: 'either', buff: 'phase',
    text: tr('A unit that has not fought yet: +1 to the Strength of its melee weapons, and if the unit is led by a character — another +1 to armour penetration (AP).'),
    when: tr('When Strength is not enough to wound the target on 3+ or 2+ (for example against Toughness 5 and higher).'),
  },
  {
    id: 'blitzingFirepower', faction: 'aeldari', name: tr('Lightning Fire'), nameEn: 'Blitzing Firepower', cost: 1, phases: ['shooting'], buff: 'phase',
    text: tr('A unit that has not shot yet: against targets within 12″ its ranged weapons get Sustained Hits 1 (those that already have it — critical on 5+).'),
    when: tr('When a unit with many shots stands within 12″ of the target.'),
  },
  {
    id: 'feignedRetreat', faction: 'aeldari', name: tr('Feigned Retreat'), nameEn: 'Feigned Retreat', cost: 1, phases: ['movement'], buff: 'turn',
    text: tr('Right after a Fall Back: until the end of the turn the unit can shoot and declare a charge as if it had not fallen back.'),
    when: tr('When a unit is locked in melee but its fire is needed: step back and shoot at once.'),
  },
  {
    id: 'lethalDosage', faction: 'adeptus_mechanicus', name: tr('Deadly Dose'), nameEn: 'Lethal Dosage', cost: 1, phases: ['shooting'], buff: 'phase',
    text: tr('A unit that has not shot yet: until the end of the phase its ranged weapons get Lethal Hits — a 6 to hit wounds at once.'),
    when: tr('Against vehicles and monsters: sixes go through without a wound roll where 5+ or 6+ is usually needed.'),
  },
  {
    id: 'aggressorImperative', faction: 'adeptus_mechanicus', name: tr('Aggressor Imperative'), nameEn: 'Aggressor Imperative', cost: 1, phases: ['movement'],
    text: tr('A Skitarii unit that has not moved yet: an Advance without a roll — straight +6″.'),
    when: tr('When you must reliably reach an objective or cover instead of hoping for the dice.'),
    requires: { any: [['SKITARII']], label: tr('Skitarii unit (SKITARII)') },
  },
  {
    id: 'extinctionOrder', faction: 'adeptus_mechanicus', name: tr('Order of Eradication'), nameEn: 'Extinction Order', cost: 1, phases: ['command'],
    text: tr('The Tech-Priest picks an objective on the field within 24″: each enemy unit on that objective rolls a D6 — on a 4+ it takes a mortal wound and takes a Battle-shock test.'),
    when: tr('When an enemy stands on an objective: shock zeroes its OC and the objective is easier to take.'),
    requires: { any: [['TECH-PRIEST']], label: tr('Tech-Priest (TECH-PRIEST)') },
  },
]
for (const x of FACTION_STRATAGEMS) STRATAGEMS[x.id] = x

/** Stratagems of the same detachments that are not playable yet: they are used in the opponent's turn or need rules the
 * game does not have. Listed on the army screen so the player knows what the full detachment has. */
export interface LaterStratagem { faction: PlayerId; name: string; nameEn: string; cost: number; why: string }
export const LATER_STRATAGEMS: LaterStratagem[] = [
  { faction: 'marines', name: tr('Might of the Angels'), nameEn: 'Might of Angels', cost: 1, why: tr('needs the Lance rule') },
  { faction: 'marines', name: tr('Adaptive Strategy|stratagem'), nameEn: 'Adaptive Strategy', cost: 1, why: tr('will appear later') },
  { faction: 'marines', name: tr('Counter-tactics'), nameEn: 'Responsive Tactics', cost: 1, why: tr('needs movement in the opponent’s turn') },
  { faction: 'orks', name: tr('Knock Some Sense'), nameEn: "Breakin' Heads", cost: 1, why: tr('needs attached characters') },
  { faction: 'orks', name: tr('Mow Them Down!'), nameEn: "Mow 'Em Down", cost: 1, why: tr('only non-WALKER vehicles, the Orks have none here') },
  { faction: 'tyranids', name: tr('Overwhelm'), nameEn: 'Overrun', cost: 1, why: tr('needs a consolidation choice after combat') },
  { faction: 'tyranids', name: tr('Predatory Imperative'), nameEn: 'Predatory Imperative', cost: 1, why: tr('needs hyper-adaptations') },
  { faction: 'tyranids', name: tr('Endless Swarm'), nameEn: 'Endless Swarm', cost: 1, why: tr('needs models returning to the field') },
  { faction: 'necrons', name: tr('Eternal Return Protocol'), nameEn: 'Protocol of the Eternal Revenant', cost: 1, why: tr('triggers at the moment of death') },
  { faction: 'necrons', name: tr('Vengeful Stars Protocol'), nameEn: 'Protocol of the Vengeful Stars', cost: 2, why: tr('needs shooting in the opponent’s turn') },
  { faction: 'aeldari', name: tr('Celestial Refuge'), nameEn: 'Skyborne Sanctuary', cost: 1, why: tr('needs a transport') },
  { faction: 'aeldari', name: tr('Shoot and Scoot'), nameEn: 'Fire and Fade', cost: 1, why: tr('needs movement after shooting') },
  { faction: 'aeldari', name: tr('Webway Tunnel'), nameEn: 'Webway Tunnel', cost: 1, why: tr('in the opponent’s turn, needs reserves') },
  { faction: 'adeptus_mechanicus', name: tr('Pre-set Purge'), nameEn: 'Pre-Calibrated Purge Solution', cost: 1, why: tr('will appear later') },
]

// ---------------------------------------------------------------- reactions (core, 11th edition)

export const REACTION_STRATAGEMS: StratagemInfo[] = [
  {
    id: 'fireOverwatch', name: tr('Fire Overwatch'), nameEn: 'Fire Overwatch', cost: 1, phases: ['movement'], turn: 'opponent', window: 'beforeShooting',
    text: tr('At the end of the opponent’s Movement phase your unit that is not in engagement range shoots at a visible enemy within 24″ — hits only on a “6” (Snap Shooting), no re-rolls.'),
    when: tr('When a unit has many shots or a Torrent weapon (flamers hit automatically), and the enemy has come close.'),
  },
  {
    id: 'smokescreen', name: tr('Smokescreen'), nameEn: 'Smokescreen', cost: 1, phases: ['movement'], turn: 'opponent', window: 'beforeShooting', buff: 'turn',
    text: tr('At the start of the opponent’s Shooting phase your unit with the SMOKE keyword gets the Benefit of Cover until the end of the phase.'),
    when: tr('When this unit is under heavy fire: cover makes the enemy’s skill 1 worse.'),
    requires: { any: [['SMOKE']], label: tr('unit with the SMOKE keyword') },
  },
  {
    id: 'heroicIntervention', name: tr('Heroic Intervention'), nameEn: 'Heroic Intervention (Leap to Defend)', cost: 1, phases: ['charge'], turn: 'opponent', window: 'afterCharges',
    text: tr('At the end of the opponent’s Charge phase your unit that is not in engagement range, within 12″ of an enemy that charged in this phase, rolls 2D6 and charges into combat with it (without Fights First). A vehicle can only if it is a character or a walker.'),
    when: tr('When a strong melee unit is nearby and the enemy has just charged into your shooters: help them in combat.'),
  },
  {
    id: 'epicChallenge', name: tr('Epic Challenge'), nameEn: 'Epic Challenge', cost: 1, phases: ['fight'], turn: 'either', buff: 'phase',
    text: tr('A character unit that is about to fight: until the end of the phase its melee attacks get Precision — wounds can be allocated to the enemy character.'),
    when: tr('When the enemy unit has a character (leader) that needs to be picked off.'),
    requires: { any: [['CHARACTER']], label: tr('character (CHARACTER)') },
  },
]
for (const x of REACTION_STRATAGEMS) STRATAGEMS[x.id] = x

// ---------------------------------------------------------------- army (detachment) reactions

/** Used when an enemy unit has selected one of your units as the target of its attacks, before any dice (`onTargeted`),
 * or after its attacks destroyed models of your unit (`afterAttacks`). The unit is the one the window is about. */
export const FACTION_REACTIONS: StratagemInfo[] = [
  {
    id: 'armourOfContempt', faction: 'marines', name: tr('Armour of Contempt'), nameEn: 'Armour of Contempt', cost: 1, phases: ['shooting', 'fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: tr('When an enemy unit has picked your unit as a target (in the opponent’s shooting or in combat): the AP of its attacks against you is 1 worse until it finishes attacking.'),
    when: tr('Against weapons with AP −1…−2 on well-armoured infantry: the 3+ save works again.'),
  },
  {
    id: 'aWorthyDeath', faction: 'marines', name: tr('Honourable Death'), nameEn: 'A Worthy Death', cost: 1, phases: ['fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: tr('In combat, when the enemy has picked your unit that has not fought yet: each model killed on a 4+ manages to strike. Here — right after the enemy’s attack, against that enemy (on the tabletop — together with its unit later in the phase).'),
    when: tr('When a strong enemy strikes the unit and your models have dangerous melee weapons.'),
  },
  {
    id: 'orksNeverBeaten', faction: 'orks', name: tr('Orks Is Never Beaten'), nameEn: 'Orks Is Never Beaten', cost: 1, phases: ['fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: tr('In combat, when the enemy has picked your unit (except TITANIC) that has not fought yet: each model killed on a 4+ (on a 3+ if the unit is enraged by WAAAGH!) manages to strike. Here — right after the enemy’s attack, against that enemy.'),
    when: tr('When a big unit of Boyz is about to lose many models in melee.'),
  },
  {
    id: 'rapidRegeneration', faction: 'tyranids', name: tr('Rapid Regeneration'), nameEn: 'Rapid Regeneration', cost: 1, phases: ['shooting', 'fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: tr('When the enemy has picked your unit (in the opponent’s shooting or in combat): until the end of the phase the models have Feel No Pain 6+ (5+ in Synapse range) — each lost wound can be cancelled by a roll.'),
    when: tr('When a lot of damage is flying at a big monster: 5+ in Synapse saves a third of the wounds.'),
  },
  {
    id: 'deathFrenzy', faction: 'tyranids', name: tr('Death Throes Fury'), nameEn: 'Death Frenzy', cost: 1, phases: ['fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: tr('In combat, when the enemy has picked your unit that has not fought yet: each model killed on a 4+ manages to strike right after the enemy’s attack.'),
    when: tr('When a strong enemy strikes a unit of gaunts or warriors, and they will not get another chance to answer.'),
  },
  {
    id: 'lightningFastReactions', faction: 'aeldari', name: tr('Lightning-fast Reactions'), nameEn: 'Lightning-Fast Reactions', cost: 1, phases: ['shooting', 'fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: tr('When the enemy has picked your unit (not a WRAITH CONSTRUCT; in the opponent’s shooting or in combat): until the end of the phase −1 to hit rolls against that unit.'),
    when: tr('Against weapons that hit on 3+ or 4+: every sixth attack misses.'),
  },
  {
    id: 'balefulHalo', faction: 'adeptus_mechanicus', name: tr('Sinister Halo'), nameEn: 'Baleful Halo', cost: 2, phases: ['fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: tr('In combat, when the enemy has picked your unit (not a VEHICLE): until the end of the phase −1 to wound rolls against it.'),
    when: tr('When strong melee that wounds on 2+ or 3+ strikes infantry.'),
  },
  {
    id: 'bulwarkImperative', faction: 'adeptus_mechanicus', name: tr('Bulwark Imperative'), nameEn: 'Bulwark Imperative', cost: 2, phases: ['shooting'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: tr('In the opponent’s shooting, when the enemy has picked your Skitarii unit: until the end of the phase the models have a 4+ invulnerable save.'),
    when: tr('Against armour-piercing weapons (AP −2 and better): a 4+ save instead of almost none.'),
    requires: { any: [['SKITARII']], label: tr('Skitarii unit (SKITARII)') },
  },
  {
    id: 'undyingLegions', faction: 'necrons', name: tr('Immortal Legions Protocol'), nameEn: 'Protocol of the Undying Legions', cost: 1, phases: ['shooting', 'fight'], turn: 'either', window: 'afterAttacks',
    text: tr('After enemy attacks (in the opponent’s shooting or in combat) that killed models of your unit: the unit immediately runs reanimation protocols — heals D3 wounds (D3+1 if a character leads it) and returns models.'),
    when: tr('When a unit of warriors has lost several models: on average two models return to the line.'),
  },
]
for (const x of FACTION_REACTIONS) STRATAGEMS[x.id] = x

/** The other languages show their translated name with the official English one beside it; English shows only the official name. */
export const showOfficialName = locale !== 'en'
if (!showOfficialName) {
  for (const x of Object.values(STRATAGEMS)) x.name = x.nameEn
  for (const x of LATER_STRATAGEMS) x.name = x.nameEn
}

/** Reactions whose fallen models strike back right after the enemy's attacks (A Worthy Death and its cousins). */
export const LAST_STAND: StratagemId[] = ['aWorthyDeath', 'orksNeverBeaten', 'deathFrenzy']

export const STRATAGEM_IDS = Object.keys(STRATAGEMS) as StratagemId[]

/** Reactions offered in this window. */
export const reactionsIn = (window: ReactionWindow) => Object.values(STRATAGEMS).filter((x) => x.window === window).map((x) => x.id)

/** The unit carries this Stratagem's lasting effect (see `buff`). */
export const hasBuff = (u: UnitState, id: StratagemId) => !!u.phaseBuffs?.includes(id) || !!u.turnBuffs?.includes(id)
