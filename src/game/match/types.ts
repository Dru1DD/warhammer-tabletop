// Match layer contract: who plays which side, how commands travel, what an accepted action looks like.
// Pure data only (JSON-serialisable). No React, no Zustand, no networking.

import type { Command, GameState, Phase, PlayerId } from '../types'

/** `PlayerId` ('marines' | 'orks') is the SIDE (faction seat) on the table. */
export type SideId = PlayerId

export type PlayerControllerType = 'local' | 'ai' | 'remote'

/**
 * Who controls a side. `playerId` is the participant identity (opaque string: 'local', 'ai-orks',
 * a future peer id). The engine and `submit` only look at `playerId`, never at `type`:
 * type decides who PRODUCES commands (UI, AI, network), not how they are judged.
 */
export interface PlayerController {
  type: PlayerControllerType
  playerId: string
}

export type PlayerAssignments = Record<SideId, PlayerController>

/**
 * `training`: single-player; local undo allowed.
 * `shared`: accepted actions are immutable (future multiplayer); undo is refused by the pure layer.
 */
export type MatchMode = 'training' | 'shared'

export interface CommandEnvelope {
  gameId: string
  /** participant id of the sender (must control the side that owns the current decision) */
  playerId: string
  /** per-sender counter, starts at 1, +1 for every ACCEPTED command of that sender */
  sequence: number
  /** `MatchState.version` the sender based the command on */
  expectedStateVersion: number
  /** unique per command; deterministic `playerId#sequence` for local and AI producers */
  commandId: string
  command: Command
}

/** One accepted action. No timestamps, no state copies: replay it from `MatchState.initial`. */
export interface ActionRecord {
  /** == commandId of the envelope */
  actionId: string
  gameId: string
  /** per-sender sequence from the envelope */
  sequence: number
  /** state version AFTER this action (monotonic, +1 per accepted action) */
  stateVersion: number
  /** position of the game when the command was issued */
  turn: { round: number; activePlayer: SideId; phase: Phase }
  playerId: string
  /** side that made the decision (`actor(state)` before the action) */
  side: SideId
  command: Command
  /** present only when dice were rolled: raw d6 values in order + resulting RNG state (desync check) */
  dice?: { rolls: number[]; rngAfter: number }
}

/** Everything but `state`: this is what a save file stores next to the state. */
export interface MatchMeta {
  gameId: string
  mode: MatchMode
  assignments: PlayerAssignments
  /** number of accepted actions so far */
  version: number
  /** last accepted `sequence` per participant */
  lastSequence: Record<string, number>
  /** state at version 0, the replay base */
  initial: GameState
  history: readonly ActionRecord[]
}

export interface MatchState extends MatchMeta {
  /** current state (published to the UI, never mutated: `submit` returns a new one) */
  state: GameState
}

export type RejectCode =
  | 'malformed'
  | 'wrong-game'
  | 'duplicate'
  | 'bad-sequence'
  | 'stale-state'
  | 'unauthorized'
  | 'illegal'

export type SubmitResult =
  | { ok: true; match: MatchState; action: ActionRecord }
  | { ok: false; code: RejectCode; reason: string }

export type ReplayResult = { ok: true; match: MatchState } | { ok: false; atIndex: number; reason: string }
