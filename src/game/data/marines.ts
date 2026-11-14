import type { Datasheet, ModelProfile, Weapon } from '../types'
import { tr } from '../../i18n/index'

// Space Marines beyond the Introductory Set, 11th-edition datasheets as transcribed by Wahapedia (checked
// 2026-11-10): Captain, Hellblaster Squad, Infernus Squad, Bladeguard Veteran Squad. Default loadouts only.
// See docs/marines.md for what is implemented and what is approximated. The Introductory Set units
// (Lieutenant, Intercessors, Assault Intercessors, Redemptor) stay in datasheets.ts.

export const MARINE_WEAPONS: Record<string, Weapon> = {
  // ---- Captain
  captainHeavyBoltPistol: {
    id: 'captainHeavyBoltPistol',
    name: tr('Heavy Bolt Pistol'),
    profiles: [{ name: '', range: 18, attacks: 1, skill: 2, s: 5, ap: -1, d: 1, keywords: { closeQuarters: true } }],
  },
  masterCraftedBolter: {
    id: 'masterCraftedBolter',
    name: tr('Master-crafted Bolter'),
    profiles: [{ name: '', range: 24, attacks: 2, skill: 2, s: 5, ap: -1, d: 2, keywords: { rapidFire: 1, assault: true } }],
  },
  captainPowerWeapon: {
    id: 'captainPowerWeapon',
    name: tr('Master-crafted Power Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 6, skill: 2, s: 6, ap: -2, d: 2, keywords: {} }],
  },
  // ---- Hellblasters, Infernus
  plasmaIncinerator: {
    id: 'plasmaIncinerator',
    name: tr('Plasma Incinerator'),
    profiles: [
      { name: tr('Standard'), range: 24, attacks: 2, skill: 3, s: 7, ap: -2, d: 2, keywords: { rapidFire: 1, assault: true } },
      { name: tr('Supercharge'), range: 24, attacks: 2, skill: 3, s: 8, ap: -3, d: 2, keywords: { rapidFire: 1, assault: true, hazardous: true } },
    ],
  },
  pyreblaster: {
    id: 'pyreblaster',
    name: tr('Pyreblaster'),
    profiles: [{ name: '', range: 12, attacks: 3, skill: null, s: 5, ap: -1, d: 1, keywords: { torrent: true, blast: 1 } }],
  },
  ceramiteFists: {
    id: 'ceramiteFists',
    name: tr('Ceramite Fists'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 5, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Bladeguard Veterans (the Heavy Bolt Pistol is the core one: 18", BS 3+)
  masterCraftedPowerSword: {
    id: 'masterCraftedPowerSword',
    name: tr('Master-crafted Power Sword'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 5, ap: -2, d: 2, keywords: {} }],
  },
}

const tacticus = { m: 6, t: 5, sv: 3, ld: 6, oc: 1 }

export const MARINE_PROFILES: Record<string, ModelProfile> = {
  captain: {
    id: 'captain', name: tr('Captain'), ...tacticus, w: 5, invuln: 4, baseMm: 40, character: true,
    weapons: ['masterCraftedBolter', 'captainHeavyBoltPistol', 'captainPowerWeapon'],
  },
  hellblasterSergeant: {
    id: 'hellblasterSergeant', name: tr('Hellblaster Sergeant'), ...tacticus, w: 2, baseMm: 32,
    weapons: ['plasmaIncinerator', 'boltPistol', 'ceramiteFists'],
  },
  hellblaster: {
    id: 'hellblaster', name: tr('Hellblaster'), ...tacticus, w: 2, baseMm: 32,
    weapons: ['plasmaIncinerator', 'boltPistol', 'ceramiteFists'],
  },
  infernusSergeant: {
    id: 'infernusSergeant', name: tr('Infernus Sergeant'), ...tacticus, w: 2, baseMm: 32,
    weapons: ['pyreblaster', 'boltPistol', 'ceramiteFists'],
  },
  infernusMarine: {
    id: 'infernusMarine', name: tr('Infernus Marine'), ...tacticus, w: 2, baseMm: 32,
    weapons: ['pyreblaster', 'boltPistol', 'ceramiteFists'],
  },
  bladeguardSergeant: {
    id: 'bladeguardSergeant', name: tr('Bladeguard Veteran Sergeant'), ...tacticus, w: 3, invuln: 4, baseMm: 40,
    weapons: ['heavyBoltPistol', 'masterCraftedPowerSword'],
  },
  bladeguardVeteran: {
    id: 'bladeguardVeteran', name: tr('Bladeguard Veteran'), ...tacticus, w: 3, invuln: 4, baseMm: 40,
    weapons: ['heavyBoltPistol', 'masterCraftedPowerSword'],
  },
}

export const MARINE_DATASHEETS: Record<string, Datasheet> = {
  captain: {
    id: 'captain', name: tr('Captain|army'), faction: 'marines',
    keywords: ['INFANTRY', 'CHARACTER', 'EXPLOSIVES', 'IMPERIUM', 'TACTICUS'],
    abilities: ['finestHour', 'strategicAcumen'],
    leads: ['intercessors', 'assaultIntercessors', 'hellblasters', 'infernus', 'bladeguard'],
    description: tr('Company commander: 4+ invulnerable save, master-crafted bolter and power weapon; once per battle — “Finest Hour” in melee.'),
  },
  hellblasters: {
    id: 'hellblasters', name: tr('Hellblaster Squad'), faction: 'marines',
    keywords: ['INFANTRY', 'EXPLOSIVES', 'IMPERIUM', 'TACTICUS'],
    abilities: ['thermalAppeasement'],
    description: tr('Plasma fire support at 24″: supercharge punches through heavy armour, and overheating barely frightens them.'),
  },
  infernus: {
    id: 'infernus', name: tr('Infernus Squad'), faction: 'marines',
    keywords: ['INFANTRY', 'EXPLOSIVES', 'IMPERIUM', 'TACTICUS'],
    abilities: ['drivenFromCover'],
    description: tr('Close-range flamer troops: pyreblasters hit without a hit roll and smoke the enemy out of cover.'),
  },
  bladeguard: {
    id: 'bladeguard', name: tr('Bladeguard Veteran Squad'), faction: 'marines',
    keywords: ['INFANTRY', 'EXPLOSIVES', 'IMPERIUM', 'TACTICUS'],
    abilities: ['bladeguard'],
    description: tr('Elite swordsmen: W3, 4+ invulnerable save, master-crafted power swords; hold the centre and intercept the enemy.'),
  },
}

export const MARINE_ABILITY_TEXT: Record<string, string> = {
  finestHour: tr('Finest Hour: once per battle, when the unit is selected to fight, this model’s melee attacks get +3 Attacks and Devastating Wounds.'),
  strategicAcumen:
    tr('Strategic Acumen: in the Command phase makes one Combat Doctrine active for the unit. [Not implemented: the game has no Combat Doctrines.]'),
  thermalAppeasement: tr('Rites of Thermal Appeasement: +1 to Hazardous rolls for the unit’s plasma weapons — fails only on a 1.'),
  drivenFromCover:
    tr('Driven from Cover: after the unit shoots, the chosen target that was hit gets no cover against friendly Space Marines’ shooting until the end of the turn.'),
  bladeguard:
    tr('Bladeguard: once per turn, when the unit is selected to fight, its melee attacks get +1 to the hit roll. [The second option — −1 to hit against the unit when it is attacked — is not implemented: the game has no reactive decisions in the opponent’s turn.]'),
}
