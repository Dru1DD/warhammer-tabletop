import { describe, expect, it } from 'vitest'
import { orksReportSample, partialReportSample, reportSample, shortGameReportSample } from '../../game/coach/__fixtures__/report.sample'
import { ALL_FINDING_KINDS, FINDING_CLASS, METRIC_UNITS } from '../../game/coach/types'
import type { CoachReport, Finding, FindingKind, ReportNote } from '../../game/coach/types'
import { describeFinding, emptyText, formatMetric, headlineText, namesFor, noteText, planText, plural, PLAN_TEXT, SECTION_TEXT, woundsText } from './text'
import type { WoundCase } from './text'

const REPORTS: Record<string, CoachReport> = { reportSample, partialReportSample, shortGameReportSample, orksReportSample }
const BAD = /undefined|NaN|\[object|null|Infinity/
const CYRILLIC = /[А-Яа-яЁё]/
const NB = '\u00A0'

const allFindings = (r: CoachReport): Finding[] => [r.headline, ...r.mistakes, ...r.missed, ...r.luck, ...r.shooting, ...r.movement, ...r.positives]
const everyFinding = (): Finding[] => Object.values(REPORTS).flatMap(allFindings)
const fullText = (f: Finding, scenario = 'combat-patrol') => {
  const t = describeFinding(f, namesFor(scenario))
  return `${t.title} ${t.explanation} ${t.fix}`
}
/** The finding with every wounds metric set to `v`. */
const withWounds = (f: Finding, v: number): Finding => ({
  ...f,
  metrics: Object.fromEntries(Object.entries(f.metrics).map(([k, x]) => [k, METRIC_UNITS[k] === 'wounds' ? v : x])),
})

/** Reports every «N рана/раны/ран/рану» whose form cannot agree with the printed N in ANY case. */
function woundFormViolations(text: string): string[] {
  const bad: string[] = []
  for (const m of text.matchAll(/(\d+(?:,\d+)?)\u00A0(ран[а-я]*)/g)) {
    const [whole, n, form] = m
    if (n.includes(',')) {
      if (form !== 'раны') bad.push(whole)
      continue
    }
    const k = Number(n)
    const t = k % 100
    const o = k % 10
    const cls = t >= 11 && t <= 14 ? 'many' : o === 1 ? 'one' : o >= 2 && o <= 4 ? 'few' : 'many'
    // one: рана|рану (nom/acc) or раны (gen); few: раны (nom/acc) or ран (gen); many: ран
    const ok = cls === 'one' ? ['рана', 'рану', 'раны'] : cls === 'few' ? ['раны', 'ран'] : ['ран']
    if (!ok.includes(form)) bad.push(whole)
  }
  return bad
}

describe('coach text layer', () => {
  it('fixtures together cover every FindingKind (so the per-kind checks below are exhaustive)', () => {
    const seen = new Set(everyFinding().map((f) => f.kind))
    expect([...seen].sort()).toEqual([...ALL_FINDING_KINDS].sort())
  })

  it('produces non-empty Russian title / explanation / fix without junk for every kind in every fixture', () => {
    for (const [name, r] of Object.entries(REPORTS)) {
      const names = namesFor(r.battle.scenarioId)
      for (const f of allFindings(r)) {
        const t = describeFinding(f, names)
        for (const s of [t.title, t.explanation, t.fix]) {
          expect(s.trim().length, `${name} ${f.id}`).toBeGreaterThan(3)
          expect(s, `${name} ${f.id}`).toMatch(CYRILLIC)
          expect(s, `${name} ${f.id}`).not.toMatch(BAD)
        }
      }
    }
  })

  it('without resolvable names or refs there are no broken phrases (unknown scenario, refs removed)', () => {
    const names = namesFor('no-such-scenario')
    const broken = [
      /отряд ваш/i, /ваш отряд\s+«/, /отряд отряд/i, /отряд противника\s+«/, // doubled nouns
      /(?<![а-яё])(?:по|от|у|против|для) отряд(?![а-яё])/, // undeclined noun after a preposition
      /«(?:оружие|местность|цель|режим|отряд[^»]*)»/, // a fallback word dressed up as a name
      /режим «режим/, /, режим,|а режим в/, /«\s*»/, /\(\s*\)/,
    ]
    for (const kind of ALL_FINDING_KINDS) {
      const src = everyFinding().find((f) => f.kind === kind)!
      const f: Finding = { ...src, refs: undefined, unitIds: [] }
      const t = fullText(f, 'no-such-scenario')
      expect(t, kind).not.toMatch(BAD)
      for (const re of broken) expect(t, `${kind} ${re}`).not.toMatch(re)
    }
    // spot-check the exact fallbacks
    const attack = { ...everyFinding().find((f) => f.kind === 'charge.badOdds')!, refs: undefined, unitIds: [] }
    expect(describeFinding(attack, names).explanation).toMatch(/^Ваш отряд объявил атаку на отряд противника с расстояния/)
    const shot = { ...everyFinding().find((f) => f.kind === 'shoot.targetChoice')!, refs: undefined, unitIds: [] }
    expect(describeFinding(shot, names).explanation).toMatch(/^Ваш отряд стрелял по отряду противника\./)
    expect(describeFinding(shot, names).explanation).toMatch(/стрельба по отряду противника давала бы/)
  })

  it('declines the generic noun, never the quoted name', () => {
    const f = allFindings(reportSample).find((x) => x.kind === 'shoot.targetChoice')!
    const e = describeFinding(f, namesFor('combat-patrol')).explanation
    expect(e).toContain('Отряд «Интерсессоры I» стрелял по отряду «Бойз I» (Болтерная винтовка).')
    expect(e).toContain('а стрельба по отряду «Бойз II» давала бы')
    const sw = describeFinding(everyFinding().find((x) => x.kind === 'luck.swing')!, namesFor('combat-patrol')).explanation
    expect(sw).toMatch(/^Атака отряда «[^»]+» по отряду «[^»]+»/)
  })

  it('hedges by confidence on the clause with the estimated number; facts stay plain', () => {
    const names = namesFor('combat-patrol')
    const base = reportSample.mistakes.find((f) => f.kind === 'move.exposed')!
    const mk = (confidence: Finding['confidence']) => describeFinding({ ...base, confidence }, names)
    const exact = mk('exact').explanation
    expect(exact).not.toMatch(/По оценке|Возможно/)
    expect(exact).toContain('В среднем они могли снять')
    const est = mk('estimate').explanation
    expect(est).toMatch(/^После движения отряд «Интерсессоры II \+ Лейтенант» оказался в зоне огня противника/) // fact first, unhedged
    expect(est).toMatch(/\. По оценке, в среднем они могли снять 5,1\u00A0раны\./)
    const h = mk('heuristic')
    expect(h.explanation).toMatch(/\. Возможно, в среднем они могли снять/)
    expect(h.explanation).toMatch(/совет/)
    expect(h.fix).toMatch(/^Если захотите/)
    expect(`${h.title} ${h.explanation} ${h.fix}`).not.toMatch(/критич|провал/i)

    const loss = describeFinding(reportSample.mistakes.find((f) => f.kind === 'loss.attribution')!, names).explanation
    expect(loss).toContain('был уничтожен в ход противника: он потерял 12\u00A0ран. По оценке, атаки отряда «Бойз II» и других должны были снять в среднем примерно 9,8\u00A0раны.')
    expect(loss).not.toMatch(/^По оценке/)

    // every real heuristic finding carries «Возможно, …» on its numeric clause
    for (const f of everyFinding().filter((x) => x.confidence === 'heuristic')) {
      expect(describeFinding(f, namesFor(orksReportSample.battle.scenarioId)).explanation, f.id).toContain('Возможно, ')
    }
  })

  it('the «совет, а не ошибка» suffix is only for heuristic mistake / missed kinds', () => {
    const names = namesFor('combat-patrol')
    for (const kind of ALL_FINDING_KINDS) {
      const src = everyFinding().find((f) => f.kind === kind)!
      const t = describeFinding({ ...src, confidence: 'heuristic' }, names)
      const advice = FINDING_CLASS[kind] === 'mistake' || FINDING_CLASS[kind] === 'missed'
      expect(t.explanation.includes('Это совет по стилю игры, а не ошибка.'), kind).toBe(advice)
      expect(t.fix.startsWith('Если захотите поэкспериментировать: '), kind).toBe(advice)
      expect(t.fix, kind).not.toMatch(/захотите.*так держать/i)
    }
  })

  it('never promises a re-rolled outcome (expected values only)', () => {
    for (const f of everyFinding()) expect(fullText(f), f.id).not.toMatch(/бы убили|убили бы|уничтожили бы/)
  })

  it('uses unit names from the scenario, not raw ids', () => {
    const names = namesFor('combat-patrol')
    const f = reportSample.mistakes.find((x) => x.kind === 'objective.swing')!
    const t = describeFinding(f, names)
    expect(t.explanation).toContain('«Интерсессоры II + Лейтенант»') // the Lieutenant leads Intercessors II
    expect(t.explanation).toContain('отряд «Бойз III»')
    expect(t.explanation).toContain('Цель №3')
    expect(t.explanation).toContain('около 10\u00A0ПО')
  })

  it('luck summary wording follows the luck index and does not blame', () => {
    const names = namesFor('combat-patrol')
    const mk = (luckIndex: number) => describeFinding({ ...reportSample.luck[0], metrics: { ...reportSample.luck[0].metrics, luckIndex } }, names)
    expect(mk(0).title).toBe('Удача в пределах нормы')
    expect(mk(-0.2).title).toBe('Кубики были не на вашей стороне')
    expect(mk(-0.5).title).toBe('Кубики были сильно не на вашей стороне')
    expect(mk(0.2).title).toBe('Кубики были на вашей стороне')
    expect(mk(0.5).title).toBe('Вам сильно повезло с кубиками')
    expect(mk(-0.5).explanation).toMatch(/случай, а не ваши решения/)
  })

  it('wording fixes: charge, battle-shock term, «charge distance» verb, alternative count', () => {
    const names = namesFor('combat-patrol')
    const find = (kind: FindingKind) => everyFinding().find((f) => f.kind === kind)!
    expect(describeFinding(find('charge.failedByLuck'), names).explanation).toContain('объявил атаку на отряд «Бойз III»')
    expect(fullText(find('charge.badOdds'))).toContain('Шанс дойти до цели был около')
    expect(fullText(find('charge.badOdds'))).not.toMatch(/долететь/)
    const bs = describeFinding(find('objective.battleShock'), names).explanation
    expect(bs).toContain('боевого шока (Battle-shock)')
    const good = find('good.targetChoice')
    const alt = (k: number) => describeFinding({ ...good, metrics: { ...good.metrics, alternativeCount: k } }, names).explanation
    expect(alt(1)).toContain('а другая цель дала бы в среднем')
    expect(alt(2)).toContain('а лучшая из 2\u00A0других целей дала бы в среднем')
    expect(alt(21)).toContain('а лучшая из 21\u00A0другой цели дала бы в среднем')
    expect(describeFinding(find('shoot.profileChoice'), names).explanation).toContain('в среднем давал бы')
  })

  describe('«рана» is declined by its role', () => {
    const CASES: Record<WoundCase, string[]> = {
      nom: ['1 рана', '2 раны', '3 раны', '5 ран', '11 ран', '21 рана'],
      acc: ['1 рану', '2 раны', '3 раны', '5 ран', '11 ран', '21 рану'],
      gen: ['1 раны', '2 ран', '3 ран', '5 ран', '11 ран', '21 раны'],
    }
    it.each(Object.entries(CASES) as [WoundCase, string[]][])('woundsText in the %s case', (c, expected) => {
      expect([1, 2, 3, 5, 11, 21].map((n) => woundsText(n, c))).toEqual(expected.map((s) => s.replace(' ', NB)))
    })

    it('any fraction takes «раны» in every case; the form follows the ROUNDED printed number', () => {
      for (const c of ['nom', 'acc', 'gen'] as const) {
        expect(woundsText(1.5, c)).toBe(`1,5${NB}раны`)
        expect(woundsText(0.5, c)).toBe(`0,5${NB}раны`)
        expect(woundsText(21.3, c)).toBe(`21,3${NB}раны`)
      }
      expect(woundsText(5.02, 'acc')).toBe(`5${NB}ран`)
      expect(woundsText(1.04, 'acc')).toBe(`1${NB}рану`)
      expect(woundsText(undefined, 'gen')).toBe('—')
    })

    it('exact sentences use the case their verb / preposition governs', () => {
      const names = namesFor('combat-patrol')
      const find = (kind: FindingKind) => everyFinding().find((f) => f.kind === kind)!
      const set = (f: Finding, m: Record<string, number>): Finding => ({ ...f, metrics: { ...f.metrics, ...m } })
      expect(describeFinding(set(find('result.summary'), { dealtWounds: 1, takenWounds: 21 }), names).explanation).toContain(`Вы сняли 1${NB}рану, потеряли 21${NB}рану.`)
      expect(describeFinding(set(find('result.summary'), { dealtWounds: 2, takenWounds: 5 }), names).explanation).toContain(`Вы сняли 2${NB}раны, потеряли 5${NB}ран.`)
      expect(describeFinding(set(find('shoot.advanceCost'), { chosenExpectedWounds: 1, bestExpectedWounds: 3 }), names).explanation).toContain(`в среднем это давало 1${NB}рану вместо 3${NB}ран при обычном ходе`)
      expect(describeFinding(set(find('shoot.advanceCost'), { chosenExpectedWounds: 2, bestExpectedWounds: 21 }), names).explanation).toContain(`давало 2${NB}раны вместо 21${NB}раны`)
      expect(describeFinding(set(find('loss.attribution'), { takenWounds: 1 }), names).explanation).toContain(`он потерял 1${NB}рану.`)
      expect(describeFinding(set(find('shoot.hazardLoss'), { selfExpectedWounds: 1, gainExpectedWounds: 0, deltaWounds: 1 }), names).explanation).toContain(`теряет 1${NB}рану, а наносит по отряду «Бойз II» 0${NB}ран (в минусе на 1${NB}рану)`)
      expect(describeFinding(set(find('move.chargeExposure'), { expectedMeleeWounds: 1 }), names).explanation).toContain(`оценивается в 1${NB}рану`)
      expect(describeFinding(set(find('luck.swing'), { actualWounds: 1, expectedWounds: 2.5 }), names).explanation).toContain(`сняла 1${NB}рану (атак:`)
      const hl = { ...reportSample, totals: { ...reportSample.totals, damageDealt: 1, damageTaken: 3 } }
      expect(headlineText(hl).totals).toContain(`Вы сняли 1${NB}рану, потеряли 3${NB}раны.`)
    })

    it.each([1, 2, 3, 5, 11, 21, 1.5])('no fixture text has a wrong form of «рана» when every wounds metric is %s', (v) => {
      for (const f of everyFinding()) {
        const t = fullText(withWounds(f, v))
        expect(woundFormViolations(t), `${f.id}: ${t}`).toEqual([])
        const before = (m: RegExpMatchArray, len: number) => t.slice(Math.max(0, m.index! - len), m.index!)
        // the nominative «N рана» (N ends in 1) is only legitimate right after a dash: «потери — 1 рана»
        for (const m of t.matchAll(/(?<![\d,])(\d*1)\u00A0рана(?![а-яё])/g)) {
          expect(before(m, 2), `${f.id} nominative outside a dash slot: «${m[0]}»`).toBe('— ')
        }
        // genitive plural «N ран» after 2–4 is only legitimate after «вместо» (12–14 are «many»: any context)
        for (const m of t.matchAll(/(?<![\d,])(\d*[234])\u00A0ран(?![а-яё])/g)) {
          if (Math.floor((Number(m[1]) % 100) / 10) !== 1) expect(before(m, 7), `${f.id} «${m[0]}»`).toBe('вместо ')
        }
      }
    })

    it('real fixtures never print a form that disagrees with the number', () => {
      for (const [name, r] of Object.entries(REPORTS)) {
        for (const f of allFindings(r)) {
          const t = fullText(f, r.battle.scenarioId)
          expect(woundFormViolations(t), `${name} ${f.id}`).toEqual([])
          expect(t, `${name} ${f.id}`).not.toMatch(/около [\d,]+\u00A0ран/)
          expect(t, `${name} ${f.id}`).not.toMatch(/(?<![\d,])(?:1|21)\u00A0рана(?![а-яё])(?<!— (?:1|21)\u00A0рана)/)
        }
        const h = headlineText(r)
        expect(woundFormViolations(h.totals), name).toEqual([])
      }
    })
  })

  it('an unknown finding kind / note kind never throws and gets a neutral text', () => {
    const names = namesFor('combat-patrol')
    for (const kind of ['totally.new', 'constructor', 'toString', '__proto__']) {
      const f = { ...reportSample.mistakes[0], kind: kind as FindingKind, confidence: 'heuristic' as const }
      const t = describeFinding(f, names)
      expect(t.title).toBe('Наблюдение тренера')
      expect(t.explanation).toMatch(CYRILLIC)
      expect(`${t.explanation} ${t.fix}`).not.toMatch(/совет по стилю|захотите|undefined/)
      expect(planText(kind as FindingKind).title).toMatch(CYRILLIC)
    }
    const note = noteText({ kind: 'brandNew' } as unknown as ReportNote)
    expect(note.title).toBe('Наблюдение тренера')
    expect(note.text).toMatch(CYRILLIC)
    expect(noteText({ kind: 'constructor' } as unknown as ReportNote).title).toBe('Наблюдение тренера')
  })

  it('every plan-able kind has plan text; non-plan kinds get a safe fallback', () => {
    const planKinds = ALL_FINDING_KINDS.filter((k) => FINDING_CLASS[k] === 'mistake' || FINDING_CLASS[k] === 'missed')
    expect(Object.keys(PLAN_TEXT).sort()).toEqual([...planKinds].sort())
    for (const k of planKinds) {
      const t = planText(k)
      expect(t.title.length).toBeGreaterThan(3)
      expect(t.advice).toMatch(CYRILLIC)
    }
    expect(planText('good.cover').title).toMatch(CYRILLIC)
    for (const r of Object.values(REPORTS)) {
      expect(r.plan.length, 'plan is never longer than 3 themes').toBeLessThanOrEqual(3)
      for (const item of r.plan) {
        expect(PLAN_TEXT, item.kind).toHaveProperty(item.kind)
        expect(planText(item.kind).advice).not.toMatch(BAD)
      }
    }
    expect(reportSample.plan).toHaveLength(3)
  })

  it('formats metrics by their declared unit', () => {
    expect(formatMetric('lostVp', 10)).toBe('10\u00A0ПО')
    expect(formatMetric('deltaWounds', 20)).toBe('20\u00A0ран')
    expect(formatMetric('deltaWounds', 0)).toBe('0\u00A0ран')
    expect(formatMetric('chargeProbability', 3 / 36)).toBe('8\u00A0%')
    expect(formatMetric('tailProbability', 0.001)).toBe('меньше 1\u00A0%')
    expect(formatMetric('distanceInches', 7.5)).toBe('7,5″')
    expect(formatMetric('lostVp', 5)).toBe('5\u00A0ПО')
    expect(formatMetric('ratio', 4)).toBe('4×')
    expect(formatMetric('deltaWounds', 4.5)).toBe('4,5\u00A0раны')
    expect(formatMetric('isOwnAttack', 1)).toBe('да')
    expect(formatMetric('attackCount', NaN)).toBe('—')
    for (const key of Object.keys(METRIC_UNITS)) expect(formatMetric(key, 2)).not.toMatch(BAD)
  })

  it('luckIndex never prints a signed zero', () => {
    expect(formatMetric('luckIndex', 0.004)).toBe('0')
    expect(formatMetric('luckIndex', -0.004)).toBe('0')
    expect(formatMetric('luckIndex', 0)).toBe('0')
    expect(formatMetric('luckIndex', 0.19)).toBe('+0,19')
    expect(formatMetric('luckIndex', -0.19)).toBe('−0,19')
  })

  it('Russian plural agrees with the printed number', () => {
    const forms = ['рана', 'раны', 'ран'] as const
    expect([1, 2, 5, 11, 12, 21, 22, 25].map((n) => plural(n, ...forms))).toEqual(['рана', 'раны', 'ран', 'ран', 'ран', 'рана', 'раны', 'ран'])
    expect(woundsText(5.02)).toBe('5\u00A0ран')
    expect(woundsText(1)).toBe('1\u00A0рана')
    expect(woundsText(0.5)).toBe('0,5\u00A0раны')
  })

  it('headline, notes and section labels are clean Russian', () => {
    for (const r of Object.values(REPORTS)) {
      const h = headlineText(r)
      for (const s of [h.verdict, h.context, h.score, h.totals]) expect(s).not.toMatch(BAD)
      for (const n of r.notes) expect(noteText(n).text).not.toMatch(BAD)
    }
    expect(SECTION_TEXT.plan.title).toBe('План на следующий бой')
  })

  it('verdict reads naturally: no double colon, loss / win / draw / open', () => {
    expect(headlineText(reportSample).verdict).toBe('Поражение — победили Орки') // human = marines, orks won
    expect(headlineText(orksReportSample).verdict).toBe('Поражение — победил Космодесант')
    const win = { ...reportSample, battle: { ...reportSample.battle, winner: 'marines' as const } }
    expect(headlineText(win)).toMatchObject({ verdict: 'Победа — Космодесант', tone: 'win' })
    expect(headlineText({ ...reportSample, battle: { ...reportSample.battle, winner: 'draw' as const } }).verdict).toBe('Ничья')
    expect(headlineText(shortGameReportSample).verdict).toBe('Битва не закончена')
    for (const r of Object.values(REPORTS)) expect(headlineText(r).verdict).not.toContain(':')
    expect(noteText(partialReportSample.notes[0]).text).toContain('раунда 3')
  })

  it('empty sections: «данных мало» only for a low-data report', () => {
    expect(emptyText('positives', shortGameReportSample.notes)).toMatch(/данных слишком мало/)
    expect(emptyText('luck', shortGameReportSample.notes)).toMatch(/оценка удачи не показывается/)
    expect(emptyText('positives', reportSample.notes)).toBe('Пока нет удачных решений, которые можно отметить.')
    expect(emptyText('luck', reportSample.notes)).not.toMatch(/данных/)
    expect(emptyText('mistakes', [])).toBe(SECTION_TEXT.mistakes.empty)
  })
})
