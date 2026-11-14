import type { Datasheet, ModelProfile, Weapon } from '../types'
import { tr } from '../../i18n/index'

// Necrons, 11th-edition datasheets as transcribed by Wahapedia (checked 2026-11-09):
//   Overlord, Necron Warriors, Skorpekh Destroyers, Canoptek Scarab Swarms.

export const NECRON_WEAPONS: Record<string, Weapon> = {
  // ---- Overlord
  staffOfLight: {
    id: 'staffOfLight', name: tr('Staff of Light (shooting)'),
    profiles: [{ name: '', range: 18, attacks: 3, skill: 2, s: 5, ap: -2, d: 1, keywords: {} }],
  },
  tachyonArrow: {
    id: 'tachyonArrow', name: tr('Tachyon Arrow'),
    // D6+2 damage: fixed 2 plus a D6
    profiles: [{ name: '', range: 72, attacks: 1, skill: 2, s: 16, ap: -5, d: 2, randomD: 'D6', keywords: { oneShot: true } }],
  },
  overlordsBlade: {
    id: 'overlordsBlade', name: tr('Overlord’s Blade'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 2, s: 8, ap: -3, d: 2, keywords: { devastatingWounds: true } }],
  },
  staffOfLightMelee: {
    id: 'staffOfLightMelee', name: tr('Staff of Light (melee)'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 2, s: 5, ap: -2, d: 1, keywords: {} }],
  },
  voidscythe: {
    id: 'voidscythe', name: tr('Voidscythe|alt'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 12, ap: -3, d: 3, keywords: { devastatingWounds: true } }],
  },
  // ---- Necron Warriors
  gaussFlayer: {
    id: 'gaussFlayer', name: tr('Gauss Flayer'),
    profiles: [{ name: '', range: 24, attacks: 1, skill: 4, s: 4, ap: 0, d: 1, keywords: { lethalHits: true, rapidFire: 1 } }],
  },
  gaussReaper: {
    id: 'gaussReaper', name: tr('Gauss Reaper'),
    profiles: [{ name: '', range: 12, attacks: 2, skill: 4, s: 4, ap: -1, d: 1, keywords: { lethalHits: true } }],
  },
  necronCCW: {
    id: 'necronCCW', name: tr('Close Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 4, s: 4, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Skorpekh Destroyers
  hyperphaseWeapons: {
    id: 'hyperphaseWeapons', name: tr('Skorpekh Hyperphase Weapons'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 7, ap: -2, d: 2, keywords: {} }],
  },
  // ---- Canoptek Scarab Swarms
  feederMandibles: {
    id: 'feederMandibles', name: tr('Feeder Mandibles'),
    profiles: [{ name: '', range: 'melee', attacks: 6, skill: 5, s: 2, ap: 0, d: 1, keywords: { lethalHits: true } }],
  },
}

export const NECRON_PROFILES: Record<string, ModelProfile> = {
  overlord: {
    id: 'overlord', name: tr('Overlord'), m: 5, t: 5, sv: 2, w: 6, ld: 6, oc: 1, invuln: 4, baseMm: 40, character: true,
    weapons: ['tachyonArrow', 'overlordsBlade'],
  },
  necronWarrior: {
    id: 'necronWarrior', name: tr('Necron Warrior'), m: 5, t: 4, sv: 4, w: 1, ld: 7, oc: 2, baseMm: 32,
    weapons: ['gaussFlayer', 'necronCCW'],
  },
  skorpekh: {
    id: 'skorpekh', name: tr('Skorpekh Destroyer'), m: 8, t: 6, sv: 3, w: 3, ld: 7, oc: 2, baseMm: 50,
    weapons: ['hyperphaseWeapons'],
  },
  scarab: {
    id: 'scarab', name: tr('Scarab Swarm'), m: 10, t: 2, sv: 6, w: 4, ld: 8, oc: 0, baseMm: 40,
    weapons: ['feederMandibles'],
  },
}

export const NECRON_DATASHEETS: Record<string, Datasheet> = {
  overlord: {
    id: 'overlord', name: tr('Overlord|army'), faction: 'necrons',
    keywords: ['INFANTRY', 'CHARACTER', 'NOBLE', 'OVERLORD', 'NECRONS'],
    abilities: ['reanimation', 'implacableResilience', 'myWillBeDone'],
    leads: ['necronWarriors', 'immortals', 'lychguard'],
  },
  necronWarriors: {
    id: 'necronWarriors', name: tr('Necron Warriors'), faction: 'necrons',
    keywords: ['INFANTRY', 'BATTLELINE', 'NECRON WARRIORS', 'NECRONS'],
    abilities: ['reanimation', 'legion'],
  },
  skorpekhDestroyers: {
    id: 'skorpekhDestroyers', name: tr('Skorpekh Destroyers'), faction: 'necrons',
    keywords: ['INFANTRY', 'DESTROYER CULT', 'SKORPEKH DESTROYERS', 'NECRONS'],
    abilities: ['reanimation', 'whirlingOnslaught'],
  },
  scarabSwarms: {
    id: 'scarabSwarms', name: tr('Canoptek Scarab Swarms'), faction: 'necrons',
    keywords: ['SWARM', 'FLY', 'CANOPTEK', 'SCARAB SWARMS', 'NECRONS'],
    abilities: ['reanimation', 'selfDestruction', 'chitteringSwarm'],
  },
}

export const NECRON_ABILITY_TEXT: Record<string, string> = {
  reanimation: tr('Reanimation Protocols (army rule): at the end of your Command phase the unit heals D3 wounds: wounds of damaged models are restored first, then destroyed models (except CHARACTER) return with 1 wound. The unit does not exceed its starting size.'),
  legion: tr('Their Number is Legion: when reanimating, you can re-roll the die that determines the number of wounds. [The simulator re-rolls a result of 1.]'),
  implacableResilience: tr('Implacable Resilience: each attack allocated to this model gets −1 to Damage (minimum 1).'),
  myWillBeDone: tr('My Will Be Done: lowers a Stratagem’s cost by 1 CP. [Not implemented: the simulator has no Stratagems.]'),
  whirlingOnslaught: tr('Whirling Onslaught: in melee you can re-roll a hit roll of 1; if the unit charged this turn — any hit roll.'),
  selfDestruction: tr('Self-destruction: at the start of the Fight phase a unit in engagement range destroys one model; the enemy in that model’s engagement range rolls a D6 (+1 against VEHICLE): 2–5 — D3 mortal wounds, 6+ — 3. [In the simulator it triggers automatically while the unit has 2+ models.]'),
  chitteringSwarm: tr('Chittering Swarm: models of an enemy unit in engagement range of the swarm lower their OC by 1 (not below 1).'),
}
