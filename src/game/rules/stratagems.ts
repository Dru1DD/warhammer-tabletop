import { DATASHEETS } from '../data/datasheets'
import { alive, datasheetOf, isDestroyed, unitDistance } from '../gameState'
import type { GameState, Phase, PlayerId, ReactionWindow, StratagemId, UnitState } from '../types'

// Core Stratagems of the 11th edition that a player uses in their own turn (stage 1: no reactions in the opponent's
// turn yet). Each costs Command points (CP). A battle-shocked unit cannot be targeted by Stratagems (core rules
// 01.07), a unit can be targeted by one Stratagem per phase, and each Stratagem is used once per phase. Validation and
// effects live in the engine (validate / apply, command type 'stratagem'); this module holds the data and shared checks.

export interface StratagemInfo {
  id: StratagemId
  name: string
  nameEn: string
  cost: number
  phases: Phase[]
  /** what it does, in plain words */
  text: string
  /** when it pays off, for beginners */
  when: string
  /** the unit it targets must match: at least one group, every keyword of that group (datasheet keywords) */
  requires?: Requirement
  /** only this army has it (faction / detachment Stratagems); absent = every army */
  faction?: PlayerId
  /** whose turn: your own (default), either player's while it is your decision (selecting a unit to fight), or the
   * opponent's — a reaction, offered in a reaction window */
  turn?: 'own' | 'either' | 'opponent'
  /** for reactions: the window it is offered in */
  window?: ReactionWindow
  /** a lasting effect on the unit: until the end of the phase or of the turn (read by the engine's attack/move rules) */
  buff?: 'phase' | 'turn'
}

export interface Requirement {
  /** alternatives: [['EXPLOSIVES'], ['GRENADES']] = EXPLOSIVES or GRENADES; [['INFANTRY', 'SKITARII']] = both */
  any: string[][]
  /** for the player: «отряд с EXPLOSIVES или GRENADES» */
  label: string
}

const matchesKeywords = (keywords: string[], r: Requirement) => r.any.some((group) => group.every((k) => keywords.includes(k)))

/** The unit fits the Stratagem's unit requirement (or the Stratagem has none). */
export const meetsRequirement = (u: UnitState, info: StratagemInfo) => !info.requires || matchesKeywords(datasheetOf(u).keywords, info.requires)

export interface Availability {
  info: StratagemInfo
  available: boolean
  /** why not, for the army screen: «нет отряда с EXPLOSIVES или GRENADES» */
  why?: string
}

/** Which Stratagems an army can use at all, given its datasheets: core ones plus its own faction's. */
export function stratagemAvailability(faction: PlayerId, datasheetIds: string[]): Availability[] {
  const keywords = datasheetIds.map((id) => DATASHEETS[id]?.keywords ?? [])
  return Object.values(STRATAGEMS)
    .filter((info) => !info.faction || info.faction === faction)
    .map((info) => {
      const ok = !info.requires || keywords.some((k) => matchesKeywords(k, info.requires!))
      return ok ? { info, available: true } : { info, available: false, why: `нет отряда: нужен ${info.requires!.label}` }
    })
}

export const STRATAGEMS = {
  commandReroll: {
    id: 'commandReroll',
    name: 'Командный переброс',
    nameEn: 'Command Re-roll',
    cost: 1,
    phases: ['movement', 'charge'],
    text: 'Перебросить только что сделанный бросок продвижения (Advance) или бросок атаки (charge, оба кубика) этого отряда. Посреди атаки — один кубик: попадание, ранение, урон, число атак или спасбросок (игра сама спросит, когда это выгодно).',
    when: 'Когда атака сорвалась на 1–3″ или продвижение выпало слишком коротким, а от этого зависит важная цель.',
  },
  insaneBravery: {
    id: 'insaneBravery',
    name: 'Безумная храбрость',
    nameEn: 'Insane Bravery',
    cost: 1,
    phases: ['command'], window: 'beforeShockTests',
    text: 'Перед проверкой боевого шока этого отряда в вашей фазе командования: проверка автоматически пройдена (бросать не нужно). Раз за битву.',
    when: 'Когда проверку предстоит пройти отряду на цели и шанс провала велик: в шоке его OC = 0, и он не удержит цель.',
  },
  explosives: {
    id: 'explosives',
    name: 'Взрывчатка',
    nameEn: 'Explosives',
    cost: 1,
    phases: ['shooting'],
    text: 'Отряд с ключевым словом EXPLOSIVES (или GRENADES) вместо стрельбы бросает 6D6 в видимого врага не дальше 8″, не в контакте: каждая 4+ — смертельная рана.',
    when: 'Когда обычная стрельба отряда даёт меньше ~3 ран, например по бронированной цели: смертельные раны проходят сквозь любую броню.',
    requires: { any: [['EXPLOSIVES'], ['GRENADES']], label: 'отряд с EXPLOSIVES или GRENADES' },
  },
  crushingImpact: {
    id: 'crushingImpact',
    name: 'Сокрушительный удар',
    nameEn: 'Crushing Impact',
    cost: 1,
    phases: ['charge'],
    text: 'Монстр или техника после атаки (charge) бросает столько D6, какова её Стойкость: каждая 5+ — смертельная рана врагу в контакте, каждая 1 — своему отряду (не больше 6 каждому).',
    when: 'Почти всегда, когда ваш монстр или техника врезались во врага и есть CP: в среднем треть кубиков ранит врага.',
    requires: { any: [['MONSTER'], ['VEHICLE']], label: 'монстр или техника (MONSTER, VEHICLE)' },
  },
} as Record<StratagemId, StratagemInfo>

export const EXPLOSIVES_RANGE = 8
export const EXPLOSIVES_DICE = 6
/** Crushing Impact: at most this many mortal wounds per unit (the enemy's and your own) */
export const CRUSHING_MAX = 6

export const hasExplosives = (u: UnitState) => meetsRequirement(u, STRATAGEMS.explosives)

/** Used this phase by this player (each Stratagem once per phase). */
export const usedThisPhase = (s: GameState, p: PlayerId, id: StratagemId) => (s.players[p].stratagemsThisPhase ?? []).includes(id)

/** The unit was already the target of a Stratagem this phase (one per unit per phase). */
export const targetedThisPhase = (s: GameState, u: UnitState) => (s.players[u.owner].stratagemUnitsThisPhase ?? []).includes(u.id)

/** Explosives reach: an enemy unit within 8″ (visibility is checked by the engine). */
export const explosivesReach = (u: UnitState, e: UnitState) => !isDestroyed(e) && alive(e).length > 0 && unitDistance(u, e) <= EXPLOSIVES_RANGE + 1e-9

// ---------------------------------------------------------------- army (detachment) Stratagems

/** The detachment each army plays here: the generic one of its 11th edition faction page (Wahapedia). */
export const DETACHMENT: Record<PlayerId, string> = {
  marines: 'Gladius Task Force',
  orks: 'War Horde',
  tyranids: 'Invasion Fleet',
  necrons: 'Awakened Dynasty',
  aeldari: 'Warhost',
  adeptus_mechanicus: 'Rad-Zone Corps',
}

export const FACTION_STRATAGEMS: StratagemInfo[] = [
  {
    id: 'stormOfDevastation', faction: 'marines', name: 'Опустошительный шторм', nameEn: 'Storm of Devastation', cost: 1, phases: ['shooting'], buff: 'phase',
    text: 'Отряд, который ещё не стрелял: до конца фазы его стрелковое оружие игнорирует укрытие (Ignores Cover).',
    when: 'Когда цель сидит в руинах или воронке: укрытие ухудшает ваш навык стрельбы на 1.',
  },
  {
    id: 'closeRangeDakka', faction: 'orks', name: 'Дакка в упор', nameEn: 'Close-Range Dakka', cost: 1, phases: ['shooting'], buff: 'phase',
    text: 'Отряд, который ещё не стрелял: до конца фазы его стрелковое оружие получает Rapid Fire 1 (или +1 к имеющемуся) — лишняя атака на половине дальности.',
    when: 'Когда большой отряд Бойз стоит на половине дальности своих пушек от цели.',
  },
  {
    id: 'fungusFuelInjection', faction: 'orks', name: 'Грибное топливо', nameEn: 'Fungus-Fuel Injection', cost: 1, phases: ['movement'], buff: 'phase',
    text: 'Техника или наездники (VEHICLE, MOUNTED), ещё не двигавшиеся: +2″ к движению в этой фазе.',
    when: 'Когда Дэфф-дреду не хватает пары дюймов до цели или до дистанции атаки.',
    requires: { any: [['VEHICLE'], ['MOUNTED']], label: 'техника или наездники (VEHICLE, MOUNTED)' },
  },
  {
    id: 'hitEmHarder', faction: 'orks', name: 'Бей сильнее!', nameEn: "Hit 'Em Harder", cost: 1, phases: ['fight'], turn: 'either', buff: 'phase',
    text: 'Отряд, который сейчас будет сражаться: его оружие ближнего боя получает Lethal Hits — шестёрка на попадание сразу ранит.',
    when: 'Против крепких целей (техника, монстры, тяжёлая пехота), где обычные ранения проходят плохо.',
  },
  {
    id: 'adrenalSurge', faction: 'tyranids', name: 'Адреналиновый всплеск', nameEn: 'Adrenal Surge', cost: 2, phases: ['fight'], buff: 'phase',
    text: 'В вашу фазу боя отряд, который ещё не сражался: до конца фазы попадание на 5+ считается критическим (Sustained и Lethal Hits срабатывают чаще). Здесь — один отряд за раз.',
    when: 'Для отряда с Sustained или Lethal Hits, который сейчас ударит по важной цели.',
  },
  {
    id: 'suddenStorm', faction: 'necrons', name: 'Протокол внезапной бури', nameEn: 'Protocol of the Sudden Storm', cost: 1, phases: ['movement'], buff: 'turn',
    text: 'До конца хода стрелковое оружие отряда получает Assault: после продвижения (Advance) он всё равно стреляет из всего оружия.',
    when: 'Когда нужно быстро занять цель и при этом не терять стрельбу.',
  },
  {
    id: 'conqueringTyrant', faction: 'necrons', name: 'Протокол тирана-завоевателя', nameEn: 'Protocol of the Conquering Tyrant', cost: 1, phases: ['shooting'], buff: 'phase',
    text: 'Отряд, который ещё не стрелял: по целям на половине дальности оружия — переброс единиц на попадание, а если отряд ведёт персонаж — переброс любых промахов.',
    when: 'Когда отряд с персонажем стреляет по близкой цели.',
  },
  {
    id: 'hungryVoid', faction: 'necrons', name: 'Протокол голодной пустоты', nameEn: 'Protocol of the Hungry Void', cost: 1, phases: ['fight'], turn: 'either', buff: 'phase',
    text: 'Отряд, который ещё не сражался: +1 к Силе оружия ближнего боя, а если отряд ведёт персонаж — ещё +1 к бронебойности (AP).',
    when: 'Когда Силы не хватает, чтобы ранить цель на 3+ или 2+ (например, против Стойкости 5 и выше).',
  },
  {
    id: 'blitzingFirepower', faction: 'aeldari', name: 'Молниеносный огонь', nameEn: 'Blitzing Firepower', cost: 1, phases: ['shooting'], buff: 'phase',
    text: 'Отряд, который ещё не стрелял: по целям в пределах 12″ его стрелковое оружие получает Sustained Hits 1 (у кого уже есть — крит на 5+).',
    when: 'Когда отряд с большим числом выстрелов стоит в 12″ от цели.',
  },
  {
    id: 'feignedRetreat', faction: 'aeldari', name: 'Ложное отступление', nameEn: 'Feigned Retreat', cost: 1, phases: ['movement'], buff: 'turn',
    text: 'Сразу после отступления (Fall Back): до конца хода отряд может стрелять и объявлять атаку, как будто не отступал.',
    when: 'Когда отряд связан рукопашной, но нужен его огонь: отойти и тут же стрелять.',
  },
  {
    id: 'lethalDosage', faction: 'adeptus_mechanicus', name: 'Смертельная доза', nameEn: 'Lethal Dosage', cost: 1, phases: ['shooting'], buff: 'phase',
    text: 'Отряд, который ещё не стрелял: до конца фазы его стрелковое оружие получает Lethal Hits — шестёрка на попадание сразу ранит.',
    when: 'Против техники и монстров: шестёрки проходят без броска на ранение, где обычно нужны 5+ или 6+.',
  },
  {
    id: 'aggressorImperative', faction: 'adeptus_mechanicus', name: 'Империатив агрессора', nameEn: 'Aggressor Imperative', cost: 1, phases: ['movement'],
    text: 'Отряд Скитариев, ещё не двигавшийся: продвижение (Advance) без броска — сразу +6″.',
    when: 'Когда до цели или укрытия нужно гарантированно дойти, а не надеяться на кубик.',
    requires: { any: [['SKITARII']], label: 'отряд Скитариев (SKITARII)' },
  },
  {
    id: 'extinctionOrder', faction: 'adeptus_mechanicus', name: 'Приказ об истреблении', nameEn: 'Extinction Order', cost: 1, phases: ['command'],
    text: 'Техножрец выбирает цель на поле в пределах 24″: каждый вражеский отряд на этой цели бросает D6 — на 4+ получает смертельную рану и проходит проверку боевого шока.',
    when: 'Когда враг стоит на цели: шок обнуляет его OC, и цель легче забрать.',
    requires: { any: [['TECH-PRIEST']], label: 'Техножрец (TECH-PRIEST)' },
  },
]
for (const x of FACTION_STRATAGEMS) STRATAGEMS[x.id] = x

/** Stratagems of the same detachments that are not playable yet: they are used in the opponent's turn or need rules the
 * game does not have. Listed on the army screen so the player knows what the full detachment has. */
export interface LaterStratagem { faction: PlayerId; name: string; nameEn: string; cost: number; why: string }
export const LATER_STRATAGEMS: LaterStratagem[] = [
  { faction: 'marines', name: 'Мощь ангелов', nameEn: 'Might of Angels', cost: 1, why: 'нужно правило Lance' },
  { faction: 'marines', name: 'Адаптивная стратегия', nameEn: 'Adaptive Strategy', cost: 1, why: 'нужны боевые доктрины' },
  { faction: 'marines', name: 'Ответная тактика', nameEn: 'Responsive Tactics', cost: 1, why: 'нужно движение в ход противника' },
  { faction: 'orks', name: 'Вправить мозги', nameEn: "Breakin' Heads", cost: 1, why: 'нужны присоединённые персонажи' },
  { faction: 'orks', name: 'Косить их!', nameEn: "Mow 'Em Down", cost: 1, why: 'только техника не-WALKER, таких у орков здесь нет' },
  { faction: 'tyranids', name: 'Захлестнуть', nameEn: 'Overrun', cost: 1, why: 'нужен выбор закрепления после боя' },
  { faction: 'tyranids', name: 'Хищный императив', nameEn: 'Predatory Imperative', cost: 1, why: 'нужны гиперадаптации' },
  { faction: 'tyranids', name: 'Бесконечный рой', nameEn: 'Endless Swarm', cost: 1, why: 'нужно возвращение моделей на поле' },
  { faction: 'necrons', name: 'Протокол вечного возвращения', nameEn: 'Protocol of the Eternal Revenant', cost: 1, why: 'срабатывает в момент гибели' },
  { faction: 'necrons', name: 'Протокол мстительных звёзд', nameEn: 'Protocol of the Vengeful Stars', cost: 2, why: 'нужна стрельба в ход противника' },
  { faction: 'aeldari', name: 'Небесное убежище', nameEn: 'Skyborne Sanctuary', cost: 1, why: 'нужен транспорт' },
  { faction: 'aeldari', name: 'Выстрел и отход', nameEn: 'Fire and Fade', cost: 1, why: 'нужно движение после стрельбы' },
  { faction: 'aeldari', name: 'Тоннель Паутины', nameEn: 'Webway Tunnel', cost: 1, why: 'в ход противника, нужны резервы' },
  { faction: 'adeptus_mechanicus', name: 'Предустановленная зачистка', nameEn: 'Pre-Calibrated Purge Solution', cost: 1, why: 'появится позже' },
]

// ---------------------------------------------------------------- reactions (core, 11th edition)

export const REACTION_STRATAGEMS: StratagemInfo[] = [
  {
    id: 'fireOverwatch', name: 'Огонь на опережение', nameEn: 'Fire Overwatch', cost: 1, phases: ['movement'], turn: 'opponent', window: 'beforeShooting',
    text: 'В конце фазы движения противника ваш отряд не в контакте стреляет по видимому врагу в пределах 24″ — попадает только на «6» (Snap Shooting), без перебросов.',
    when: 'Когда у отряда много выстрелов или Torrent-оружие (огнемёты попадают автоматически), а враг подошёл близко.',
  },
  {
    id: 'smokescreen', name: 'Дымовая завеса', nameEn: 'Smokescreen', cost: 1, phases: ['movement'], turn: 'opponent', window: 'beforeShooting', buff: 'turn',
    text: 'В начале фазы стрельбы противника ваш отряд с ключевым словом SMOKE получает укрытие (Benefit of Cover) до конца фазы.',
    when: 'Когда этот отряд под прицелом сильной стрельбы: укрытие ухудшает врагу навык на 1.',
    requires: { any: [['SMOKE']], label: 'отряд с ключевым словом SMOKE' },
  },
  {
    id: 'heroicIntervention', name: 'Героический перехват', nameEn: 'Heroic Intervention (Leap to Defend)', cost: 1, phases: ['charge'], turn: 'opponent', window: 'afterCharges',
    text: 'В конце фазы атаки противника ваш отряд не в контакте в пределах 12″ от врага, который атаковал в эту фазу, бросает 2D6 и врывается к нему в бой (без «Бьёт первым»). Технике можно, только если она персонаж или шагоход.',
    when: 'Когда рядом сильный в рукопашной отряд, а враг только что влетел в ваших стрелков: помогите им в бою.',
  },
  {
    id: 'epicChallenge', name: 'Эпический вызов', nameEn: 'Epic Challenge', cost: 1, phases: ['fight'], turn: 'either', buff: 'phase',
    text: 'Отряд-персонаж, который сейчас будет сражаться: до конца фазы его рукопашные атаки получают Precision — раны можно направить в персонажа врага.',
    when: 'Когда в отряде врага есть персонаж (лидер), которого нужно выбить.',
    requires: { any: [['CHARACTER']], label: 'персонаж (CHARACTER)' },
  },
]
for (const x of REACTION_STRATAGEMS) STRATAGEMS[x.id] = x

// ---------------------------------------------------------------- army (detachment) reactions

/** Used when an enemy unit has selected one of your units as the target of its attacks, before any dice (`onTargeted`),
 * or after its attacks destroyed models of your unit (`afterAttacks`). The unit is the one the window is about. */
export const FACTION_REACTIONS: StratagemInfo[] = [
  {
    id: 'armourOfContempt', faction: 'marines', name: 'Доспех презрения', nameEn: 'Armour of Contempt', cost: 1, phases: ['shooting', 'fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: 'Когда вражеский отряд выбрал целью ваш отряд (в стрельбе противника или в бою): бронебойность (AP) его атак по вам хуже на 1, пока он не закончит атаковать.',
    when: 'Против оружия с AP −1…−2 по пехоте с хорошей бронёй: спасбросок 3+ снова работает.',
  },
  {
    id: 'aWorthyDeath', faction: 'marines', name: 'Достойная смерть', nameEn: 'A Worthy Death', cost: 1, phases: ['fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: 'В бою, когда враг выбрал целью ваш отряд, который ещё не сражался: каждая убитая модель на 4+ успевает ударить. Здесь — сразу после атаки врага, по этому врагу (на столе — вместе со своим отрядом позже в фазе).',
    when: 'Когда по отряду бьёт сильный враг, а у ваших моделей опасное оружие ближнего боя.',
  },
  {
    id: 'orksNeverBeaten', faction: 'orks', name: 'Орков не победить', nameEn: 'Orks Is Never Beaten', cost: 1, phases: ['fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: 'В бою, когда враг выбрал целью ваш отряд (кроме TITANIC), который ещё не сражался: каждая убитая модель на 4+ (на 3+, если отряд разъярён WAAAGH!) успевает ударить. Здесь — сразу после атаки врага, по этому врагу.',
    when: 'Когда большой отряд Бойз вот-вот потеряет много моделей в рукопашной.',
  },
  {
    id: 'rapidRegeneration', faction: 'tyranids', name: 'Быстрая регенерация', nameEn: 'Rapid Regeneration', cost: 1, phases: ['shooting', 'fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: 'Когда враг выбрал целью ваш отряд (в стрельбе противника или в бою): до конца фазы у моделей «Не чувствует боли» 6+ (5+ в зоне Синапса) — каждую потерянную рану можно отменить броском.',
    when: 'Когда по крупному монстру летит много урона: 5+ в Синапсе спасает треть ран.',
  },
  {
    id: 'deathFrenzy', faction: 'tyranids', name: 'Предсмертное неистовство', nameEn: 'Death Frenzy', cost: 1, phases: ['fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: 'В бою, когда враг выбрал целью ваш отряд, который ещё не сражался: каждая убитая модель на 4+ успевает ударить сразу после атаки врага.',
    when: 'Когда по отряду гаунтов или воинов бьёт сильный враг, а ответить они уже не успеют.',
  },
  {
    id: 'lightningFastReactions', faction: 'aeldari', name: 'Молниеносная реакция', nameEn: 'Lightning-Fast Reactions', cost: 1, phases: ['shooting', 'fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: 'Когда враг выбрал целью ваш отряд (не WRAITH CONSTRUCT; в стрельбе противника или в бою): до конца фазы −1 к броскам на попадание по этому отряду.',
    when: 'Против оружия, которое попадает на 3+ или 4+: каждая шестая атака мимо.',
  },
  {
    id: 'balefulHalo', faction: 'adeptus_mechanicus', name: 'Зловещий ореол', nameEn: 'Baleful Halo', cost: 2, phases: ['fight'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: 'В бою, когда враг выбрал целью ваш отряд (не VEHICLE): до конца фазы −1 к броскам на ранение по нему.',
    when: 'Когда по пехоте бьёт сильная рукопашная, которая ранит на 2+ или 3+.',
  },
  {
    id: 'bulwarkImperative', faction: 'adeptus_mechanicus', name: 'Империатив бастиона', nameEn: 'Bulwark Imperative', cost: 2, phases: ['shooting'], turn: 'either', window: 'onTargeted', buff: 'phase',
    text: 'В стрельбе противника, когда враг выбрал целью ваш отряд Скитариев: до конца фазы у моделей непробиваемый спасбросок 4+.',
    when: 'Против бронебойного оружия (AP −2 и лучше): спасбросок 4+ вместо почти никакого.',
    requires: { any: [['SKITARII']], label: 'отряд Скитариев (SKITARII)' },
  },
  {
    id: 'undyingLegions', faction: 'necrons', name: 'Протокол бессмертных легионов', nameEn: 'Protocol of the Undying Legions', cost: 1, phases: ['shooting', 'fight'], turn: 'either', window: 'afterAttacks',
    text: 'После атак врага (в стрельбе противника или в бою), убивших модели вашего отряда: отряд сразу запускает протоколы реанимации — лечит D3 ран (D3+1, если его ведёт персонаж) и возвращает модели.',
    when: 'Когда отряд воинов потерял несколько моделей: в среднем две модели возвращаются в строй.',
  },
]
for (const x of FACTION_REACTIONS) STRATAGEMS[x.id] = x

/** Reactions whose fallen models strike back right after the enemy's attacks (A Worthy Death and its cousins). */
export const LAST_STAND: StratagemId[] = ['aWorthyDeath', 'orksNeverBeaten', 'deathFrenzy']

export const STRATAGEM_IDS = Object.keys(STRATAGEMS) as StratagemId[]

/** Reactions offered in this window. */
export const reactionsIn = (window: ReactionWindow) => Object.values(STRATAGEMS).filter((x) => x.window === window).map((x) => x.id)

/** The unit carries this Stratagem's lasting effect (see `buff`). */
export const hasBuff = (u: UnitState, id: StratagemId) => !!u.phaseBuffs?.includes(id) || !!u.turnBuffs?.includes(id)
