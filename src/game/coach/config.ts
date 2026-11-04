// Coach thresholds. One exported object per analyzer so parallel authors edit distinct lines.
//
// ALL VALUES ARE UNCALIBRATED PLACEHOLDERS until task AI4 (tune against AI-vs-AI games).
// Conventions: "wounds" = expected or actual damage in wounds, "p" = probability 0..1,
// "ratio" = plain multiplier (1.5 = 1.5x).

/** Dice-luck analyzer (+ the luckIndex in CoachReport.totals). */
export const LUCK = {
  /** Fewer human attack dice than this in the whole battle => no luck findings (`lowData`). */
  MIN_ATTACKS_FOR_LUCK: 12,
  /** A single roll sequence is a `luck.swing` only when its probability is below this (p). */
  SWING_MAX_P: 0.1,
  /** ...and its actual-vs-expected gap is at least this many wounds. */
  SWING_MIN_WOUNDS: 1.5,
  /** Floor of the luckIndex denominator (wounds); avoids huge indices in tiny games. */
  MIN_NORMALISER: 3,
  /** |luckIndex| below this => summary says "average luck". */
  AVERAGE_BAND: 0.15,
  /** |luckIndex| at/above this => luck.summary severity 'minor' instead of 'info'. */
  NOTABLE_BAND: 0.4,
}

/** Shooting analyzer. */
export const SHOOT = {
  /** shoot.targetChoice: best alternative must have >= this ratio of expected wounds vs the chosen target... */
  TARGET_MIN_RATIO: 1.5,
  /** ...AND be at least this many expected wounds better in absolute terms (both must hold). */
  TARGET_MIN_ABS_WOUNDS: 1.0,
  /** shoot.profileChoice: ratio of best profile vs chosen profile. */
  PROFILE_MIN_RATIO: 1.25,
  /** shoot.profileChoice: absolute expected wounds gained. */
  PROFILE_MIN_ABS_WOUNDS: 0.75,
  /** shoot.overkill: wasted share of the attack's expected damage (0..1)... */
  OVERKILL_MIN_WASTED_SHARE: 0.5,
  /** ...and wasted expected wounds at least this. */
  OVERKILL_MIN_WASTED_WOUNDS: 1.0,
  /** shoot.advanceCost: expected wounds lost by advancing (Assault-only) vs a normal move. */
  ADVANCE_COST_MIN_WOUNDS: 1.0,
  /** shoot.coverIgnored: expected wounds saved by picking the equally valuable uncovered target / uncovered position. */
  COVER_IGNORED_MIN_WOUNDS: 0.75,
  /** shoot.hazardLoss: expected self-damage must exceed expected benefit by this many wounds. */
  HAZARD_MIN_NET_LOSS_WOUNDS: 0.5,
  /** Severity bands for shooting findings, by wounds of expected difference. */
  MINOR_WOUNDS: 1,
  MAJOR_WOUNDS: 3,
  CRITICAL_WOUNDS: 6,
}

/** Movement / positioning analyzer. */
export const MOVE = {
  /** move.exposed: expected wounds the enemy's next turn deals to the unit at its end position (estimate; enemy movement ignored). */
  EXPOSED_MIN_EXPECTED_WOUNDS: 3,
  /** move.noCover: expected wounds saved if a reachable covered spot had been used. */
  NO_COVER_MIN_SAVED_WOUNDS: 1.0,
  /** move.objectiveNeglect: consecutive own turns with an objective neither held nor contested while reachable. */
  OBJECTIVE_NEGLECT_MIN_TURNS: 2,
  /** move.blastSpread: extra expected wounds taken from Blast because of unit spread. */
  BLAST_MIN_EXTRA_WOUNDS: 0.5,
  /** move.chargeExposure: enemy charge success probability (p) at the end position... */
  CHARGE_EXPOSURE_MIN_P: 0.4,
  /** ...and expected melee wounds suffered in that matchup. */
  CHARGE_EXPOSURE_MIN_WOUNDS: 2,
  /** move.fallBackDecision / move.advanceDecision: net expected wounds difference vs the alternative. */
  DECISION_MIN_NET_WOUNDS: 1.0,
  MINOR_WOUNDS: 1,
  MAJOR_WOUNDS: 3,
  CRITICAL_WOUNDS: 6,
}

/** Charge / melee analyzer. */
export const CHARGE = {
  /** charge.badOdds: declared charge with success probability below this (p). */
  BAD_ODDS_MAX_P: 0.15,
  /** charge.forgone (heuristic, severity 'info'): an available charge with success probability at least this (p) was not declared. */
  FORGONE_MIN_P: 0.5,
  /** charge.forgone: expected melee wounds of the charge must be at least this to be worth mentioning. */
  FORGONE_MIN_EXPECTED_WOUNDS: 1.5,
  /** charge.failedByLuck: a failed charge whose success probability was at least this (p). */
  FAILED_BY_LUCK_MIN_P: 0.5,
  /** fight.targetChoice: same two-part test as SHOOT.TARGET_*. */
  FIGHT_TARGET_MIN_RATIO: 1.5,
  FIGHT_TARGET_MIN_ABS_WOUNDS: 1.0,
}

/** Missed-opportunity analyzer. */
export const MISSED = {
  /** missed.shot: a legal shot with at least this many expected wounds was available and the unit did not shoot. */
  SHOT_MIN_EXPECTED_WOUNDS: 1.5,
  /** missed.charge: idle unit with a charge of probability >= this (p)... */
  CHARGE_MIN_P: 0.4,
  /** ...and expected melee wounds >= this. */
  CHARGE_MIN_EXPECTED_WOUNDS: 2,
  /** missed.waaagh: Orks never called WAAAGH! although the battle reached at least this round. */
  WAAAGH_MIN_ROUND: 3,
  /** missed.ammoRunts: unused Ammo Runts would have added at least this many expected wounds in some shot. */
  AMMO_RUNTS_MIN_GAIN_WOUNDS: 0.5,
  /** missed.objective: VP forgone by not taking a free objective (5 VP/objective-turn in the current scenarios). */
  OBJECTIVE_MIN_VP: 5,
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
  /** lowData note when the recorded rounds are fewer than this... */
  LOW_DATA_MAX_ROUNDS: 1,
  /** ...or the human made fewer attack actions (shoot + fight) than this. */
  LOW_DATA_MIN_ATTACK_ACTIONS: 3,
}

/** All sections; passed to analyzers as `AnalyzerContext.config` (tests can override a section). */
export const CONFIG = { LUCK, SHOOT, MOVE, CHARGE, MISSED, REPORT }

export type CoachConfig = typeof CONFIG
