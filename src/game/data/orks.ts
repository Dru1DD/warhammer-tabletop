import type { Datasheet, ModelProfile, Weapon } from '../types'
import { tr } from '../../i18n/index'

// Orks beyond the Introductory Set, 11th-edition datasheets as transcribed by Wahapedia (Orks app v1.2,
// checked 2026-11-10): Warboss, Nobz, Gretchin, Kommandos. Default loadouts only (wargear options are not
// in the army builder yet). See docs/orks.md for what is implemented and what is approximated.
// The Boyz and the Deff Dread stay in datasheets.ts.

const nonMV = 'nonMV' as const

export const ORK_WEAPONS: Record<string, Weapon> = {
  kustomShoota: {
    id: 'kustomShoota',
    name: tr('Kustom Shoota'),
    profiles: [{ name: '', range: 18, attacks: 4, skill: 5, s: 4, ap: 0, d: 1, keywords: { lethalHits: nonMV, rapidFire: 2 } }],
  },
  // ---- Warboss
  bossKustomChoppa: {
    id: 'bossKustomChoppa',
    name: tr('Boss’s Kustom Choppa'),
    profiles: [{ name: '', range: 'melee', attacks: 6, skill: 2, s: 7, ap: -2, d: 2, keywords: { cleave: 2 } }],
  },
  // ---- Nobz
  kustomKrumpa: {
    id: 'kustomKrumpa',
    name: tr('Kustom Krumpa'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 10, ap: -2, d: 2, keywords: {} }],
  },
  // ---- Gretchin
  grotBlasta: {
    id: 'grotBlasta',
    name: tr('Grot Blasta'),
    profiles: [{ name: '', range: 12, attacks: 1, skill: 4, s: 3, ap: 0, d: 1, keywords: { closeQuarters: true } }],
  },
  scavengedShivs: {
    id: 'scavengedShivs',
    name: tr('Scavenged Shivs'),
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 5, s: 2, ap: 0, d: 1, keywords: {} }],
  },
  // Kommandos use the core Slugga and Choppa (same profiles as the Boyz').
}

export const ORK_PROFILES: Record<string, ModelProfile> = {
  warboss: {
    id: 'warboss', name: tr('Warboss'), m: 6, t: 6, sv: 4, w: 6, ld: 6, oc: 1, invuln: 5, baseMm: 50, character: true,
    weapons: ['kustomShoota', 'bossKustomChoppa'],
  },
  nobzNob: {
    id: 'nobzNob', name: tr('Nob with krumpa'), m: 6, t: 5, sv: 4, w: 3, ld: 7, oc: 1, baseMm: 40,
    weapons: ['kustomShoota', 'kustomKrumpa'],
  },
  gretchin: {
    id: 'gretchin', name: tr('Gretchin|unit'), m: 6, t: 2, sv: 6, w: 1, ld: 8, oc: 1, baseMm: 25,
    weapons: ['grotBlasta', 'scavengedShivs'],
  },
  kommandoNob: {
    id: 'kommandoNob', name: tr('Kommando Nob'), m: 6, t: 5, sv: 5, w: 3, ld: 7, oc: 1, baseMm: 32,
    weapons: ['slugga', 'choppa'],
  },
  kommando: {
    id: 'kommando', name: tr('Kommando'), m: 6, t: 5, sv: 5, w: 1, ld: 7, oc: 1, baseMm: 32,
    weapons: ['slugga', 'choppa'],
  },
}

export const ORK_DATASHEETS: Record<string, Datasheet> = {
  warboss: {
    id: 'warboss', name: tr('Warboss|army'), faction: 'orks',
    keywords: ['INFANTRY', 'CHARACTER', 'EXPLOSIVES', 'WARBOSS', 'ORKS'],
    abilities: ['ammoRunts', 'mightIsRight', 'intimidatingMotivation', 'waaagh'],
    description: tr('Army leader: T6, W6, 5+ invulnerable save; after a charge his choppa hits even harder.'),
  },
  nobz: {
    id: 'nobz', name: tr('Nobz'), faction: 'orks',
    keywords: ['INFANTRY', 'EXPLOSIVES', 'ORKS'],
    abilities: ['ammoRunts', 'getOutDaWay', 'waaagh'],
    description: tr('The biggest Orks: 4+ save and W3, S10 krumpas break vehicles and heavy infantry.'),
  },
  gretchin: {
    id: 'gretchin', name: tr('Gretchin'), faction: 'orks',
    keywords: ['INFANTRY', 'GROTS', 'ORKS'],
    abilities: ['thievinScavengers', 'waaagh'],
    description: tr('Cheap and fragile: they take objectives and hold them for the army while the Orks fight.'),
  },
  kommandos: {
    id: 'kommandos', name: tr('Kommandos'), faction: 'orks',
    keywords: ['INFANTRY', 'EXPLOSIVES', 'SMOKE', 'ORKS'],
    abilities: ['infiltrators', 'stealth', 'bombSquig', 'waaagh'],
    description: tr('Saboteurs: set up outside the deployment zone, always have cover against ranged attacks; once per battle blow up the enemy with a bomb squig.'),
  },
}

export const ORK_ABILITY_TEXT: Record<string, string> = {
  mightIsRight: tr('Might Is Right: if the unit charged this turn, its melee attacks get +3 Attacks and +2 Strength.'),
  intimidatingMotivation:
    tr('Intimidating Motivation: once per round in the Movement phase pick a friendly Ork unit within 6″ — it is no longer Battle-shocked and becomes “enraged”. [Not implemented: “enraged” is army-wide in the game (Waaagh!), there is no per-unit version.]'),
  getOutDaWay:
    tr('Get Out da Way!: during a charge move the unit can pass through models, except MONSTER and VEHICLE. [Not implemented: the charge is built around other models’ bases.]'),
  thievinScavengers:
    tr('Thievin’ Scavengers: at the end of your Movement phase, if the unit is near an objective you control, it stays yours until the enemy’s control level becomes higher than yours.'),
  bombSquig:
    tr('Bomb Squig: once per battle, after the unit’s normal move, pick a visible enemy unit within 12″ and roll a D6: on a 3+ it takes D3 mortal wounds. [Found ’Em!, Nowhere to Hide and splitting the unit in two (Taktikal Know-wotz) are not implemented: the game has no detection rules.]'),
}
