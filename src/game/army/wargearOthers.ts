import type { Variant, WargearSpec } from './wargear'
import { tr } from '../../i18n/index'

// Wargear options of Space Marines, Orks, Tyranids, Necrons and Aeldari (11th edition datasheets, Wahapedia). The model
// variants are defined in data/wargearExtra.ts. Where a datasheet allows many combinations of two weapon slots on a
// single model (Captain, Warboss, Deff Dread, Redemptor, Autarch, Carnifex, Hive Tyrant), the builder offers the common
// ones rather than every combination; see docs/wargear.md.

const any = (size: number) => size
const per = (n: number) => (size: number) => Math.floor(size / n)
const one = () => 1
const opt = (profile: string, label: string): Variant => ({ profile, label })
/** a single-model unit choosing between whole loadouts */
const single = (...variants: Variant[]): WargearSpec => ({ leader: variants, base: variants[0], groups: [] })

export const OTHER_WARGEAR: Record<string, WargearSpec> = {
  // ---- Space Marines
  captain: single(
    opt('captain', tr('Master-crafted bolter, heavy bolt pistol, power weapon')),
    opt('captainPlasma', tr('Plasma pistol and power weapon')),
    opt('captainVolkite', tr('Neo-volkite pistol and power weapon')),
    opt('captainFist', tr('Master-crafted bolter, pistol and power fist')),
    opt('captainShield', tr('Relic shield (+1 wound), pistol and power weapon')),
    opt('captainPlasmaFist', tr('Plasma pistol and power fist')),
  ),
  lieutenant: single(
    opt('lieutenant', tr('Plasma pistol, bolt pistol, power weapon')),
    opt('lieutenantBolter', tr('Master-crafted bolter, bolt pistol, ceramite fists')),
    opt('lieutenantVolkite', tr('Neo-volkite pistol and power weapon')),
    opt('lieutenantShield', tr('Neo-volkite, power weapon and storm shield (4+ invulnerable)')),
    opt('lieutenantFist', tr('Plasma pistol and power fist')),
  ),
  intercessors: {
    leader: [
      opt('intercessorSergeant', tr('Sergeant: knife and fists')),
      opt('intercessorSergeantChainsword', tr('Sergeant: chainsword')),
      opt('intercessorSergeantFist', tr('Sergeant: power fist')),
      opt('intercessorSergeantWeapon', tr('Sergeant: power weapon')),
      opt('intercessorSergeantHammer', tr('Sergeant: thunder hammer')),
    ],
    base: opt('intercessor', tr('Bolt rifle')),
    groups: [{ id: 'gl', label: tr('Grenade launcher — one per 5 models'), variants: [opt('intercessorGL', tr('Underslung grenade launcher'))], max: per(5) }],
  },
  assaultIntercessors: {
    leader: [
      opt('assaultSergeant', tr('Sergeant: pistol and chainsword')),
      opt('assaultSergeantHammer', tr('Sergeant: thunder hammer')),
      opt('assaultSergeantFist', tr('Sergeant: power fist')),
      opt('assaultSergeantWeapon', tr('Sergeant: power weapon')),
      opt('assaultSergeantPlasma', tr('Sergeant: plasma pistol')),
      opt('assaultSergeantFlamer', tr('Sergeant: hand flamer')),
    ],
    base: opt('assaultIntercessor', tr('Heavy bolt pistol and chainsword')),
    groups: [],
  },
  hellblasters: {
    leader: [opt('hellblasterSergeant', tr('Sergeant: bolt pistol')), opt('hellblasterSergeantPlasma', tr('Sergeant: plasma pistol'))],
    base: opt('hellblaster', tr('Plasma incinerator')),
    groups: [],
  },
  bladeguard: {
    leader: [
      opt('bladeguardSergeant', tr('Sergeant: heavy bolt pistol')),
      opt('bladeguardSergeantVolkite', tr('Sergeant: neo-volkite pistol')),
      opt('bladeguardSergeantPlasma', tr('Sergeant: plasma pistol')),
    ],
    base: opt('bladeguardVeteran', tr('Heavy bolt pistol and master-crafted sword')),
    groups: [],
  },
  redemptor: single(
    opt('redemptor', tr('Macro plasma, heavy flamer, “Fragstorm”')),
    opt('redemptorGatlingFlamer', tr('Heavy gatling cannon, heavy flamer, “Fragstorm”')),
    opt('redemptorGatlings', tr('Heavy and standard gatling cannons, storm bolters')),
    opt('redemptorPlasmaGatling', tr('Macro plasma, gatling cannon, “Fragstorm”')),
    opt('redemptorPlasmaBolters', tr('Macro plasma, heavy flamer, storm bolters')),
    opt('redemptorIcarus', tr('Macro plasma, gatling cannon, storm bolters and “Icarus”')),
  ),
  // ---- Orks
  warboss: single(
    opt('warboss', tr('Kustom shoota and kustom choppa')),
    opt('warbossKlaw', tr('Kustom shoota and power klaw')),
    opt('warbossRokkit', tr('Kombi-rokkit and kustom choppa')),
    opt('warbossSkorcha', tr('Kombi-skorcha and kustom choppa')),
    opt('warbossRokkitKlaw', tr('Kombi-rokkit and power klaw')),
    opt('warbossSkorchaKlaw', tr('Kombi-skorcha and power klaw')),
  ),
  boyz: {
    leader: [
      opt('nob', tr('Nob: big choppa')),
      opt('nobChoppaSkorcha', tr('Nob: kustom choppa and kombi-skorcha')),
      opt('nobKlawSkorcha', tr('Nob: power klaw and kombi-skorcha')),
      opt('nobChoppaShoota', tr('Nob: kustom choppa and kustom shoota')),
      opt('nobKlawRokkit', tr('Nob: power klaw and kombi-rokkit')),
    ],
    base: opt('boy', tr('Shoota, slugga and choppa')),
    groups: [
      { id: 'bigShoota', label: tr('Big shoota — one per 10 models'), variants: [opt('boyBigShoota', tr('Big shoota'))], max: per(10) },
      { id: 'rokkit', label: tr('Rokkit launcha — one per 10 models'), variants: [opt('boyRokkit', tr('Rokkit launcha'))], max: per(10) },
      { id: 'burna', label: tr('Burna — one per 10 models'), variants: [opt('boyBurna', tr('Burna'))], max: per(10) },
    ],
  },
  nobz: {
    base: opt('nobzNob', tr('Kustom shoota and kustom krumpa')),
    groups: [
      { id: 'skorcha', label: tr('Big skorcha — one per 5 models'), variants: [opt('nobzSkorcha', tr('Big skorcha and kustom choppa'))], max: per(5) },
      { id: 'bigShoota', label: tr('Kustom big shoota — one per 5 models'), variants: [opt('nobzBigShoota', tr('Kustom big shoota and kustom choppa'))], max: per(5) },
      { id: 'bigChoppa', label: tr('Big choppa — one per 5 models'), variants: [opt('nobzBigChoppa', tr('Big choppa'))], max: per(5) },
      { id: 'rokkit', label: tr('Kombi-rokkit — any number of models'), variants: [opt('nobzRokkit', tr('Kombi-rokkit and kustom krumpa'))], max: any },
    ],
  },
  kommandos: {
    leader: [opt('kommandoNob', tr('Nob: slugga and choppa')), opt('kommandoNobBigChoppa', tr('Nob: big choppa')), opt('kommandoNobKlaw', tr('Nob: power klaw'))],
    base: opt('kommando', tr('Slugga and choppa')),
    groups: [
      { id: 'burna', label: tr('Burna — one model'), variants: [opt('kommandoBurna', tr('Burna'))], max: one },
      { id: 'rokkit', label: tr('Rokkit launcha — one model'), variants: [opt('kommandoRokkit', tr('Rokkit launcha'))], max: one },
      { id: 'ram', label: tr('Tankbusta bomb — one model'), variants: [opt('kommandoRam', tr('Tankbusta bomb'))], max: one },
      { id: 'shoota', label: tr('Kustom shoota — up to two models'), variants: [opt('kommandoShoota', tr('Kustom shoota'))], max: () => 2 },
    ],
  },
  deffDread: single(
    opt('deffDread', tr('Big shoota and skorcha')),
    opt('deffDreadKlaws', tr('Two extra klaws')),
    opt('deffDreadBlastas', tr('Two kustom mega-blastas')),
    opt('deffDreadRokkits', tr('Two rokkit launchas')),
    opt('deffDreadShootaBlasta', tr('Big shoota and mega-blasta')),
    opt('deffDreadKlawSkorcha', tr('Extra klaw and skorcha')),
  ),
  // ---- Tyranids
  hiveTyrant: single(
    opt('hiveTyrant', tr('Bone sabre with lash whip and scything talons')),
    opt('hiveTyrantVenom', tr('Bone sabre and heavy venom cannon')),
    opt('hiveTyrantStranglethorn', tr('Bone sabre and strangleweb cannon')),
    opt('hiveTyrantVenomTalons', tr('Heavy venom cannon and scything talons')),
    opt('hiveTyrantStranglethornTalons', tr('Strangleweb cannon and scything talons')),
    opt('hiveTyrantTalons', tr('Two pairs of scything talons')),
  ),
  tyranidWarriors: {
    leader: [opt('tyranidPrime', tr('Prime: devourer'))],
    base: opt('tyranidWarrior', tr('Devourer')),
    groups: [
      { id: 'light', label: tr('Deathspitter or spinefists — any number of models'), variants: [opt('tyranidWarriorDeathspitter', tr('Deathspitter')), opt('tyranidWarriorSpinefists', tr('Spinefists'))], max: any },
      { id: 'venom', label: tr('Venom cannon — one per 3 models'), variants: [opt('tyranidWarriorVenom', tr('Venom cannon'))], max: per(3) },
      { id: 'strangler', label: tr('Barbed strangler — one per 3 models'), variants: [opt('tyranidWarriorStrangler', tr('Barbed strangler'))], max: per(3) },
    ],
  },
  termagants: {
    base: opt('termagant', tr('Fleshborer')),
    groups: [
      { id: 'all', label: tr('Devourers or spinefists — any number of models'), variants: [opt('termagantDevourerModel', tr('Devourer')), opt('termagantSpinefistsModel', tr('Spinefists'))], max: any },
      { id: 'shard', label: tr('Shard cannon — one per 10 models'), variants: [opt('termagantShard', tr('Shard cannon'))], max: per(10) },
      { id: 'spike', label: tr('Spike rifle — one per 10 models'), variants: [opt('termagantSpike', tr('Spike rifle'))], max: per(10) },
      { id: 'web', label: tr('Webbing lash — one per 10 models'), variants: [opt('termagantWeb', tr('Webbing lash'))], max: per(10) },
    ],
  },
  carnifexes: {
    base: opt('carnifex', tr('Scything talons and extra talons')),
    groups: [
      {
        id: 'arms', label: tr('Weapons — any number of models'),
        variants: [
          opt('carnifexVenom', tr('Heavy venom cannon')),
          opt('carnifexStranglethorn', tr('Strangleweb cannon')),
          opt('carnifexCrushing', tr('Crushing claws')),
          opt('carnifexDevourers', tr('Devourers with brainleech worms')),
          opt('carnifexBioPlasma', tr('Claws, bio-plasma and spiked ridges')),
        ],
        max: any,
      },
    ],
  },
  // ---- Necrons
  overlord: single(
    opt('overlord', tr('Tachyon arrow and Overlord’s blade')),
    opt('overlordStaff', tr('Staff of light')),
    opt('overlordVoidscythe', tr('Voidscythe')),
  ),
  necronWarriors: {
    base: opt('necronWarrior', tr('Gauss flayer')),
    groups: [{ id: 'reaper', label: tr('Gauss reaper — any number of models'), variants: [opt('necronWarriorReaper', tr('Gauss reaper'))], max: any }],
  },
  immortals: {
    base: opt('immortal', tr('Gauss blaster')),
    groups: [{ id: 'tesla', label: tr('Tesla carbine — any number of models'), variants: [opt('immortalTesla', tr('Tesla carbine'))], max: any }],
  },
  lychguard: {
    base: opt('lychguard', tr('War scythe')),
    groups: [{ id: 'shield', label: tr('Hyperphase sword and dispersion shield — any number of models'), variants: [opt('lychguardShield', tr('Sword and shield (4+ invulnerable)'))], max: any }],
  },
  canoptekWraiths: {
    base: opt('canoptekWraith', tr('Vicious claws')),
    groups: [
      {
        id: 'arms', label: tr('Weapons — any number of models'),
        variants: [
          opt('wraithCaster', tr('Particle caster')),
          opt('wraithBeamer', tr('Transdimensional beamer')),
          opt('wraithCoils', tr('Whip coils')),
          opt('wraithCasterCoils', tr('Caster and whip coils')),
          opt('wraithBeamerCoils', tr('Beamer and whip coils')),
        ],
        max: any,
      },
    ],
  },
  // ---- Aeldari
  farseer: single(opt('farseer', tr('Witchblade')), opt('farseerSpear', tr('Singing spear'))),
  autarch: single(
    opt('autarch', tr('Shuriken pistol and star glaive')),
    opt('autarchFusionGun', tr('Dragon fusion gun and glaive')),
    opt('autarchReaper', tr('Reaper launcher and glaive')),
    opt('autarchSpinner', tr('Death spinner and glaive')),
    opt('autarchBanshee', tr('Pistol and banshee blade')),
    opt('autarchScorpion', tr('Pistol and scorpion chainsword')),
  ),
  guardianDefenders: {
    base: opt('guardian', tr('Shuriken catapult')),
    groups: [
      {
        id: 'platform', label: tr('Heavy weapon platform — exactly one'),
        variants: [
          opt('platformCannon', tr('Shuriken cannon')),
          opt('heavyPlatform', tr('Missile launcher')),
          opt('platformLance', tr('Bright lance')),
          opt('platformScatter', tr('Scatter laser')),
          opt('platformStarcannon', tr('Starcannon')),
        ],
        max: one,
        min: 1,
      },
    ],
  },
  direAvengers: {
    leader: [
      opt('exarch', tr('Exarch: pistol and diresword')),
      opt('exarchCatapult', tr('Exarch: avenger catapult')),
      opt('exarchTwinCatapults', tr('Exarch: two catapults')),
      opt('exarchGlaive', tr('Exarch: pistol and power glaive')),
      opt('exarchShield', tr('Exarch: sword and shimmershield (4+ invulnerable)')),
    ],
    base: opt('direAvenger', tr('Avenger catapult')),
    groups: [],
  },
  swoopingHawks: {
    leader: [
      opt('hawkExarch', tr('Exarch: hawk’s talon')),
      opt('hawkExarchLasblaster', tr('Exarch: Exarch’s laser blaster')),
      opt('hawkExarchSunpistol', tr('Exarch: sunrifle and power sword')),
      opt('hawkExarchScatter', tr('Exarch: scatter laser')),
    ],
    base: opt('swoopingHawk', tr('Laser blaster')),
    groups: [],
  },
  wraithguard: {
    base: opt('wraithguard', tr('Wraithcannon')),
    groups: [{ id: 'scythe', label: tr('D-scythe — any number of models'), variants: [opt('wraithguardScythe', tr('D-scythe'))], max: any }],
  },
  windriders: {
    base: opt('windrider', tr('Twin shuriken catapult')),
    groups: [{ id: 'heavy', label: tr('Heavy weapon — any number of models'), variants: [opt('windriderLaser', tr('Scatter laser')), opt('windriderCannon', tr('Shuriken cannon'))], max: any }],
  },
}
