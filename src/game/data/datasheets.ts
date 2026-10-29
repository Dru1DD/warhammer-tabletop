import type { Datasheet, ModelProfile, Weapon } from '../types'

// Profiles from 11th-edition datasheets as transcribed by Wahapedia (checked
// 2026-10-18; Redemptor, Deff Dread, Assault Intercessors 2026-10-29). Loadouts follow the Introductory Set miniatures. See
// docs/research.md for sources and deviations (unit sizes / special weapons).

const nonMV = 'nonMV' as const

export const WEAPONS: Record<string, Weapon> = {
  plasmaPistol: {
    id: 'plasmaPistol',
    name: 'Плазменный пистолет (Plasma Pistol)',
    profiles: [
      { name: 'Стандарт', range: 12, attacks: 1, skill: 2, s: 7, ap: -2, d: 1, keywords: { closeQuarters: true } },
      { name: 'Перегрузка (Supercharge)', range: 12, attacks: 1, skill: 2, s: 8, ap: -3, d: 2, keywords: { closeQuarters: true, hazardous: true } },
    ],
  },
  ltBoltPistol: {
    id: 'ltBoltPistol',
    name: 'Болт-пистолет (Bolt Pistol)',
    profiles: [{ name: '', range: 12, attacks: 1, skill: 2, s: 5, ap: -1, d: 1, keywords: { closeQuarters: true } }],
  },
  mcPowerWeapon: {
    id: 'mcPowerWeapon',
    name: 'Силовой меч (Master-crafted Power Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 5, skill: 2, s: 6, ap: -2, d: 2, keywords: {} }],
  },
  boltRifle: {
    id: 'boltRifle',
    name: 'Болтерная винтовка (Bolt Rifle)',
    profiles: [
      { name: 'Прицельный огонь (Focused Fire)', range: 24, attacks: 1, skill: 3, s: 6, ap: -1, d: 2, keywords: { rapidFire: 1, heavy: true } },
      { name: 'Шквальный огонь (Saturation)', range: 24, attacks: 2, skill: 3, s: 5, ap: -1, d: 1, keywords: { rapidFire: 1, assault: true } },
    ],
  },
  boltPistol: {
    id: 'boltPistol',
    name: 'Болт-пистолет (Bolt Pistol)',
    profiles: [{ name: '', range: 12, attacks: 1, skill: 3, s: 5, ap: -1, d: 1, keywords: { closeQuarters: true } }],
  },
  grenadeLauncher: {
    id: 'grenadeLauncher',
    name: 'Гранатомёт (Grenade Launcher)',
    profiles: [
      { name: 'Осколочная (Frag)', range: 24, attacks: 4, skill: 3, s: 4, ap: -1, d: 1, keywords: { blast: 1 } },
      { name: 'Бронебойная (Krak)', range: 24, attacks: 1, skill: 3, s: 10, ap: -2, d: 3, keywords: { rapidFire: 1 } },
    ],
  },
  knivesAndFists: {
    id: 'knivesAndFists',
    name: 'Ножи и кулаки (Knives and Fists)',
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 5, ap: 0, d: 1, keywords: {} }],
  },
  bigChoppa: {
    id: 'bigChoppa',
    name: 'Большой тесак (Big Choppa)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 7, ap: -1, d: 2, keywords: { cleave: 2 } }],
  },
  choppa: {
    id: 'choppa',
    name: 'Тесак (Choppa)',
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 5, ap: -1, d: 1, keywords: {} }],
  },
  shoota: {
    id: 'shoota',
    name: 'Шута (Shoota)',
    profiles: [{ name: '', range: 18, attacks: 2, skill: 5, s: 4, ap: 0, d: 1, keywords: { lethalHits: nonMV, rapidFire: 1 } }],
  },
  slugga: {
    id: 'slugga',
    name: 'Слагга (Slugga)',
    profiles: [{ name: '', range: 12, attacks: 1, skill: 5, s: 4, ap: 0, d: 1, keywords: { closeQuarters: true, lethalHits: nonMV } }],
  },
  bigShoota: {
    id: 'bigShoota',
    name: 'Большая шута (Big Shoota)',
    profiles: [{ name: '', range: 36, attacks: 3, skill: 5, s: 4, ap: 0, d: 1, keywords: { lethalHits: nonMV, rapidFire: 2 } }],
  },
  rokkitLauncha: {
    id: 'rokkitLauncha',
    name: 'Рокетница (Rokkit Launcha)',
    profiles: [
      { name: 'Бласта (Blasta)', range: 24, attacks: 2, skill: 5, s: 4, ap: 0, d: 1, keywords: { blast: 2 } },
      { name: 'Баста (Busta)', range: 24, attacks: 2, skill: 5, s: 10, ap: -2, d: 3, keywords: {} },
    ],
  },
  // ---- Assault Intercessors
  heavyBoltPistol: {
    id: 'heavyBoltPistol',
    name: 'Тяжёлый болт-пистолет (Heavy Bolt Pistol)',
    profiles: [{ name: '', range: 18, attacks: 1, skill: 3, s: 5, ap: -1, d: 1, keywords: { closeQuarters: true } }],
  },
  chainsword: {
    id: 'chainsword',
    name: 'Цепной меч (Chainsword)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 5, ap: -1, d: 1, keywords: {} }],
  },
  // ---- Redemptor Dreadnought (Macro Plasma Incinerator loadout)
  macroPlasma: {
    id: 'macroPlasma',
    name: 'Макроплазменный испепелитель (Macro Plasma Incinerator)',
    profiles: [
      { name: 'Стандарт', range: 36, attacks: 3, randomA: 'D3', skill: 3, s: 9, ap: -3, d: 2, keywords: { blast: 1 } },
      { name: 'Перегрузка (Supercharge)', range: 36, attacks: 3, randomA: 'D3', skill: 3, s: 10, ap: -4, d: 3, keywords: { blast: 1, hazardous: true } },
    ],
  },
  heavyFlamer: {
    id: 'heavyFlamer',
    name: 'Тяжёлый огнемёт (Heavy Flamer)',
    profiles: [{ name: '', range: 12, attacks: 3, skill: null, s: 5, ap: -1, d: 1, keywords: { torrent: true, blast: 2 } }],
  },
  fragstorm: {
    id: 'fragstorm',
    name: 'Гранатомёты «Фрагшторм» (Fragstorm Grenade Launchers)',
    profiles: [{ name: '', range: 18, attacks: 6, skill: 3, s: 4, ap: -1, d: 1, keywords: { blast: 2 } }],
  },
  redemptorFist: {
    id: 'redemptorFist',
    name: 'Кулак Редемптора (Redemptor Fist)',
    profiles: [{ name: '', range: 'melee', attacks: 5, skill: 3, s: 12, ap: -3, d: 3, randomD: 'D3', keywords: {} }],
  },
  // ---- Deff Dread (default loadout)
  dreadBigShoota: {
    id: 'dreadBigShoota',
    name: 'Большая шута дреда (Big Shoota)',
    profiles: [{ name: '', range: 36, attacks: 3, skill: 5, s: 5, ap: 0, d: 1, keywords: { lethalHits: nonMV, rapidFire: 2 } }],
  },
  skorcha: {
    id: 'skorcha',
    name: 'Скорча (Skorcha)',
    profiles: [{ name: '', range: 12, attacks: 3, skill: null, s: 5, ap: 0, d: 1, keywords: { torrent: true, blast: 1 } }],
  },
  dreadKlaws: {
    id: 'dreadKlaws',
    name: 'Клешни дреда (Dread Klaws)',
    profiles: [{ name: '', range: 'melee', attacks: 5, skill: 3, s: 12, ap: -2, d: 3, keywords: { cleave: 1 } }],
  },
}

export const PROFILES: Record<string, ModelProfile> = {
  lieutenant: {
    id: 'lieutenant', name: 'Лейтенант', m: 6, t: 5, sv: 3, w: 4, ld: 6, oc: 1, baseMm: 40, character: true,
    weapons: ['plasmaPistol', 'ltBoltPistol', 'mcPowerWeapon'],
  },
  intercessorSergeant: {
    id: 'intercessorSergeant', name: 'Сержант интерсессоров', m: 6, t: 5, sv: 3, w: 2, ld: 6, oc: 2, baseMm: 32,
    weapons: ['boltRifle', 'boltPistol', 'knivesAndFists'],
  },
  intercessor: {
    id: 'intercessor', name: 'Интерсессор', m: 6, t: 5, sv: 3, w: 2, ld: 6, oc: 2, baseMm: 32,
    weapons: ['boltRifle', 'boltPistol', 'knivesAndFists'],
  },
  intercessorGL: {
    id: 'intercessorGL', name: 'Интерсессор с гранатомётом', m: 6, t: 5, sv: 3, w: 2, ld: 6, oc: 2, baseMm: 32,
    weapons: ['boltRifle', 'grenadeLauncher', 'boltPistol', 'knivesAndFists'],
  },
  nob: {
    id: 'nob', name: 'Ноб', m: 6, t: 5, sv: 5, w: 3, ld: 7, oc: 2, baseMm: 40,
    weapons: ['bigChoppa'],
  },
  boy: {
    id: 'boy', name: 'Бой', m: 6, t: 5, sv: 5, w: 1, ld: 7, oc: 2, baseMm: 32,
    weapons: ['shoota', 'slugga', 'choppa'],
  },
  boyBigShoota: {
    id: 'boyBigShoota', name: 'Бой с большой шутой', m: 6, t: 5, sv: 5, w: 1, ld: 7, oc: 2, baseMm: 32,
    weapons: ['bigShoota', 'slugga', 'choppa'],
  },
  assaultSergeant: {
    id: 'assaultSergeant', name: 'Сержант штурмовых интерсессоров', m: 6, t: 5, sv: 3, w: 2, ld: 6, oc: 2, baseMm: 32,
    weapons: ['heavyBoltPistol', 'chainsword'],
  },
  assaultIntercessor: {
    id: 'assaultIntercessor', name: 'Штурмовой интерсессор', m: 6, t: 5, sv: 3, w: 2, ld: 6, oc: 2, baseMm: 32,
    weapons: ['heavyBoltPistol', 'chainsword'],
  },
  redemptor: {
    id: 'redemptor', name: 'Дредноут «Редемптор»', m: 8, t: 10, sv: 2, w: 12, ld: 6, oc: 4, baseMm: 90,
    weapons: ['macroPlasma', 'heavyFlamer', 'fragstorm', 'redemptorFist'],
  },
  deffDread: {
    id: 'deffDread', name: 'Дэфф-дред', m: 8, t: 9, sv: 2, w: 8, ld: 7, oc: 3, invuln: 6, baseMm: 60,
    weapons: ['dreadBigShoota', 'skorcha', 'dreadKlaws'],
  },
  boyRokkit: {
    id: 'boyRokkit', name: 'Бой с рокетницей', m: 6, t: 5, sv: 5, w: 1, ld: 7, oc: 2, baseMm: 32,
    weapons: ['rokkitLauncha', 'slugga', 'choppa'],
  },
}

export const DATASHEETS: Record<string, Datasheet> = {
  lieutenant: {
    id: 'lieutenant', name: 'Лейтенант (Lieutenant)', faction: 'marines',
    keywords: ['INFANTRY', 'CHARACTER', 'IMPERIUM', 'TACTICUS'], abilities: ['tacticalPrecision'],
  },
  intercessors: {
    id: 'intercessors', name: 'Отделение интерсессоров (Intercessor Squad)', faction: 'marines',
    keywords: ['INFANTRY', 'BATTLELINE', 'IMPERIUM', 'TACTICUS'], abilities: ['boltDiscipline'],
  },
  assaultIntercessors: {
    id: 'assaultIntercessors', name: 'Штурмовые интерсессоры (Assault Intercessor Squad)', faction: 'marines',
    keywords: ['INFANTRY', 'BATTLELINE', 'IMPERIUM', 'TACTICUS'], abilities: ['targetedIntercession'],
  },
  redemptor: {
    id: 'redemptor', name: 'Дредноут «Редемптор» (Redemptor Dreadnought)', faction: 'marines',
    keywords: ['VEHICLE', 'WALKER', 'DREADNOUGHT', 'IMPERIUM'], abilities: ['dutyEternal', 'deadlyDemiseD3'],
  },
  deffDread: {
    id: 'deffDread', name: 'Дэфф-дред (Deff Dread)', faction: 'orks',
    keywords: ['VEHICLE', 'WALKER', 'ORKS'], abilities: ['dreadArd', 'deadlyDemise1', 'waaagh'],
  },
  boyz: {
    id: 'boyz', name: 'Бойз (Boyz)', faction: 'orks',
    keywords: ['INFANTRY', 'BATTLELINE', 'MOB'], abilities: ['ammoRunts', 'tideOfMuscle', 'waaagh'],
  },
}

export const ABILITY_TEXT: Record<string, string> = {
  boltDiscipline: 'Болтерная дисциплина (Bolter Discipline): +1 к броску на попадание в стрельбе, если отряд или цель в зоне цели (objective).',
  tacticalPrecision: 'Тактическая точность (Tactical Precision): атаки отряда имеют Lethal Hits против целей не MONSTER/VEHICLE.',
  ammoRunts: 'Гроты-подносчики (Ammo Runts): раз за битву +1 к броску на попадание при стрельбе.',
  tideOfMuscle: 'Волна мускулов (Tide of Muscle): если отряд совершил атаку (charge) в этот ход, его рукопашные атаки имеют Lethal Hits.',
  dutyEternal: 'Вечный долг (Duty Eternal): атаки по отряду с Силой больше его Стойкости получают −1 к броску на ранение.',
  dreadArd: "Броня дреда (Dread 'Ard): атаки по отряду получают −1 к урону (не меньше 1).",
  deadlyDemise1: 'Смертельная гибель 1 (Deadly Demise 1): при уничтожении бросьте D6; на 6 каждый отряд в 6″ получает 1 смертельную рану.',
  deadlyDemiseD3: 'Смертельная гибель D3 (Deadly Demise D3): при уничтожении бросьте D6; на 6 каждый отряд в 6″ получает D3 смертельных ран.',
  targetedIntercession: 'Прицельный перехват (Targeted Intercession): если отряд совершил атаку (charge) в этот ход, его рукопашные атаки получают +1 к Силе и AP.',
  waaagh: 'Waaagh! (правило армии): переброс броска продвижения; раз за битву — «Боевой клич»: до конца следующего хода отряд «разъярён» — 5+ непробиваемый спас, оружие дальнего боя получает Assault, можно атаковать после продвижения.',
}

export const FACTION_NAME: Record<string, string> = {
  marines: 'Космодесант',
  orks: 'Орки',
}
