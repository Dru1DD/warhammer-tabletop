import type { Datasheet, ModelProfile, Weapon } from '../types'
import { tr } from '../../i18n/index'

// Tyranids, 11th-edition datasheets as transcribed by Wahapedia (checked 2026-11-09):
//   Hive Tyrant, Termagants, Hormagaunts, Tyranid Warriors With Ranged Bio-weapons.
// Every weapon profile of the datasheet is listed; `PROFILES` picks the training loadout (docs/armies.md).

export const TYRANID_WEAPONS: Record<string, Weapon> = {
  // ---- Hive Tyrant
  heavyVenomCannon: {
    id: 'heavyVenomCannon', name: tr('Heavy Venom Cannon'),
    profiles: [{ name: '', range: 36, attacks: 0, randomA: 'D3', skill: 2, s: 9, ap: -2, d: 3, keywords: { blast: 1 } }],
  },
  stranglethornCannon: {
    id: 'stranglethornCannon', name: tr('Stranglethorn Cannon'),
    profiles: [{ name: '', range: 36, attacks: 1, randomA: 'D6', skill: 2, s: 7, ap: -1, d: 2, keywords: { blast: 1 } }],
  },
  boneswordLashWhip: {
    id: 'boneswordLashWhip', name: tr('Monstrous Bonesword and Lash Whip'),
    profiles: [{ name: '', range: 'melee', attacks: 6, skill: 2, s: 9, ap: -2, d: 3, keywords: { twinLinked: true } }],
  },
  scythingTalons: {
    id: 'scythingTalons', name: tr('Monstrous Scything Talons'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 2, s: 7, ap: -2, d: 2, keywords: { extraAttacks: true } }],
  },
  // ---- Termagants
  fleshborer: {
    id: 'fleshborer', name: tr('Fleshborer|alt'),
    profiles: [{ name: '', range: 18, attacks: 1, skill: 4, s: 5, ap: 0, d: 1, keywords: { assault: true } }],
  },
  termagantDevourer: {
    id: 'termagantDevourer', name: tr('Termagant Devourer'),
    profiles: [{ name: '', range: 18, attacks: 2, skill: 4, s: 4, ap: 0, d: 1, keywords: {} }],
  },
  termagantSpinefists: {
    id: 'termagantSpinefists', name: tr('Termagant Spinefists'),
    profiles: [{ name: '', range: 12, attacks: 2, skill: 4, s: 3, ap: 0, d: 1, keywords: { assault: true, closeQuarters: true, twinLinked: true } }],
  },
  shardlauncher: {
    id: 'shardlauncher', name: tr('Shardlauncher'),
    profiles: [{ name: '', range: 18, attacks: 0, randomA: 'D3', skill: 4, s: 5, ap: 0, d: 1, keywords: { blast: 1, heavy: true } }],
  },
  spikeRifle: {
    id: 'spikeRifle', name: tr('Spike Rifle'),
    profiles: [{ name: '', range: 24, attacks: 1, skill: 4, s: 4, ap: -1, d: 1, keywords: { heavy: true } }],
  },
  strangleweb: {
    id: 'strangleweb', name: tr('Strangleweb'),
    profiles: [{ name: '', range: 18, attacks: 0, randomA: 'D6', skill: null, s: 2, ap: 0, d: 1, keywords: { assault: true, devastatingWounds: true, torrent: true } }],
  },
  termagantClaws: {
    id: 'termagantClaws', name: tr('Chitinous Claws and Teeth'),
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 4, s: 3, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Hormagaunts
  hormagauntTalons: {
    id: 'hormagauntTalons', name: tr('Hormagaunt Talons'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 4, s: 3, ap: -1, d: 1, keywords: {} }],
  },
  // ---- Tyranid Warriors with Ranged Bio-weapons
  warriorDevourer: {
    id: 'warriorDevourer', name: tr('Devourer|alt'),
    profiles: [{ name: '', range: 18, attacks: 5, skill: 4, s: 4, ap: 0, d: 1, keywords: {} }],
  },
  deathspitter: {
    id: 'deathspitter', name: tr('Deathspitter|alt'),
    profiles: [{ name: '', range: 24, attacks: 3, skill: 4, s: 5, ap: -1, d: 1, keywords: {} }],
  },
  barbedStrangler: {
    id: 'barbedStrangler', name: tr('Barbed Strangler'),
    profiles: [{ name: '', range: 36, attacks: 1, randomA: 'D6', skill: 4, s: 6, ap: -1, d: 1, keywords: { blast: 1 } }],
  },
  venomCannon: {
    id: 'venomCannon', name: tr('Venom Cannon'),
    profiles: [{ name: '', range: 36, attacks: 0, randomA: 'D3', skill: 4, s: 9, ap: -2, d: 2, keywords: { blast: 1 } }],
  },
  warriorSpinefists: {
    id: 'warriorSpinefists', name: tr('Spinefists|alt'),
    profiles: [{ name: '', range: 12, attacks: 2, skill: 4, s: 4, ap: 0, d: 1, keywords: { assault: true, closeQuarters: true, twinLinked: true } }],
  },
  warriorClaws: {
    id: 'warriorClaws', name: tr('Tyranid Warrior Claws and Talons'),
    profiles: [{ name: '', range: 'melee', attacks: 5, skill: 3, s: 5, ap: -1, d: 1, keywords: {} }],
  },
}

export const TYRANID_PROFILES: Record<string, ModelProfile> = {
  hiveTyrant: {
    id: 'hiveTyrant', name: tr('Hive Tyrant'), m: 8, t: 10, sv: 2, w: 10, ld: 7, oc: 3, invuln: 4, baseMm: 60, character: true,
    weapons: ['boneswordLashWhip', 'scythingTalons'],
  },
  termagant: {
    id: 'termagant', name: tr('Termagant'), m: 6, t: 3, sv: 5, w: 1, ld: 8, oc: 2, baseMm: 28.5,
    weapons: ['fleshborer', 'termagantClaws'],
  },
  termagantShard: {
    id: 'termagantShard', name: tr('Termagant with shardlauncher'), m: 6, t: 3, sv: 5, w: 1, ld: 8, oc: 2, baseMm: 28.5,
    weapons: ['shardlauncher', 'termagantClaws'],
  },
  termagantSpike: {
    id: 'termagantSpike', name: tr('Termagant with spike rifle'), m: 6, t: 3, sv: 5, w: 1, ld: 8, oc: 2, baseMm: 28.5,
    weapons: ['spikeRifle', 'termagantClaws'],
  },
  termagantWeb: {
    id: 'termagantWeb', name: tr('Termagant with strangleweb'), m: 6, t: 3, sv: 5, w: 1, ld: 8, oc: 2, baseMm: 28.5,
    weapons: ['strangleweb', 'termagantClaws'],
  },
  hormagaunt: {
    id: 'hormagaunt', name: tr('Hormagaunt'), m: 10, t: 3, sv: 5, w: 1, ld: 8, oc: 2, baseMm: 28.5,
    weapons: ['hormagauntTalons'],
  },
  tyranidPrime: {
    id: 'tyranidPrime', name: tr('Tyranid Prime'), m: 6, t: 5, sv: 4, w: 3, ld: 7, oc: 2, baseMm: 50,
    weapons: ['warriorDevourer', 'warriorClaws'],
  },
  tyranidWarrior: {
    id: 'tyranidWarrior', name: tr('Tyranid Warrior'), m: 6, t: 5, sv: 4, w: 3, ld: 7, oc: 2, baseMm: 50,
    weapons: ['warriorDevourer', 'warriorClaws'],
  },
  tyranidWarriorVenom: {
    id: 'tyranidWarriorVenom', name: tr('Warrior with venom cannon'), m: 6, t: 5, sv: 4, w: 3, ld: 7, oc: 2, baseMm: 50,
    weapons: ['venomCannon', 'warriorClaws'],
  },
  tyranidWarriorStrangler: {
    id: 'tyranidWarriorStrangler', name: tr('Warrior with barbed strangler'), m: 6, t: 5, sv: 4, w: 3, ld: 7, oc: 2, baseMm: 50,
    weapons: ['barbedStrangler', 'warriorClaws'],
  },
}

export const TYRANID_DATASHEETS: Record<string, Datasheet> = {
  hiveTyrant: {
    id: 'hiveTyrant', name: tr('Hive Tyrant|army'), faction: 'tyranids',
    keywords: ['MONSTER', 'CHARACTER', 'PSYKER', 'GREAT DEVOURER', 'SYNAPSE', 'HIVE TYRANT', 'TYRANIDS'],
    abilities: ['synapse', 'shadowInTheWarp', 'onslaught', 'willOfTheHiveMind', 'deadlyDemiseD3'],
  },
  termagants: {
    id: 'termagants', name: tr('Termagants'), faction: 'tyranids',
    keywords: ['INFANTRY', 'BATTLELINE', 'GREAT DEVOURER', 'ENDLESS MULTITUDE', 'TERMAGANTS', 'TYRANIDS'],
    abilities: ['synapse', 'skulkingHorrors'],
  },
  hormagaunts: {
    id: 'hormagaunts', name: tr('Hormagaunts'), faction: 'tyranids',
    keywords: ['INFANTRY', 'BATTLELINE', 'GREAT DEVOURER', 'ENDLESS MULTITUDE', 'HORMAGAUNTS', 'TYRANIDS'],
    abilities: ['synapse', 'boundingLeap'],
  },
  tyranidWarriors: {
    id: 'tyranidWarriors', name: tr('Tyranid Warriors with ranged bio-weapons'), faction: 'tyranids',
    keywords: ['INFANTRY', 'GREAT DEVOURER', 'SYNAPSE', 'TYRANID WARRIORS WITH RANGED BIO-WEAPONS', 'TYRANIDS'],
    abilities: ['synapse', 'shadowInTheWarp', 'adaptablePredators'],
  },
}

export const TYRANID_ABILITY_TEXT: Record<string, string> = {
  synapse: tr('Synapse (army rule): a TYRANIDS unit within 6″ of a friendly SYNAPSE model is in Synapse Range: it takes Battle-shock tests on 3D6 instead of 2D6, and its melee attacks get +1 Strength.'),
  shadowInTheWarp: tr('Shadow in the Warp (army rule): once per battle in the Command phase each enemy unit takes a Battle-shock test; within 6″ of your SYNAPSE unit — with −1. [In the simulator — only in your own Command phase.]'),
  onslaught: tr('Onslaught (aura, Psychic): while a friendly TYRANIDS unit is within 6″ of the Hive Tyrant, its ranged weapons get Assault and Lethal Hits.'),
  willOfTheHiveMind: tr('Will of the Hive Mind: lowers a Stratagem’s cost by 1 CP. [Not implemented: the simulator has no Stratagems.]'),
  boundingLeap: tr('Bounding Leap: the unit can declare a charge in a turn when it Advanced.'),
  adaptablePredators: tr('Adaptable Predators: the unit can shoot and declare a charge in a turn when it Fell Back.'),
  skulkingHorrors: tr('Skulking Horrors: when an enemy ends a move within 8″, the unit can make a normal move of up to D6″. [Not implemented: the engine has no reactive moves outside your own turn.]'),
}
