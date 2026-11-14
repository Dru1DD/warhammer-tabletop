import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../../gameState'
import { seededRoller } from '../../dice/dice'
import { actor, apply } from '../../engine'
import { PROFILES, WEAPONS } from '../../data/datasheets'
import { SCENARIOS } from '../../scenarios/scenarios'
import { CHARGE_RANGE } from '../../gameState'
import { p2d6AtLeast } from '../../ai/ai'
import { EPS, withinRange } from '../../geometry/geometry'
import { CHARGE, CONFIG, LUCK, MISSED, MOVE, OBJECTIVE, REPORT, SHOOT } from '../config'
import { orksReportSample, ownSourceDamage, partialReportSample, reportSample, shortGameReportSample } from '../__fixtures__/report.sample'
import type { OwnSource } from '../__fixtures__/report.sample'
import { findingShapeErrors, impactFromMetrics } from '../shape'
import { recordSample, recordSampleFinalState, recordSampleStates, referenceDigest } from '../__fixtures__/record.sample'
import {
  ALL_FINDING_KINDS, BATTLE_WIDE_KINDS, COACH_RECORD_VERSION, COACH_REPORT_VERSION, FACTION_GATED_KINDS, FINDING_CLASS, FINDING_TOPIC,
  IMPACT_SOURCE, LOW_DATA_SUPPRESSED_KINDS, METRIC_KEYS, METRIC_UNITS, NOTE_METRIC_KEYS, REF_KEYS, REQUIRED_REFS, SUPERSEDES,
} from '../types'
import type { CoachReport, Finding, FindingKind, PlanItem, Severity } from '../types'
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
  // the samples were recorded when the characters were units of their own ('lt'): their ids are their models' prefix
  for (const u of s.units) for (const p of u.attached ?? []) owner.set(p.models[0].replace(/-\d+$/, ''), u.owner)
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
  // luck.summary has a RESERVED first slot that does not count toward MAX_LUCK
  if (r.luck.filter((x) => x.kind !== 'luck.summary').length > REPORT.MAX_LUCK) v.push('luck over cap')
  if (r.luck.filter((x) => x.kind === 'luck.summary').length > 1 || r.luck.findIndex((x) => x.kind === 'luck.summary') > 0) v.push('luck.summary not first')
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

/** Per-kind trigger thresholds from config (inclusive); returns true when the finding respects them. */
const THRESHOLDS: Partial<Record<FindingKind, (x: Finding, r: CoachReport) => boolean>> = {
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
  'charge.failedByLuck': (x) => x.metrics.chargeProbability >= CHARGE.FAILED_BY_LUCK_MIN_P && !chargeReaches(x.metrics.rollInches, x.metrics.distanceInches),
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
  // the anchor frame may be earlier (first holding Command phase); what must hold is that the battle reached the round
  'missed.waaagh': (_x, r) => r.timeline[r.timeline.length - 1].round >= MISSED.WAAAGH_MIN_ROUND,
  'missed.ammoRunts': (x) => x.metrics.deltaWounds >= MISSED.AMMO_RUNTS_MIN_GAIN_WOUNDS,
  'missed.objective': (x) => x.metrics.lostVp >= MISSED.OBJECTIVE_MIN_VP,
  'objective.swing': (x) => x.metrics.swingVp >= OBJECTIVE.SWING_MIN_VP,
  'objective.battleShock': (x) => x.metrics.lostVp >= OBJECTIVE.BATTLE_SHOCK_MIN_VP,
}

/** The documented charge rule (types.ts, METRIC_UNITS): a 2D6 total `roll` reaches iff roll > 2 && distance <= roll + EPS. */
function chargeReaches(roll: number, distance: number): boolean {
  return roll > 2 && withinRange(distance, roll)
}

/**
 * EXECUTABLE SPEC of the PLAN RULE (types.ts): pool = every `mistake`/`missed` class finding in ANY list with severity != 'info' (heuristic findings are always 'info');
 * rank it; top 2 distinct mistake kinds, then the top distinct missed kind, then fill (merged rank order) up to
 * REPORT.MAX_PLAN; selection order is kept; findingIds = all findings of the kind, in rank order.
 */
function planOf(r: CoachReport): PlanItem[] {
  const rankCmp = (a: Finding, b: Finding) => SEV[a.severity] - SEV[b.severity] || b.impact - a.impact || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const pool = [r.mistakes, r.missed, r.shooting, r.movement, r.luck, r.positives]
    .flat()
    .filter((x) => (FINDING_CLASS[x.kind] === 'mistake' || FINDING_CLASS[x.kind] === 'missed') && x.severity !== 'info')
    .sort(rankCmp)
  const kinds = [...new Set(pool.map((x) => x.kind))] // distinct kinds, ranked by their first finding
  const ofClass = (c: string) => kinds.filter((k) => FINDING_CLASS[k] === c)
  const chosen: FindingKind[] = [...ofClass('mistake').slice(0, 2), ...ofClass('missed').slice(0, 1)]
  for (const k of kinds) if (chosen.length < REPORT.MAX_PLAN && !chosen.includes(k)) chosen.push(k)
  return chosen.map((kind) => ({ kind, findingIds: pool.filter((x) => x.kind === kind).map((x) => x.id) }))
}

/** EXECUTABLE SPEC of the SUPERSEDES match key (types.ts). */
const OBJECTIVE_GROUP: readonly FindingKind[] = ['objective.swing', 'objective.battleShock', 'missed.objective', 'move.objectiveNeglect']
function supersedes(w: Finding, l: Finding): boolean {
  if (w === l || !(SUPERSEDES[w.kind] ?? []).includes(l.kind)) return false
  if (w.actor !== l.actor || w.round !== l.round) return false
  if (OBJECTIVE_GROUP.includes(w.kind) && OBJECTIVE_GROUP.includes(l.kind)) return w.refs?.objectiveId !== undefined && w.refs.objectiveId === l.refs?.objectiveId
  return w.unitIds[0] !== undefined && w.unitIds[0] === l.unitIds[0]
}
const dropSuperseded = (fs: Finding[]) => fs.filter((l) => !fs.some((w) => supersedes(w, l)))

/** Damage-accounting identity violations (types.ts CoachReport.totals): dealt[p] + ownSource[other] == taken[other]. */
function accountingViolations(timeline: CoachReport['timeline'], own: OwnSource): string[] {
  const v: string[] = []
  for (const row of timeline)
    for (const p of ['marines', 'orks'] as PlayerId[]) {
      const o = otherSide(p)
      if (row.stats[p].damageDealt + (own[row.round]?.[o] ?? 0) !== row.stats[o].damageTaken) v.push(`r${row.round}: dealt[${p}] + ownSource[${o}] != taken[${o}]`)
    }
  return v
}

describe('coach contract: kind tables', () => {
  it('every per-kind table covers exactly the same kinds; no duplicates', () => {
    const kinds = [...ALL_FINDING_KINDS].sort()
    expect(new Set(ALL_FINDING_KINDS).size).toBe(ALL_FINDING_KINDS.length)
    for (const table of [FINDING_CLASS, METRIC_KEYS, REF_KEYS, FINDING_TOPIC, IMPACT_SOURCE]) expect(Object.keys(table).sort()).toEqual(kinds)
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
    // offence vs defence are different lessons: no entry may supersede move.noCover (nor involve shoot.coverIgnored)
    expect(Object.values(SUPERSEDES).flat()).not.toContain('move.noCover')
    expect(Object.keys(SUPERSEDES)).not.toContain('shoot.coverIgnored')
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
        // an old character id ('lt') is now the unit it leads
        const unit = scenarioOf(r).s.units.find((u) => u.id === x.unitIds[0] || !!u.attached?.some((p) => p.models[0].startsWith(`${x.unitIds[0]}-`)))!
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
      if (x.frameIndex === null) expect(BATTLE_WIDE_KINDS).toContain(x.kind)
      else { expect(Number.isInteger(x.frameIndex)).toBe(true); expect(x.frameIndex).toBeGreaterThanOrEqual(0) }
      if (BATTLE_WIDE_KINDS.includes(x.kind)) { expect(x.frameIndex).toBeNull(); expect(x.unitIds).toEqual([]) }
      else expect(x.unitIds.length, `${x.id} needs a unit`).toBeGreaterThan(0)
      // impact
      expect(Number.isFinite(x.impact) && x.impact >= 0, x.id).toBe(true)
      if (x.confidence === 'heuristic') expect(x.severity).toBe('info')
    }
  })

  it.each(sampleEntries)('%s: findingShapeErrors is empty for every finding (keys, refs, frame, impact formula, severity, ids)', (_n, r) => {
    for (const x of allFindings(r)) expect(findingShapeErrors(x, { human: r.battle.human }), x.id).toEqual([])
  })

  it.each(sampleEntries)('%s: impact equals its IMPACT_SOURCE value (1e-9); severity exceptions; derived metric relations; thresholds hold', (_n, r) => {
    for (const x of allFindings(r)) {
      expect(Math.abs(x.impact - impactFromMetrics(x.kind, x.metrics)), `${x.id} impact ${x.impact}`).toBeLessThanOrEqual(1e-9)
      if (x.kind === 'luck.swing') expect(x.severity).toBe('minor')
      if (x.kind === 'luck.summary') expect(x.severity).toBe(Math.abs(x.metrics.luckIndex) >= LUCK.NOTABLE_BAND ? 'minor' : 'info')
      if (['result.summary', 'charge.failedByLuck'].includes(x.kind) || x.kind.startsWith('good.')) expect(x.severity).toBe('info')
      if (['result.summary', 'luck.summary', 'charge.failedByLuck'].includes(x.kind)) expect(x.impact).toBe(0)
      // derived relations between metrics
      const m = x.metrics
      const alt = m.bestExpectedWounds ?? m.alternativeExpectedWounds
      if (m.chosenExpectedWounds !== undefined && alt !== undefined && m.deltaWounds !== undefined)
        expect(approx(m.deltaWounds, Math.abs(alt - m.chosenExpectedWounds), 0.05), `${x.id} delta`).toBe(true)
      if (m.ratio !== undefined) expect(approx(m.ratio, m.bestExpectedWounds / m.chosenExpectedWounds, 0.02), `${x.id} ratio`).toBe(true)
      if (x.kind === 'shoot.hazardLoss') expect(approx(m.deltaWounds, m.selfExpectedWounds - m.gainExpectedWounds, 0.05)).toBe(true)
      const check = THRESHOLDS[x.kind]
      if (check) expect(check(x, r), `${x.id} threshold`).toBe(true)
    }
  })

  it.each(sampleEntries)('%s: charge metrics follow the documented rule (reach, probability, range)', (_n, r) => {
    for (const x of allFindings(r).filter((y) => ['charge.badOdds', 'charge.failedByLuck', 'missed.charge', 'move.chargeExposure'].includes(y.kind))) {
      const d = x.metrics.distanceInches
      expect(d, `${x.id} beyond CHARGE_RANGE`).toBeLessThanOrEqual(CHARGE_RANGE + EPS)
      expect(Math.abs(x.metrics.chargeProbability - p2d6AtLeast(Math.max(3, Math.ceil(d - EPS)))), `${x.id} probability`).toBeLessThanOrEqual(1e-9)
      if (x.kind === 'charge.failedByLuck') expect(chargeReaches(x.metrics.rollInches, d), `${x.id} roll must fall short`).toBe(false)
    }
  })

  it.each(sampleEntries)('%s: every list is in rank order (severity, impact desc, id)', (_n, r) => {
    // `luck` is [luck.summary, ...rank order]: the reserved summary slot is exempt from the order
    for (const list of [r.mistakes, r.missed, r.luck.filter((x) => x.kind !== 'luck.summary'), r.shooting, r.movement, r.positives]) {
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
    expect(capViolations({ ...reportSample, luck: [...reportSample.luck, reportSample.luck[1]] })).toContain('luck over cap')
    expect(capViolations({ ...reportSample, luck: [reportSample.luck[1], reportSample.luck[0], ...reportSample.luck.slice(2)] })).toContain('luck.summary not first')
    expect(capViolations({ ...reportSample, positives: [...reportSample.positives, reportSample.positives[0]] })).toContain('positives over cap')
    // overflow without a reason: move a good mistake from a not-full list into a topical list
    const trimmed = { ...reportSample, mistakes: reportSample.mistakes.slice(0, 3), shooting: [...reportSample.shooting, ...reportSample.mistakes.slice(3, 4)] }
    expect(capViolations(trimmed).length).toBeGreaterThan(0)
  })

  it('the samples exercise the caps: full lists, an overflow, and the per-kind cap with room left', () => {
    expect(reportSample.mistakes).toHaveLength(REPORT.MAX_MISTAKES)
    expect(reportSample.missed).toHaveLength(REPORT.MAX_MISSED)
    // luck.summary sits in a reserved first slot on top of MAX_LUCK others
    expect(reportSample.luck).toHaveLength(REPORT.MAX_LUCK + 1)
    expect(reportSample.luck[0].kind).toBe('luck.summary')
    expect(reportSample.positives).toHaveLength(REPORT.MAX_POSITIVES)
    expect(reportSample.shooting.some((x) => FINDING_CLASS[x.kind] === 'mistake' && x.severity !== 'info')).toBe(true) // full-list overflow
    expect(reportSample.shooting.some((x) => FINDING_CLASS[x.kind] === 'positive')).toBe(true) // positive overflow
    // Orks: shoot.targetChoice x2 in mistakes (= MAX_PER_KIND), a third in `shooting`, list not full
    expect(orksReportSample.mistakes.filter((x) => x.kind === 'shoot.targetChoice')).toHaveLength(REPORT.MAX_PER_KIND_IN_MISTAKES)
    expect(orksReportSample.mistakes.length).toBeLessThan(REPORT.MAX_MISTAKES)
    expect(orksReportSample.shooting.map((x) => x.kind)).toEqual(['shoot.targetChoice'])
  })

  it('no sample contains a pair of findings that SUPERSEDES says is redundant (same match key as the ranker uses)', () => {
    for (const r of Object.values(samples)) {
      const fs = allFindings(r)
      expect(dropSuperseded(fs).map((x) => x.id)).toEqual(fs.map((x) => x.id))
    }
  })

  it('SUPERSEDES match keys: objective group on (actor, round, refs.objectiveId); every other pair on unitIds[0] when defined', () => {
    expect([...OBJECTIVE_GROUP].sort()).toEqual(Object.keys(REQUIRED_REFS).sort())
    for (const k of Object.keys(REQUIRED_REFS)) for (const ref of REQUIRED_REFS[k as FindingKind]!) expect(REF_KEYS[k as FindingKind]).toContain(ref)
    const mk = (kind: FindingKind, p: Partial<Finding> = {}): Finding => ({
      id: `${kind}:${JSON.stringify(p)}`, kind, severity: 'major', confidence: 'exact', round: 3, phase: 'movement', actor: 'marines',
      unitIds: ['int'], frameIndex: 10, impact: 5, metrics: {}, refs: OBJECTIVE_GROUP.includes(kind) ? { objectiveId: 'o1' } : undefined, ...p,
    })
    const ids = (fs: Finding[]) => dropSuperseded(fs).map((x) => x.kind).sort()
    // 3-way (here 4-way) match on ONE objective, different units: only the cause survives, whatever the input order
    const group = [
      mk('objective.battleShock', { unitIds: ['aint'] }), mk('objective.swing', { unitIds: ['int2'] }),
      mk('missed.objective', { unitIds: ['lt'] }), mk('move.objectiveNeglect', { unitIds: ['int'] }),
    ]
    for (const perm of [group, [...group].reverse(), [group[2], group[0], group[3], group[1]], [group[1], group[3], group[2], group[0]]])
      expect(ids(perm)).toEqual(['objective.battleShock'])
    expect(ids(group.slice(1))).toEqual(['objective.swing']) // without the shock the flip wins
    expect(ids(group.slice(2))).toEqual(['missed.objective'])
    // same unit, DIFFERENT objective (or a missing objectiveId) -> no match
    expect(ids([mk('objective.swing'), mk('move.objectiveNeglect', { refs: { objectiveId: 'o2' } })])).toHaveLength(2)
    expect(ids([mk('objective.swing'), mk('move.objectiveNeglect', { refs: undefined })])).toHaveLength(2)
    expect(ids([mk('objective.swing', { refs: undefined }), mk('move.objectiveNeglect', { refs: undefined })])).toHaveLength(2)
    // other round / other actor -> no match
    expect(ids([mk('objective.swing'), mk('move.objectiveNeglect', { round: 4 })])).toHaveLength(2)
    expect(ids([mk('objective.swing'), mk('move.objectiveNeglect', { actor: 'orks' })])).toHaveLength(2)
    // non-objective pairs: same unit-turn (different frames!) matches; other unit, empty unitIds -> no match
    expect(ids([mk('shoot.targetChoice'), mk('shoot.overkill', { frameIndex: 99 })])).toEqual(['shoot.targetChoice'])
    expect(ids([mk('shoot.advanceCost'), mk('shoot.firingPosition')])).toEqual(['shoot.advanceCost'])
    expect(ids([mk('shoot.targetChoice'), mk('shoot.overkill', { unitIds: ['int2'] })])).toHaveLength(2)
    expect(ids([mk('shoot.targetChoice', { unitIds: [] }), mk('shoot.overkill', { unitIds: [] })])).toHaveLength(2)
    expect(ids([mk('shoot.targetChoice'), mk('shoot.overkill', { unitIds: [] })])).toHaveLength(2)
    // offence vs defence: both stay
    expect(ids([mk('shoot.coverIgnored'), mk('move.noCover')])).toHaveLength(2)
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
        luckIndex: t.luckIndex, attackDealtWounds: t.attackDealt, expectedDealtWounds: t.expectedDealt, attackTakenWounds: t.attackTaken, expectedTakenWounds: t.expectedTaken,
      })
  })

  it.each(sampleEntries)('%s: damage accounting identity dealt[p] + ownSource[other] == taken[other], every round', (name, r) => {
    const own = ownSourceDamage[name as keyof typeof ownSourceDamage]
    expect(accountingViolations(r.timeline, own)).toEqual([])
    // the human's non-attack damage taken (all-source minus attack) contains at least its own-source damage
    const ownHuman = r.timeline.reduce((a, row) => a + (own[row.round]?.[r.battle.human] ?? 0), 0)
    expect(r.totals.damageTaken - r.totals.attackTaken).toBeGreaterThanOrEqual(ownHuman)
  })

  it('damage accounting: the identity check FAILS when own-source damage is credited as the opponent\'s damage dealt', () => {
    // the pre-r3 fixture: Hazardous wound counted as orks damageDealt (6) -> dealt[orks] != taken[marines] - ownSource... caught
    const wrong = reportSample.timeline.map((row) => (row.round === 2 ? { ...row, stats: { ...row.stats, orks: { ...row.stats.orks, damageDealt: 6 } } } : row))
    expect(accountingViolations(wrong, ownSourceDamage.reportSample)).toHaveLength(1)
    expect(accountingViolations(reportSample.timeline, {})).toHaveLength(1) // forgetting the own-source wound is caught too
    // the Hazardous wound is attributed: marines taken 6 = 5 dealt by orks + 1 own Hazardous
    const r2 = reportSample.timeline[1].stats
    expect([r2.orks.damageDealt, r2.marines.damageTaken]).toEqual([5, 6])
  })

  it('luck.summary has a reserved first slot: first in `luck`, not counted toward MAX_LUCK; removed (with the rest) by lowData', () => {
    for (const r of Object.values(samples)) {
      const rest = r.luck.filter((x) => x.kind !== 'luck.summary')
      expect(rest.length).toBeLessThanOrEqual(REPORT.MAX_LUCK)
      expect(r.luck.filter((x) => x.kind === 'luck.summary').length).toBe(r.luck.length ? 1 : 0)
      if (r.luck.length) expect(r.luck[0].kind).toBe('luck.summary')
    }
    expect(reportSample.luck.filter((x) => x.kind !== 'luck.summary')).toHaveLength(REPORT.MAX_LUCK)
    expect(partialReportSample.luck[0].kind).toBe('luck.summary')
    expect(shortGameReportSample.luck).toEqual([])
  })

  it.each(sampleEntries)('%s: plan items point at existing mistakes/missed-class findings of their kind (any list)', (_n, r) => {
    const pool = new Map(allFindings(r).map((x) => [x.id, x]))
    expect(new Set(r.plan.map((p) => p.kind)).size).toBe(r.plan.length)
    for (const p of r.plan) {
      expect(Object.keys(p).sort()).toEqual(['findingIds', 'kind']) // no lessonId / targetMetric
      expect(p.findingIds.length).toBeGreaterThan(0)
      for (const id of p.findingIds) expect(pool.get(id)?.kind, id).toBe(p.kind)
      expect(['mistake', 'missed']).toContain(FINDING_CLASS[p.kind])
    }
    for (const x of allFindings(r)) expect('lessonId' in x).toBe(false)
  })

  it.each(sampleEntries)('%s: plan equals the PLAN RULE derived from the sample\'s own findings (planOf)', (_n, r) => {
    expect(r.plan).toEqual(planOf(r))
  })

  it('PLAN RULE (planOf): distinct kinds, mistakes first, fill from the next ranked, classes luck/explain/positive/summary excluded, all ids of a kind', () => {
    const [swing, loss] = reportSample.mistakes
    const [mObj, mShot, mCharge] = reportSample.missed
    const base = { ...reportSample, mistakes: [], missed: [], luck: [], shooting: [], movement: [], positives: reportSample.positives }
    // a single mistake kind (two findings) + three missed kinds: 2 mistake slots hold ONE kind; missed 1 + fill
    const twin = { ...swing, id: swing.id + '#2', impact: 1 }
    const r1 = { ...base, mistakes: [swing, twin], missed: [mObj, mShot, mCharge] }
    expect(planOf(r1)).toEqual([
      { kind: 'objective.swing', findingIds: [swing.id, twin.id] },
      { kind: 'missed.objective', findingIds: [mObj.id] },
      { kind: 'missed.shot', findingIds: [mShot.id] },
    ])
    // three mistake kinds, no missed: top 2, then the fill is the 3rd mistake kind
    const r2 = { ...base, mistakes: [swing, loss, reportSample.mistakes[2]] }
    expect(planOf(r2).map((p) => p.kind)).toEqual([swing.kind, loss.kind, reportSample.mistakes[2].kind])
    // positives/luck/headline are ignored; empty pool -> empty plan
    expect(planOf({ ...base, luck: reportSample.luck })).toEqual([])
    // never more than MAX_PLAN
    expect(planOf({ ...base, mistakes: reportSample.mistakes, missed: reportSample.missed })).toHaveLength(REPORT.MAX_PLAN)
    // one kind with a measured (non-info) and a heuristic ('info') finding: only the non-info id is in findingIds
    const info = { ...swing, id: swing.id + '#2', severity: 'info' as const, confidence: 'heuristic' as const, impact: 0.1 }
    expect(planOf({ ...base, mistakes: [swing], movement: [info] })).toEqual([{ kind: swing.kind, findingIds: [swing.id] }])
    // a kind whose only findings are 'info' never enters the plan
    expect(planOf({ ...base, mistakes: [info] })).toEqual([])
  })

  it('IMPACT_SOURCE: every referenced key is a metric of its kind, in the right unit; VP keys convert through VP_TO_WOUNDS', () => {
    for (const k of ALL_FINDING_KINDS) {
      const src = IMPACT_SOURCE[k]
      const keys = src.from === 'metric' || src.from === 'vp' ? [src.key] : src.from === 'absDiff' ? [src.a, src.b] : []
      for (const key of keys) {
        expect(METRIC_KEYS[k], `${k} impact key ${key}`).toContain(key)
        expect(METRIC_UNITS[key], `${k}.${key}`).toBe(src.from === 'vp' ? 'vp' : 'wounds')
      }
      if (src.from === 'fixed') expect(src.value).toBeGreaterThanOrEqual(0)
    }
    expect(impactFromMetrics('objective.swing', { swingVp: 5, humanOc: 0, enemyOc: 0 })).toBeCloseTo(5 * REPORT.VP_TO_WOUNDS, 12)
    expect(IMPACT_SOURCE['charge.badOdds']).toEqual({ from: 'fixed', value: CHARGE.BAD_ODDS_IMPACT_WOUNDS })
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
