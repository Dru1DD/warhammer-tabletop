import type { Datasheet, ModelProfile, Weapon } from '../types'

// Space Marines beyond the Introductory Set, 11th-edition datasheets as transcribed by Wahapedia (checked
// 2026-11-10): Captain, Hellblaster Squad, Infernus Squad, Bladeguard Veteran Squad. Default loadouts only.
// See docs/marines.md for what is implemented and what is approximated. The Introductory Set units
// (Lieutenant, Intercessors, Assault Intercessors, Redemptor) stay in datasheets.ts.

export const MARINE_WEAPONS: Record<string, Weapon> = {
  // ---- Captain
  captainHeavyBoltPistol: {
    id: 'captainHeavyBoltPistol',
    name: 'Тяжёлый болт-пистолет (Heavy Bolt Pistol)',
    profiles: [{ name: '', range: 18, attacks: 1, skill: 2, s: 5, ap: -1, d: 1, keywords: { closeQuarters: true } }],
  },
  masterCraftedBolter: {
    id: 'masterCraftedBolter',
    name: 'Мастерский болтер (Master-crafted Bolter)',
    profiles: [{ name: '', range: 24, attacks: 2, skill: 2, s: 5, ap: -1, d: 2, keywords: { rapidFire: 1, assault: true } }],
  },
  captainPowerWeapon: {
    id: 'captainPowerWeapon',
    name: 'Мастерское силовое оружие (Master-crafted Power Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 6, skill: 2, s: 6, ap: -2, d: 2, keywords: {} }],
  },
  // ---- Hellblasters, Infernus
  plasmaIncinerator: {
    id: 'plasmaIncinerator',
    name: 'Плазменный испепелитель (Plasma Incinerator)',
    profiles: [
      { name: 'Стандарт', range: 24, attacks: 2, skill: 3, s: 7, ap: -2, d: 2, keywords: { rapidFire: 1, assault: true } },
      { name: 'Перегрузка (Supercharge)', range: 24, attacks: 2, skill: 3, s: 8, ap: -3, d: 2, keywords: { rapidFire: 1, assault: true, hazardous: true } },
    ],
  },
  pyreblaster: {
    id: 'pyreblaster',
    name: 'Пиробластер (Pyreblaster)',
    profiles: [{ name: '', range: 12, attacks: 3, skill: null, s: 5, ap: -1, d: 1, keywords: { torrent: true, blast: 1 } }],
  },
  ceramiteFists: {
    id: 'ceramiteFists',
    name: 'Керамитовые кулаки (Ceramite Fists)',
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 5, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Bladeguard Veterans (the Heavy Bolt Pistol is the core one: 18", BS 3+)
  masterCraftedPowerSword: {
    id: 'masterCraftedPowerSword',
    name: 'Мастерский силовой меч (Master-crafted Power Sword)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 5, ap: -2, d: 2, keywords: {} }],
  },
}

const tacticus = { m: 6, t: 5, sv: 3, ld: 6, oc: 1 }

export const MARINE_PROFILES: Record<string, ModelProfile> = {
  captain: {
    id: 'captain', name: 'Капитан', ...tacticus, w: 5, invuln: 4, baseMm: 40, character: true,
    weapons: ['masterCraftedBolter', 'captainHeavyBoltPistol', 'captainPowerWeapon'],
  },
  hellblasterSergeant: {
    id: 'hellblasterSergeant', name: 'Сержант адских бластеров', ...tacticus, w: 2, baseMm: 32,
    weapons: ['plasmaIncinerator', 'boltPistol', 'ceramiteFists'],
  },
  hellblaster: {
    id: 'hellblaster', name: 'Адский бластер', ...tacticus, w: 2, baseMm: 32,
    weapons: ['plasmaIncinerator', 'boltPistol', 'ceramiteFists'],
  },
  infernusSergeant: {
    id: 'infernusSergeant', name: 'Сержант Инфернус', ...tacticus, w: 2, baseMm: 32,
    weapons: ['pyreblaster', 'boltPistol', 'ceramiteFists'],
  },
  infernusMarine: {
    id: 'infernusMarine', name: 'Десантник Инфернус', ...tacticus, w: 2, baseMm: 32,
    weapons: ['pyreblaster', 'boltPistol', 'ceramiteFists'],
  },
  bladeguardSergeant: {
    id: 'bladeguardSergeant', name: 'Сержант ветеранов Bladeguard', ...tacticus, w: 3, invuln: 4, baseMm: 40,
    weapons: ['heavyBoltPistol', 'masterCraftedPowerSword'],
  },
  bladeguardVeteran: {
    id: 'bladeguardVeteran', name: 'Ветеран Bladeguard', ...tacticus, w: 3, invuln: 4, baseMm: 40,
    weapons: ['heavyBoltPistol', 'masterCraftedPowerSword'],
  },
}

export const MARINE_DATASHEETS: Record<string, Datasheet> = {
  captain: {
    id: 'captain', name: 'Капитан (Captain)', faction: 'marines',
    keywords: ['INFANTRY', 'CHARACTER', 'EXPLOSIVES', 'IMPERIUM', 'TACTICUS'],
    abilities: ['finestHour', 'strategicAcumen'],
    description: 'Командир роты: 4+ непробиваемый спас, мастерский болтер и силовое оружие; раз за битву — «Звёздный час» в ближнем бою.',
  },
  hellblasters: {
    id: 'hellblasters', name: 'Отделение адских бластеров (Hellblaster Squad)', faction: 'marines',
    keywords: ['INFANTRY', 'EXPLOSIVES', 'IMPERIUM', 'TACTICUS'],
    abilities: ['thermalAppeasement'],
    description: 'Плазменная огневая поддержка на 24″: перегрузка пробивает тяжёлую броню, а перегрев им почти не страшен.',
  },
  infernus: {
    id: 'infernus', name: 'Отделение Инфернус (Infernus Squad)', faction: 'marines',
    keywords: ['INFANTRY', 'EXPLOSIVES', 'IMPERIUM', 'TACTICUS'],
    abilities: ['drivenFromCover'],
    description: 'Огнемётчики ближней дистанции: пиробластеры бьют без броска на попадание и выкуривают врага из укрытия.',
  },
  bladeguard: {
    id: 'bladeguard', name: 'Ветераны Bladeguard (Bladeguard Veteran Squad)', faction: 'marines',
    keywords: ['INFANTRY', 'EXPLOSIVES', 'IMPERIUM', 'TACTICUS'],
    abilities: ['bladeguard'],
    description: 'Элитные мечники: W3, 4+ непробиваемый спас, мастерские силовые мечи; держат центр и перехватывают врага.',
  },
}

export const MARINE_ABILITY_TEXT: Record<string, string> = {
  finestHour: 'Звёздный час (Finest Hour): раз за битву, когда отряд выбран для боя, его рукопашные атаки получают +3 к атакам и Devastating Wounds.',
  strategicAcumen:
    'Стратегическая проницательность (Strategic Acumen): в фазе командования делает одну боевую доктрину активной для отряда. [Не реализовано: боевых доктрин (Combat Doctrines) в игре нет.]',
  thermalAppeasement: 'Ритуалы теплового умиротворения (Rites of Thermal Appeasement): +1 к броскам опасности (Hazardous) за плазменное оружие отряда — провал только на 1.',
  drivenFromCover:
    'Выкурить из укрытия (Driven from Cover): после стрельбы отряда выбранная цель, по которой были попадания, до конца хода не получает укрытия от стрельбы союзных Космодесантников.',
  bladeguard:
    'Bladeguard: раз за ход, когда отряд выбран для боя, его рукопашные атаки получают +1 к броску на попадание. [Вторая возможность — −1 к попаданию по отряду, когда его атакуют, — не реализована: в игре нет ответных решений в чужой ход.]',
}
