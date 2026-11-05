import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { orksReportSample, partialReportSample, reportSample, shortGameReportSample } from '../__fixtures__/report.sample'
import { findingShapeErrors, impactFromMetrics, severityOf } from '../shape'
import { ALL_FINDING_KINDS, IMPACT_SOURCE } from '../types'
import type { CoachReport, Finding } from '../types'

const all = (r: CoachReport): Finding[] => [r.headline, ...r.mistakes, ...r.missed, ...r.luck, ...r.shooting, ...r.movement, ...r.positives]
const byKind = (kind: Finding['kind']) => [reportSample, orksReportSample].flatMap(all).find((x) => x.kind === kind)!
const errs = (f: Finding, human?: 'marines' | 'orks') => findingShapeErrors(f, human ? { human } : undefined).join(' | ')

describe('findingShapeErrors', () => {
  it('positive: every fixture finding of every sample is clean (with and without ctx)', () => {
    for (const r of [reportSample, partialReportSample, shortGameReportSample, orksReportSample])
      for (const x of all(r)) {
        expect(findingShapeErrors(x), x.id).toEqual([])
        expect(findingShapeErrors(x, { human: r.battle.human }), x.id).toEqual([])
      }
  })

  it('metric keys: a missing, an extra or a renamed key is reported', () => {
    const f = byKind('shoot.targetChoice')
    const { ratio: _ratio, ...missing } = f.metrics
    expect(errs({ ...f, metrics: missing })).toContain('metric keys differ')
    expect(errs({ ...f, metrics: { ...f.metrics, extra: 1 } })).toContain('metric keys differ')
    expect(errs({ ...f, metrics: { ...missing, ratioX: f.metrics.ratio } })).toContain('metric keys differ')
    expect(errs({ ...f, metrics: { ...f.metrics, ratio: NaN } })).toContain('not finite')
  })

  it('refs: a ref outside REF_KEYS is reported; omitting optional refs is fine; a missing REQUIRED ref is reported', () => {
    const f = byKind('shoot.targetChoice')
    expect(errs({ ...f, refs: { ...f.refs, objectiveId: 'o1' } })).toContain('ref objectiveId not allowed')
    expect(errs({ ...f, refs: undefined })).toBe('')
    const sw = byKind('objective.swing')
    expect(errs({ ...sw, refs: { enemyUnitId: 'boyz3' } })).toContain('ref objectiveId is required')
    expect(errs({ ...sw, refs: undefined })).toContain('ref objectiveId is required')
  })

  it('frameIndex: null iff battle-wide; otherwise an integer >= 0', () => {
    const f = byKind('shoot.targetChoice')
    expect(errs({ ...f, frameIndex: null })).toContain('frameIndex null only for battle-wide kinds')
    expect(errs({ ...f, frameIndex: -1 })).toContain('integer >= 0')
    expect(errs({ ...f, frameIndex: 1.5 })).toContain('integer >= 0')
    const h = reportSample.headline
    expect(errs({ ...h, frameIndex: 3 })).toContain('battle-wide kind must have frameIndex null')
  })

  it('unitIds: non-empty for every non-battle-wide kind (incl. missed.waaagh), empty for battle-wide ones', () => {
    const f = byKind('shoot.targetChoice')
    expect(errs({ ...f, unitIds: [], id: 'shoot.targetChoice:r2:f18' })).toContain('unitIds must be non-empty')
    const w = byKind('missed.waaagh')
    expect(w.unitIds.length).toBeGreaterThan(0)
    expect(errs({ ...w, unitIds: [], id: 'missed.waaagh:r3:f20' })).toContain('unitIds must be non-empty')
    expect(errs({ ...reportSample.headline, unitIds: ['int'], id: 'result.summary:r5:fx:int' })).toContain('battle-wide kind must have empty unitIds')
  })

  it('impact: finite, >= 0 and equal to the IMPACT_SOURCE value', () => {
    const f = byKind('shoot.targetChoice')
    expect(errs({ ...f, impact: -1 })).toContain('finite and >= 0')
    expect(errs({ ...f, impact: Infinity })).toContain('finite and >= 0')
    expect(errs({ ...f, impact: NaN })).toContain('finite and >= 0')
    expect(errs({ ...f, impact: f.impact + 0.01 })).toContain('IMPACT_SOURCE value')
    const sw = byKind('objective.swing')
    expect(errs({ ...sw, impact: sw.metrics.swingVp })).toContain('IMPACT_SOURCE value') // forgot VP_TO_WOUNDS
  })

  it('severity: follows the bands (lower edge inclusive) and the per-kind exceptions', () => {
    const f = byKind('shoot.targetChoice')
    expect(errs({ ...f, severity: 'critical' })).toContain('severity critical')
    expect(errs({ ...f, confidence: 'heuristic' })).toContain('severity major != info') // heuristic is always info
    const base = { confidence: 'exact' as const, metrics: {} }
    const S = CONFIG.SHOOT
    expect(severityOf({ ...base, kind: 'shoot.overkill', impact: S.MINOR_WOUNDS - 0.001 })).toBe('info')
    expect(severityOf({ ...base, kind: 'shoot.overkill', impact: S.MINOR_WOUNDS })).toBe('minor')
    expect(severityOf({ ...base, kind: 'shoot.overkill', impact: S.MAJOR_WOUNDS })).toBe('major')
    expect(severityOf({ ...base, kind: 'shoot.overkill', impact: S.CRITICAL_WOUNDS })).toBe('critical')
    expect(severityOf({ ...base, kind: 'objective.swing', impact: CONFIG.MOVE.CRITICAL_WOUNDS })).toBe('critical') // MOVE bands
    expect(severityOf({ ...base, kind: 'missed.shot', impact: CONFIG.MISSED.MAJOR_WOUNDS })).toBe('major') // MISSED bands
    expect(severityOf({ ...base, kind: 'fight.targetChoice', impact: CONFIG.CHARGE.MINOR_WOUNDS })).toBe('minor') // CHARGE bands
    expect(severityOf({ ...base, kind: 'luck.swing', impact: 99 })).toBe('minor')
    expect(severityOf({ ...base, kind: 'good.cover', impact: 99 })).toBe('info')
    expect(severityOf({ ...base, kind: 'luck.summary', impact: 0, metrics: { luckIndex: -CONFIG.LUCK.NOTABLE_BAND } })).toBe('minor')
    expect(severityOf({ ...base, kind: 'luck.summary', impact: 0, metrics: { luckIndex: 0.39 } })).toBe('info')
  })

  it('ctx.config overrides the thresholds used for severity and the vp conversion', () => {
    const f = byKind('shoot.targetChoice') // major under defaults
    const strict = { ...CONFIG, SHOOT: { ...CONFIG.SHOOT, MAJOR_WOUNDS: f.impact + 1, CRITICAL_WOUNDS: f.impact + 2 } }
    expect(findingShapeErrors(f, { human: f.actor, config: strict }).join()).toContain('severity major != minor')
    expect(errs(f)).toBe('')
    const sw = byKind('objective.swing')
    const cheap = { ...CONFIG, REPORT: { ...CONFIG.REPORT, VP_TO_WOUNDS: 1 } }
    expect(findingShapeErrors(sw, { human: sw.actor, config: cheap }).join()).toContain('IMPACT_SOURCE value')
  })

  it('actor: must equal ctx.human when ctx is given; ignored otherwise', () => {
    const f = byKind('shoot.targetChoice') // an Orks-or-Marines fixture finding; take its own actor
    const other = f.actor === 'marines' ? 'orks' : 'marines'
    expect(errs(f, other)).toContain('is not the human')
    expect(errs(f, f.actor)).toBe('')
    expect(errs({ ...f, actor: other })).toBe('')
  })

  it('id: `${kind}:r${round}:f${frame ?? x}[:units]` with an optional `#N` (N >= 2) suffix', () => {
    const f = byKind('shoot.targetChoice')
    expect(errs({ ...f, id: `${f.id}#2` })).toBe('')
    expect(errs({ ...f, id: `${f.id}#17` })).toBe('')
    expect(errs({ ...f, id: `${f.id}#1` })).toContain('does not follow')
    expect(errs({ ...f, id: `${f.id}#` })).toContain('does not follow')
    expect(errs({ ...f, id: `${f.id}x` })).toContain('does not follow')
    expect(errs({ ...f, id: f.id.replace(':r', ':R') })).toContain('does not follow')
    expect(errs({ ...f, round: f.round + 1 })).toContain('does not follow')
    expect(errs({ ...f, frameIndex: (f.frameIndex ?? 0) + 1 })).toContain('does not follow')
    expect(errs({ ...reportSample.headline, id: 'result.summary:r5:f0' })).toContain('does not follow') // battle-wide ids use fx
  })

  it('impactFromMetrics evaluates every source variant', () => {
    expect(impactFromMetrics('shoot.overkill', { wastedWounds: 1.8, wastedShare: 0.6 })).toBe(1.8) // metric
    expect(impactFromMetrics('move.objectiveNeglect', { lostVp: 5, turnCount: 2, distanceInches: 6 })).toBeCloseTo(5 * CONFIG.REPORT.VP_TO_WOUNDS, 12) // vp
    expect(impactFromMetrics('luck.swing', { tailProbability: 0.05, actualWounds: 7, expectedWounds: 3, attackCount: 12, isOwnAttack: 0 })).toBe(4) // absDiff
    expect(impactFromMetrics('luck.swing', { tailProbability: 0.05, actualWounds: 0, expectedWounds: 3.1, attackCount: 12, isOwnAttack: 1 })).toBe(3.1)
    expect(impactFromMetrics('missed.waaagh', { unusedTurnCount: 2 })).toBe(0) // fixed
    expect(impactFromMetrics('charge.badOdds', {})).toBe(CONFIG.CHARGE.BAD_ODDS_IMPACT_WOUNDS)
    expect(impactFromMetrics('shoot.overkill', {})).toBeNaN() // a missing key is not silently 0
    expect(ALL_FINDING_KINDS.every((k) => IMPACT_SOURCE[k] !== undefined)).toBe(true)
  })
})
