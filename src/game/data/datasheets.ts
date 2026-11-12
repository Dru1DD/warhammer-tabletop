import { WARGEAR_VARIANTS, WARGEAR_WEAPONS } from './wargearExtra'
import type { Datasheet, ModelProfile, PlayerId, Weapon } from '../types'
import { AELDARI_ABILITY_TEXT, AELDARI_DATASHEETS, AELDARI_PROFILES, AELDARI_WEAPONS } from './aeldari'
import { AELDARI_EXTRA_ABILITY_TEXT, AELDARI_EXTRA_DATASHEETS, AELDARI_EXTRA_PROFILES, AELDARI_EXTRA_WEAPONS } from './aeldariExtra'
import { MECHANICUS_ABILITY_TEXT, MECHANICUS_DATASHEETS, MECHANICUS_PROFILES, MECHANICUS_WEAPONS } from './mechanicus'
import { MARINE_ABILITY_TEXT, MARINE_DATASHEETS, MARINE_PROFILES, MARINE_WEAPONS } from './marines'
import { NECRON_ABILITY_TEXT, NECRON_DATASHEETS, NECRON_PROFILES, NECRON_WEAPONS } from './necrons'
import { NECRON_EXTRA_ABILITY_TEXT, NECRON_EXTRA_DATASHEETS, NECRON_EXTRA_PROFILES, NECRON_EXTRA_WEAPONS } from './necronsExtra'
import { ORK_ABILITY_TEXT, ORK_DATASHEETS, ORK_PROFILES, ORK_WEAPONS } from './orks'
import { TYRANID_ABILITY_TEXT, TYRANID_DATASHEETS, TYRANID_PROFILES, TYRANID_WEAPONS } from './tyranids'
import { TYRANID_EXTRA_ABILITY_TEXT, TYRANID_EXTRA_DATASHEETS, TYRANID_EXTRA_PROFILES, TYRANID_EXTRA_WEAPONS } from './tyranidsExtra'
import { tr } from '../../i18n/index'

// Profiles from 11th-edition datasheets as transcribed by Wahapedia (checked
// 2026-10-18; Redemptor, Deff Dread, Assault Intercessors 2026-10-29). Loadouts follow the Introductory Set miniatures. See
// docs/research.md for sources and deviations (unit sizes / special weapons).

const nonMV = 'nonMV' as const

const CORE_WEAPONS: Record<string, Weapon> = {
  plasmaPistol: {
    id: 'plasmaPistol',
    name: tr('Plasma Pistol'),
    profiles: [
      { name: tr('Standard'), range: 12, attacks: 1, skill: 2, s: 7, ap: -2, d: 1, keywords: { closeQuarters: true } },
      { name: tr('Supercharge'), range: 12, attacks: 1, skill: 2, s: 8, ap: -3, d: 2, keywords: { closeQuarters: true, hazardous: true } },
    ],
  },
  ltBoltPistol: {
    id: 'ltBoltPistol',
    name: tr('Bolt Pistol'),
    profiles: [{ name: '', range: 12, attacks: 1, skill: 2, s: 5, ap: -1, d: 1, keywords: { closeQuarters: true } }],
  },
  mcPowerWeapon: {
    id: 'mcPowerWeapon',
    name: tr('Master-crafted Power Weapon|sword'),
    profiles: [{ name: '', range: 'melee', attacks: 5, skill: 2, s: 6, ap: -2, d: 2, keywords: {} }],
  },
  boltRifle: {
    id: 'boltRifle',
    name: tr('Bolt Rifle'),
    profiles: [
      { name: tr('Focused Fire'), range: 24, attacks: 1, skill: 3, s: 6, ap: -1, d: 2, keywords: { rapidFire: 1, heavy: true } },
      { name: tr('Saturation'), range: 24, attacks: 2, skill: 3, s: 5, ap: -1, d: 1, keywords: { rapidFire: 1, assault: true } },
    ],
  },
  boltPistol: {
    id: 'boltPistol',
    name: tr('Bolt Pistol'),
    profiles: [{ name: '', range: 12, attacks: 1, skill: 3, s: 5, ap: -1, d: 1, keywords: { closeQuarters: true } }],
  },
  grenadeLauncher: {
    id: 'grenadeLauncher',
    name: tr('Grenade Launcher'),
    profiles: [
      { name: tr('Frag'), range: 24, attacks: 4, skill: 3, s: 4, ap: -1, d: 1, keywords: { blast: 1 } },
      { name: tr('Krak'), range: 24, attacks: 1, skill: 3, s: 10, ap: -2, d: 3, keywords: { rapidFire: 1 } },
    ],
  },
  knivesAndFists: {
    id: 'knivesAndFists',
    name: tr('Knives and Fists'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 5, ap: 0, d: 1, keywords: {} }],
  },
  bigChoppa: {
    id: 'bigChoppa',
    name: tr('Big Choppa'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 7, ap: -1, d: 2, keywords: { cleave: 2 } }],
  },
  choppa: {
    id: 'choppa',
    name: tr('Choppa'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 5, ap: -1, d: 1, keywords: {} }],
  },
  shoota: {
    id: 'shoota',
    name: tr('Shoota'),
    profiles: [{ name: '', range: 18, attacks: 2, skill: 5, s: 4, ap: 0, d: 1, keywords: { lethalHits: nonMV, rapidFire: 1 } }],
  },
  slugga: {
    id: 'slugga',
    name: tr('Slugga'),
    profiles: [{ name: '', range: 12, attacks: 1, skill: 5, s: 4, ap: 0, d: 1, keywords: { closeQuarters: true, lethalHits: nonMV } }],
  },
  bigShoota: {
    id: 'bigShoota',
    name: tr('Big Shoota'),
    profiles: [{ name: '', range: 36, attacks: 3, skill: 5, s: 4, ap: 0, d: 1, keywords: { lethalHits: nonMV, rapidFire: 2 } }],
  },
  rokkitLauncha: {
    id: 'rokkitLauncha',
    name: tr('Rokkit Launcha'),
    profiles: [
      { name: tr('Blasta'), range: 24, attacks: 2, skill: 5, s: 4, ap: 0, d: 1, keywords: { blast: 2 } },
      { name: tr('Busta'), range: 24, attacks: 2, skill: 5, s: 10, ap: -2, d: 3, keywords: {} },
    ],
  },
  // ---- Assault Intercessors
  heavyBoltPistol: {
    id: 'heavyBoltPistol',
    name: tr('Heavy Bolt Pistol'),
    profiles: [{ name: '', range: 18, attacks: 1, skill: 3, s: 5, ap: -1, d: 1, keywords: { closeQuarters: true } }],
  },
  chainsword: {
    id: 'chainsword',
    name: tr('Chainsword'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 5, ap: -1, d: 1, keywords: {} }],
  },
  // ---- Redemptor Dreadnought (Macro Plasma Incinerator loadout)
  macroPlasma: {
    id: 'macroPlasma',
    name: tr('Macro Plasma Incinerator'),
    profiles: [
      { name: tr('Standard'), range: 36, attacks: 3, randomA: 'D3', skill: 3, s: 9, ap: -3, d: 2, keywords: { blast: 1 } },
      { name: tr('Supercharge'), range: 36, attacks: 3, randomA: 'D3', skill: 3, s: 10, ap: -4, d: 3, keywords: { blast: 1, hazardous: true } },
    ],
  },
  heavyFlamer: {
    id: 'heavyFlamer',
    name: tr('Heavy Flamer'),
    profiles: [{ name: '', range: 12, attacks: 3, skill: null, s: 5, ap: -1, d: 1, keywords: { torrent: true, blast: 2 } }],
  },
  fragstorm: {
    id: 'fragstorm',
    name: tr('Fragstorm Grenade Launchers'),
    profiles: [{ name: '', range: 18, attacks: 6, skill: 3, s: 4, ap: -1, d: 1, keywords: { blast: 2 } }],
  },
  redemptorFist: {
    id: 'redemptorFist',
    name: tr('Redemptor Fist'),
    profiles: [{ name: '', range: 'melee', attacks: 5, skill: 3, s: 12, ap: -3, d: 3, randomD: 'D3', keywords: {} }],
  },
  // ---- Deff Dread (default loadout)
  dreadBigShoota: {
    id: 'dreadBigShoota',
    name: tr('Dread’s Big Shoota'),
    profiles: [{ name: '', range: 36, attacks: 3, skill: 5, s: 5, ap: 0, d: 1, keywords: { lethalHits: nonMV, rapidFire: 2 } }],
  },
  skorcha: {
    id: 'skorcha',
    name: tr('Skorcha'),
    profiles: [{ name: '', range: 12, attacks: 3, skill: null, s: 5, ap: 0, d: 1, keywords: { torrent: true, blast: 1 } }],
  },
  dreadKlaws: {
    id: 'dreadKlaws',
    name: tr('Dread Klaws'),
    profiles: [{ name: '', range: 'melee', attacks: 5, skill: 3, s: 12, ap: -2, d: 3, keywords: { cleave: 1 } }],
  },
}

const CORE_PROFILES: Record<string, ModelProfile> = {
  lieutenant: {
    id: 'lieutenant', name: tr('Lieutenant'), m: 6, t: 5, sv: 3, w: 4, ld: 6, oc: 1, baseMm: 40, character: true,
    weapons: ['plasmaPistol', 'ltBoltPistol', 'mcPowerWeapon'],
  },
  intercessorSergeant: {
    id: 'intercessorSergeant', name: tr('Intercessor Sergeant'), m: 6, t: 5, sv: 3, w: 2, ld: 6, oc: 2, baseMm: 32,
    weapons: ['boltRifle', 'boltPistol', 'knivesAndFists'],
  },
  intercessor: {
    id: 'intercessor', name: tr('Intercessor'), m: 6, t: 5, sv: 3, w: 2, ld: 6, oc: 2, baseMm: 32,
    weapons: ['boltRifle', 'boltPistol', 'knivesAndFists'],
  },
  intercessorGL: {
    id: 'intercessorGL', name: tr('Intercessor with grenade launcher'), m: 6, t: 5, sv: 3, w: 2, ld: 6, oc: 2, baseMm: 32,
    weapons: ['boltRifle', 'grenadeLauncher', 'boltPistol', 'knivesAndFists'],
  },
  nob: {
    id: 'nob', name: tr('Nob|alt'), m: 6, t: 5, sv: 5, w: 3, ld: 7, oc: 2, baseMm: 40,
    weapons: ['bigChoppa'],
  },
  boy: {
    id: 'boy', name: tr('Boy'), m: 6, t: 5, sv: 5, w: 1, ld: 7, oc: 2, baseMm: 32,
    weapons: ['shoota', 'slugga', 'choppa'],
  },
  boyBigShoota: {
    id: 'boyBigShoota', name: tr('Boy with big shoota'), m: 6, t: 5, sv: 5, w: 1, ld: 7, oc: 2, baseMm: 32,
    weapons: ['bigShoota', 'slugga', 'choppa'],
  },
  assaultSergeant: {
    id: 'assaultSergeant', name: tr('Assault Intercessor Sergeant'), m: 6, t: 5, sv: 3, w: 2, ld: 6, oc: 2, baseMm: 32,
    weapons: ['heavyBoltPistol', 'chainsword'],
  },
  assaultIntercessor: {
    id: 'assaultIntercessor', name: tr('Assault Intercessor'), m: 6, t: 5, sv: 3, w: 2, ld: 6, oc: 2, baseMm: 32,
    weapons: ['heavyBoltPistol', 'chainsword'],
  },
  redemptor: {
    id: 'redemptor', name: tr('Redemptor Dreadnought|short'), m: 8, t: 10, sv: 2, w: 12, ld: 6, oc: 4, baseMm: 90,
    weapons: ['macroPlasma', 'heavyFlamer', 'fragstorm', 'redemptorFist'],
  },
  deffDread: {
    id: 'deffDread', name: tr('Deff Dread|short'), m: 8, t: 9, sv: 2, w: 8, ld: 7, oc: 3, invuln: 6, baseMm: 60,
    weapons: ['dreadBigShoota', 'skorcha', 'dreadKlaws'],
  },
  boyRokkit: {
    id: 'boyRokkit', name: tr('Boy with rokkit launcha'), m: 6, t: 5, sv: 5, w: 1, ld: 7, oc: 2, baseMm: 32,
    weapons: ['rokkitLauncha', 'slugga', 'choppa'],
  },
}

const CORE_DATASHEETS: Record<string, Datasheet> = {
  lieutenant: {
    id: 'lieutenant', name: tr('Lieutenant|army'), faction: 'marines',
    keywords: ['INFANTRY', 'CHARACTER', 'EXPLOSIVES', 'IMPERIUM', 'TACTICUS'], abilities: ['tacticalPrecision'],
  },
  intercessors: {
    id: 'intercessors', name: tr('Intercessor Squad'), faction: 'marines',
    keywords: ['INFANTRY', 'BATTLELINE', 'EXPLOSIVES', 'IMPERIUM', 'TACTICUS'], abilities: ['boltDiscipline'],
  },
  assaultIntercessors: {
    id: 'assaultIntercessors', name: tr('Assault Intercessor Squad'), faction: 'marines',
    keywords: ['INFANTRY', 'BATTLELINE', 'EXPLOSIVES', 'IMPERIUM', 'TACTICUS'], abilities: ['targetedIntercession'],
  },
  redemptor: {
    id: 'redemptor', name: tr('Redemptor Dreadnought'), faction: 'marines',
    keywords: ['VEHICLE', 'WALKER', 'DREADNOUGHT', 'IMPERIUM'], abilities: ['dutyEternal', 'deadlyDemiseD3'],
  },
  deffDread: {
    id: 'deffDread', name: tr('Deff Dread'), faction: 'orks',
    keywords: ['VEHICLE', 'WALKER', 'ORKS'], abilities: ['dreadArd', 'deadlyDemise1', 'waaagh'],
  },
  boyz: {
    id: 'boyz', name: tr('Boyz'), faction: 'orks',
    keywords: ['INFANTRY', 'BATTLELINE', 'EXPLOSIVES', 'MOB'], abilities: ['ammoRunts', 'tideOfMuscle', 'waaagh'],
  },
}

const CORE_ABILITY_TEXT: Record<string, string> = {
  deepStrike: tr('Deep Strike: the unit can be left in Reserves; arriving from them (from round 2), it is set up anywhere on the battlefield more than 8″ from all enemy models — not necessarily at the edge.'),
  boltDiscipline: tr('Bolter Discipline: +1 to the hit roll when shooting if the unit or the target is within an objective zone.'),
  tacticalPrecision: tr('Tactical Precision: the unit’s attacks have Lethal Hits against targets that are not MONSTER/VEHICLE.'),
  ammoRunts: tr('Ammo Runts: once per battle +1 to the hit roll when shooting.'),
  tideOfMuscle: tr('Tide of Muscle: if the unit charged this turn, its melee attacks have Lethal Hits.'),
  dutyEternal: tr('Duty Eternal: attacks against the unit with Strength greater than its Toughness get −1 to the wound roll.'),
  dreadArd: tr('Dread \'Ard: attacks against the unit get −1 to damage (minimum 1).'),
  deadlyDemise1: tr('Deadly Demise 1: when destroyed, roll a D6; on a 6 each unit within 6″ takes 1 mortal wound.'),
  deadlyDemiseD3: tr('Deadly Demise D3: when destroyed, roll a D6; on a 6 each unit within 6″ takes D3 mortal wounds.'),
  targetedIntercession: tr('Targeted Intercession: if the unit charged this turn, its melee attacks get +1 to Strength and AP.'),
  waaagh: tr('Waaagh! (army rule): re-roll the Advance roll; once per battle — “Battle Cry”: until the end of the next turn the unit is “enraged” — 5+ invulnerable save, ranged weapons get Assault, it can charge after advancing.'),
}

export const WEAPONS: Record<string, Weapon> = { ...WARGEAR_WEAPONS, ...CORE_WEAPONS, ...TYRANID_WEAPONS, ...NECRON_WEAPONS, ...AELDARI_WEAPONS, ...MECHANICUS_WEAPONS, ...ORK_WEAPONS, ...MARINE_WEAPONS, ...TYRANID_EXTRA_WEAPONS, ...NECRON_EXTRA_WEAPONS, ...AELDARI_EXTRA_WEAPONS }
export const PROFILES: Record<string, ModelProfile> = { ...CORE_PROFILES, ...TYRANID_PROFILES, ...NECRON_PROFILES, ...AELDARI_PROFILES, ...MECHANICUS_PROFILES, ...ORK_PROFILES, ...MARINE_PROFILES, ...TYRANID_EXTRA_PROFILES, ...NECRON_EXTRA_PROFILES, ...AELDARI_EXTRA_PROFILES }
// wargear variants (army builder loadouts): an existing profile with other weapons
for (const x of WARGEAR_VARIANTS) {
  const base = PROFILES[x.from]
  if (!base) throw new Error(`Wargear variant "${x.id}": no profile "${x.from}".`)
  PROFILES[x.id] = { ...base, id: x.id, name: x.name, weapons: x.weapons, ...(x.invuln ? { invuln: x.invuln } : {}), ...(x.w ? { w: x.w } : {}) }
}
export const DATASHEETS: Record<string, Datasheet> = { ...CORE_DATASHEETS, ...TYRANID_DATASHEETS, ...NECRON_DATASHEETS, ...AELDARI_DATASHEETS, ...MECHANICUS_DATASHEETS, ...ORK_DATASHEETS, ...MARINE_DATASHEETS, ...TYRANID_EXTRA_DATASHEETS, ...NECRON_EXTRA_DATASHEETS, ...AELDARI_EXTRA_DATASHEETS }
export const ABILITY_TEXT: Record<string, string> = { ...CORE_ABILITY_TEXT, ...TYRANID_ABILITY_TEXT, ...NECRON_ABILITY_TEXT, ...AELDARI_ABILITY_TEXT, ...MECHANICUS_ABILITY_TEXT, ...ORK_ABILITY_TEXT, ...MARINE_ABILITY_TEXT, ...TYRANID_EXTRA_ABILITY_TEXT, ...NECRON_EXTRA_ABILITY_TEXT, ...AELDARI_EXTRA_ABILITY_TEXT }

export const FACTION_NAME: Record<PlayerId, string> = {
  marines: tr('Space Marines'),
  orks: tr('Orks'),
  tyranids: tr('Tyranids'),
  necrons: tr('Necrons'),
  aeldari: tr('Aeldari'),
  adeptus_mechanicus: tr('Adeptus Mechanicus'),
}
