// Post-Battle Tactical Coach: CONTRACT TYPES.
//
// Data flow (each arrow is a pure function, entirely client-side):
//   store ──records──▶ BattleRecord ──replay()──▶ Frame[] ──Analyzer[]──▶ Finding[] ──ranker──▶ CoachReport ──▶ React
//
// Hard rules that every consumer of this file must respect:
//  1. COUNTERFACTUALS ARE EXPECTED-VALUE ONLY. The dice cannot be re-rolled, so a Finding may say
//     "this choice had a higher EXPECTED damage" but never "you would have killed X". Every
//     `expected*`-style metric is an average over all possible rolls, never the outcome of a
//     particular roll. UI copy must follow the same rule.
//  2. TEXT IS NOT IN THIS FILE'S DATA. A Finding carries only ids and numbers; the Russian
//     sentence is produced by the UI layer (coachText) from `kind` + `metrics` + `unitIds`.
//  3. Everything here is plain JSON-serialisable data (no Map/Set/Date/functions in records or
//     reports), so records can be saved to localStorage and reports snapshotted in tests.
//
// UNITS used across the contract:
//   "inches"   board distance, same as GameState (origin top-left, +y down).
//   "wounds"   points of damage actually removed from models (excess damage on a model is lost
//              and NOT counted). Mortal wounds and Hazardous self-damage are counted.
//   "p"        probability in the closed range 0..1 (never a percentage).
//   "VP"       victory points as in PlayerState.vp.

import type { AiLevel } from '../ai/ai'
import type { CoachConfig } from './config'
import type { Command, DiceEntry, ExplainLevel, GameState, LogEntry, Phase, PlayerId } from '../types'

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Versions
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Format version of a persisted {@link BattleRecord}.
 *
 * A record embeds a full `GameState` (`initial`) and replays commands through the engine, so it
 * is only valid for the engine/state shape it was recorded with. Therefore:
 *  - bump this number whenever the BattleRecord/RecordStep shape changes, AND
 *  - treat a record as stale (discard it, show no report) when `record.initial.schemaVersion`
 *    differs from `SCHEMA_VERSION` in `src/game/gameState.ts` (currently 1). Bumping
 *    SCHEMA_VERSION implicitly invalidates every stored record even if this constant is unchanged.
 */
export const COACH_RECORD_VERSION = 1

/** Format version of a {@link CoachReport}. Bump when the report shape or Finding semantics change. */
export const COACH_REPORT_VERSION = 1

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Recording
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** One command dispatched through the engine, human or AI, in dispatch order. */
export interface RecordStep {
  /** The exact command passed to `apply()`. Only commands that `apply()` accepted are recorded. */
  cmd: Command
  /** Who made the decision: `actor(stateBefore)` from engine.ts. The AI's steps are recorded too. */
  actor: PlayerId
  /**
   * Optional AI explanation text (`AiDecision.explanation`, Russian, as shown to the user).
   * Only present for AI steps when the AI supplied one. Analyzers must not parse it.
   */
  note?: string
}

/**
 * Everything needed to rebuild a whole battle deterministically with no stored intermediate
 * states: start from `initial` and `apply()` each step in order.
 *
 * DETERMINISM: dice come from a mulberry32 PRNG whose entire state is `GameState.rng`. To
 * re-apply a step, create `seededRoller(stateBefore.rng)` — the roller continues the exact
 * sequence that produced the original result. (`apply()` writes `r.state()` back into `rng`.)
 * This is exactly what the live store does (`apply(game, cmd, seededRoller(game.rng))`, src/store.ts).
 * NOTE for the recorder: the store has UNDO (human, dice-free commands only: `rng` unchanged).
 * An undone step must be removed from `steps` (and `tip` updated), otherwise replay desyncs.
 */
export interface BattleRecord {
  /** Must equal {@link COACH_RECORD_VERSION}; see its doc for the tie to SCHEMA_VERSION. */
  version: number
  /** `GameState.scenarioId` of the battle (e.g. 'training-outpost'). */
  scenarioId: string
  /** Faction the user played. The coach reports from this player's point of view. */
  human: PlayerId
  /** AI difficulty the opponent used. */
  aiLevel: AiLevel
  /** Explanation level the user had selected (affects only which log entries were produced). */
  explain: ExplainLevel
  /**
   * State right after `startGame()` (deployment finished, first-turn roll-off done, round 1
   * command phase entered). For a `partial` record: the state at the moment recording resumed.
   */
  initial: GameState
  /** Every command applied after `initial`, in order. May be empty. */
  steps: RecordStep[]
  /**
   * True when the record does not cover the whole battle: it was rebased after a save/load or
   * resume, so `initial` is mid-battle and earlier decisions are unknown. Reports built from a
   * partial record carry a `'partial'` note and cover only the recorded rounds.
   */
  partial: boolean
  /**
   * Fingerprint of the state after the LAST step (or of `initial` if there are no steps), used to
   * detect desync between a stored record and the saved game / a replay.
   */
  tip: {
    /** `GameState.nextId` of the final state. */
    nextId: number
    /** `GameState.rng` of the final state. */
    rng: number
  }
}

/**
 * One replayed command. `replay()` produces `steps.length` frames, `index` = position in
 * `BattleRecord.steps` (0-based). `frames[i].after` is deep-equal to `frames[i + 1].before`.
 */
export interface Frame {
  /** 0-based index of the step in `BattleRecord.steps`. */
  index: number
  /** State immediately before `cmd`. Treat as read-only (analyzers must not mutate frames). */
  before: GameState
  /** State immediately after `cmd`. Read-only. */
  after: GameState
  /** The command that was applied. */
  cmd: Command
  /** Who issued it (`RecordStep.actor`). */
  actor: PlayerId
  /**
   * Dice entries produced by this command: `after.diceLog` entries with `id` greater than the
   * largest id in `before.diceLog` (0 if empty). Selected by id, NOT by array length, because
   * `diceLog` is capped and old entries get trimmed. Chronological order.
   *
   * FUTURE: another task will add structured per-roll data to DiceEntry (a `meta` field). Do not
   * depend on it here; until then analyzers may only use the title/steps/summary already present.
   */
  diceDelta: DiceEntry[]
  /** Log entries produced by this command: `after.log` entries with `id` > max id in `before.log`. Chronological. */
  logDelta: LogEntry[]
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Findings
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * How trustworthy a Finding is.
 *  - `'exact'`     Engine facts (what happened) or an exactly computed probability / expectation
 *                  using the engine's own rules code. Safe to state as fact.
 *  - `'estimate'`  Modelled approximation: e.g. enemy exposure that ignores enemy movement,
 *                  line of sight from sampled points (research.md), cover predicted for a
 *                  hypothetical position. UI must hedge ("примерно", "по оценке").
 *  - `'heuristic'` AI-style suggestion ("a stronger player would usually…"). NEVER above
 *                  severity `'info'`; never counted as a mistake.
 */
export type Confidence = 'exact' | 'estimate' | 'heuristic'

/**
 * How much a finding matters for the result.
 * Suggested scale (calibration lives in config.ts): critical ≈ swung the battle (≥ ~6 wounds or
 * ≥ 1 objective-turn of VP); major ≈ ~3+ wounds; minor ≈ ~1–3 wounds; info = context only.
 */
export type Severity = 'critical' | 'major' | 'minor' | 'info'

/**
 * Every kind of finding. Prefix = category. Where a kind says "expected", the number is an average
 * over all dice outcomes (see rule 1 at the top of this file). `metrics` keys per kind are
 * documented by the analyzer that emits them (not frozen here), but all share the conventions on
 * {@link Finding.metrics}.
 *
 * result / metrics
 *  - `result.summary`      Headline: who won, VP and damage totals. Exactly one per report; stored in `CoachReport.headline`.
 *  - `loss.attribution`    Why a human unit was lost: which decision(s) exposed it (mistake).
 *  - `objective.swing`     An objective changed hands against the human because of a decision (mistake).
 * luck
 *  - `luck.summary`        Overall dice luck for the battle (actual vs expected damage); explains, does not blame.
 *  - `luck.swing`          A single roll/attack whose outcome had probability below LUCK threshold (p < 0.10).
 * shooting
 *  - `shoot.targetChoice`  A different legal target had clearly higher expected damage.
 *  - `shoot.profileChoice` A different weapon profile (e.g. plasma supercharge vs standard) had higher expected value.
 *  - `shoot.overkill`      Expected damage mostly wasted on a unit that needed far less (excess/lost damage).
 *  - `shoot.advanceCost`   Advancing cost expected shooting damage (Assault-only) vs a normal move.
 *  - `shoot.coverIgnored`  Shot a target in cover while an equal alternative without cover existed (or moved out of cover first).
 *  - `shoot.hazardLoss`    Hazardous self-damage outweighed the expected gain of using that weapon.
 * charge / melee
 *  - `charge.badOdds`      Declared a charge with success probability below threshold (p < 0.15).
 *  - `charge.forgone`      Did not declare a charge that had high success probability and value (heuristic).
 *  - `charge.failedByLuck` A charge with decent odds failed; an explanation, not a mistake.
 *  - `fight.targetChoice`  A different melee target had clearly higher expected damage.
 * movement
 *  - `move.exposed`        Ended movement where enemies' expected next-turn damage was high (estimate).
 *  - `move.noCover`        Ended movement in the open when cover was reachable (estimate).
 *  - `move.objectiveNeglect` Left objectives uncontested for rounds while able to take/hold them.
 *  - `move.blastSpread`    Unit models spread/bunched in a way that raised expected Blast damage taken.
 *  - `move.chargeExposure` Ended inside enemy charge reach with high charge probability and a costly melee matchup.
 *  - `move.fallBackDecision` Fell back (or did not) with a materially different expected outcome.
 *  - `move.advanceDecision` Advanced (or did not) with a materially different expected outcome.
 * missed opportunities (a good option existed and was never taken)
 *  - `missed.shot`         A unit with a decent expected shot did not shoot.
 *  - `missed.charge`       A unit with a good charge did not charge (stronger claim than `charge.forgone`: the unit was otherwise idle).
 *  - `missed.waaagh`       Orks finished the battle (or a decisive turn) without calling WAAAGH!.
 *  - `missed.ammoRunts`    The Ammo Runts ability was never used though it would have added expected damage.
 *  - `missed.objective`    An objective could have been reached/held at no cost and was not.
 * positives
 *  - `good.targetChoice`   Picked the best (or near best) target when alternatives existed.
 *  - `good.objectiveHeld`  Held objectives under pressure / scored VP efficiently.
 *  - `good.efficiency`     Dealt damage clearly above the expected for the attacks made, with sound choices (not mere luck).
 *  - `good.cover`          Used cover well while advancing / holding.
 */
export type FindingKind =
  // result / metrics
  | 'result.summary'
  | 'loss.attribution'
  | 'objective.swing'
  // luck
  | 'luck.summary'
  | 'luck.swing'
  // shooting
  | 'shoot.targetChoice'
  | 'shoot.profileChoice'
  | 'shoot.overkill'
  | 'shoot.advanceCost'
  | 'shoot.coverIgnored'
  | 'shoot.hazardLoss'
  // charge / melee
  | 'charge.badOdds'
  | 'charge.forgone'
  | 'charge.failedByLuck'
  | 'fight.targetChoice'
  // movement
  | 'move.exposed'
  | 'move.noCover'
  | 'move.objectiveNeglect'
  | 'move.blastSpread'
  | 'move.chargeExposure'
  | 'move.fallBackDecision'
  | 'move.advanceDecision'
  // missed opportunities
  | 'missed.shot'
  | 'missed.charge'
  | 'missed.waaagh'
  | 'missed.ammoRunts'
  | 'missed.objective'
  // positives
  | 'good.targetChoice'
  | 'good.objectiveHeld'
  | 'good.efficiency'
  | 'good.cover'

/** One coaching observation about a moment in the battle. Pure data; no prose. */
export interface Finding {
  /**
   * Stable, deterministic id: the same record must always produce the same ids.
   * Convention: `${kind}:r${round}:f${frameIndex}[:${unitIds.join('+')}]` (e.g. `shoot.targetChoice:r2:f14:int`).
   * Unique within a report.
   */
  id: string
  kind: FindingKind
  severity: Severity
  confidence: Confidence
  /** Battle round (1-based, `GameState.round`) in which the decision/event happened. */
  round: number
  /** Phase in which the decision/event happened. */
  phase: Phase
  /**
   * Player whose decision this is. In a real {@link CoachReport} `actor === battle.human` for every
   * finding (the coach never criticises the AI); `luck.*` and `loss.attribution` may reference the
   * AI's units, but only via `unitIds`. Analyzers return findings for the human only.
   * Faction-gated kinds (so no single real report can contain every kind): `missed.waaagh`,
   * `missed.ammoRunts` (Orks human only); `shoot.hazardLoss` (needs a Hazardous weapon: currently
   * only the Marines' plasma pistol).
   */
  actor: PlayerId
  /** Ids (`UnitState.id`) of the units involved, primary unit first (e.g. [shooter, chosenTarget, betterTarget]). May be empty for battle-wide findings. */
  unitIds: string[]
  /**
   * `Frame.index` of the decision point (for "show me this moment" navigation). `-1` = battle-wide
   * finding with no navigation target (`result.summary`, `luck.summary`); every other kind is >= 0.
   */
  frameIndex: number
  /**
   * Numeric facts the UI text interpolates. Numbers only. Conventions: expected damage and
   * damage in WOUNDS; probabilities p in 0..1; distances in INCHES; vp in VP; counts as integers;
   * ratios as plain multipliers (1.8 = "1.8×"). Keys are camelCase, e.g. `expectedChosen`,
   * `expectedBest`, `chargeProbability`, `actualWounds`, `luckIndex`.
   */
  metrics: Record<string, number>
  /** Optional id of a lesson in the UI's lesson catalogue (links the finding to a teaching card). */
  lessonId?: string
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Where a kind is shown (placement hint for the ranker; constant data only)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Which report list a finding that lost its headline slot falls into. */
export type FindingTopic = 'headline' | 'luck' | 'shooting' | 'movement'

/**
 * PLACEMENT RULE (used by the ranker; documented here so UI can rely on it):
 *  - `headline` holds the single `result.summary`.
 *  - The capped lists `mistakes`, `missed`, `luck`, `positives` get the top-ranked findings:
 *      mistakes  = negative findings (not luck/missed/good) with severity >= 'minor' and confidence != 'heuristic'
 *      missed    = `missed.*` kinds
 *      luck      = `luck.*` kinds
 *      positives = `good.*` kinds
 *  - A finding that is not selected for its capped list falls through to its topical list
 *    (`FINDING_TOPIC`): `shooting` or `movement`. Nothing computed is lost; a finding appears in
 *    exactly ONE list. Overflow of `luck.*` findings is dropped (the luck topic has no overflow list).
 *  - Topical lists are capped at `REPORT.MAX_TOPICAL` each, sorted by severity then impact.
 */
export const FINDING_TOPIC: Readonly<Record<FindingKind, FindingTopic>> = {
  'result.summary': 'headline',
  'loss.attribution': 'movement',
  'objective.swing': 'movement',
  'luck.summary': 'luck',
  'luck.swing': 'luck',
  'shoot.targetChoice': 'shooting',
  'shoot.profileChoice': 'shooting',
  'shoot.overkill': 'shooting',
  'shoot.advanceCost': 'shooting',
  'shoot.coverIgnored': 'shooting',
  'shoot.hazardLoss': 'shooting',
  'charge.badOdds': 'movement',
  'charge.forgone': 'movement',
  'charge.failedByLuck': 'movement',
  'fight.targetChoice': 'movement',
  'move.exposed': 'movement',
  'move.noCover': 'movement',
  'move.objectiveNeglect': 'movement',
  'move.blastSpread': 'movement',
  'move.chargeExposure': 'movement',
  'move.fallBackDecision': 'movement',
  'move.advanceDecision': 'movement',
  'missed.shot': 'shooting',
  'missed.charge': 'movement',
  'missed.waaagh': 'movement',
  'missed.ammoRunts': 'shooting',
  'missed.objective': 'movement',
  'good.targetChoice': 'shooting',
  'good.objectiveHeld': 'movement',
  'good.efficiency': 'shooting',
  'good.cover': 'movement',
}

/**
 * Every FindingKind exactly once. Typed via a Record so the COMPILER errors when a kind is added
 * to (or removed from) the union without updating this list.
 */
export const ALL_FINDING_KINDS = Object.keys(FINDING_TOPIC) as FindingKind[]

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Report
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A suggested focus for the next battle (at most 3 per report). */
export interface PlanItem {
  /** Which kind of mistake/opportunity to work on; the UI picks the advice text from this. */
  kind: FindingKind
  /** Optional lesson card to link. */
  lessonId?: string
  /** Optional key of a `Finding.metrics` entry to track next time (e.g. 'expectedBest'). */
  targetMetric?: string
}

/** Per-player stats for one round (both players' turns of that round combined). */
export interface PlayerRoundStats {
  /** VP of this player at the END of the round. */
  vp: number
  /** Wounds this player's units removed from enemy models during the round. */
  damageDealt: number
  /** Wounds this player's models lost during the round (includes self-inflicted Hazardous / Desperate Escape). */
  damageTaken: number
  /** Number of this player's units destroyed during the round. */
  unitsLost: number
}

/** One row of the timeline: a round with both players' stats. */
export interface RoundSummary {
  /** Battle round, 1-based. Rounds appear ascending, without gaps, within the recorded span. */
  round: number
  stats: Record<PlayerId, PlayerRoundStats>
}

/**
 * Caveats shown on the report.
 *  - `partial`      Record was rebased mid-battle; earlier rounds are missing. metrics: `{ firstRound }`.
 *  - `lowData`      Too little happened (short game, few attacks) for statistics to mean much; luck and
 *                   efficiency findings are suppressed. metrics: `{ rounds, humanAttacks }`.
 *  - `estimateOnly` All findings are `estimate`/`heuristic`; nothing could be proven exactly.
 */
export type ReportNoteKind = 'partial' | 'lowData' | 'estimateOnly'

export interface ReportNote {
  kind: ReportNoteKind
  /** Optional numbers for the UI text (see {@link ReportNoteKind}). */
  metrics?: Record<string, number>
}

/**
 * The finished coach report. All lists are sorted most important first.
 *
 * CAPS (enforced by the ranker; values live in config.ts `REPORT`): mistakes <= 5, missed <= 3,
 * luck <= 3, positives 2–3 (fewer only when fewer qualify; none when `lowData`), plan <= 3,
 * shooting / movement <= `REPORT.MAX_TOPICAL` each. Placement rule: see {@link FINDING_TOPIC}.
 */
export interface CoachReport {
  /** Must equal {@link COACH_REPORT_VERSION}. */
  version: number
  battle: {
    scenarioId: string
    /** Player the report is about. */
    human: PlayerId
    aiLevel: AiLevel
    /** Number of rounds covered by the record (>= 1). */
    rounds: number
    /** `GameState.winner` of the final state; `null` if the battle did not finish. */
    winner: PlayerId | 'draw' | null
    /** Final VP per player. */
    vp: Record<PlayerId, number>
    /** Same as `BattleRecord.partial`. */
    partial: boolean
  }
  /**
   * DEVIATION from the brief (extra field): the single `result.summary` Finding. Kept out of the
   * capped lists so the UI can always render the headline without searching by kind.
   */
  headline: Finding
  totals: {
    /** Wounds the human's units removed from enemy models (actual). */
    damageDealt: number
    /** Wounds the human's models lost (actual, incl. self-inflicted). */
    damageTaken: number
    /** Expected wounds the human's attacks should have removed, given the dice-free probabilities of each attack as actually made. */
    expectedDealt: number
    /** Expected wounds the AI's attacks should have removed from the human's models. */
    expectedTaken: number
    /**
     * Signed, normalised dice luck of the human, in -1..+1 (positive = dice favoured the human):
     *   luckIndex = clamp( ((damageDealt - expectedDealt) - (damageTaken - expectedTaken))
     *                      / max(expectedDealt + expectedTaken, LUCK.MIN_NORMALISER), -1, +1 )
     * Always computed with this formula, also for `lowData` games (that note only suppresses luck findings).
     * i.e. the luck surplus on offence minus the luck surplus the opponent enjoyed, relative to
     * the total expected damage in the game. 0 = average luck. The formula is a convention for
     * display, not a statistical test; swings use exact per-attack probabilities instead.
     */
    luckIndex: number
  }
  /** Top negative findings the human can act on (cap 5). */
  mistakes: Finding[]
  /** Top missed opportunities (cap 3). */
  missed: Finding[]
  /** Dice-luck explanations (cap 3). */
  luck: Finding[]
  /** Remaining shooting-topic findings (see FINDING_TOPIC), incl. positives/missed that overflowed. */
  shooting: Finding[]
  /** Remaining movement/charge/melee-topic findings (see FINDING_TOPIC), incl. positives/missed that overflowed. */
  movement: Finding[]
  /** What the human did well (2–3). */
  positives: Finding[]
  /** Up to 3 focus items for the next battle, derived from the mistakes/missed. */
  plan: PlanItem[]
  /** One entry per recorded round. */
  timeline: RoundSummary[]
  /** Caveats; empty array when none. */
  notes: ReportNote[]
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Analyzers
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** What every analyzer receives besides the frames. Keep minimal; analyzers must not need anything else. */
export interface AnalyzerContext {
  /** Player the coach reports about. */
  human: PlayerId
  aiLevel: AiLevel
  scenarioId: string
  /** True when frames start mid-battle (see BattleRecord.partial). */
  partial: boolean
  /** Thresholds; analyzers read ONLY their own section (e.g. `config.SHOOT`). Tests may pass overrides. */
  config: CoachConfig
}

/**
 * A pure analyzer: same frames + context in, same findings out (deterministic order and ids, no
 * Date/Math.random, no mutation of frames). Returns raw findings; capping/ranking is the ranker's job.
 */
export type Analyzer = (frames: Frame[], ctx: AnalyzerContext) => Finding[]
