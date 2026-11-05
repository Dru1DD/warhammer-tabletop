// Hand-written CoachReport fixtures for UI work and ranker tests. Deterministic: no Date/Math.random.
//
// The SET of samples together covers every FindingKind (a real report can never contain all of
// them: some kinds are faction-gated, see FACTION_GATED_KINDS):
//   reportSample          human = marines, 'combat-patrol', 5 rounds: every kind except the Orks-only ones.
//                         Mistakes list is full (overflow to topical lists), luck list full, positives overflow.
//   partialReportSample   the same battle seen through a record rebased at round 3 (rounds 3–5, frames renumbered).
//   shortGameReportSample marines, 'training-outpost', 1 round: lowData.
//   orksReportSample      human = orks, 'combat-patrol', 4 rounds: missed.waaagh + missed.ammoRunts, and a
//                         third shoot.targetChoice kept OUT of `mistakes` by MAX_PER_KIND_IN_MISTAKES.
// INVARIANTS (fixtures.test.ts): every finding has `actor === battle.human`, every `unitIds` entry is a
// unit of the human's side in the sample's scenario (enemy unit ids appear only in `refs`), metric keys are
// exactly METRIC_KEYS[kind], impact equals its IMPACT_SOURCE formula, and no pair of findings is covered by
// SUPERSEDES. Numbers are plausible, not computed from a real replay, but internally consistent (luckIndex
// follows the documented formula; totals equal the human's timeline sums; severity follows the impact bands;
// charge probabilities follow the documented charge rule; every `plan` follows the PLAN RULE; the timeline
// obeys the damage-accounting identity, see `ownSourceDamage`).

import { COACH_REPORT_VERSION, FINDING_TOPIC } from '../types'
import type { CoachReport, Finding, FindingKind, PlanItem, PlayerRoundStats, ReportNote, RoundSummary, Severity } from '../types'
import type { PlayerId } from '../../types'

type FindingInput = Pick<Finding, 'severity' | 'confidence' | 'round' | 'phase' | 'unitIds' | 'frameIndex' | 'impact' | 'metrics'> &
  Partial<Pick<Finding, 'refs'>>

/** Builds a Finding with the id convention `${kind}:r${round}:f${frameIndex ?? 'x'}[:${unitIds.join('+')}]`. */
const makeFinding = (human: PlayerId, kind: FindingKind, p: FindingInput): Finding => ({
  id: `${kind}:r${p.round}:f${p.frameIndex ?? 'x'}${p.unitIds.length ? `:${p.unitIds.join('+')}` : ''}`,
  kind,
  actor: human,
  ...p,
})

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2, info: 3 }

/** Rank order of every report list: severity, then impact descending, then id ascending. */
const rank = (list: Finding[]): Finding[] =>
  [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.impact - a.impact || (a.id < b.id ? -1 : 1))

/**
 * Wounds a player's OWN models lost to the player's OWN sources (Hazardous, Desperate Escape, own Deadly Demise)
 * per round, per sample: `ownSourceDamage[sample][round][player]`. With it the damage-accounting identity holds
 * exactly in every round: `damageDealt[p] + ownSource[other] == damageTaken[other]` (types.ts, CoachReport.totals).
 */
export type OwnSource = Record<number, Partial<Record<PlayerId, number>>>

const round = (r: number, marines: PlayerRoundStats, orks: PlayerRoundStats): RoundSummary => ({ round: r, stats: { marines, orks } })
const st = (vp: number, damageDealt: number, damageTaken: number, unitsLost: number): PlayerRoundStats => ({ vp, damageDealt, damageTaken, unitsLost })

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Sample 1: marines, combat-patrol, 5 rounds (units: lt, int, int2, aint, red vs boyz, boyz2, boyz3, dread)
// ─────────────────────────────────────────────────────────────────────────────────────────────

const m = (kind: FindingKind, p: FindingInput) => makeFinding('marines', kind, p)

const timeline: RoundSummary[] = [
  round(1, st(0, 2, 3, 0), st(0, 3, 2, 0)),
  // marines damageTaken 6 includes 1 wound of their OWN Hazardous (red, f21): taken[marines] only, so orks damageDealt is 5, not 6
  round(2, st(5, 4, 6, 0), st(5, 5, 4, 0)),
  round(3, st(10, 5, 8, 1), st(15, 8, 5, 0)),
  round(4, st(10, 2, 5, 0), st(25, 5, 2, 1)),
  round(5, st(15, 3, 4, 0), st(35, 4, 3, 0)),
]

const headline = m('result.summary', {
  severity: 'info', confidence: 'exact', round: 5, phase: 'fight', unitIds: [], frameIndex: null, impact: 0,
  metrics: { roundCount: 5, humanVp: 15, enemyVp: 35, dealtWounds: 16, takenWounds: 26 },
})

// ---- mistakes (class 'mistake'): the top five by rank
const swing = m('objective.swing', {
  severity: 'critical', confidence: 'exact', round: 4, phase: 'movement', unitIds: ['int2'], frameIndex: 55, impact: 12,
  metrics: { swingVp: 10, humanOc: 2, enemyOc: 5 }, refs: { objectiveId: 'o3', enemyUnitId: 'boyz3' },
})
const lossAttribution = m('loss.attribution', {
  severity: 'critical', confidence: 'estimate', round: 3, phase: 'shooting', unitIds: ['red'], frameIndex: 31, impact: 9.8,
  metrics: { takenWounds: 12, enemyExpectedWounds: 9.8, decisionCount: 2 }, refs: { enemyUnitId: 'boyz2' },
})
const neglect = m('move.objectiveNeglect', {
  severity: 'critical', confidence: 'exact', round: 4, phase: 'movement', unitIds: ['lt'], frameIndex: 52, impact: 6,
  metrics: { lostVp: 5, turnCount: 2, distanceInches: 6.5 }, refs: { objectiveId: 'o2' },
})
const battleShock = m('objective.battleShock', {
  severity: 'critical', confidence: 'exact', round: 3, phase: 'command', unitIds: ['aint'], frameIndex: 26, impact: 6,
  metrics: { lostVp: 5, lostOc: 4, enemyOc: 5 }, refs: { objectiveId: 'o1', enemyUnitId: 'boyz' },
})
const exposed = m('move.exposed', {
  severity: 'major', confidence: 'estimate', round: 2, phase: 'movement', unitIds: ['int2'], frameIndex: 12, impact: 5.1,
  metrics: { enemyExpectedWounds: 5.1, shooterCount: 2, distanceInches: 11.5 }, refs: { enemyUnitId: 'boyz3' },
})

// ---- mistake-class findings that overflowed into topical lists (mistakes list is full)
const targetChoice1 = m('shoot.targetChoice', {
  severity: 'major', confidence: 'exact', round: 2, phase: 'shooting', unitIds: ['int'], frameIndex: 18, impact: 4.5,
  metrics: { chosenExpectedWounds: 1.5, bestExpectedWounds: 6, deltaWounds: 4.5, ratio: 4 },
  refs: { targetUnitId: 'boyz', betterTargetUnitId: 'boyz2', weaponId: 'boltRifle' },
})
const targetChoice2 = m('shoot.targetChoice', {
  severity: 'major', confidence: 'exact', round: 3, phase: 'shooting', unitIds: ['int2'], frameIndex: 33, impact: 3.4,
  metrics: { chosenExpectedWounds: 1.1, bestExpectedWounds: 4.5, deltaWounds: 3.4, ratio: 4.09 },
  refs: { targetUnitId: 'boyz3', betterTargetUnitId: 'boyz', weaponId: 'boltRifle' },
})
const profileChoice = m('shoot.profileChoice', {
  severity: 'minor', confidence: 'exact', round: 2, phase: 'shooting', unitIds: ['red'], frameIndex: 20, impact: 1,
  metrics: { chosenExpectedWounds: 1.25, bestExpectedWounds: 2.25, deltaWounds: 1 },
  refs: { targetUnitId: 'boyz2', weaponId: 'macroPlasma', profileIndex: '0', betterProfileIndex: '1' },
})
const overkill = m('shoot.overkill', {
  severity: 'minor', confidence: 'exact', round: 3, phase: 'shooting', unitIds: ['int'], frameIndex: 34, impact: 1.8,
  metrics: { wastedWounds: 1.8, wastedShare: 0.6 }, refs: { targetUnitId: 'boyz2', weaponId: 'boltRifle' },
})
const advanceCost = m('shoot.advanceCost', {
  severity: 'minor', confidence: 'estimate', round: 1, phase: 'shooting', unitIds: ['int2'], frameIndex: 7, impact: 1.4,
  metrics: { chosenExpectedWounds: 1.2, bestExpectedWounds: 2.6, deltaWounds: 1.4, advanceRollInches: 4 }, refs: { targetUnitId: 'boyz' },
})
const coverIgnored = m('shoot.coverIgnored', {
  severity: 'minor', confidence: 'estimate', round: 4, phase: 'shooting', unitIds: ['int'], frameIndex: 59, impact: 1.2,
  metrics: { chosenExpectedWounds: 3.0, bestExpectedWounds: 4.2, deltaWounds: 1.2 }, // ratio 1.4 < TARGET_MIN_RATIO: NOT also a shoot.targetChoice
  refs: { targetUnitId: 'boyz3', betterTargetUnitId: 'boyz2', terrainId: 't4' },
})
const hazardLoss = m('shoot.hazardLoss', {
  severity: 'info', confidence: 'exact', round: 2, phase: 'shooting', unitIds: ['red'], frameIndex: 21, impact: 0.5,
  metrics: { selfExpectedWounds: 0.7, gainExpectedWounds: 0.2, deltaWounds: 0.5 },
  refs: { targetUnitId: 'boyz2', weaponId: 'macroPlasma', profileIndex: '1' },
})
const firingPosition = m('shoot.firingPosition', {
  severity: 'minor', confidence: 'estimate', round: 3, phase: 'shooting', unitIds: ['int'], frameIndex: 35, impact: 1.2,
  metrics: { chosenExpectedWounds: 1.4, bestExpectedWounds: 2.6, deltaWounds: 1.2, distanceInches: 13.5 },
  refs: { targetUnitId: 'boyz', weaponId: 'boltRifle', cause: 'rapidFire' },
})
const badOdds = m('charge.badOdds', {
  severity: 'minor', confidence: 'exact', round: 2, phase: 'charge', unitIds: ['aint'], frameIndex: 16, impact: 1.5,
  metrics: { chargeProbability: 3 / 36, distanceInches: 10.8, rollInches: 5 }, refs: { targetUnitId: 'boyz2' }, // needs 11+ on 2D6
})
const fightTarget = m('fight.targetChoice', {
  severity: 'minor', confidence: 'exact', round: 4, phase: 'fight', unitIds: ['aint'], frameIndex: 64, impact: 1.7,
  metrics: { chosenExpectedWounds: 1.2, bestExpectedWounds: 2.9, deltaWounds: 1.7, ratio: 2.42 },
  refs: { targetUnitId: 'boyz', betterTargetUnitId: 'boyz2' },
})
const noCover = m('move.noCover', {
  severity: 'minor', confidence: 'estimate', round: 3, phase: 'movement', unitIds: ['int2'], frameIndex: 28, impact: 1.3,
  metrics: { chosenExpectedWounds: 3.4, bestExpectedWounds: 2.1, deltaWounds: 1.3, distanceInches: 3.5 }, refs: { terrainId: 't9' },
})
const chargeExposure = m('move.chargeExposure', {
  severity: 'minor', confidence: 'estimate', round: 3, phase: 'movement', unitIds: ['lt'], frameIndex: 29, impact: 2.8,
  metrics: { chargeProbability: 21 / 36, expectedMeleeWounds: 2.8, distanceInches: 6.5 }, refs: { enemyUnitId: 'boyz2' }, // needs 7+
})
const fallBack = m('move.fallBackDecision', {
  severity: 'minor', confidence: 'estimate', round: 4, phase: 'movement', unitIds: ['int'], frameIndex: 53, impact: 1.5,
  metrics: { chosenExpectedWounds: 4, bestExpectedWounds: 2.5, deltaWounds: 1.5 }, refs: { enemyUnitId: 'boyz3' },
})
const advanceDecision = m('move.advanceDecision', {
  severity: 'info', confidence: 'heuristic', round: 1, phase: 'movement', unitIds: ['int'], frameIndex: 5, impact: 1.1,
  metrics: { chosenExpectedWounds: 2.2, bestExpectedWounds: 1.1, deltaWounds: 1.1, advanceRollInches: 2 }, refs: { targetUnitId: 'boyz' },
})

// ---- missed (class 'missed'): exactly MAX_MISSED
const missedObjective = m('missed.objective', {
  severity: 'critical', confidence: 'estimate', round: 5, phase: 'movement', unitIds: ['int'], frameIndex: 70, impact: 6,
  metrics: { lostVp: 5, distanceInches: 4.5 }, refs: { objectiveId: 'o2' },
})
const missedShot = m('missed.shot', {
  severity: 'major', confidence: 'exact', round: 1, phase: 'shooting', unitIds: ['lt'], frameIndex: 9, impact: 3.2,
  metrics: { bestExpectedWounds: 3.2, targetCount: 2 }, refs: { targetUnitId: 'boyz', weaponId: 'plasmaPistol' },
})
const missedCharge = m('missed.charge', {
  severity: 'minor', confidence: 'estimate', round: 4, phase: 'charge', unitIds: ['aint'], frameIndex: 60, impact: 2.6,
  metrics: { chargeProbability: 15 / 36, expectedMeleeWounds: 2.6, distanceInches: 7.5 }, refs: { targetUnitId: 'boyz3' }, // needs 8+
})

// ---- luck (class 'luck' / 'explain'): exactly MAX_LUCK
const luckSummary = m('luck.summary', {
  severity: 'info', confidence: 'exact', round: 5, phase: 'fight', unitIds: [], frameIndex: null, impact: 0,
  metrics: { luckIndex: -0.19, attackDealtWounds: 16, expectedDealtWounds: 19.5, attackTakenWounds: 25, expectedTakenWounds: 20.9 },
})
const luckSwing = m('luck.swing', {
  severity: 'minor', confidence: 'exact', round: 2, phase: 'shooting', unitIds: ['int'], frameIndex: 19, impact: 3.1,
  metrics: { tailProbability: 0.06, actualWounds: 0, expectedWounds: 3.1, attackCount: 10, isOwnAttack: 1 },
  refs: { targetUnitId: 'boyz', weaponId: 'boltRifle', profileIndex: '0' },
})
// an enemy attack on the human (isOwnAttack 0): primary unit = the defender; luck.swing costs a luck slot, like failedByLuck
const luckSwing2 = m('luck.swing', {
  severity: 'minor', confidence: 'exact', round: 3, phase: 'shooting', unitIds: ['aint'], frameIndex: 43, impact: 4.4,
  metrics: { tailProbability: 0.04, actualWounds: 9, expectedWounds: 4.6, attackCount: 14, isOwnAttack: 0 }, refs: { enemyUnitId: 'boyz2' },
})
const failedByLuck = m('charge.failedByLuck', {
  severity: 'info', confidence: 'exact', round: 3, phase: 'charge', unitIds: ['int2'], frameIndex: 38, impact: 0,
  metrics: { chargeProbability: 21 / 36, distanceInches: 6.6, rollInches: 5 }, refs: { targetUnitId: 'boyz3' }, // needs 7+, rolled 5
})

/** `luck`: luck.summary FIRST (reserved slot, not counted toward MAX_LUCK), then the rest in rank order. */
const luckList = (summary: Finding, ...rest: Finding[]): Finding[] => [summary, ...rank(rest)]

// ---- positives (class 'positive'): top MAX_POSITIVES; the fourth overflows to `shooting`
const objectiveHeld = m('good.objectiveHeld', {
  severity: 'info', confidence: 'exact', round: 3, phase: 'command', unitIds: ['lt'], frameIndex: 26, impact: 12,
  metrics: { turnCount: 3, scoredVp: 10 }, refs: { objectiveId: 'o1' },
})
const goodCover = m('good.cover', {
  severity: 'info', confidence: 'estimate', round: 2, phase: 'movement', unitIds: ['lt'], frameIndex: 11, impact: 1.2,
  metrics: { chosenExpectedWounds: 1.8, alternativeExpectedWounds: 3, deltaWounds: 1.2 }, refs: { terrainId: 't9' },
})
const goodEfficiency = m('good.efficiency', {
  severity: 'info', confidence: 'exact', round: 4, phase: 'shooting', unitIds: ['int'], frameIndex: 57, impact: 1.1,
  metrics: { attackDealtWounds: 4, expectedDealtWounds: 2.9, attackCount: 12 }, refs: { targetUnitId: 'boyz2' },
})
const goodTarget = m('good.targetChoice', {
  severity: 'info', confidence: 'exact', round: 1, phase: 'shooting', unitIds: ['int'], frameIndex: 8, impact: 0.9,
  metrics: { chosenExpectedWounds: 3.4, alternativeExpectedWounds: 2.5, alternativeCount: 2 }, refs: { targetUnitId: 'boyz' },
})

const planItem = (kind: FindingKind, ...fs: Finding[]): PlanItem => ({ kind, findingIds: fs.map((x) => x.id) })

/** Full report: at least one finding of EVERY non-faction-gated kind; caps saturated; overflow shown. */
export const reportSample: CoachReport = {
  version: COACH_REPORT_VERSION,
  battle: { scenarioId: 'combat-patrol', human: 'marines', aiLevel: 'standard', rounds: 5, winner: 'orks', vp: { marines: 15, orks: 35 }, partial: false },
  headline,
  // luckIndex = ((16 - 19.5) - (25 - 20.9)) / max(19.5 + 20.9, 3) = -7.6 / 40.4 = -0.188 -> -0.19
  totals: { damageDealt: 16, damageTaken: 26, attackDealt: 16, attackTaken: 25, expectedDealt: 19.5, expectedTaken: 20.9, luckIndex: -0.19 },
  mistakes: rank([swing, lossAttribution, neglect, battleShock, exposed]),
  missed: rank([missedObjective, missedShot, missedCharge]),
  luck: luckList(luckSummary, luckSwing, luckSwing2, failedByLuck),
  shooting: rank([targetChoice1, targetChoice2, profileChoice, overkill, advanceCost, coverIgnored, hazardLoss, firingPosition, goodTarget]),
  movement: rank([badOdds, fightTarget, noCover, chargeExposure, fallBack, advanceDecision]),
  positives: rank([objectiveHeld, goodCover, goodEfficiency]),
  // PLAN RULE: top 2 distinct mistake kinds (objective.swing 12, loss.attribution 9.8), then the top missed kind (missed.objective)
  plan: [planItem('objective.swing', swing), planItem('loss.attribution', lossAttribution), planItem('missed.objective', missedObjective)],
  timeline,
  notes: [],
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Sample 2: the same battle, record rebased at round 3 (frames renumbered; rounds 3–5 only)
// ─────────────────────────────────────────────────────────────────────────────────────────────

const FRAME_OFFSET = 26 // first frame of round 3 in the full battle is 26 -> 0 in the rebased record (the first recorded frame after a rebase has index 0)
const inPartial = (x: Finding) => x.round >= 3
const rebase = (x: Finding): Finding => {
  const frameIndex = x.frameIndex === null ? null : x.frameIndex - FRAME_OFFSET
  return { ...x, frameIndex, id: `${x.kind}:r${x.round}:f${frameIndex ?? 'x'}${x.unitIds.length ? `:${x.unitIds.join('+')}` : ''}` }
}
const rb = (list: Finding[]) => rank(list.filter(inPartial).map(rebase))

const partialTargetChoice2 = rebase(targetChoice2)
const partialMistakes = rank([...reportSample.mistakes.filter(inPartial).map(rebase), partialTargetChoice2]) // exposed (r2) is gone -> next in rank joins
const partialMissed = rb(reportSample.missed)

// Round 3-5 luck: luck.summary recomputed for the recorded rounds (it is NOT dropped: the game is not lowData);
// luck.swing (r2) is outside the record; luck.swing r3 and charge.failedByLuck (r3) stay.
// luckIndex = ((10 - 12) - (17 - 15)) / max(12 + 15, 3) = -4 / 27 = -0.148 -> -0.15
const partialLuckSummary = m('luck.summary', {
  severity: 'info', confidence: 'exact', round: 5, phase: 'fight', unitIds: [], frameIndex: null, impact: 0,
  metrics: { luckIndex: -0.15, attackDealtWounds: 10, expectedDealtWounds: 12, attackTakenWounds: 17, expectedTakenWounds: 15 },
})
const partialNotes: ReportNote[] = [{ kind: 'partial', metrics: { firstRound: 3 } }]
// Overflow lists: what remains of the topical lists in rounds 3-5 (targetChoice2 moved up into `mistakes`).
const partialOverflow = [...reportSample.shooting, ...reportSample.movement].filter((x) => x.id !== targetChoice2.id)
const topical = (t: 'shooting' | 'movement') => rb(partialOverflow.filter((x) => FINDING_TOPIC[x.kind] === t))

/** Record was rebased after a load: rounds 3–5 only, a note says so. Everything computed for those rounds is kept. */
export const partialReportSample: CoachReport = {
  ...reportSample,
  battle: { ...reportSample.battle, rounds: 3, partial: true },
  // Totals/headline cover rounds 3-5 only (= the timeline rows below).
  headline: { ...headline, metrics: { roundCount: 3, humanVp: 15, enemyVp: 35, dealtWounds: 10, takenWounds: 17 } },
  totals: { damageDealt: 10, damageTaken: 17, attackDealt: 10, attackTaken: 17, expectedDealt: 12, expectedTaken: 15, luckIndex: -0.15 },
  mistakes: partialMistakes,
  missed: partialMissed,
  luck: luckList(partialLuckSummary, rebase(luckSwing2), rebase(failedByLuck)),
  shooting: topical('shooting'),
  movement: topical('movement'),
  positives: rb(reportSample.positives),
  // PLAN RULE on the rebased lists: same top kinds as the full battle (move.exposed is outside the record)
  plan: [
    planItem('objective.swing', rebase(swing)),
    planItem('loss.attribution', rebase(lossAttribution)),
    planItem('missed.objective', rebase(missedObjective)),
  ],
  timeline: timeline.filter((r) => r.round >= 3),
  notes: partialNotes,
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Sample 3: one-round game, marines, training-outpost (units: lt, int vs boyz): lowData
// ─────────────────────────────────────────────────────────────────────────────────────────────

const shortMissedShot = m('missed.shot', {
  severity: 'minor', confidence: 'exact', round: 1, phase: 'shooting', unitIds: ['int'], frameIndex: 3, impact: 1.6,
  metrics: { bestExpectedWounds: 1.6, targetCount: 1 }, refs: { targetUnitId: 'boyz', weaponId: 'boltRifle' },
})

/** One-round game: nearly nothing to say; `lowData` removed luck, efficiency and positives. */
export const shortGameReportSample: CoachReport = {
  version: COACH_REPORT_VERSION,
  battle: { scenarioId: 'training-outpost', human: 'marines', aiLevel: 'beginner', rounds: 1, winner: null, vp: { marines: 0, orks: 0 }, partial: false },
  headline: m('result.summary', {
    severity: 'info', confidence: 'exact', round: 1, phase: 'movement', unitIds: [], frameIndex: null, impact: 0,
    metrics: { roundCount: 1, humanVp: 0, enemyVp: 0, dealtWounds: 0, takenWounds: 1 },
  }),
  // luckIndex = ((0 - 0.8) - (1 - 0.5)) / max(0.8 + 0.5, 3) = -1.3 / 3 = -0.433 -> -0.43 (denominator floored by MIN_NORMALISER)
  totals: { damageDealt: 0, damageTaken: 1, attackDealt: 0, attackTaken: 1, expectedDealt: 0.8, expectedTaken: 0.5, luckIndex: -0.43 },
  mistakes: [],
  missed: [shortMissedShot],
  luck: [],
  shooting: [],
  movement: [],
  positives: [],
  plan: [planItem('missed.shot', shortMissedShot)], // PLAN RULE: no mistakes; the top missed kind; nothing to fill with
  timeline: [round(1, st(0, 0, 1, 0), st(0, 1, 0, 0))],
  notes: [{ kind: 'lowData', metrics: { rounds: 1, humanAttackActions: 2, humanAttackDice: 6 } }],
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Sample 4: human = orks, combat-patrol, 4 rounds (units: boyz, boyz2, boyz3, dread vs lt, int, int2, aint, red)
// ─────────────────────────────────────────────────────────────────────────────────────────────

const o = (kind: FindingKind, p: FindingInput) => makeFinding('orks', kind, p)

const orksTimeline: RoundSummary[] = [
  round(1, st(0, 4, 3, 0), st(0, 3, 4, 0)),
  round(2, st(5, 7, 5, 0), st(5, 5, 7, 1)),
  round(3, st(15, 9, 4, 0), st(5, 4, 9, 1)),
  round(4, st(25, 6, 2, 1), st(10, 2, 6, 0)),
]

const oTarget1 = o('shoot.targetChoice', {
  severity: 'major', confidence: 'exact', round: 2, phase: 'shooting', unitIds: ['boyz'], frameIndex: 14, impact: 5,
  metrics: { chosenExpectedWounds: 1.5, bestExpectedWounds: 6.5, deltaWounds: 5, ratio: 4.33 },
  refs: { targetUnitId: 'int', betterTargetUnitId: 'int2', weaponId: 'bigShoota' },
})
const oExposed = o('move.exposed', {
  severity: 'major', confidence: 'estimate', round: 2, phase: 'movement', unitIds: ['boyz3'], frameIndex: 10, impact: 4.2,
  metrics: { enemyExpectedWounds: 4.2, shooterCount: 3, distanceInches: 14 }, refs: { enemyUnitId: 'red' },
})
const oTarget2 = o('shoot.targetChoice', {
  severity: 'major', confidence: 'exact', round: 3, phase: 'shooting', unitIds: ['boyz2'], frameIndex: 27, impact: 4,
  metrics: { chosenExpectedWounds: 2, bestExpectedWounds: 6, deltaWounds: 4, ratio: 3 },
  refs: { targetUnitId: 'aint', betterTargetUnitId: 'int', weaponId: 'shoota' },
})
const oBadOdds = o('charge.badOdds', {
  severity: 'minor', confidence: 'exact', round: 3, phase: 'charge', unitIds: ['dread'], frameIndex: 29, impact: 1.5,
  metrics: { chargeProbability: 1 / 36, distanceInches: 11.5, rollInches: 4 }, refs: { targetUnitId: 'red' }, // needs 12
})
// third shoot.targetChoice: would outrank charge.badOdds, but MAX_PER_KIND_IN_MISTAKES (2) keeps it out of `mistakes`
// although the list is not full -> it overflows to `shooting`.
const oTarget3 = o('shoot.targetChoice', {
  severity: 'minor', confidence: 'exact', round: 4, phase: 'shooting', unitIds: ['boyz3'], frameIndex: 40, impact: 1.6,
  metrics: { chosenExpectedWounds: 1.4, bestExpectedWounds: 3, deltaWounds: 1.6, ratio: 2.14 },
  refs: { targetUnitId: 'lt', betterTargetUnitId: 'int2', weaponId: 'bigShoota' },
})
// frameIndex = the endPhase frame of the own Command phase where an Ork unit (boyz) was within reach and Waaagh! unused
const oWaaagh = o('missed.waaagh', {
  severity: 'info', confidence: 'heuristic', round: 3, phase: 'command', unitIds: ['boyz'], frameIndex: 20, impact: 0,
  metrics: { unusedTurnCount: 2 },
})
const oRunts = o('missed.ammoRunts', {
  severity: 'info', confidence: 'exact', round: 3, phase: 'shooting', unitIds: ['boyz'], frameIndex: 21, impact: 0.6,
  metrics: { chosenExpectedWounds: 2.2, bestExpectedWounds: 2.8, deltaWounds: 0.6 }, refs: { targetUnitId: 'int', weaponId: 'shoota' },
})
const oLuckSummary = o('luck.summary', {
  severity: 'info', confidence: 'exact', round: 4, phase: 'fight', unitIds: [], frameIndex: null, impact: 0,
  metrics: { luckIndex: -0.17, attackDealtWounds: 14, expectedDealtWounds: 16.5, attackTakenWounds: 26, expectedTakenWounds: 22 },
})
const oLuckSwing = o('luck.swing', {
  severity: 'minor', confidence: 'exact', round: 3, phase: 'shooting', unitIds: ['boyz2'], frameIndex: 26, impact: 4,
  metrics: { tailProbability: 0.05, actualWounds: 7, expectedWounds: 3, attackCount: 12, isOwnAttack: 0 }, refs: { enemyUnitId: 'int2' },
})
const oEfficiency = o('good.efficiency', {
  severity: 'info', confidence: 'exact', round: 4, phase: 'shooting', unitIds: ['boyz3'], frameIndex: 38, impact: 1.6,
  metrics: { attackDealtWounds: 5, expectedDealtWounds: 3.4, attackCount: 14 }, refs: { targetUnitId: 'int' },
})
const oGoodTarget = o('good.targetChoice', {
  severity: 'info', confidence: 'exact', round: 1, phase: 'shooting', unitIds: ['boyz'], frameIndex: 6, impact: 0.8,
  metrics: { chosenExpectedWounds: 3, alternativeExpectedWounds: 2.2, alternativeCount: 2 }, refs: { targetUnitId: 'int2' },
})

/** Orks human: Orks-only kinds; per-kind cap keeps a third shoot.targetChoice out of `mistakes`. */
export const orksReportSample: CoachReport = {
  version: COACH_REPORT_VERSION,
  battle: { scenarioId: 'combat-patrol', human: 'orks', aiLevel: 'standard', rounds: 4, winner: 'marines', vp: { marines: 25, orks: 10 }, partial: false },
  headline: o('result.summary', {
    severity: 'info', confidence: 'exact', round: 4, phase: 'fight', unitIds: [], frameIndex: null, impact: 0,
    metrics: { roundCount: 4, humanVp: 10, enemyVp: 25, dealtWounds: 14, takenWounds: 26 },
  }),
  // luckIndex = ((14 - 16.5) - (26 - 22)) / max(16.5 + 22, 3) = -6.5 / 38.5 = -0.169 -> -0.17
  totals: { damageDealt: 14, damageTaken: 26, attackDealt: 14, attackTaken: 26, expectedDealt: 16.5, expectedTaken: 22, luckIndex: -0.17 },
  mistakes: rank([oTarget1, oExposed, oTarget2, oBadOdds]),
  missed: rank([oWaaagh, oRunts]),
  luck: luckList(oLuckSummary, oLuckSwing),
  shooting: rank([oTarget3]),
  movement: [],
  positives: rank([oEfficiency, oGoodTarget]),
  // PLAN RULE: top 2 distinct mistake kinds (shoot.targetChoice, move.exposed); the only `missed` findings here
  // (missed.ammoRunts, missed.waaagh) are 'info' (heuristic) and are excluded from the pool, so the third slot is
  // filled with the next ranked mistake kind, charge.badOdds. findingIds = ALL targetChoice findings, incl.
  // oTarget3 which sits in `shooting`.
  plan: [planItem('shoot.targetChoice', oTarget1, oTarget2, oTarget3), planItem('move.exposed', oExposed), planItem('charge.badOdds', oBadOdds)],
  timeline: orksTimeline,
  notes: [],
}

/** Own-source damage per sample, round and player (see {@link OwnSource}); the only non-zero entry is the Marines' Hazardous wound of round 2. */
export const ownSourceDamage: Record<'reportSample' | 'partialReportSample' | 'shortGameReportSample' | 'orksReportSample', OwnSource> = {
  reportSample: { 2: { marines: 1 } },
  partialReportSample: {}, // rounds 3-5 only: the Hazardous wound is outside the record
  shortGameReportSample: {},
  orksReportSample: {},
}
