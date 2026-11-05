// Coach thresholds. One exported object per analyzer so parallel authors edit distinct lines.
//
// ALL VALUES ARE UNCALIBRATED PLACEHOLDERS until task AI4 (tune against AI-vs-AI games).
// Conventions: "wounds" = expected or actual damage in wounds, "p" = probability 0..1,
// "ratio" = plain multiplier (1.5 = 1.5x), "VP" = victory points.
// BOUNDS: every MIN_* is INCLUSIVE (value >= MIN triggers). Every MAX_* is INCLUSIVE (value <= MAX
// triggers). Severity bands: see `Severity` in types.ts (lower edge inclusive: impact >= MINOR_WOUNDS
// is 'minor', >= MAJOR_WOUNDS 'major', >= CRITICAL_WOUNDS 'critical', below MINOR_WOUNDS 'info').

/** Dice-luck analyzer (+ the luckIndex in CoachReport.totals). Luck terms use ATTACK damage only (see CoachReport.totals). */
export const LUCK = {
  /**
   * luck.swing needs tailProbability <= this (p, inclusive). tailProbability is a ONE-SIDED TAIL
   * from the human's perspective: P(X <= actual) for bad luck, P(X >= actual) for good luck —
   * never the probability of the exact outcome.
   */
  SWING_MAX_P: 0.1,
  /** ...and |actual - expected| for that attack sequence >= this many wounds (inclusive). */
  SWING_MIN_WOUNDS: 1.5,
  /** Floor of the luckIndex denominator (wounds); avoids huge indices in tiny games. */
  MIN_NORMALISER: 3,
  /** |luckIndex| < this => summary says "average luck" (strictly below). */
  AVERAGE_BAND: 0.15,
  /** |luckIndex| >= this => luck.summary severity 'minor' instead of 'info' (inclusive). */
  NOTABLE_BAND: 0.4,
}

/** Shooting analyzer. */
export const SHOOT = {
  /** shoot.targetChoice: best alternative must have >= this ratio of expected wounds vs the chosen target... */
  TARGET_MIN_RATIO: 1.5,
  /** ...AND be at least this many expected wounds better in absolute terms (both must hold; inclusive). */
  TARGET_MIN_ABS_WOUNDS: 1.0,
  /** shoot.profileChoice: ratio of best profile vs chosen profile (>=). */
  PROFILE_MIN_RATIO: 1.25,
  /** shoot.profileChoice: absolute expected wounds gained (>=). */
  PROFILE_MIN_ABS_WOUNDS: 0.75,
  /** shoot.overkill: wasted share of the attack's expected damage (0..1, >=)... */
  OVERKILL_MIN_WASTED_SHARE: 0.5,
  /** ...and wasted expected wounds >= this. */
  OVERKILL_MIN_WASTED_WOUNDS: 1.0,
  /** shoot.advanceCost: expected wounds lost by advancing (Assault-only) vs a normal move (>=). */
  ADVANCE_COST_MIN_WOUNDS: 1.0,
  /** shoot.coverIgnored: expected wounds saved by picking the equally valuable uncovered target / uncovered position (>=). */
  COVER_IGNORED_MIN_WOUNDS: 0.75,
  /** shoot.hazardLoss: expected self-damage must exceed expected benefit by this many wounds (>=). */
  HAZARD_MIN_NET_LOSS_WOUNDS: 0.5,
  /** shoot.firingPosition: expected wounds lost to a lost Rapid Fire / Heavy bonus or lost line of sight caused by the move (>=). */
  FIRING_POSITION_MIN_WOUNDS: 0.75,
  /** Severity bands for shooting findings (impact in wounds, lower edge inclusive). */
  MINOR_WOUNDS: 1,
  MAJOR_WOUNDS: 3,
  CRITICAL_WOUNDS: 6,
}

/** Movement / positioning analyzer. */
export const MOVE = {
  /** move.exposed: expected wounds the enemy's next turn deals to the unit at its end position (>=; estimate; enemy movement ignored). */
  EXPOSED_MIN_EXPECTED_WOUNDS: 3,
  /** move.noCover: expected wounds saved if a reachable covered spot had been used (>=). */
  NO_COVER_MIN_SAVED_WOUNDS: 1.0,
  /** move.objectiveNeglect: consecutive own turns (>=) with an objective neither held nor contested while reachable. */
  OBJECTIVE_NEGLECT_MIN_TURNS: 2,
  /** move.chargeExposure: enemy charge success probability (p, >=) at the end position... */
  CHARGE_EXPOSURE_MIN_P: 0.4,
  /** ...and expected melee wounds suffered in that matchup (>=). */
  CHARGE_EXPOSURE_MIN_WOUNDS: 2,
  /** move.fallBackDecision / move.advanceDecision: net expected wounds difference vs the alternative (>=). */
  DECISION_MIN_NET_WOUNDS: 1.0,
  /** Severity bands for movement, loss and objective findings (impact in wounds, lower edge inclusive). */
  MINOR_WOUNDS: 1,
  MAJOR_WOUNDS: 3,
  CRITICAL_WOUNDS: 6,
}

/** Charge / melee analyzer. */
export const CHARGE = {
  /** charge.badOdds: declared charge with success probability <= this (p, inclusive). */
  BAD_ODDS_MAX_P: 0.15,
  /** charge.failedByLuck: a failed charge whose success probability was >= this (p, inclusive). */
  FAILED_BY_LUCK_MIN_P: 0.5,
  /** fight.targetChoice: same two-part test as SHOOT.TARGET_* (both inclusive). */
  FIGHT_TARGET_MIN_RATIO: 1.5,
  FIGHT_TARGET_MIN_ABS_WOUNDS: 1.0,
  /** Severity bands for charge.* and fight.* findings (impact in wounds, lower edge inclusive). */
  MINOR_WOUNDS: 1,
  MAJOR_WOUNDS: 3,
  CRITICAL_WOUNDS: 6,
}

/** Missed-opportunity analyzer. */
export const MISSED = {
  /** missed.shot: a legal shot with >= this many expected wounds was available and the unit did not shoot. */
  SHOT_MIN_EXPECTED_WOUNDS: 1.5,
  /** missed.charge (replaces charge.forgone; usually 'estimate'/'heuristic'): idle unit with a charge of probability >= this (p)... */
  CHARGE_MIN_P: 0.4,
  /** ...and expected melee wounds >= this. */
  CHARGE_MIN_EXPECTED_WOUNDS: 2,
  /** missed.waaagh: Orks never called WAAAGH! although the battle reached at least this round (>=). */
  WAAAGH_MIN_ROUND: 3,
  /** missed.ammoRunts: unused Ammo Runts would have added >= this many expected wounds in some shot. */
  AMMO_RUNTS_MIN_GAIN_WOUNDS: 0.5,
  /** missed.objective: VP forgone by not taking a free objective (>=; 5 VP per objective-turn in the current scenarios). */
  OBJECTIVE_MIN_VP: 5,
  /** Severity bands for missed.* findings (impact in wounds, lower edge inclusive). */
  MINOR_WOUNDS: 1,
  MAJOR_WOUNDS: 3,
  CRITICAL_WOUNDS: 6,
}

/** Objective analyzer (objective.swing, objective.battleShock). Severity bands: the MOVE ones. */
export const OBJECTIVE = {
  /** objective.swing: VP swing caused by the flip (>=). */
  SWING_MIN_VP: 5,
  /** objective.battleShock: VP lost because a Battle-shocked unit (OC 0) did not count (>=). */
  BATTLE_SHOCK_MIN_VP: 5,
}

/** Report assembly (ranker). */
export const REPORT = {
  MAX_MISTAKES: 5,
  MAX_MISSED: 3,
  MAX_LUCK: 3,
  MIN_POSITIVES: 2,
  MAX_POSITIVES: 3,
  MAX_PLAN: 3,
  /** Cap for each topical list (`shooting`, `movement`). */
  MAX_TOPICAL: 12,
  /** Same kind may appear at most this many times in `mistakes`, so one habit does not fill the list. */
  MAX_PER_KIND_IN_MISTAKES: 2,
  /**
   * Explicit, UNCALIBRATED conversion VP -> wounds-equivalent for `Finding.impact`:
   * impact = VP * VP_TO_WOUNDS. 1.2 makes one objective-turn (5 VP) = 6.0 = CRITICAL_WOUNDS.
   */
  VP_TO_WOUNDS: 1.2,
  /**
   * THE ONE lowData definition. The `lowData` note applies (RANKER suppresses LOW_DATA_SUPPRESSED_KINDS
   * and positives and adds the note; analyzers always emit) when ANY holds (all strictly below):
   *  rounds < LOW_DATA_MIN_ROUNDS, humanAttackActions < LOW_DATA_MIN_ATTACK_ACTIONS,
   *  humanAttackDice < LOW_DATA_MIN_ATTACK_DICE. The note carries { rounds, humanAttackActions, humanAttackDice }.
   */
  LOW_DATA_MIN_ROUNDS: 2,
  LOW_DATA_MIN_ATTACK_ACTIONS: 3,
  LOW_DATA_MIN_ATTACK_DICE: 12,
}

/** All sections; passed to analyzers as `AnalyzerContext.config` (tests can override a section). */
export const CONFIG = { LUCK, SHOOT, MOVE, CHARGE, MISSED, OBJECTIVE, REPORT }

export type CoachConfig = typeof CONFIG
