import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../../gameState'
import { seededRoller } from '../../dice/dice'
import { apply } from '../../engine'
import { REPORT } from '../config'
import { partialReportSample, reportSample, shortGameReportSample } from '../__fixtures__/report.sample'
import { recordSample, recordSampleFinalState } from '../__fixtures__/record.sample'
import { ALL_FINDING_KINDS, COACH_RECORD_VERSION, COACH_REPORT_VERSION, FINDING_TOPIC } from '../types'
import type { CoachReport, Finding } from '../types'

const allFindings = (r: CoachReport): Finding[] => [
  r.headline, ...r.mistakes, ...r.missed, ...r.luck, ...r.shooting, ...r.movement, ...r.positives,
]
const samples = { reportSample, partialReportSample, shortGameReportSample }

describe('coach contract fixtures', () => {
  it('ALL_FINDING_KINDS has no duplicates and the sample report covers every kind', () => {
    expect(new Set(ALL_FINDING_KINDS).size).toBe(ALL_FINDING_KINDS.length)
    const seen = new Set(allFindings(reportSample).map((x) => x.kind))
    expect(ALL_FINDING_KINDS.filter((k) => !seen.has(k))).toEqual([])
  })

  it('every finding sits in exactly one list, with unique ids', () => {
    for (const r of Object.values(samples)) {
      const ids = allFindings(r).map((x) => x.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it.each(Object.entries(samples))('%s: caps and invariants', (_n, r) => {
    expect(r.version).toBe(COACH_REPORT_VERSION)
    expect(r.mistakes.length).toBeLessThanOrEqual(REPORT.MAX_MISTAKES)
    expect(r.missed.length).toBeLessThanOrEqual(REPORT.MAX_MISSED)
    expect(r.luck.length).toBeLessThanOrEqual(REPORT.MAX_LUCK)
    expect(r.positives.length).toBeLessThanOrEqual(REPORT.MAX_POSITIVES)
    expect(r.shooting.length).toBeLessThanOrEqual(REPORT.MAX_TOPICAL)
    expect(r.movement.length).toBeLessThanOrEqual(REPORT.MAX_TOPICAL)
    expect(r.plan.length).toBeLessThanOrEqual(REPORT.MAX_PLAN)
    expect(r.headline.kind).toBe('result.summary')
    expect(r.timeline.map((t) => t.round)).toEqual(Array.from({ length: r.timeline.length }, (_, i) => r.timeline[0].round + i))
    for (const x of allFindings(r)) {
      if (x.confidence === 'heuristic') expect(x.severity).toBe('info')
      expect(x.frameIndex).toBeGreaterThanOrEqual(0)
      expect(x.round).toBeGreaterThanOrEqual(1)
      expect(Object.values(x.metrics).every(Number.isFinite)).toBe(true)
      expect(x.id.startsWith(`${x.kind}:r${x.round}:f${x.frameIndex}`)).toBe(true)
    }
    expect(r.mistakes.every((x) => x.confidence !== 'heuristic' && x.severity !== 'info')).toBe(true)
    expect(r.totals.luckIndex).toBeGreaterThanOrEqual(-1)
    expect(r.totals.luckIndex).toBeLessThanOrEqual(1)
  })

  it('placement: capped lists hold their own kind family; leftovers sit in their topical list', () => {
    const r = reportSample
    expect(r.missed.every((x) => x.kind.startsWith('missed.'))).toBe(true)
    expect(r.luck.every((x) => x.kind.startsWith('luck.'))).toBe(true)
    expect(r.positives.every((x) => x.kind.startsWith('good.'))).toBe(true)
    expect(r.shooting.every((x) => FINDING_TOPIC[x.kind] === 'shooting')).toBe(true)
    expect(r.movement.every((x) => FINDING_TOPIC[x.kind] === 'movement')).toBe(true)
  })

  it('partial and short-game samples carry their notes', () => {
    expect(partialReportSample.battle.partial).toBe(true)
    expect(partialReportSample.notes.map((n) => n.kind)).toContain('partial')
    expect(shortGameReportSample.battle.rounds).toBe(1)
    expect(shortGameReportSample.notes.map((n) => n.kind)).toContain('lowData')
    expect(allFindings(shortGameReportSample).length).toBeLessThanOrEqual(3)
  })

  it('record sample: versions, tip matches final state, and dice resume from state.rng', () => {
    expect(recordSample.version).toBe(COACH_RECORD_VERSION)
    expect(recordSample.initial.schemaVersion).toBe(SCHEMA_VERSION)
    expect(recordSample.steps.length).toBeGreaterThanOrEqual(2)
    expect(recordSample.tip).toEqual({ nextId: recordSampleFinalState.nextId, rng: recordSampleFinalState.rng })
    // Re-apply without replay(): resuming the roller from each state's own rng reproduces the record.
    let s = recordSample.initial
    for (const step of recordSample.steps) s = apply(s, step.cmd, seededRoller(s.rng))
    expect(s.rng).toBe(recordSample.tip.rng)
    expect(s.nextId).toBe(recordSample.tip.nextId)
    expect(s).toEqual(recordSampleFinalState)
  })
})
