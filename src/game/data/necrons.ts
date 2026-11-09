import type { Datasheet, ModelProfile, Weapon } from '../types'

// Necrons, 11th-edition datasheets as transcribed by Wahapedia (checked 2026-11-09):
//   Overlord, Necron Warriors, Skorpekh Destroyers, Canoptek Scarab Swarms.

export const NECRON_WEAPONS: Record<string, Weapon> = {
  // ---- Overlord
  staffOfLight: {
    id: 'staffOfLight', name: 'Жезл света (Staff of Light, стрельба)',
    profiles: [{ name: '', range: 18, attacks: 3, skill: 2, s: 5, ap: -2, d: 1, keywords: {} }],
  },
  tachyonArrow: {
    id: 'tachyonArrow', name: 'Тахионная стрела (Tachyon Arrow)',
    // D6+2 damage: fixed 2 plus a D6
    profiles: [{ name: '', range: 72, attacks: 1, skill: 2, s: 16, ap: -5, d: 2, randomD: 'D6', keywords: { oneShot: true } }],
  },
  overlordsBlade: {
    id: 'overlordsBlade', name: 'Клинок Оверлорда (Overlord’s Blade)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 2, s: 8, ap: -3, d: 2, keywords: { devastatingWounds: true } }],
  },
  staffOfLightMelee: {
    id: 'staffOfLightMelee', name: 'Жезл света (Staff of Light, ближний бой)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 2, s: 5, ap: -2, d: 1, keywords: {} }],
  },
  voidscythe: {
    id: 'voidscythe', name: 'Коса Пустоты (Voidscythe)',
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 12, ap: -3, d: 3, keywords: { devastatingWounds: true } }],
  },
  // ---- Necron Warriors
  gaussFlayer: {
    id: 'gaussFlayer', name: 'Гаусс-сдиратель (Gauss Flayer)',
    profiles: [{ name: '', range: 24, attacks: 1, skill: 4, s: 4, ap: 0, d: 1, keywords: { lethalHits: true, rapidFire: 1 } }],
  },
  gaussReaper: {
    id: 'gaussReaper', name: 'Гаусс-жнец (Gauss Reaper)',
    profiles: [{ name: '', range: 12, attacks: 2, skill: 4, s: 4, ap: -1, d: 1, keywords: { lethalHits: true } }],
  },
  necronCCW: {
    id: 'necronCCW', name: 'Оружие ближнего боя (Close Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 4, s: 4, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Skorpekh Destroyers
  hyperphaseWeapons: {
    id: 'hyperphaseWeapons', name: 'Гиперфазовое оружие скорпекхов (Skorpekh Hyperphase Weapons)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 7, ap: -2, d: 2, keywords: {} }],
  },
  // ---- Canoptek Scarab Swarms
  feederMandibles: {
    id: 'feederMandibles', name: 'Жвала-пожиратели (Feeder Mandibles)',
    profiles: [{ name: '', range: 'melee', attacks: 6, skill: 5, s: 2, ap: 0, d: 1, keywords: { lethalHits: true } }],
  },
}

export const NECRON_PROFILES: Record<string, ModelProfile> = {
  overlord: {
    id: 'overlord', name: 'Оверлорд', m: 5, t: 5, sv: 2, w: 6, ld: 6, oc: 1, invuln: 4, baseMm: 40, character: true,
    weapons: ['tachyonArrow', 'overlordsBlade'],
  },
  necronWarrior: {
    id: 'necronWarrior', name: 'Воин некронов', m: 5, t: 4, sv: 4, w: 1, ld: 7, oc: 2, baseMm: 32,
    weapons: ['gaussFlayer', 'necronCCW'],
  },
  skorpekh: {
    id: 'skorpekh', name: 'Скорпекх-разрушитель', m: 8, t: 6, sv: 3, w: 3, ld: 7, oc: 2, baseMm: 50,
    weapons: ['hyperphaseWeapons'],
  },
  scarab: {
    id: 'scarab', name: 'Рой скарабеев', m: 10, t: 2, sv: 6, w: 4, ld: 8, oc: 0, baseMm: 40,
    weapons: ['feederMandibles'],
  },
}

export const NECRON_DATASHEETS: Record<string, Datasheet> = {
  overlord: {
    id: 'overlord', name: 'Оверлорд (Overlord)', faction: 'necrons',
    keywords: ['INFANTRY', 'CHARACTER', 'NOBLE', 'OVERLORD', 'NECRONS'],
    abilities: ['reanimation', 'implacableResilience', 'myWillBeDone'],
  },
  necronWarriors: {
    id: 'necronWarriors', name: 'Воины некронов (Necron Warriors)', faction: 'necrons',
    keywords: ['INFANTRY', 'BATTLELINE', 'NECRON WARRIORS', 'NECRONS'],
    abilities: ['reanimation', 'legion'],
  },
  skorpekhDestroyers: {
    id: 'skorpekhDestroyers', name: 'Скорпекх-разрушители (Skorpekh Destroyers)', faction: 'necrons',
    keywords: ['INFANTRY', 'DESTROYER CULT', 'SKORPEKH DESTROYERS', 'NECRONS'],
    abilities: ['reanimation', 'whirlingOnslaught'],
  },
  scarabSwarms: {
    id: 'scarabSwarms', name: 'Рои скарабеев Каноптека (Canoptek Scarab Swarms)', faction: 'necrons',
    keywords: ['SWARM', 'FLY', 'CANOPTEK', 'SCARAB SWARMS', 'NECRONS'],
    abilities: ['reanimation', 'selfDestruction', 'chitteringSwarm'],
  },
}

export const NECRON_ABILITY_TEXT: Record<string, string> = {
  reanimation: 'Протоколы реанимации (Reanimation Protocols, правило армии): в конце вашей фазы командования отряд лечит D3 ран: сначала восстанавливаются раны повреждённых моделей, затем возвращаются уничтоженные модели (кроме CHARACTER) с 1 раной. Отряд не превышает начальную численность.',
  legion: 'Их число — легион (Their Number is Legion): при реанимации можно перебросить кубик, определяющий число ран. [Симулятор перебрасывает результат 1.]',
  implacableResilience: 'Неумолимая стойкость (Implacable Resilience): каждая атака, назначенная этой модели, получает −1 к Урону (не меньше 1).',
  myWillBeDone: 'Да будет моя воля (My Will Be Done): снижает стоимость стратагемы на 1 CP. [Не реализовано: в симуляторе нет стратагем.]',
  whirlingOnslaught: 'Вихрь атаки (Whirling Onslaught): в ближнем бою можно перебросить попадание на 1; если отряд совершил атаку (charge) в этот ход — любое попадание.',
  selfDestruction: 'Самоуничтожение (Self-destruction): в начале фазы боя отряд в зоне контакта уничтожает одну модель; враг в зоне контакта этой модели бросает D6 (+1 против VEHICLE): 2–5 — D3 смертельных ран, 6+ — 3. [В симуляторе срабатывает автоматически, пока в отряде 2+ модели.]',
  chitteringSwarm: 'Стрекочущий рой (Chittering Swarm): модели вражеского отряда в зоне контакта с роем снижают OC на 1 (не ниже 1).',
}
