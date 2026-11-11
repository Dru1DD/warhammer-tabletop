import type { Weapon, WeaponKeywords, WeaponProfile } from '../types'

// Weapons and model variants for the wargear options of Space Marines, Orks, Tyranids, Necrons and Aeldari (11th edition
// datasheets, Wahapedia). A variant is a model profile built from an existing one (`from`): same characteristics, other
// weapons (and, for shields, another invulnerable save or Wounds). The registry (datasheets.ts) builds them.
// Not modelled: Melta (no such keyword in the engine yet), Paired Krumpas, the Plasmacyte, the resurrection orb, and
// conditional keywords that apply only to some targets (noted per weapon).

const nonMV = 'nonMV' as const
const anti = (keyword: string, roll: number) => ({ keyword, roll })
type P = Omit<WeaponProfile, 'keywords'> & { keywords?: WeaponKeywords }
const w = (id: string, name: string, ...profiles: P[]): Weapon => ({ id, name, profiles: profiles.map((p) => ({ keywords: {}, ...p })) })
const ranged = (range: number, attacks: number, skill: number | null, s: number, ap: number, d: number, keywords: WeaponKeywords = {}, extra: Partial<P> = {}): P =>
  ({ name: '', range, attacks, skill, s, ap, d, keywords, ...extra })
const melee = (attacks: number, skill: number, s: number, ap: number, d: number, keywords: WeaponKeywords = {}, extra: Partial<P> = {}): P =>
  ({ name: '', range: 'melee', attacks, skill, s, ap, d, keywords, ...extra })
const named = (name: string, p: P): P => ({ ...p, name })

const list: Weapon[] = [
  // ---- Space Marines
  w('sgtPlasmaPistol', 'Плазменный пистолет (Plasma Pistol)',
    named('Стандарт', ranged(12, 1, 3, 7, -2, 1, { closeQuarters: true })),
    named('Перегрузка (Supercharge)', ranged(12, 1, 3, 8, -3, 2, { closeQuarters: true, hazardous: true }))),
  w('handFlamer', 'Ручной огнемёт (Hand Flamer)', ranged(9, 3, null, 4, 0, 1, { closeQuarters: true, torrent: true })),
  w('neoVolkitePistol', 'Нео-волкитный пистолет (Neo-volkite Pistol)', ranged(12, 1, 2, 5, 0, 2, { closeQuarters: true, devastatingWounds: true })),
  w('sgtNeoVolkitePistol', 'Нео-волкитный пистолет (Neo-volkite Pistol)', ranged(12, 1, 3, 5, 0, 2, { closeQuarters: true, devastatingWounds: true })),
  w('sgtPowerFist', 'Силовой кулак (Power Fist)', melee(3, 3, 8, -2, 2)),
  w('sgtPowerWeapon', 'Силовое оружие (Power Weapon)', melee(4, 3, 5, -2, 1)),
  w('thunderHammer', 'Громовой молот (Thunder Hammer)', melee(3, 4, 8, -2, 3, { devastatingWounds: true })),
  w('intSgtChainsword', 'Цепной меч (Chainsword)', melee(5, 3, 5, -1, 1)),
  w('captainPowerFist', 'Силовой кулак (Power Fist)', melee(5, 2, 8, -2, 2)),
  w('ltPowerFist', 'Силовой кулак (Power Fist)', melee(4, 2, 8, -2, 2)),
  w('ltMasterCraftedBolter', 'Мастерский болтер (Master-crafted Bolter)', ranged(24, 2, 2, 5, -1, 2)),
  w('ltCeramiteFists', 'Керамитовые кулаки (Ceramite Fists)', melee(5, 2, 5, 0, 1)),
  // Heavy Onslaught Gatling Cannon: Sustained Hits 2 and Devastating Wounds only against non-MONSTER/VEHICLE targets on
  // the datasheet; here Sustained Hits 2 always and no Devastating Wounds (the engine has no per-target keywords yet)
  w('heavyOnslaughtGatling', 'Тяжёлая штурмовая гатлинг-пушка (Heavy Onslaught Gatling Cannon)', ranged(24, 12, 3, 6, -1, 1, { sustainedHits: 2 })),
  w('onslaughtGatling', 'Штурмовая гатлинг-пушка (Onslaught Gatling Cannon)', ranged(24, 8, 3, 5, -1, 1)),
  w('stormBolters', 'Штормболтеры (Storm Bolters)', ranged(24, 4, 3, 5, -1, 1, { rapidFire: 4 })),
  w('icarusRocketPod', 'Ракетная установка «Икар» (Icarus Rocket Pod)', ranged(24, 3, 3, 6, -1, 2, { anti: anti('FLY', 2) })),
  // ---- Orks
  w('nobKustomChoppa', 'Кастом-тесак (Kustom Choppa)', melee(4, 3, 5, -2, 2)),
  w('powerKlaw', 'Силовая клешня (Power Klaw)', melee(3, 3, 10, -2, 2)),
  w('warbossPowerKlaw', 'Силовая клешня (Power Klaw)', melee(6, 2, 12, -2, 2)),
  w('kombiSkorcha', 'Комби-скорча (Kombi-skorcha)',
    named('Шута (Shoota)', ranged(18, 2, 5, 4, 0, 1, { lethalHits: nonMV, rapidFire: 1 })),
    named('Скорча (Skorcha)', ranged(12, 3, null, 5, 0, 1, { torrent: true, blast: 1 }))),
  w('kombiRokkit', 'Комби-рокетница (Kombi-rokkit)',
    named('Шута (Shoota)', ranged(18, 2, 5, 4, 0, 1, { lethalHits: nonMV, rapidFire: 1 })),
    named('Баста-рокета (Busta)', ranged(24, 1, 5, 10, -2, 3))),
  w('burna', 'Бурна (Burna)', ranged(12, 3, null, 4, 0, 1, { torrent: true, blast: 1 })),
  w('kustomBigShoota', 'Кастом-большая шута (Kustom Big Shoota)', ranged(18, 8, 5, 4, 0, 1, { lethalHits: nonMV })),
  w('bigSkorcha', 'Большая скорча (Big Skorcha)', ranged(18, 3, null, 5, -1, 1, { torrent: true, blast: 2 })),
  w('breachaRam', 'Таран-бреча (Breacha Ram)', melee(2, 4, 8, -2, 2)),
  w('kustomMegaBlasta', 'Кастом-мега-бласта (Kustom Mega-blasta)', ranged(24, 3, 5, 9, -2, 3, { hazardous: true })),
  w('extraKlaw', 'Лишняя клешня (Extra Klaw)', melee(1, 3, 12, -2, 3, { extraAttacks: true })),
  // ---- Tyranids
  w('tyrantHeavyVenomCannon', 'Тяжёлая ядовитая пушка (Heavy Venom Cannon)', ranged(36, 0, 2, 9, -2, 3, { blast: 1 }, { randomA: 'D3' })),
  w('tyrantStranglethorn', 'Пушка-душитель (Stranglethorn Cannon)', ranged(36, 1, 2, 7, -1, 2, { blast: 1 }, { randomA: 'D6' })),
  w('tyrantExtraTalons', 'Когти-серпы (Monstrous Scything Talons)', melee(4, 2, 7, -2, 2, { extraAttacks: true })),
  w('deathspitter', 'Смертоплюй (Deathspitter)', ranged(24, 3, 4, 5, -1, 1)),
  w('spinefists', 'Шипокулаки (Spinefists)', ranged(12, 2, 4, 4, 0, 1, { closeQuarters: true, twinLinked: true })),
  w('termagantDevourer', 'Пожиратель термаганта (Termagant Devourer)', ranged(18, 2, 4, 4, 0, 1)),
  w('termagantSpinefists', 'Шипокулаки термаганта (Termagant Spinefists)', ranged(12, 2, 4, 3, 0, 1, { closeQuarters: true, twinLinked: true })),
  w('bioPlasma', 'Биоплазма (Bio-plasma)', ranged(12, 0, 4, 7, -2, 1, { assault: true, blast: 1 }, { randomA: 'D3' })),
  w('deathspitterMaggots', 'Смертоплюи с личинками (Deathspitters with Slimer Maggots)', ranged(24, 6, 4, 7, -2, 1)),
  w('devourerWorms', 'Пожиратели с мозговыми червями (Devourers with Brainleech Worms)', ranged(18, 12, 4, 6, 0, 1)),
  w('carnifexHeavyVenomCannon', 'Тяжёлая ядовитая пушка (Heavy Venom Cannon)', ranged(36, 0, 4, 9, -2, 3, { blast: 1 }, { randomA: 'D3' })),
  w('carnifexStranglethorn', 'Пушка-душитель (Stranglethorn Cannon)', ranged(36, 1, 4, 7, -1, 2, { blast: 1 }, { randomA: 'D6' })),
  w('spineBanks', 'Шипованные гребни (Spine Banks)', ranged(6, 5, 4, 5, 0, 1, { assault: true })),
  w('crushingClaws', 'Сокрушающие клешни (Carnifex Crushing Claws)', melee(4, 4, 12, -3, 1, {}, { randomD: 'D6' })),
  // ---- Necrons
  w('teslaCarbine', 'Тесла-карабин (Tesla Carbine)', ranged(24, 2, 3, 5, 0, 1, { assault: true, sustainedHits: 2 })),
  w('hyperphaseSword', 'Гиперфазовый меч (Hyperphase Sword)', melee(3, 3, 6, -2, 1)),
  w('whipCoils', 'Плети-кольца (Whip Coils)', melee(8, 4, 5, 0, 1)),
  w('particleCaster', 'Излучатель частиц (Particle Caster)', ranged(12, 3, 4, 5, 0, 1, { closeQuarters: true, devastatingWounds: true })),
  w('transdimensionalBeamer', 'Трансмерный луч (Transdimensional Beamer)', ranged(12, 1, 4, 4, -2, 3)),
  // ---- Aeldari (Melta is not modelled)
  w('singingSpear', 'Поющее копьё (Singing Spear, бросок)', ranged(12, 1, 2, 9, 0, 3, { assault: true, psychic: true })),
  w('singingSpearMelee', 'Поющее копьё (Singing Spear)', melee(2, 2, 3, 0, 3, { psychic: true })),
  w('deathSpinner', 'Смертепряд (Death Spinner)', ranged(12, 0, null, 4, -1, 1, { torrent: true, ignoresCover: true }, { randomA: 'D6' })),
  w('dragonFusionGun', 'Термоган драконов (Dragon Fusion Gun)', ranged(12, 1, 2, 9, -4, 0, { assault: true }, { randomD: 'D6' })),
  w('dragonFusionPistol', 'Термопистолет драконов (Dragon Fusion Pistol)', ranged(6, 1, 2, 9, -4, 0, { assault: true, closeQuarters: true }, { randomD: 'D6' })),
  w('reaperLauncher', 'Жнец-ракетомёт (Reaper Launcher)',
    named('Звёздный выстрел (Starshot)', ranged(48, 1, 3, 10, -2, 3, { heavy: true, ignoresCover: true })),
    named('Звёздный рой (Starswarm)', ranged(48, 2, 3, 4, -2, 1, { heavy: true, ignoresCover: true }))),
  w('bansheeBlade', 'Клинок банши (Banshee Blade)', melee(5, 2, 4, -2, 2, { anti: anti('INFANTRY', 3) })),
  w('scorpionChainsword', 'Цепной меч скорпионов (Scorpion Chainsword)', melee(7, 2, 4, -1, 1, { sustainedHits: 1 })),
  w('exarchLasblaster', 'Лазбластер экзарха (Exarch’s Lasblaster)', ranged(24, 4, 3, 5, -1, 1, { assault: true, lethalHits: true })),
  w('sunpistol', 'Солнечный пистолет (Sunpistol)', ranged(12, 2, 3, 4, 0, 1, { assault: true, lethalHits: true, closeQuarters: true })),
  w('hawkPowerSword', 'Силовой меч (Power Sword)', melee(5, 3, 4, -2, 1)),
  w('dScythe', 'Д-коса (D-scythe)', ranged(12, 0, null, 7, -3, 1, { torrent: true }, { randomA: 'D6' })),
]

export const WARGEAR_WEAPONS: Record<string, Weapon> = Object.fromEntries(list.map((x) => [x.id, x]))

/** A model variant: the profile `from` with other weapons (and optionally another invulnerable save / Wounds). */
export interface Variant { id: string; from: string; name: string; weapons: string[]; invuln?: number; w?: number }
const v = (id: string, from: string, name: string, weapons: string[], extra: Partial<Variant> = {}): Variant => ({ id, from, name, weapons, ...extra })

export const WARGEAR_VARIANTS: Variant[] = [
  // ---- Space Marines
  v('captainPlasma', 'captain', 'Капитан с плазменным пистолетом', ['plasmaPistol', 'captainPowerWeapon']),
  v('captainVolkite', 'captain', 'Капитан с нео-волкитным пистолетом', ['neoVolkitePistol', 'captainPowerWeapon']),
  v('captainFist', 'captain', 'Капитан с силовым кулаком', ['masterCraftedBolter', 'captainHeavyBoltPistol', 'captainPowerFist']),
  v('captainShield', 'captain', 'Капитан с реликтовым щитом', ['captainHeavyBoltPistol', 'captainPowerWeapon'], { w: 6 }),
  v('captainPlasmaFist', 'captain', 'Капитан с плазменным пистолетом и кулаком', ['plasmaPistol', 'captainPowerFist']),
  v('lieutenantBolter', 'lieutenant', 'Лейтенант с мастерским болтером', ['ltBoltPistol', 'ltMasterCraftedBolter', 'ltCeramiteFists']),
  v('lieutenantVolkite', 'lieutenant', 'Лейтенант с нео-волкитом и силовым оружием', ['neoVolkitePistol', 'mcPowerWeapon']),
  v('lieutenantShield', 'lieutenant', 'Лейтенант с нео-волкитом и штормовым щитом', ['neoVolkitePistol', 'mcPowerWeapon'], { invuln: 4 }),
  v('lieutenantFist', 'lieutenant', 'Лейтенант с силовым кулаком', ['plasmaPistol', 'ltPowerFist']),
  v('intercessorSergeantChainsword', 'intercessorSergeant', 'Сержант с цепным мечом', ['boltRifle', 'boltPistol', 'intSgtChainsword']),
  v('intercessorSergeantFist', 'intercessorSergeant', 'Сержант с силовым кулаком', ['boltRifle', 'boltPistol', 'sgtPowerFist']),
  v('intercessorSergeantWeapon', 'intercessorSergeant', 'Сержант с силовым оружием', ['boltRifle', 'boltPistol', 'sgtPowerWeapon']),
  v('intercessorSergeantHammer', 'intercessorSergeant', 'Сержант с громовым молотом', ['boltRifle', 'boltPistol', 'thunderHammer']),
  v('assaultSergeantHammer', 'assaultSergeant', 'Сержант с громовым молотом', ['heavyBoltPistol', 'thunderHammer']),
  v('assaultSergeantFist', 'assaultSergeant', 'Сержант с силовым кулаком', ['heavyBoltPistol', 'sgtPowerFist']),
  v('assaultSergeantWeapon', 'assaultSergeant', 'Сержант с силовым оружием', ['heavyBoltPistol', 'sgtPowerWeapon']),
  v('assaultSergeantPlasma', 'assaultSergeant', 'Сержант с плазменным пистолетом', ['sgtPlasmaPistol', 'chainsword']),
  v('assaultSergeantFlamer', 'assaultSergeant', 'Сержант с ручным огнемётом', ['handFlamer', 'chainsword']),
  v('hellblasterSergeantPlasma', 'hellblasterSergeant', 'Сержант с плазменным пистолетом', ['plasmaIncinerator', 'sgtPlasmaPistol', 'ceramiteFists']),
  v('bladeguardSergeantVolkite', 'bladeguardSergeant', 'Сержант с нео-волкитным пистолетом', ['sgtNeoVolkitePistol', 'masterCraftedPowerSword']),
  v('bladeguardSergeantPlasma', 'bladeguardSergeant', 'Сержант с плазменным пистолетом', ['sgtPlasmaPistol', 'masterCraftedPowerSword']),
  v('redemptorGatlingFlamer', 'redemptor', 'Редемптор: тяжёлая гатлинг-пушка и огнемёт', ['heavyOnslaughtGatling', 'heavyFlamer', 'fragstorm', 'redemptorFist']),
  v('redemptorGatlings', 'redemptor', 'Редемптор: две гатлинг-пушки и штормболтеры', ['heavyOnslaughtGatling', 'onslaughtGatling', 'stormBolters', 'redemptorFist']),
  v('redemptorPlasmaGatling', 'redemptor', 'Редемптор: макроплазма и гатлинг-пушка', ['macroPlasma', 'onslaughtGatling', 'fragstorm', 'redemptorFist']),
  v('redemptorPlasmaBolters', 'redemptor', 'Редемптор: макроплазма и штормболтеры', ['macroPlasma', 'heavyFlamer', 'stormBolters', 'redemptorFist']),
  v('redemptorIcarus', 'redemptor', 'Редемптор: макроплазма, гатлинг и «Икар»', ['macroPlasma', 'onslaughtGatling', 'stormBolters', 'icarusRocketPod', 'redemptorFist']),
  // ---- Orks
  v('warbossKlaw', 'warboss', 'Варбосс с силовой клешнёй', ['kustomShoota', 'warbossPowerKlaw']),
  v('warbossRokkit', 'warboss', 'Варбосс с комби-рокетницей', ['kombiRokkit', 'bossKustomChoppa']),
  v('warbossSkorcha', 'warboss', 'Варбосс с комби-скорчей', ['kombiSkorcha', 'bossKustomChoppa']),
  v('warbossRokkitKlaw', 'warboss', 'Варбосс с комби-рокетницей и клешнёй', ['kombiRokkit', 'warbossPowerKlaw']),
  v('warbossSkorchaKlaw', 'warboss', 'Варбосс с комби-скорчей и клешнёй', ['kombiSkorcha', 'warbossPowerKlaw']),
  v('nobChoppaSkorcha', 'nob', 'Ноб с кастом-тесаком и комби-скорчей', ['kombiSkorcha', 'nobKustomChoppa']),
  v('nobKlawSkorcha', 'nob', 'Ноб с силовой клешнёй и комби-скорчей', ['kombiSkorcha', 'powerKlaw']),
  v('nobChoppaShoota', 'nob', 'Ноб с кастом-тесаком и кастом-шутой', ['kustomShoota', 'nobKustomChoppa']),
  v('nobKlawRokkit', 'nob', 'Ноб с силовой клешнёй и комби-рокетницей', ['kombiRokkit', 'powerKlaw']),
  v('boyBurna', 'boy', 'Бой с бурной', ['burna', 'slugga', 'choppa']),
  v('nobzSkorcha', 'nobzNob', 'Ноб с большой скорчей', ['bigSkorcha', 'nobKustomChoppa']),
  v('nobzBigShoota', 'nobzNob', 'Ноб с кастом-большой шутой', ['kustomBigShoota', 'nobKustomChoppa']),
  v('nobzBigChoppa', 'nobzNob', 'Ноб с большим тесаком', ['bigChoppa']),
  v('nobzRokkit', 'nobzNob', 'Ноб с комби-рокетницей', ['kombiRokkit', 'kustomKrumpa']),
  v('kommandoNobBigChoppa', 'kommandoNob', 'Ноб коммандос с большим тесаком', ['slugga', 'bigChoppa']),
  v('kommandoNobKlaw', 'kommandoNob', 'Ноб коммандос с силовой клешнёй', ['slugga', 'powerKlaw']),
  v('kommandoBurna', 'kommando', 'Коммандо с бурной', ['burna', 'slugga', 'choppa']),
  v('kommandoRokkit', 'kommando', 'Коммандо с рокетницей', ['rokkitLauncha', 'slugga', 'choppa']),
  v('kommandoRam', 'kommando', 'Коммандо с тараном-бречей', ['slugga', 'breachaRam']),
  v('kommandoShoota', 'kommando', 'Коммандо с кастом-шутой', ['kustomShoota', 'slugga', 'choppa']),
  v('deffDreadKlaws', 'deffDread', 'Дэфф-дред с двумя лишними клешнями', ['extraKlaw', 'extraKlaw', 'dreadKlaws']),
  v('deffDreadBlastas', 'deffDread', 'Дэфф-дред с двумя мега-бластами', ['kustomMegaBlasta', 'kustomMegaBlasta', 'dreadKlaws']),
  v('deffDreadRokkits', 'deffDread', 'Дэфф-дред с двумя рокетницами', ['rokkitLauncha', 'rokkitLauncha', 'dreadKlaws']),
  v('deffDreadShootaBlasta', 'deffDread', 'Дэфф-дред с большой шутой и мега-бластой', ['dreadBigShoota', 'kustomMegaBlasta', 'dreadKlaws']),
  v('deffDreadKlawSkorcha', 'deffDread', 'Дэфф-дред с клешнёй и скорчей', ['extraKlaw', 'skorcha', 'dreadKlaws']),
  // ---- Tyranids
  v('hiveTyrantVenom', 'hiveTyrant', 'Тиран с мечом и тяжёлой ядовитой пушкой', ['boneswordLashWhip', 'tyrantHeavyVenomCannon']),
  v('hiveTyrantStranglethorn', 'hiveTyrant', 'Тиран с мечом и пушкой-душителем', ['boneswordLashWhip', 'tyrantStranglethorn']),
  v('hiveTyrantVenomTalons', 'hiveTyrant', 'Тиран с ядовитой пушкой и когтями', ['tyrantHeavyVenomCannon', 'scythingTalons']),
  v('hiveTyrantStranglethornTalons', 'hiveTyrant', 'Тиран с пушкой-душителем и когтями', ['tyrantStranglethorn', 'scythingTalons']),
  v('hiveTyrantTalons', 'hiveTyrant', 'Тиран с двумя парами когтей', ['scythingTalons', 'tyrantExtraTalons']),
  v('tyranidWarriorDeathspitter', 'tyranidWarrior', 'Воин со смертоплюем', ['deathspitter', 'warriorClaws']),
  v('tyranidWarriorSpinefists', 'tyranidWarrior', 'Воин с шипокулаками', ['spinefists', 'warriorClaws']),
  v('termagantDevourerModel', 'termagant', 'Термагант с пожирателем', ['termagantDevourer', 'termagantClaws']),
  v('termagantSpinefistsModel', 'termagant', 'Термагант с шипокулаками', ['termagantSpinefists', 'termagantClaws']),
  v('carnifexVenom', 'carnifex', 'Карнифекс с тяжёлой ядовитой пушкой', ['carnifexTalons', 'carnifexHeavyVenomCannon']),
  v('carnifexStranglethorn', 'carnifex', 'Карнифекс с пушкой-душителем', ['carnifexTalons', 'carnifexStranglethorn']),
  v('carnifexCrushing', 'carnifex', 'Карнифекс с сокрушающими клешнями', ['crushingClaws', 'carnifexExtraTalons']),
  v('carnifexDevourers', 'carnifex', 'Карнифекс с пожирателями', ['devourerWorms', 'carnifexExtraTalons']),
  v('carnifexBioPlasma', 'carnifex', 'Карнифекс с биоплазмой и гребнями', ['carnifexTalons', 'carnifexExtraTalons', 'bioPlasma', 'spineBanks']),
  // ---- Necrons
  v('overlordStaff', 'overlord', 'Оверлорд с жезлом света', ['staffOfLight', 'staffOfLightMelee']),
  v('overlordVoidscythe', 'overlord', 'Оверлорд с косой пустоты', ['voidscythe']),
  v('necronWarriorReaper', 'necronWarrior', 'Воин некронов с гаусс-жнецом', ['gaussReaper', 'necronCCW']),
  v('immortalTesla', 'immortal', 'Бессмертный с тесла-карабином', ['teslaCarbine', 'immortalCcw']),
  v('lychguardShield', 'lychguard', 'Личгвардеец с мечом и щитом', ['hyperphaseSword'], { invuln: 4 }),
  v('wraithCaster', 'canoptekWraith', 'Призрак с излучателем частиц', ['particleCaster', 'viciousClaws']),
  v('wraithBeamer', 'canoptekWraith', 'Призрак с трансмерным лучом', ['transdimensionalBeamer', 'viciousClaws']),
  v('wraithCoils', 'canoptekWraith', 'Призрак с плетями', ['whipCoils']),
  v('wraithCasterCoils', 'canoptekWraith', 'Призрак с излучателем и плетями', ['particleCaster', 'whipCoils']),
  v('wraithBeamerCoils', 'canoptekWraith', 'Призрак с лучом и плетями', ['transdimensionalBeamer', 'whipCoils']),
  // ---- Aeldari
  v('farseerSpear', 'farseer', 'Фарсир с поющим копьём', ['eldritchStorm', 'farseerPistol', 'singingSpear', 'singingSpearMelee']),
  v('autarchFusionGun', 'autarch', 'Автарх с термоганом', ['dragonFusionGun', 'starGlaive']),
  v('autarchReaper', 'autarch', 'Автарх с жнецом-ракетомётом', ['reaperLauncher', 'starGlaive']),
  v('autarchSpinner', 'autarch', 'Автарх со смертепрядом', ['deathSpinner', 'starGlaive']),
  v('autarchBanshee', 'autarch', 'Автарх с клинком банши', ['autarchPistol', 'bansheeBlade']),
  v('autarchScorpion', 'autarch', 'Автарх с цепным мечом скорпионов', ['autarchPistol', 'scorpionChainsword']),
  v('platformCannon', 'heavyPlatform', 'Платформа с сюрикеновой пушкой', ['shurikenCannon', 'guardianCCW']),
  v('platformLance', 'heavyPlatform', 'Платформа с яркой пикой', ['brightLance', 'guardianCCW']),
  v('platformScatter', 'heavyPlatform', 'Платформа с лазером-рассеивателем', ['scatterLaser', 'guardianCCW']),
  v('platformStarcannon', 'heavyPlatform', 'Платформа со звёздной пушкой', ['starcannon', 'guardianCCW']),
  v('exarchCatapult', 'exarch', 'Экзарх с сюрикеновым катапультом', ['avengerCatapult', 'direCCW']),
  v('exarchTwinCatapults', 'exarch', 'Экзарх с двумя катапультами', ['avengerCatapult', 'avengerCatapult', 'direCCW']),
  v('exarchGlaive', 'exarch', 'Экзарх с силовой глефой', ['direPistol', 'powerGlaive']),
  v('exarchShield', 'exarch', 'Экзарх с мечом и мерцающим щитом', ['diresword'], { invuln: 4 }),
  v('hawkExarchLasblaster', 'hawkExarch', 'Экзарх с лазбластером экзарха', ['exarchLasblaster', 'hawkCcw']),
  v('hawkExarchSunpistol', 'hawkExarch', 'Экзарх с солнечным пистолетом и мечом', ['sunpistol', 'hawkPowerSword']),
  v('hawkExarchScatter', 'hawkExarch', 'Экзарх с лазером-рассеивателем', ['scatterLaser', 'hawkCcw']),
  v('wraithguardScythe', 'wraithguard', 'Страж-призрак с Д-косой', ['dScythe', 'wraithguardCcw']),
]

/** Token / art of each variant: the profile it is built from. */
export const VARIANT_FROM: Record<string, string> = Object.fromEntries(WARGEAR_VARIANTS.map((x) => [x.id, x.from]))
