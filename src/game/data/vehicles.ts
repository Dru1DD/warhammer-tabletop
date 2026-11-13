import type { AbilityId, Datasheet, ModelProfile, Wargear, Weapon, WeaponKeywords, WeaponProfile } from '../types'
import { tr } from '../../i18n/index'

// Vehicles and monsters for the five armies that had almost none, 11th-edition datasheets as transcribed by Wahapedia
// (checked 2026-11-13): Rhino and Predator Annihilator (Space Marines), Trukk and Battlewagon (Orks), Ghost Ark and
// Doomsday Ark (Necrons), Wave Serpent and Fire Prism (Aeldari), Exocrine and Tyrannofex (Tyranids). Also the optional
// wargear slots of single-model vehicles (`VEHICLE_SLOTS`), the Onager Dunecrawler's among them. See docs/vehicles.md.

const nonMV = 'nonMV' as const
type P = Omit<WeaponProfile, 'keywords'> & { keywords?: WeaponKeywords }
const w = (id: string, name: string, ...profiles: P[]): Weapon => ({ id, name, profiles: profiles.map((p) => ({ keywords: {}, ...p })) })
const ranged = (range: number, attacks: number, skill: number | null, s: number, ap: number, d: number, keywords: WeaponKeywords = {}, extra: Partial<P> = {}): P =>
  ({ name: '', range, attacks, skill, s, ap, d, keywords, ...extra })
const melee = (attacks: number, skill: number, s: number, ap: number, d: number, keywords: WeaponKeywords = {}, extra: Partial<P> = {}): P =>
  ({ name: '', range: 'melee', attacks, skill, s, ap, d, keywords, ...extra })
const named = (name: string, p: P): P => ({ ...p, name })

/** `n` identical weapons as one: attacks and Rapid Fire add up (only for weapons with a fixed number of attacks). */
export function times(x: Weapon, n: number): Weapon {
  if (n === 1) return x
  return {
    id: `${x.id}X${n}`,
    name: tr('{n}× {name}', { n, name: x.name }),
    profiles: x.profiles.map((p) => {
      if (p.randomA) throw new Error(`times(): "${x.id}" has random attacks`)
      return { ...p, attacks: p.attacks * n, keywords: { ...p.keywords, ...(p.keywords.rapidFire ? { rapidFire: p.keywords.rapidFire * n } : {}) } }
    }),
  }
}

const list: Weapon[] = [
  // ---- Rhino, Predator Annihilator
  w('stormBolter', tr('Storm Bolter'), ranged(24, 2, 3, 5, -1, 1, { rapidFire: 2 })),
  w('hunterKillerMissile', tr('Hunter-killer Missile'), ranged(48, 1, 2, 14, -3, 3, { oneShot: true }, { randomD: 'D3' })),
  w('armouredTracks', tr('Armoured Tracks'), melee(3, 4, 6, 0, 1)),
  w('predatorTwinLascannon', tr('Predator Twin Lascannon'), ranged(48, 1, 3, 14, -3, 3, { twinLinked: true }, { randomD: 'D3' })),
  w('lascannon', tr('Lascannon'), ranged(48, 1, 3, 12, -3, 3, {}, { randomD: 'D3' })),
  w('predatorHeavyBolter', tr('Heavy Bolter'), ranged(36, 3, 3, 5, -1, 2, { rapidFire: 2, sustainedHits: 1 })),
  // ---- Trukk, Battlewagon
  w('dualBigShoota', tr('Dual Big Shoota'), ranged(36, 6, 5, 5, 0, 1, { lethalHits: nonMV, rapidFire: 4 })),
  w('spikedRam', tr('Spiked Ram'), melee(3, 3, 6, 0, 1, { cleave: 1 })),
  w('buzzsaw', tr('Buzzsaw'), melee(2, 3, 6, -1, 2, { cleave: 1, extraAttacks: true })),
  w('grabbinKlaw', tr('Grabbin’ Klaw'), melee(2, 3, 10, -2, 2, { extraAttacks: true })),
  w('wagonBigShoota', tr('Big Shoota'), ranged(36, 3, 5, 5, 0, 1, { lethalHits: nonMV, rapidFire: 2 })),
  w('crushinBulk', tr('Crushin’ Bulk'), melee(6, 3, 8, -2, 2, { cleave: 1 })),
  w('wreckinBall', tr('Wreckin’ Ball'), melee(1, 3, 10, 0, 0, { cleave: 2, extraAttacks: true }, { randomD: 'D6' })),
  // ---- Ghost Ark, Doomsday Ark
  w('gaussFlayerArray', tr('Gauss Flayer Array'), ranged(24, 5, 3, 4, 0, 1, { lethalHits: true, rapidFire: 5 })),
  w('armouredBulk', tr('Armoured Bulk'), melee(3, 4, 6, 0, 1)),
  w('doomsdayCannon', tr('Doomsday Cannon'), ranged(72, 1, 3, 18, -4, 4, { blast: 1, heavy: true }, { randomA: 'D6' })),
  // ---- Wave Serpent, Fire Prism
  w('twinShurikenCannon', tr('Twin Shuriken Cannon'), ranged(24, 3, 3, 6, -1, 2, { lethalHits: true, twinLinked: true })),
  w('twinMissileLauncher', tr('Twin Missile Launcher'),
    named(tr('Starshot'), ranged(48, 1, 3, 10, -2, 0, { twinLinked: true }, { randomD: 'D6' })),
    named(tr('Sunburst'), ranged(48, 0, 3, 4, -1, 1, { blast: 1, twinLinked: true }, { randomA: 'D6' }))),
  w('twinBrightLance', tr('Twin Bright Lance'), ranged(36, 1, 3, 12, -3, 2, { twinLinked: true }, { randomD: 'D6' })),
  w('twinScatterLaser', tr('Twin Scatter Laser'), ranged(36, 6, 3, 5, 0, 1, { sustainedHits: 1, twinLinked: true })),
  w('twinStarcannon', tr('Twin Starcannon'), ranged(36, 2, 3, 8, -3, 2, { twinLinked: true })),
  w('wraithboneHull', tr('Wraithbone Hull'), melee(3, 4, 6, 0, 1)),
  // Linked Fire (measuring from another Fire Prism) is not modelled
  w('prismCannon', tr('Prism Cannon'),
    named(tr('Dispersed pulse'), ranged(60, 0, 3, 6, -2, 2, { blast: 1 }, { randomA: '2D6' })),
    named(tr('Focused lances'), ranged(60, 2, 3, 18, -4, 6))),
  // ---- Exocrine, Tyrannofex
  w('bioPlasmicCannon', tr('Bio-plasmic Cannon'), ranged(36, 3, 3, 9, -3, 3, { blast: 1, heavy: true }, { randomA: 'D6' })),
  w('exocrineLimbs', tr('Powerful Limbs'), melee(3, 3, 7, 0, 2)),
  w('fleshborerHive', tr('Fleshborer Hive'), ranged(24, 20, 3, 5, 0, 1, { heavy: true, sustainedHits: 1, twinLinked: true })),
  w('acidSpray', tr('Acid Spray'), ranged(18, 6, null, 6, -2, 2, { torrent: true }, { randomA: 'D6' })),
  w('ruptureCannon', tr('Rupture Cannon'), ranged(48, 2, 3, 18, -4, 6, { heavy: true }, { randomD: 'D6' })),
  w('stingerSalvoes', tr('Stinger Salvoes'), ranged(24, 8, 3, 5, 0, 1)),
  w('tyrannofexLimbs', tr('Powerful Limbs'), melee(4, 3, 8, 0, 2)),
]
const byId = Object.fromEntries(list.map((x) => [x.id, x]))
// two identical weapons on one model: one weapon with twice the attacks
const pairs = [times(byId.lascannon, 2), times(byId.predatorHeavyBolter, 2), times(byId.gaussFlayerArray, 2), ...[2, 3, 4].map((n) => times(byId.wagonBigShoota, n))]

export const VEHICLE_WEAPONS: Record<string, Weapon> = Object.fromEntries([...list, ...pairs].map((x) => [x.id, x]))

type Stats = Omit<ModelProfile, 'id' | 'name' | 'weapons'>
const stats = (m: number, t: number, sv: number, wounds: number, ld: number, oc: number, baseMm: number, invuln?: number): Stats =>
  ({ m, t, sv, w: wounds, ld, oc, baseMm, ...(invuln ? { invuln } : {}) })
const profile = (id: string, name: string, s: Stats, weapons: string[]): ModelProfile => ({ id, name, ...s, weapons })

// Bases: tanks and skimmers have no base, or a small flying stand under a large hull; the game measures from a round
// base, so these take a circle about the size of the hull. Oval monster bases (120 × 92 mm) are drawn as 105 mm circles.
export const VEHICLE_PROFILES: Record<string, ModelProfile> = Object.fromEntries([
  profile('rhino', tr('Rhino'), stats(12, 9, 3, 10, 6, 2, 100), ['stormBolter', 'armouredTracks']),
  profile('predatorAnnihilator', tr('Predator Annihilator'), stats(10, 10, 3, 11, 6, 3, 110), ['predatorTwinLascannon', 'lascannonX2', 'armouredTracks']),
  profile('trukk', tr('Trukk'), stats(12, 8, 4, 10, 7, 2, 100, 6), ['dualBigShoota', 'spikedRam']),
  profile('battlewagon', tr('Battlewagon'), stats(10, 11, 3, 16, 7, 5, 130, 6), ['crushinBulk']),
  profile('ghostArk', tr('Ghost Ark'), stats(10, 9, 3, 14, 7, 3, 110, 4), ['gaussFlayerArrayX2', 'armouredBulk']),
  profile('doomsdayArk', tr('Doomsday Ark'), stats(10, 9, 3, 14, 7, 5, 110, 4), ['doomsdayCannon', 'gaussFlayerArrayX2', 'armouredBulk']),
  profile('waveSerpent', tr('Wave Serpent'), stats(14, 9, 3, 13, 7, 2, 100, 5), ['twinShurikenCannon', 'twinShurikenCatapult', 'wraithboneHull']),
  profile('firePrism', tr('Fire Prism'), stats(14, 9, 3, 12, 7, 3, 100), ['prismCannon', 'twinShurikenCatapult', 'wraithboneHull']),
  profile('exocrine', tr('Exocrine'), stats(8, 10, 3, 14, 8, 4, 105), ['bioPlasmicCannon', 'exocrineLimbs']),
  profile('tyrannofex', tr('Tyrannofex'), stats(9, 12, 2, 16, 8, 5, 105), ['fleshborerHive', 'stingerSalvoes', 'tyrannofexLimbs']),
].map((x) => [x.id, x]))

const sheet = (id: string, name: string, faction: Datasheet['faction'], keywords: string[], abilities: AbilityId[], description: string, extra: Partial<Datasheet> = {}): Datasheet =>
  ({ id, name, faction, keywords, abilities, description, ...extra })

export const VEHICLE_DATASHEETS: Record<string, Datasheet> = Object.fromEntries([
  sheet('rhino', tr('Rhino'), 'marines', ['VEHICLE', 'DEDICATED TRANSPORT', 'FRAME', 'IMPERIUM', 'SMOKE', 'TRANSPORT', 'ADEPTUS ASTARTES'],
    ['deadlyDemiseD3', 'firingDeck', 'veilingSmoke'],
    tr('Armoured transport: carries 12 Space Marines fast (M12″); two passengers shoot from its Firing Deck.'),
    { transport: { capacity: 12, keywords: ['INFANTRY'], exclude: ['GRAVIS', 'JUMP PACK', 'TERMINATOR'], label: tr('Space Marine INFANTRY (no Gravis, Jump Pack or Terminator)'), firingDeck: 2 } }),
  sheet('predatorAnnihilator', tr('Predator Annihilator'), 'marines', ['VEHICLE', 'FRAME', 'IMPERIUM', 'SMOKE', 'ADEPTUS ASTARTES'],
    ['deadlyDemiseD3', 'damaged1to4', 'annihilator'],
    tr('Tank hunter: three lascannons at 48″ against vehicles and monsters.')),
  sheet('trukk', tr('Trukk'), 'orks', ['VEHICLE', 'DEDICATED TRANSPORT', 'FRAME', 'SPEED FREEKS', 'TRANSPORT', 'ORKS'],
    ['waaagh', 'deadlyDemiseD3', 'firingDeck', 'pilinOut'],
    tr('Fast open transport (M12″): 12 Orks ride in it and all of them can shoot from it.'),
    { transport: { capacity: 12, keywords: ['INFANTRY'], exclude: ['GHAZGHKULL THRAKA', 'JUMP PACK'], label: tr('Ork INFANTRY'), firingDeck: 12 } }),
  sheet('battlewagon', tr('Battlewagon'), 'orks', ['VEHICLE', 'FRAME', 'TRANSPORT', 'WAGON', 'ORKS'],
    ['waaagh', 'deadlyDemiseD6', 'damaged1to6', 'firingDeck', 'mobileFortress'],
    tr('Heavy armoured transport: 22 Orks, T11 and 16 wounds; ranged attacks against it lose 1 Damage.'),
    { transport: { capacity: 22, keywords: ['INFANTRY'], double: ['MEGA ARMOUR', 'JUMP PACK'], label: tr('Ork INFANTRY'), firingDeck: 11 } }),
  sheet('ghostArk', tr('Ghost Ark'), 'necrons', ['VEHICLE', 'FLY', 'FRAME', 'TRANSPORT', 'DEDICATED TRANSPORT', 'GHOST ARK', 'NECRONS'],
    ['reanimation', 'deadlyDemiseD3', 'repairBarge'],
    tr('Transport for Necron Warriors: two gauss flayer arrays, 10 shots at 24″ (Lethal Hits).'),
    { transport: { capacity: 11, keywords: ['NECRONS'], anyOf: [['NECRON WARRIORS'], ['INFANTRY', 'CHARACTER']], label: tr('Necron Warriors and a Necrons INFANTRY CHARACTER') } }),
  sheet('doomsdayArk', tr('Doomsday Ark'), 'necrons', ['VEHICLE', 'FLY', 'FRAME', 'DOOMSDAY ARK', 'NECRONS'],
    ['reanimation', 'deadlyDemiseD3', 'damaged1to5', 'overwhelmingObliteration'],
    tr('Artillery skimmer: the doomsday cannon (72″, S18, D4) breaks tanks, best when the Ark stands still.')),
  sheet('waveSerpent', tr('Wave Serpent'), 'aeldari', ['VEHICLE', 'AELDARI', 'TRANSPORT', 'DEDICATED TRANSPORT', 'FLY', 'FRAME', 'WAVE SERPENT', 'ASURYANI', 'YNNARI'],
    ['battleFocus', 'deadlyDemiseD3', 'damaged1to4', 'waveSerpentShield'],
    tr('Fast grav-tank transport (M14″) for 12 Aeldari; its shield makes heavy weapons wound it worse.'),
    { transport: { capacity: 12, keywords: ['INFANTRY', 'ASURYANI'], exclude: ['JUMP PACK'], double: ['WRAITH CONSTRUCT'], label: tr('Asuryani INFANTRY (no Jump Pack; Wraithguard take 2 places)') } }),
  sheet('firePrism', tr('Fire Prism'), 'aeldari', ['VEHICLE', 'AELDARI', 'FLY', 'FRAME', 'FIRE PRISM', 'ASURYANI', 'YNNARI'],
    ['battleFocus', 'deadlyDemiseD3', 'damaged1to4', 'crystalMatrix', 'linkedFire'],
    tr('Grav-tank with a prism cannon: a 2D6 blast against hordes or two S18 lances against tanks, at 60″.')),
  sheet('exocrine', tr('Exocrine'), 'tyranids', ['MONSTER', 'GREAT DEVOURER', 'EXOCRINE', 'TYRANIDS'],
    ['synapse', 'deadlyDemiseD3', 'damaged1to5', 'symbioticTargeting'],
    tr('Living artillery: the bio-plasmic cannon (D6+3 shots, S9, AP−3, D3) against elite infantry and vehicles.')),
  sheet('tyrannofex', tr('Tyrannofex'), 'tyranids', ['MONSTER', 'GREAT DEVOURER', 'FRAME', 'TYRANNOFEX', 'TYRANIDS'],
    ['synapse', 'deadlyDemiseD6', 'damaged1to5', 'resilientOrganism'],
    tr('Armoured gun beast (T12, 2+): 20 fleshborer shots, an acid spray or a rupture cannon against tanks.')),
].map((x) => [x.id, x]))

export const VEHICLE_ABILITY_TEXT: Record<string, string> = {
  deadlyDemiseD6: tr('Deadly Demise D6: when destroyed, roll a D6; on a 6 each unit within 6″ takes D6 mortal wounds.'),
  damaged1to5: tr('Damaged (1–5 wounds): while the model has 5 wounds or fewer left, −1 to its hit rolls.'),
  damaged1to6: tr('Damaged (1–6 wounds): while the model has 6 wounds or fewer left, −1 to its hit rolls.'),
  veilingSmoke: tr('Veiling Smoke: once per phase the Smokescreen Stratagem can be used on it for 1 CP less, even if it was already used this phase. [Not implemented.]'),
  annihilator: tr('Annihilator: its ranged attacks against MONSTER and VEHICLE units can re-roll the damage roll. [Not implemented: the game has no damage re-rolls yet.]'),
  pilinOut: tr('Pilin’ Out: when an enemy unit ends a move within 8″ of it in the opponent’s Movement phase, the units inside can make a Rapid disembark. [Not implemented.]'),
  mobileFortress: tr('Mobile Fortress: ranged attacks that target it have −1 Damage.'),
  repairBarge: tr('Repair Barge: once per turn, after an enemy unit attacks, Necron Warriors within 3″ that lost wounds can activate their Reanimation Protocols. [Not implemented.]'),
  overwhelmingObliteration: tr('Overwhelming Obliteration: if it Remained Stationary in your Movement phase, its doomsday cannon has Devastating Wounds until the end of the turn.'),
  waveSerpentShield: tr('Wave Serpent Shield: −1 to the wound roll of a ranged attack against it whose Strength is greater than its Toughness.'),
  linkedFire: tr('Linked Fire: the focused lances can measure range and visibility from another friendly Fire Prism (then 1 attack). [Not implemented.]'),
  crystalMatrix: tr('Crystal Matrix: when it shoots, it can re-roll one hit roll and one wound roll. [Not implemented.]'),
  symbioticTargeting: tr('Symbiotic Targeting: after it shoots, pick an enemy unit it hit; until the end of the phase friendly Tyranids re-roll hit rolls of 1 against it. [Not implemented.]'),
  resilientOrganism: tr('Resilient Organism: once per battle, the Damage of one attack allocated to it becomes 0. [Not implemented.]'),
}

/** One choice of an optional wargear slot. The first choice of a slot is the default (`id` ''). The model profile with a
 * choice is the base profile with `remove` taken out and `add` put in; its id is the base id plus the choice ids. */
export interface SlotChoice { id: string; label: string; add?: string[]; remove?: string[]; wargear?: Wargear[] }
export interface Slot { id: string; label: string; choices: SlotChoice[] }
export interface VehicleSlots {
  /** the profiles the slots apply to: the datasheet's default one, and its variants from other wargear options */
  bases: string[]
  slots: Slot[]
}

const none = (label: string): SlotChoice => ({ id: '', label })
const shootas = [1, 2, 3, 4].map((n): SlotChoice => ({ id: `Shoota${n}`, label: tr('{n} big shootas', { n }), add: [n === 1 ? 'wagonBigShoota' : `wagonBigShootaX${n}`] }))
const hk: Slot = { id: 'hk', label: tr('Hunter-killer missile'), choices: [none(tr('No')), { id: 'Hk', label: tr('Yes (one shot per battle)'), add: ['hunterKillerMissile'] }] }

/** Optional wargear of single-model vehicles, by datasheet id. */
export const VEHICLE_SLOTS: Record<string, VehicleSlots> = {
  rhino: { bases: ['rhino'], slots: [hk] },
  predatorAnnihilator: {
    bases: ['predatorAnnihilator'],
    slots: [
      { id: 'sponsons', label: tr('Sponsons'), choices: [none(tr('2 lascannons')), { id: 'Hb', label: tr('2 heavy bolters'), remove: ['lascannonX2'], add: ['predatorHeavyBolterX2'] }] },
      hk,
      { id: 'sb', label: tr('Storm bolter'), choices: [none(tr('No')), { id: 'Sb', label: tr('Yes'), add: ['stormBolter'] }] },
    ],
  },
  trukk: {
    bases: ['trukk'],
    slots: [
      { id: 'gun', label: tr('Gun'), choices: [none(tr('Dual big shoota')), { id: 'Rokkit', label: tr('Rokkit launcha'), remove: ['dualBigShoota'], add: ['rokkitLauncha'] }] },
      { id: 'melee', label: tr('Close combat'), choices: [none(tr('Spiked ram only')), { id: 'Saw', label: tr('Buzzsaw'), add: ['buzzsaw'] }, { id: 'Klaw', label: tr('Grabbin’ klaw'), add: ['grabbinKlaw'] }] },
    ],
  },
  battlewagon: {
    bases: ['battlewagon'],
    slots: [
      { id: 'shootas', label: tr('Big shootas'), choices: [none(tr('None')), ...shootas] },
      { id: 'ball', label: tr('Wreckin’ ball'), choices: [none(tr('No')), { id: 'Ball', label: tr('Yes'), add: ['wreckinBall'] }] },
      { id: 'klaw', label: tr('Grabbin’ klaw'), choices: [none(tr('No')), { id: 'Klaw', label: tr('Yes'), add: ['grabbinKlaw'] }] },
    ],
  },
  waveSerpent: {
    bases: ['waveSerpent'],
    slots: [
      {
        id: 'turret', label: tr('Turret'),
        choices: [
          none(tr('Twin shuriken cannon')),
          { id: 'Missile', label: tr('Twin missile launcher'), remove: ['twinShurikenCannon'], add: ['twinMissileLauncher'] },
          { id: 'Lance', label: tr('Twin bright lance'), remove: ['twinShurikenCannon'], add: ['twinBrightLance'] },
          { id: 'Scatter', label: tr('Twin scatter laser'), remove: ['twinShurikenCannon'], add: ['twinScatterLaser'] },
          { id: 'Star', label: tr('Twin starcannon'), remove: ['twinShurikenCannon'], add: ['twinStarcannon'] },
        ],
      },
      { id: 'hull', label: tr('Hull weapon'), choices: [none(tr('Twin shuriken catapult')), { id: 'Cannon', label: tr('Shuriken cannon'), remove: ['twinShurikenCatapult'], add: ['shurikenCannon'] }] },
    ],
  },
  firePrism: {
    bases: ['firePrism'],
    slots: [{ id: 'hull', label: tr('Hull weapon'), choices: [none(tr('Twin shuriken catapult')), { id: 'Cannon', label: tr('Shuriken cannon'), remove: ['twinShurikenCatapult'], add: ['shurikenCannon'] }] }],
  },
  tyrannofex: {
    bases: ['tyrannofex'],
    slots: [{
      id: 'gun', label: tr('Main bio-weapon'),
      choices: [
        none(tr('Fleshborer hive')),
        { id: 'Acid', label: tr('Acid spray'), remove: ['fleshborerHive'], add: ['acidSpray'] },
        { id: 'Rupture', label: tr('Rupture cannon'), remove: ['fleshborerHive'], add: ['ruptureCannon'] },
      ],
    }],
  },
  onager: {
    bases: ['onager', 'onagerMissiles', 'onagerNeutron', 'onagerPhosphor'],
    slots: [
      { id: 'stubber', label: tr('Additional cognis heavy stubber'), choices: [none(tr('No')), { id: 'Stubber', label: tr('Yes'), add: ['cognisHeavyStubber'] }] },
      { id: 'tether', label: tr('Broad spectrum data-tether'), choices: [none(tr('No')), { id: 'Tether', label: tr('Yes (no SMOKE keyword)'), wargear: ['dataTether'] }] },
    ],
  },
}

/** Every combination of slot choices, as lists of choices (the all-default one first). */
export function slotCombos(slots: Slot[]): SlotChoice[][] {
  return slots.reduce<SlotChoice[][]>((acc, slot) => acc.flatMap((c) => slot.choices.map((x) => [...c, x])), [[]])
}

/** The profile id of `base` with these choices. */
export const slotProfileId = (base: string, choices: SlotChoice[]) => base + choices.map((c) => c.id).join('')

/** Token / art of each slot variant: its base profile. */
export const SLOT_VARIANT_FROM: Record<string, string> = Object.fromEntries(
  Object.values(VEHICLE_SLOTS).flatMap((v) => v.bases.flatMap((b) => slotCombos(v.slots).slice(1).map((c) => [slotProfileId(b, c), b]))),
)
