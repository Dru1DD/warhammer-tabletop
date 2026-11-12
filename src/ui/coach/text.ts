// Text layer of the Post-Battle Tactical Coach (FE5), written in English and translated through `tr`.
//
// Pure, deterministic, dependency-free: a Finding carries only ids and numbers (types.ts rule 2),
// the sentences are produced HERE from `kind` + `metrics` + `refs` + `unitIds`.
// Rules followed by every string below:
//  * counterfactuals are EXPECTED values only: "on average", "expected". Never "you would have killed".
//  * confidence: exact = stated as a fact, estimate = "by estimate", heuristic = "possibly" (+ a soft
//    "this is advice, not a mistake" for mistake / missed kinds). The hedge sits on the clause with the estimated number;
//    facts (what a unit did, exact wounds, dice) are stated plainly. Heuristic advice is never alarming.
//  * grammar: "wound" is declined by its role in Russian, Ukrainian and Polish (see WoundCase); unit names are quoted and
//    never declined — only the generic noun before them is ("at unit "Boyz I"").
//  * every text is original (no Games Workshop rules text).

import { SCENARIOS } from '../../game/scenarios/scenarios'
import { FACTION_NAME, WEAPONS } from '../../game/data/datasheets'
import { LUCK } from '../../game/coach/config'
import { FINDING_CLASS, METRIC_UNITS } from '../../game/coach/types'
import type {
  Confidence, CoachReport, Finding, FindingKind, FindingTopic, ReportNote, ReportNoteKind, Severity,
} from '../../game/coach/types'
import type { Phase, PlayerId } from '../../game/types'
import { DECIMAL_MARK, locale, tr } from '../../i18n/index'

// ───────────────────────────── number formatting ─────────────────────────────

const NBSP = '\u00A0'
/** English writes "42%", the other languages "42 %" with a no-break space. */
const PERCENT_GAP = locale === 'en' ? '' : NBSP

/** Decimal with the locale's mark (a comma outside English); at most `digits` fraction digits, trailing zeros dropped. Non-finite → "—". */
export function num(v: number | undefined, digits = 1): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  const raw = v.toFixed(digits)
  const s = raw.includes('.') ? raw.replace(/\.?0+$/, '') : raw
  return (s === '-0' ? '0' : s).replace('.', DECIMAL_MARK).replace('-', '−')
}

const pluralRules = new Intl.PluralRules(locale)

/** Plural form for the locale (1 wound, 2 wounds in English; one/few/many in Russian, Ukrainian and Polish).
 *  Fractions take the "few" (genitive singular) form. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (!Number.isInteger(n)) return few
  const category = pluralRules.select(n)
  return category === 'one' ? one : category === 'few' ? few : many
}

const percent = (p: number | undefined): string => {
  if (p === undefined || !Number.isFinite(p)) return '—'
  const r = Math.round(p * 100)
  return p > 0 && r === 0 ? tr('less than 1{NBSP}%', { NBSP: PERCENT_GAP }) : `${r}${PERCENT_GAP}%`
}

/** The value as displayed with `digits` fraction digits, so the plural agrees with the printed number. */
const shown = (v: number, digits = 1): number => Number(v.toFixed(digits))

/** Grammatical case of the noun "wound": nominative, accusative ("lost 1 wound") and genitive ("instead of 2 wounds"). */
export type WoundCase = 'nom' | 'acc' | 'gen'

const WOUND_FORMS: Record<WoundCase, readonly [string, string, string]> = {
  nom: [tr('wound'), tr('wounds|few'), tr('wounds')],
  acc: [tr('wound|acc'), tr('wounds|few'), tr('wounds')],
  gen: [tr('wound|gen'), tr('wounds'), tr('wounds')],
}

/** "5 wounds", "1 wound"; the plural form follows the PRINTED (rounded) number, any fraction takes the "few" form. */
export const woundsText = (v: number | undefined, wcase: WoundCase = 'nom'): string => {
  if (v === undefined || !Number.isFinite(v)) return '—'
  const r = shown(v)
  const forms = WOUND_FORMS[wcase]
  return `${num(v)}${NBSP}${Number.isInteger(r) ? plural(r, ...forms) : tr('wounds|few')}`
}
export const vpText = (v: number | undefined): string =>
  v === undefined || !Number.isFinite(v) ? '—' : tr('{num}{NBSP}VP', { num: num(v, 0), NBSP })
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
    case 'flag': return value ? tr('yes') : tr('no')
    case 'count':
    default: return num(value, 0)
  }
}

// "Waaagh!" is a proper name, so it keeps its capital inside a sentence.
const lowerFirst = (s: string): string => (/^\p{Lu}\p{Ll}/u.test(s) && !s.startsWith('Waaagh') ? s[0].toLowerCase() + s.slice(1) : s)
const upperFirst = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

// ───────────────────────────── names ─────────────────────────────

/** Resolves ids from a Finding to display names. Never throws, never returns an empty string. */
export interface Names {
  /** A unit of the human (`unitIds`). */
  own(id: string | undefined): string
  /** An enemy unit (refs). */
  enemy(id: string | undefined): string
  weapon(id: string | undefined): string
  /** Name of the weapon profile; falls back to "mode N". */
  profile(weaponId: string | undefined, index: string | undefined): string
  objective(id: string | undefined): string
  terrain(id: string | undefined): string
}

/** "Bolt Rifle (Bolt Rifle)" → "Bolt Rifle": the official English name in brackets is dropped. */
const stripLatin = (s: string): string => s.replace(/\s*\([^)]*\)\s*$/, '').trim()
/** Quote marks of the locale and the marks used for a quote inside a quote. */
const QUOTES = { en: ['“', '”', '‘', '’'], ru: ['«', '»', '„', '“'], uk: ['«', '»', '„', '“'], pl: ['„', '”', '«', '»'] }[locale]
/** The name in quotes; quotes inside the name switch to the inner marks so "Redemptor" in "Dreadnought "Redemptor"" does not nest. */
const quoted = (s: string): string => `${QUOTES[0]}${s.split(QUOTES[0]).join(QUOTES[2]).split(QUOTES[1]).join(QUOTES[3])}${QUOTES[1]}`

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
    own: (id) => (id ? quoted(tables.units.get(id) ?? id) : tr('your unit')),
    enemy: (id) => (id ? quoted(tables.units.get(id) ?? id) : tr('enemy unit')),
    weapon: (id) => (id ? stripLatin(WEAPONS[id]?.name ?? id) : tr('weapon')),
    profile: (weaponId, index) => {
      const i = Number(index)
      const name = weaponId && Number.isInteger(i) ? WEAPONS[weaponId]?.profiles[i]?.name : undefined
      if (name) return stripLatin(name)
      return Number.isInteger(i) ? tr('mode {value}', { value: i + 1 }) : tr('mode')
    },
    objective: (id) => {
      const m = id ? /^o(\d+)$/.exec(id) : null
      return m ? tr('objective #{item}', { item: m[1] }) : tr('objective')
    },
    terrain: (id) => (id ? quoted(tables.terrain.get(id) ?? id) : tr('terrain')),
  }
}

// ───────────────────────────── labels ─────────────────────────────

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: tr('Critical'),
  major: tr('Important'),
  minor: tr('Notable'),
  info: tr('For your information'),
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  exact: tr('Fact'),
  estimate: tr('Estimate'),
  heuristic: tr('Advice'),
}

export const CONFIDENCE_HINT: Record<Confidence, string> = {
  exact: tr('Exact: this is how it happened in the game, or the probability is calculated by the engine’s rules.'),
  estimate: tr('Estimate: an approximate model (for example, without the opponent’s move).'),
  heuristic: tr('Advice: a general consideration about play style, not a mistake.'),
}

export const PHASE_LABEL: Record<Phase, string> = {
  command: tr('command'),
  movement: tr('movement'),
  shooting: tr('shooting'),
  charge: tr('charge|alt'),
  fight: tr('fight|alt'),
}

export const TOPIC_LABEL: Record<FindingTopic, string> = {
  headline: tr('Summary'),
  luck: tr('Luck'),
  shooting: tr('Shooting'),
  movement: tr('Movement and combat'),
}

export type SectionId = 'plan' | 'mistakes' | 'missed' | 'luck' | 'shooting' | 'movement' | 'positives' | 'timeline'

export const SECTION_TEXT: Record<SectionId, { title: string; hint: string; empty: string }> = {
  plan: {
    title: tr('Plan for the next battle'),
    hint: tr('Three topics to work on first.'),
    empty: tr('No obvious topics to train — keep playing the same way.'),
  },
  mistakes: {
    title: tr('What can be improved'),
    hint: tr('Decisions where a different choice gave more benefit on average.'),
    empty: tr('No notable mistakes found.'),
  },
  missed: {
    title: tr('Missed opportunities'),
    hint: tr('Good options that you did not use.'),
    empty: tr('No missed opportunities found.'),
  },
  luck: {
    title: tr('Luck on the dice'),
    hint: tr('The dice cannot be shaken out: this section explains what in the result is chance, not decisions.'),
    empty: tr('For such a short game the luck assessment is not shown — there is too little data.'),
  },
  shooting: {
    title: tr('Shooting: more observations'),
    hint: tr('The remaining notes on shooting.'),
    empty: tr('There are no other notes on shooting.'),
  },
  movement: {
    title: tr('Movement, charges and objectives: more observations'),
    hint: tr('The remaining notes on movement, charges and objectives.'),
    empty: tr('There are no other notes on movement and charges.'),
  },
  positives: {
    title: tr('What went well'),
    hint: tr('Decisions worth repeating.'),
    empty: tr('No good moments were singled out in this game — there is too little data.'),
  },
  timeline: {
    title: tr('The course of the battle by round'),
    hint: tr('VP and damage of both sides in each round.'),
    empty: tr('No per-round data.'),
  },
}

export const BADGE_PREFIX = {
  round: tr('Round'),
  frame: tr('Show the moment'),
  fix: tr('What to do'),
  where: tr('Where it was'),
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
const UNIT_NOUN: Record<UnitCase, string> = { nom: tr('unit'), gen: tr('unit|gen'), dat: tr('unit|dat'), acc: tr('unit') }
const OWN_FALLBACK: Record<UnitCase, string> = { nom: tr('your unit'), gen: tr('your unit’s'), dat: tr('to your unit'), acc: tr('your unit') }
const ENEMY_FALLBACK: Record<UnitCase, string> = { nom: tr('enemy unit'), gen: tr('the enemy unit’s'), dat: tr('to the enemy unit'), acc: tr('enemy unit') }

/** `unit "Name"` in the requested case: the generic noun is declined, the quoted name never is. */
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
const MODE_WORD = tr('mode')
const MODE_FALLBACK = new RegExp(`^${MODE_WORD}( \\d+)?$`)
/** `mode "Name"` or the numbered fallback (`mode 2`) without doubling the word. */
const mode = (n: Names, f: Finding, key: string): string => {
  const name = n.profile(ref(f, 'weaponId'), ref(f, key))
  return MODE_FALLBACK.test(name) ? name : tr('mode “{name}”', { name })
}
/** `mode()` without a usable profile index is the bare word "mode" — then say nothing / "another mode". */
const hasMode = (m: string): boolean => m !== MODE_WORD

/** "By estimate, …" for estimates, "Possibly, …" for heuristics, the sentence as is for exact findings. */
export function hedge(confidence: Confidence, sentence: string): string {
  if (confidence === 'estimate') return tr('By estimate, {lowerFirst}', { lowerFirst: lowerFirst(sentence) })
  if (confidence === 'heuristic') return tr('Possibly, {lowerFirst}', { lowerFirst: lowerFirst(sentence) })
  return upperFirst(sentence)
}

/** "4 times", "2.4 times", "5 times" (the Slavic languages pick the form by the number). */
const times = (r: number | undefined): string =>
  r === undefined || !Number.isFinite(r) ? '—' : `${num(r)}${NBSP}${plural(shown(r), tr('time'), tr('times'), tr('times|many'))}`

const luckBand = (index: number | undefined): 'worse' | 'bad' | 'avg' | 'good' | 'better' => {
  const x = index !== undefined && Number.isFinite(index) ? index : 0
  if (x <= -LUCK.NOTABLE_BAND) return 'worse'
  if (x <= -LUCK.AVERAGE_BAND) return 'bad'
  if (x >= LUCK.NOTABLE_BAND) return 'better'
  if (x >= LUCK.AVERAGE_BAND) return 'good'
  return 'avg'
}

const LUCK_TITLE = {
  worse: tr('The dice were strongly against you'),
  bad: tr('The dice were against you'),
  avg: tr('Luck within the norm'),
  good: tr('The dice were on your side'),
  better: tr('You were very lucky with the dice'),
} as const

const LUCK_VERDICT = {
  worse: tr('The result is noticeably worse than average — this is chance, not your decisions.'),
  bad: tr('The result is slightly worse than average: part of the outcome is explained by the dice.'),
  avg: tr('The result is close to average: the outcome mostly depended on decisions.'),
  good: tr('The result is slightly better than average: part of the success is luck.'),
  better: tr('The result is noticeably better than average: do not mistake luck for skill.'),
} as const

// Hedging rule: facts (what the unit did, exact dealt wounds, rolled dice) are stated plainly; only the clause
// that carries an estimated / heuristic number goes through `h`.
const COMPOSERS = {
  'result.summary': (f) => ({
    title: tr('Battle outcome'),
    explanation: tr('Rounds: {p}. Points: you {vpText}, opponent {vpText2}. You dealt {w}, lost {w2}.', { p: p(f, 'roundCount'), vpText: vpText(metric(f, 'humanVp')), vpText2: vpText(metric(f, 'enemyVp')), w: w(f, 'dealtWounds', 'acc'), w2: w(f, 'takenWounds', 'acc') }),
    fix: tr('Below are the key moments worth reviewing and a plan for the next battle.'),
  }),

  'loss.attribution': (f, n, h) => {
    const dc = metric(f, 'decisionCount') ?? 0
    const attackers = ref(f, 'enemyUnitId') ? tr('attacks of {foe} and others', { foe: foe(f, n, 'enemyUnitId', 'gen') }) : tr('enemy attacks')
    const t = terr(n, f)
    return {
      title: tr('Why the unit was lost'),
      explanation:
        tr('{upperFirst} was destroyed on the opponent’s turn: it lost {w}. ', { upperFirst: upperFirst(me(f, n)), w: w(f, 'takenWounds', 'acc') }) +
        `${h(tr('{attackers} should have removed about {w} on average.', { attackers, w: w(f, 'enemyExpectedWounds', 'acc') }))} ` +
        (dc > 0
          ? tr('In your previous turn you gave this unit {countText}.', { countText: countText(dc, tr('command|alt'), tr('commands|few'), tr('commands')) })
          : tr('In your previous turn this unit was left without commands.')) +
        (t ? tr(' There was terrain nearby: {t}.', { t }) : ''),
      fix: tr('Before the end of the turn work out which enemies can reach the unit with fire or a charge. Move it behind an obstacle, into cover or beyond their range.'),
    }
  },

  'objective.swing': (f, n, h) => ({
    title: tr('The objective went to the opponent'),
    explanation: tr('{upperFirst} went to the opponent after your turns this round. {h} {foe} captured it; the moves of {me} affected the outcome.', { upperFirst: upperFirst(n.objective(ref(f, 'objectiveId'))), h: h(tr('that is about {p} of the difference (your OC on the objective — {num}, the opponent’s — {num2}).', { p: p(f, 'swingVp'), num: num(metric(f, 'humanOc'), 0), num2: num(metric(f, 'enemyOc'), 0) })), foe: foe(f, n, 'enemyUnitId'), me: me(f, n, 'gen') }),
    fix: tr('Do not let go of an important objective: leave a unit on it with a reserve of control points or bring up support in advance.'),
  }),

  'objective.battleShock': (f, n, h) => ({
    title: tr('Battle-shock cost points'),
    explanation: tr('{upperFirst} was Battle-shocked: its OC dropped to zero (lost {p}), and {objective} was not counted. {h}', { upperFirst: upperFirst(me(f, n)), p: p(f, 'lostOc'), objective: n.objective(ref(f, 'objectiveId')), h: h(tr('that is about {p}; the opponent had {p2} on the objective.', { p: p(f, 'lostVp'), p2: p(f, 'enemyOc') })) }),
    fix: tr('A badly depleted unit risks Battle-shock. Do not give such a unit a key objective and keep a second unit nearby.'),
  }),

  'luck.summary': (f, _n, h) => {
    const band = luckBand(metric(f, 'luckIndex'))
    return {
      title: LUCK_TITLE[band],
      explanation:
        tr('Your attacks removed {w}, the opponent’s attacks — {w2}. ', { w: w(f, 'attackDealtWounds', 'acc'), w2: w(f, 'attackTakenWounds', 'acc') }) +
        `${h(tr('on average your attacks should have removed {w}, and the opponent’s attacks — {w2}.', { w: w(f, 'expectedDealtWounds', 'acc'), w2: w(f, 'expectedTakenWounds', 'acc') }))} ` +
        tr('Luck index: {p} (from −1 to +1, 0 is average luck). {item}', { p: p(f, 'luckIndex'), item: LUCK_VERDICT[band] }),
      fix: tr('Judge decisions by the expected result, not by a single roll: luck cannot be planned.'),
    }
  },

  'luck.swing': (f, n, h) => {
    const own = metric(f, 'isOwnAttack') === 1
    const actual = metric(f, 'actualWounds') ?? 0
    const expected = metric(f, 'expectedWounds') ?? 0
    const lucky = own ? actual > expected : actual < expected
    const who = own
      ? tr('The attack of {me} on {foe}{via}', { me: me(f, n, 'gen'), foe: foe(f, n, 'targetUnitId', 'dat'), via: via(n, f) })
      : tr('The attack of {foe} on {me}', { foe: foe(f, n, 'enemyUnitId', 'gen'), me: me(f, n, 'dat') })
    return {
      title: lucky ? tr('An unusually lucky roll') : tr('An unusually unlucky roll'),
      explanation: tr('{who} removed {w} (attacks: {num}). {h} This or an even rarer outcome happens in about {p} of cases.', { who, w: w(f, 'actualWounds', 'acc'), num: num(metric(f, 'attackCount'), 0), h: h(tr('on average such an attack removes {w}.', { w: w(f, 'expectedWounds', 'acc') })), p: p(f, 'tailProbability') }),
      fix: tr('This is just the dice. Do not change the plan because of one roll — look at the expected result of the decision.'),
    }
  },

  'shoot.targetChoice': (f, n, h) => ({
    title: tr('Another target was better'),
    explanation: tr('{upperFirst} shot at {foe}{via}. {h}', { upperFirst: upperFirst(me(f, n)), foe: foe(f, n, 'targetUnitId', 'dat'), via: via(n, f), h: h(tr('on average this gave {w}, while shooting at {foe} would have given {w2} — {times} more (a difference of {w3}).', { w: w(f, 'chosenExpectedWounds', 'acc'), foe: foe(f, n, 'betterTargetUnitId', 'dat'), w2: w(f, 'bestExpectedWounds', 'acc'), times: times(metric(f, 'ratio')), w3: w(f, 'deltaWounds', 'acc') })) }),
    fix: tr('Before shooting compare the available targets: look for the one with weaker defence and no cover, not simply the nearest.'),
  }),

  'shoot.profileChoice': (f, n, h) => {
    const weapon = ref(f, 'weaponId') ? tr(' with “{weapon}”', { weapon: n.weapon(ref(f, 'weaponId')) }) : ''
    const chosen = mode(n, f, 'profileIndex')
    const better = mode(n, f, 'betterProfileIndex')
    return {
      title: tr('Another weapon mode was better'),
      explanation: tr('{upperFirst} shot{weapon}{value} at {foe}. {h}', { upperFirst: upperFirst(me(f, n)), weapon, value: hasMode(chosen) ? `, ${chosen},` : '', foe: foe(f, n, 'targetUnitId', 'dat'), h: h(tr('on average this gave {w}, while {value} would on average have given {w2} (a difference of {w3}).', { w: w(f, 'chosenExpectedWounds', 'acc'), value: hasMode(better) ? better : tr('another mode'), w2: w(f, 'bestExpectedWounds', 'acc'), w3: w(f, 'deltaWounds', 'acc') })) }),
      fix: tr('When choosing a mode look not only at Strength and AP but also at the number of attacks: against light targets more frequent fire is often better.'),
    }
  },

  'shoot.overkill': (f, n, h) => ({
    title: tr('Extra damage went to waste'),
    explanation: tr('Shots were fired at {foe}{via}. {h}', { foe: foe(f, n, 'targetUnitId', 'dat'), via: via(n, f), h: h(tr('the excess damage was on average about {w} ({p} of the expected damage): the target needed much less.', { w: w(f, 'wastedWounds', 'acc'), p: p(f, 'wastedShare') })) }),
    fix: tr('If the target is almost finished, send the rest of the weapons at another unit: extra damage does not carry over to neighbours.'),
  }),

  'shoot.advanceCost': (f, n, h) => ({
    title: tr('The Advance cost damage'),
    explanation: tr('{upperFirst} advanced (roll — {p}) and could shoot at {foe} only with the weapons that allow it. {h}', { upperFirst: upperFirst(me(f, n)), p: p(f, 'advanceRollInches'), foe: foe(f, n, 'targetUnitId', 'dat'), h: h(tr('on average this gave {w} instead of {w2} with a normal move.', { w: w(f, 'chosenExpectedWounds', 'acc'), w2: w(f, 'bestExpectedWounds', 'gen') })) }),
    fix: tr('Advance when you need to take an objective or reach cover. For a shooting unit a normal move more often gives more damage.'),
  }),

  'shoot.coverIgnored': (f, n, h) => {
    const t = terr(n, f)
    return {
      title: tr('A shot at a target in cover'),
      explanation: tr('{upperFirst} shot at {foe}, which was in cover{value}. {h}', { upperFirst: upperFirst(me(f, n)), foe: foe(f, n, 'targetUnitId', 'dat'), value: t ? ` (${t})` : '', h: h(tr('on average this gave {w}, while shooting at {foe} without cover would have given {w2}.', { w: w(f, 'chosenExpectedWounds', 'acc'), foe: foe(f, n, 'betterTargetUnitId', 'dat'), w2: w(f, 'bestExpectedWounds', 'acc') })) }),
      fix: tr('Cover makes a target noticeably tougher. With targets of similar value pick the one standing in the open.'),
    }
  },

  'shoot.hazardLoss': (f, n, h) => {
    const weapon = ref(f, 'weaponId') ? tr(' of the “{weapon}” weapon', { weapon: n.weapon(ref(f, 'weaponId')) }) : ''
    return {
      title: tr('A risky mode did not pay off'),
      explanation: tr('{upperFirst}{weapon} of {me} is risky for its owner. {h}', { upperFirst: upperFirst(mode(n, f, 'profileIndex')), weapon, me: me(f, n, 'gen'), h: h(tr('on average the unit loses {w} and deals {w2} to {foe} (a deficit of {w3}).', { w: w(f, 'selfExpectedWounds', 'acc'), foe: foe(f, n, 'targetUnitId', 'dat'), w2: w(f, 'gainExpectedWounds', 'acc'), w3: w(f, 'deltaWounds', 'acc') })) }),
      fix: tr('Use a risky mode when the damage gain is noticeably greater than the expected loss (for example, against a tough target). Otherwise shoot in the normal mode.'),
    }
  },

  'shoot.firingPosition': (f, n, h) => {
    const cause = ref(f, 'cause')
    const why =
      cause === 'rapidFire' ? tr('the unit shot from beyond half range and the Rapid Fire bonus did not work')
      : cause === 'heavy' ? tr('the unit moved and the Heavy weapon lost its bonus')
      : cause === 'lineOfSight' ? tr('line of sight was lost after the move')
      : tr('the position deprived the weapon of its bonus')
    const fix =
      cause === 'rapidFire' ? tr('If it is safe, come to half range of a Rapid Fire weapon: it gives extra attacks.')
      : cause === 'heavy' ? tr('A Heavy weapon works best with a unit that did not move. Decide in advance: move or shoot from where you stand.')
      : cause === 'lineOfSight' ? tr('Before moving check where the target is visible from, and place the unit so that line of sight is kept.')
      : tr('Choose the position so as to keep the weapon bonuses and the target’s visibility.')
    return {
      title: tr('The shooting position cost damage'),
      explanation: tr('{upperFirst} shot at {foe}{via} from {p}: {why}. {h}', { upperFirst: upperFirst(me(f, n)), foe: foe(f, n, 'targetUnitId', 'dat'), via: via(n, f), p: p(f, 'distanceInches'), why, h: h(tr('on average this gave {w} instead of {w2}.', { w: w(f, 'chosenExpectedWounds', 'acc'), w2: w(f, 'bestExpectedWounds', 'gen') })) }),
      fix,
    }
  },

  'charge.badOdds': (f, n, h) => ({
    title: tr('A charge with a low chance of success'),
    explanation: tr('{upperFirst} declared a charge on {foe} from {p}; rolled {p2}. {h}', { upperFirst: upperFirst(me(f, n)), foe: foe(f, n, 'targetUnitId', 'acc'), p: p(f, 'distanceInches'), p2: p(f, 'rollInches'), h: h(tr('the chance to reach the target was about {p}.', { p: p(f, 'chargeProbability') })) }),
    fix: tr('Come closer in the Movement phase so that a small roll is enough for the charge, or spend the turn shooting or taking an objective.'),
  }),

  'charge.failedByLuck': (f, n, h) => ({
    title: tr('The charge failed because of the roll'),
    explanation: tr('{upperFirst} declared a charge on {foe} from {p}, and rolled {p2}. {h} The decision was reasonable — this is not a mistake.', { upperFirst: upperFirst(me(f, n)), foe: foe(f, n, 'targetUnitId', 'acc'), p: p(f, 'distanceInches'), p2: p(f, 'rollInches'), h: h(tr('the chance to make it was about {p}.', { p: p(f, 'chargeProbability') })) }),
    fix: tr('Nothing needs to change. If you need reliability, come closer in advance, in the Movement phase.'),
  }),

  'fight.targetChoice': (f, n, h) => ({
    title: tr('There was a better target in melee'),
    explanation: tr('{upperFirst} struck {foe}. {h}', { upperFirst: upperFirst(me(f, n)), foe: foe(f, n, 'targetUnitId', 'dat'), h: h(tr('on average this gave {w}, while a strike at {foe} would have given {w2} — {times} more.', { w: w(f, 'chosenExpectedWounds', 'acc'), foe: foe(f, n, 'betterTargetUnitId', 'dat'), w2: w(f, 'bestExpectedWounds', 'acc'), times: times(metric(f, 'ratio')) })) }),
    fix: tr('Before striking compare the available targets in engagement range: pick the one the unit’s weapon works better against.'),
  }),

  'move.exposed': (f, n, h) => ({
    title: tr('The unit came under fire'),
    explanation: tr('After the move {me} ended up in the enemy’s zone of fire (shooting units — {num}; the nearest — at {p}{value}). {h} The estimate does not account for the opponent’s movement.', { me: me(f, n), num: num(metric(f, 'shooterCount'), 0), p: p(f, 'distanceInches'), value: ref(f, 'enemyUnitId') ? tr(', that is {foe}', { foe: foe(f, n, 'enemyUnitId') }) : '', h: h(tr('on average they could have removed {w}.', { w: w(f, 'enemyExpectedWounds', 'acc') })) }),
    fix: tr('End the turn so that there is an obstacle (ruins, a container) between the unit and the shooters, or so that it stands beyond their range.'),
  }),

  'move.noCover': (f, n, h) => {
    const t = terr(n, f)
    return {
      title: tr('The unit stayed in the open'),
      explanation: tr('{upperFirst} finished the move without cover, although cover{value} was at {p}. {h}', { upperFirst: upperFirst(me(f, n)), value: t ? ` ${t}` : '', p: p(f, 'distanceInches'), h: h(tr('in the open the expected losses are {w}, in cover — {w2} (a difference of {w3}).', { w: w(f, 'chosenExpectedWounds'), w2: w(f, 'bestExpectedWounds'), w3: w(f, 'deltaWounds', 'acc') })) }),
      fix: tr('If the path allows, end the move in a cover zone: infantry are better protected there.'),
    }
  },

  'move.objectiveNeglect': (f, n, h) => ({
    title: tr('The objective was left unattended'),
    explanation: tr('{upperFirst} was left without your control for several turns ({num}), although {me} was within {p} of it. {h}', { upperFirst: upperFirst(n.objective(ref(f, 'objectiveId'))), num: num(metric(f, 'turnCount'), 0), me: me(f, n), p: p(f, 'distanceInches'), h: h(tr('about {p} was missed.', { p: p(f, 'lostVp') })) }),
    fix: tr('Assign each objective a unit that takes and holds it: points are scored in the Command phase for each controlled objective.'),
  }),

  'move.chargeExposure': (f, n, h) => ({
    title: tr('The unit within the opponent’s charge range'),
    explanation: tr('{upperFirst} ended the turn at {p} from {foe}. {h}', { upperFirst: upperFirst(me(f, n)), p: p(f, 'distanceInches'), foe: foe(f, n, 'enemyUnitId', 'gen'), h: h(tr('the chance that it reaches you with a charge is about {p}, and the fight is rated at {w} (if the charge succeeds).', { p: p(f, 'chargeProbability'), w: w(f, 'expectedMeleeWounds', 'acc') })) }),
    fix: tr('Stay out of reach of dangerous assault units — or expose those who do not fear melee.'),
  }),

  'move.fallBackDecision': (f, n, h) => ({
    title: tr('The decision to fall back'),
    explanation: tr('The decision of {me} to fall back from {foe} was debatable. {h}', { me: me(f, n, 'gen'), foe: foe(f, n, 'enemyUnitId', 'gen'), h: h(tr('with the chosen option the expected losses are {w}, with the other — {w2} (a difference of {w3}).', { w: w(f, 'chosenExpectedWounds'), w2: w(f, 'bestExpectedWounds'), w3: w(f, 'deltaWounds', 'acc') })) }),
    fix: tr('Compare both options — fall back or stay — by expected losses and by what the unit gives up this turn.'),
  }),

  'move.advanceDecision': (f, n, h) => ({
    title: tr('Advance or a normal move?'),
    explanation: tr('{upperFirst} decided to advance (roll — {p}). {h}', { upperFirst: upperFirst(me(f, n)), p: p(f, 'advanceRollInches'), h: h(tr('the expected outcome is {w}, and with another choice — {w2}.', { w: w(f, 'chosenExpectedWounds'), w2: w(f, 'bestExpectedWounds') })) }),
    fix: tr('Before advancing weigh what matters more this turn — taking position faster or keeping full shooting.'),
  }),

  'missed.shot': (f, n, h) => ({
    title: tr('The unit could have shot'),
    explanation: tr('{upperFirst} did not shoot although there were {num} available targets. {h}', { upperFirst: upperFirst(me(f, n)), num: num(metric(f, 'targetCount'), 0), h: h(tr('the best shot{via} at {foe} would have given {w} on average.', { via: via(n, f), foe: foe(f, n, 'targetUnitId', 'dat'), w: w(f, 'bestExpectedWounds', 'acc') })) }),
    fix: tr('Before the end of the Shooting phase go through the list of units: did anyone with an available target get left behind.'),
  }),

  'missed.charge': (f, n, h) => ({
    title: tr('A charge was missed'),
    explanation: tr('{upperFirst} did not declare a charge on {foe} (distance {p}). {h}', { upperFirst: upperFirst(me(f, n)), foe: foe(f, n, 'targetUnitId', 'acc'), p: p(f, 'distanceInches'), h: h(tr('the chance to make it was about {p}, and the fight was rated at {w} on success.', { p: p(f, 'chargeProbability'), w: w(f, 'expectedMeleeWounds', 'acc') })) }),
    fix: tr('If the chance is decent and the fight is favourable, a charge is worth trying: on failure the unit simply stays in place.'),
  }),

  'missed.waaagh': (f, n, h) => ({
    title: tr('The Battle Cry was not used'),
    explanation: tr('Waaagh! is available once per battle and was never called (your turns left: {num}). By that time {me} was near the opponent. {h}', { num: num(metric(f, 'unusedTurnCount'), 0), me: me(f, n), h: h(tr('it was worth thinking about Waaagh! in advance.')) }),
    fix: tr('Call Waaagh! in the Command phase before the decisive advance — it is the only time per battle.'),
  }),

  'missed.ammoRunts': (f, n, h) => ({
    title: tr('The “Ammo Runts” ability was not used'),
    explanation: tr('{upperFirst} shot at {foe}{via} without the Ammo Runts. {h}', { upperFirst: upperFirst(me(f, n)), foe: foe(f, n, 'targetUnitId', 'dat'), via: via(n, f), h: h(tr('with them the weapon would have given {w} on average instead of {w2} (a gain of {w3}).', { w: w(f, 'bestExpectedWounds', 'acc'), w2: w(f, 'chosenExpectedWounds', 'gen'), w3: w(f, 'deltaWounds') })) }),
    fix: tr('Before shooting check the unit’s abilities that can be used, especially those that boost weapons and work once per battle.'),
  }),

  'missed.objective': (f, n, h) => ({
    title: tr('The objective could have been taken'),
    explanation: tr('{upperFirst} was {p} from {me}, but was left without your control. {h}', { upperFirst: upperFirst(n.objective(ref(f, 'objectiveId'))), p: p(f, 'distanceInches'), me: me(f, n, 'gen'), h: h(tr('about {p} was missed.', { p: p(f, 'lostVp') })) }),
    fix: tr('In the Movement phase first check the objectives the unit can reach without risk, and put at least one unit on them.'),
  }),

  'good.targetChoice': (f, n, h) => {
    const alt = metric(f, 'alternativeCount')
    const other =
      alt === 1 ? tr('another target')
      : alt === undefined || !Number.isFinite(alt) ? tr('the best of the other targets')
      : tr('the best of {num}{NBSP}{plural}', { num: num(alt, 0), NBSP, plural: plural(shown(alt, 0), tr('another target|alt'), tr('other targets'), tr('other targets')) })
    return {
      title: tr('A good choice of target'),
      explanation: tr('{upperFirst} shot at {foe}{via}. {h}', { upperFirst: upperFirst(me(f, n)), foe: foe(f, n, 'targetUnitId', 'dat'), via: via(n, f), h: h(tr('on average this gave {w}, while {other} would have given {w2} on average.', { w: w(f, 'chosenExpectedWounds', 'acc'), other, w2: w(f, 'alternativeExpectedWounds', 'acc') })) }),
      fix: tr('Keep it up: choose the target by expected damage, not by distance.'),
    }
  },

  'good.objectiveHeld': (f, n) => ({
    title: tr('The objective was held'),
    explanation: tr('{upperFirst} was under your control (turns: {num}), held by {me}. That is {p}.', { upperFirst: upperFirst(n.objective(ref(f, 'objectiveId'))), num: num(metric(f, 'turnCount'), 0), me: me(f, n), p: p(f, 'scoredVp') }),
    fix: tr('Keep leaving a unit with a reserve of control points on the key objective.'),
  }),

  'good.efficiency': (f, _n, h) => ({
    title: tr('Damage above expected'),
    explanation: tr('Your attacks ({num}) removed {w}. {h} This is a combination of sensible decisions and lucky rolls.', { num: num(metric(f, 'attackCount'), 0), w: w(f, 'attackDealtWounds', 'acc'), h: h(tr('on average they should have removed {w}.', { w: w(f, 'expectedDealtWounds', 'acc') })) }),
    fix: tr('Build on it: keep choosing the best targets and weapon modes.'),
  }),

  'good.cover': (f, n, h) => {
    const t = terr(n, f)
    return {
      title: tr('Smart use of cover'),
      explanation: tr('{upperFirst} took a position in cover{value}. {h}', { upperFirst: upperFirst(me(f, n)), value: t ? ` ${t}` : '', h: h(tr('in cover the unit loses {w} on average, and in the open would have lost {w2} (a benefit of {w3}).', { w: w(f, 'chosenExpectedWounds', 'acc'), w2: w(f, 'alternativeExpectedWounds', 'acc'), w3: w(f, 'deltaWounds') })) }),
      fix: tr('Keep it up: end the turn in cover when it does not get in the way of the task.'),
    }
  },
} as const satisfies Record<FindingKind, Composer>

const FALLBACK_TEXT: FindingText = {
  title: tr('Coach’s observation'),
  explanation: tr('The coach noticed this moment, but there is no detailed description for it yet.'),
  fix: tr('Look at this moment on the board and compare it with other options.'),
}

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

/**
 * The full text for ONE finding. Hedging by confidence lives INSIDE each composer (`h` wraps only the clause that
 * carries an estimated number: estimate → "By estimate, …", heuristic → "Possibly, …"); facts stay plain.
 * Here only the advice-style suffix is added: for a heuristic mistake / missed finding — "this is advice, not a mistake"
 * and a soft "if you want to experiment". Other classes (good.*, luck.*, explanations) keep neutral wording.
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
    explanation: tr('{explanation} This is advice on play style, not a mistake.', { explanation: t.explanation }),
    fix: tr('If you want to experiment: {lowerFirst}', { lowerFirst: lowerFirst(t.fix) }),
  }
}

// ───────────────────────────── plan ─────────────────────────────

/** Kinds that can appear in `CoachReport.plan` (classes `mistake` and `missed`). */
export type PlanKind = Exclude<FindingKind, `good.${string}` | 'result.summary' | 'luck.summary' | 'luck.swing' | 'charge.failedByLuck'>

export const PLAN_TEXT = {
  'loss.attribution': { title: tr('Protect your units before the opponent’s turn'), advice: tr('At the end of the turn check which enemies can reach each unit. Hide your most valuable units from fire and charges.') },
  'objective.swing': { title: tr('Do not give up objectives'), advice: tr('Watch the control points on each objective. Do not pull a unit off an objective while there is no replacement nearby.') },
  'objective.battleShock': { title: tr('Protect units on objectives from panic'), advice: tr('Do not hold an objective with a single thinned-out unit. Back it up with a second one.') },
  'shoot.targetChoice': { title: tr('Choose a shooting target'), advice: tr('Before shooting compare two or three targets: whose defence is weaker, who has no cover and more damage potential.') },
  'shoot.profileChoice': { title: tr('Choose the weapon mode'), advice: tr('For weapons with several modes compare the number of attacks, Strength and AP against the specific target.') },
  'shoot.overkill': { title: tr('Do not waste damage'), advice: tr('Finish an almost-dead target with a small weapon, send the rest of the weapons at other units.') },
  'shoot.advanceCost': { title: tr('Advance deliberately'), advice: tr('An Advance costs shooting. Advance for an objective or cover, not out of habit.') },
  'shoot.coverIgnored': { title: tr('Shoot targets that are out of cover'), advice: tr('With targets of equal value pick the one standing in the open.') },
  'shoot.hazardLoss': { title: tr('Take risks justifiably'), advice: tr('Use a risky weapon mode only when the damage gain is noticeably greater than the expected loss.') },
  'shoot.firingPosition': { title: tr('Position units for shooting wisely'), advice: tr('Take into account half range for Rapid Fire, Heavy restrictions and line of sight before the shot.') },
  'charge.badOdds': { title: tr('Count the charge odds'), advice: tr('Declare a charge when a small roll is enough for success. Otherwise come closer or shoot.') },
  'fight.targetChoice': { title: tr('Choose a target in melee'), advice: tr('When engaged with several units first assess which one your weapon works better against.') },
  'move.exposed': { title: tr('Do not expose yourself to fire'), advice: tr('End the turn so that the enemy shooters are behind an obstacle or out of range.') },
  'move.noCover': { title: tr('Use cover'), advice: tr('If the path allows, end the move in a cover zone, especially with infantry.') },
  'move.objectiveNeglect': { title: tr('Do not forget objectives'), advice: tr('From round 2 points go for each controlled objective: assign units to them.') },
  'move.chargeExposure': { title: tr('Watch the enemy’s charge zone'), advice: tr('Do not end the turn where a dangerous assault unit has a good chance to reach you.') },
  'move.fallBackDecision': { title: tr('Weigh a fall back'), advice: tr('When deciding whether to fall back, compare the expected losses in both options.') },
  'move.advanceDecision': { title: tr('Weigh an Advance'), advice: tr('Compare what the Advance gives and what the unit loses this turn.') },
  'missed.shot': { title: tr('Shoot with everyone who can'), advice: tr('Before the end of the Shooting phase check that no unit with an available target is left.') },
  'missed.charge': { title: tr('Try good charges'), advice: tr('If the chance is decent and the fight is favourable, declare a charge: on failure the unit stays in place.') },
  'missed.waaagh': { title: tr('Use the Battle Cry'), advice: tr('Call Waaagh! in the Command phase before the decisive advance: it is available once per battle.') },
  'missed.ammoRunts': { title: tr('Use the unit’s abilities'), advice: tr('Before shooting check the abilities that boost weapons and work once per battle.') },
  'missed.objective': { title: tr('Take the available objectives'), advice: tr('In the Movement phase first look at the objectives the unit can reach without risk.') },
} as const satisfies Record<PlanKind, { title: string; advice: string }>

const isPlanKind = (k: FindingKind): k is PlanKind => own(PLAN_TEXT, k)

export function planText(kind: FindingKind): { title: string; advice: string } {
  return isPlanKind(kind) ? PLAN_TEXT[kind] : { title: tr('Review this decision'), advice: tr('Look at the notes above and try to do it differently.') }
}

// ───────────────────────────── headline & notes ─────────────────────────────

export interface HeadlineText {
  /** "Victory — Space Marines" / "Defeat — Orks won" / "Draw" / "The battle is not finished". */
  verdict: string
  /** "You played: Space Marines · Combat Patrol · AI: standard". */
  context: string
  /** "VP: you 15 — opponent 35". */
  score: string
  /** One-sentence totals. */
  totals: string
  tone: 'win' | 'lose' | 'draw' | 'open'
}

/** Factions whose name is a plural noun ("the Orks won"), for the verb agreement of Slavic languages. */
const PLURAL_FACTIONS: readonly PlayerId[] = ['orks', 'tyranids', 'necrons', 'aeldari']

const AI_LEVEL_LABEL: Record<string, string> = { beginner: tr('beginner|level'), standard: tr('standard|level') }

export function headlineText(report: CoachReport): HeadlineText {
  const { battle, totals } = report
  const faction = (pl: PlayerId) => FACTION_NAME[pl] ?? pl
  const w0 = battle.winner
  const tone = w0 === null ? 'open' : w0 === 'draw' ? 'draw' : w0 === battle.human ? 'win' : 'lose'
  const verdict =
    w0 === null ? tr('The battle is not finished')
    : w0 === 'draw' ? tr('Draw')
    : tone === 'win' ? tr('Victory — {faction}', { faction: faction(w0) })
    : PLURAL_FACTIONS.includes(w0) ? tr('Defeat — {faction} won|pl', { faction: faction(w0) })
    : tr('Defeat — {faction} won', { faction: faction(w0) })
  const sc = SCENARIOS.find((s) => s.id === battle.scenarioId)
  const ai = AI_LEVEL_LABEL[battle.aiLevel]
  const enemy: PlayerId = battle.human === 'marines' ? 'orks' : 'marines'
  const mine = battle.vp[battle.human]
  const theirs = battle.vp[enemy]
  return {
    verdict,
    tone,
    context: [tr('You played: {faction}', { faction: faction(battle.human) }), sc ? sc.name : null, ai ? tr('AI: {ai}', { ai }) : null].filter(Boolean).join(' · '),
    score: tr('VP: you {num} — opponent {num2}', { num: num(mine, 0), num2: num(theirs, 0) }),
    totals: tr('You dealt {woundsText}, lost {woundsText2}. Rounds in the report: {num}.', { woundsText: woundsText(totals.damageDealt, 'acc'), woundsText2: woundsText(totals.damageTaken, 'acc'), num: num(battle.rounds, 0) }),
  }
}

const NOTE_TEXT: Record<ReportNoteKind, (m: Record<string, number>) => { title: string; text: string }> = {
  partial: (m) => ({
    title: tr('The record is incomplete'),
    text: tr('The battle record started from round {num} (after loading a save): earlier decisions are unknown, the report covers only the recorded rounds.', { num: num(m.firstRound, 0) }),
  }),
  lowData: (m) => ({
    title: tr('Little data'),
    text: tr('Little was played: rounds — {num}, attack actions — {num2}, attack rolls — {num3}. The luck statistics and the “what went well” assessment are hidden — on such a sample they mean nothing.', { num: num(m.rounds, 0), num2: num(m.humanAttackActions, 0), num3: num(m.humanAttackDice, 0) }),
  }),
  estimateOnly: () => ({
    title: tr('Estimates only'),
    text: tr('All conclusions in the report are model estimates, not exact facts: treat them as hints.'),
  }),
}

/** Text of a report note; an unknown note kind gets a neutral fallback instead of throwing. */
export function noteText(note: ReportNote): { title: string; text: string } {
  if (!own(NOTE_TEXT, note.kind)) return { title: FALLBACK_TEXT.title, text: tr('The report includes a note for which there is no detailed description.') }
  return NOTE_TEXT[note.kind](note.metrics ?? {})
}

/** Text of an empty section; the low-data wording is only used when the report really is low-data. */
export function emptyText(id: SectionId, notes: readonly ReportNote[]): string {
  const lowData = notes.some((n) => n.kind === 'lowData')
  if (id === 'luck' && !lowData) return tr('There are no notable dice outliers in this game.')
  if (id === 'positives' && !lowData) return tr('There are no good decisions yet that can be highlighted.')
  return SECTION_TEXT[id].empty
}

/** Where the finding is: "Round 3 · shooting". */
export function whenText(f: Finding): string {
  return `${BADGE_PREFIX.round} ${num(f.round, 0)} · ${PHASE_LABEL[f.phase]}`
}
