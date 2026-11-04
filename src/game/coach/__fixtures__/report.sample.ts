// Hand-written CoachReport fixtures for UI work and ranker tests. Deterministic: no Date/Math.random.
// Story: human = marines vs standard AI in 'training-outpost'; unit ids match that scenario
// (marines: 'lt', 'int'; orks: 'boyz', ...). Numbers are plausible, not computed from a real replay,
// but internally consistent: luckIndex follows the documented formula and totals equal the human's
// timeline sums (checked in fixtures.test.ts).
// NOTE: `missed.waaagh` and `missed.ammoRunts` are Orks-only kinds, so their `actor: 'orks'` breaks
// faction realism for a marines human; they are here only so every FindingKind is covered. A real
// report has `actor === battle.human` on every finding.

import { COACH_REPORT_VERSION } from '../types'
import type { CoachReport, Finding, FindingKind, ReportNote, RoundSummary } from '../types'

/** Builds a Finding with the id convention `${kind}:r${round}:f${frameIndex}[:${unitIds.join('+')}]`. */
const f = (
  kind: FindingKind,
  p: Pick<Finding, 'severity' | 'confidence' | 'round' | 'phase' | 'unitIds' | 'frameIndex' | 'metrics'> &
    Partial<Pick<Finding, 'actor' | 'lessonId'>>,
): Finding => ({
  id: `${kind}:r${p.round}:f${p.frameIndex}${p.unitIds.length ? `:${p.unitIds.join('+')}` : ''}`,
  kind,
  actor: 'marines',
  ...p,
})

const timeline: RoundSummary[] = [
  { round: 1, stats: { marines: { vp: 0, damageDealt: 2, damageTaken: 3, unitsLost: 0 }, orks: { vp: 0, damageDealt: 3, damageTaken: 2, unitsLost: 0 } } },
  { round: 2, stats: { marines: { vp: 5, damageDealt: 4, damageTaken: 6, unitsLost: 0 }, orks: { vp: 5, damageDealt: 6, damageTaken: 4, unitsLost: 0 } } },
  { round: 3, stats: { marines: { vp: 10, damageDealt: 5, damageTaken: 8, unitsLost: 1 }, orks: { vp: 15, damageDealt: 8, damageTaken: 5, unitsLost: 0 } } },
  { round: 4, stats: { marines: { vp: 10, damageDealt: 2, damageTaken: 5, unitsLost: 0 }, orks: { vp: 25, damageDealt: 5, damageTaken: 2, unitsLost: 1 } } },
  { round: 5, stats: { marines: { vp: 15, damageDealt: 3, damageTaken: 4, unitsLost: 0 }, orks: { vp: 35, damageDealt: 4, damageTaken: 3, unitsLost: 0 } } },
]

const headline = f('result.summary', {
  severity: 'info', confidence: 'exact', round: 5, phase: 'fight', unitIds: [], frameIndex: -1,
  metrics: { rounds: 5, vpHuman: 15, vpAi: 35, damageDealt: 16, damageTaken: 26 },
})

/** Full report: at least one finding of EVERY FindingKind, caps respected, mixed severities/confidences. */
export const reportSample: CoachReport = {
  version: COACH_REPORT_VERSION,
  battle: { scenarioId: 'training-outpost', human: 'marines', aiLevel: 'standard', rounds: 5, winner: 'orks', vp: { marines: 15, orks: 35 }, partial: false },
  headline,
  totals: { damageDealt: 16, damageTaken: 26, expectedDealt: 19.5, expectedTaken: 22.4, luckIndex: -0.17 },
  // mistakes: 5 (cap)
  mistakes: [
    f('loss.attribution', { severity: 'critical', confidence: 'estimate', round: 3, phase: 'shooting', unitIds: ['lt', 'boyz'], frameIndex: 31, metrics: { woundsLost: 4, expectedTakenFromExposure: 5.2, supportingUnits: 1 }, lessonId: 'keep-leader-covered' }),
    f('shoot.targetChoice', { severity: 'major', confidence: 'exact', round: 2, phase: 'shooting', unitIds: ['int', 'boyz', 'nobz'], frameIndex: 18, metrics: { expectedChosen: 1.4, expectedBest: 3.9, ratio: 2.8, diffWounds: 2.5 }, lessonId: 'target-priority' }),
    f('move.exposed', { severity: 'major', confidence: 'estimate', round: 2, phase: 'movement', unitIds: ['int'], frameIndex: 12, metrics: { expectedEnemyWounds: 5.1, shooters: 2, distanceToNearestEnemy: 11.5 }, lessonId: 'exposure' }),
    f('charge.badOdds', { severity: 'minor', confidence: 'exact', round: 3, phase: 'charge', unitIds: ['lt', 'boyz'], frameIndex: 36, metrics: { chargeProbability: 0.08, distanceNeeded: 11.2, roll: 5 }, lessonId: 'charge-odds' }),
    f('objective.swing', { severity: 'major', confidence: 'exact', round: 4, phase: 'movement', unitIds: ['int'], frameIndex: 55, metrics: { objectiveIndex: 2, vpSwing: 10, oc: 2 }, lessonId: 'objectives' }),
  ],
  // missed: 3 (cap); missed.ammoRunts and missed.objective overflow to topical lists
  missed: [
    f('missed.shot', { severity: 'major', confidence: 'exact', round: 1, phase: 'shooting', unitIds: ['lt'], frameIndex: 9, metrics: { expectedWoundsAvailable: 2.2, targetsInRange: 1 } }),
    f('missed.charge', { severity: 'minor', confidence: 'estimate', round: 4, phase: 'charge', unitIds: ['int', 'boyz'], frameIndex: 60, metrics: { chargeProbability: 0.58, expectedMeleeWounds: 2.6 } }),
    f('missed.waaagh', { severity: 'info', confidence: 'heuristic', round: 3, phase: 'command', unitIds: [], frameIndex: 27, actor: 'orks', metrics: { roundReached: 5, riledTurnsAvailable: 2 } }),
  ],
  luck: [
    f('luck.summary', { severity: 'info', confidence: 'exact', round: 5, phase: 'fight', unitIds: [], frameIndex: -1, metrics: { luckIndex: -0.17, damageDealt: 16, expectedDealt: 19.5, damageTaken: 26, expectedTaken: 22.4 } }),
    f('luck.swing', { severity: 'minor', confidence: 'exact', round: 2, phase: 'shooting', unitIds: ['int', 'boyz'], frameIndex: 19, metrics: { probability: 0.06, actualWounds: 0, expectedWounds: 3.1, attacks: 10 } }),
  ],
  shooting: [
    f('shoot.profileChoice', { severity: 'minor', confidence: 'exact', round: 2, phase: 'shooting', unitIds: ['lt'], frameIndex: 20, metrics: { expectedChosen: 1.1, expectedBest: 2.0, diffWounds: 0.9 } }),
    f('shoot.overkill', { severity: 'minor', confidence: 'exact', round: 3, phase: 'shooting', unitIds: ['int', 'boyz'], frameIndex: 33, metrics: { wastedShare: 0.6, wastedWounds: 1.8 } }),
    f('shoot.advanceCost', { severity: 'minor', confidence: 'estimate', round: 1, phase: 'shooting', unitIds: ['int'], frameIndex: 7, metrics: { expectedWithAdvance: 1.2, expectedWithoutAdvance: 2.6, lostWounds: 1.4 } }),
    f('shoot.coverIgnored', { severity: 'minor', confidence: 'estimate', round: 4, phase: 'shooting', unitIds: ['int', 'boyz'], frameIndex: 58, metrics: { expectedChosen: 1.6, expectedUncovered: 2.4, savedWounds: 0.8 } }),
    f('shoot.hazardLoss', { severity: 'minor', confidence: 'exact', round: 2, phase: 'shooting', unitIds: ['lt'], frameIndex: 21, metrics: { expectedSelfWounds: 0.7, expectedGain: 0.1, netLossWounds: 0.6 } }),
    f('missed.ammoRunts', { severity: 'info', confidence: 'exact', round: 3, phase: 'shooting', unitIds: ['boyz'], frameIndex: 34, actor: 'orks', metrics: { gainWounds: 0.6, usedCount: 0 } }),
  ],
  movement: [
    f('charge.forgone', { severity: 'info', confidence: 'heuristic', round: 2, phase: 'charge', unitIds: ['int', 'boyz'], frameIndex: 24, metrics: { chargeProbability: 0.72, expectedMeleeWounds: 2.1 } }),
    f('charge.failedByLuck', { severity: 'info', confidence: 'exact', round: 3, phase: 'charge', unitIds: ['int', 'boyz'], frameIndex: 38, metrics: { chargeProbability: 0.58, roll: 5, distanceNeeded: 7.4 } }),
    f('fight.targetChoice', { severity: 'minor', confidence: 'exact', round: 4, phase: 'fight', unitIds: ['lt', 'boyz', 'nobz'], frameIndex: 64, metrics: { expectedChosen: 1.2, expectedBest: 2.9, diffWounds: 1.7, ratio: 2.4 } }),
    f('move.noCover', { severity: 'minor', confidence: 'estimate', round: 3, phase: 'movement', unitIds: ['int'], frameIndex: 28, metrics: { savedWounds: 1.3, coverDistance: 3.5 } }),
    f('move.objectiveNeglect', { severity: 'major', confidence: 'exact', round: 4, phase: 'movement', unitIds: ['lt', 'int'], frameIndex: 52, metrics: { objectiveIndex: 1, turnsUncontested: 2, vpLost: 10 } }),
    f('move.blastSpread', { severity: 'info', confidence: 'estimate', round: 2, phase: 'movement', unitIds: ['int'], frameIndex: 13, metrics: { extraExpectedWounds: 0.7, modelsInBlastRadius: 4 } }),
    f('move.chargeExposure', { severity: 'minor', confidence: 'estimate', round: 3, phase: 'movement', unitIds: ['lt'], frameIndex: 29, metrics: { enemyChargeProbability: 0.64, expectedMeleeWounds: 2.8 } }),
    f('move.fallBackDecision', { severity: 'minor', confidence: 'estimate', round: 4, phase: 'movement', unitIds: ['int'], frameIndex: 53, metrics: { netExpectedWounds: -1.5, lostShooting: 2.0 } }),
    f('move.advanceDecision', { severity: 'info', confidence: 'heuristic', round: 1, phase: 'movement', unitIds: ['int'], frameIndex: 5, metrics: { netExpectedWounds: -1.1, advanceRoll: 2 } }),
    f('missed.objective', { severity: 'minor', confidence: 'estimate', round: 5, phase: 'movement', unitIds: ['int'], frameIndex: 70, metrics: { objectiveIndex: 3, vpForgone: 5, distance: 4.5 } }),
    f('good.cover', { severity: 'info', confidence: 'estimate', round: 2, phase: 'movement', unitIds: ['lt'], frameIndex: 11, metrics: { savedWounds: 1.2 } }),
  ],
  positives: [
    f('good.targetChoice', { severity: 'info', confidence: 'exact', round: 1, phase: 'shooting', unitIds: ['int', 'boyz'], frameIndex: 8, metrics: { expectedChosen: 3.4, expectedBest: 3.4, alternatives: 2 } }),
    f('good.objectiveHeld', { severity: 'info', confidence: 'exact', round: 3, phase: 'command', unitIds: ['lt'], frameIndex: 26, metrics: { objectiveIndex: 1, roundsHeld: 3, vpScored: 10 } }),
    f('good.efficiency', { severity: 'info', confidence: 'exact', round: 4, phase: 'shooting', unitIds: ['int'], frameIndex: 57, metrics: { actualWounds: 4, expectedWounds: 2.9 } }),
  ],
  plan: [
    { kind: 'shoot.targetChoice', lessonId: 'target-priority', targetMetric: 'ratio' },
    { kind: 'move.exposed', lessonId: 'exposure', targetMetric: 'expectedEnemyWounds' },
    { kind: 'move.objectiveNeglect', lessonId: 'objectives' },
  ],
  timeline,
  notes: [],
}

const partialNote: ReportNote = { kind: 'partial', metrics: { firstRound: 3 } }

/** Record was rebased after a load: rounds 3–5 only, a note says so. */
export const partialReportSample: CoachReport = {
  ...reportSample,
  battle: { ...reportSample.battle, rounds: 3, partial: true },
  // Totals/headline cover rounds 3-5 only (= the timeline rows below).
  headline: { ...headline, metrics: { rounds: 3, vpHuman: 15, vpAi: 35, damageDealt: 10, damageTaken: 17 } },
  totals: { damageDealt: 10, damageTaken: 17, expectedDealt: 12, expectedTaken: 14.5, luckIndex: -0.17 },
  mistakes: reportSample.mistakes.filter((x) => x.round >= 3).slice(0, 2),
  missed: reportSample.missed.filter((x) => x.round >= 3),
  luck: [],
  shooting: reportSample.shooting.filter((x) => x.round >= 3),
  movement: reportSample.movement.filter((x) => x.round >= 3),
  positives: reportSample.positives.filter((x) => x.round >= 3),
  plan: reportSample.plan.slice(1, 3),
  timeline: timeline.filter((r) => r.round >= 3),
  notes: [partialNote],
}

/** One-round game: nearly nothing to say; `lowData` suppresses luck and efficiency. */
export const shortGameReportSample: CoachReport = {
  version: COACH_REPORT_VERSION,
  battle: { scenarioId: 'training-outpost', human: 'marines', aiLevel: 'beginner', rounds: 1, winner: null, vp: { marines: 0, orks: 0 }, partial: false },
  headline: f('result.summary', { severity: 'info', confidence: 'exact', round: 1, phase: 'movement', unitIds: [], frameIndex: -1, metrics: { rounds: 1, vpHuman: 0, vpAi: 0, damageDealt: 0, damageTaken: 1 } }),
  totals: { damageDealt: 0, damageTaken: 1, expectedDealt: 0.8, expectedTaken: 0.5, luckIndex: -0.43 },
  mistakes: [],
  missed: [f('missed.shot', { severity: 'minor', confidence: 'exact', round: 1, phase: 'shooting', unitIds: ['int'], frameIndex: 3, metrics: { expectedWoundsAvailable: 1.6, targetsInRange: 1 } })],
  luck: [],
  shooting: [],
  movement: [],
  positives: [],
  plan: [{ kind: 'missed.shot' }],
  timeline: [{ round: 1, stats: { marines: { vp: 0, damageDealt: 0, damageTaken: 1, unitsLost: 0 }, orks: { vp: 0, damageDealt: 1, damageTaken: 0, unitsLost: 0 } } }],
  notes: [{ kind: 'lowData', metrics: { rounds: 1, humanAttacks: 0 } }],
}
