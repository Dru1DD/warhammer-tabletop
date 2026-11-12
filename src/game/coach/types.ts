// Post-Battle Tactical Coach: CONTRACT TYPES (revision 3, frozen after review).
//
// Data flow (each arrow is a pure function, entirely client-side):
//   store ──records──▶ BattleRecord ──ReplayFn──▶ Frame[] ──StatsFn / Analyzer[]──▶ Finding[] ──ranker──▶ CoachReport ──▶ React
//
// Hard rules that every consumer of this file must respect:
//  1. COUNTERFACTUALS ARE EXPECTED-VALUE ONLY. The dice cannot be re-rolled, so a Finding may say
//     "this choice had a higher EXPECTED damage" but never "you would have killed X". Every
//     `expected*`-style metric is an average over all possible rolls, never the outcome of a
//     particular roll. UI copy must follow the same rule.
//  2. TEXT IS NOT IN THIS FILE'S DATA. A Finding carries only ids and numbers; the Russian
//     sentence is produced by the UI layer (coachText) from `kind` + `metrics` + `refs` + `unitIds`.
//     The UI also maps kind -> tutorial lesson itself; nothing here stores lesson ids.
//  3. Everything here is plain JSON-serialisable data (no Map/Set/Date/functions in records or
//     reports), so records can be saved to localStorage and reports snapshotted in tests.
//
// UNITS used across the contract (see also METRIC_UNITS):
//   "inches"   board distance, same as GameState (origin top-left, +y down).
//   "wounds"   points of damage actually removed from models. Excess damage on a model is lost and
//              NOT counted (matches the engine). Mortal wounds are counted.
//   "p"        probability in the closed range 0..1 (never a percentage).
//   "VP"       victory points as in PlayerState.vp.
//
// THRESHOLD CONVENTION (config.ts): every "MIN" threshold is INCLUSIVE (value >= MIN triggers);
// every "MAX" threshold is INCLUSIVE too (value <= MAX triggers) unless its doc says "below".

import type { AiLevel } from '../ai/ai'
import { CHARGE } from './config'
import type { CoachConfig } from './config'
import type { Command, DiceEntry, GameState, LogEntry, Phase, PlayerId } from '../types'

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
export const COACH_RECORD_VERSION = 2

/**
 * Format version of a {@link CoachReport}. Bump when the report shape or Finding semantics change.
 * r3 = 3: `luck.summary` / `good.efficiency` metric keys renamed (`attackDealtWounds`, `attackTakenWounds`),
 * `luck.summary` lives in a reserved slot of `luck`, `missed.waaagh` carries a unit, `PlanItem.findingIds`
 * may point into any list, damage accounting redefined (see CoachReport.totals).
 */
export const COACH_REPORT_VERSION = 3

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
  /** AI steps only: `settings.aiLevel` at the moment of the step (it can change mid-battle). Absent on human steps. */
  aiLevel?: AiLevel
}

/**
 * Everything needed to rebuild a whole battle deterministically with no stored intermediate
 * states: start from `initial` and `apply()` each step in order.
 *
 * DETERMINISM: dice come from a mulberry32 PRNG whose entire state is `GameState.rng`. To
 * re-apply a step, create `seededRoller(stateBefore.rng)` — the roller continues the exact
 * sequence that produced the original result. (`apply()` writes `r.state()` back into `rng`.)
 * This is exactly what the live store does (`apply(game, cmd, seededRoller(game.rng))`, src/store.ts).
 * The engine logs EVERY entry regardless of the user's explanation level (that level is a pure
 * display filter), so the record does not store it.
 *
 * LIFECYCLE OBLIGATION (recorder, review H4). Every `set({ game: ... })` site in src/store.ts:
 *  - `newGame` and `finishDeployment` (both call `startGame`): START a fresh record, `initial` = the started state.
 *  - `startDeployment` and `quit`: DISCARD the record.
 *  - `dispatch`: append a step. `undo`: see below. `load`: see below. `placeUnit` / `editTerrain` happen before
 *    `startGame` and never touch the record.
 *  - A FINISHED battle (`winner` set) keeps its record, persisted under its own key, until `startDeployment`,
 *    `newGame` or `quit`. "Continue the battle" is hidden once `winner` is set, so without this a reload loses the report.
 *  - The AI level can change mid-battle (settings dialog, `aiStep` reads `settings.aiLevel` live): AI steps carry
 *    `RecordStep.aiLevel`; `BattleRecord.aiLevel` is the level at the START of the record.
 *
 * UNDO OBLIGATION (recorder): the store has UNDO (`store.undo`), which restores a previous state
 * and applies ONLY to dice-free human commands (`next.rng === game.rng`, human still to act, not
 * `endPhase`). Whenever `store.undo` restores a state, the recorder MUST pop the matching recorded
 * step(s) and refresh `tip`, otherwise replay desyncs. Because undo never covers dice-rolling
 * commands, the popped step never contains dice and the remaining prefix stays valid.
 *
 * SAVE / LOAD / RESUME (recorder). Both paths go through `store.load(key)` (src/store.ts):
 *  - `load(MANUAL_KEY)` (App.tsx: the "Load a save" button and the in-game load button, which
 *    calls `load()` with the default key) ALWAYS rebases the record: `initial` = the loaded state,
 *    `steps` = [], `partial = true`. The save file has no record, and the loaded state may belong to
 *    any battle, so no earlier decisions are known and `tip` must NOT be used to try to stitch records.
 *  - `load(AUTOSAVE_KEY)` (App.tsx StartScreen "Continue the battle" = the autosave RESUME: the page was
 *    reloaded during the same battle, so autosave and stored record come from the same session) may
 *    compare the stored record's `tip` with the autosaved state (`nextId`, `rng` AND `digest`). If all
 *    three match, keep the record as is (still `partial` if it was); on any mismatch, rebase exactly like
 *    a manual load.
 *  - `load` may CHANGE `settings.human` (store.ts takes `file.human` when the file has one). The recorder
 *    must therefore read `human` AFTER the load (from the store's settings), for kept and rebased
 *    records alike; a kept record whose `human` differs from the post-load `human` must be rebased.
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
    /**
     * Stable digest of the final state's unit layout, produced by the record module (later task).
     * Algorithm (a reference implementation lives in `__fixtures__/record.sample.ts` as
     * `referenceDigest`): FNV-1a 32-bit over the concatenation, in `state.units` / `unit.models`
     * order, of `"<unit.id>/<model.id>:<x.toFixed(2)>,<y.toFixed(2)>:<wounds>:<destroyed?1:0>|"`,
     * printed as 8 lower-case hex digits. It covers every position, wounds value and destroyed flag.
     */
    digest: string
  }
}

/**
 * One replayed command. A successful replay produces `steps.length` frames, `index` = position in
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
   * Dice entries produced by this command, EXACTLY: the entries of `after.diceLog` whose
   * `id >= before.nextId`. (`nextId` is the single counter shared by log and dice entries and is
   * only ever incremented, so ids created by this command are exactly those >= `before.nextId`.)
   * Selected by id, NOT by array length, because `diceLog` is capped and old entries get trimmed.
   * Chronological order.
   *
   * FUTURE: another task will add structured per-roll data to DiceEntry (a `meta` field). Do not
   * depend on it here; until then analyzers may only use the title/steps/summary already present.
   */
  diceDelta: DiceEntry[]
  /** Log entries produced by this command, EXACTLY: `after.log` entries with `id >= before.nextId`. Chronological. */
  logDelta: LogEntry[]
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Frozen function signatures (types only; implementations come from later tasks)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Why a replay could not be produced.
 *  - `'stale'`   `record.version` != COACH_RECORD_VERSION or `initial.schemaVersion` != SCHEMA_VERSION.
 *  - `'desync'`  the replay finished but its final state does not match `record.tip`
 *                (nextId / rng / digest).
 *  - `'invalid'` a step failed `validate()` / `apply()` threw, or the record is malformed.
 */
export type ReplayFailReason = 'stale' | 'desync' | 'invalid'

/** Outcome of {@link ReplayFn}. */
export type ReplayResult = { ok: true; frames: Frame[] } | { ok: false; reason: ReplayFailReason }

/**
 * Rebuilds the frames of a battle. NEVER THROWS: `apply()` throws on an invalid command, so the
 * implementation must catch and return `{ ok: false, reason: 'invalid' }`. Pure and deterministic.
 */
export type ReplayFn = (record: BattleRecord) => ReplayResult

/**
 * Everything the report needs from the frames that is not a Finding. Attack accounting follows
 * the single shared event set defined on {@link CoachReport.totals}.
 */
export interface StatsResult {
  totals: CoachReport['totals']
  timeline: RoundSummary[]
  /**
   * Number of human attack ACTIONS: `shoot` and `fight` commands by the human that rolled at least
   * one attack die. Input of the `lowData` test (see `REPORT.LOW_DATA_MIN_ATTACK_ACTIONS`).
   */
  humanAttackActions: number
  /**
   * Number of ATTACKS the human's attack actions resolved: one per hit-roll die, and one per
   * automatic hit of a Torrent weapon (wound and save dice are not counted separately). Input of the `lowData` test (`REPORT.LOW_DATA_MIN_ATTACK_DICE`).
   */
  humanAttackDice: number
}

/** Computes totals, the per-round timeline and the lowData inputs. Pure, deterministic, never throws. */
export type StatsFn = (frames: Frame[], ctx: AnalyzerContext) => StatsResult

/**
 * End-to-end convenience: replay + stats + analyzers + ranker. Returns `null` when the report is
 * unavailable (replay failed with any {@link ReplayFailReason}, or the record has no steps).
 * Never throws.
 */
export type BuildReportFn = (record: BattleRecord, config?: CoachConfig) => CoachReport | null

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Findings
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * How trustworthy a Finding is.
 *  - `'exact'`     Engine facts (what happened) or an exactly computed probability / expectation
 *                  using the engine's own rules code. Safe to state as fact.
 *  - `'estimate'`  Modelled approximation: e.g. enemy exposure that ignores enemy movement,
 *                  line of sight from sampled points (research.md), cover predicted for a
 *                  hypothetical position. UI must hedge ("approximately", "by estimate").
 *  - `'heuristic'` AI-style suggestion ("a stronger player would usually…"). NEVER above
 *                  severity `'info'`; never counted as a mistake.
 */
export type Confidence = 'exact' | 'estimate' | 'heuristic'

/**
 * How much a finding matters for the result, derived from `Finding.impact` (wounds-equivalent) with
 * the band constants of the analyzer's config section (SHOOT / MOVE / CHARGE / MISSED, each has
 * MINOR_WOUNDS, MAJOR_WOUNDS, CRITICAL_WOUNDS). Bounds are INCLUSIVE at the lower edge:
 *   critical  impact >= CRITICAL_WOUNDS  (≈ swung the battle; also any >= 1 objective-turn of VP,
 *                                         because 5 VP * REPORT.VP_TO_WOUNDS >= CRITICAL_WOUNDS)
 *   major     MAJOR_WOUNDS <= impact < CRITICAL_WOUNDS
 *   minor     MINOR_WOUNDS <= impact < MAJOR_WOUNDS
 *   info      impact < MINOR_WOUNDS, OR any `heuristic` confidence, OR context-only kinds.
 * Section by kind: `shoot.*` → SHOOT; `charge.*`, `fight.*` → CHARGE; `missed.*` → MISSED;
 * `move.*`, `loss.*`, `objective.*` → MOVE. Exceptions: `luck.swing` is always 'minor';
 * `luck.summary` is 'minor' when |luckIndex| >= LUCK.NOTABLE_BAND else 'info'; `result.summary`,
 * `charge.failedByLuck` and `good.*` are always 'info'.
 */
export type Severity = 'critical' | 'major' | 'minor' | 'info'

/**
 * Every kind of finding. Prefix = category. Where a kind says "expected", the number is an average
 * over all dice outcomes (see rule 1 at the top of this file). The exact metric keys and ref keys
 * of each kind are frozen in {@link METRIC_KEYS} and {@link REF_KEYS}.
 *
 * PRODUCERS (one task per kind, so ids never collide): A1 metrics → `result.summary`, `loss.attribution`,
 * `objective.*`, `good.objectiveHeld`; A2 luck → `luck.*`, `good.efficiency`; A3 shooting → `shoot.*`,
 * `good.targetChoice`; A4 movement → `move.*`, `good.cover`; A5 charge/melee → `charge.*`, `fight.targetChoice`;
 * A6 missed opportunities → `missed.*`. Ids are `kind:rROUND:fFRAME[:unit+unit]` plus `#N` (N >= 2) to disambiguate
 * duplicates (exact format: shape.ts); because each kind has ONE producer, ids never collide across analyzers.
 * Id order (rank tie-break) compares UTF-16 code units (`<`), never `localeCompare`.
 *
 * result / metrics
 *  - `result.summary`      Headline: who won, VP and all-source damage totals. Exactly one per report; stored in
 *                          `CoachReport.headline`. Produced by the metrics/stats analyzer (task A1). Battle-wide:
 *                          `frameIndex` null; `round` / `phase` = `round` / `phase` of `frames[frames.length - 1].after`.
 *  - `loss.attribution`    Why a human unit was lost: which decision(s) exposed it. Anchored at the frame where the unit was destroyed.
 * objectives
 *  - `objective.swing`     An objective changed hands against the human because of a decision.
 *  - `objective.battleShock` An objective was lost / not counted because a human unit was Battle-shocked (OC 0).
 * luck
 *  - `luck.summary`        Overall dice luck for the battle (actual vs expected ATTACK damage); explains, does not blame.
 *                          Produced by the luck analyzer (task A2). Battle-wide like `result.summary` (same `round` / `phase`
 *                          rule). Lives in the RESERVED first slot of `CoachReport.luck` (see the PLACEMENT RULE).
 *  - `luck.swing`          A single attack sequence (= one weapon group, i.e. one attack `DiceEntry` from one `resolveGroup`
 *                          call) whose one-sided tail probability is at most LUCK.SWING_MAX_P. Needs the structured
 *                          `DiceEntry.meta` (task E3) to separate attack damage from Deadly Demise / Hazardous damage.
 * shooting
 *  - `shoot.targetChoice`  A different legal target had clearly higher expected damage.
 *  - `shoot.profileChoice` A different weapon profile (e.g. plasma supercharge vs standard) had higher expected value.
 *  - `shoot.overkill`      Expected damage mostly wasted on a unit that needed far less (excess/lost damage).
 *  - `shoot.advanceCost`   Advancing cost expected shooting damage (Assault-only) vs a normal move.
 *  - `shoot.coverIgnored`  A shot was taken at a target that HAD cover while an equally valuable alternative target
 *                          without cover existed (`refs.betterTargetUnitId`). "Had cover" is exactly the engine's
 *                          `hasCover(state, shooters, target)` (rules/visibility.ts): every target model is INFANTRY in
 *                          terrain, or not fully visible from the firing models. This is about the TARGET's cover; the
 *                          human's own unit standing in the open is `move.noCover`. (A different firing position could
 *                          only remove the "not fully visible" branch, never the INFANTRY-in-terrain one; that case is
 *                          `shoot.firingPosition` / `shoot.targetChoice`, not this kind.)
 *                          EXCLUSIVITY: emitted only when the same shot does NOT also qualify as
 *                          `shoot.targetChoice` (i.e. NOT both best/chosen >= SHOOT.TARGET_MIN_RATIO and
 *                          best - chosen >= SHOOT.TARGET_MIN_ABS_WOUNDS); a shot that qualifies for both is
 *                          reported as `shoot.targetChoice` only.
 *  - `shoot.hazardLoss`    Hazardous self-damage outweighed the expected gain of using that weapon.
 *  - `shoot.firingPosition` The unit's end position cost it a bonus: lost Rapid Fire half-range, lost Heavy
 *                          (moved), or line of sight lost because of the move.
 * charge / melee
 *  - `charge.badOdds`      Declared a charge with success probability at most CHARGE.BAD_ODDS_MAX_P.
 *  - `charge.failedByLuck` A charge with decent odds failed; an explanation, not a mistake.
 *  - `fight.targetChoice`  A different melee target had clearly higher expected damage.
 * movement
 *  - `move.exposed`        Ended movement where enemies' expected next-turn damage was high (estimate).
 *  - `move.noCover`        The human's OWN unit ended its move in the open (no cover against the enemy's ranged
 *                          attacks per the same `hasCover` semantics, seen from the enemy's models) while a reachable
 *                          covered spot existed (estimate). It is about the unit's defence, not about the target of
 *                          its own shots; `shoot.coverIgnored` is a different lesson and does not supersede it.
 *  - `move.objectiveNeglect` Left objectives uncontested for rounds while able to take/hold them.
 *  - `move.chargeExposure` Ended inside enemy charge reach with high charge probability and a costly melee matchup.
 *  - `move.fallBackDecision` Fell back (or did not) with a materially different expected outcome.
 *  - `move.advanceDecision` Advanced (or did not) with a materially different expected outcome.
 * missed opportunities (a good option existed and was never taken)
 *  - `missed.shot`         A unit with a decent expected shot did not shoot.
 *  - `missed.charge`       A unit with a good charge did not charge (replaces the old `charge.forgone`;
 *                          usually confidence 'estimate' or 'heuristic').
 *  - `missed.waaagh`       Orks finished the battle (or a decisive turn) without calling WAAAGH!. `frameIndex` = the
 *                          `endPhase` frame that ended an OWN (human) Command phase at which the Waaagh! condition first
 *                          held while `players.orks.waaaghUsed` was still false, where the condition = some Ork unit of
 *                          the human within the AI's reach of an enemy (`unitDistance <= MISSED.WAAAGH_REACH_INCHES`, the
 *                          AI's `6 + 3.5 + 7` in ai.ts). If it never held, the first own Command-phase `endPhase` frame
 *                          with `round >= MISSED.WAAAGH_MIN_ROUND`. Emitted only when the LAST recorded round is
 *                          `>= MISSED.WAAAGH_MIN_ROUND` (the anchor itself may be earlier, e.g. round 2). `unitIds[0]` = the first human unit (state order)
 *                          within reach at that frame (the first Ork unit if the condition never held).
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
  // objectives
  | 'objective.swing'
  | 'objective.battleShock'
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
  | 'shoot.firingPosition'
  // charge / melee
  | 'charge.badOdds'
  | 'charge.failedByLuck'
  | 'fight.targetChoice'
  // movement
  | 'move.exposed'
  | 'move.noCover'
  | 'move.objectiveNeglect'
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
   * Convention: `${kind}:r${round}:f${frameIndex ?? 'x'}[:${unitIds.join('+')}]` (e.g.
   * `shoot.targetChoice:r2:f14:int`; battle-wide findings use `fx`). If two findings of one
   * analyzer would share that prefix, the later ones append `#2`, `#3`, … in emission order.
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
   * finding (the coach never criticises the AI). Analyzers return findings for the human only.
   * Faction-gated kinds are listed in {@link FACTION_GATED_KINDS}: `missed.waaagh`,
   * `missed.ammoRunts` (Orks human only) and `shoot.hazardLoss` (Marines only: the Lieutenant's
   * plasma pistol Supercharge and the Redemptor's Macro Plasma Incinerator Supercharge are the
   * Hazardous weapons in data/datasheets.ts). So no single real report can contain every kind.
   */
  actor: PlayerId
  /**
   * Ids (`UnitState.id`) of the HUMAN's units involved, primary unit first. Never contains an
   * enemy unit: enemy ids go to {@link Finding.refs} (`targetUnitId`, `enemyUnitId`, …). Empty ONLY for the
   * battle-wide findings ({@link BATTLE_WIDE_KINDS}: `result.summary`, `luck.summary`); every other kind
   * has at least one unit (`missed.waaagh`: the unit within Waaagh! reach, see that kind).
   * For `luck.swing` / `loss.attribution` the primary unit is the human unit involved
   * (attacker of an own attack, defender of an enemy attack).
   */
  unitIds: string[]
  /**
   * `Frame.index` of the decision point (for "show me this moment" navigation), or `null` for a
   * battle-wide finding with no navigation target ({@link BATTLE_WIDE_KINDS}). Every other
   * kind has a non-null index >= 0 into THIS report's frames (for a partial record: its rebased frames).
   */
  frameIndex: number | null
  /**
   * Wounds-EQUIVALENT size of the finding, >= 0, finite; bigger = matters more. EVERY analyzer
   * fills it, and it is a PURE FUNCTION of `kind` + `metrics`: exactly the formula in
   * {@link IMPACT_SOURCE} (computed by `impactFromMetrics`, shape.ts; tolerance 1e-9). An analyzer therefore
   * sets `impact = impactFromMetrics(kind, metrics)` on the FINAL metrics object, i.e. AFTER any rounding of
   * the metrics (never from the unrounded intermediate values). Severity is
   * derived from it (see {@link Severity}); the RANKER sorts by severity, then `impact` descending,
   * then `id` ascending (stable) — see {@link FINDING_CLASS}.
   */
  impact: number
  /**
   * Numeric facts the UI text interpolates. EXACTLY the keys listed for this kind in
   * {@link METRIC_KEYS} — no more, no fewer — in the unit given by {@link METRIC_UNITS}.
   */
  metrics: Record<string, number>
  /**
   * String ids the UI text interpolates (weapon, profile, objective, terrain, enemy unit …).
   * A SUBSET of the keys allowed for this kind in {@link REF_KEYS}; omit the field when empty.
   */
  refs?: Record<string, string>
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Frozen metric keys
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Unit of a metric key. */
export type MetricUnit = 'wounds' | 'probability' | 'inches' | 'vp' | 'count' | 'ratio' | 'share' | 'index' | 'oc' | 'flag'

/**
 * UNIT OF EVERY METRIC KEY (one canonical name per concept; the suffix tells the unit):
 *  - `*Wounds`       wounds, >= 0. Prefix tells which: `chosen`/`best`/`alternative`/`self`/`gain`/
 *                    `enemy`/`available`/`expected` = expected values (averages over all dice);
 *                    `actual`/`wasted`/`delta` = see below. ONE KEY NAME, ONE MEANING:
 *                      `dealtWounds` / `takenWounds`          ALL-source wounds (damage accounting of
 *                                                              CoachReport.totals.damageDealt / damageTaken),
 *                                                              scoped to the finding's subject (a player, a unit);
 *                      `attackDealtWounds` / `attackTakenWounds`  ATTACK-only wounds (totals.attackDealt / attackTaken),
 *                                                              the basis of every luck term;
 *                      `expectedDealtWounds` / `expectedTakenWounds`  expected ATTACK wounds (totals.expectedDealt / Taken).
 *                    RATIO-TYPE METRICS (`ratio`, `*Share`, and the best/chosen quotient behind SHOOT.PROFILE_MIN_RATIO)
 *                    are emitted only when their DENOMINATOR > 0 (chosenExpectedWounds for `ratio`, the attack's expected
 *                    wounds for `wastedShare`). When it is 0 the analyzer MUST skip the finding; never emit Infinity/NaN.
 *                    CHARGE METRICS (charge.*, missed.charge, move.chargeExposure) have ONE definition:
 *                      `distanceInches`  = `unitDistance` (edge to edge between the closest models of the two units,
 *                                          engine.ts `chargeTargetsFor`); for move.chargeExposure the distance from the
 *                                          threatening enemy unit to the human unit.
 *                      reach             a roll `roll` (2D6 total) reaches iff `roll > 2 && distance <= roll + EPS`
 *                                          (`withinRange`, geometry.ts, EPS = 1e-3; also `distance <= CHARGE_RANGE` = 12),
 *                                          i.e. roll >= max(3, ceil(distance - EPS)). NOTE: ai.ts uses `ceil(d)` without EPS;
 *                                          the coach does NOT.
 *                      `chargeProbability` = P(2D6 reaches) = `p2d6AtLeast(max(3, ceil(distance - EPS)))` semantics
 *                                          (ai.ts: P(2D6 >= n), 0 when distance > 12). It is an UPPER BOUND: whether
 *                                          `planCharge` (engine.ts) can find a legal path / base placement is NOT part of it.
 *                      `rollInches`      = the 2D6 total actually rolled (charge.badOdds / charge.failedByLuck only).
                      TARGET UNIT: `declareCharge` names no target (success = reaching ANY enemy, `chargeTargetsFor`).
                          For `charge.badOdds`, `charge.failedByLuck` and `missed.charge` the distance is measured to the
                          NEAREST enemy by `unitDistance` in the `before` state of the `declareCharge` frame (for
                          `missed.charge`: the frame where the charge could have been declared); ties → first in
                          `state.units` order. `refs.targetUnitId` = that unit, and `frameIndex` is that frame.
                      `expectedMeleeWounds` = expected wounds of the melee matchup CONDITIONAL on the charge succeeding
                          (NOT multiplied by `chargeProbability`; the probability is its own metric). It is the impact of
                          `missed.charge` and `move.chargeExposure`, so those two always rank by the success case.
 *  - `*Probability`  probability, 0..1 (never a percentage).
 *  - `*Inches`       board distance or dice distance in inches, >= 0.
 *  - `*Vp`           victory points (integer-valued, >= 0).
 *  - `*Count`        non-negative integer count.
 *  - `*Share`        fraction 0..1.
 *  - `ratio`         plain multiplier >= 1 (3 = "3x").
 *  - `luckIndex`     -1..+1, see CoachReport.totals.
 *  - `*Oc`           objective-control points, non-negative integer.
 *  - `is*`           flag, exactly 0 or 1.
 *
 * Canonical "alternative" trio, used by every "you chose A, B was better/equal" kind:
 *   `chosenExpectedWounds`  EV of what the human did,
 *   `bestExpectedWounds`    EV of the best alternative (or `alternativeExpectedWounds` for good.* kinds: the
 *                           best OTHER option),
 *   `deltaWounds`           |best - chosen| (the size of the difference; never negative — the sign is the kind).
 * For damage the human DEALS, higher is better; for damage the human TAKES (move.*), the EV is the
 * wounds taken, so "best" is the lower one. `impact` of every kind: see {@link IMPACT_SOURCE}.
 */
export const METRIC_UNITS: Readonly<Record<string, MetricUnit>> = {
  // alternatives
  chosenExpectedWounds: 'wounds',
  bestExpectedWounds: 'wounds',
  alternativeExpectedWounds: 'wounds',
  deltaWounds: 'wounds',
  ratio: 'ratio',
  alternativeCount: 'count',
  // actual / expected accounting
  dealtWounds: 'wounds',
  takenWounds: 'wounds',
  attackDealtWounds: 'wounds',
  attackTakenWounds: 'wounds',
  actualWounds: 'wounds',
  expectedWounds: 'wounds',
  expectedDealtWounds: 'wounds',
  expectedTakenWounds: 'wounds',
  luckIndex: 'index',
  tailProbability: 'probability',
  attackCount: 'count',
  isOwnAttack: 'flag',
  // shooting
  wastedWounds: 'wounds',
  wastedShare: 'share',
  selfExpectedWounds: 'wounds',
  gainExpectedWounds: 'wounds',
  advanceRollInches: 'inches',
  targetCount: 'count',
  // charge / melee / movement
  chargeProbability: 'probability',
  rollInches: 'inches',
  distanceInches: 'inches',
  expectedMeleeWounds: 'wounds',
  enemyExpectedWounds: 'wounds',
  shooterCount: 'count',
  decisionCount: 'count',
  // objectives / VP
  lostVp: 'vp',
  swingVp: 'vp',
  scoredVp: 'vp',
  turnCount: 'count',
  humanOc: 'oc',
  enemyOc: 'oc',
  lostOc: 'oc',
  // headline
  roundCount: 'count',
  humanVp: 'vp',
  enemyVp: 'vp',
  unusedTurnCount: 'count',
}

/**
 * EXACT numeric metric keys per kind. Every Finding of a kind has precisely these keys in
 * `metrics` (all required, no extras); fixtures.test.ts enforces it. Semantics:
 *
 *  result.summary    roundCount, humanVp, enemyVp, dealtWounds (= totals.damageDealt), takenWounds (= totals.damageTaken)  [all sources]
 *  luck.summary      luckIndex, attackDealtWounds (= totals.attackDealt), expectedDealtWounds, attackTakenWounds (= totals.attackTaken), expectedTakenWounds
 *  luck.swing        tailProbability, actualWounds, expectedWounds, attackCount, isOwnAttack
 *                    (`isOwnAttack` = 1 if the sequence is the human's own attack, 0 if it is an enemy attack on the human)
 *  loss.attribution  takenWounds, enemyExpectedWounds, decisionCount. DECISIVE ENEMY TURN = the enemy player turn
 *                    in which the unit was destroyed (frame anchor = the destroying command's frame).
 *                    `takenWounds` = all-source wounds the unit lost in that turn; `enemyExpectedWounds` = expected
 *                    ATTACK wounds against that unit from the enemy attacks actually made in that turn (computed
 *                    from each attack's `before` state, expectation not rolled result); `decisionCount` = number of
 *                    the human's own commands involving this unit (move, shoot, charge, fight) in the human's most
 *                    recent turn before the decisive enemy turn.
 *  objective.swing   swingVp (human VP not scored + enemy VP gained because of the flip), humanOc, enemyOc
 *  objective.battleShock  lostVp, lostOc (OC zeroed by Battle-shock), enemyOc
 *  shoot.targetChoice, shoot.profileChoice, shoot.advanceCost, shoot.coverIgnored,
 *  shoot.firingPosition, fight.targetChoice, move.noCover, move.fallBackDecision, move.advanceDecision
 *                    chosenExpectedWounds, bestExpectedWounds, deltaWounds [+ extras below]
 *      shoot.targetChoice, fight.targetChoice: + ratio (best / chosen)
 *      shoot.advanceCost, move.advanceDecision: + advanceRollInches
 *      shoot.firingPosition, move.noCover: + distanceInches (to the target / to the reachable covered spot)
 *  shoot.overkill    wastedWounds, wastedShare
 *  shoot.hazardLoss  selfExpectedWounds, gainExpectedWounds, deltaWounds (self - gain)
 *  charge.badOdds, charge.failedByLuck
 *                    chargeProbability, distanceInches, rollInches (the 2D6 result actually rolled; definitions in METRIC_UNITS)
 *  missed.charge     chargeProbability, expectedMeleeWounds, distanceInches
 *  move.exposed      enemyExpectedWounds (next enemy turn, enemy movement ignored), shooterCount, distanceInches (to nearest enemy)
 *  move.chargeExposure  chargeProbability (enemy charge success), expectedMeleeWounds, distanceInches (to the threatening enemy)
 *  move.objectiveNeglect  lostVp, turnCount, distanceInches (unit to the objective)
 *  missed.objective  lostVp, distanceInches
 *  missed.shot       bestExpectedWounds (best shot available), targetCount
 *  missed.waaagh     unusedTurnCount (own turns left in the battle when it ended / was decided with WAAAGH! unused)
 *  missed.ammoRunts  chosenExpectedWounds (as shot), bestExpectedWounds (with Ammo Runts), deltaWounds
 *  good.targetChoice chosenExpectedWounds, alternativeExpectedWounds (best other target), alternativeCount
 *  good.objectiveHeld  turnCount, scoredVp
 *  good.efficiency   attackDealtWounds, expectedDealtWounds, attackCount   (attack wounds only: compared with expected attack wounds)
 *  good.cover        chosenExpectedWounds (at the covered position), alternativeExpectedWounds (uncovered), deltaWounds
 */
export const METRIC_KEYS: Readonly<Record<FindingKind, readonly string[]>> = {
  'result.summary': ['roundCount', 'humanVp', 'enemyVp', 'dealtWounds', 'takenWounds'],
  'loss.attribution': ['takenWounds', 'enemyExpectedWounds', 'decisionCount'],
  'objective.swing': ['swingVp', 'humanOc', 'enemyOc'],
  'objective.battleShock': ['lostVp', 'lostOc', 'enemyOc'],
  'luck.summary': ['luckIndex', 'attackDealtWounds', 'expectedDealtWounds', 'attackTakenWounds', 'expectedTakenWounds'],
  'luck.swing': ['tailProbability', 'actualWounds', 'expectedWounds', 'attackCount', 'isOwnAttack'],
  'shoot.targetChoice': ['chosenExpectedWounds', 'bestExpectedWounds', 'deltaWounds', 'ratio'],
  'shoot.profileChoice': ['chosenExpectedWounds', 'bestExpectedWounds', 'deltaWounds'],
  'shoot.overkill': ['wastedWounds', 'wastedShare'],
  'shoot.advanceCost': ['chosenExpectedWounds', 'bestExpectedWounds', 'deltaWounds', 'advanceRollInches'],
  'shoot.coverIgnored': ['chosenExpectedWounds', 'bestExpectedWounds', 'deltaWounds'],
  'shoot.hazardLoss': ['selfExpectedWounds', 'gainExpectedWounds', 'deltaWounds'],
  'shoot.firingPosition': ['chosenExpectedWounds', 'bestExpectedWounds', 'deltaWounds', 'distanceInches'],
  'charge.badOdds': ['chargeProbability', 'distanceInches', 'rollInches'],
  'charge.failedByLuck': ['chargeProbability', 'distanceInches', 'rollInches'],
  'fight.targetChoice': ['chosenExpectedWounds', 'bestExpectedWounds', 'deltaWounds', 'ratio'],
  'move.exposed': ['enemyExpectedWounds', 'shooterCount', 'distanceInches'],
  'move.noCover': ['chosenExpectedWounds', 'bestExpectedWounds', 'deltaWounds', 'distanceInches'],
  'move.objectiveNeglect': ['lostVp', 'turnCount', 'distanceInches'],
  'move.chargeExposure': ['chargeProbability', 'expectedMeleeWounds', 'distanceInches'],
  'move.fallBackDecision': ['chosenExpectedWounds', 'bestExpectedWounds', 'deltaWounds'],
  'move.advanceDecision': ['chosenExpectedWounds', 'bestExpectedWounds', 'deltaWounds', 'advanceRollInches'],
  'missed.shot': ['bestExpectedWounds', 'targetCount'],
  'missed.charge': ['chargeProbability', 'expectedMeleeWounds', 'distanceInches'],
  'missed.waaagh': ['unusedTurnCount'],
  'missed.ammoRunts': ['chosenExpectedWounds', 'bestExpectedWounds', 'deltaWounds'],
  'missed.objective': ['lostVp', 'distanceInches'],
  'good.targetChoice': ['chosenExpectedWounds', 'alternativeExpectedWounds', 'alternativeCount'],
  'good.objectiveHeld': ['turnCount', 'scoredVp'],
  'good.efficiency': ['attackDealtWounds', 'expectedDealtWounds', 'attackCount'],
  'good.cover': ['chosenExpectedWounds', 'alternativeExpectedWounds', 'deltaWounds'],
}

/**
 * HOW `Finding.impact` IS COMPUTED, per kind (frozen; machine-checkable). `impactFromMetrics(kind, metrics)`
 * (shape.ts) evaluates it; `findingShapeErrors` and fixtures.test.ts assert `impact` equals it within 1e-9.
 *  - `metric`  impact = metrics[key]
 *  - `vp`      impact = metrics[key] * REPORT.VP_TO_WOUNDS   (key is a `*Vp` metric)
 *  - `absDiff` impact = |metrics[a] - metrics[b]|
 *  - `fixed`   impact = value (kinds whose size has no measured wounds metric)
 * Every key named here is in METRIC_KEYS[kind] (tested). Severity is then derived from the impact bands.
 */
export type ImpactSource =
  | { from: 'metric'; key: string }
  | { from: 'vp'; key: string }
  | { from: 'absDiff'; a: string; b: string }
  | { from: 'fixed'; value: number }

export const IMPACT_SOURCE: Readonly<Record<FindingKind, ImpactSource>> = {
  'result.summary': { from: 'fixed', value: 0 }, // headline context, never ranked
  'loss.attribution': { from: 'metric', key: 'enemyExpectedWounds' }, // expected wounds the enemy turn should deal (rule 1: expectation, not the rolled wounds)
  'objective.swing': { from: 'vp', key: 'swingVp' }, // VP swing converted at VP_TO_WOUNDS
  'objective.battleShock': { from: 'vp', key: 'lostVp' }, // VP lost to OC 0, converted
  'luck.summary': { from: 'fixed', value: 0 }, // explains, does not rank
  'luck.swing': { from: 'absDiff', a: 'actualWounds', b: 'expectedWounds' }, // how far the dice were from the average
  'shoot.targetChoice': { from: 'metric', key: 'deltaWounds' }, // best EV - chosen EV
  'shoot.profileChoice': { from: 'metric', key: 'deltaWounds' }, // best profile EV - chosen profile EV
  'shoot.overkill': { from: 'metric', key: 'wastedWounds' }, // expected wounds thrown away
  'shoot.advanceCost': { from: 'metric', key: 'deltaWounds' }, // EV lost by advancing
  'shoot.coverIgnored': { from: 'metric', key: 'deltaWounds' }, // EV gained by the uncovered equal target
  'shoot.hazardLoss': { from: 'metric', key: 'deltaWounds' }, // self EV - gain EV (net loss)
  'shoot.firingPosition': { from: 'metric', key: 'deltaWounds' }, // EV lost to the lost bonus / line of sight
  'charge.badOdds': { from: 'fixed', value: CHARGE.BAD_ODDS_IMPACT_WOUNDS }, // no wounds metric: a wasted turn, fixed (config)
  'charge.failedByLuck': { from: 'fixed', value: 0 }, // explanation, not a mistake
  'fight.targetChoice': { from: 'metric', key: 'deltaWounds' }, // best melee EV - chosen EV
  'move.exposed': { from: 'metric', key: 'enemyExpectedWounds' }, // expected next-turn damage at the end position
  'move.noCover': { from: 'metric', key: 'deltaWounds' }, // EV taken in the open - EV in the reachable cover
  'move.objectiveNeglect': { from: 'vp', key: 'lostVp' }, // VP left on the table, converted
  'move.chargeExposure': { from: 'metric', key: 'expectedMeleeWounds' }, // expected melee wounds of the matchup
  'move.fallBackDecision': { from: 'metric', key: 'deltaWounds' }, // EV difference vs the alternative
  'move.advanceDecision': { from: 'metric', key: 'deltaWounds' }, // EV difference vs the alternative
  'missed.shot': { from: 'metric', key: 'bestExpectedWounds' }, // the best shot not taken
  'missed.charge': { from: 'metric', key: 'expectedMeleeWounds' }, // the melee not fought
  'missed.waaagh': { from: 'fixed', value: 0 }, // heuristic only (always 'info'): no measurable wounds
  'missed.ammoRunts': { from: 'metric', key: 'deltaWounds' }, // EV with Ammo Runts - EV as shot
  'missed.objective': { from: 'vp', key: 'lostVp' }, // VP forgone, converted
  'good.targetChoice': { from: 'absDiff', a: 'chosenExpectedWounds', b: 'alternativeExpectedWounds' }, // margin over the best other target
  'good.objectiveHeld': { from: 'vp', key: 'scoredVp' }, // VP scored, converted
  'good.efficiency': { from: 'absDiff', a: 'attackDealtWounds', b: 'expectedDealtWounds' }, // surplus over the expected damage
  'good.cover': { from: 'metric', key: 'deltaWounds' }, // EV saved by the covered position
}

/**
 * ALLOWED string ref keys per kind (`Finding.refs` may use any SUBSET; omit refs when none apply):
 *  - `targetUnitId`        enemy unit the human attacked / charged / was fighting.
 *  - `betterTargetUnitId`  enemy unit that would have been the better target.
 *  - `enemyUnitId`         any other enemy unit involved (killer, threat, nearest enemy, flipper).
 *  - `weaponId`            `Weapon.id` (e.g. 'boltRifle', 'macroPlasma', 'plasmaPistol').
 *  - `profileIndex`        index of the profile the human used, as a string ('0', '1').
 *  - `betterProfileIndex`  index of the better profile, as a string.
 *  - `objectiveId`         `Objective.id` ('o1', 'o2', 'o3'). REQUIRED (see {@link REQUIRED_REFS}) on the four kinds of the
 *                          objective supersession group: it is part of their SUPERSEDES match key.
 *  - `terrainId`           `Terrain.id` (cover / ruin involved).
 *  - `cause`               short code: for `shoot.firingPosition` one of 'rapidFire' | 'heavy' | 'lineOfSight'.
 */
export const REF_KEYS: Readonly<Record<FindingKind, readonly string[]>> = {
  'result.summary': [],
  'loss.attribution': ['enemyUnitId', 'terrainId'],
  'objective.swing': ['objectiveId', 'enemyUnitId'],
  'objective.battleShock': ['objectiveId', 'enemyUnitId'],
  'luck.summary': [],
  'luck.swing': ['enemyUnitId', 'targetUnitId', 'weaponId', 'profileIndex'],
  'shoot.targetChoice': ['targetUnitId', 'betterTargetUnitId', 'weaponId'],
  'shoot.profileChoice': ['targetUnitId', 'weaponId', 'profileIndex', 'betterProfileIndex'],
  'shoot.overkill': ['targetUnitId', 'weaponId'],
  'shoot.advanceCost': ['targetUnitId'],
  'shoot.coverIgnored': ['targetUnitId', 'betterTargetUnitId', 'terrainId'],
  'shoot.hazardLoss': ['targetUnitId', 'weaponId', 'profileIndex'],
  'shoot.firingPosition': ['targetUnitId', 'weaponId', 'cause', 'terrainId'],
  'charge.badOdds': ['targetUnitId'],
  'charge.failedByLuck': ['targetUnitId'],
  'fight.targetChoice': ['targetUnitId', 'betterTargetUnitId'],
  'move.exposed': ['enemyUnitId', 'terrainId'],
  'move.noCover': ['terrainId', 'enemyUnitId'],
  'move.objectiveNeglect': ['objectiveId'],
  'move.chargeExposure': ['enemyUnitId'],
  'move.fallBackDecision': ['enemyUnitId'],
  'move.advanceDecision': ['targetUnitId'],
  'missed.shot': ['targetUnitId', 'weaponId'],
  'missed.charge': ['targetUnitId'],
  'missed.waaagh': [],
  'missed.ammoRunts': ['targetUnitId', 'weaponId'],
  'missed.objective': ['objectiveId'],
  'good.targetChoice': ['targetUnitId', 'weaponId'],
  'good.objectiveHeld': ['objectiveId'],
  'good.efficiency': ['targetUnitId'],
  'good.cover': ['terrainId'],
}

/**
 * Refs that are NOT optional for a kind (a subset of {@link REF_KEYS}; `findingShapeErrors` enforces it).
 * The objective group matches SUPERSEDES on `(actor, round, refs.objectiveId)`, so each of its kinds must carry it.
 */
export const REQUIRED_REFS: Readonly<Partial<Record<FindingKind, readonly string[]>>> = {
  'objective.swing': ['objectiveId'],
  'objective.battleShock': ['objectiveId'],
  'move.objectiveNeglect': ['objectiveId'],
  'missed.objective': ['objectiveId'],
}

/**
 * Battle-wide kinds: `frameIndex` is `null` and `unitIds` is empty for exactly these (and for no other
 * kind: every other kind has a frame index >= 0 and >= 1 unit). They are outside every SUPERSEDES pair.
 */
export const BATTLE_WIDE_KINDS: readonly FindingKind[] = ['result.summary', 'luck.summary']

/**
 * Faction gating (`Finding.actor`'s faction): a real report never contains these kinds for the
 * other faction. `missed.waaagh` / `missed.ammoRunts` need the Orks' abilities; `shoot.hazardLoss`
 * needs a Hazardous weapon, which only Marines have (plasma pistol, Redemptor macro-plasma).
 */
export const FACTION_GATED_KINDS: Readonly<Partial<Record<FindingKind, PlayerId>>> = {
  'missed.waaagh': 'orks',
  'missed.ammoRunts': 'orks',
  'shoot.hazardLoss': 'marines',
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Classification, placement and precedence (constant data for the ranker and the UI)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Role of a kind. The ranker places findings by class; the UI picks the TONE by class.
 *  - `summary`  headline only (`result.summary`): neutral.
 *  - `mistake`  a decision the human can improve: corrective tone.
 *  - `missed`   an option never taken: suggestive tone.
 *  - `luck`     dice luck, good or bad: explaining, never blaming.
 *  - `explain`  an outcome explained by the dice that is NOT a mistake (e.g. `charge.failedByLuck`): reassuring tone.
 *  - `positive` a thing done well: praising tone.
 */
export type FindingClass = 'summary' | 'mistake' | 'missed' | 'luck' | 'positive' | 'explain'

export const FINDING_CLASS: Readonly<Record<FindingKind, FindingClass>> = {
  'result.summary': 'summary',
  'loss.attribution': 'mistake',
  'objective.swing': 'mistake',
  'objective.battleShock': 'mistake',
  'luck.summary': 'luck',
  'luck.swing': 'luck',
  'shoot.targetChoice': 'mistake',
  'shoot.profileChoice': 'mistake',
  'shoot.overkill': 'mistake',
  'shoot.advanceCost': 'mistake',
  'shoot.coverIgnored': 'mistake',
  'shoot.hazardLoss': 'mistake',
  'shoot.firingPosition': 'mistake',
  'charge.badOdds': 'mistake',
  'charge.failedByLuck': 'explain',
  'fight.targetChoice': 'mistake',
  'move.exposed': 'mistake',
  'move.noCover': 'mistake',
  'move.objectiveNeglect': 'mistake',
  'move.chargeExposure': 'mistake',
  'move.fallBackDecision': 'mistake',
  'move.advanceDecision': 'mistake',
  'missed.shot': 'missed',
  'missed.charge': 'missed',
  'missed.waaagh': 'missed',
  'missed.ammoRunts': 'missed',
  'missed.objective': 'missed',
  'good.targetChoice': 'positive',
  'good.objectiveHeld': 'positive',
  'good.efficiency': 'positive',
  'good.cover': 'positive',
}

/** Which topical report list a finding that did not get (or lost) its class slot falls into. */
export type FindingTopic = 'headline' | 'luck' | 'shooting' | 'movement'

/** Topical list per kind; used for overflow (see PLACEMENT RULE). Independent of the class. */
export const FINDING_TOPIC: Readonly<Record<FindingKind, FindingTopic>> = {
  'result.summary': 'headline',
  'loss.attribution': 'movement',
  'objective.swing': 'movement',
  'objective.battleShock': 'movement',
  'luck.summary': 'luck',
  'luck.swing': 'luck',
  'shoot.targetChoice': 'shooting',
  'shoot.profileChoice': 'shooting',
  'shoot.overkill': 'shooting',
  'shoot.advanceCost': 'shooting',
  'shoot.coverIgnored': 'shooting',
  'shoot.hazardLoss': 'shooting',
  'shoot.firingPosition': 'shooting',
  'charge.badOdds': 'movement',
  'charge.failedByLuck': 'movement',
  'fight.targetChoice': 'movement',
  'move.exposed': 'movement',
  'move.noCover': 'movement',
  'move.objectiveNeglect': 'movement',
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
 * Every FindingKind exactly once. Typed via Records so the COMPILER errors when a kind is added
 * to (or removed from) the union without updating FINDING_TOPIC / FINDING_CLASS / METRIC_KEYS / REF_KEYS.
 */
export const ALL_FINDING_KINDS = Object.keys(FINDING_TOPIC) as FindingKind[]

/**
 * PRECEDENCE: `SUPERSEDES[winner]` lists the kinds that `winner` makes redundant. Applied by the
 * ranker BEFORE placement, to the full set of findings at once (order-independent; every loser is
 * listed under EVERY winner that should beat it, so no transitive closure is needed). A finding is
 * dropped when some OTHER finding of a superseding kind MATCHES it. The match key depends on the group:
 *  - OBJECTIVE GROUP (`objective.swing`, `objective.battleShock`, `missed.objective`, `move.objectiveNeglect`):
 *      same `actor`, same `round` and same `refs.objectiveId`. (The same objective on the same round is the
 *      same story whichever unit was involved; `objectiveId` is REQUIRED on these kinds, see
 *      {@link REQUIRED_REFS}.) A side without `refs.objectiveId` matches nothing.
 *  - EVERY OTHER PAIR: same `actor`, same `round` and same `unitIds[0]`, and ONLY when `unitIds[0]` is
 *      defined on BOTH sides (empty `unitIds` never matches). `frameIndex` is deliberately NOT part of any
 *      key: a movement finding and a shooting finding about the same unit-turn sit in different frames.
 *      One unit makes at most one move/shoot/charge per own turn, so (round, actor, unitIds[0]) identifies
 *      the unit-turn.
 * Both keys are equivalence relations within a group, and the table is acyclic (checked), so the result
 * does not depend on input order even for 3-way matches (e.g. battleShock + swing + neglect on one
 * objective keeps only the battleShock).
 *
 *  - objective.battleShock > objective.swing, missed.objective, move.objectiveNeglect:
 *      the shock is the specific CAUSE (OC 0); the flip, the unreached objective and the neglect
 *      are its symptoms.
 *  - objective.swing > missed.objective, move.objectiveNeglect:
 *      an actual flip (VP already lost) is a harder fact than a possible one or a pattern.
 *  - missed.objective > move.objectiveNeglect:
 *      the concrete one-turn "you could have taken it free" is more actionable than the multi-turn pattern.
 *  - shoot.advanceCost > shoot.firingPosition:
 *      advancing's expected loss already includes every lost bonus (Rapid Fire, Heavy, LoS).
 *  - shoot.targetChoice > shoot.overkill:
 *      overkill is a symptom of the wrong target; the target finding names the cure.
 *
 * NOT superseded: `shoot.coverIgnored` vs `move.noCover` are different lessons (offence: the TARGET had
 * cover; defence: the human's OWN unit stood in the open) and both stay.
 * `missed.charge` vs `charge.badOdds` needs NO entry: they are mutually exclusive for one unit-turn
 * (the unit either declared a charge or it did not). `charge.failedByLuck` (p >= 0.5) and
 * `charge.badOdds` (p <= 0.15) are exclusive by their thresholds.
 */
export const SUPERSEDES: Readonly<Partial<Record<FindingKind, readonly FindingKind[]>>> = {
  'objective.battleShock': ['objective.swing', 'missed.objective', 'move.objectiveNeglect'],
  'objective.swing': ['missed.objective', 'move.objectiveNeglect'],
  'missed.objective': ['move.objectiveNeglect'],
  'shoot.advanceCost': ['shoot.firingPosition'],
  'shoot.targetChoice': ['shoot.overkill'],
}

/**
 * Kinds the ranker removes when the `lowData` note applies: every class-`luck` kind (statistics
 * mean nothing in a tiny game) and `good.efficiency`. NOT removed: `charge.failedByLuck` (an exact
 * fact about one charge) and everything else. `totals.luckIndex` is still computed.
 */
export const LOW_DATA_SUPPRESSED_KINDS: readonly FindingKind[] = ALL_FINDING_KINDS.filter(
  (k) => FINDING_CLASS[k] === 'luck' || k === 'good.efficiency',
)

// PLACEMENT RULE (used by the ranker; UI may rely on it). Rank order everywhere = severity
// (critical > major > minor > info), then `impact` descending, then `id` ascending. Steps:
//  0. Drop findings superseded per {@link SUPERSEDES}. If `lowData` applies, drop
//     {@link LOW_DATA_SUPPRESSED_KINDS} and all positives (`positives` is empty).
//  1. class `summary` (`result.summary`) → `headline`, nothing else.
//  2. class `mistake` → `mistakes`: only findings with severity >= 'minor' (not 'info') AND
//     confidence != 'heuristic' are eligible; take them in rank order, skipping a finding whose
//     kind already has `REPORT.MAX_PER_KIND_IN_MISTAKES` entries, until `REPORT.MAX_MISTAKES`.
//     Every other `mistake` finding (ineligible, over the per-kind cap, or list full) overflows to
//     its topical list (`FINDING_TOPIC`: `shooting` / `movement`).
//  3. class `missed` → `missed` (top `REPORT.MAX_MISSED`); overflow → topical list.
//  4. `luck.summary` → ALWAYS the FIRST entry of `luck`, in a RESERVED slot that does NOT count toward
//     `REPORT.MAX_LUCK` (so `luck.length <= MAX_LUCK + 1`; absent only when `lowData` suppressed it).
//     The other class `luck` kinds (`luck.swing`) → the rest of `luck` in rank order (top `REPORT.MAX_LUCK`,
//     shared with class `explain`); OVERFLOW DROPPED. So `luck` is NOT globally rank-sorted: summary first,
//     then rank order. class `explain` (`charge.failedByLuck`) → NEVER in `mistakes`; competes for the
//     same `MAX_LUCK` slots; its overflow goes to its topical list.
//  5. class `positive` → `positives` (top `REPORT.MAX_POSITIVES`, at least `REPORT.MIN_POSITIVES`
//     when that many qualify); overflow → topical list.
//  6. Each topical list is sorted by rank and capped at `REPORT.MAX_TOPICAL` (the rest is dropped).
// Every finding therefore appears in exactly ONE list (or is dropped by steps 0, 4 or 6).
//
// PLAN RULE (ONE deterministic rule; the executable spec is `planOf` in __tests__/fixtures.test.ts, every
// report sample follows it). Runs on the FINAL report lists, after steps 0-6:
//  P1. Pool = every finding of class `mistake` or `missed` present in ANY list of the report (`mistakes`,
//      `missed`, `shooting`, `movement`, wherever overflow put it) whose severity is NOT 'info'. Because
//      every `heuristic` finding is capped at 'info' (see `Severity`), this also keeps heuristic advice out
//      of the plan: the plan only ever recommends practising things that are measured, not guessed.
//      (Step 2's per-kind and list-size caps do not apply: a finding that overflowed to a topical list is
//      still eligible.) Classes `luck`, `explain`, `positive`, `summary` NEVER enter the plan.
//  P2. Rank the pool (severity, impact desc, id asc). A KIND's rank = the rank of its first finding.
//  P3. Select, in this order: the top 2 DISTINCT kinds of class `mistake`; then the top distinct kind of
//      class `missed`; then, if fewer than `REPORT.MAX_PLAN` (3) are selected, fill with the next ranked
//      distinct kinds not yet selected, from `mistake` and `missed` TOGETHER (merged rank order), until 3 or
//      the pool is exhausted. Never more than 3; a kind appears once.
//  P4. `plan` keeps the SELECTION order (mistake 1, mistake 2, missed 1, fills...), not a re-sorted order.
//  P5. `PlanItem.findingIds` = ALL findings of that kind present in the pool, in rank order (so it can point
//      into `mistakes`, `missed`, `shooting` or `movement`).

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Report
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A suggested focus for the next battle (at most 3 per report, chosen by the PLAN RULE). The UI maps `kind` to advice text and a tutorial lesson. */
export interface PlanItem {
  /** Which kind of mistake/opportunity to work on. Must be a `mistake` or `missed` class kind. */
  kind: FindingKind
  /**
   * Ids of ALL findings of this `kind` that are in the PLAN POOL (class `mistake`/`missed`, severity != 'info',
   * in any list: `mistakes`, `missed`, `shooting`, `movement`), in rank order; non-empty, all exist in the report.
   * Findings of the same kind with severity 'info' are NOT included. Selection: see the PLAN RULE above.
   */
  findingIds: string[]
}

/** Per-player stats for one round (both players' turns of that round combined). */
export interface PlayerRoundStats {
  /** VP of this player at the END of the round. */
  vp: number
  /**
   * Wounds removed from the OPPONENT's models during the round by this player's actions or models, from
   * ANY source (attacks and non-attack damage). Own-side victims never count (see CoachReport.totals).
   */
  damageDealt: number
  /** Wounds this player's own models lost during the round from ANY source, caused by anyone, including the player's own Hazardous / Desperate Escape / Deadly Demise. */
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
 * Caveats shown on the report; metric keys are frozen in {@link NOTE_METRIC_KEYS}.
 *  - `partial`      Record was rebased mid-battle; earlier rounds are missing.
 *  - `lowData`      Too little happened for statistics to mean much. The RANKER (not the analyzers)
 *                   suppresses {@link LOW_DATA_SUPPRESSED_KINDS} and positives and adds this note when
 *                   `rounds < REPORT.LOW_DATA_MIN_ROUNDS` OR `humanAttackActions < REPORT.LOW_DATA_MIN_ATTACK_ACTIONS`
 *                   OR `humanAttackDice < REPORT.LOW_DATA_MIN_ATTACK_DICE` (all strict `<`; `humanAttackActions` and
 *                   `humanAttackDice` come from {@link StatsResult}). Analyzers ALWAYS emit their findings.
 *  - `estimateOnly` The report has at least one non-battle-wide finding (`frameIndex` not null) and none of
 *                   them is `exact`; nothing could be proven exactly.
 */
export type ReportNoteKind = 'partial' | 'lowData' | 'estimateOnly'

export const NOTE_METRIC_KEYS: Readonly<Record<ReportNoteKind, readonly string[]>> = {
  /** `firstRound` = round number (1-based) of the first recorded round. */
  partial: ['firstRound'],
  /** `rounds` = recorded rounds; `humanAttackActions` / `humanAttackDice` = the StatsResult counters. */
  lowData: ['rounds', 'humanAttackActions', 'humanAttackDice'],
  estimateOnly: [],
}

export interface ReportNote {
  kind: ReportNoteKind
  /** Exactly the keys of `NOTE_METRIC_KEYS[kind]`; omit when that list is empty. */
  metrics?: Record<string, number>
}

/**
 * The finished coach report. All lists are sorted by rank (severity, impact desc, id).
 *
 * CAPS (enforced by the ranker; values live in config.ts `REPORT`): mistakes <= 5 (<= 2 per kind),
 * missed <= 3, luck <= 3 PLUS the reserved `luck.summary` slot (so <= 4 entries, summary first), positives 2–3 (fewer only when fewer qualify; none when `lowData`),
 * plan <= 3, shooting / movement <= `REPORT.MAX_TOPICAL` each. Placement: see the PLACEMENT RULE
 * above (FINDING_CLASS decides the list, FINDING_TOPIC the overflow).
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
  /**
   * DAMAGE ACCOUNTING. Unit: wounds actually removed from models (mortal wounds included; excess damage
   * on a model is lost and not counted, as in the engine). Removing a model for broken coherency at the
   * end of a turn (engine.ts `endTurn`) is NOT damage. Every wound-loss event has a VICTIM side V (owner
   * of the wounded model) and a CAUSE side C (owner of the attacking unit / hazardous weapon / fleeing
   * unit / exploding vehicle):
   *   damageTaken[V] += w   for EVERY event, whatever the source or the cause side;
   *   damageDealt[C] += w   only when C != V (the victim is on the OPPONENT's side).
   * So damage a player's own sources do to the player's own models (Hazardous, Desperate Escape, a Deadly
   * Demise of the player's own vehicle on the player's own units) counts as `damageTaken[owner]` ONLY and is
   * NOT `damageDealt` of the opponent. A Deadly Demise explosion (engine.ts `deadlyDemise`: it hits units of
   * EITHER side within 6") is credited as `damageDealt` to the OWNER OF THE EXPLODING VEHICLE for every victim
   * on the other side; so an exploding enemy vehicle hurting human units is `damageTaken[human]` AND
   * `damageDealt[enemy]`, but it is non-attack damage (below).
   * Consequence, per round and per player p with o = the opponent:
   *   damageDealt[p] + ownSource[o] == damageTaken[o],   ownSource[o] = wounds o's models lost to o's OWN sources;
   * i.e. `dealt[p] == taken[o]` holds exactly when o suffered no own-source damage that round, and only
   * OPPONENT-caused damage obeys it. (The report does not carry `ownSource`; fixtures.test.ts keeps it
   * per fixture and tests the identity.)
   *
   * Two views:
   *  - `damageDealt` / `damageTaken`: the all-source accounting above. They equal the human's timeline sums.
   *  - `attackDealt` / `attackTaken`: wounds from ATTACKS only, i.e. shoot + fight attack groups
   *    resolved via `resolveGroup` — the ONE shared event set for every luck term. NON-ATTACK DAMAGE
   *    (Hazardous, Desperate Escape, Deadly Demise — whichever side's vehicle explodes) is excluded from
   *    `attack*`, from `expectedDealt` / `expectedTaken` and from `luckIndex`; it is reported
   *    separately (`shoot.hazardLoss`). Always `attackDealt <= damageDealt`, `attackTaken <= damageTaken`.
   *    `luck.summary` / `good.efficiency` use the `attack*Wounds` metric keys for exactly these.
   *
   * IMPLEMENTATION NOTE (review H1): `ai.ts` `expectedGroupDamage` is NOT this definition. It uses the profile's
   * maximum W averaged over models, the save of `alive(target)[0]` only, `min(E[D], W)` instead of `E[min(D, W)]`,
   * and no cap by the target unit's remaining wounds. The coach MUST use its own expectation (a damage
   * DISTRIBUTION, needed anyway for `luck.swing` tail probabilities) and leave the AI's function untouched. Until
   * that exists, every finding built on expected damage is at most `estimate`, never `exact`.
   *
   * EXPECTED DAMAGE of one attack = sum over its unsaved wounds of min(D, remaining wounds of the
   * model the wound is allocated to), additionally capped by the target unit's remaining wounds
   * — the same as the engine, where excess damage is lost. So expected and actual use the same
   * definition of "wounds removed".
   */
  totals: {
    /** Wounds removed from the opponent's models by the human, all sources (actual); see DAMAGE ACCOUNTING. */
    damageDealt: number
    /** Wounds the human's models lost, all sources (actual, incl. the human's own Hazardous / Desperate Escape and any Deadly Demise). */
    damageTaken: number
    /** Wounds removed by the human's ATTACKS only (actual). */
    attackDealt: number
    /** Wounds removed from the human's models by the AI's ATTACKS only (actual). */
    attackTaken: number
    /** Expected wounds the human's attacks should have removed, given the dice-free probabilities of each attack as actually made. */
    expectedDealt: number
    /** Expected wounds the AI's attacks should have removed from the human's models. */
    expectedTaken: number
    /**
     * Signed, normalised dice luck of the human, in -1..+1 (positive = dice favoured the human):
     *   luckIndex = clamp( ((attackDealt - expectedDealt) - (attackTaken - expectedTaken))
     *                      / max(expectedDealt + expectedTaken, LUCK.MIN_NORMALISER), -1, +1 )
     * Always computed with this formula, also for `lowData` games (that note only suppresses luck
     * findings). i.e. the luck surplus on offence minus the luck surplus the opponent enjoyed,
     * relative to the total expected damage in the game. 0 = average luck. The formula is a
     * convention for display, not a statistical test; `luck.swing` uses exact one-sided tail
     * probabilities instead.
     */
    luckIndex: number
  }
  /** Top negative findings the human can act on (cap 5, <= 2 per kind). */
  mistakes: Finding[]
  /** Top missed opportunities (cap 3). */
  missed: Finding[]
  /**
   * Dice-luck explanations: `luck.summary` FIRST (reserved slot, not counted), then up to `REPORT.MAX_LUCK`
   * (3) of class `luck` / `explain` in rank order. Not globally rank-sorted.
   */
  luck: Finding[]
  /** Remaining shooting-topic findings (see FINDING_TOPIC), incl. mistakes/missed/positives that overflowed. */
  shooting: Finding[]
  /** Remaining movement/charge/melee/objective-topic findings (see FINDING_TOPIC), incl. overflow. */
  movement: Finding[]
  /** What the human did well (2–3). */
  positives: Finding[]
  /** Up to 3 focus items for the next battle: the PLAN RULE (selection order, not re-sorted). */
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
 * Date/Math.random/performance.now, no mutation of frames). WORK BUDGETS ARE COUNT-BASED (`config.BUDGET`:
 * alternatives per frame, move candidates): a wall-clock cutoff is FORBIDDEN because it makes the output depend on
 * the machine. Returns raw findings for the human only, ALWAYS
 * emitted (even in a lowData game); every finding fills `impact`. Capping, ranking, supersession
 * and lowData suppression are the ranker's job.
 */
export type Analyzer = (frames: Frame[], ctx: AnalyzerContext) => Finding[]

/**
 * The ranker: all raw findings of all analyzers + the stats -> everything of the report except `battle`
 * (the caller fills `battle` from the record and the final state). Applies SUPERSEDES, lowData suppression,
 * the PLACEMENT RULE, the PLAN RULE and the `notes`. Pure and deterministic. `config` overrides
 * `ctx.config` when given (same thresholds, tests only).
 *
 * PRODUCERS of the two battle-wide findings (not the ranker's job to create them): `result.summary` is
 * produced by the metrics/stats analyzer (task A1) from the StatsResult totals; `luck.summary` by the
 * luck analyzer (task A2). Both are battle-wide: `frameIndex` null, `unitIds` empty, and
 * `round` / `phase` = `round` / `phase` of `frames[frames.length - 1].after` (the last frame's AFTER state).
 * The ranker moves `result.summary` into `headline` and `luck.summary` into the reserved `luck` slot.
 */
export type RankFn = (
  findings: Finding[],
  stats: StatsResult,
  ctx: AnalyzerContext,
  config?: CoachConfig,
) => Omit<CoachReport, 'battle'>
