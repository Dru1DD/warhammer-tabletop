// Match layer: ONE pipeline for every command, whatever produced it (UI click, AI, future network).
//   producer -> CommandEnvelope -> submit() -> [shape, game, duplicate, sequence, version, authorization,
//   engine.validate, engine.apply] -> new MatchState + ActionRecord -> published by the caller.
// Pure functions: no React, no Zustand, no clock, no random. A rejection never touches the match.

import { decide, type AiDecision, type AiLevel } from '../ai/ai'
import { seededRoller, type Roller } from '../dice/dice'
import { actor, apply, validate } from '../engine'
import { seats } from '../gameState'
import type { Command, GameState } from '../types'
import type {
  ActionRecord, CommandEnvelope, MatchMeta, MatchMode, MatchState, PlayerAssignments, PlayerController,
  RejectCode, ReplayResult, SideId, SubmitResult,
} from './types'
import { tr } from '../../i18n/index'

export const LOCAL_PLAYER_ID = 'local'

/** Single-player setup: the human side is a local player, the opponent (default: the classic Marines/Orks pair) is the computer. */
export function soloAssignments(human: SideId, opponent: SideId = human === 'marines' ? 'orks' : 'marines'): PlayerAssignments {
  return seats(human, { type: 'local', playerId: LOCAL_PLAYER_ID }, opponent, { type: 'ai', playerId: `ai-${opponent}` })
}

export function createMatch(
  state: GameState,
  assignments: PlayerAssignments,
  opts: { gameId: string; mode?: MatchMode },
): MatchState {
  return { gameId: opts.gameId, mode: opts.mode ?? 'training', assignments, version: 0, lastSequence: {}, initial: state, history: [], state }
}

/** Who owns the current decision (the side that must act, see `actor`). */
export const decidingSide = (m: MatchState): SideId => actor(m.state)

export const controllerOf = (m: MatchState): PlayerController => m.assignments[decidingSide(m)]

export const localPlayerOf = (m: MatchState): PlayerController | undefined =>
  Object.values(m.assignments).find((c) => c.type === 'local')

const lastSeq = (m: MatchMeta, playerId: string) => (Object.hasOwn(m.lastSequence, playerId) ? m.lastSequence[playerId] : 0)

/** Envelope for the next command of `playerId`; used by local UI and AI producers alike. */
export function nextEnvelope(m: MatchState, playerId: string, command: Command): CommandEnvelope {
  const sequence = lastSeq(m, playerId) + 1
  return { gameId: m.gameId, playerId, sequence, expectedStateVersion: m.version, commandId: `${playerId}#${sequence}`, command }
}

/** The envelope an accepted action came from: lets peers re-apply accepted actions through `submit`. */
export const envelopeOf = (a: ActionRecord): CommandEnvelope => ({
  gameId: a.gameId, playerId: a.playerId, sequence: a.sequence, expectedStateVersion: a.stateVersion - 1, commandId: a.actionId, command: a.command,
})

const reject = (code: RejectCode, reason: string): SubmitResult => ({ ok: false, code, reason })

const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128

/** Envelopes may come from the network: never trust the shape. */
function shapeProblem(env: unknown): string | null {
  const e = env as Partial<CommandEnvelope> | null
  if (typeof e !== 'object' || e === null) return tr('The command is not an object.')
  if (!isText(e.gameId) || !isText(e.playerId) || !isText(e.commandId)) return tr('Invalid command identifiers.')
  if (!isInt(e.sequence, 1) || !isInt(e.expectedStateVersion, 0)) return tr('Invalid command number or state version.')
  const c = e.command as Partial<Command> | null | undefined
  if (typeof c !== 'object' || c === null || typeof c.type !== 'string') return tr('Invalid command content.')
  return null
}

/** d6 values are recorded on the way through; `state()` passes straight to the inner roller. */
function recordingRoller(inner: Roller) {
  const rolls: number[] = []
  const roller: Roller = { d6: () => { const v = inner.d6(); rolls.push(v); return v }, state: () => inner.state() }
  return { roller, rolls }
}

export function submit(m: MatchState, env: CommandEnvelope): SubmitResult {
  const bad = shapeProblem(env)
  if (bad) return reject('malformed', bad)
  if (env.gameId !== m.gameId) return reject('wrong-game', tr('The command belongs to another game.'))
  if (m.history.some((a) => a.actionId === env.commandId)) return reject('duplicate', tr('This command has already been accepted.'))
  const last = lastSeq(m, env.playerId)
  if (env.sequence <= last) return reject('duplicate', tr('Command number {sequence} has already been used (the last accepted — {last}).', { sequence: env.sequence, last }))
  if (env.sequence > last + 1) return reject('bad-sequence', tr('Command order broken: expected number {value}, got {sequence}.', { value: last + 1, sequence: env.sequence }))
  if (env.expectedStateVersion !== m.version)
    return reject('stale-state', tr('The command is based on state version {expectedStateVersion}, the current one is {version}.', { expectedStateVersion: env.expectedStateVersion, version: m.version }))

  const side = decidingSide(m)
  if (m.assignments[side].playerId !== env.playerId) return reject('unauthorized', tr('Another player is making the decision now (side “{side}”).', { side }))

  // Commands may be hostile (e.g. `move` without `positions`): validate/apply can throw -> rejection, never a crash.
  let next: GameState
  const dice = recordingRoller(seededRoller(m.state.rng))
  try {
    const v = validate(m.state, env.command)
    if (!v.ok) return reject('illegal', v.reason)
    next = apply(m.state, env.command, dice.roller)
  } catch {
    return reject('illegal', tr('The command is damaged or invalid.'))
  }

  const action: ActionRecord = {
    actionId: env.commandId,
    gameId: m.gameId,
    sequence: env.sequence,
    stateVersion: m.version + 1,
    turn: { round: m.state.round, activePlayer: m.state.activePlayer, phase: m.state.phase },
    playerId: env.playerId,
    side,
    command: structuredClone(env.command),
    ...(dice.rolls.length ? { dice: { rolls: dice.rolls, rngAfter: next.rng } } : {}),
  }
  const match: MatchState = {
    ...m,
    state: next,
    version: action.stateVersion,
    lastSequence: { ...m.lastSequence, [env.playerId]: env.sequence },
    history: [...m.history, action],
  }
  return { ok: true, match, action }
}

/**
 * Rebuild a match from its replay base and accepted actions, through the same `submit` pipeline.
 * Also checks dice values and versions recorded in the actions. Never throws.
 */
export function replay(base: Pick<MatchMeta, 'gameId' | 'mode' | 'assignments' | 'initial'>, actions: readonly ActionRecord[]): ReplayResult {
  let m = createMatch(base.initial, base.assignments, { gameId: base.gameId, mode: base.mode })
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    const r = submit(m, envelopeOf(a))
    if (!r.ok) return { ok: false, atIndex: i, reason: `${r.code}: ${r.reason}` }
    if (r.action.stateVersion !== a.stateVersion || JSON.stringify(r.action.dice) !== JSON.stringify(a.dice))
      return { ok: false, atIndex: i, reason: tr('desync: the dice or version did not match the record.') }
    m = r.match
  }
  return { ok: true, match: m }
}

// ---------------------------------------------------------------- undo policy

/**
 * Should the action just accepted be offered for local undo? Only in training mode, only for
 * dice-free actions that leave the decision with the local player, never for `endPhase`.
 */
export function isLocallyUndoable(action: ActionRecord, after: MatchState): boolean {
  const local = localPlayerOf(after)
  return after.mode === 'training' && !action.dice && action.command.type !== 'endPhase' && !!local && controllerOf(after).playerId === local.playerId
}

/** Local undo = restore an earlier snapshot of the WHOLE match (version, counters, history together). */
export function undoTo(current: MatchState, snapshot: MatchState): MatchState | null {
  return current.mode === 'training' && snapshot.mode === 'training' && snapshot.gameId === current.gameId ? snapshot : null
}

// ---------------------------------------------------------------- AI as a controller

/** The AI's next command, wrapped in its own envelope; null unless the deciding side is AI-controlled. */
export function aiProposal(m: MatchState, level: AiLevel): { envelope: CommandEnvelope; decision: AiDecision } | null {
  const c = controllerOf(m)
  if (c.type !== 'ai' || m.state.winner) return null
  const decision = decide(m.state, level)
  return decision && { envelope: nextEnvelope(m, c.playerId, decision.cmd), decision }
}
