import type { Datasheet, ModelProfile, Weapon } from '../types'

// Adeptus Mechanicus, 11th-edition datasheets as transcribed by Wahapedia (checked 2026-11-09):
//   Tech-Priest Dominus, Tech-Priest Manipulus, Skitarii Rangers, Skitarii Vanguard, Kataphron Breachers,
//   Kataphron Destroyers, Sicarian Infiltrators, Kastelan Robots. See docs/mechanicus.md.

const anti = (keyword: string, roll: number) => ({ keyword, roll })

export const MECHANICUS_WEAPONS: Record<string, Weapon> = {
  // ---- Tech-Priest Dominus
  macrostubber: {
    id: 'macrostubber', name: 'Макростаббер (Macrostubber)',
    profiles: [{ name: '', range: 12, attacks: 5, skill: 3, s: 4, ap: 0, d: 1, keywords: { closeQuarters: true } }],
  },
  phosphorSerpenta: {
    id: 'phosphorSerpenta', name: 'Фосфорная серпента (Phosphor Serpenta)',
    profiles: [{ name: '', range: 18, attacks: 1, skill: 3, s: 5, ap: -1, d: 2, keywords: { closeQuarters: true, ignoresCover: true } }],
  },
  volkiteBlaster: {
    id: 'volkiteBlaster', name: 'Волкитный бластер (Volkite Blaster)',
    profiles: [{ name: '', range: 24, attacks: 3, skill: 3, s: 5, ap: 0, d: 2, keywords: { devastatingWounds: true } }],
  },
  eradicationRay: {
    id: 'eradicationRay', name: 'Луч искоренения (Eradication Ray)',
    profiles: [
      { name: 'Рассеянный (Dissipated)', range: 24, attacks: 0, randomA: 'D3', skill: 3, s: 6, ap: -1, d: 1, keywords: {} },
      { name: 'Сфокусированный (Focused)', range: 12, attacks: 0, randomA: 'D3', skill: 3, s: 6, ap: -2, d: 2, keywords: {} },
    ],
  },
  omnissianAxe: {
    id: 'omnissianAxe', name: 'Топор Омниссии (Omnissian Axe)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 6, ap: -2, d: 2, keywords: {} }],
  },
  // ---- Tech-Priest Manipulus
  magnarailLance: {
    id: 'magnarailLance', name: 'Магнарельсовое копьё (Magnarail Lance)',
    profiles: [{ name: '', range: 36, attacks: 1, skill: 3, s: 7, ap: -2, d: 3, keywords: { heavy: true } }],
  },
  transonicCannon: {
    id: 'transonicCannon', name: 'Трансоническая пушка (Transonic Cannon)',
    profiles: [{ name: '', range: 12, attacks: 0, randomA: 'D6', skill: null, s: 4, ap: 0, d: 2, keywords: { torrent: true, devastatingWounds: true } }],
  },
  omnissianStaff: {
    id: 'omnissianStaff', name: 'Посох Омниссии (Omnissian Staff)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 6, ap: -1, d: 2, keywords: {} }],
  },
  // ---- Skitarii (Rangers and Vanguard)
  galvanicRifle: {
    id: 'galvanicRifle', name: 'Гальваническая винтовка (Galvanic Rifle)',
    profiles: [{ name: '', range: 30, attacks: 2, skill: 4, s: 4, ap: 0, d: 1, keywords: {} }],
  },
  radiumCarbine: {
    id: 'radiumCarbine', name: 'Радиевый карабин (Radium Carbine)',
    profiles: [{ name: '', range: 18, attacks: 3, skill: 4, s: 3, ap: 0, d: 1, keywords: { anti: anti('INFANTRY', 4) } }],
  },
  arcRifle: {
    id: 'arcRifle', name: 'Дуговая винтовка (Arc Rifle)',
    profiles: [{ name: '', range: 30, attacks: 1, skill: 4, s: 8, ap: -1, d: 0, randomD: 'D3', keywords: { anti: anti('VEHICLE', 4), devastatingWounds: true, rapidFire: 1 } }],
  },
  transuranicArquebus: {
    id: 'transuranicArquebus', name: 'Трансурановая аркебуза (Transuranic Arquebus)',
    profiles: [{ name: '', range: 36, attacks: 1, skill: 4, s: 7, ap: -2, d: 0, randomD: 'D3', keywords: { heavy: true, precision: true } }],
  },
  plasmaCaliver: {
    id: 'plasmaCaliver', name: 'Плазменный калибр (Plasma Caliver)',
    profiles: [
      { name: 'Стандарт', range: 30, attacks: 2, skill: 4, s: 7, ap: -2, d: 1, keywords: {} },
      { name: 'Перегрузка (Supercharge)', range: 30, attacks: 2, skill: 4, s: 8, ap: -3, d: 2, keywords: { hazardous: true } },
    ],
  },
  mechanicusPistol: {
    id: 'mechanicusPistol', name: 'Пистолет Механикус (Mechanicus Pistol)',
    profiles: [{ name: '', range: 12, attacks: 1, skill: 4, s: 6, ap: -1, d: 1, keywords: { closeQuarters: true, devastatingWounds: true } }],
  },
  alphaCombatWeapon: {
    id: 'alphaCombatWeapon', name: 'Боевое оружие Альфы (Alpha Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 4, s: 5, ap: -1, d: 1, keywords: {} }],
  },
  skitariiCCW: {
    id: 'skitariiCCW', name: 'Оружие ближнего боя (Close Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 4, s: 3, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Kataphron Breachers
  heavyArcRifle: {
    id: 'heavyArcRifle', name: 'Тяжёлая дуговая винтовка (Heavy Arc Rifle)',
    profiles: [{ name: '', range: 30, attacks: 2, skill: 4, s: 8, ap: -2, d: 3, keywords: { anti: anti('VEHICLE', 4), rapidFire: 2 } }],
  },
  torsionCannon: {
    id: 'torsionCannon', name: 'Торсионная пушка (Torsion Cannon)',
    profiles: [{ name: '', range: 36, attacks: 0, randomA: 'D3', skill: 4, s: 6, ap: -2, d: 2, keywords: { anti: anti('INFANTRY', 2), blast: 1 } }],
  },
  arcClaw: {
    id: 'arcClaw', name: 'Дуговой коготь (Arc Claw)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 4, s: 5, ap: -1, d: 1, keywords: { anti: anti('VEHICLE', 4) } }],
  },
  hydraulicClaw: {
    id: 'hydraulicClaw', name: 'Гидравлический коготь (Hydraulic Claw)',
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 4, s: 8, ap: -2, d: 3, keywords: {} }],
  },
  // ---- Kataphron Destroyers
  heavyGravCannon: {
    id: 'heavyGravCannon', name: 'Тяжёлая гравипушка (Heavy Grav-cannon)',
    profiles: [{ name: '', range: 30, attacks: 4, skill: 4, s: 6, ap: -1, d: 2, keywords: { anti: anti('VEHICLE', 2) } }],
  },
  plasmaCulverin: {
    id: 'plasmaCulverin', name: 'Плазменная кулеврина (Kataphron Plasma Culverin)',
    profiles: [
      { name: 'Стандарт', range: 36, attacks: 4, skill: 4, s: 7, ap: -2, d: 1, keywords: {} },
      { name: 'Перегрузка (Supercharge)', range: 36, attacks: 4, skill: 4, s: 8, ap: -3, d: 2, keywords: { hazardous: true } },
    ],
  },
  phosphorBlaster: {
    id: 'phosphorBlaster', name: 'Фосфорный бластер (Phosphor Blaster)',
    profiles: [{ name: '', range: 24, attacks: 1, skill: 4, s: 5, ap: 0, d: 1, keywords: { ignoresCover: true, rapidFire: 1 } }],
  },
  cognisFlamer: {
    id: 'cognisFlamer', name: 'Когнис-огнемёт (Cognis Flamer)',
    profiles: [{ name: '', range: 12, attacks: 0, randomA: 'D6', skill: null, s: 4, ap: 0, d: 1, keywords: { ignoresCover: true, torrent: true } }],
  },
  kataphronCCW: {
    id: 'kataphronCCW', name: 'Оружие ближнего боя (Close Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 4, s: 5, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Sicarian Infiltrators
  stubcarbine: {
    id: 'stubcarbine', name: 'Короткий карабин (Stubcarbine)',
    profiles: [{ name: '', range: 12, attacks: 3, skill: 4, s: 4, ap: 0, d: 1, keywords: { closeQuarters: true } }],
  },
  flechetteBlaster: {
    id: 'flechetteBlaster', name: 'Флешетный бластер (Flechette Blaster)',
    profiles: [{ name: '', range: 12, attacks: 5, skill: 4, s: 3, ap: 0, d: 1, keywords: { closeQuarters: true } }],
  },
  sicarianPowerWeapon: {
    id: 'sicarianPowerWeapon', name: 'Силовое оружие (Power Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 4, s: 4, ap: -2, d: 1, keywords: {} }],
  },
  taserGoad: {
    id: 'taserGoad', name: 'Тазерный стрекач (Taser Goad)',
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 4, s: 6, ap: -1, d: 1, keywords: { sustainedHits: 2 } }],
  },
  // ---- Kastelan Robots
  incendineCombustor: {
    id: 'incendineCombustor', name: 'Зажигательный комбустор (Incendine Combustor)',
    profiles: [{ name: '', range: 12, attacks: 0, randomA: 'D6', skill: null, s: 6, ap: -1, d: 1, keywords: { ignoresCover: true, torrent: true } }],
  },
  heavyPhosphorBlaster: {
    id: 'heavyPhosphorBlaster', name: 'Тяжёлый фосфорный бластер (Heavy Phosphor Blaster)',
    profiles: [{ name: '', range: 36, attacks: 3, skill: 4, s: 6, ap: -1, d: 2, keywords: { ignoresCover: true } }],
  },
  kastelanPhosphorBlaster: {
    id: 'kastelanPhosphorBlaster', name: 'Фосфорный бластер Кастелана (Kastelan Phosphor Blaster)',
    profiles: [{ name: '', range: 24, attacks: 3, skill: 4, s: 6, ap: -1, d: 1, keywords: { ignoresCover: true } }],
  },
  twinKastelanPhosphorBlaster: {
    id: 'twinKastelanPhosphorBlaster', name: 'Сдвоенный фосфорный бластер Кастелана (Twin Kastelan Phosphor Blaster)',
    profiles: [{ name: '', range: 24, attacks: 3, skill: 4, s: 6, ap: -1, d: 1, keywords: { ignoresCover: true, twinLinked: true } }],
  },
  kastelanCCW: {
    id: 'kastelanCCW', name: 'Оружие ближнего боя (Close Combat Weapon)',
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 4, s: 6, ap: 0, d: 1, keywords: {} }],
  },
  kastelanFist: {
    id: 'kastelanFist', name: 'Кулак Кастелана (Kastelan Fist)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 4, s: 12, ap: -2, d: 3, keywords: {} }],
  },
  twinKastelanFist: {
    id: 'twinKastelanFist', name: 'Сдвоенный кулак Кастелана (Twin Kastelan Fist)',
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 4, s: 12, ap: -2, d: 3, keywords: { twinLinked: true } }],
  },
}

const skitarii = { m: 6, t: 3, sv: 4, w: 1, ld: 7, oc: 2, invuln: 5, baseMm: 25 }
const kataphron = { m: 5, sv: 3, w: 3, ld: 7, oc: 1, invuln: 6, baseMm: 60 }
const sicarian = { m: 8, t: 4, sv: 4, w: 2, ld: 7, oc: 1, invuln: 5, baseMm: 40 }
const kastelan = { m: 6, t: 9, sv: 2, w: 7, ld: 7, oc: 2, invuln: 5, baseMm: 60 }
/** Tech-Priest Dominus and Manipulus share their characteristics */
const dominus = { m: 6, t: 4, sv: 2, w: 4, ld: 7, oc: 1, invuln: 5, baseMm: 50, character: true }

export const MECHANICUS_PROFILES: Record<string, ModelProfile> = {
  techDominus: {
    id: 'techDominus', name: 'Техножрец-Доминус', m: 6, t: 4, sv: 2, w: 4, ld: 7, oc: 1, invuln: 5, baseMm: 50, character: true,
    weapons: ['macrostubber', 'volkiteBlaster', 'omnissianAxe'],
  },
  techDominusSerpenta: { id: 'techDominusSerpenta', name: 'Техножрец-Доминус с фосфорной серпентой', ...dominus, weapons: ['phosphorSerpenta', 'volkiteBlaster', 'omnissianAxe'] },
  techDominusRay: { id: 'techDominusRay', name: 'Техножрец-Доминус с лучом искоренения', ...dominus, weapons: ['macrostubber', 'eradicationRay', 'omnissianAxe'] },
  techDominusSerpentaRay: { id: 'techDominusSerpentaRay', name: 'Техножрец-Доминус с серпентой и лучом', ...dominus, weapons: ['phosphorSerpenta', 'eradicationRay', 'omnissianAxe'] },
  techManipulus: {
    id: 'techManipulus', name: 'Техножрец-Манипулус', m: 6, t: 4, sv: 2, w: 4, ld: 7, oc: 1, invuln: 5, baseMm: 50, character: true,
    weapons: ['magnarailLance', 'omnissianStaff'],
  },
  techManipulusCannon: { id: 'techManipulusCannon', name: 'Техножрец-Манипулус с трансзвуковой пушкой', ...dominus, weapons: ['transonicCannon', 'omnissianStaff'] },
  // Rangers: precision rifles. Alpha has the optional Alpha combat weapon, one Ranger carries an Omnispex.
  rangerAlpha: { id: 'rangerAlpha', name: 'Альфа Рейнджеров', ...skitarii, weapons: ['galvanicRifle', 'alphaCombatWeapon', 'skitariiCCW'] },
  ranger: { id: 'ranger', name: 'Скитарий-рейнджер', ...skitarii, weapons: ['galvanicRifle', 'skitariiCCW'] },
  rangerOmnispex: { id: 'rangerOmnispex', name: 'Рейнджер с омниспексом', ...skitarii, wargear: ['omnispex'], weapons: ['galvanicRifle', 'skitariiCCW'] },
  rangerArc: { id: 'rangerArc', name: 'Рейнджер с дуговой винтовкой', ...skitarii, weapons: ['arcRifle', 'skitariiCCW'] },
  rangerCaliver: { id: 'rangerCaliver', name: 'Рейнджер с плазменным калибром', ...skitarii, weapons: ['plasmaCaliver', 'skitariiCCW'] },
  // wargear options (11th edition): the Alpha may swap the rifle for a pistol; 1 Ranger may take a transuranic arquebus
  rangerAlphaPistol: { id: 'rangerAlphaPistol', name: 'Альфа Рейнджеров с пистолетом', ...skitarii, weapons: ['mechanicusPistol', 'alphaCombatWeapon', 'skitariiCCW'] },
  rangerArquebus: { id: 'rangerArquebus', name: 'Рейнджер с трансурановой аркебузой', ...skitarii, weapons: ['transuranicArquebus', 'skitariiCCW'] },
  // Vanguard: radium carbines at close range.
  vanguardAlpha: { id: 'vanguardAlpha', name: 'Альфа Авангарда', ...skitarii, weapons: ['mechanicusPistol', 'alphaCombatWeapon', 'skitariiCCW'] },
  vanguard: { id: 'vanguard', name: 'Скитарий-авангардист', ...skitarii, weapons: ['radiumCarbine', 'skitariiCCW'] },
  vanguardArc: { id: 'vanguardArc', name: 'Авангардист с дуговой винтовкой', ...skitarii, weapons: ['arcRifle', 'skitariiCCW'] },
  vanguardCaliver: { id: 'vanguardCaliver', name: 'Авангардист с плазменным калибром', ...skitarii, weapons: ['plasmaCaliver', 'skitariiCCW'] },
  vanguardAlphaCarbine: { id: 'vanguardAlphaCarbine', name: 'Альфа Авангарда с карабином', ...skitarii, weapons: ['radiumCarbine', 'alphaCombatWeapon', 'skitariiCCW'] },
  vanguardArquebus: { id: 'vanguardArquebus', name: 'Авангардист с трансурановой аркебузой', ...skitarii, weapons: ['transuranicArquebus', 'skitariiCCW'] },
  vanguardOmnispex: { id: 'vanguardOmnispex', name: 'Авангардист с омниспексом', ...skitarii, wargear: ['omnispex'], weapons: ['radiumCarbine', 'skitariiCCW'] },
  // Kataphron: heavy cyborg platforms.
  breacher: { id: 'breacher', name: 'Катафрон-пробойщик', ...kataphron, t: 7, weapons: ['heavyArcRifle', 'arcClaw'] },
  breacherTorsion: { id: 'breacherTorsion', name: 'Катафрон-пробойщик с торсионной пушкой', ...kataphron, t: 7, weapons: ['torsionCannon', 'arcClaw'] },
  breacherHydraulic: { id: 'breacherHydraulic', name: 'Катафрон-пробойщик с гидрокогтем', ...kataphron, t: 7, weapons: ['heavyArcRifle', 'hydraulicClaw'] },
  breacherTorsionHydraulic: { id: 'breacherTorsionHydraulic', name: 'Катафрон-пробойщик с торсионной пушкой и гидрокогтем', ...kataphron, t: 7, weapons: ['torsionCannon', 'hydraulicClaw'] },
  destroyer: { id: 'destroyer', name: 'Катафрон-разрушитель', ...kataphron, t: 6, weapons: ['heavyGravCannon', 'phosphorBlaster', 'kataphronCCW'] },
  destroyerCulverin: { id: 'destroyerCulverin', name: 'Катафрон-разрушитель с кулевриной', ...kataphron, t: 6, weapons: ['plasmaCulverin', 'cognisFlamer', 'kataphronCCW'] },
  destroyerFlamer: { id: 'destroyerFlamer', name: 'Катафрон-разрушитель с гравипушкой и огнемётом', ...kataphron, t: 6, weapons: ['heavyGravCannon', 'cognisFlamer', 'kataphronCCW'] },
  destroyerCulverinPhosphor: { id: 'destroyerCulverinPhosphor', name: 'Катафрон-разрушитель с кулевриной и фосфорным бластером', ...kataphron, t: 6, weapons: ['plasmaCulverin', 'phosphorBlaster', 'kataphronCCW'] },
  // Sicarian Infiltrators (the datasheet gives one profile for Princeps and troopers).
  sicarianPrinceps: { id: 'sicarianPrinceps', name: 'Принцепс сикариев', ...sicarian, weapons: ['stubcarbine', 'sicarianPowerWeapon'] },
  sicarian: { id: 'sicarian', name: 'Сикарий-диверсант', ...sicarian, weapons: ['stubcarbine', 'sicarianPowerWeapon'] },
  sicarianTaser: { id: 'sicarianTaser', name: 'Сикарий с тазерным стрекачом', ...sicarian, weapons: ['flechetteBlaster', 'taserGoad'] },
  // Kastelan Robots
  kastelan: { id: 'kastelan', name: 'Кастелан с комбустором', ...kastelan, weapons: ['incendineCombustor', 'twinKastelanFist'] },
  kastelanGun: { id: 'kastelanGun', name: 'Кастелан с фосфорными бластерами', ...kastelan, weapons: ['heavyPhosphorBlaster', 'kastelanPhosphorBlaster', 'kastelanFist'] },
  // the other combinations of the two weapon options (combustor / heavy phosphor blaster x twin fist / blaster + fist / twin blaster + CCW)
  kastelanHeavyFists: { id: 'kastelanHeavyFists', name: 'Кастелан с тяжёлым бластером и сдвоенным кулаком', ...kastelan, weapons: ['heavyPhosphorBlaster', 'twinKastelanFist'] },
  kastelanCombustorBlaster: { id: 'kastelanCombustorBlaster', name: 'Кастелан с комбустором и бластером', ...kastelan, weapons: ['incendineCombustor', 'kastelanPhosphorBlaster', 'kastelanFist'] },
  kastelanCombustorTwin: { id: 'kastelanCombustorTwin', name: 'Кастелан с комбустором и сдвоенным бластером', ...kastelan, weapons: ['incendineCombustor', 'twinKastelanPhosphorBlaster', 'kastelanCCW'] },
  kastelanHeavyTwin: { id: 'kastelanHeavyTwin', name: 'Кастелан с тяжёлым и сдвоенным бластерами', ...kastelan, weapons: ['heavyPhosphorBlaster', 'twinKastelanPhosphorBlaster', 'kastelanCCW'] },
}

const AM = 'ADEPTUS MECHANICUS'

export const MECHANICUS_DATASHEETS: Record<string, Datasheet> = {
  techDominus: {
    id: 'techDominus', name: 'Техножрец-Доминус (Tech-Priest Dominus)', faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'CHARACTER', 'IMPERIUM', 'CULT MECHANICUS', 'TECH-PRIEST', 'DOMINUS', AM],
    abilities: ['doctrina', 'lordOfMachineCult', 'dataSpike'],
    description: 'Командир и боевой жрец: защищает ведомый отряд (Feel No Pain 5+), в ближнем бою ломает вражескую технику.',
  },
  techManipulus: {
    id: 'techManipulus', name: 'Техножрец-Манипулус (Tech-Priest Manipulus)', faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'CHARACTER', 'IMPERIUM', 'CULT MECHANICUS', 'TECH-PRIEST', 'MANIPULUS', AM],
    abilities: ['doctrina', 'galvanicField', 'defendDivineWork'],
    description: 'Огневая поддержка: магнарельсовое копьё бьёт на 36″, а ведомый отряд получает Lethal Hits и раз за битву — 4+ непробиваемый спас.',
  },
  rangers: {
    id: 'rangers', name: 'Скитарии-рейнджеры (Skitarii Rangers)', faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'BATTLELINE', 'IMPERIUM', 'SKITARII', 'RANGERS', AM],
    abilities: ['doctrina', 'ledUnit', 'objectiveScouted', 'scouts'],
    description: 'Линейная пехота дальнего боя: винтовки на 30″, омниспекс против укрытий, удерживают цель даже после ухода.',
  },
  vanguard: {
    id: 'vanguard', name: 'Скитарии-авангард (Skitarii Vanguard)', faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'BATTLELINE', 'IMPERIUM', 'SKITARII', 'VANGUARD', AM],
    abilities: ['doctrina', 'ledUnit', 'radSaturation'],
    description: 'Линейная пехота ближнего огня: радиевые карабины на 18″, радиация вокруг отряда снижает OC врага.',
  },
  breachers: {
    id: 'breachers', name: 'Катафроны-пробойщики (Kataphron Breachers)', faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'IMPERIUM', 'CULT MECHANICUS', 'KATAPHRON', 'BREACHERS', AM],
    abilities: ['doctrina', 'ledUnit', 'breachingCommand'],
    description: 'Живучая тяжёлая огневая поддержка: T7, 3+ спас, дуговые винтовки против техники и когти в ближнем бою.',
  },
  destroyers: {
    id: 'destroyers', name: 'Катафроны-разрушители (Kataphron Destroyers)', faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'IMPERIUM', 'CULT MECHANICUS', 'KATAPHRON', 'DESTROYERS', AM],
    abilities: ['doctrina', 'ledUnit', 'sentinelDirectives'],
    description: 'Специализированный дальний огонь: гравипушки и плазменные кулеврины по тяжёлым целям, фосфор игнорирует укрытия.',
  },
  sicarians: {
    id: 'sicarians', name: 'Сикарии-диверсанты (Sicarian Infiltrators)', faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'IMPERIUM', 'SKITARII', 'SICARIAN', 'INFILTRATORS', AM],
    abilities: ['doctrina', 'infiltrators', 'stealth', 'voicesInTheCode', 'neurostaticInterference'],
    description: 'Подвижные диверсанты: M8, скрытность, тазеры; вносят панику и мешают вражеским проверкам боевого шока.',
  },
  kastelans: {
    id: 'kastelans', name: 'Роботы Кастелан (Kastelan Robots)', faction: 'adeptus_mechanicus',
    keywords: ['VEHICLE', 'WALKER', 'IMPERIUM', 'LEGIO CYBERNETICA', 'KASTELAN ROBOTS', AM],
    abilities: ['doctrina', 'deadlyDemise1', 'repulsorGrid', 'roboticBodyguard'],
    description: 'Тяжёлые боевые платформы: T9, 2+ спас, фосфорные бластеры игнорируют укрытия, кулаки S12; ответный разряд бьёт стрелков.',
  },
}

export const MECHANICUS_ABILITY_TEXT: Record<string, string> = {
  doctrina: 'Доктрины Империатива (Doctrina Imperatives, правило армии): раз в раунд выберите Протектор (Protector: оружие дальнего боя получает Heavy и BS на 1 лучше; по отряду BATTLELINE или в 6″ от союзного BATTLELINE −1 к попаданию в ближнем бою) или Завоеватель (Conqueror: оружие дальнего боя получает Assault, WS ближнего боя на 1 лучше; для такого отряда AP атак на 1 лучше). [Приближение: выбирается в вашей фазе командования и действует до вашей следующей фазы командования.]',
  ledUnit: 'Может быть ведомым техножрецом (Leader): [Не реализовано: присоединение лидеров к отрядам отсутствует. Приближение: техножрец в пределах 3″ от ближайшего такого отряда считается ведущим его.]',
  lordOfMachineCult: 'Владыка культа машин (Lord of the Machine Cult): модели ведомого отряда получают Feel No Pain 5+ (бросок 5+ за каждую потерянную рану её отменяет). [Приближение: ближайший отряд-союзник в 3″.]',
  dataSpike: 'Шип данных (Data-spike): в начале фазы боя, если отряд в зоне контакта с вражеской техникой (VEHICLE), бросьте D6: на 4+ эта техника получает D6 смертельных ран, а WS её рукопашного оружия до конца фазы на 1 хуже. [Срабатывает автоматически.]',
  galvanicField: 'Гальваническое поле (Galvanic Field): оружие моделей ведомого отряда получает Lethal Hits. [Приближение: ближайший отряд-союзник в 3″.]',
  defendDivineWork: 'Защита божественного труда (Defend the Divine Work): раз за битву — модели ведомого отряда получают 4+ непробиваемый спас. [Приближение: применяется в вашей фазе и действует до начала вашего следующего хода.]',
  objectiveScouted: 'Цель разведана (Objective Scouted): в конце вашей фазы командования, если отряд рядом с целью, которую вы контролируете, вы удерживаете её, пока уровень контроля врага не станет выше вашего.',
  radSaturation: 'Радиевое насыщение (Rad-saturation, аура 3″): модели вражеских отрядов (кроме VEHICLE) в 3″ от этого отряда снижают OC на 1.',
  breachingCommand: 'Команда прорыва (Breaching Command): каждая атака отряда перебрасывает попадание на 1; рядом (6″) с союзным BATTLELINE — перебрасывает любое попадание.',
  infiltrators: 'Диверсанты (Infiltrators): при расстановке отряд можно поставить где угодно дальше 8″ от зоны развёртывания и моделей противника.',
  stealth: 'Скрытность (Stealth): по отряду в дальнем бою — всегда укрытие (−1 к BS).',
  voicesInTheCode: 'Голоса в коде (Voices in the Code): в начале фазы боя каждый вражеский отряд в зоне контакта проходит проверку боевого шока.',
  neurostaticInterference: 'Нейростатические помехи (аура 6″): проверки боевого шока и Ld вражеских отрядов в 6″ получают −1 (−2, если рядом союзный BATTLELINE).',
  repulsorGrid: 'Отталкивающая решётка (Repulsor Grid): когда по отряду стреляют, каждый натуральный «6» в его спасброске причиняет стрелку 1 смертельную рану после выстрела.',
  sentinelDirectives: 'Директивы стража (Sentinel Directives): с Fire Overwatch попадания на 5+. [Не реализовано: в симуляторе нет стратагем и Fire Overwatch.]',
  scouts: 'Разведчики 6″ (Scouts 6″): предбоевое перемещение до 6″. [Не реализовано: перемещение перед битвой отсутствует.]',
  roboticBodyguard: 'Роботизированная охрана (Robotic Bodyguard): Datasmith, ведущий отряд, получает Feel No Pain 4+. [Не реализовано: Кибернетика-Датасмит не входит в состав.]',
}
