import type { Weapon, WeaponKeywords, WeaponProfile } from '../types'
import { tr } from '../../i18n/index'

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
  w('sgtPlasmaPistol', tr('Plasma Pistol'),
    named(tr('Standard'), ranged(12, 1, 3, 7, -2, 1, { closeQuarters: true })),
    named(tr('Supercharge'), ranged(12, 1, 3, 8, -3, 2, { closeQuarters: true, hazardous: true }))),
  w('handFlamer', tr('Hand Flamer'), ranged(9, 3, null, 4, 0, 1, { closeQuarters: true, torrent: true })),
  w('neoVolkitePistol', tr('Neo-volkite Pistol'), ranged(12, 1, 2, 5, 0, 2, { closeQuarters: true, devastatingWounds: true })),
  w('sgtNeoVolkitePistol', tr('Neo-volkite Pistol'), ranged(12, 1, 3, 5, 0, 2, { closeQuarters: true, devastatingWounds: true })),
  w('sgtPowerFist', tr('Power Fist'), melee(3, 3, 8, -2, 2)),
  w('sgtPowerWeapon', tr('Power Weapon'), melee(4, 3, 5, -2, 1)),
  w('thunderHammer', tr('Thunder Hammer'), melee(3, 4, 8, -2, 3, { devastatingWounds: true })),
  w('intSgtChainsword', tr('Chainsword'), melee(5, 3, 5, -1, 1)),
  w('captainPowerFist', tr('Power Fist'), melee(5, 2, 8, -2, 2)),
  w('ltPowerFist', tr('Power Fist'), melee(4, 2, 8, -2, 2)),
  w('ltMasterCraftedBolter', tr('Master-crafted Bolter'), ranged(24, 2, 2, 5, -1, 2)),
  w('ltCeramiteFists', tr('Ceramite Fists'), melee(5, 2, 5, 0, 1)),
  // Heavy Onslaught Gatling Cannon: Sustained Hits 2 and Devastating Wounds only against non-MONSTER/VEHICLE targets on
  // the datasheet; here Sustained Hits 2 always and no Devastating Wounds (the engine has no per-target keywords yet)
  w('heavyOnslaughtGatling', tr('Heavy Onslaught Gatling Cannon'), ranged(24, 12, 3, 6, -1, 1, { sustainedHits: 2 })),
  w('onslaughtGatling', tr('Onslaught Gatling Cannon'), ranged(24, 8, 3, 5, -1, 1)),
  w('stormBolters', tr('Storm Bolters'), ranged(24, 4, 3, 5, -1, 1, { rapidFire: 4 })),
  w('icarusRocketPod', tr('Icarus Rocket Pod'), ranged(24, 3, 3, 6, -1, 2, { anti: anti('FLY', 2) })),
  // ---- Orks
  w('nobKustomChoppa', tr('Kustom Choppa'), melee(4, 3, 5, -2, 2)),
  w('powerKlaw', tr('Power Klaw'), melee(3, 3, 10, -2, 2)),
  w('warbossPowerKlaw', tr('Power Klaw'), melee(6, 2, 12, -2, 2)),
  w('kombiSkorcha', tr('Kombi-skorcha'),
    named(tr('Shoota'), ranged(18, 2, 5, 4, 0, 1, { lethalHits: nonMV, rapidFire: 1 })),
    named(tr('Skorcha'), ranged(12, 3, null, 5, 0, 1, { torrent: true, blast: 1 }))),
  w('kombiRokkit', tr('Kombi-rokkit'),
    named(tr('Shoota'), ranged(18, 2, 5, 4, 0, 1, { lethalHits: nonMV, rapidFire: 1 })),
    named(tr('Busta rokkit'), ranged(24, 1, 5, 10, -2, 3))),
  w('burna', tr('Burna|alt'), ranged(12, 3, null, 4, 0, 1, { torrent: true, blast: 1 })),
  w('kustomBigShoota', tr('Kustom Big Shoota'), ranged(18, 8, 5, 4, 0, 1, { lethalHits: nonMV })),
  w('bigSkorcha', tr('Big Skorcha'), ranged(18, 3, null, 5, -1, 1, { torrent: true, blast: 2 })),
  w('breachaRam', tr('Breacha Ram'), melee(2, 4, 8, -2, 2)),
  w('kustomMegaBlasta', tr('Kustom Mega-blasta'), ranged(24, 3, 5, 9, -2, 3, { hazardous: true })),
  w('extraKlaw', tr('Extra Klaw'), melee(1, 3, 12, -2, 3, { extraAttacks: true })),
  // ---- Tyranids
  w('tyrantHeavyVenomCannon', tr('Heavy Venom Cannon'), ranged(36, 0, 2, 9, -2, 3, { blast: 1 }, { randomA: 'D3' })),
  w('tyrantStranglethorn', tr('Stranglethorn Cannon|alt'), ranged(36, 1, 2, 7, -1, 2, { blast: 1 }, { randomA: 'D6' })),
  w('tyrantExtraTalons', tr('Monstrous Scything Talons'), melee(4, 2, 7, -2, 2, { extraAttacks: true })),
  w('deathspitter', tr('Deathspitter|alt2'), ranged(24, 3, 4, 5, -1, 1)),
  w('spinefists', tr('Spinefists|alt2'), ranged(12, 2, 4, 4, 0, 1, { closeQuarters: true, twinLinked: true })),
  w('termagantDevourer', tr('Termagant Devourer|alt'), ranged(18, 2, 4, 4, 0, 1)),
  w('termagantSpinefists', tr('Termagant Spinefists|alt'), ranged(12, 2, 4, 3, 0, 1, { closeQuarters: true, twinLinked: true })),
  w('bioPlasma', tr('Bio-plasma'), ranged(12, 0, 4, 7, -2, 1, { assault: true, blast: 1 }, { randomA: 'D3' })),
  w('deathspitterMaggots', tr('Deathspitters with Slimer Maggots'), ranged(24, 6, 4, 7, -2, 1)),
  w('devourerWorms', tr('Devourers with Brainleech Worms'), ranged(18, 12, 4, 6, 0, 1)),
  w('carnifexHeavyVenomCannon', tr('Heavy Venom Cannon'), ranged(36, 0, 4, 9, -2, 3, { blast: 1 }, { randomA: 'D3' })),
  w('carnifexStranglethorn', tr('Stranglethorn Cannon|alt'), ranged(36, 1, 4, 7, -1, 2, { blast: 1 }, { randomA: 'D6' })),
  w('spineBanks', tr('Spine Banks'), ranged(6, 5, 4, 5, 0, 1, { assault: true })),
  w('crushingClaws', tr('Carnifex Crushing Claws'), melee(4, 4, 12, -3, 1, {}, { randomD: 'D6' })),
  // ---- Necrons
  w('teslaCarbine', tr('Tesla Carbine'), ranged(24, 2, 3, 5, 0, 1, { assault: true, sustainedHits: 2 })),
  w('hyperphaseSword', tr('Hyperphase Sword'), melee(3, 3, 6, -2, 1)),
  w('whipCoils', tr('Whip Coils'), melee(8, 4, 5, 0, 1)),
  w('particleCaster', tr('Particle Caster'), ranged(12, 3, 4, 5, 0, 1, { closeQuarters: true, devastatingWounds: true })),
  w('transdimensionalBeamer', tr('Transdimensional Beamer'), ranged(12, 1, 4, 4, -2, 3)),
  // ---- Aeldari (Melta is not modelled)
  w('singingSpear', tr('Singing Spear (throw)'), ranged(12, 1, 2, 9, 0, 3, { assault: true, psychic: true })),
  w('singingSpearMelee', tr('Singing Spear'), melee(2, 2, 3, 0, 3, { psychic: true })),
  w('deathSpinner', tr('Death Spinner'), ranged(12, 0, null, 4, -1, 1, { torrent: true, ignoresCover: true }, { randomA: 'D6' })),
  w('dragonFusionGun', tr('Dragon Fusion Gun'), ranged(12, 1, 2, 9, -4, 0, { assault: true }, { randomD: 'D6' })),
  w('dragonFusionPistol', tr('Dragon Fusion Pistol'), ranged(6, 1, 2, 9, -4, 0, { assault: true, closeQuarters: true }, { randomD: 'D6' })),
  w('reaperLauncher', tr('Reaper Launcher'),
    named(tr('Starshot'), ranged(48, 1, 3, 10, -2, 3, { heavy: true, ignoresCover: true })),
    named(tr('Starswarm'), ranged(48, 2, 3, 4, -2, 1, { heavy: true, ignoresCover: true }))),
  w('bansheeBlade', tr('Banshee Blade'), melee(5, 2, 4, -2, 2, { anti: anti('INFANTRY', 3) })),
  w('scorpionChainsword', tr('Scorpion Chainsword'), melee(7, 2, 4, -1, 1, { sustainedHits: 1 })),
  w('exarchLasblaster', tr('Exarch’s Lasblaster'), ranged(24, 4, 3, 5, -1, 1, { assault: true, lethalHits: true })),
  w('sunpistol', tr('Sunpistol'), ranged(12, 2, 3, 4, 0, 1, { assault: true, lethalHits: true, closeQuarters: true })),
  w('hawkPowerSword', tr('Power Sword'), melee(5, 3, 4, -2, 1)),
  w('dScythe', tr('D-scythe|alt'), ranged(12, 0, null, 7, -3, 1, { torrent: true }, { randomA: 'D6' })),
]

export const WARGEAR_WEAPONS: Record<string, Weapon> = Object.fromEntries(list.map((x) => [x.id, x]))

/** A model variant: the profile `from` with other weapons (and optionally another invulnerable save / Wounds). */
export interface Variant { id: string; from: string; name: string; weapons: string[]; invuln?: number; w?: number }
const v = (id: string, from: string, name: string, weapons: string[], extra: Partial<Variant> = {}): Variant => ({ id, from, name, weapons, ...extra })

export const WARGEAR_VARIANTS: Variant[] = [
  // ---- Space Marines
  v('captainPlasma', 'captain', tr('Captain with plasma pistol'), ['plasmaPistol', 'captainPowerWeapon']),
  v('captainVolkite', 'captain', tr('Captain with neo-volkite pistol'), ['neoVolkitePistol', 'captainPowerWeapon']),
  v('captainFist', 'captain', tr('Captain with power fist'), ['masterCraftedBolter', 'captainHeavyBoltPistol', 'captainPowerFist']),
  v('captainShield', 'captain', tr('Captain with relic shield'), ['captainHeavyBoltPistol', 'captainPowerWeapon'], { w: 6 }),
  v('captainPlasmaFist', 'captain', tr('Captain with plasma pistol and fist'), ['plasmaPistol', 'captainPowerFist']),
  v('lieutenantBolter', 'lieutenant', tr('Lieutenant with master-crafted bolter'), ['ltBoltPistol', 'ltMasterCraftedBolter', 'ltCeramiteFists']),
  v('lieutenantVolkite', 'lieutenant', tr('Lieutenant with neo-volkite and power weapon'), ['neoVolkitePistol', 'mcPowerWeapon']),
  v('lieutenantShield', 'lieutenant', tr('Lieutenant with neo-volkite and storm shield'), ['neoVolkitePistol', 'mcPowerWeapon'], { invuln: 4 }),
  v('lieutenantFist', 'lieutenant', tr('Lieutenant with power fist'), ['plasmaPistol', 'ltPowerFist']),
  v('intercessorSergeantChainsword', 'intercessorSergeant', tr('Sergeant with chainsword'), ['boltRifle', 'boltPistol', 'intSgtChainsword']),
  v('intercessorSergeantFist', 'intercessorSergeant', tr('Sergeant with power fist'), ['boltRifle', 'boltPistol', 'sgtPowerFist']),
  v('intercessorSergeantWeapon', 'intercessorSergeant', tr('Sergeant with power weapon'), ['boltRifle', 'boltPistol', 'sgtPowerWeapon']),
  v('intercessorSergeantHammer', 'intercessorSergeant', tr('Sergeant with thunder hammer'), ['boltRifle', 'boltPistol', 'thunderHammer']),
  v('assaultSergeantHammer', 'assaultSergeant', tr('Sergeant with thunder hammer'), ['heavyBoltPistol', 'thunderHammer']),
  v('assaultSergeantFist', 'assaultSergeant', tr('Sergeant with power fist'), ['heavyBoltPistol', 'sgtPowerFist']),
  v('assaultSergeantWeapon', 'assaultSergeant', tr('Sergeant with power weapon'), ['heavyBoltPistol', 'sgtPowerWeapon']),
  v('assaultSergeantPlasma', 'assaultSergeant', tr('Sergeant with plasma pistol'), ['sgtPlasmaPistol', 'chainsword']),
  v('assaultSergeantFlamer', 'assaultSergeant', tr('Sergeant with hand flamer'), ['handFlamer', 'chainsword']),
  v('hellblasterSergeantPlasma', 'hellblasterSergeant', tr('Sergeant with plasma pistol'), ['plasmaIncinerator', 'sgtPlasmaPistol', 'ceramiteFists']),
  v('bladeguardSergeantVolkite', 'bladeguardSergeant', tr('Sergeant with neo-volkite pistol'), ['sgtNeoVolkitePistol', 'masterCraftedPowerSword']),
  v('bladeguardSergeantPlasma', 'bladeguardSergeant', tr('Sergeant with plasma pistol'), ['sgtPlasmaPistol', 'masterCraftedPowerSword']),
  v('redemptorGatlingFlamer', 'redemptor', tr('Redemptor: heavy gatling cannon and flamer'), ['heavyOnslaughtGatling', 'heavyFlamer', 'fragstorm', 'redemptorFist']),
  v('redemptorGatlings', 'redemptor', tr('Redemptor: two gatling cannons and storm bolters'), ['heavyOnslaughtGatling', 'onslaughtGatling', 'stormBolters', 'redemptorFist']),
  v('redemptorPlasmaGatling', 'redemptor', tr('Redemptor: macro plasma and gatling cannon'), ['macroPlasma', 'onslaughtGatling', 'fragstorm', 'redemptorFist']),
  v('redemptorPlasmaBolters', 'redemptor', tr('Redemptor: macro plasma and storm bolters'), ['macroPlasma', 'heavyFlamer', 'stormBolters', 'redemptorFist']),
  v('redemptorIcarus', 'redemptor', tr('Redemptor: macro plasma, gatling and “Icarus”'), ['macroPlasma', 'onslaughtGatling', 'stormBolters', 'icarusRocketPod', 'redemptorFist']),
  // ---- Orks
  v('warbossKlaw', 'warboss', tr('Warboss with power klaw'), ['kustomShoota', 'warbossPowerKlaw']),
  v('warbossRokkit', 'warboss', tr('Warboss with kombi-rokkit'), ['kombiRokkit', 'bossKustomChoppa']),
  v('warbossSkorcha', 'warboss', tr('Warboss with kombi-skorcha'), ['kombiSkorcha', 'bossKustomChoppa']),
  v('warbossRokkitKlaw', 'warboss', tr('Warboss with kombi-rokkit and klaw'), ['kombiRokkit', 'warbossPowerKlaw']),
  v('warbossSkorchaKlaw', 'warboss', tr('Warboss with kombi-skorcha and klaw'), ['kombiSkorcha', 'warbossPowerKlaw']),
  v('nobChoppaSkorcha', 'nob', tr('Nob with kustom choppa and kombi-skorcha'), ['kombiSkorcha', 'nobKustomChoppa']),
  v('nobKlawSkorcha', 'nob', tr('Nob with power klaw and kombi-skorcha'), ['kombiSkorcha', 'powerKlaw']),
  v('nobChoppaShoota', 'nob', tr('Nob with kustom choppa and kustom shoota'), ['kustomShoota', 'nobKustomChoppa']),
  v('nobKlawRokkit', 'nob', tr('Nob with power klaw and kombi-rokkit'), ['kombiRokkit', 'powerKlaw']),
  v('boyBurna', 'boy', tr('Boy with burna'), ['burna', 'slugga', 'choppa']),
  v('nobzSkorcha', 'nobzNob', tr('Nob with big skorcha'), ['bigSkorcha', 'nobKustomChoppa']),
  v('nobzBigShoota', 'nobzNob', tr('Nob with kustom big shoota'), ['kustomBigShoota', 'nobKustomChoppa']),
  v('nobzBigChoppa', 'nobzNob', tr('Nob with big choppa'), ['bigChoppa']),
  v('nobzRokkit', 'nobzNob', tr('Nob with kombi-rokkit'), ['kombiRokkit', 'kustomKrumpa']),
  v('kommandoNobBigChoppa', 'kommandoNob', tr('Kommando Nob with big choppa'), ['slugga', 'bigChoppa']),
  v('kommandoNobKlaw', 'kommandoNob', tr('Kommando Nob with power klaw'), ['slugga', 'powerKlaw']),
  v('kommandoBurna', 'kommando', tr('Kommando with burna'), ['burna', 'slugga', 'choppa']),
  v('kommandoRokkit', 'kommando', tr('Kommando with rokkit launcha'), ['rokkitLauncha', 'slugga', 'choppa']),
  v('kommandoRam', 'kommando', tr('Kommando with breacha ram'), ['slugga', 'breachaRam']),
  v('kommandoShoota', 'kommando', tr('Kommando with kustom shoota'), ['kustomShoota', 'slugga', 'choppa']),
  v('deffDreadKlaws', 'deffDread', tr('Deff Dread with two extra klaws'), ['extraKlaw', 'extraKlaw', 'dreadKlaws']),
  v('deffDreadBlastas', 'deffDread', tr('Deff Dread with two mega-blastas'), ['kustomMegaBlasta', 'kustomMegaBlasta', 'dreadKlaws']),
  v('deffDreadRokkits', 'deffDread', tr('Deff Dread with two rokkit launchas'), ['rokkitLauncha', 'rokkitLauncha', 'dreadKlaws']),
  v('deffDreadShootaBlasta', 'deffDread', tr('Deff Dread with big shoota and mega-blasta'), ['dreadBigShoota', 'kustomMegaBlasta', 'dreadKlaws']),
  v('deffDreadKlawSkorcha', 'deffDread', tr('Deff Dread with klaw and skorcha'), ['extraKlaw', 'skorcha', 'dreadKlaws']),
  // ---- Tyranids
  v('hiveTyrantVenom', 'hiveTyrant', tr('Tyrant with sword and heavy venom cannon'), ['boneswordLashWhip', 'tyrantHeavyVenomCannon']),
  v('hiveTyrantStranglethorn', 'hiveTyrant', tr('Tyrant with sword and strangleweb cannon'), ['boneswordLashWhip', 'tyrantStranglethorn']),
  v('hiveTyrantVenomTalons', 'hiveTyrant', tr('Tyrant with venom cannon and talons'), ['tyrantHeavyVenomCannon', 'scythingTalons']),
  v('hiveTyrantStranglethornTalons', 'hiveTyrant', tr('Tyrant with strangleweb cannon and talons'), ['tyrantStranglethorn', 'scythingTalons']),
  v('hiveTyrantTalons', 'hiveTyrant', tr('Tyrant with two pairs of talons'), ['scythingTalons', 'tyrantExtraTalons']),
  v('tyranidWarriorDeathspitter', 'tyranidWarrior', tr('Warrior with deathspitter'), ['deathspitter', 'warriorClaws']),
  v('tyranidWarriorSpinefists', 'tyranidWarrior', tr('Warrior with spinefists'), ['spinefists', 'warriorClaws']),
  v('termagantDevourerModel', 'termagant', tr('Termagant with devourer'), ['termagantDevourer', 'termagantClaws']),
  v('termagantSpinefistsModel', 'termagant', tr('Termagant with spinefists'), ['termagantSpinefists', 'termagantClaws']),
  v('carnifexVenom', 'carnifex', tr('Carnifex with heavy venom cannon'), ['carnifexTalons', 'carnifexHeavyVenomCannon']),
  v('carnifexStranglethorn', 'carnifex', tr('Carnifex with strangleweb cannon'), ['carnifexTalons', 'carnifexStranglethorn']),
  v('carnifexCrushing', 'carnifex', tr('Carnifex with crushing claws'), ['crushingClaws', 'carnifexExtraTalons']),
  v('carnifexDevourers', 'carnifex', tr('Carnifex with devourers'), ['devourerWorms', 'carnifexExtraTalons']),
  v('carnifexBioPlasma', 'carnifex', tr('Carnifex with bio-plasma and ridges'), ['carnifexTalons', 'carnifexExtraTalons', 'bioPlasma', 'spineBanks']),
  // ---- Necrons
  v('overlordStaff', 'overlord', tr('Overlord with staff of light'), ['staffOfLight', 'staffOfLightMelee']),
  v('overlordVoidscythe', 'overlord', tr('Overlord with voidscythe'), ['voidscythe']),
  v('necronWarriorReaper', 'necronWarrior', tr('Necron Warrior with gauss reaper'), ['gaussReaper', 'necronCCW']),
  v('immortalTesla', 'immortal', tr('Immortal with tesla carbine'), ['teslaCarbine', 'immortalCcw']),
  v('lychguardShield', 'lychguard', tr('Lychguard with sword and shield'), ['hyperphaseSword'], { invuln: 4 }),
  v('wraithCaster', 'canoptekWraith', tr('Wraith with particle caster'), ['particleCaster', 'viciousClaws']),
  v('wraithBeamer', 'canoptekWraith', tr('Wraith with transdimensional beamer'), ['transdimensionalBeamer', 'viciousClaws']),
  v('wraithCoils', 'canoptekWraith', tr('Wraith with whip coils'), ['whipCoils']),
  v('wraithCasterCoils', 'canoptekWraith', tr('Wraith with caster and whip coils'), ['particleCaster', 'whipCoils']),
  v('wraithBeamerCoils', 'canoptekWraith', tr('Wraith with beamer and whip coils'), ['transdimensionalBeamer', 'whipCoils']),
  // ---- Aeldari
  v('farseerSpear', 'farseer', tr('Farseer with singing spear'), ['eldritchStorm', 'farseerPistol', 'singingSpear', 'singingSpearMelee']),
  v('autarchFusionGun', 'autarch', tr('Autarch with fusion gun'), ['dragonFusionGun', 'starGlaive']),
  v('autarchReaper', 'autarch', tr('Autarch with reaper launcher'), ['reaperLauncher', 'starGlaive']),
  v('autarchSpinner', 'autarch', tr('Autarch with death spinner'), ['deathSpinner', 'starGlaive']),
  v('autarchBanshee', 'autarch', tr('Autarch with banshee blade'), ['autarchPistol', 'bansheeBlade']),
  v('autarchScorpion', 'autarch', tr('Autarch with scorpion chainsword'), ['autarchPistol', 'scorpionChainsword']),
  v('platformCannon', 'heavyPlatform', tr('Platform with shuriken cannon'), ['shurikenCannon', 'guardianCCW']),
  v('platformLance', 'heavyPlatform', tr('Platform with bright lance'), ['brightLance', 'guardianCCW']),
  v('platformScatter', 'heavyPlatform', tr('Platform with scatter laser'), ['scatterLaser', 'guardianCCW']),
  v('platformStarcannon', 'heavyPlatform', tr('Platform with starcannon'), ['starcannon', 'guardianCCW']),
  v('exarchCatapult', 'exarch', tr('Exarch with shuriken catapult'), ['avengerCatapult', 'direCCW']),
  v('exarchTwinCatapults', 'exarch', tr('Exarch with two catapults'), ['avengerCatapult', 'avengerCatapult', 'direCCW']),
  v('exarchGlaive', 'exarch', tr('Exarch with power glaive'), ['direPistol', 'powerGlaive']),
  v('exarchShield', 'exarch', tr('Exarch with sword and shimmershield'), ['diresword'], { invuln: 4 }),
  v('hawkExarchLasblaster', 'hawkExarch', tr('Exarch with Exarch’s lasblaster'), ['exarchLasblaster', 'hawkCcw']),
  v('hawkExarchSunpistol', 'hawkExarch', tr('Exarch with sunpistol and sword'), ['sunpistol', 'hawkPowerSword']),
  v('hawkExarchScatter', 'hawkExarch', tr('Exarch with scatter laser'), ['scatterLaser', 'hawkCcw']),
  v('wraithguardScythe', 'wraithguard', tr('Wraithguard with D-scythe'), ['dScythe', 'wraithguardCcw']),
]

/** Token / art of each variant: the profile it is built from. */
export const VARIANT_FROM: Record<string, string> = Object.fromEntries(WARGEAR_VARIANTS.map((x) => [x.id, x.from]))
