import type { Datasheet, ModelProfile, Weapon } from '../types'
import { tr } from '../../i18n/index'

// Necrons beyond the first four units, 11th-edition datasheets as transcribed by Wahapedia (App. Necrons v1.2,
// checked 2026-11-10): Royal Warden, Immortals, Lychguard, Canoptek Wraiths. Default loadouts only.
// See docs/necrons.md for what is implemented and what is approximated.

export const NECRON_EXTRA_WEAPONS: Record<string, Weapon> = {
  // ---- Royal Warden
  relicGaussBlaster: {
    id: 'relicGaussBlaster',
    name: tr('Relic Gauss Blaster'),
    profiles: [{ name: '', range: 24, attacks: 2, skill: 3, s: 5, ap: -1, d: 2, keywords: { lethalHits: true, rapidFire: 2 } }],
  },
  wardenCcw: {
    id: 'wardenCcw',
    name: tr('Close Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 5, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Immortals
  gaussBlaster: {
    id: 'gaussBlaster',
    name: tr('Gauss Blaster'),
    profiles: [{ name: '', range: 24, attacks: 2, skill: 3, s: 5, ap: -1, d: 1, keywords: { lethalHits: true } }],
  },
  immortalCcw: {
    id: 'immortalCcw',
    name: tr('Close Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 3, s: 4, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Lychguard
  warscythe: {
    id: 'warscythe',
    name: tr('Warscythe'),
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 3, s: 8, ap: -3, d: 2, keywords: { devastatingWounds: true } }],
  },
  // ---- Canoptek Wraiths
  viciousClaws: {
    id: 'viciousClaws',
    name: tr('Vicious Claws'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 4, s: 6, ap: -1, d: 2, keywords: {} }],
  },
}

export const NECRON_EXTRA_PROFILES: Record<string, ModelProfile> = {
  royalWarden: {
    id: 'royalWarden', name: tr('Royal Warden'), m: 5, t: 5, sv: 3, w: 4, ld: 6, oc: 1, baseMm: 32, character: true,
    weapons: ['relicGaussBlaster', 'wardenCcw'],
  },
  immortal: {
    id: 'immortal', name: tr('Immortal'), m: 5, t: 5, sv: 3, w: 1, ld: 7, oc: 2, baseMm: 32,
    weapons: ['gaussBlaster', 'immortalCcw'],
  },
  lychguard: {
    id: 'lychguard', name: tr('Lychguard'), m: 5, t: 5, sv: 3, w: 2, ld: 7, oc: 1, baseMm: 32,
    weapons: ['warscythe'],
  },
  canoptekWraith: {
    id: 'canoptekWraith', name: tr('Canoptek Wraith'), m: 10, t: 6, sv: 3, w: 4, ld: 8, oc: 2, invuln: 4, baseMm: 50,
    weapons: ['viciousClaws'],
  },
}

export const NECRON_EXTRA_DATASHEETS: Record<string, Datasheet> = {
  royalWarden: {
    id: 'royalWarden', name: tr('Royal Warden|army'), faction: 'necrons',
    keywords: ['INFANTRY', 'CHARACTER', 'ROYAL WARDEN', 'NECRONS'],
    abilities: ['reanimation', 'adaptiveStrategy', 'engrammaticLogic'],
    description: tr('Phalanx officer: shoots and charges even after falling back, once per battle removes Battle-shock from a friendly unit.'),
  },
  immortals: {
    id: 'immortals', name: tr('Immortals'), faction: 'necrons',
    keywords: ['INFANTRY', 'BATTLELINE', 'IMMORTALS', 'NECRONS'],
    abilities: ['reanimation', 'implacableEradication'],
    description: tr('Elite line infantry: gauss blasters with Lethal Hits, full wound re-rolls if the target is on an objective.'),
  },
  lychguard: {
    id: 'lychguard', name: tr('Lychguard|alt'), faction: 'necrons',
    keywords: ['INFANTRY', 'LYCHGUARD', 'NECRONS'],
    abilities: ['reanimation', 'guardianProtocols'],
    description: tr('Nobles’ bodyguards: S8 AP −3 war scythes with Devastating Wounds; harder to wound near the Overlord.'),
  },
  canoptekWraiths: {
    id: 'canoptekWraiths', name: tr('Canoptek Wraiths'), faction: 'necrons',
    keywords: ['BEASTS', 'FLY', 'CANOPTEK', 'WRAITHS', 'NECRONS'],
    abilities: ['reanimation', 'wraithForm'],
    description: tr('Phase hunters: M10″, 4+ invulnerable save; flying through the enemy they inflict mortal wounds.'),
  },
}

export const NECRON_EXTRA_ABILITY_TEXT: Record<string, string> = {
  adaptiveStrategy: tr('Adaptive Strategy: the unit can shoot and declare a charge in a turn when it fell back.'),
  engrammaticLogic:
    tr('Engrammatic Logic: once per battle remove Battle-shock from a friendly Necron unit within 12″. [Approximation: used at any moment of your turn, not only at the start of the phase.]'),
  implacableEradication:
    tr('Implacable Eradication: the unit’s attacks re-roll wound rolls of 1; if the target is within an objective zone — any failed wound rolls.'),
  guardianProtocols:
    tr('Guardian Protocols: while the unit is led by a NOBLE, attacks against it with Strength greater than its Toughness get −1 to the wound roll. [Approximation: there is no leader attachment — the unit counts as led if a friendly NOBLE (Overlord) is within 3″.]'),
  wraithForm:
    tr('Wraith Form: after a normal move pick an enemy unit the unit flew through and roll a D6 for each model: each 4+ is 1 mortal wound.'),
}
