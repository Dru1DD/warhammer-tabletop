import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../../gameState'
import { seededRoller } from '../../dice/dice'
import { actor, apply } from '../../engine'
import { PROFILES, WEAPONS } from '../../data/datasheets'
import { SCENARIOS } from '../../scenarios/scenarios'
import { CHARGE, CONFIG, LUCK, MISSED, MOVE, OBJECTIVE, REPORT, SHOOT } from '../config'
import { orksReportSample, partialReportSample, reportSample, shortGameReportSample } from '../__fixtures__/report.sample'
import { recordSample, recordSampleFinalState, recordSampleStates, referenceDigest } from '../__fixtures__/record.sample'
import {
  ALL_FINDING_KINDS, COACH_RECORD_VERSION, COACH_REPORT_VERSION, FACTION_GATED_KINDS, FINDING_CLASS, FINDING_TOPIC,
  LOW_DATA_SUPPRESSED_KINDS, METRIC_KEYS, METRIC_UNITS, NOTE_METRIC_KEYS, REF_KEYS, SUPERSEDES,
} from '../types'
import type { CoachReport, Finding, FindingKind, Severity } from '../types'
import type { PlayerId } from '../../types'

const allFindings = (r: CoachReport): Finding[] => [
  r.headline, ...r.mistakes, ...r.missed, ...r.luck, ...r.shooting, ...r.movement, ...r.positives,
]
const samples = { reportSample, partialReportSample, shortGameReportSample, orksReportSample }
const sampleEntries = Object.entries(samples)
const SEV: Record<Severity, number> = { critical: 0, major: 1, minor: 2, info: 3 }
const approx = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

/** Units and objectives/terrain of a sample's scenario, by side. */
function scenarioOf(r: CoachReport) {
  const s = SCENARIOS.find((x) => x.id === r.battle.scenarioId)!.build()
  const owner = new Map(s.units.map((u) => [u.id, u.owner]))
  return { s, owner, objectives: new Set(s.objectives.map((x) => x.id)), terrain: new Set(s.terrain.map((x) => x.id)) }
}
const otherSide = (p: PlayerId): PlayerId => (p === 'marines' ? 'orks' : 'marines')

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Reference checkers (the same rules the ranker must follow; kept here so the fixtures cannot drift)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Violations of the REPORT caps and of which classes may sit in which list. Empty = fine. */
function capViolations(r: CoachReport): string[] {
  const v: string[] = []
  if (r.mistakes.length > REPORT.MAX_MISTAKES) v.push('mistakes over cap')
  if (r.missed.length > REPORT.MAX_MISSED) v.push('missed over cap')
  if (r.luck.length > REPORT.MAX_LUCK) v.push('luck over cap')
  if (r.positives.length > REPORT.MAX_POSITIVES) v.push('positives over cap')
  if (r.plan.length > REPORT.MAX_PLAN) v.push('plan over cap')
  if (r.shooting.length > REPORT.MAX_TOPICAL) v.push('shooting over cap')
  if (r.movement.length > REPORT.MAX_TOPICAL) v.push('movement over cap')
  const perKind = new Map<FindingKind, number>()
  for (const x of r.mistakes) perKind.set(x.kind, (perKind.get(x.kind) ?? 0) + 1)
  for (const [k, n] of perKind) if (n > REPORT.MAX_PER_KIND_IN_MISTAKES) v.push(`${k} x${n} in mistakes`)
  if (r.mistakes.some((x) => FINDING_CLASS[x.kind] !== 'mistake')) v.push('non-mistake class in mistakes')
  if (r.mistakes.some((x) => x.severity === 'info' || x.confidence === 'heuristic')) v.push('ineligible finding in mistakes')
  if (r.missed.some((x) => FINDING_CLASS[x.kind] !== 'missed')) v.push('non-missed class in missed')
  if (r.luck.some((x) => !['luck', 'explain'].includes(FINDING_CLASS[x.kind]))) v.push('wrong class in luck')
  if (r.positives.some((x) => FINDING_CLASS[x.kind] !== 'positive')) v.push('non-positive class in positives')
  if (FINDING_CLASS[r.headline.kind] !== 'summary') v.push('headline is not a summary')
  if (r.shooting.some((x) => FINDING_TOPIC[x.kind] !== 'shooting')) v.push('wrong topic in shooting')
  if (r.movement.some((x) => FINDING_TOPIC[x.kind] !== 'movement')) v.push('wrong topic in movement')
  // overflow validity: a mistake-class finding in a topical list needs a reason
  for (const x of [...r.shooting, ...r.movement].filter((y) => FINDING_CLASS[y.kind] === 'mistake')) {
    const ineligible = x.severity === 'info' || x.confidence === 'heuristic'
    const full = r.mistakes.length >= REPORT.MAX_MISTAKES
    const kindFull = r.mistakes.filter((y) => y.kind === x.kind).length >= REPORT.MAX_PER_KIND_IN_MISTAKES
    if (!(ineligible || full || kindFull)) v.push(`${x.id} overflowed without a reason`)
  }
  return v
}

/** Severity implied by impact and the section's bands (lower edges inclusive). */
const BAND_OF = (k: FindingKind) =>
  k.startsWith('shoot.') ? SHOOT : k.startsWith('charge.') || k.startsWith('fight.') ? CHARGE : k.startsWith('missed.') ? MISSED : MOVE
const severityOf = (impact: number, b: { MINOR_WOUNDS: number; MAJOR_WOUNDS: number; CRITICAL_WOUNDS: number }): Severity =>
  impact >= b.CRITICAL_WOUNDS ? 'critical' : impact >= b.MAJOR_WOUNDS ? 'major' : impact >= b.MINOR_WOUNDS ? 'minor' : 'info'

/** Per-kind trigger thresholds from config (inclusive); returns true when the finding respects them. */
const THRESHOLDS: Partial<Record<FindingKind, (x: Finding) => boolean>> = {
  'luck.swing': (x) =>
    x.metrics.tailProbability <= LUCK.SWING_MAX_P && Math.abs(x.metrics.actualWounds - x.metrics.expectedWounds) >= LUCK.SWING_MIN_WOUNDS,
  'shoot.targetChoice': (x) => x.metrics.ratio >= SHOOT.TARGET_MIN_RATIO && x.metrics.deltaWounds >= SHOOT.TARGET_MIN_ABS_WOUNDS,
  'shoot.profileChoice': (x) =>
    x.metrics.bestExpectedWounds / x.metrics.chosenExpectedWounds >= SHOOT.PROFILE_MIN_RATIO && x.metrics.deltaWounds >= SHOOT.PROFILE_MIN_ABS_WOUNDS,
  'shoot.overkill': (x) => x.metrics.wastedShare >= SHOOT.OVERKILL_MIN_WASTED_SHARE && x.metrics.wastedWounds >= SHOOT.OVERKILL_MIN_WASTED_WOUNDS,
  'shoot.advanceCost': (x) => x.metrics.deltaWounds >= SHOOT.ADVANCE_COST_MIN_WOUNDS,
  'shoot.coverIgnored': (x) => x.metrics.deltaWounds >= SHOOT.COVER_IGNORED_MIN_WOUNDS,
  'shoot.hazardLoss': (x) => x.metrics.deltaWounds >= SHOOT.HAZARD_MIN_NET_LOSS_WOUNDS - 1e-9,
  'shoot.firingPosition': (x) => x.metrics.deltaWounds >= SHOOT.FIRING_POSITION_MIN_WOUNDS,
  'charge.badOdds': (x) => x.metrics.chargeProbability <= CHARGE.BAD_ODDS_MAX_P,
  'charge.failedByLuck': (x) => x.metrics.chargeProbability >= CHARGE.FAILED_BY_LUCK_MIN_P && x.metrics.rollInches < x.metrics.distanceInches,
  'fight.targetChoice': (x) => x.metrics.ratio >= CHARGE.FIGHT_TARGET_MIN_RATIO && x.metrics.deltaWounds >= CHARGE.FIGHT_TARGET_MIN_ABS_WOUNDS,
  'move.exposed': (x) => x.metrics.enemyExpectedWounds >= MOVE.EXPOSED_MIN_EXPECTED_WOUNDS,
  'move.noCover': (x) => x.metrics.deltaWounds >= MOVE.NO_COVER_MIN_SAVED_WOUNDS,
  'move.objectiveNeglect': (x) => x.metrics.turnCount >= MOVE.OBJECTIVE_NEGLECT_MIN_TURNS,
  'move.chargeExposure': (x) =>
    x.metrics.chargeProbability >= MOVE.CHARGE_EXPOSURE_MIN_P && x.metrics.expectedMeleeWounds >= MOVE.CHARGE_EXPOSURE_MIN_WOUNDS,
  'move.fallBackDecision': (x) => x.metrics.deltaWounds >= MOVE.DECISION_MIN_NET_WOUNDS,
  'move.advanceDecision': (x) => x.metrics.deltaWounds >= MOVE.DECISION_MIN_NET_WOUNDS,
  'missed.shot': (x) => x.metrics.bestExpectedWounds >= MISSED.SHOT_MIN_EXPECTED_WOUNDS,
  'missed.charge': (x) => x.metrics.chargeProbability >= MISSED.CHARGE_MIN_P && x.metrics.expectedMeleeWounds >= MISSED.CHARGE_MIN_EXPECTED_WOUNDS,
  'missed.waaagh': (x) => x.round >= MISSED.WAAAGH_MIN_ROUND,
  'missed.ammoRunts': (x) => x.metrics.deltaWounds >= MISSED.AMMO_RUNTS_MIN_GAIN_WOUNDS,
  'missed.objective': (x) => x.metrics.lostVp >= MISSED.OBJECTIVE_MIN_VP,
  'objective.swing': (x) => x.metrics.swingVp >= OBJECTIVE.SWING_MIN_VP,
  'objective.battleShock': (x) => x.metrics.lostVp >= OBJECTIVE.BATTLE_SHOCK_MIN_VP,
}

/** Metrics that `impact` must equal (wounds-equivalent) for these kinds. */
const IMPACT_SOURCE: Partial<Record<FindingKind, string>> = {
  'move.exposed': 'enemyExpectedWounds',
  'shoot.overkill': 'wastedWounds',
  'move.chargeExposure': 'expectedMeleeWounds',
  'missed.charge': 'expectedMeleeWounds',
  'missed.shot': 'bestExpectedWounds',
}

describe('coach contract: kind tables', () => {
  it('every per-kind table covers exactly the same kinds; no duplicates', () => {
    const kinds = [...ALL_FINDING_KINDS].sort()
    expect(new Set(ALL_FINDING_KINDS).size).toBe(ALL_FINDING_KINDS.length)
    for (const table of [FINDING_CLASS, METRIC_KEYS, REF_KEYS]) expect(Object.keys(table).sort()).toEqual(kinds)
    expect(ALL_FINDING_KINDS).toHaveLength(31)
  })

  it('dropped kinds are gone; new kinds exist', () => {
    const kinds: string[] = ALL_FINDING_KINDS
    expect(kinds).not.toContain('move.blastSpread')
    expect(kinds).not.toContain('charge.forgone')
    expect(kinds).toContain('shoot.firingPosition')
    expect(kinds).toContain('objective.battleShock')
  })

  it('metric keys: unique per kind, all documented in METRIC_UNITS, none unused, suffix matches the unit', () => {
    const used = new Set<string>()
    for (const k of ALL_FINDING_KINDS) {
      expect(new Set(METRIC_KEYS[k]).size).toBe(METRIC_KEYS[k].length)
      expect(new Set(REF_KEYS[k]).size).toBe(REF_KEYS[k].length)
      for (const key of METRIC_KEYS[k]) {
        used.add(key)
        const unit = METRIC_UNITS[key]
        expect(unit, `${k}.${key} has no unit`).toBeDefined()
        const suffix: [RegExp, string][] = [
          [/Wounds$/, 'wounds'], [/Probability$/, 'probability'], [/Inches$/, 'inches'], [/Vp$/, 'vp'],
          [/Count$/, 'count'], [/Share$/, 'share'], [/Oc$/, 'oc'], [/^is[A-Z]/, 'flag'], [/^ratio$/, 'ratio'], [/^luckIndex$/, 'index'],
        ]
        const hit = suffix.find(([re]) => re.test(key))
        expect(hit, `${key} has no canonical suffix`).toBeDefined()
        expect(unit).toBe(hit![1])
      }
    }
    expect(Object.keys(METRIC_UNITS).filter((key) => !used.has(key))).toEqual([])
    // the near-duplicate names the review complained about must not exist
    for (const bad of ['savedWounds', 'lostWounds', 'netLossWounds', 'diffWounds', 'vpSwing', 'vpLost', 'vpForgone']) expect(used.has(bad)).toBe(false)
  })

  it('SUPERSEDES: valid kinds, no self-reference, acyclic', () => {
    for (const [winner, losers] of Object.entries(SUPERSEDES) as [FindingKind, FindingKind[]][]) {
      expect(ALL_FINDING_KINDS).toContain(winner)
      for (const l of losers) {
        expect(ALL_FINDING_KINDS).toContain(l)
        expect(l).not.toBe(winner)
        expect(SUPERSEDES[l] ?? []).not.toContain(winner)
      }
    }
    // the pairs the contract promises
    expect(SUPERSEDES['objective.swing']).toEqual(expect.arrayContaining(['missed.objective', 'move.objectiveNeglect']))
    expect(SUPERSEDES['missed.objective']).toContain('move.objectiveNeglect')
    expect(SUPERSEDES['shoot.coverIgnored']).toContain('move.noCover')
    // direct-only table: a loser listed under a winner is also listed under whoever beats that winner
    for (const [w, losers] of Object.entries(SUPERSEDES) as [FindingKind, FindingKind[]][])
      for (const [w2, losers2] of Object.entries(SUPERSEDES) as [FindingKind, FindingKind[]][])
        if (losers2.includes(w)) for (const l of losers) expect(losers2, `${w2} must also list ${l}`).toContain(l)
  })

  it('classes: charge.failedByLuck explains, positives are good.*, missed are missed.*, luck are luck.*', () => {
    expect(FINDING_CLASS['charge.failedByLuck']).toBe('explain')
    for (const k of ALL_FINDING_KINDS) {
      if (k.startsWith('good.')) expect(FINDING_CLASS[k]).toBe('positive')
      if (k.startsWith('missed.')) expect(FINDING_CLASS[k]).toBe('missed')
      if (k.startsWith('luck.')) expect(FINDING_CLASS[k]).toBe('luck')
    }
    expect([...LOW_DATA_SUPPRESSED_KINDS].sort()).toEqual(['good.efficiency', 'luck.summary', 'luck.swing'])
  })

  it('config: ONE lowData definition lives in REPORT; the old duplicates are gone', () => {
    expect(REPORT.LOW_DATA_MIN_ROUNDS).toBeGreaterThan(0)
    expect(REPORT.LOW_DATA_MIN_ATTACK_ACTIONS).toBeGreaterThan(0)
    expect(REPORT.LOW_DATA_MIN_ATTACK_DICE).toBeGreaterThan(0)
    expect(REPORT.VP_TO_WOUNDS).toBeGreaterThan(0)
    expect(Object.keys(LUCK)).not.toContain('MIN_ATTACKS_FOR_LUCK')
    expect(Object.keys(REPORT)).not.toContain('LOW_DATA_MAX_ROUNDS')
    expect(Object.keys(MOVE)).not.toContain('BLAST_MIN_EXTRA_WOUNDS')
    // every severity band is ascending
    for (const b of [SHOOT, MOVE, CHARGE, MISSED]) {
      expect(b.MINOR_WOUNDS).toBeLessThan(b.MAJOR_WOUNDS)
      expect(b.MAJOR_WOUNDS).toBeLessThan(b.CRITICAL_WOUNDS)
    }
    // one objective-turn of VP (5) reaches 'critical' (documented on Severity)
    expect(5 * REPORT.VP_TO_WOUNDS).toBeGreaterThanOrEqual(MOVE.CRITICAL_WOUNDS)
    expect(CONFIG.REPORT).toBe(REPORT)
  })
})

describe('coach contract: report samples', () => {
  it('the UNION of the samples covers every FindingKind', () => {
    const seen = new Set(Object.values(samples).flatMap((r) => allFindings(r).map((x) => x.kind)))
    expect(ALL_FINDING_KINDS.filter((k) => !seen.has(k))).toEqual([])
  })

  it('faction-gated kinds only appear for their faction; the Orks sample carries the Orks-only kinds', () => {
    for (const r of Object.values(samples))
      for (const x of allFindings(r)) {
        const need = FACTION_GATED_KINDS[x.kind]
        if (need) expect(r.battle.human, x.id).toBe(need)
      }
    const orksKinds = allFindings(orksReportSample).map((x) => x.kind)
    expect(orksKinds).toContain('missed.waaagh')
    expect(orksKinds).toContain('missed.ammoRunts')
    expect(allFindings(reportSample).map((x) => x.kind)).not.toContain('missed.waaagh')
  })

  it.each(sampleEntries)('%s: every finding is the human\'s; unitIds are human units, refs are enemy/scenario ids', (_n, r) => {
    const { owner, objectives, terrain } = scenarioOf(r)
    const human = r.battle.human
    for (const x of allFindings(r)) {
      expect(x.actor, x.id).toBe(human)
      for (const u of x.unitIds) expect(owner.get(u), `${x.id}: ${u}`).toBe(human)
      for (const [key, value] of Object.entries(x.refs ?? {})) {
        expect(REF_KEYS[x.kind], `${x.id}: ref ${key}`).toContain(key)
        if (key.endsWith('UnitId')) expect(owner.get(value), `${x.id}: ${key}=${value}`).toBe(otherSide(human))
        if (key === 'objectiveId') expect(objectives.has(value), `${x.id}: ${value}`).toBe(true)
        if (key === 'terrainId') expect(terrain.has(value), `${x.id}: ${value}`).toBe(true)
        if (key === 'weaponId') expect(WEAPONS[value], `${x.id}: ${value}`).toBeDefined()
        if (key === 'profileIndex' || key === 'betterProfileIndex') expect(value).toMatch(/^\d+$/)
        if (key === 'cause') expect(['rapidFire', 'heavy', 'lineOfSight']).toContain(value)
      }
      // the weapon of an own attack belongs to the primary unit
      const w = x.refs?.weaponId
      if (w && x.unitIds[0] && !(x.kind === 'luck.swing' && x.metrics.isOwnAttack === 0)) {
        const unit = scenarioOf(r).s.units.find((u) => u.id === x.unitIds[0])!
        const weapons = new Set(unit.models.flatMap((mm) => PROFILES[mm.profileId].weapons))
        expect(weapons.has(w), `${x.id}: ${unit.id} has no ${w}`).toBe(true)
      }
    }
  })

  it.each(sampleEntries)('%s: metrics use EXACTLY the kind\'s keys, in valid units; ids; frameIndex; impact', (_n, r) => {
    expect(r.version).toBe(COACH_REPORT_VERSION)
    const ids = allFindings(r).map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const x of allFindings(r)) {
      expect(Object.keys(x.metrics).sort(), x.id).toEqual([...METRIC_KEYS[x.kind]].sort())
      for (const [key, v] of Object.entries(x.metrics)) {
        expect(Number.isFinite(v), `${x.id}.${key}`).toBe(true)
        switch (METRIC_UNITS[key]) {
          case 'probability': case 'share': expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); break
          case 'flag': expect([0, 1]).toContain(v); break
          case 'count': case 'vp': case 'oc': expect(Number.isInteger(v), `${x.id}.${key}`).toBe(true); expect(v).toBeGreaterThanOrEqual(0); break
          case 'ratio': expect(v).toBeGreaterThanOrEqual(1); break
          case 'index': expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); break
          default: expect(v, `${x.id}.${key}`).toBeGreaterThanOrEqual(0)
        }
      }
      // id convention
      expect(x.id.startsWith(`${x.kind}:r${x.round}:f${x.frameIndex ?? 'x'}`), x.id).toBe(true)
      expect(x.round).toBeGreaterThanOrEqual(r.timeline[0].round)
      expect(x.round).toBeLessThanOrEqual(r.timeline[r.timeline.length - 1].round)
      // frameIndex: null only for battle-wide kinds
      if (x.frameIndex === null) expect(['result.summary', 'luck.summary']).toContain(x.kind)
      else { expect(Number.isInteger(x.frameIndex)).toBe(true); expect(x.frameIndex).toBeGreaterThanOrEqual(0) }
      if (x.kind === 'result.summary' || x.kind === 'luck.summary') expect(x.frameIndex).toBeNull()
      // impact
      expect(Number.isFinite(x.impact) && x.impact >= 0, x.id).toBe(true)
      if (x.confidence === 'heuristic') expect(x.severity).toBe('info')
    }
  })

  it.each(sampleEntries)('%s: severity follows the impact bands; impact has its documented source; thresholds hold', (_n, r) => {
    for (const x of allFindings(r)) {
      const cls = FINDING_CLASS[x.kind]
      if (cls === 'mistake' || cls === 'missed') {
        const expected = x.confidence === 'heuristic' ? 'info' : severityOf(x.impact, BAND_OF(x.kind))
        expect(x.severity, `${x.id} impact ${x.impact}`).toBe(expected)
        if (x.metrics.deltaWounds !== undefined) expect(approx(x.impact, x.metrics.deltaWounds, 0.01), `${x.id} impact vs delta`).toBe(true)
      }
      if (x.kind === 'luck.swing') {
        expect(x.severity).toBe('minor')
        expect(approx(x.impact, Math.abs(x.metrics.actualWounds - x.metrics.expectedWounds), 0.01)).toBe(true)
      }
      if (x.kind === 'luck.summary') expect(x.severity).toBe(Math.abs(x.metrics.luckIndex) >= LUCK.NOTABLE_BAND ? 'minor' : 'info')
      if (['result.summary', 'charge.failedByLuck'].includes(x.kind) || x.kind.startsWith('good.')) expect(x.severity).toBe('info')
      if (['result.summary', 'luck.summary', 'charge.failedByLuck'].includes(x.kind)) expect(x.impact).toBe(0)
      // VP kinds: impact = VP * VP_TO_WOUNDS
      const vp = x.metrics.lostVp ?? x.metrics.swingVp ?? x.metrics.scoredVp
      if (vp !== undefined) expect(approx(x.impact, vp * REPORT.VP_TO_WOUNDS, 0.01), `${x.id} VP impact`).toBe(true)
      const src = IMPACT_SOURCE[x.kind]
      if (src) expect(approx(x.impact, x.metrics[src], 0.01), `${x.id} impact source`).toBe(true)
      // derived relations between metrics
      const m = x.metrics
      const alt = m.bestExpectedWounds ?? m.alternativeExpectedWounds
      if (m.chosenExpectedWounds !== undefined && alt !== undefined && m.deltaWounds !== undefined)
        expect(approx(m.deltaWounds, Math.abs(alt - m.chosenExpectedWounds), 0.05), `${x.id} delta`).toBe(true)
      if (m.ratio !== undefined) expect(approx(m.ratio, m.bestExpectedWounds / m.chosenExpectedWounds, 0.02), `${x.id} ratio`).toBe(true)
      if (x.kind === 'shoot.hazardLoss') expect(approx(m.deltaWounds, m.selfExpectedWounds - m.gainExpectedWounds, 0.05)).toBe(true)
      const check = THRESHOLDS[x.kind]
      if (check) expect(check(x), `${x.id} threshold`).toBe(true)
    }
  })

  it.each(sampleEntries)('%s: every list is in rank order (severity, impact desc, id)', (_n, r) => {
    for (const list of [r.mistakes, r.missed, r.luck, r.shooting, r.movement, r.positives]) {
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1], b = list[i]
        const ordered = SEV[a.severity] < SEV[b.severity] || (a.severity === b.severity && (a.impact > b.impact || (a.impact === b.impact && a.id < b.id)))
        expect(ordered, `${a.id} before ${b.id}`).toBe(true)
      }
    }
  })

  it.each(sampleEntries)('%s: caps, classes per list and overflow rules (capViolations is empty)', (_n, r) => {
    expect(capViolations(r)).toEqual([])
    expect(r.headline.kind).toBe('result.summary')
    expect(r.timeline.map((t) => t.round)).toEqual(Array.from({ length: r.timeline.length }, (_, i) => r.timeline[0].round + i))
    expect(r.positives.length === 0 || r.positives.length >= REPORT.MIN_POSITIVES).toBe(true)
  })

  it('cap checks FAIL when a cap, a per-kind cap or a class rule is violated (the test is not vacuous)', () => {
    const extra = reportSample.mistakes[0]
    expect(capViolations({ ...reportSample, mistakes: [...reportSample.mistakes, extra] })).toContain('mistakes over cap')
    const three = [orksReportSample.mistakes[0], { ...orksReportSample.mistakes[0], id: 'x1' }, { ...orksReportSample.mistakes[0], id: 'x2' }]
    expect(capViolations({ ...orksReportSample, mistakes: three }).join()).toContain('shoot.targetChoice x3 in mistakes')
    expect(capViolations({ ...reportSample, mistakes: [...reportSample.mistakes.slice(0, 4), reportSample.luck[1]] })).toContain('non-mistake class in mistakes')
    const heuristic = reportSample.movement.find((x) => x.confidence === 'heuristic')!
    expect(capViolations({ ...reportSample, mistakes: [...reportSample.mistakes.slice(0, 4), heuristic] })).toContain('ineligible finding in mistakes')
    expect(capViolations({ ...reportSample, luck: [...reportSample.luck, reportSample.luck[0]] })).toContain('luck over cap')
    expect(capViolations({ ...reportSample, positives: [...reportSample.positives, reportSample.positives[0]] })).toContain('positives over cap')
    // overflow without a reason: move a good mistake from a not-full list into a topical list
    const trimmed = { ...reportSample, mistakes: reportSample.mistakes.slice(0, 3), shooting: [...reportSample.shooting, ...reportSample.mistakes.slice(3, 4)] }
    expect(capViolations(trimmed).length).toBeGreaterThan(0)
  })

  it('the samples exercise the caps: full lists, an overflow, and the per-kind cap with room left', () => {
    expect(reportSample.mistakes).toHaveLength(REPORT.MAX_MISTAKES)
    expect(reportSample.missed).toHaveLength(REPORT.MAX_MISSED)
    expect(reportSample.luck).toHaveLength(REPORT.MAX_LUCK)
    expect(reportSample.positives).toHaveLength(REPORT.MAX_POSITIVES)
    expect(reportSample.shooting.some((x) => FINDING_CLASS[x.kind] === 'mistake' && x.severity !== 'info')).toBe(true) // full-list overflow
    expect(reportSample.shooting.some((x) => FINDING_CLASS[x.kind] === 'positive')).toBe(true) // positive overflow
    // Orks: shoot.targetChoice x2 in mistakes (= MAX_PER_KIND), a third in `shooting`, list not full
    expect(orksReportSample.mistakes.filter((x) => x.kind === 'shoot.targetChoice')).toHaveLength(REPORT.MAX_PER_KIND_IN_MISTAKES)
    expect(orksReportSample.mistakes.length).toBeLessThan(REPORT.MAX_MISTAKES)
    expect(orksReportSample.shooting.map((x) => x.kind)).toEqual(['shoot.targetChoice'])
  })

  it('no sample contains a pair of findings that SUPERSEDES says is redundant', () => {
    for (const r of Object.values(samples)) {
      const fs = allFindings(r)
      for (const winner of fs)
        for (const loser of fs) {
          if (!(SUPERSEDES[winner.kind] ?? []).includes(loser.kind)) continue
          const same = winner.actor === loser.actor && winner.round === loser.round && winner.unitIds[0] === loser.unitIds[0]
          expect(same, `${winner.id} supersedes ${loser.id}`).toBe(false)
        }
    }
  })

  it.each(sampleEntries)('%s: luckIndex follows the documented formula; totals match the timeline and the headline', (_n, r) => {
    const t = r.totals
    const raw = (t.attackDealt - t.expectedDealt - (t.attackTaken - t.expectedTaken)) / Math.max(t.expectedDealt + t.expectedTaken, LUCK.MIN_NORMALISER)
    expect(approx(t.luckIndex, Math.max(-1, Math.min(1, raw)), 0.005)).toBe(true)
    expect(t.attackDealt).toBeLessThanOrEqual(t.damageDealt)
    expect(t.attackTaken).toBeLessThanOrEqual(t.damageTaken)
    const me = r.timeline.map((x) => x.stats[r.battle.human])
    expect(me.reduce((a, x) => a + x.damageDealt, 0)).toBe(t.damageDealt)
    expect(me.reduce((a, x) => a + x.damageTaken, 0)).toBe(t.damageTaken)
    expect(r.timeline.length).toBe(r.battle.rounds)
    const h = r.headline.metrics
    expect(h).toMatchObject({ roundCount: r.battle.rounds, dealtWounds: t.damageDealt, takenWounds: t.damageTaken })
    const foe = otherSide(r.battle.human)
    expect(h.humanVp).toBe(r.battle.vp[r.battle.human])
    expect(h.enemyVp).toBe(r.battle.vp[foe])
    expect(r.timeline[r.timeline.length - 1].stats[r.battle.human].vp).toBe(r.battle.vp[r.battle.human])
    expect(r.timeline[r.timeline.length - 1].stats[foe].vp).toBe(r.battle.vp[foe])
    const ls = r.luck.find((x) => x.kind === 'luck.summary')
    if (ls)
      expect(ls.metrics).toEqual({
        luckIndex: t.luckIndex, dealtWounds: t.attackDealt, expectedDealtWounds: t.expectedDealt, takenWounds: t.attackTaken, expectedTakenWounds: t.expectedTaken,
      })
  })

  it.each(sampleEntries)('%s: plan items point at existing mistakes/missed findings of their kind', (_n, r) => {
    const pool = new Map([...r.mistakes, ...r.missed].map((x) => [x.id, x]))
    expect(new Set(r.plan.map((p) => p.kind)).size).toBe(r.plan.length)
    for (const p of r.plan) {
      expect(Object.keys(p).sort()).toEqual(['findingIds', 'kind']) // no lessonId / targetMetric
      expect(p.findingIds.length).toBeGreaterThan(0)
      for (const id of p.findingIds) expect(pool.get(id)?.kind, id).toBe(p.kind)
      expect(['mistake', 'missed']).toContain(FINDING_CLASS[p.kind])
    }
    for (const x of allFindings(r)) expect('lessonId' in x).toBe(false)
  })

  it.each(sampleEntries)('%s: notes carry exactly their frozen metric keys; lowData follows the single REPORT definition', (_n, r) => {
    for (const n of r.notes) expect(Object.keys(n.metrics ?? {}).sort()).toEqual([...NOTE_METRIC_KEYS[n.kind]].sort())
    const low = r.notes.find((n) => n.kind === 'lowData')
    expect(r.notes.some((n) => n.kind === 'partial')).toBe(r.battle.partial)
    if (low) {
      const { rounds, humanAttackActions, humanAttackDice } = low.metrics!
      expect(rounds).toBe(r.battle.rounds)
      expect(rounds < REPORT.LOW_DATA_MIN_ROUNDS || humanAttackActions < REPORT.LOW_DATA_MIN_ATTACK_ACTIONS || humanAttackDice < REPORT.LOW_DATA_MIN_ATTACK_DICE).toBe(true)
      const kinds = allFindings(r).map((x) => x.kind)
      for (const k of LOW_DATA_SUPPRESSED_KINDS) expect(kinds).not.toContain(k)
      expect(r.positives).toEqual([])
    } else {
      expect(r.battle.rounds).toBeGreaterThanOrEqual(REPORT.LOW_DATA_MIN_ROUNDS)
    }
  })

  it('the partial sample is the full battle seen from round 3: nothing computed for rounds 3–5 is lost', () => {
    const p = partialReportSample
    expect(p.battle).toMatchObject({ partial: true, rounds: 3 })
    expect(p.notes).toEqual([{ kind: 'partial', metrics: { firstRound: 3 } }])
    expect(p.timeline[0].round).toBe(3)
    expect(p.luck.some((x) => x.kind === 'luck.summary')).toBe(true) // not lowData -> luck summary is kept
    // every round>=3 finding of the full sample (except ones that changed list) exists in the partial one, rebased
    const key = (x: Finding) => `${x.kind}:r${x.round}:${x.unitIds.join('+')}`
    const have = new Set(allFindings(p).map(key))
    for (const x of allFindings(reportSample).filter((y) => y.round >= 3 && y.kind !== 'result.summary')) expect(have.has(key(x)), key(x)).toBe(true)
    for (const x of allFindings(p)) expect(x.round).toBeGreaterThanOrEqual(3)
    // headline severity etc. unchanged by rebasing
    expect(p.headline.kind).toBe('result.summary')
  })

  it('placement of overflow: every sample finding sits in exactly one list', () => {
    for (const r of Object.values(samples)) {
      const lists = [r.mistakes, r.missed, r.luck, r.shooting, r.movement, r.positives]
      const ids = lists.flat().map((x) => x.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).not.toContain(r.headline.id)
    }
  })
})

describe('coach contract: record sample (real engine, real dice)', () => {
  const { steps, initial } = recordSample

  it('versions, tip and dice resume from state.rng', () => {
    expect(recordSample.version).toBe(COACH_RECORD_VERSION)
    expect(initial.schemaVersion).toBe(SCHEMA_VERSION)
    expect(Object.keys(recordSample)).not.toContain('explain')
    expect(steps.length).toBeGreaterThanOrEqual(4)
    expect(recordSample.tip).toEqual({ nextId: recordSampleFinalState.nextId, rng: recordSampleFinalState.rng, digest: referenceDigest(recordSampleFinalState) })
    expect(recordSample.tip.digest).toMatch(/^[0-9a-f]{8}$/)
    let s = initial
    for (const step of steps) s = apply(s, step.cmd, seededRoller(s.rng))
    expect(s).toEqual(recordSampleFinalState)
    expect(recordSampleStates).toHaveLength(steps.length + 1)
    expect(recordSampleStates[0]).toBe(initial)
  })

  it('the battle really rolls dice: tip.rng differs from initial.rng and the dice log grows', () => {
    expect(recordSample.tip.rng).not.toBe(initial.rng)
    expect(recordSampleFinalState.diceLog.length).toBeGreaterThan(initial.diceLog.length)
    expect(steps.some((x) => x.cmd.type === 'declareAdvance')).toBe(true)
    expect(steps.some((x) => x.cmd.type === 'shoot')).toBe(true)
    // at least two steps consumed dice; endPhase/move steps consumed none here
    const diced = steps.filter((_, i) => recordSampleStates[i + 1].rng !== recordSampleStates[i].rng)
    expect(diced.length).toBeGreaterThanOrEqual(2)
  })

  it('each step replays from seededRoller(stateBefore.rng) to exactly the recorded next state; actors match', () => {
    steps.forEach((step, i) => {
      const before = recordSampleStates[i]
      expect(step.actor).toBe(actor(before))
      expect(apply(before, step.cmd, seededRoller(before.rng))).toEqual(recordSampleStates[i + 1])
    })
  })

  it('negative: re-seeding a dice step from a different seed diverges', () => {
    const idx = steps.findIndex((_, i) => recordSampleStates[i + 1].rng !== recordSampleStates[i].rng)
    expect(idx).toBeGreaterThanOrEqual(0)
    const before = recordSampleStates[idx]
    const wrong = apply(before, steps[idx].cmd, seededRoller((before.rng + 1) >>> 0))
    expect(wrong).not.toEqual(recordSampleStates[idx + 1])
    expect(wrong.rng).not.toBe(recordSampleStates[idx + 1].rng)
  })

  it('Frame.diceDelta convention: entries with id >= before.nextId are exactly this step\'s dice', () => {
    steps.forEach((_, i) => {
      const before = recordSampleStates[i], after = recordSampleStates[i + 1]
      const delta = after.diceLog.filter((d) => d.id >= before.nextId)
      expect(delta.length).toBe(after.diceLog.length - before.diceLog.length)
      expect(before.diceLog.every((d) => d.id < before.nextId)).toBe(true)
    })
  })

  it('digest changes when a position or a wound changes (and is stable otherwise)', () => {
    expect(referenceDigest(initial)).toBe(referenceDigest(structuredClone(initial)))
    const moved = structuredClone(initial)
    moved.units[0].models[0].pos.x += 0.5
    expect(referenceDigest(moved)).not.toBe(referenceDigest(initial))
    const hurt = structuredClone(initial)
    hurt.units[0].models[0].wounds += 1
    expect(referenceDigest(hurt)).not.toBe(referenceDigest(initial))
  })
})
