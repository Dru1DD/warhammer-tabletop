import type { Datasheet, ModelProfile, Weapon } from '../types'

// Aeldari beyond the first four units, 11th-edition datasheets as transcribed by Wahapedia (Aeldari Faction
// Pack v1.4, checked 2026-11-10): Autarch, Rangers, Wraithguard, Swooping Hawks. Default loadouts only.
// See docs/aeldari.md for what is implemented and what is approximated.

export const AELDARI_EXTRA_WEAPONS: Record<string, Weapon> = {
  // ---- Autarch
  autarchPistol: {
    id: 'autarchPistol',
    name: 'Сюрикеновый пистолет (Shuriken Pistol)',
    profiles: [{ name: '', range: 12, attacks: 1, skill: 2, s: 4, ap: -1, d: 1, keywords: { assault: true, closeQuarters: true } }],
  },
  starGlaive: {
    id: 'starGlaive',
    name: 'Звёздная глефа (Star Glaive)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 2, s: 6, ap: -3, d: 3, keywords: {} }],
  },
  // ---- Rangers (the page shows BS 2+ for their shuriken pistol)
  longRifle: {
    id: 'longRifle',
    name: 'Длинная винтовка (Long Rifle)',
    profiles: [{ name: '', range: 36, attacks: 1, skill: 3, s: 4, ap: -1, d: 2, keywords: { heavy: true, precision: true } }],
  },
  rangerPistol: {
    id: 'rangerPistol',
    name: 'Сюрикеновый пистолет (Shuriken Pistol)',
    profiles: [{ name: '', range: 12, attacks: 1, skill: 2, s: 4, ap: -1, d: 1, keywords: { assault: true, closeQuarters: true } }],
  },
  rangerCcw: {
    id: 'rangerCcw',
    name: 'Оружие ближнего боя (Close Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 3, s: 3, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Wraithguard (D6+1 damage: fixed 1 plus a D6)
  wraithcannon: {
    id: 'wraithcannon',
    name: 'Призрачная пушка (Wraithcannon)',
    profiles: [{ name: '', range: 18, attacks: 1, skill: 4, s: 14, ap: -4, d: 1, randomD: 'D6', keywords: {} }],
  },
  wraithguardCcw: {
    id: 'wraithguardCcw',
    name: 'Оружие ближнего боя (Close Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 4, s: 5, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Swooping Hawks
  hawksTalon: {
    id: 'hawksTalon',
    name: 'Коготь ястреба (Hawk’s Talon)',
    profiles: [{ name: '', range: 24, attacks: 2, skill: 3, s: 6, ap: -2, d: 2, keywords: { lethalHits: true } }],
  },
  lasblaster: {
    id: 'lasblaster',
    name: 'Лазбластер (Lasblaster)',
    profiles: [{ name: '', range: 24, attacks: 4, skill: 3, s: 4, ap: 0, d: 1, keywords: { assault: true, lethalHits: true } }],
  },
  hawkCcw: {
    id: 'hawkCcw',
    name: 'Оружие ближнего боя (Close Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 3, s: 3, ap: 0, d: 1, keywords: {} }],
  },
}

const hawk = { m: 14, t: 3, sv: 4, w: 1, ld: 6, oc: 1, baseMm: 32 }

export const AELDARI_EXTRA_PROFILES: Record<string, ModelProfile> = {
  autarch: {
    id: 'autarch', name: 'Автарх', m: 7, t: 3, sv: 3, w: 4, ld: 6, oc: 1, invuln: 4, baseMm: 32, character: true,
    weapons: ['autarchPistol', 'starGlaive'],
  },
  aeldariRanger: {
    id: 'aeldariRanger', name: 'Рейнджер', m: 7, t: 3, sv: 5, w: 1, ld: 7, oc: 1, baseMm: 28.5,
    weapons: ['longRifle', 'rangerPistol', 'rangerCcw'],
  },
  wraithguard: {
    id: 'wraithguard', name: 'Страж-призрак', m: 6, t: 6, sv: 2, w: 3, ld: 8, oc: 1, baseMm: 40,
    weapons: ['wraithcannon', 'wraithguardCcw'],
  },
  hawkExarch: { id: 'hawkExarch', name: 'Экзарх пикирующих ястребов', ...hawk, invuln: 5, weapons: ['hawksTalon', 'hawkCcw'] },
  swoopingHawk: { id: 'swoopingHawk', name: 'Пикирующий ястреб', ...hawk, weapons: ['lasblaster', 'hawkCcw'] },
}

export const AELDARI_EXTRA_DATASHEETS: Record<string, Datasheet> = {
  autarch: {
    id: 'autarch', name: 'Автарх (Autarch)', faction: 'aeldari',
    keywords: ['INFANTRY', 'CHARACTER', 'AELDARI', 'GRENADES', 'AUTARCH', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'superlativeStrategist', 'pathOfCommand'],
    description: 'Полководец Аспектов: 4+ непробиваемый спас, звёздная глефа D3 AP −3; перебрасывает броски продвижения.',
  },
  aeldariRangers: {
    id: 'aeldariRangers', name: 'Рейнджеры (Rangers)', faction: 'aeldari',
    keywords: ['INFANTRY', 'AELDARI', 'RANGERS', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'infiltrators', 'stealth', 'cameleoline', 'pathOfTheOutcast'],
    description: 'Снайперы-изгнанники: винтовки на 36″ с Precision выбивают персонажей; скрытны и получают 5+ инвуль от стрельбы.',
  },
  wraithguard: {
    id: 'wraithguard', name: 'Стражи-призраки (Wraithguard)', faction: 'aeldari',
    keywords: ['INFANTRY', 'AELDARI', 'WRAITH CONSTRUCT', 'WRAITHGUARD', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'warConstruct', 'psychicGuidance'],
    description: 'Призрачные конструкты: T6, 2+ спас; призрачные пушки S14 AP −4 рвут технику, особенно рядом с провидцем.',
  },
  swoopingHawks: {
    id: 'swoopingHawks', name: 'Пикирующие ястребы (Swooping Hawks)', faction: 'aeldari',
    keywords: ['INFANTRY', 'AELDARI', 'JUMP PACK', 'FLY', 'GRENADES', 'ASPECT WARRIORS', 'SWOOPING HAWKS', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'grenadePack', 'deepStrike'],
    description: 'Крылатые налётчики: M14″, лазбластеры с Lethal Hits; пролетая над врагом, засыпают его гранатами.',
  },
}

export const AELDARI_EXTRA_ABILITY_TEXT: Record<string, string> = {
  superlativeStrategist:
    'Непревзойдённый стратег (Superlative Strategist): отряд может перебросить бросок продвижения (Advance). [Переброс бросков манёвров Agile Manoeuvres не реализован; присоединения лидеров нет — правило действует на самого Автарха.]',
  pathOfCommand: 'Путь командования (Path of Command): удешевляет стратагему на 1 CP. [Не реализовано: стратагем в игре нет.]',
  cameleoline: 'Хамелеолиновые плащи: 5+ непробиваемый спасбросок только против атак дальнего боя.',
  pathOfTheOutcast:
    'Путь изгнанника (Path of the Outcast): когда враг заканчивает движение в 8″, отряд может сдвинуться на D6″. [Не реализовано: в игре нет ответных действий в чужой ход.]',
  warConstruct: 'Боевой конструкт (War Construct): отряд может стрелять в ход, когда отступил.',
  psychicGuidance:
    'Психическое водительство (Psychic Guidance): пока в 12″ есть союзный PSYKER Аэльдари (Фарсир), у моделей отряда Ld 6+ и +1 к броскам на попадание.',
  grenadePack:
    'Гранатный налёт (Grenade Pack Flyover): раз за ход, в вашей фазе движения после обычного движения, продвижения или отступления, выберите видимый вражеский отряд в 8″ и бросьте D6 за модель: каждая 4+ — 1 смертельная рана (не больше 6).',
}
