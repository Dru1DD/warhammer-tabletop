import { other, SCHEMA_VERSION, sidesOf } from './gameState'
import { createMatch, soloAssignments } from './match/match'
import type { MatchMeta, MatchState } from './match/types'
import type { GameState, PlayerId } from './types'
import { FACTIONS, PHASES } from './types'
import { tr } from '../i18n/index'

export const SAVE_KEY = 'wh40k-training-save'

/**
 * Save FORMAT version (envelope layout), independent of `schemaVersion` (GameState shape).
 *  - absent / 1: `{schemaVersion, savedAt, human, state}` (no match block)
 *  - 2: adds `match`: assignments, version, sequence counters, replay base and action history.
 *    `state` stays at the top level and is NOT duplicated inside `match`.
 */
export const SAVE_FORMAT = 2

export interface SaveFile {
  schemaVersion: number
  format?: number
  savedAt: string
  /** which faction the human played */
  human?: PlayerId
  state: GameState
  match?: MatchMeta
}

/** A file after migration: the match block is always present. */
export type LoadedSave = SaveFile & { match: MatchMeta }

export function serialize(state: GameState, human?: PlayerId, now = new Date(), match?: MatchState): string {
  const file: SaveFile = { schemaVersion: SCHEMA_VERSION, format: SAVE_FORMAT, savedAt: now.toISOString(), human, state }
  if (match) {
    const { gameId, mode, assignments, version, lastSequence, initial, history } = match
    file.match = { gameId, mode, assignments, version, lastSequence, initial, history }
  }
  return JSON.stringify(file)
}

/**
 * Autosave/save with the full match. Autosave runs on every command and shares the browser quota with
 * other data, so on failure retry without history and replay base rather than lose the save.
 */
export function saveMatch(key: string, match: MatchState, human: PlayerId): boolean {
  return saveToStorage(key, serialize(match.state, human, new Date(), match)) || saveToStorage(key, serialize(match.state, human))
}

export type LoadResult = { ok: true; file: LoadedSave } | { ok: false; reason: string }

/** Exactly two distinct known factions (default Marines/Orks when `sides` is absent), each with a player record. */
function validSides(s: GameState): boolean {
  if (s.sides !== undefined && !(Array.isArray(s.sides) && s.sides.length === 2 && s.sides[0] !== s.sides[1] && s.sides.every((f) => FACTIONS.includes(f)))) return false
  return sidesOf(s).every((f) => typeof s.players?.[f] === 'object' && s.players[f] !== null) && Object.keys(s.players).length === 2
}

const validState = (s: GameState | undefined) =>
  !!s &&
  Array.isArray(s.units) &&
  s.units.every((u) => Array.isArray(u.models) && u.models.every((m) => Number.isFinite(m.pos?.x) && Number.isFinite(m.pos?.y))) &&
  PHASES.includes(s.phase) &&
  validSides(s) &&
  Number.isFinite(s.board?.width) && Number.isFinite(s.round) && Number.isFinite(s.rng)

const isCtrl = (c: unknown) => {
  const x = c as { type?: unknown; playerId?: unknown } | null
  return !!x && ['local', 'ai', 'remote'].includes(x.type as string) && typeof x.playerId === 'string' && x.playerId.length > 0
}

/** Structural check of a stored match block; anything doubtful means "ignore the block, rebuild from state". */
function validMatch(m: Partial<MatchMeta> | undefined): m is MatchMeta {
  return (
    !!m &&
    typeof m.gameId === 'string' && m.gameId.length > 0 &&
    (m.mode === 'training' || m.mode === 'shared') &&
    !!m.initial && sidesOf(m.initial).every((f) => isCtrl(m.assignments?.[f])) &&
    Number.isSafeInteger(m.version) && (m.version as number) >= 0 &&
    typeof m.lastSequence === 'object' && m.lastSequence !== null &&
    Object.values(m.lastSequence).every((n) => Number.isSafeInteger(n) && n >= 1) &&
    Array.isArray(m.history) && m.history.length === m.version &&
    m.history.every((a) => typeof a === 'object' && a !== null && typeof a.actionId === 'string' && Number.isSafeInteger(a.sequence)) &&
    validState(m.initial)
  )
}

/** Format 1 (or a damaged/absent block): the loaded state becomes the replay base of a fresh match. Deterministic. */
function migrateMatch(state: GameState, saved?: PlayerId): MatchMeta {
  const sides = sidesOf(state)
  const human = saved && sides.includes(saved) ? saved : sides[0]
  const { gameId, mode, assignments, version, lastSequence, initial, history } = createMatch(state, soloAssignments(human, other(state, human)), {
    gameId: `legacy-${state.scenarioId}-${(state.rng >>> 0).toString(36)}`,
  })
  return { gameId, mode, assignments, version, lastSequence, initial, history }
}

/** Parse and sanity-check a save; never throws. */
export function deserialize(raw: string | null): LoadResult {
  if (!raw) return { ok: false, reason: tr('Save not found.') }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, reason: tr('The save file is damaged (invalid JSON).') }
  }
  const f = data as Partial<SaveFile>
  if (typeof f !== 'object' || f === null || typeof f.schemaVersion !== 'number')
    return { ok: false, reason: tr('Unknown save format.') }
  if (f.schemaVersion !== SCHEMA_VERSION)
    return { ok: false, reason: tr('The save is from a different version (schema {schemaVersion}, needs {SCHEMA_VERSION}). Start a new battle.', { schemaVersion: f.schemaVersion, SCHEMA_VERSION }) }
  if (typeof f.format === 'number' && f.format > SAVE_FORMAT)
    return { ok: false, reason: tr('The save was created by a newer version of the game (format {format}, supported {SAVE_FORMAT}).', { format: f.format, SAVE_FORMAT }) }
  if (!validState(f.state)) return { ok: false, reason: tr('The save is damaged: game state data is missing.') }
  const state = f.state as GameState
  const match = f.format === SAVE_FORMAT && validMatch(f.match) ? f.match : migrateMatch(state, f.human)
  return { ok: true, file: { ...(f as SaveFile), format: SAVE_FORMAT, match } }
}

export function saveToStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
