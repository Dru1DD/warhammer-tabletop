import type { Datasheet, ModelProfile, Weapon } from '../types'

// Orks beyond the Introductory Set, 11th-edition datasheets as transcribed by Wahapedia (Orks app v1.2,
// checked 2026-11-10): Warboss, Nobz, Gretchin, Kommandos. Default loadouts only (wargear options are not
// in the army builder yet). See docs/orks.md for what is implemented and what is approximated.
// The Boyz and the Deff Dread stay in datasheets.ts.

const nonMV = 'nonMV' as const

export const ORK_WEAPONS: Record<string, Weapon> = {
  kustomShoota: {
    id: 'kustomShoota',
    name: 'Кастом-шута (Kustom Shoota)',
    profiles: [{ name: '', range: 18, attacks: 4, skill: 5, s: 4, ap: 0, d: 1, keywords: { lethalHits: nonMV, rapidFire: 2 } }],
  },
  // ---- Warboss
  bossKustomChoppa: {
    id: 'bossKustomChoppa',
    name: 'Кастом-тесак босса (Kustom Choppa)',
    profiles: [{ name: '', range: 'melee', attacks: 6, skill: 2, s: 7, ap: -2, d: 2, keywords: { cleave: 2 } }],
  },
  // ---- Nobz
  kustomKrumpa: {
    id: 'kustomKrumpa',
    name: 'Кастом-крумпа (Kustom Krumpa)',
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 3, s: 10, ap: -2, d: 2, keywords: {} }],
  },
  // ---- Gretchin
  grotBlasta: {
    id: 'grotBlasta',
    name: 'Грот-бласта (Grot Blasta)',
    profiles: [{ name: '', range: 12, attacks: 1, skill: 4, s: 3, ap: 0, d: 1, keywords: { closeQuarters: true } }],
  },
  scavengedShivs: {
    id: 'scavengedShivs',
    name: 'Трофейные заточки (Scavenged Shivs)',
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 5, s: 2, ap: 0, d: 1, keywords: {} }],
  },
  // Kommandos use the core Slugga and Choppa (same profiles as the Boyz').
}

export const ORK_PROFILES: Record<string, ModelProfile> = {
  warboss: {
    id: 'warboss', name: 'Варбосс', m: 6, t: 6, sv: 4, w: 6, ld: 6, oc: 1, invuln: 5, baseMm: 50, character: true,
    weapons: ['kustomShoota', 'bossKustomChoppa'],
  },
  nobzNob: {
    id: 'nobzNob', name: 'Ноб с крумпой', m: 6, t: 5, sv: 4, w: 3, ld: 7, oc: 1, baseMm: 40,
    weapons: ['kustomShoota', 'kustomKrumpa'],
  },
  gretchin: {
    id: 'gretchin', name: 'Гретчин', m: 6, t: 2, sv: 6, w: 1, ld: 8, oc: 1, baseMm: 25,
    weapons: ['grotBlasta', 'scavengedShivs'],
  },
  kommandoNob: {
    id: 'kommandoNob', name: 'Ноб коммандос', m: 6, t: 5, sv: 5, w: 3, ld: 7, oc: 1, baseMm: 32,
    weapons: ['slugga', 'choppa'],
  },
  kommando: {
    id: 'kommando', name: 'Коммандо', m: 6, t: 5, sv: 5, w: 1, ld: 7, oc: 1, baseMm: 32,
    weapons: ['slugga', 'choppa'],
  },
}

export const ORK_DATASHEETS: Record<string, Datasheet> = {
  warboss: {
    id: 'warboss', name: 'Варбосс (Warboss)', faction: 'orks',
    keywords: ['INFANTRY', 'CHARACTER', 'EXPLOSIVES', 'WARBOSS', 'ORKS'],
    abilities: ['ammoRunts', 'mightIsRight', 'intimidatingMotivation', 'waaagh'],
    description: 'Главарь армии: T6, W6, 5+ непробиваемый спас; после атаки (charge) его тесак бьёт ещё сильнее.',
  },
  nobz: {
    id: 'nobz', name: 'Нобы (Nobz)', faction: 'orks',
    keywords: ['INFANTRY', 'EXPLOSIVES', 'ORKS'],
    abilities: ['ammoRunts', 'getOutDaWay', 'waaagh'],
    description: 'Самые здоровые орки: 4+ спас и W3, крумпы S10 ломают технику и тяжёлую пехоту.',
  },
  gretchin: {
    id: 'gretchin', name: 'Гретчины (Gretchin)', faction: 'orks',
    keywords: ['INFANTRY', 'GROTS', 'ORKS'],
    abilities: ['thievinScavengers', 'waaagh'],
    description: 'Дешёвые и хрупкие: занимают цели и закрепляют их за армией, пока орки дерутся.',
  },
  kommandos: {
    id: 'kommandos', name: 'Коммандос (Kommandos)', faction: 'orks',
    keywords: ['INFANTRY', 'EXPLOSIVES', 'SMOKE', 'ORKS'],
    abilities: ['infiltrators', 'stealth', 'bombSquig', 'waaagh'],
    description: 'Диверсанты: ставятся вне зоны развёртывания, по ним всегда укрытие; раз за битву взрывают врага бомбосквигом.',
  },
}

export const ORK_ABILITY_TEXT: Record<string, string> = {
  mightIsRight: 'Кто сильнее, тот и прав (Might Is Right): если отряд совершил атаку (charge) в этот ход, его рукопашные атаки получают +3 к атакам и +2 к Силе.',
  intimidatingMotivation:
    'Устрашающая мотивация (Intimidating Motivation): раз за раунд в фазе движения выберите союзный отряд Орков в 6″ — он перестаёт быть в боевом шоке и «разъяряется». [Не реализовано: «разъярение» в игре общее для армии (Waaagh!), отдельного для отряда нет.]',
  getOutDaWay:
    'С дороги! (Get Out da Way!): при перемещении атаки отряд может проходить сквозь модели, кроме MONSTER и VEHICLE. [Не реализовано: атака строится в обход чужих подставок.]',
  thievinScavengers:
    'Вороватые падальщики (Thievin’ Scavengers): в конце вашей фазы движения, если отряд рядом с целью, которую вы контролируете, цель закрепляется за вами, пока уровень контроля врага не станет выше вашего.',
  bombSquig:
    'Бомбосквиг (Bomb Squig): раз за битву, после обычного движения отряда, выберите видимый вражеский отряд в 12″ и бросьте D6: на 3+ он получает D3 смертельные раны. [Found ’Em!, Nowhere to Hide и деление отряда надвое (Taktikal Know-wotz) не реализованы: в игре нет правил обнаружения.]',
}
