import type { Variant, WargearSpec } from './wargear'

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
    opt('captain', 'Мастерский болтер, тяжёлый болт-пистолет, силовое оружие'),
    opt('captainPlasma', 'Плазменный пистолет и силовое оружие'),
    opt('captainVolkite', 'Нео-волкитный пистолет и силовое оружие'),
    opt('captainFist', 'Мастерский болтер, пистолет и силовой кулак'),
    opt('captainShield', 'Реликтовый щит (+1 рана), пистолет и силовое оружие'),
    opt('captainPlasmaFist', 'Плазменный пистолет и силовой кулак'),
  ),
  lieutenant: single(
    opt('lieutenant', 'Плазменный пистолет, болт-пистолет, силовое оружие'),
    opt('lieutenantBolter', 'Мастерский болтер, болт-пистолет, керамитовые кулаки'),
    opt('lieutenantVolkite', 'Нео-волкитный пистолет и силовое оружие'),
    opt('lieutenantShield', 'Нео-волкит, силовое оружие и штормовой щит (4+ непробиваемый)'),
    opt('lieutenantFist', 'Плазменный пистолет и силовой кулак'),
  ),
  intercessors: {
    leader: [
      opt('intercessorSergeant', 'Сержант: нож и кулаки'),
      opt('intercessorSergeantChainsword', 'Сержант: цепной меч'),
      opt('intercessorSergeantFist', 'Сержант: силовой кулак'),
      opt('intercessorSergeantWeapon', 'Сержант: силовое оружие'),
      opt('intercessorSergeantHammer', 'Сержант: громовой молот'),
    ],
    base: opt('intercessor', 'Болтерная винтовка'),
    groups: [{ id: 'gl', label: 'Гранатомёт — один на каждые 5 моделей', variants: [opt('intercessorGL', 'Подствольный гранатомёт')], max: per(5) }],
  },
  assaultIntercessors: {
    leader: [
      opt('assaultSergeant', 'Сержант: пистолет и цепной меч'),
      opt('assaultSergeantHammer', 'Сержант: громовой молот'),
      opt('assaultSergeantFist', 'Сержант: силовой кулак'),
      opt('assaultSergeantWeapon', 'Сержант: силовое оружие'),
      opt('assaultSergeantPlasma', 'Сержант: плазменный пистолет'),
      opt('assaultSergeantFlamer', 'Сержант: ручной огнемёт'),
    ],
    base: opt('assaultIntercessor', 'Тяжёлый болт-пистолет и цепной меч'),
    groups: [],
  },
  hellblasters: {
    leader: [opt('hellblasterSergeant', 'Сержант: болт-пистолет'), opt('hellblasterSergeantPlasma', 'Сержант: плазменный пистолет')],
    base: opt('hellblaster', 'Плазменный испепелитель'),
    groups: [],
  },
  bladeguard: {
    leader: [
      opt('bladeguardSergeant', 'Сержант: тяжёлый болт-пистолет'),
      opt('bladeguardSergeantVolkite', 'Сержант: нео-волкитный пистолет'),
      opt('bladeguardSergeantPlasma', 'Сержант: плазменный пистолет'),
    ],
    base: opt('bladeguardVeteran', 'Тяжёлый болт-пистолет и мастерский меч'),
    groups: [],
  },
  redemptor: single(
    opt('redemptor', 'Макроплазма, тяжёлый огнемёт, «Фрагшторм»'),
    opt('redemptorGatlingFlamer', 'Тяжёлая гатлинг-пушка, тяжёлый огнемёт, «Фрагшторм»'),
    opt('redemptorGatlings', 'Тяжёлая и обычная гатлинг-пушки, штормболтеры'),
    opt('redemptorPlasmaGatling', 'Макроплазма, гатлинг-пушка, «Фрагшторм»'),
    opt('redemptorPlasmaBolters', 'Макроплазма, тяжёлый огнемёт, штормболтеры'),
    opt('redemptorIcarus', 'Макроплазма, гатлинг-пушка, штормболтеры и «Икар»'),
  ),
  // ---- Orks
  warboss: single(
    opt('warboss', 'Кастом-шута и кастом-тесак'),
    opt('warbossKlaw', 'Кастом-шута и силовая клешня'),
    opt('warbossRokkit', 'Комби-рокетница и кастом-тесак'),
    opt('warbossSkorcha', 'Комби-скорча и кастом-тесак'),
    opt('warbossRokkitKlaw', 'Комби-рокетница и силовая клешня'),
    opt('warbossSkorchaKlaw', 'Комби-скорча и силовая клешня'),
  ),
  boyz: {
    leader: [
      opt('nob', 'Ноб: большой тесак'),
      opt('nobChoppaSkorcha', 'Ноб: кастом-тесак и комби-скорча'),
      opt('nobKlawSkorcha', 'Ноб: силовая клешня и комби-скорча'),
      opt('nobChoppaShoota', 'Ноб: кастом-тесак и кастом-шута'),
      opt('nobKlawRokkit', 'Ноб: силовая клешня и комби-рокетница'),
    ],
    base: opt('boy', 'Шута, слагга и тесак'),
    groups: [
      { id: 'bigShoota', label: 'Большая шута — одна на каждые 10 моделей', variants: [opt('boyBigShoota', 'Большая шута')], max: per(10) },
      { id: 'rokkit', label: 'Рокетница — одна на каждые 10 моделей', variants: [opt('boyRokkit', 'Рокетница')], max: per(10) },
      { id: 'burna', label: 'Бурна — одна на каждые 10 моделей', variants: [opt('boyBurna', 'Бурна')], max: per(10) },
    ],
  },
  nobz: {
    base: opt('nobzNob', 'Кастом-шута и кастом-крумпа'),
    groups: [
      { id: 'skorcha', label: 'Большая скорча — одна на каждые 5 моделей', variants: [opt('nobzSkorcha', 'Большая скорча и кастом-тесак')], max: per(5) },
      { id: 'bigShoota', label: 'Кастом-большая шута — одна на каждые 5 моделей', variants: [opt('nobzBigShoota', 'Кастом-большая шута и кастом-тесак')], max: per(5) },
      { id: 'bigChoppa', label: 'Большой тесак — один на каждые 5 моделей', variants: [opt('nobzBigChoppa', 'Большой тесак')], max: per(5) },
      { id: 'rokkit', label: 'Комби-рокетница — любое число моделей', variants: [opt('nobzRokkit', 'Комби-рокетница и кастом-крумпа')], max: any },
    ],
  },
  kommandos: {
    leader: [opt('kommandoNob', 'Ноб: слагга и тесак'), opt('kommandoNobBigChoppa', 'Ноб: большой тесак'), opt('kommandoNobKlaw', 'Ноб: силовая клешня')],
    base: opt('kommando', 'Слагга и тесак'),
    groups: [
      { id: 'burna', label: 'Бурна — одна модель', variants: [opt('kommandoBurna', 'Бурна')], max: one },
      { id: 'rokkit', label: 'Рокетница — одна модель', variants: [opt('kommandoRokkit', 'Рокетница')], max: one },
      { id: 'ram', label: 'Таран-бреча — одна модель', variants: [opt('kommandoRam', 'Таран-бреча')], max: one },
      { id: 'shoota', label: 'Кастом-шута — до двух моделей', variants: [opt('kommandoShoota', 'Кастом-шута')], max: () => 2 },
    ],
  },
  deffDread: single(
    opt('deffDread', 'Большая шута и скорча'),
    opt('deffDreadKlaws', 'Две лишние клешни'),
    opt('deffDreadBlastas', 'Две кастом-мега-бласты'),
    opt('deffDreadRokkits', 'Две рокетницы'),
    opt('deffDreadShootaBlasta', 'Большая шута и мега-бласта'),
    opt('deffDreadKlawSkorcha', 'Лишняя клешня и скорча'),
  ),
  // ---- Tyranids
  hiveTyrant: single(
    opt('hiveTyrant', 'Костяной меч с хлыстом и когти-серпы'),
    opt('hiveTyrantVenom', 'Костяной меч и тяжёлая ядовитая пушка'),
    opt('hiveTyrantStranglethorn', 'Костяной меч и пушка-душитель'),
    opt('hiveTyrantVenomTalons', 'Тяжёлая ядовитая пушка и когти-серпы'),
    opt('hiveTyrantStranglethornTalons', 'Пушка-душитель и когти-серпы'),
    opt('hiveTyrantTalons', 'Две пары когтей-серпов'),
  ),
  tyranidWarriors: {
    leader: [opt('tyranidPrime', 'Прайм: пожиратель')],
    base: opt('tyranidWarrior', 'Пожиратель'),
    groups: [
      { id: 'light', label: 'Смертоплюй или шипокулаки — любое число моделей', variants: [opt('tyranidWarriorDeathspitter', 'Смертоплюй'), opt('tyranidWarriorSpinefists', 'Шипокулаки')], max: any },
      { id: 'venom', label: 'Ядовитая пушка — одна на каждые 3 модели', variants: [opt('tyranidWarriorVenom', 'Ядовитая пушка')], max: per(3) },
      { id: 'strangler', label: 'Колючий душитель — один на каждые 3 модели', variants: [opt('tyranidWarriorStrangler', 'Колючий душитель')], max: per(3) },
    ],
  },
  termagants: {
    base: opt('termagant', 'Плотеед'),
    groups: [
      { id: 'all', label: 'Пожиратели или шипокулаки — любое число моделей', variants: [opt('termagantDevourerModel', 'Пожиратель'), opt('termagantSpinefistsModel', 'Шипокулаки')], max: any },
      { id: 'shard', label: 'Осколочная пушка — одна на каждые 10 моделей', variants: [opt('termagantShard', 'Осколочная пушка')], max: per(10) },
      { id: 'spike', label: 'Шипомёт — один на каждые 10 моделей', variants: [opt('termagantSpike', 'Шипомёт')], max: per(10) },
      { id: 'web', label: 'Паутинная плеть — одна на каждые 10 моделей', variants: [opt('termagantWeb', 'Паутинная плеть')], max: per(10) },
    ],
  },
  carnifexes: {
    base: opt('carnifex', 'Когти-серпы и вторые когти'),
    groups: [
      {
        id: 'arms', label: 'Вооружение — любое число моделей',
        variants: [
          opt('carnifexVenom', 'Тяжёлая ядовитая пушка'),
          opt('carnifexStranglethorn', 'Пушка-душитель'),
          opt('carnifexCrushing', 'Сокрушающие клешни'),
          opt('carnifexDevourers', 'Пожиратели с мозговыми червями'),
          opt('carnifexBioPlasma', 'Когти, биоплазма и шипованные гребни'),
        ],
        max: any,
      },
    ],
  },
  // ---- Necrons
  overlord: single(
    opt('overlord', 'Тахионная стрела и клинок Оверлорда'),
    opt('overlordStaff', 'Жезл света'),
    opt('overlordVoidscythe', 'Коса пустоты'),
  ),
  necronWarriors: {
    base: opt('necronWarrior', 'Гаусс-сдиратель'),
    groups: [{ id: 'reaper', label: 'Гаусс-жнец — любое число моделей', variants: [opt('necronWarriorReaper', 'Гаусс-жнец')], max: any }],
  },
  immortals: {
    base: opt('immortal', 'Гаусс-бластер'),
    groups: [{ id: 'tesla', label: 'Тесла-карабин — любое число моделей', variants: [opt('immortalTesla', 'Тесла-карабин')], max: any }],
  },
  lychguard: {
    base: opt('lychguard', 'Боевая коса'),
    groups: [{ id: 'shield', label: 'Гиперфазовый меч и щит рассеивания — любое число моделей', variants: [opt('lychguardShield', 'Меч и щит (4+ непробиваемый)')], max: any }],
  },
  canoptekWraiths: {
    base: opt('canoptekWraith', 'Злобные когти'),
    groups: [
      {
        id: 'arms', label: 'Вооружение — любое число моделей',
        variants: [
          opt('wraithCaster', 'Излучатель частиц'),
          opt('wraithBeamer', 'Трансмерный луч'),
          opt('wraithCoils', 'Плети-кольца'),
          opt('wraithCasterCoils', 'Излучатель и плети'),
          opt('wraithBeamerCoils', 'Луч и плети'),
        ],
        max: any,
      },
    ],
  },
  // ---- Aeldari
  farseer: single(opt('farseer', 'Ведьмин клинок'), opt('farseerSpear', 'Поющее копьё')),
  autarch: single(
    opt('autarch', 'Сюрикеновый пистолет и звёздная глефа'),
    opt('autarchFusionGun', 'Термоган драконов и глефа'),
    opt('autarchReaper', 'Жнец-ракетомёт и глефа'),
    opt('autarchSpinner', 'Смертепряд и глефа'),
    opt('autarchBanshee', 'Пистолет и клинок банши'),
    opt('autarchScorpion', 'Пистолет и цепной меч скорпионов'),
  ),
  guardianDefenders: {
    base: opt('guardian', 'Сюрикеновый катапульт'),
    groups: [
      {
        id: 'platform', label: 'Платформа тяжёлого оружия — ровно одна',
        variants: [
          opt('platformCannon', 'Сюрикеновая пушка'),
          opt('heavyPlatform', 'Ракетомёт'),
          opt('platformLance', 'Яркая пика'),
          opt('platformScatter', 'Лазер-рассеиватель'),
          opt('platformStarcannon', 'Звёздная пушка'),
        ],
        max: one,
        min: 1,
      },
    ],
  },
  direAvengers: {
    leader: [
      opt('exarch', 'Экзарх: пистолет и грозный меч'),
      opt('exarchCatapult', 'Экзарх: катапульт мстителя'),
      opt('exarchTwinCatapults', 'Экзарх: два катапульта'),
      opt('exarchGlaive', 'Экзарх: пистолет и силовая глефа'),
      opt('exarchShield', 'Экзарх: меч и мерцающий щит (4+ непробиваемый)'),
    ],
    base: opt('direAvenger', 'Катапульт мстителя'),
    groups: [],
  },
  swoopingHawks: {
    leader: [
      opt('hawkExarch', 'Экзарх: коготь ястреба'),
      opt('hawkExarchLasblaster', 'Экзарх: лазбластер экзарха'),
      opt('hawkExarchSunpistol', 'Экзарх: солнечный пистолет и силовой меч'),
      opt('hawkExarchScatter', 'Экзарх: лазер-рассеиватель'),
    ],
    base: opt('swoopingHawk', 'Лазбластер'),
    groups: [],
  },
  wraithguard: {
    base: opt('wraithguard', 'Призрачная пушка'),
    groups: [{ id: 'scythe', label: 'Д-коса — любое число моделей', variants: [opt('wraithguardScythe', 'Д-коса')], max: any }],
  },
  windriders: {
    base: opt('windrider', 'Спаренный сюрикеновый катапульт'),
    groups: [{ id: 'heavy', label: 'Тяжёлое оружие — любое число моделей', variants: [opt('windriderLaser', 'Лазер-рассеиватель'), opt('windriderCannon', 'Сюрикеновая пушка')], max: any }],
  },
}
