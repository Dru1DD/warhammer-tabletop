import type { Datasheet, ModelProfile, Weapon } from '../types'
import { tr } from '../../i18n/index'

// Aeldari beyond the first four units, 11th-edition datasheets as transcribed by Wahapedia (Aeldari Faction
// Pack v1.4, checked 2026-11-10): Autarch, Rangers, Wraithguard, Swooping Hawks. Default loadouts only.
// See docs/aeldari.md for what is implemented and what is approximated.

export const AELDARI_EXTRA_WEAPONS: Record<string, Weapon> = {
  // ---- Autarch
  autarchPistol: {
    id: 'autarchPistol',
    name: tr('Shuriken Pistol|alt'),
    profiles: [{ name: '', range: 12, attacks: 1, skill: 2, s: 4, ap: -1, d: 1, keywords: { assault: true, closeQuarters: true } }],
  },
  starGlaive: {
    id: 'starGlaive',
    name: tr('Star Glaive'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 2, s: 6, ap: -3, d: 3, keywords: {} }],
  },
  // ---- Rangers (the page shows BS 2+ for their shuriken pistol)
  longRifle: {
    id: 'longRifle',
    name: tr('Long Rifle'),
    profiles: [{ name: '', range: 36, attacks: 1, skill: 3, s: 4, ap: -1, d: 2, keywords: { heavy: true, precision: true } }],
  },
  rangerPistol: {
    id: 'rangerPistol',
    name: tr('Shuriken Pistol|alt'),
    profiles: [{ name: '', range: 12, attacks: 1, skill: 2, s: 4, ap: -1, d: 1, keywords: { assault: true, closeQuarters: true } }],
  },
  rangerCcw: {
    id: 'rangerCcw',
    name: tr('Close Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 3, s: 3, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Wraithguard (D6+1 damage: fixed 1 plus a D6)
  wraithcannon: {
    id: 'wraithcannon',
    name: tr('Wraithcannon|alt'),
    profiles: [{ name: '', range: 18, attacks: 1, skill: 4, s: 14, ap: -4, d: 1, randomD: 'D6', keywords: {} }],
  },
  wraithguardCcw: {
    id: 'wraithguardCcw',
    name: tr('Close Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 4, s: 5, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Swooping Hawks
  hawksTalon: {
    id: 'hawksTalon',
    name: tr('Hawk’s Talon'),
    profiles: [{ name: '', range: 24, attacks: 2, skill: 3, s: 6, ap: -2, d: 2, keywords: { lethalHits: true } }],
  },
  lasblaster: {
    id: 'lasblaster',
    name: tr('Lasblaster'),
    profiles: [{ name: '', range: 24, attacks: 4, skill: 3, s: 4, ap: 0, d: 1, keywords: { assault: true, lethalHits: true } }],
  },
  hawkCcw: {
    id: 'hawkCcw',
    name: tr('Close Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 3, s: 3, ap: 0, d: 1, keywords: {} }],
  },
}

const hawk = { m: 14, t: 3, sv: 4, w: 1, ld: 6, oc: 1, baseMm: 32 }

export const AELDARI_EXTRA_PROFILES: Record<string, ModelProfile> = {
  autarch: {
    id: 'autarch', name: tr('Autarch'), m: 7, t: 3, sv: 3, w: 4, ld: 6, oc: 1, invuln: 4, baseMm: 32, character: true,
    weapons: ['autarchPistol', 'starGlaive'],
  },
  aeldariRanger: {
    id: 'aeldariRanger', name: tr('Ranger'), m: 7, t: 3, sv: 5, w: 1, ld: 7, oc: 1, baseMm: 28.5,
    weapons: ['longRifle', 'rangerPistol', 'rangerCcw'],
  },
  wraithguard: {
    id: 'wraithguard', name: tr('Wraithguard'), m: 6, t: 6, sv: 2, w: 3, ld: 8, oc: 1, baseMm: 40,
    weapons: ['wraithcannon', 'wraithguardCcw'],
  },
  hawkExarch: { id: 'hawkExarch', name: tr('Swooping Hawk Exarch'), ...hawk, invuln: 5, weapons: ['hawksTalon', 'hawkCcw'] },
  swoopingHawk: { id: 'swoopingHawk', name: tr('Swooping Hawk'), ...hawk, weapons: ['lasblaster', 'hawkCcw'] },
}

export const AELDARI_EXTRA_DATASHEETS: Record<string, Datasheet> = {
  autarch: {
    id: 'autarch', name: tr('Autarch|army'), faction: 'aeldari',
    keywords: ['INFANTRY', 'CHARACTER', 'AELDARI', 'GRENADES', 'AUTARCH', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'superlativeStrategist', 'pathOfCommand'],
    description: tr('Warlord of the Aspects: 4+ invulnerable save, star glaive D3 AP −3; re-rolls Advance rolls.'),
  },
  aeldariRangers: {
    id: 'aeldariRangers', name: tr('Rangers'), faction: 'aeldari',
    keywords: ['INFANTRY', 'AELDARI', 'RANGERS', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'infiltrators', 'stealth', 'cameleoline', 'pathOfTheOutcast'],
    description: tr('Exile snipers: 36″ rifles with Precision pick off characters; stealthy, and get a 5+ invulnerable save against shooting.'),
  },
  wraithguard: {
    id: 'wraithguard', name: tr('Wraithguard|alt'), faction: 'aeldari',
    keywords: ['INFANTRY', 'AELDARI', 'WRAITH CONSTRUCT', 'WRAITHGUARD', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'warConstruct', 'psychicGuidance'],
    description: tr('Spectral constructs: T6, 2+ save; S14 AP −4 wraithcannons tear through vehicles, especially near a seer.'),
  },
  swoopingHawks: {
    id: 'swoopingHawks', name: tr('Swooping Hawks'), faction: 'aeldari',
    keywords: ['INFANTRY', 'AELDARI', 'JUMP PACK', 'FLY', 'GRENADES', 'ASPECT WARRIORS', 'SWOOPING HAWKS', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'grenadePack', 'deepStrike'],
    description: tr('Winged raiders: M14″, lasblasters with Lethal Hits; flying over the enemy, they shower it with grenades.'),
  },
}

export const AELDARI_EXTRA_ABILITY_TEXT: Record<string, string> = {
  superlativeStrategist:
    tr('Superlative Strategist: the unit can re-roll an Advance roll. [Re-rolling Agile Manoeuvres rolls is not implemented; there are no leader attachments — the rule applies to the Autarch himself.]'),
  pathOfCommand: tr('Path of Command: makes a Stratagem cost 1 CP less. [Not implemented: the game has no such Stratagems.]'),
  cameleoline: tr('Chameleoline cloaks: 5+ invulnerable save against ranged attacks only.'),
  pathOfTheOutcast:
    tr('Path of the Outcast: when an enemy ends a move within 8″, the unit can move D6″. [Not implemented: the game has no reactive actions in the opponent’s turn.]'),
  warConstruct: tr('War Construct: the unit can shoot in a turn when it fell back.'),
  psychicGuidance:
    tr('Psychic Guidance: while a friendly AELDARI PSYKER (Farseer) is within 12″, the unit’s models have Ld 6+ and +1 to hit rolls.'),
  grenadePack:
    tr('Grenade Pack Flyover: once per turn, in your Movement phase after a normal move, Advance or Fall Back, pick a visible enemy unit within 8″ and roll a D6 per model: each 4+ is 1 mortal wound (max 6).'),
}
