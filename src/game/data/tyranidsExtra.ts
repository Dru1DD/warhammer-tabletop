import type { Datasheet, ModelProfile, Weapon } from '../types'
import { tr } from '../../i18n/index'

// Tyranids beyond the first four units, 11th-edition datasheets as transcribed by Wahapedia (Tyranids Faction
// Pack v1.3, checked 2026-11-10): Winged Tyranid Prime, Zoanthropes, Carnifexes, Barbgaunts. Default loadouts
// only. See docs/tyranids.md for what is implemented and what is approximated.

export const TYRANID_EXTRA_WEAPONS: Record<string, Weapon> = {
  // ---- Winged Tyranid Prime
  primeTalons: {
    id: 'primeTalons',
    name: tr('Prime Talons'),
    profiles: [{ name: '', range: 'melee', attacks: 6, skill: 2, s: 6, ap: -1, d: 2, keywords: {} }],
  },
  // ---- Zoanthropes (D6+1 damage: fixed 1 plus a D6)
  warpBlast: {
    id: 'warpBlast',
    name: tr('Warp Blast'),
    profiles: [
      { name: tr('Witchfire'), range: 24, attacks: 0, randomA: 'D3', skill: 3, s: 7, ap: -2, d: 0, randomD: 'D3', keywords: { blast: 1, psychic: true } },
      { name: tr('Focused Witchfire'), range: 24, attacks: 1, skill: 3, s: 12, ap: -3, d: 1, randomD: 'D6', keywords: { lethalHits: true, psychic: true } },
    ],
  },
  zoanthropeClaws: {
    id: 'zoanthropeClaws',
    name: tr('Chitinous Claws and Teeth'),
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 5, s: 3, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Carnifexes (default: scything talons + extra scything talons)
  carnifexTalons: {
    id: 'carnifexTalons',
    name: tr('Carnifex Scything Talons'),
    profiles: [{ name: '', range: 'melee', attacks: 6, skill: 4, s: 9, ap: -2, d: 3, keywords: {} }],
  },
  carnifexExtraTalons: {
    id: 'carnifexExtraTalons',
    name: tr('Carnifex Extra Scything Talons'),
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 4, s: 9, ap: -2, d: 3, keywords: { extraAttacks: true } }],
  },
  // ---- Barbgaunts
  barblauncher: {
    id: 'barblauncher',
    name: tr('Barblauncher'),
    profiles: [{ name: '', range: 24, attacks: 0, randomA: 'D6', skill: 4, s: 5, ap: 0, d: 1, keywords: { blast: 1, heavy: true } }],
  },
  barbgauntClaws: {
    id: 'barbgauntClaws',
    name: tr('Chitinous Claws and Teeth'),
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 4, s: 4, ap: 0, d: 1, keywords: {} }],
  },
}

const zoanthrope = { m: 5, t: 5, sv: 5, w: 3, ld: 7, oc: 1, invuln: 4, baseMm: 40, weapons: ['warpBlast', 'zoanthropeClaws'] }

export const TYRANID_EXTRA_PROFILES: Record<string, ModelProfile> = {
  wingedPrime: {
    id: 'wingedPrime', name: tr('Winged Tyranid Prime|short'), m: 12, t: 5, sv: 4, w: 6, ld: 7, oc: 1, baseMm: 50, character: true,
    weapons: ['primeTalons'],
  },
  // the page gives no separate Neurothrope profile: it uses the Zoanthrope one
  neurothrope: { id: 'neurothrope', name: tr('Neurothrope'), ...zoanthrope },
  zoanthrope: { id: 'zoanthrope', name: tr('Zoanthrope'), ...zoanthrope },
  // the datasheet base is a 105×70 mm oval; the engine has round bases, so this is the round base of the same area
  carnifex: {
    id: 'carnifex', name: tr('Carnifex'), m: 8, t: 9, sv: 2, w: 8, ld: 8, oc: 3, baseMm: 86,
    weapons: ['carnifexTalons', 'carnifexExtraTalons'],
  },
  barbgaunt: {
    id: 'barbgaunt', name: tr('Barbgaunt'), m: 6, t: 4, sv: 4, w: 2, ld: 8, oc: 1, baseMm: 40,
    weapons: ['barblauncher', 'barbgauntClaws'],
  },
}

export const TYRANID_EXTRA_DATASHEETS: Record<string, Datasheet> = {
  wingedPrime: {
    id: 'wingedPrime', name: tr('Winged Tyranid Prime'), faction: 'tyranids',
    keywords: ['INFANTRY', 'CHARACTER', 'FLY', 'GREAT DEVOURER', 'SYNAPSE', 'VANGUARD INVADER', 'WINGED TYRANID PRIME', 'TYRANIDS'],
    abilities: ['synapse', 'shadowInTheWarp', 'alphaWarrior', 'deathBlow', 'deepStrike'],
    description: tr('Winged synapse commander: M12″, flies; near Tyranid Warriors their attacks get Sustained Hits 1.'),
  },
  zoanthropes: {
    id: 'zoanthropes', name: tr('Zoanthropes'), faction: 'tyranids',
    keywords: ['INFANTRY', 'PSYKER', 'FLY', 'GREAT DEVOURER', 'SYNAPSE', 'ZOANTHROPES', 'TYRANIDS'],
    abilities: ['synapse', 'warpField', 'spiritLeech'],
    description: tr('Psychic cannons: a 24″ warp blast hits vehicles (S12, D6+1); the aura gives neighbours a 6+ invulnerable save.'),
  },
  carnifexes: {
    id: 'carnifexes', name: tr('Carnifexes'), faction: 'tyranids',
    keywords: ['MONSTER', 'GREAT DEVOURER', 'CARNIFEXES', 'TYRANIDS'],
    abilities: ['synapse', 'deadlyDemise1', 'blisteringAssault'],
    description: tr('Living battering ram: T9, 2+ save, W8; S9 D3 talons tear through vehicles and heavy infantry.'),
  },
  barbgaunts: {
    id: 'barbgaunts', name: tr('Barbgaunts'), faction: 'tyranids',
    keywords: ['INFANTRY', 'GREAT DEVOURER', 'BARBGAUNTS', 'TYRANIDS'],
    abilities: ['synapse', 'disruptionBombardment'],
    description: tr('Bombardment from 24″: after hitting infantry they “stun” it — −2″ to its movement, Advance and charge until the end of its next turn.'),
  },
}

export const TYRANID_EXTRA_ABILITY_TEXT: Record<string, string> = {
  alphaWarrior:
    tr('Alpha Warrior: while a Prime leads the unit, the unit’s weapons get Sustained Hits 1. [Approximation: there is no leader attachment — a Prime within 3″ of a Tyranid Warriors unit counts as leading it, and both the Prime and the Warriors get Sustained Hits 1.]'),
  deathBlow:
    tr('Death Blow: if the Prime is destroyed in melee before it fought, on a 4+ it manages to strike back. [Not implemented.]'),
  warpField: tr('Warp Field (aura): friendly Tyranid units within 6″ of the Zoanthropes have a 6+ invulnerable save.'),
  spiritLeech:
    tr('Spirit Leech (aura): an enemy unit within 6″ that fails a Battle-shock test takes D3 mortal wounds, and one Zoanthrope heals D3 wounds. [Not implemented.]'),
  blisteringAssault:
    tr('Blistering Assault: in the opponent’s Shooting phase, if the shooting enemy wounded a model of the unit, the unit can make a dash of up to D6+2″. [Not implemented: the game has no reactive actions in the opponent’s turn.]'),
  disruptionBombardment:
    tr('Disruption Bombardment: after shooting pick the enemy infantry that was hit: until the end of its next turn −2″ to its Move characteristic and −2 to Advance and charge rolls.'),
}
