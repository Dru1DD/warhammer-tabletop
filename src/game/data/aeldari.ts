import type { Datasheet, ModelProfile, Weapon } from '../types'

// Aeldari (Asuryani), 11th-edition datasheets as transcribed by Wahapedia (checked 2026-11-09):
//   Farseer, Guardian Defenders, Dire Avengers, Windriders.

export const AELDARI_WEAPONS: Record<string, Weapon> = {
  // ---- Farseer
  eldritchStorm: {
    id: 'eldritchStorm', name: 'Эльдритчская буря (Eldritch Storm)',
    profiles: [{ name: '', range: 24, attacks: 0, randomA: 'D6', skill: 3, s: 6, ap: -2, d: 0, randomD: 'D3', keywords: { blast: 1, psychic: true } }],
  },
  farseerPistol: {
    id: 'farseerPistol', name: 'Сюрикен-пистолет (Shuriken Pistol)',
    profiles: [{ name: '', range: 12, attacks: 1, skill: 2, s: 4, ap: -1, d: 1, keywords: { assault: true, closeQuarters: true } }],
  },
  witchblade: {
    id: 'witchblade', name: 'Клинок ведьмы (Witchblade)',
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 2, s: 3, ap: 0, d: 2, keywords: { anti: { keyword: 'INFANTRY', roll: 2 }, psychic: true } }],
  },
  singingSpearRanged: {
    id: 'singingSpearRanged', name: 'Поющее копьё (Singing Spear, метание)',
    profiles: [{ name: '', range: 12, attacks: 1, skill: 2, s: 9, ap: 0, d: 3, keywords: { assault: true, psychic: true } }],
  },
  singingSpearMelee: {
    id: 'singingSpearMelee', name: 'Поющее копьё (Singing Spear, ближний бой)',
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 2, s: 3, ap: 0, d: 3, keywords: { psychic: true } }],
  },
  // ---- Guardian Defenders
  shurikenCatapult: {
    id: 'shurikenCatapult', name: 'Сюрикен-катапульта (Shuriken Catapult)',
    profiles: [{ name: '', range: 18, attacks: 2, skill: 3, s: 4, ap: -1, d: 1, keywords: { assault: true } }],
  },
  shurikenCannon: {
    id: 'shurikenCannon', name: 'Сюрикен-пушка (Shuriken Cannon)',
    profiles: [{ name: '', range: 24, attacks: 3, skill: 3, s: 6, ap: -1, d: 2, keywords: { lethalHits: true } }],
  },
  brightLance: {
    id: 'brightLance', name: 'Яркое копьё (Bright Lance)',
    profiles: [{ name: '', range: 36, attacks: 1, skill: 3, s: 12, ap: -3, d: 2, randomD: 'D6', keywords: {} }],
  },
  missileLauncher: {
    id: 'missileLauncher', name: 'Ракетомёт (Missile Launcher)',
    profiles: [
      { name: 'Звёздный выстрел (Starshot)', range: 48, attacks: 1, skill: 3, s: 10, ap: -2, d: 0, randomD: 'D6', keywords: {} },
      { name: 'Солнечный взрыв (Sunburst)', range: 48, attacks: 0, randomA: 'D6', skill: 3, s: 4, ap: -1, d: 1, keywords: { blast: 1 } },
    ],
  },
  scatterLaser: {
    id: 'scatterLaser', name: 'Разброс-лазер (Scatter Laser)',
    profiles: [{ name: '', range: 36, attacks: 6, skill: 3, s: 5, ap: 0, d: 1, keywords: { sustainedHits: 1 } }],
  },
  starcannon: {
    id: 'starcannon', name: 'Звёздная пушка (Starcannon)',
    profiles: [{ name: '', range: 36, attacks: 2, skill: 3, s: 8, ap: -3, d: 2, keywords: {} }],
  },
  guardianCCW: {
    id: 'guardianCCW', name: 'Оружие ближнего боя (Close Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 3, s: 3, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Dire Avengers
  avengerCatapult: {
    id: 'avengerCatapult', name: 'Сюрикен-катапульта Мстителя (Avenger Shuriken Catapult)',
    profiles: [{ name: '', range: 18, attacks: 4, skill: 3, s: 4, ap: -1, d: 1, keywords: { assault: true } }],
  },
  direPistol: {
    id: 'direPistol', name: 'Сюрикен-пистолет (Shuriken Pistol)',
    profiles: [{ name: '', range: 12, attacks: 1, skill: 3, s: 4, ap: -1, d: 1, keywords: { assault: true, closeQuarters: true } }],
  },
  direCCW: {
    id: 'direCCW', name: 'Оружие ближнего боя (Close Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 3, s: 3, ap: 0, d: 1, keywords: {} }],
  },
  diresword: {
    id: 'diresword', name: 'Грозный меч (Diresword)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 4, ap: -2, d: 1, keywords: {} }],
  },
  powerGlaive: {
    id: 'powerGlaive', name: 'Силовая глефа (Power Glaive)',
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 5, ap: -3, d: 1, keywords: {} }],
  },
  // ---- Windriders
  twinShurikenCatapult: {
    id: 'twinShurikenCatapult', name: 'Сдвоенная сюрикен-катапульта (Twin Shuriken Catapult)',
    profiles: [{ name: '', range: 18, attacks: 2, skill: 3, s: 4, ap: -1, d: 1, keywords: { assault: true, twinLinked: true } }],
  },
  windriderCCW: {
    id: 'windriderCCW', name: 'Оружие ближнего боя (Close Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 3, ap: 0, d: 1, keywords: {} }],
  },
}

export const AELDARI_PROFILES: Record<string, ModelProfile> = {
  farseer: {
    id: 'farseer', name: 'Фарсир', m: 7, t: 3, sv: 6, w: 4, ld: 6, oc: 1, invuln: 4, baseMm: 25, character: true,
    weapons: ['eldritchStorm', 'farseerPistol', 'witchblade'],
  },
  guardian: {
    id: 'guardian', name: 'Страж-защитник', m: 7, t: 3, sv: 4, w: 1, ld: 7, oc: 2, baseMm: 28.5,
    weapons: ['shurikenCatapult', 'guardianCCW'],
  },
  heavyPlatform: {
    id: 'heavyPlatform', name: 'Платформа тяжёлого оружия', m: 7, t: 3, sv: 4, w: 2, ld: 7, oc: 0, baseMm: 40, platform: true,
    weapons: ['missileLauncher', 'guardianCCW'],
  },
  direAvenger: {
    id: 'direAvenger', name: 'Грозный мститель', m: 7, t: 3, sv: 4, w: 1, ld: 6, oc: 1, baseMm: 28.5,
    weapons: ['avengerCatapult', 'direCCW'],
  },
  exarch: {
    id: 'exarch', name: 'Экзарх мстителей', m: 7, t: 3, sv: 4, w: 2, ld: 6, oc: 1, invuln: 5, baseMm: 28.5,
    weapons: ['direPistol', 'diresword', 'direCCW'],
  },
  windrider: {
    id: 'windrider', name: 'Райдер ветра', m: 14, t: 4, sv: 4, w: 2, ld: 7, oc: 2, invuln: 6, baseMm: 32,
    weapons: ['twinShurikenCatapult', 'windriderCCW'],
  },
  windriderLaser: {
    id: 'windriderLaser', name: 'Райдер ветра с разброс-лазером', m: 14, t: 4, sv: 4, w: 2, ld: 7, oc: 2, invuln: 6, baseMm: 32,
    weapons: ['scatterLaser', 'windriderCCW'],
  },
  windriderCannon: {
    id: 'windriderCannon', name: 'Райдер ветра с сюрикен-пушкой', m: 14, t: 4, sv: 4, w: 2, ld: 7, oc: 2, invuln: 6, baseMm: 32,
    weapons: ['shurikenCannon', 'windriderCCW'],
  },
}

export const AELDARI_DATASHEETS: Record<string, Datasheet> = {
  farseer: {
    id: 'farseer', name: 'Фарсир (Farseer)', faction: 'aeldari',
    keywords: ['INFANTRY', 'CHARACTER', 'AELDARI', 'PSYKER', 'FARSEER', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'guide', 'branchingFates'],
  },
  guardianDefenders: {
    id: 'guardianDefenders', name: 'Стражи-защитники (Guardian Defenders)', faction: 'aeldari',
    keywords: ['INFANTRY', 'BATTLELINE', 'AELDARI', 'GRENADES', 'GUARDIANS', 'GUARDIAN DEFENDERS', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'fleetOfFoot', 'crewedPlatform'],
  },
  direAvengers: {
    id: 'direAvengers', name: 'Грозные мстители (Dire Avengers)', faction: 'aeldari',
    keywords: ['INFANTRY', 'AELDARI', 'GRENADES', 'ASPECT WARRIORS', 'DIRE AVENGERS', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'bladestorm'],
  },
  windriders: {
    id: 'windriders', name: 'Райдеры ветра (Windriders)', faction: 'aeldari',
    keywords: ['MOUNTED', 'AELDARI', 'FLY', 'WINDRIDERS', 'ASURYANI', 'YNNARI'],
    abilities: ['battleFocus', 'swiftDemise'],
  },
}

export const AELDARI_ABILITY_TEXT: Record<string, string> = {
  battleFocus: 'Боевой фокус (Battle Focus, правило армии Асуряни): в начале каждого раунда — 2 жетона (Incursion). Реализован манёвр Swift as the Wind: жетон даёт +2″ к обычному движению, продвижению или отступлению. [Не реализованы реактивные манёвры: Fade Back, Opportunity Seized, Flitting Shadows, Sudden Strike, Star Engines.]',
  guide: 'Guide (Psychic): в вашей фазе движения выберите вражеский отряд в 18″ и в видимости; союзные модели АЭЛЬДАРИ получают +1 к попаданию по нему до начала вашей следующей фазы командования.',
  branchingFates: 'Ветвящиеся судьбы (Branching Fates): пока ведёт отряд, раз за фазу заменяет бросок на «6». [Не реализовано: присоединение лидеров к отрядам отсутствует.]',
  fleetOfFoot: 'Лёгкая поступь (Fleet of Foot): манёвр Fade Back без жетона. [Не реализовано: Fade Back — реактивное движение, которого нет в движке.]',
  crewedPlatform: 'Экипаж платформы (Crewed Platform): когда погибает последний Страж-защитник, оставшиеся платформы тяжёлого оружия уничтожаются.',
  bladestorm: 'Шквал клинков (Bladestorm): оружие дальнего боя отряда получает Sustained Hits 1 против цели в пределах половины дальности.',
  swiftDemise: 'Быстрая смерть (Swift Demise): при стрельбе можно перебросить попадание на 1; если цель — ближайшая из возможных, можно перебросить любое попадание.',
}
