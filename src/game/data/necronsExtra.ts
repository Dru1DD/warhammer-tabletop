import type { Datasheet, ModelProfile, Weapon } from '../types'

// Necrons beyond the first four units, 11th-edition datasheets as transcribed by Wahapedia (App. Necrons v1.2,
// checked 2026-11-10): Royal Warden, Immortals, Lychguard, Canoptek Wraiths. Default loadouts only.
// See docs/necrons.md for what is implemented and what is approximated.

export const NECRON_EXTRA_WEAPONS: Record<string, Weapon> = {
  // ---- Royal Warden
  relicGaussBlaster: {
    id: 'relicGaussBlaster',
    name: 'Реликтовый гаусс-бластер (Relic Gauss Blaster)',
    profiles: [{ name: '', range: 24, attacks: 2, skill: 3, s: 5, ap: -1, d: 2, keywords: { lethalHits: true, rapidFire: 2 } }],
  },
  wardenCcw: {
    id: 'wardenCcw',
    name: 'Оружие ближнего боя (Close Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 5, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Immortals
  gaussBlaster: {
    id: 'gaussBlaster',
    name: 'Гаусс-бластер (Gauss Blaster)',
    profiles: [{ name: '', range: 24, attacks: 2, skill: 3, s: 5, ap: -1, d: 1, keywords: { lethalHits: true } }],
  },
  immortalCcw: {
    id: 'immortalCcw',
    name: 'Оружие ближнего боя (Close Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 3, s: 4, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Lychguard
  warscythe: {
    id: 'warscythe',
    name: 'Боевая коса (Warscythe)',
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 3, s: 8, ap: -3, d: 2, keywords: { devastatingWounds: true } }],
  },
  // ---- Canoptek Wraiths
  viciousClaws: {
    id: 'viciousClaws',
    name: 'Свирепые когти (Vicious Claws)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 4, s: 6, ap: -1, d: 2, keywords: {} }],
  },
}

export const NECRON_EXTRA_PROFILES: Record<string, ModelProfile> = {
  royalWarden: {
    id: 'royalWarden', name: 'Королевский страж', m: 5, t: 5, sv: 3, w: 4, ld: 6, oc: 1, baseMm: 32, character: true,
    weapons: ['relicGaussBlaster', 'wardenCcw'],
  },
  immortal: {
    id: 'immortal', name: 'Бессмертный', m: 5, t: 5, sv: 3, w: 1, ld: 7, oc: 2, baseMm: 32,
    weapons: ['gaussBlaster', 'immortalCcw'],
  },
  lychguard: {
    id: 'lychguard', name: 'Личгвардеец', m: 5, t: 5, sv: 3, w: 2, ld: 7, oc: 1, baseMm: 32,
    weapons: ['warscythe'],
  },
  canoptekWraith: {
    id: 'canoptekWraith', name: 'Призрак Каноптека', m: 10, t: 6, sv: 3, w: 4, ld: 8, oc: 2, invuln: 4, baseMm: 50,
    weapons: ['viciousClaws'],
  },
}

export const NECRON_EXTRA_DATASHEETS: Record<string, Datasheet> = {
  royalWarden: {
    id: 'royalWarden', name: 'Королевский страж (Royal Warden)', faction: 'necrons',
    keywords: ['INFANTRY', 'CHARACTER', 'ROYAL WARDEN', 'NECRONS'],
    abilities: ['reanimation', 'adaptiveStrategy', 'engrammaticLogic'],
    description: 'Офицер фаланги: стреляет и атакует даже после отступления, раз за битву снимает боевой шок с союзного отряда.',
  },
  immortals: {
    id: 'immortals', name: 'Бессмертные (Immortals)', faction: 'necrons',
    keywords: ['INFANTRY', 'BATTLELINE', 'IMMORTALS', 'NECRONS'],
    abilities: ['reanimation', 'implacableEradication'],
    description: 'Элитная линейная пехота: гаусс-бластеры с Lethal Hits, переброс ранений — полный, если цель у объекта.',
  },
  lychguard: {
    id: 'lychguard', name: 'Личгвардия (Lychguard)', faction: 'necrons',
    keywords: ['INFANTRY', 'LYCHGUARD', 'NECRONS'],
    abilities: ['reanimation', 'guardianProtocols'],
    description: 'Телохранители знати: боевые косы S8 AP −3 с Devastating Wounds; рядом с Оверлордом их труднее ранить.',
  },
  canoptekWraiths: {
    id: 'canoptekWraiths', name: 'Призраки Каноптека (Canoptek Wraiths)', faction: 'necrons',
    keywords: ['BEASTS', 'FLY', 'CANOPTEK', 'WRAITHS', 'NECRONS'],
    abilities: ['reanimation', 'wraithForm'],
    description: 'Фазовые охотники: M10″, 4+ непробиваемый спас; пролетая сквозь врага, наносят ему смертельные раны.',
  },
}

export const NECRON_EXTRA_ABILITY_TEXT: Record<string, string> = {
  adaptiveStrategy: 'Адаптивная стратегия (Adaptive Strategy): отряд может стрелять и объявлять атаку (charge) в ход, когда отступил.',
  engrammaticLogic:
    'Энграмматическая логика (Engrammatic Logic): раз за битву снимите боевой шок с союзного отряда Некронов в 12″. [Приближение: применяется в любой момент вашего хода, а не только в начале фазы.]',
  implacableEradication:
    'Неумолимое истребление (Implacable Eradication): атаки отряда перебрасывают на ранение единицы; если цель в зоне объекта — любые проваленные броски на ранение.',
  guardianProtocols:
    'Протоколы стражей (Guardian Protocols): пока отряд ведёт NOBLE, атаки по нему с Силой больше его Стойкости получают −1 к броску на ранение. [Приближение: присоединения лидеров нет — отряд считается ведомым, если в 3″ от него союзный NOBLE (Оверлорд).]',
  wraithForm:
    'Фазовая форма (Wraith Form): после обычного движения выберите вражеский отряд, сквозь который отряд пролетел, и бросьте D6 за каждую модель: каждая 4+ — 1 смертельная рана.',
}
