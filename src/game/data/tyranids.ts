import type { Datasheet, ModelProfile, Weapon } from '../types'

// Tyranids, 11th-edition datasheets as transcribed by Wahapedia (checked 2026-11-09):
//   Hive Tyrant, Termagants, Hormagaunts, Tyranid Warriors With Ranged Bio-weapons.
// Every weapon profile of the datasheet is listed; `PROFILES` picks the training loadout (docs/armies.md).

export const TYRANID_WEAPONS: Record<string, Weapon> = {
  // ---- Hive Tyrant
  heavyVenomCannon: {
    id: 'heavyVenomCannon', name: 'Тяжёлая ядовитая пушка (Heavy Venom Cannon)',
    profiles: [{ name: '', range: 36, attacks: 0, randomA: 'D3', skill: 2, s: 9, ap: -2, d: 3, keywords: { blast: 1 } }],
  },
  stranglethornCannon: {
    id: 'stranglethornCannon', name: 'Пушка «Удавка-тернь» (Stranglethorn Cannon)',
    profiles: [{ name: '', range: 36, attacks: 1, randomA: 'D6', skill: 2, s: 7, ap: -1, d: 2, keywords: { blast: 1 } }],
  },
  boneswordLashWhip: {
    id: 'boneswordLashWhip', name: 'Костяной меч и хлыст (Monstrous Bonesword and Lash Whip)',
    profiles: [{ name: '', range: 'melee', attacks: 6, skill: 2, s: 9, ap: -2, d: 3, keywords: { twinLinked: true } }],
  },
  scythingTalons: {
    id: 'scythingTalons', name: 'Когти-серпы (Monstrous Scything Talons)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 2, s: 7, ap: -2, d: 2, keywords: { extraAttacks: true } }],
  },
  // ---- Termagants
  fleshborer: {
    id: 'fleshborer', name: 'Плотеед (Fleshborer)',
    profiles: [{ name: '', range: 18, attacks: 1, skill: 4, s: 5, ap: 0, d: 1, keywords: { assault: true } }],
  },
  termagantDevourer: {
    id: 'termagantDevourer', name: 'Пожиратель термагантов (Termagant Devourer)',
    profiles: [{ name: '', range: 18, attacks: 2, skill: 4, s: 4, ap: 0, d: 1, keywords: {} }],
  },
  termagantSpinefists: {
    id: 'termagantSpinefists', name: 'Иглострелы (Termagant Spinefists)',
    profiles: [{ name: '', range: 12, attacks: 2, skill: 4, s: 3, ap: 0, d: 1, keywords: { assault: true, closeQuarters: true, twinLinked: true } }],
  },
  shardlauncher: {
    id: 'shardlauncher', name: 'Осколочная пушка (Shardlauncher)',
    profiles: [{ name: '', range: 18, attacks: 0, randomA: 'D3', skill: 4, s: 5, ap: 0, d: 1, keywords: { blast: 1, heavy: true } }],
  },
  spikeRifle: {
    id: 'spikeRifle', name: 'Шипомёт (Spike Rifle)',
    profiles: [{ name: '', range: 24, attacks: 1, skill: 4, s: 4, ap: -1, d: 1, keywords: { heavy: true } }],
  },
  strangleweb: {
    id: 'strangleweb', name: 'Паутинная плеть (Strangleweb)',
    profiles: [{ name: '', range: 18, attacks: 0, randomA: 'D6', skill: null, s: 2, ap: 0, d: 1, keywords: { assault: true, devastatingWounds: true, torrent: true } }],
  },
  termagantClaws: {
    id: 'termagantClaws', name: 'Хитиновые когти и зубы (Chitinous Claws and Teeth)',
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 4, s: 3, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Hormagaunts
  hormagauntTalons: {
    id: 'hormagauntTalons', name: 'Когти гормагаунта (Hormagaunt Talons)',
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 4, s: 3, ap: -1, d: 1, keywords: {} }],
  },
  // ---- Tyranid Warriors with Ranged Bio-weapons
  warriorDevourer: {
    id: 'warriorDevourer', name: 'Пожиратель (Devourer)',
    profiles: [{ name: '', range: 18, attacks: 5, skill: 4, s: 4, ap: 0, d: 1, keywords: {} }],
  },
  deathspitter: {
    id: 'deathspitter', name: 'Смертеплюй (Deathspitter)',
    profiles: [{ name: '', range: 24, attacks: 3, skill: 4, s: 5, ap: -1, d: 1, keywords: {} }],
  },
  barbedStrangler: {
    id: 'barbedStrangler', name: 'Колючий душитель (Barbed Strangler)',
    profiles: [{ name: '', range: 36, attacks: 1, randomA: 'D6', skill: 4, s: 6, ap: -1, d: 1, keywords: { blast: 1 } }],
  },
  venomCannon: {
    id: 'venomCannon', name: 'Ядовитая пушка (Venom Cannon)',
    profiles: [{ name: '', range: 36, attacks: 0, randomA: 'D3', skill: 4, s: 9, ap: -2, d: 2, keywords: { blast: 1 } }],
  },
  warriorSpinefists: {
    id: 'warriorSpinefists', name: 'Иглострелы (Spinefists)',
    profiles: [{ name: '', range: 12, attacks: 2, skill: 4, s: 4, ap: 0, d: 1, keywords: { assault: true, closeQuarters: true, twinLinked: true } }],
  },
  warriorClaws: {
    id: 'warriorClaws', name: 'Когти и когтищи воина (Tyranid Warrior Claws and Talons)',
    profiles: [{ name: '', range: 'melee', attacks: 5, skill: 3, s: 5, ap: -1, d: 1, keywords: {} }],
  },
}

export const TYRANID_PROFILES: Record<string, ModelProfile> = {
  hiveTyrant: {
    id: 'hiveTyrant', name: 'Тиран Улья', m: 8, t: 10, sv: 2, w: 10, ld: 7, oc: 3, invuln: 4, baseMm: 60, character: true,
    weapons: ['boneswordLashWhip', 'scythingTalons'],
  },
  termagant: {
    id: 'termagant', name: 'Термагант', m: 6, t: 3, sv: 5, w: 1, ld: 8, oc: 2, baseMm: 28.5,
    weapons: ['fleshborer', 'termagantClaws'],
  },
  termagantShard: {
    id: 'termagantShard', name: 'Термагант с осколочной пушкой', m: 6, t: 3, sv: 5, w: 1, ld: 8, oc: 2, baseMm: 28.5,
    weapons: ['shardlauncher', 'termagantClaws'],
  },
  termagantSpike: {
    id: 'termagantSpike', name: 'Термагант с шипомётом', m: 6, t: 3, sv: 5, w: 1, ld: 8, oc: 2, baseMm: 28.5,
    weapons: ['spikeRifle', 'termagantClaws'],
  },
  termagantWeb: {
    id: 'termagantWeb', name: 'Термагант с паутинной плетью', m: 6, t: 3, sv: 5, w: 1, ld: 8, oc: 2, baseMm: 28.5,
    weapons: ['strangleweb', 'termagantClaws'],
  },
  hormagaunt: {
    id: 'hormagaunt', name: 'Гормагаунт', m: 10, t: 3, sv: 5, w: 1, ld: 8, oc: 2, baseMm: 28.5,
    weapons: ['hormagauntTalons'],
  },
  tyranidPrime: {
    id: 'tyranidPrime', name: 'Прайм тиранидов', m: 6, t: 5, sv: 4, w: 3, ld: 7, oc: 2, baseMm: 50,
    weapons: ['warriorDevourer', 'warriorClaws'],
  },
  tyranidWarrior: {
    id: 'tyranidWarrior', name: 'Воин тиранидов', m: 6, t: 5, sv: 4, w: 3, ld: 7, oc: 2, baseMm: 50,
    weapons: ['warriorDevourer', 'warriorClaws'],
  },
  tyranidWarriorVenom: {
    id: 'tyranidWarriorVenom', name: 'Воин с ядовитой пушкой', m: 6, t: 5, sv: 4, w: 3, ld: 7, oc: 2, baseMm: 50,
    weapons: ['venomCannon', 'warriorClaws'],
  },
  tyranidWarriorStrangler: {
    id: 'tyranidWarriorStrangler', name: 'Воин с колючим душителем', m: 6, t: 5, sv: 4, w: 3, ld: 7, oc: 2, baseMm: 50,
    weapons: ['barbedStrangler', 'warriorClaws'],
  },
}

export const TYRANID_DATASHEETS: Record<string, Datasheet> = {
  hiveTyrant: {
    id: 'hiveTyrant', name: 'Тиран Улья (Hive Tyrant)', faction: 'tyranids',
    keywords: ['MONSTER', 'CHARACTER', 'PSYKER', 'GREAT DEVOURER', 'SYNAPSE', 'HIVE TYRANT', 'TYRANIDS'],
    abilities: ['synapse', 'shadowInTheWarp', 'onslaught', 'willOfTheHiveMind', 'deadlyDemiseD3'],
  },
  termagants: {
    id: 'termagants', name: 'Термаганты (Termagants)', faction: 'tyranids',
    keywords: ['INFANTRY', 'BATTLELINE', 'GREAT DEVOURER', 'ENDLESS MULTITUDE', 'TERMAGANTS', 'TYRANIDS'],
    abilities: ['synapse', 'skulkingHorrors'],
  },
  hormagaunts: {
    id: 'hormagaunts', name: 'Гормагауны (Hormagaunts)', faction: 'tyranids',
    keywords: ['INFANTRY', 'BATTLELINE', 'GREAT DEVOURER', 'ENDLESS MULTITUDE', 'HORMAGAUNTS', 'TYRANIDS'],
    abilities: ['synapse', 'boundingLeap'],
  },
  tyranidWarriors: {
    id: 'tyranidWarriors', name: 'Воины тиранидов с дальнобойным био-оружием (Tyranid Warriors With Ranged Bio-weapons)', faction: 'tyranids',
    keywords: ['INFANTRY', 'GREAT DEVOURER', 'SYNAPSE', 'TYRANID WARRIORS WITH RANGED BIO-WEAPONS', 'TYRANIDS'],
    abilities: ['synapse', 'shadowInTheWarp', 'adaptablePredators'],
  },
}

export const TYRANID_ABILITY_TEXT: Record<string, string> = {
  synapse: 'Synapse (правило армии): отряд ТИРАНИДОВ в 6″ от союзной модели SYNAPSE находится в Synapse Range: проверки боевого шока он проходит на 3D6 вместо 2D6, а его рукопашные атаки получают +1 к Силе.',
  shadowInTheWarp: 'Тень в Варпе (Shadow in the Warp, правило армии): раз за битву в фазе командования каждый вражеский отряд проходит проверку боевого шока; в 6″ от вашего отряда SYNAPSE — с −1. [В симуляторе — только в вашей собственной фазе командования.]',
  onslaught: 'Натиск (Onslaught, аура, Psychic): пока союзный отряд ТИРАНИДОВ в 6″ от Тирана Улья, его оружие дальнего боя получает Assault и Lethal Hits.',
  willOfTheHiveMind: 'Воля Улья (Will of the Hive Mind): снижает стоимость стратагемы на 1 CP. [Не реализовано: в симуляторе нет стратагем.]',
  boundingLeap: 'Прыжок (Bounding Leap): отряд может объявлять атаку (charge) в ход, когда он совершил продвижение (Advance).',
  adaptablePredators: 'Приспособленные хищники (Adaptable Predators): отряд может стрелять и объявлять атаку в ход, когда он совершил отступление (Fall Back).',
  skulkingHorrors: 'Крадущиеся ужасы (Skulking Horrors): когда враг заканчивает движение в 8″, отряд может сделать обычное движение до D6″. [Не реализовано: ответные движения вне своего хода в движке отсутствуют.]',
}
