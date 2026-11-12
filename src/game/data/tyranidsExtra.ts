import type { Datasheet, ModelProfile, Weapon } from '../types'

// Tyranids beyond the first four units, 11th-edition datasheets as transcribed by Wahapedia (Tyranids Faction
// Pack v1.3, checked 2026-11-10): Winged Tyranid Prime, Zoanthropes, Carnifexes, Barbgaunts. Default loadouts
// only. See docs/tyranids.md for what is implemented and what is approximated.

export const TYRANID_EXTRA_WEAPONS: Record<string, Weapon> = {
  // ---- Winged Tyranid Prime
  primeTalons: {
    id: 'primeTalons',
    name: 'Когти Прайма (Prime Talons)',
    profiles: [{ name: '', range: 'melee', attacks: 6, skill: 2, s: 6, ap: -1, d: 2, keywords: {} }],
  },
  // ---- Zoanthropes (D6+1 damage: fixed 1 plus a D6)
  warpBlast: {
    id: 'warpBlast',
    name: 'Варп-взрыв (Warp Blast)',
    profiles: [
      { name: 'Ведьмин огонь (Witchfire)', range: 24, attacks: 0, randomA: 'D3', skill: 3, s: 7, ap: -2, d: 0, randomD: 'D3', keywords: { blast: 1, psychic: true } },
      { name: 'Сфокусированный (Focused Witchfire)', range: 24, attacks: 1, skill: 3, s: 12, ap: -3, d: 1, randomD: 'D6', keywords: { lethalHits: true, psychic: true } },
    ],
  },
  zoanthropeClaws: {
    id: 'zoanthropeClaws',
    name: 'Хитиновые когти и зубы (Chitinous Claws and Teeth)',
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 5, s: 3, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Carnifexes (default: scything talons + extra scything talons)
  carnifexTalons: {
    id: 'carnifexTalons',
    name: 'Косы Карнифекса (Carnifex Scything Talons)',
    profiles: [{ name: '', range: 'melee', attacks: 6, skill: 4, s: 9, ap: -2, d: 3, keywords: {} }],
  },
  carnifexExtraTalons: {
    id: 'carnifexExtraTalons',
    name: 'Дополнительные косы Карнифекса (Carnifex Extra Scything Talons)',
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 4, s: 9, ap: -2, d: 3, keywords: { extraAttacks: true } }],
  },
  // ---- Barbgaunts
  barblauncher: {
    id: 'barblauncher',
    name: 'Шипомёт-бомбардир (Barblauncher)',
    profiles: [{ name: '', range: 24, attacks: 0, randomA: 'D6', skill: 4, s: 5, ap: 0, d: 1, keywords: { blast: 1, heavy: true } }],
  },
  barbgauntClaws: {
    id: 'barbgauntClaws',
    name: 'Хитиновые когти и зубы (Chitinous Claws and Teeth)',
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 4, s: 4, ap: 0, d: 1, keywords: {} }],
  },
}

const zoanthrope = { m: 5, t: 5, sv: 5, w: 3, ld: 7, oc: 1, invuln: 4, baseMm: 40, weapons: ['warpBlast', 'zoanthropeClaws'] }

export const TYRANID_EXTRA_PROFILES: Record<string, ModelProfile> = {
  wingedPrime: {
    id: 'wingedPrime', name: 'Крылатый Прайм тиранидов', m: 12, t: 5, sv: 4, w: 6, ld: 7, oc: 1, baseMm: 50, character: true,
    weapons: ['primeTalons'],
  },
  // the page gives no separate Neurothrope profile: it uses the Zoanthrope one
  neurothrope: { id: 'neurothrope', name: 'Нейротроп', ...zoanthrope },
  zoanthrope: { id: 'zoanthrope', name: 'Зоантроп', ...zoanthrope },
  // the datasheet base is a 105×70 mm oval; the engine has round bases, so this is the round base of the same area
  carnifex: {
    id: 'carnifex', name: 'Карнифекс', m: 8, t: 9, sv: 2, w: 8, ld: 8, oc: 3, baseMm: 86,
    weapons: ['carnifexTalons', 'carnifexExtraTalons'],
  },
  barbgaunt: {
    id: 'barbgaunt', name: 'Барбгаунт', m: 6, t: 4, sv: 4, w: 2, ld: 8, oc: 1, baseMm: 40,
    weapons: ['barblauncher', 'barbgauntClaws'],
  },
}

export const TYRANID_EXTRA_DATASHEETS: Record<string, Datasheet> = {
  wingedPrime: {
    id: 'wingedPrime', name: 'Крылатый Прайм тиранидов (Winged Tyranid Prime)', faction: 'tyranids',
    keywords: ['INFANTRY', 'CHARACTER', 'FLY', 'GREAT DEVOURER', 'SYNAPSE', 'VANGUARD INVADER', 'WINGED TYRANID PRIME', 'TYRANIDS'],
    abilities: ['synapse', 'shadowInTheWarp', 'alphaWarrior', 'deathBlow', 'deepStrike'],
    description: 'Крылатый командир-синапс: M12″, летает; рядом с Воинами тиранидов их атаки получают Sustained Hits 1.',
  },
  zoanthropes: {
    id: 'zoanthropes', name: 'Зоантропы (Zoanthropes)', faction: 'tyranids',
    keywords: ['INFANTRY', 'PSYKER', 'FLY', 'GREAT DEVOURER', 'SYNAPSE', 'ZOANTHROPES', 'TYRANIDS'],
    abilities: ['synapse', 'warpField', 'spiritLeech'],
    description: 'Психические пушки: варп-взрыв на 24″ бьёт по технике (S12, D6+1); аура дарит соседям 6+ непробиваемый спас.',
  },
  carnifexes: {
    id: 'carnifexes', name: 'Карнифексы (Carnifexes)', faction: 'tyranids',
    keywords: ['MONSTER', 'GREAT DEVOURER', 'CARNIFEXES', 'TYRANIDS'],
    abilities: ['synapse', 'deadlyDemise1', 'blisteringAssault'],
    description: 'Живой таран: T9, 2+ спас, W8; косы S9 D3 рвут технику и тяжёлую пехоту.',
  },
  barbgaunts: {
    id: 'barbgaunts', name: 'Барбгаунты (Barbgaunts)', faction: 'tyranids',
    keywords: ['INFANTRY', 'GREAT DEVOURER', 'BARBGAUNTS', 'TYRANIDS'],
    abilities: ['synapse', 'disruptionBombardment'],
    description: 'Обстрел с 24″: попав по пехоте, «оглушают» её — −2″ к движению, продвижению и атаке до конца её следующего хода.',
  },
}

export const TYRANID_EXTRA_ABILITY_TEXT: Record<string, string> = {
  alphaWarrior:
    'Альфа-воин (Alpha Warrior): пока Прайм ведёт отряд, оружие отряда получает Sustained Hits 1. [Приближение: присоединения лидеров нет — Прайм в 3″ от отряда Воинов тиранидов считается ведущим его, Sustained Hits 1 получают и Прайм, и Воины.]',
  deathBlow:
    'Смертельный удар (Death Blow): если Прайм уничтожен в ближнем бою до того, как сражался, на 4+ он успевает ударить в ответ. [Не реализовано.]',
  warpField: 'Варп-поле (Warp Field, аура): союзные отряды Тиранидов в 6″ от Зоантропов имеют 6+ непробиваемый спасбросок.',
  spiritLeech:
    'Пожиратель духа (Spirit Leech, аура): вражеский отряд в 6″, проваливший проверку боевого шока, получает D3 смертельные раны, а один Зоантроп лечит D3 раны. [Не реализовано.]',
  blisteringAssault:
    'Яростный натиск (Blistering Assault): в фазе стрельбы противника, если стрелявший враг ранил модель отряда, отряд может сделать рывок до D6+2″. [Не реализовано: в игре нет ответных действий в чужой ход.]',
  disruptionBombardment:
    'Подавляющий обстрел (Disruption Bombardment): после стрельбы выберите вражескую пехоту, по которой были попадания: до конца её следующего хода −2″ к характеристике движения и −2 к броскам продвижения и атаки (charge).',
}
