import type { Datasheet, ModelProfile, Weapon } from '../types'
import { tr } from '../../i18n/index'

// Aeldari (Asuryani), 11th-edition datasheets as transcribed by Wahapedia (checked 2026-11-09):
//   Farseer, Guardian Defenders, Dire Avengers, Windriders.

export const AELDARI_WEAPONS: Record<string, Weapon> = {
  // ---- Farseer
  eldritchStorm: {
    id: 'eldritchStorm', name: tr('Eldritch Storm'),
    profiles: [{ name: '', range: 24, attacks: 0, randomA: 'D6', skill: 3, s: 6, ap: -2, d: 0, randomD: 'D3', keywords: { blast: 1, psychic: true } }],
  },
  farseerPistol: {
    id: 'farseerPistol', name: tr('Shuriken Pistol'),
    profiles: [{ name: '', range: 12, attacks: 1, skill: 2, s: 4, ap: -1, d: 1, keywords: { assault: true, closeQuarters: true } }],
  },
  witchblade: {
    id: 'witchblade', name: tr('Witchblade|alt'),
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 2, s: 3, ap: 0, d: 2, keywords: { anti: { keyword: 'INFANTRY', roll: 2 }, psychic: true } }],
  },
  singingSpearRanged: {
    id: 'singingSpearRanged', name: tr('Singing Spear (thrown)'),
    profiles: [{ name: '', range: 12, attacks: 1, skill: 2, s: 9, ap: 0, d: 3, keywords: { assault: true, psychic: true } }],
  },
  singingSpearMelee: {
    id: 'singingSpearMelee', name: tr('Singing Spear (melee)'),
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 2, s: 3, ap: 0, d: 3, keywords: { psychic: true } }],
  },
  // ---- Guardian Defenders
  shurikenCatapult: {
    id: 'shurikenCatapult', name: tr('Shuriken Catapult'),
    profiles: [{ name: '', range: 18, attacks: 2, skill: 3, s: 4, ap: -1, d: 1, keywords: { assault: true } }],
  },
  shurikenCannon: {
    id: 'shurikenCannon', name: tr('Shuriken Cannon'),
    profiles: [{ name: '', range: 24, attacks: 3, skill: 3, s: 6, ap: -1, d: 2, keywords: { lethalHits: true } }],
  },
  brightLance: {
    id: 'brightLance', name: tr('Bright Lance'),
    profiles: [{ name: '', range: 36, attacks: 1, skill: 3, s: 12, ap: -3, d: 2, randomD: 'D6', keywords: {} }],
  },
  missileLauncher: {
    id: 'missileLauncher', name: tr('Missile Launcher'),
    profiles: [
      { name: tr('Starshot'), range: 48, attacks: 1, skill: 3, s: 10, ap: -2, d: 0, randomD: 'D6', keywords: {} },
      { name: tr('Sunburst'), range: 48, attacks: 0, randomA: 'D6', skill: 3, s: 4, ap: -1, d: 1, keywords: { blast: 1 } },
    ],
  },
  scatterLaser: {
    id: 'scatterLaser', name: tr('Scatter Laser'),
    profiles: [{ name: '', range: 36, attacks: 6, skill: 3, s: 5, ap: 0, d: 1, keywords: { sustainedHits: 1 } }],
  },
  starcannon: {
    id: 'starcannon', name: tr('Starcannon|alt'),
    profiles: [{ name: '', range: 36, attacks: 2, skill: 3, s: 8, ap: -3, d: 2, keywords: {} }],
  },
  guardianCCW: {
    id: 'guardianCCW', name: tr('Close Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 3, s: 3, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Dire Avengers
  avengerCatapult: {
    id: 'avengerCatapult', name: tr('Avenger Shuriken Catapult'),
    profiles: [{ name: '', range: 18, attacks: 4, skill: 3, s: 4, ap: -1, d: 1, keywords: { assault: true } }],
  },
  direPistol: {
    id: 'direPistol', name: tr('Shuriken Pistol'),
    profiles: [{ name: '', range: 12, attacks: 1, skill: 3, s: 4, ap: -1, d: 1, keywords: { assault: true, closeQuarters: true } }],
  },
  direCCW: {
    id: 'direCCW', name: tr('Close Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 3, s: 3, ap: 0, d: 1, keywords: {} }],
  },
  diresword: {
    id: 'diresword', name: tr('Diresword'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 4, ap: -2, d: 1, keywords: {} }],
  },
  powerGlaive: {
    id: 'powerGlaive', name: tr('Power Glaive'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 5, ap: -3, d: 1, keywords: {} }],
  },
  // ---- Windriders
  twinShurikenCatapult: {
    id: 'twinShurikenCatapult', name: tr('Twin Shuriken Catapult'),
    profiles: [{ name: '', range: 18, attacks: 2, skill: 3, s: 4, ap: -1, d: 1, keywords: { assault: true, twinLinked: true } }],
  },
  windriderCCW: {
    id: 'windriderCCW', name: tr('Close Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 3, ap: 0, d: 1, keywords: {} }],
  },
}

export const AELDARI_PROFILES: Record<string, ModelProfile> = {
  farseer: {
    id: 'farseer', name: tr('Farseer'), m: 7, t: 3, sv: 6, w: 4, ld: 6, oc: 1, invuln: 4, baseMm: 25, character: true,
    weapons: ['eldritchStorm', 'farseerPistol', 'witchblade'],
  },
  guardian: {
    id: 'guardian', name: tr('Guardian Defender'), m: 7, t: 3, sv: 4, w: 1, ld: 7, oc: 2, baseMm: 28.5,
    weapons: ['shurikenCatapult', 'guardianCCW'],
  },
  heavyPlatform: {
    id: 'heavyPlatform', name: tr('Heavy Weapon Platform'), m: 7, t: 3, sv: 4, w: 2, ld: 7, oc: 0, baseMm: 40, platform: true,
    weapons: ['missileLauncher', 'guardianCCW'],
  },
  direAvenger: {
    id: 'direAvenger', name: tr('Dire Avenger'), m: 7, t: 3, sv: 4, w: 1, ld: 6, oc: 1, baseMm: 28.5,
    weapons: ['avengerCatapult', 'direCCW'],
  },
  exarch: {
    id: 'exarch', name: tr('Avenger Exarch'), m: 7, t: 3, sv: 4, w: 2, ld: 6, oc: 1, invuln: 5, baseMm: 28.5,
    weapons: ['direPistol', 'diresword', 'direCCW'],
  },
  windrider: {
    id: 'windrider', name: tr('Windrider'), m: 14, t: 4, sv: 4, w: 2, ld: 7, oc: 2, invuln: 6, baseMm: 32,
    weapons: ['twinShurikenCatapult', 'windriderCCW'],
  },
  windriderLaser: {
    id: 'windriderLaser', name: tr('Windrider with scatter laser'), m: 14, t: 4, sv: 4, w: 2, ld: 7, oc: 2, invuln: 6, baseMm: 32,
    weapons: ['scatterLaser', 'windriderCCW'],
  },
  windriderCannon: {
    id: 'windriderCannon', name: tr('Windrider with shuriken cannon'), m: 14, t: 4, sv: 4, w: 2, ld: 7, oc: 2, invuln: 6, baseMm: 32,
    weapons: ['shurikenCannon', 'windriderCCW'],
  },
}

export const AELDARI_DATASHEETS: Record<string, Datasheet> = {
  farseer: {
    id: 'farseer', name: tr('Farseer|alt'), faction: 'aeldari',
    keywords: ['INFANTRY', 'CHARACTER', 'AELDARI', 'PSYKER', 'FARSEER', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'guide', 'branchingFates'],
    leads: ['guardianDefenders'],
  },
  guardianDefenders: {
    id: 'guardianDefenders', name: tr('Guardian Defenders'), faction: 'aeldari',
    keywords: ['INFANTRY', 'BATTLELINE', 'AELDARI', 'GRENADES', 'GUARDIANS', 'GUARDIAN DEFENDERS', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'fleetOfFoot', 'crewedPlatform'],
  },
  direAvengers: {
    id: 'direAvengers', name: tr('Dire Avengers'), faction: 'aeldari',
    keywords: ['INFANTRY', 'AELDARI', 'GRENADES', 'ASPECT WARRIORS', 'DIRE AVENGERS', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'bladestorm'],
  },
  windriders: {
    id: 'windriders', name: tr('Windriders'), faction: 'aeldari',
    keywords: ['MOUNTED', 'AELDARI', 'FLY', 'WINDRIDERS', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'swiftDemise'],
  },
}

export const AELDARI_ABILITY_TEXT: Record<string, string> = {
  battleFocus: tr('Battle Focus (Asuryani army rule): at the start of each round — 2 tokens (Incursion). The Swift as the Wind manoeuvre is implemented: a token gives +2″ to a normal move, Advance or Fall Back. [Reactive manoeuvres are not implemented: Fade Back, Opportunity Seized, Flitting Shadows, Sudden Strike, Star Engines.]'),
  guide: tr('Guide (Psychic): in your Movement phase pick an enemy unit within 18″ and in sight; friendly AELDARI models get +1 to hit against it until the start of your next Command phase.'),
  branchingFates: tr('Branching Fates: while the Farseer leads a unit, once per phase replaces a roll with a “6”. [Not implemented.]'),
  fleetOfFoot: tr('Fleet of Foot: the Fade Back manoeuvre without a token. [Not implemented: Fade Back is a reactive move the engine does not have.]'),
  crewedPlatform: tr('Crewed Platform: when the last Guardian Defender dies, the remaining heavy weapon platforms are destroyed.'),
  bladestorm: tr('Bladestorm: the unit’s ranged weapons get Sustained Hits 1 against a target within half range.'),
  swiftDemise: tr('Swift Demise: when shooting you can re-roll a hit roll of 1; if the target is the closest possible one, you can re-roll any hit roll.'),
}
