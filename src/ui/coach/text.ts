// Russian text layer of the Post-Battle Tactical Coach (FE5).
//
// Pure, deterministic, dependency-free: a Finding carries only ids and numbers (types.ts rule 2),
// the sentences are produced HERE from `kind` + `metrics` + `refs` + `unitIds`.
// Rules followed by every string below:
//  * counterfactuals are EXPECTED values only: «в среднем», «ожидаемо». Never «вы бы убили».
//  * confidence: exact = stated as a fact, estimate = «по оценке», heuristic = «возможно» (+ a soft
//    «это совет, а не ошибка» for mistake / missed kinds). The hedge sits on the clause with the estimated number;
//    facts (what a unit did, exact wounds, dice) are stated plainly. Heuristic advice is never alarming.
//  * grammar: «рана» is declined by its role (see WoundCase); unit names are quoted and never declined — the
//    generic noun before them is («по отряду «Бойз I»»).
//  * every text is original (no Games Workshop rules text).

import { SCENARIOS } from '../../game/scenarios/scenarios'
import { FACTION_NAME, WEAPONS } from '../../game/data/datasheets'
import { LUCK } from '../../game/coach/config'
import { FINDING_CLASS, METRIC_UNITS } from '../../game/coach/types'
import type {
  Confidence, CoachReport, Finding, FindingKind, FindingTopic, ReportNote, ReportNoteKind, Severity,
} from '../../game/coach/types'
import type { Phase, PlayerId } from '../../game/types'

// ───────────────────────────── number formatting ─────────────────────────────

const NBSP = '\u00A0'

/** Decimal with a Russian comma; at most `digits` fraction digits, trailing zeros dropped. Non-finite → «—». */
export function num(v: number | undefined, digits = 1): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  const raw = v.toFixed(digits)
  const s = raw.includes('.') ? raw.replace(/\.?0+$/, '') : raw
  return (s === '-0' ? '0' : s).replace('.', ',').replace('-', '−')
}

/** Russian plural: 1 ран**а**, 2 ран**ы**, 5 ран; fractions take the «few» (genitive singular) form. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (!Number.isInteger(n)) return few
  const a = Math.abs(n)
  const t = a % 100
  const o = a % 10
  if (t >= 11 && t <= 14) return many
  if (o === 1) return one
  if (o >= 2 && o <= 4) return few
  return many
}

const percent = (p: number | undefined): string => {
  if (p === undefined || !Number.isFinite(p)) return '—'
  const r = Math.round(p * 100)
  return p > 0 && r === 0 ? `меньше 1${NBSP}%` : `${r}${NBSP}%`
}

/** The value as displayed with `digits` fraction digits, so the plural agrees with the printed number. */
const shown = (v: number, digits = 1): number => Number(v.toFixed(digits))

/** Grammatical case of the noun «рана»: nominative, accusative («потеряли 1 рану»), genitive («вместо 2 ран»). */
export type WoundCase = 'nom' | 'acc' | 'gen'

const WOUND_FORMS: Record<WoundCase, readonly [string, string, string]> = {
  nom: ['рана', 'раны', 'ран'],
  acc: ['рану', 'раны', 'ран'],
  gen: ['раны', 'ран', 'ран'],
}

/** «5 ран», «1 рану»; the plural form follows the PRINTED (rounded) number, any fraction takes «раны». */
export const woundsText = (v: number | undefined, wcase: WoundCase = 'nom'): string => {
  if (v === undefined || !Number.isFinite(v)) return '—'
  const r = shown(v)
  const forms = WOUND_FORMS[wcase]
  return `${num(v)}${NBSP}${Number.isInteger(r) ? plural(r, ...forms) : 'раны'}`
}
export const vpText = (v: number | undefined): string =>
  v === undefined || !Number.isFinite(v) ? '—' : `${num(v, 0)}${NBSP}ПО`
const inchesText = (v: number | undefined): string => (v === undefined || !Number.isFinite(v) ? '—' : `${num(v)}″`)
const countText = (v: number | undefined, one: string, few: string, many: string): string =>
  v === undefined || !Number.isFinite(v) ? '—' : `${num(v, 0)}${NBSP}${plural(shown(v, 0), one, few, many)}`

/** Formats ONE metric by the unit declared in METRIC_UNITS (the contract's single source of units). */
export function formatMetric(key: string, value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  switch (METRIC_UNITS[key]) {
    case 'wounds': return woundsText(value)
    case 'probability':
    case 'share': return percent(value)
    case 'inches': return inchesText(value)
    case 'vp': return vpText(value)
    case 'ratio': return `${num(value)}×`
    case 'index': {
      const t = num(value, 2)
      return value > 0 && t !== '0' ? `+${t}` : t
    }
    case 'oc': return `${num(value, 0)}${NBSP}OC`
    case 'flag': return value ? 'да' : 'нет'
    case 'count':
    default: return num(value, 0)
  }
}

const lowerFirst = (s: string): string => (/^[А-ЯЁ][а-яё]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)
const upperFirst = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

// ───────────────────────────── names ─────────────────────────────

/** Resolves ids from a Finding to display names. Never throws, never returns an empty string. */
export interface Names {
  /** A unit of the human (`unitIds`). */
  own(id: string | undefined): string
  /** An enemy unit (refs). */
  enemy(id: string | undefined): string
  weapon(id: string | undefined): string
  /** Name of the weapon profile; falls back to «режим N». */
  profile(weaponId: string | undefined, index: string | undefined): string
  objective(id: string | undefined): string
  terrain(id: string | undefined): string
}

/** «Болтерная винтовка (Bolt Rifle)» → «Болтерная винтовка». */
const stripLatin = (s: string): string => s.replace(/\s*\([^)]*\)\s*$/, '').trim()
/** «Имя»; guillemets inside the name become „…“ so «Дредноут «Редемптор»» does not nest. */
const quoted = (s: string): string => `«${s.replace(/«/g, '„').replace(/»/g, '“')}»`

function lookupTables(scenarioId: string) {
  const sc = SCENARIOS.find((s) => s.id === scenarioId)
  const units = new Map<string, string>()
  const terrain = new Map<string, string>()
  if (sc) {
    const state = sc.build()
    for (const u of state.units) units.set(u.id, u.name)
    for (const t of state.terrain) terrain.set(t.id, t.name)
  }
  return { units, terrain }
}

const tableCache = new Map<string, ReturnType<typeof lookupTables>>()

/** Names for a scenario (unit / terrain names come from the scenario definition; unknown ids degrade gracefully). */
export function namesFor(scenarioId: string): Names {
  let t = tableCache.get(scenarioId)
  if (!t) tableCache.set(scenarioId, (t = lookupTables(scenarioId)))
  const tables = t
  return {
    own: (id) => (id ? quoted(tables.units.get(id) ?? id) : 'ваш отряд'),
    enemy: (id) => (id ? quoted(tables.units.get(id) ?? id) : 'отряд противника'),
    weapon: (id) => (id ? stripLatin(WEAPONS[id]?.name ?? id) : 'оружие'),
    profile: (weaponId, index) => {
      const i = Number(index)
      const name = weaponId && Number.isInteger(i) ? WEAPONS[weaponId]?.profiles[i]?.name : undefined
      if (name) return stripLatin(name)
      return Number.isInteger(i) ? `режим ${i + 1}` : 'режим'
    },
    objective: (id) => {
      const m = id ? /^o(\d+)$/.exec(id) : null
      return m ? `цель №${m[1]}` : 'цель'
    },
    terrain: (id) => (id ? quoted(tables.terrain.get(id) ?? id) : 'местность'),
  }
}

// ───────────────────────────── labels ─────────────────────────────

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Критично',
  major: 'Важно',
  minor: 'Заметно',
  info: 'К сведению',
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  exact: 'Факт',
  estimate: 'Оценка',
  heuristic: 'Совет',
}

export const CONFIDENCE_HINT: Record<Confidence, string> = {
  exact: 'Точно: так было в игре, либо вероятность посчитана по правилам движка.',
  estimate: 'Оценка: приближённая модель (например, без учёта хода противника).',
  heuristic: 'Совет: общее соображение о стиле игры, а не ошибка.',
}

export const PHASE_LABEL: Record<Phase, string> = {
  command: 'командование',
  movement: 'движение',
  shooting: 'стрельба',
  charge: 'атака',
  fight: 'бой',
}

export const TOPIC_LABEL: Record<FindingTopic, string> = {
  headline: 'Итог',
  luck: 'Удача',
  shooting: 'Стрельба',
  movement: 'Движение и бой',
}

export type SectionId = 'plan' | 'mistakes' | 'missed' | 'luck' | 'shooting' | 'movement' | 'positives' | 'timeline'

export const SECTION_TEXT: Record<SectionId, { title: string; hint: string; empty: string }> = {
  plan: {
    title: 'План на следующий бой',
    hint: 'Три темы, над которыми стоит поработать в первую очередь.',
    empty: 'Явных тем для тренировки нет — играйте в том же духе.',
  },
  mistakes: {
    title: 'Что можно улучшить',
    hint: 'Решения, где другой выбор давал в среднем больше пользы.',
    empty: 'Заметных ошибок не найдено.',
  },
  missed: {
    title: 'Упущенные возможности',
    hint: 'Хорошие варианты, которыми вы не воспользовались.',
    empty: 'Упущенных возможностей не найдено.',
  },
  luck: {
    title: 'Удача на кубиках',
    hint: 'Кубики нельзя пересыпать: этот раздел объясняет, что в результате — случай, а не решение.',
    empty: 'Для такой короткой партии оценка удачи не показывается — данных слишком мало.',
  },
  shooting: {
    title: 'Стрельба: ещё наблюдения',
    hint: 'Остальные замечания по стрельбе.',
    empty: 'Других замечаний по стрельбе нет.',
  },
  movement: {
    title: 'Движение, атаки и цели: ещё наблюдения',
    hint: 'Остальные замечания по движению, атакам и целям.',
    empty: 'Других замечаний по движению и атакам нет.',
  },
  positives: {
    title: 'Что получилось хорошо',
    hint: 'Решения, которые стоит повторять.',
    empty: 'В этой партии хорошие моменты не выделены — данных слишком мало.',
  },
  timeline: {
    title: 'Ход битвы по раундам',
    hint: 'ПО и урон обеих сторон в каждом раунде.',
    empty: 'Нет данных по раундам.',
  },
}

export const BADGE_PREFIX = {
  round: 'Раунд',
  frame: 'Показать момент',
  fix: 'Что делать',
  where: 'Где это было',
} as const

// ───────────────────────────── per-kind text ─────────────────────────────

export interface FindingText {
  title: string
  /** What happened, with numbers. Already hedged for the finding's confidence. */
  explanation: string
  /** What to do about it. */
  fix: string
}

type Composer = (f: Finding, n: Names, h: (s: string) => string) => FindingText

type UnitCase = 'nom' | 'gen' | 'dat' | 'acc'
const UNIT_NOUN: Record<UnitCase, string> = { nom: 'отряд', gen: 'отряда', dat: 'отряду', acc: 'отряд' }
const OWN_FALLBACK: Record<UnitCase, string> = { nom: 'ваш отряд', gen: 'вашего отряда', dat: 'вашему отряду', acc: 'ваш отряд' }
const ENEMY_FALLBACK: Record<UnitCase, string> = { nom: 'отряд противника', gen: 'отряда противника', dat: 'отряду противника', acc: 'отряд противника' }

/** «отряд «Имя»» in the requested case: the generic noun is declined, the quoted name never is. */
const ownU = (n: Names, id: string | undefined, c: UnitCase = 'nom'): string => (id ? `${UNIT_NOUN[c]} ${n.own(id)}` : OWN_FALLBACK[c])
const enemyU = (n: Names, id: string | undefined, c: UnitCase = 'nom'): string => (id ? `${UNIT_NOUN[c]} ${n.enemy(id)}` : ENEMY_FALLBACK[c])

const metric = (f: Finding, key: string): number | undefined => f.metrics[key]
const w = (f: Finding, key: string, c: WoundCase = 'nom'): string => woundsText(metric(f, key), c)
const p = (f: Finding, key: string): string => formatMetric(key, metric(f, key))
const ref = (f: Finding, key: string): string | undefined => f.refs?.[key]
const me = (f: Finding, n: Names, c: UnitCase = 'nom'): string => ownU(n, f.unitIds[0], c)
const foe = (f: Finding, n: Names, key: string, c: UnitCase = 'nom'): string => enemyU(n, ref(f, key), c)
const via = (n: Names, f: Finding): string => (ref(f, 'weaponId') ? ` (${n.weapon(ref(f, 'weaponId'))})` : '')
const terr = (n: Names, f: Finding): string | undefined => (ref(f, 'terrainId') ? n.terrain(ref(f, 'terrainId')) : undefined)
/** «режим «Имя»» or the numbered fallback («режим 2») without doubling the word. */
const mode = (n: Names, f: Finding, key: string): string => {
  const name = n.profile(ref(f, 'weaponId'), ref(f, key))
  return /^режим( \d+)?$/.test(name) ? name : `режим «${name}»`
}
/** `mode()` without a usable profile index is the bare word «режим» — then say nothing / «другой режим». */
const hasMode = (m: string): boolean => m !== 'режим'

/** «По оценке, …» for estimates, «Возможно, …» for heuristics, the sentence as is for exact findings. */
export function hedge(confidence: Confidence, sentence: string): string {
  if (confidence === 'estimate') return `По оценке, ${lowerFirst(sentence)}`
  if (confidence === 'heuristic') return `Возможно, ${lowerFirst(sentence)}`
  return upperFirst(sentence)
}

/** «в 4 раза», «в 2,4 раза», «в 5 раз». */
const times = (r: number | undefined): string =>
  r === undefined || !Number.isFinite(r) ? '—' : `${num(r)}${NBSP}${plural(shown(r), 'раз', 'раза', 'раз')}`

const luckBand = (index: number | undefined): 'worse' | 'bad' | 'avg' | 'good' | 'better' => {
  const x = index !== undefined && Number.isFinite(index) ? index : 0
  if (x <= -LUCK.NOTABLE_BAND) return 'worse'
  if (x <= -LUCK.AVERAGE_BAND) return 'bad'
  if (x >= LUCK.NOTABLE_BAND) return 'better'
  if (x >= LUCK.AVERAGE_BAND) return 'good'
  return 'avg'
}

const LUCK_TITLE = {
  worse: 'Кубики были сильно не на вашей стороне',
  bad: 'Кубики были не на вашей стороне',
  avg: 'Удача в пределах нормы',
  good: 'Кубики были на вашей стороне',
  better: 'Вам сильно повезло с кубиками',
} as const

const LUCK_VERDICT = {
  worse: 'Результат заметно хуже среднего — это случай, а не ваши решения.',
  bad: 'Результат чуть хуже среднего: часть исхода объясняется кубиками.',
  avg: 'Результат близок к среднему: итог в основном зависел от решений.',
  good: 'Результат чуть лучше среднего: часть успеха — удача.',
  better: 'Результат заметно лучше среднего: не принимайте удачу за мастерство.',
} as const

// Hedging rule: facts (what the unit did, exact dealt wounds, rolled dice) are stated plainly; only the clause
// that carries an estimated / heuristic number goes through `h`.
const COMPOSERS = {
  'result.summary': (f) => ({
    title: 'Итог битвы',
    explanation: `Раундов: ${p(f, 'roundCount')}. Очки: у вас ${vpText(metric(f, 'humanVp'))}, у противника ${vpText(metric(f, 'enemyVp'))}. Вы сняли ${w(f, 'dealtWounds', 'acc')}, потеряли ${w(f, 'takenWounds', 'acc')}.`,
    fix: 'Ниже — главные моменты, которые стоит разобрать, и план на следующий бой.',
  }),

  'loss.attribution': (f, n, h) => {
    const dc = metric(f, 'decisionCount') ?? 0
    const attackers = ref(f, 'enemyUnitId') ? `атаки ${foe(f, n, 'enemyUnitId', 'gen')} и других` : 'атаки противника'
    const t = terr(n, f)
    return {
      title: 'Почему отряд был потерян',
      explanation:
        `${upperFirst(me(f, n))} был уничтожен в ход противника: он потерял ${w(f, 'takenWounds', 'acc')}. ` +
        `${h(`${attackers} должны были снять в среднем примерно ${w(f, 'enemyExpectedWounds', 'acc')}.`)} ` +
        (dc > 0
          ? `В предыдущем своём ходу вы отдали этому отряду ${countText(dc, 'команду', 'команды', 'команд')}.`
          : 'В предыдущем своём ходу этот отряд остался без команд.') +
        (t ? ` Рядом была местность: ${t}.` : ''),
      fix: 'Перед концом хода прикиньте, кто из врагов достанет отряд огнём или атакой. Уведите его за преграду, в укрытие или за пределы их дальности.',
    }
  },

  'objective.swing': (f, n, h) => ({
    title: 'Цель перешла к противнику',
    explanation: `${upperFirst(n.objective(ref(f, 'objectiveId')))} перешла к противнику после ваших ходов в этом раунде. ${h(`это около ${p(f, 'swingVp')} разницы (ваши OC на цели — ${num(metric(f, 'humanOc'), 0)}, у противника — ${num(metric(f, 'enemyOc'), 0)}).`)} Захватил её ${foe(f, n, 'enemyUnitId')}; на исход повлияли ходы ${me(f, n, 'gen')}.`,
    fix: 'Не отпускайте важную цель: оставьте на ней отряд с запасом очков контроля или заранее подтяните поддержку.',
  }),

  'objective.battleShock': (f, n, h) => ({
    title: 'Боевой шок стоил очков',
    explanation: `${upperFirst(me(f, n))} был в состоянии боевого шока (Battle-shock): его OC обнулился (потеряно ${p(f, 'lostOc')}), и ${n.objective(ref(f, 'objectiveId'))} не засчиталась. ${h(`это около ${p(f, 'lostVp')}; у противника на цели было ${p(f, 'enemyOc')}.`)}`,
    fix: 'Сильно поредевший отряд рискует получить боевой шок. Не поручайте такому отряду ключевую цель и держите рядом второй отряд.',
  }),

  'luck.summary': (f, _n, h) => {
    const band = luckBand(metric(f, 'luckIndex'))
    return {
      title: LUCK_TITLE[band],
      explanation:
        `Ваши атаки сняли ${w(f, 'attackDealtWounds', 'acc')}, атаки противника — ${w(f, 'attackTakenWounds', 'acc')}. ` +
        `${h(`в среднем ваши атаки должны были снять ${w(f, 'expectedDealtWounds', 'acc')}, а атаки противника — ${w(f, 'expectedTakenWounds', 'acc')}.`)} ` +
        `Индекс удачи: ${p(f, 'luckIndex')} (от −1 до +1, 0 — средняя удача). ${LUCK_VERDICT[band]}`,
      fix: 'Оценивайте решения по ожидаемому результату, а не по одному броску: удачу нельзя спланировать.',
    }
  },

  'luck.swing': (f, n, h) => {
    const own = metric(f, 'isOwnAttack') === 1
    const actual = metric(f, 'actualWounds') ?? 0
    const expected = metric(f, 'expectedWounds') ?? 0
    const lucky = own ? actual > expected : actual < expected
    const who = own
      ? `Атака ${me(f, n, 'gen')} по ${foe(f, n, 'targetUnitId', 'dat')}${via(n, f)}`
      : `Атака ${foe(f, n, 'enemyUnitId', 'gen')} по ${me(f, n, 'dat')}`
    return {
      title: lucky ? 'Необычно удачный бросок' : 'Необычно неудачный бросок',
      explanation: `${who} сняла ${w(f, 'actualWounds', 'acc')} (атак: ${num(metric(f, 'attackCount'), 0)}). ${h(`в среднем такая атака снимает ${w(f, 'expectedWounds', 'acc')}.`)} Такой или ещё более редкий исход случается примерно в ${p(f, 'tailProbability')} случаев.`,
      fix: 'Это просто кубики. Не меняйте план из-за одного броска — смотрите на ожидаемый результат решения.',
    }
  },

  'shoot.targetChoice': (f, n, h) => ({
    title: 'Другая цель была выгоднее',
    explanation: `${upperFirst(me(f, n))} стрелял по ${foe(f, n, 'targetUnitId', 'dat')}${via(n, f)}. ${h(`в среднем это давало ${w(f, 'chosenExpectedWounds', 'acc')}, а стрельба по ${foe(f, n, 'betterTargetUnitId', 'dat')} давала бы ${w(f, 'bestExpectedWounds', 'acc')} — в ${times(metric(f, 'ratio'))} больше (разница в ${w(f, 'deltaWounds', 'acc')}).`)}`,
    fix: 'Перед выстрелом сравните доступные цели: ищите ту, у которой защита слабее и нет укрытия, а не просто ближайшую.',
  }),

  'shoot.profileChoice': (f, n, h) => {
    const weapon = ref(f, 'weaponId') ? ` оружием «${n.weapon(ref(f, 'weaponId'))}»` : ''
    const chosen = mode(n, f, 'profileIndex')
    const better = mode(n, f, 'betterProfileIndex')
    return {
      title: 'Другой режим оружия был выгоднее',
      explanation: `${upperFirst(me(f, n))} стрелял${weapon}${hasMode(chosen) ? `, ${chosen},` : ''} по ${foe(f, n, 'targetUnitId', 'dat')}. ${h(`в среднем это давало ${w(f, 'chosenExpectedWounds', 'acc')}, а ${hasMode(better) ? better : 'другой режим'} в среднем давал бы ${w(f, 'bestExpectedWounds', 'acc')} (разница в ${w(f, 'deltaWounds', 'acc')}).`)}`,
      fix: 'Выбирая режим, смотрите не только на Силу и AP, но и на число атак: против лёгких целей часто лучше более частый огонь.',
    }
  },

  'shoot.overkill': (f, n, h) => ({
    title: 'Лишний урон ушёл впустую',
    explanation: `По ${foe(f, n, 'targetUnitId', 'dat')} стреляли${via(n, f)}. ${h(`лишний урон составлял в среднем примерно ${w(f, 'wastedWounds', 'acc')} (${p(f, 'wastedShare')} ожидаемого урона): цели нужно было гораздо меньше.`)}`,
    fix: 'Если цель почти добита, отправьте остальное оружие по другому отряду: лишний урон на соседей не переходит.',
  }),

  'shoot.advanceCost': (f, n, h) => ({
    title: 'Продвижение отняло урон',
    explanation: `${upperFirst(me(f, n))} продвинулся (бросок — ${p(f, 'advanceRollInches')}) и мог стрелять по ${foe(f, n, 'targetUnitId', 'dat')} лишь из того оружия, которое это допускает. ${h(`в среднем это давало ${w(f, 'chosenExpectedWounds', 'acc')} вместо ${w(f, 'bestExpectedWounds', 'gen')} при обычном ходе.`)}`,
    fix: 'Продвигайтесь, когда нужно занять цель или добраться до укрытия. Для стрелкового отряда обычный ход чаще даёт больше урона.',
  }),

  'shoot.coverIgnored': (f, n, h) => {
    const t = terr(n, f)
    return {
      title: 'Выстрел по цели в укрытии',
      explanation: `${upperFirst(me(f, n))} стрелял по ${foe(f, n, 'targetUnitId', 'dat')}, который был в укрытии${t ? ` (${t})` : ''}. ${h(`в среднем это давало ${w(f, 'chosenExpectedWounds', 'acc')}, а стрельба по ${foe(f, n, 'betterTargetUnitId', 'dat')} без укрытия давала бы ${w(f, 'bestExpectedWounds', 'acc')}.`)}`,
      fix: 'Укрытие делает цель заметно крепче. При сопоставимой ценности целей выбирайте ту, что стоит на открытом месте.',
    }
  },

  'shoot.hazardLoss': (f, n, h) => {
    const weapon = ref(f, 'weaponId') ? ` оружия «${n.weapon(ref(f, 'weaponId'))}»` : ''
    return {
      title: 'Опасный режим не окупился',
      explanation: `${upperFirst(mode(n, f, 'profileIndex'))}${weapon} у ${me(f, n, 'gen')} рискован для владельца. ${h(`в среднем отряд теряет ${w(f, 'selfExpectedWounds', 'acc')}, а наносит по ${foe(f, n, 'targetUnitId', 'dat')} ${w(f, 'gainExpectedWounds', 'acc')} (в минусе на ${w(f, 'deltaWounds', 'acc')}).`)}`,
      fix: 'Включайте рискованный режим, когда выигрыш в уроне заметно больше ожидаемой потери (например, против крепкой цели). Иначе стреляйте обычным режимом.',
    }
  },

  'shoot.firingPosition': (f, n, h) => {
    const cause = ref(f, 'cause')
    const why =
      cause === 'rapidFire' ? 'отряд стрелял из-за половины дальности, и бонус Rapid Fire не сработал'
      : cause === 'heavy' ? 'отряд двигался, и оружие Heavy потеряло бонус'
      : cause === 'lineOfSight' ? 'после движения пропала линия видимости'
      : 'позиция лишила оружие бонуса'
    const fix =
      cause === 'rapidFire' ? 'Если это безопасно, подойдите на половину дальности оружия Rapid Fire: оно даёт дополнительные атаки.'
      : cause === 'heavy' ? 'Оружие Heavy лучше всего работает у отряда, который не двигался. Решайте заранее: двигаться или стрелять с места.'
      : cause === 'lineOfSight' ? 'Перед движением проверьте, откуда цель видна, и ставьте отряд так, чтобы линия видимости сохранилась.'
      : 'Выбирайте позицию так, чтобы сохранить бонусы оружия и видимость цели.'
    return {
      title: 'Позиция для стрельбы стоила урона',
      explanation: `${upperFirst(me(f, n))} стрелял по ${foe(f, n, 'targetUnitId', 'dat')}${via(n, f)} с расстояния ${p(f, 'distanceInches')}: ${why}. ${h(`в среднем это давало ${w(f, 'chosenExpectedWounds', 'acc')} вместо ${w(f, 'bestExpectedWounds', 'gen')}.`)}`,
      fix,
    }
  },

  'charge.badOdds': (f, n, h) => ({
    title: 'Атака с малым шансом на успех',
    explanation: `${upperFirst(me(f, n))} объявил атаку на ${foe(f, n, 'targetUnitId', 'acc')} с расстояния ${p(f, 'distanceInches')}; выпало ${p(f, 'rollInches')}. ${h(`шанс дойти до цели был около ${p(f, 'chargeProbability')}.`)}`,
    fix: 'Подойдите ближе в фазе движения, чтобы для атаки хватало небольшого броска, либо потратьте ход на стрельбу или занятие цели.',
  }),

  'charge.failedByLuck': (f, n, h) => ({
    title: 'Атака не удалась из-за броска',
    explanation: `${upperFirst(me(f, n))} объявил атаку на ${foe(f, n, 'targetUnitId', 'acc')} с расстояния ${p(f, 'distanceInches')}, а выпало ${p(f, 'rollInches')}. ${h(`шанс дойти был около ${p(f, 'chargeProbability')}.`)} Решение было разумным — это не ошибка.`,
    fix: 'Менять ничего не нужно. Если нужна надёжность, подходите ближе заранее, в фазе движения.',
  }),

  'fight.targetChoice': (f, n, h) => ({
    title: 'В ближнем бою была цель получше',
    explanation: `${upperFirst(me(f, n))} бил по ${foe(f, n, 'targetUnitId', 'dat')}. ${h(`в среднем это давало ${w(f, 'chosenExpectedWounds', 'acc')}, а удар по ${foe(f, n, 'betterTargetUnitId', 'dat')} давал бы ${w(f, 'bestExpectedWounds', 'acc')} — в ${times(metric(f, 'ratio'))} больше.`)}`,
    fix: 'Перед ударом сравните доступные цели в контакте: выбирайте ту, против которой оружие отряда работает лучше.',
  }),

  'move.exposed': (f, n, h) => ({
    title: 'Отряд встал под огонь',
    explanation: `После движения ${me(f, n)} оказался в зоне огня противника (стреляющих отрядов — ${num(metric(f, 'shooterCount'), 0)}; ближайший — в ${p(f, 'distanceInches')}${ref(f, 'enemyUnitId') ? `, это ${foe(f, n, 'enemyUnitId')}` : ''}). ${h(`в среднем они могли снять ${w(f, 'enemyExpectedWounds', 'acc')}.`)} Оценка не учитывает движение противника.`,
    fix: 'Заканчивайте ход так, чтобы между отрядом и стрелками была преграда (руины, контейнер) или чтобы он стоял дальше их дальности.',
  }),

  'move.noCover': (f, n, h) => {
    const t = terr(n, f)
    return {
      title: 'Отряд остался на открытом месте',
      explanation: `${upperFirst(me(f, n))} закончил движение без укрытия, хотя укрытие${t ? ` ${t}` : ''} было в ${p(f, 'distanceInches')}. ${h(`на открытом месте ожидаемые потери — ${w(f, 'chosenExpectedWounds')}, в укрытии — ${w(f, 'bestExpectedWounds')} (разница в ${w(f, 'deltaWounds', 'acc')}).`)}`,
      fix: 'Если путь позволяет, заканчивайте ход в зоне укрытия: пехота там защищена лучше.',
    }
  },

  'move.objectiveNeglect': (f, n, h) => ({
    title: 'Цель осталась без присмотра',
    explanation: `${upperFirst(n.objective(ref(f, 'objectiveId')))} несколько ходов (${num(metric(f, 'turnCount'), 0)}) оставалась без вашего контроля, хотя ${me(f, n)} был в ${p(f, 'distanceInches')} от неё. ${h(`недополучено около ${p(f, 'lostVp')}.`)}`,
    fix: 'Закрепите за каждой целью отряд, который её берёт и держит: очки начисляются в фазе командования за каждую контролируемую цель.',
  }),

  'move.chargeExposure': (f, n, h) => ({
    title: 'Отряд в зоне атаки противника',
    explanation: `${upperFirst(me(f, n))} закончил ход в ${p(f, 'distanceInches')} от ${foe(f, n, 'enemyUnitId', 'gen')}. ${h(`шанс, что тот достанет атакой, около ${p(f, 'chargeProbability')}, а бой оценивается в ${w(f, 'expectedMeleeWounds', 'acc')} (если атака удастся).`)}`,
    fix: 'Держитесь за пределами досягаемости опасных штурмовых отрядов — или подставляйте тех, кому ближний бой не страшен.',
  }),

  'move.fallBackDecision': (f, n, h) => ({
    title: 'Решение об отходе',
    explanation: `Решение ${me(f, n, 'gen')} об отходе от ${foe(f, n, 'enemyUnitId', 'gen')} было спорным. ${h(`при выбранном варианте ожидаемые потери — ${w(f, 'chosenExpectedWounds')}, при другом — ${w(f, 'bestExpectedWounds')} (разница в ${w(f, 'deltaWounds', 'acc')}).`)}`,
    fix: 'Сравнивайте оба варианта — отойти или остаться — по ожидаемым потерям и по тому, чего отряд лишается в этом ходу.',
  }),

  'move.advanceDecision': (f, n, h) => ({
    title: 'Продвижение или обычный ход?',
    explanation: `${upperFirst(me(f, n))} принял решение о продвижении (бросок — ${p(f, 'advanceRollInches')}). ${h(`ожидаемый исход — ${w(f, 'chosenExpectedWounds')}, а при другом выборе — ${w(f, 'bestExpectedWounds')}.`)}`,
    fix: 'Перед продвижением оцените, что важнее в этом ходу — быстрее занять позицию или сохранить полноценную стрельбу.',
  }),

  'missed.shot': (f, n, h) => ({
    title: 'Отряд мог выстрелить',
    explanation: `${upperFirst(me(f, n))} не стрелял, хотя доступных целей было ${num(metric(f, 'targetCount'), 0)}. ${h(`лучший выстрел${via(n, f)} по ${foe(f, n, 'targetUnitId', 'dat')} дал бы в среднем ${w(f, 'bestExpectedWounds', 'acc')}.`)}`,
    fix: 'Перед концом фазы стрельбы пройдитесь по списку отрядов: не остался ли кто-то, у кого есть доступная цель.',
  }),

  'missed.charge': (f, n, h) => ({
    title: 'Упущена атака',
    explanation: `${upperFirst(me(f, n))} не объявлял атаку на ${foe(f, n, 'targetUnitId', 'acc')} (расстояние ${p(f, 'distanceInches')}). ${h(`шанс дойти был около ${p(f, 'chargeProbability')}, а бой при успехе оценивался в ${w(f, 'expectedMeleeWounds', 'acc')}.`)}`,
    fix: 'Если шанс приличный и бой выгоден, стоит попробовать атаку: при неудаче отряд просто остаётся на месте.',
  }),

  'missed.waaagh': (f, n, h) => ({
    title: 'Боевой клич не использован',
    explanation: `Waaagh! доступен один раз за битву и так и не был вызван (своих ходов впереди оставалось: ${num(metric(f, 'unusedTurnCount'), 0)}). К этому времени рядом с противником находился ${me(f, n)}. ${h('стоило подумать о Waaagh! заранее.')}`,
    fix: 'Вызывайте Waaagh! в фазе командования перед решающим наступлением — это единственный раз за битву.',
  }),

  'missed.ammoRunts': (f, n, h) => ({
    title: 'Способность «Гроты-подносчики» не пригодилась',
    explanation: `${upperFirst(me(f, n))} стрелял по ${foe(f, n, 'targetUnitId', 'dat')}${via(n, f)} без «Гротов-подносчиков». ${h(`с ними оружие давало бы в среднем ${w(f, 'bestExpectedWounds', 'acc')} вместо ${w(f, 'chosenExpectedWounds', 'gen')} (выигрыш — ${w(f, 'deltaWounds')}).`)}`,
    fix: 'Перед стрельбой проверяйте способности отряда, которые можно применить, особенно те, что усиливают оружие и работают раз за битву.',
  }),

  'missed.objective': (f, n, h) => ({
    title: 'Цель можно было взять',
    explanation: `${upperFirst(n.objective(ref(f, 'objectiveId')))} была в ${p(f, 'distanceInches')} от ${me(f, n, 'gen')}, но осталась без вашего контроля. ${h(`недополучено около ${p(f, 'lostVp')}.`)}`,
    fix: 'В фазе движения сначала проверьте цели, до которых отряд дотягивается без риска, и поставьте на них хотя бы один отряд.',
  }),

  'good.targetChoice': (f, n, h) => {
    const alt = metric(f, 'alternativeCount')
    const other =
      alt === 1 ? 'другая цель'
      : alt === undefined || !Number.isFinite(alt) ? 'лучшая из других целей'
      : `лучшая из ${num(alt, 0)}${NBSP}${plural(shown(alt, 0), 'другой цели', 'других целей', 'других целей')}`
    return {
      title: 'Удачный выбор цели',
      explanation: `${upperFirst(me(f, n))} стрелял по ${foe(f, n, 'targetUnitId', 'dat')}${via(n, f)}. ${h(`в среднем это давало ${w(f, 'chosenExpectedWounds', 'acc')}, а ${other} дала бы в среднем ${w(f, 'alternativeExpectedWounds', 'acc')}.`)}`,
      fix: 'Так держать: выбирайте цель по ожидаемому урону, а не по расстоянию.',
    }
  },

  'good.objectiveHeld': (f, n) => ({
    title: 'Цель удержана',
    explanation: `${upperFirst(n.objective(ref(f, 'objectiveId')))} была под вашим контролем (ходов: ${num(metric(f, 'turnCount'), 0)}), её держал ${me(f, n)}. Это ${p(f, 'scoredVp')}.`,
    fix: 'Продолжайте оставлять на ключевой цели отряд с запасом очков контроля.',
  }),

  'good.efficiency': (f, _n, h) => ({
    title: 'Урон выше ожидаемого',
    explanation: `Ваши атаки (${num(metric(f, 'attackCount'), 0)}) сняли ${w(f, 'attackDealtWounds', 'acc')}. ${h(`в среднем они должны были снять ${w(f, 'expectedDealtWounds', 'acc')}.`)} Это сочетание разумных решений и удачных бросков.`,
    fix: 'Закрепляйте: продолжайте выбирать лучшие цели и режимы оружия.',
  }),

  'good.cover': (f, n, h) => {
    const t = terr(n, f)
    return {
      title: 'Умное использование укрытия',
      explanation: `${upperFirst(me(f, n))} занял позицию в укрытии${t ? ` ${t}` : ''}. ${h(`в укрытии отряд в среднем теряет ${w(f, 'chosenExpectedWounds', 'acc')}, а на открытом месте терял бы ${w(f, 'alternativeExpectedWounds', 'acc')} (выгода — ${w(f, 'deltaWounds')}).`)}`,
      fix: 'Так держать: заканчивайте ход в укрытии, когда это не мешает задаче.',
    }
  },
} as const satisfies Record<FindingKind, Composer>

const FALLBACK_TEXT: FindingText = {
  title: 'Наблюдение тренера',
  explanation: 'Тренер заметил этот момент, но подробного описания для него пока нет.',
  fix: 'Посмотрите этот момент на доске и сравните его с другими вариантами.',
}

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

/**
 * The full text for ONE finding. Hedging by confidence lives INSIDE each composer (`h` wraps only the clause that
 * carries an estimated number: estimate → «По оценке, …», heuristic → «Возможно, …»); facts stay plain.
 * Here only the advice-style suffix is added: for a heuristic mistake / missed finding — «это совет, а не ошибка»
 * and a soft «если захотите». Other classes (good.*, luck.*, explanations) keep neutral wording.
 * An unknown kind (newer report than this UI) gets a neutral fallback instead of throwing.
 */
export function describeFinding(f: Finding, names: Names): FindingText {
  if (!own(COMPOSERS, f.kind)) return FALLBACK_TEXT
  const compose: Composer = COMPOSERS[f.kind]
  const t = compose(f, names, (s) => hedge(f.confidence, s))
  const cls = FINDING_CLASS[f.kind]
  if (f.confidence !== 'heuristic' || (cls !== 'mistake' && cls !== 'missed')) return t
  return {
    title: t.title,
    explanation: `${t.explanation} Это совет по стилю игры, а не ошибка.`,
    fix: `Если захотите поэкспериментировать: ${lowerFirst(t.fix)}`,
  }
}

// ───────────────────────────── plan ─────────────────────────────

/** Kinds that can appear in `CoachReport.plan` (classes `mistake` and `missed`). */
export type PlanKind = Exclude<FindingKind, `good.${string}` | 'result.summary' | 'luck.summary' | 'luck.swing' | 'charge.failedByLuck'>

export const PLAN_TEXT = {
  'loss.attribution': { title: 'Берегите отряды перед ходом противника', advice: 'В конце хода проверяйте, кто из врагов достанет каждый отряд. Прячьте самые ценные отряды от огня и атак.' },
  'objective.swing': { title: 'Не отдавайте цели', advice: 'Следите за очками контроля на каждой цели. Не уводите отряд с цели, пока рядом нет замены.' },
  'objective.battleShock': { title: 'Берегите отряды на целях от паники', advice: 'Не держите цель одним поредевшим отрядом. Подстраховывайте его вторым.' },
  'shoot.targetChoice': { title: 'Выбирайте цель для стрельбы', advice: 'Перед выстрелом сравните две-три цели: у кого защита слабее, нет укрытия и больше потенциал урона.' },
  'shoot.profileChoice': { title: 'Выбирайте режим оружия', advice: 'У оружия с несколькими режимами сравнивайте число атак, Силу и AP против конкретной цели.' },
  'shoot.overkill': { title: 'Не тратьте урон впустую', advice: 'Почти добитую цель добивайте малым, остальное оружие отправляйте на другие отряды.' },
  'shoot.advanceCost': { title: 'Продвигайтесь осознанно', advice: 'Продвижение стоит стрельбы. Продвигайтесь ради цели или укрытия, а не по привычке.' },
  'shoot.coverIgnored': { title: 'Стреляйте по целям вне укрытия', advice: 'При равной ценности целей выбирайте ту, что стоит на открытом месте.' },
  'shoot.hazardLoss': { title: 'Рискуйте оправданно', advice: 'Рискованный режим оружия включайте, только когда выигрыш в уроне заметно выше ожидаемой потери.' },
  'shoot.firingPosition': { title: 'Ставьте отряд для стрельбы с умом', advice: 'Учитывайте половину дальности для Rapid Fire, ограничения Heavy и линию видимости до выстрела.' },
  'charge.badOdds': { title: 'Считайте шансы атаки', advice: 'Объявляйте атаку, когда для успеха хватает небольшого броска. Иначе подойдите ближе или стреляйте.' },
  'fight.targetChoice': { title: 'Выбирайте цель в ближнем бою', advice: 'В контакте с несколькими отрядами сначала оцените, против кого ваше оружие работает лучше.' },
  'move.exposed': { title: 'Не подставляйтесь под огонь', advice: 'Заканчивайте ход так, чтобы стрелки противника были за преградой или за пределами дальности.' },
  'move.noCover': { title: 'Занимайте укрытия', advice: 'Если путь позволяет, заканчивайте ход в зоне укрытия, особенно пехотой.' },
  'move.objectiveNeglect': { title: 'Не забывайте о целях', advice: 'С 2-го раунда очки идут за каждую контролируемую цель: закрепите за ними отряды.' },
  'move.chargeExposure': { title: 'Следите за зоной атаки врага', advice: 'Не заканчивайте ход там, где опасный штурмовой отряд с хорошим шансом до вас достанет.' },
  'move.fallBackDecision': { title: 'Взвешивайте отход', advice: 'Решая, отходить ли, сравнивайте ожидаемые потери в обоих вариантах.' },
  'move.advanceDecision': { title: 'Взвешивайте продвижение', advice: 'Сравнивайте, что даст продвижение, и что отряд потеряет в этом ходу.' },
  'missed.shot': { title: 'Стреляйте всеми, кто может', advice: 'Перед концом фазы стрельбы проверьте, не остался ли отряд с доступной целью.' },
  'missed.charge': { title: 'Пробуйте хорошие атаки', advice: 'Если шанс приличный и бой выгоден, объявите атаку: при неудаче отряд остаётся на месте.' },
  'missed.waaagh': { title: 'Используйте Боевой клич', advice: 'Вызывайте Waaagh! в фазе командования перед решающим наступлением: он доступен один раз за битву.' },
  'missed.ammoRunts': { title: 'Применяйте способности отряда', advice: 'Перед стрельбой проверяйте способности, усиливающие оружие и работающие раз за битву.' },
  'missed.objective': { title: 'Берите доступные цели', advice: 'В фазе движения сначала смотрите на цели, до которых отряд дотягивается без риска.' },
} as const satisfies Record<PlanKind, { title: string; advice: string }>

const isPlanKind = (k: FindingKind): k is PlanKind => own(PLAN_TEXT, k)

export function planText(kind: FindingKind): { title: string; advice: string } {
  return isPlanKind(kind) ? PLAN_TEXT[kind] : { title: 'Разберите это решение', advice: 'Посмотрите замечания выше и попробуйте сделать иначе.' }
}

// ───────────────────────────── headline & notes ─────────────────────────────

export interface HeadlineText {
  /** «Победа — Космодесант» / «Поражение — победили Орки» / «Ничья» / «Битва не закончена». */
  verdict: string
  /** «Вы играли за: Космодесант · Боевой патруль · ИИ: стандартный». */
  context: string
  /** «ПО: вы 15 — противник 35». */
  score: string
  /** One-sentence totals. */
  totals: string
  tone: 'win' | 'lose' | 'draw' | 'open'
}

const AI_LEVEL_LABEL: Record<string, string> = { beginner: 'начинающий', standard: 'стандартный' }

export function headlineText(report: CoachReport): HeadlineText {
  const { battle, totals } = report
  const faction = (pl: PlayerId) => FACTION_NAME[pl] ?? pl
  const w0 = battle.winner
  const tone = w0 === null ? 'open' : w0 === 'draw' ? 'draw' : w0 === battle.human ? 'win' : 'lose'
  const verdict =
    w0 === null ? 'Битва не закончена'
    : w0 === 'draw' ? 'Ничья'
    : tone === 'win' ? `Победа — ${faction(w0)}`
    : `Поражение — ${w0 === 'orks' ? 'победили' : 'победил'} ${faction(w0)}`
  const sc = SCENARIOS.find((s) => s.id === battle.scenarioId)
  const ai = AI_LEVEL_LABEL[battle.aiLevel]
  const enemy: PlayerId = battle.human === 'marines' ? 'orks' : 'marines'
  const mine = battle.vp[battle.human]
  const theirs = battle.vp[enemy]
  return {
    verdict,
    tone,
    context: [`Вы играли за: ${faction(battle.human)}`, sc ? sc.name : null, ai ? `ИИ: ${ai}` : null].filter(Boolean).join(' · '),
    score: `ПО: вы ${num(mine, 0)} — противник ${num(theirs, 0)}`,
    totals: `Вы сняли ${woundsText(totals.damageDealt, 'acc')}, потеряли ${woundsText(totals.damageTaken, 'acc')}. Раундов в отчёте: ${num(battle.rounds, 0)}.`,
  }
}

const NOTE_TEXT: Record<ReportNoteKind, (m: Record<string, number>) => { title: string; text: string }> = {
  partial: (m) => ({
    title: 'Запись неполная',
    text: `Запись битвы началась с раунда ${num(m.firstRound, 0)} (после загрузки сохранения): более ранние решения неизвестны, отчёт охватывает только записанные раунды.`,
  }),
  lowData: (m) => ({
    title: 'Данных мало',
    text: `Сыграно мало: раундов — ${num(m.rounds, 0)}, действий атаки — ${num(m.humanAttackActions, 0)}, бросков атаки — ${num(m.humanAttackDice, 0)}. Статистика удачи и оценка «что получилось хорошо» скрыты — на такой выборке они ничего не значат.`,
  }),
  estimateOnly: () => ({
    title: 'Только оценки',
    text: 'Все выводы в отчёте — оценки по модели, а не точные факты: относитесь к ним как к подсказкам.',
  }),
}

/** Text of a report note; an unknown note kind gets a neutral fallback instead of throwing. */
export function noteText(note: ReportNote): { title: string; text: string } {
  if (!own(NOTE_TEXT, note.kind)) return { title: FALLBACK_TEXT.title, text: 'К отчёту приложено замечание, для которого нет подробного описания.' }
  return NOTE_TEXT[note.kind](note.metrics ?? {})
}

/** Text of an empty section; the low-data wording is only used when the report really is low-data. */
export function emptyText(id: SectionId, notes: readonly ReportNote[]): string {
  const lowData = notes.some((n) => n.kind === 'lowData')
  if (id === 'luck' && !lowData) return 'Заметных выпадений кубиков в этой партии нет.'
  if (id === 'positives' && !lowData) return 'Пока нет удачных решений, которые можно отметить.'
  return SECTION_TEXT[id].empty
}

/** Where the finding is: «Раунд 3 · стрельба». */
export function whenText(f: Finding): string {
  return `${BADGE_PREFIX.round} ${num(f.round, 0)} · ${PHASE_LABEL[f.phase]}`
}
