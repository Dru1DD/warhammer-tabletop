// Wire protocol. Messages are JSON strings; everything received is untrusted and goes through `parseMessage`.
// Pure data: no PeerJS, no React.

import { parseArmyList, type ArmyList } from '../game/army/armyList'
import type { ActionRecord, CommandEnvelope, RejectCode } from '../game/match/types'
import { FACTIONS, type PlayerId } from '../game/types'

export const PROTOCOL_VERSION = 1

/** Fixed participant ids: the identity of a participant is bound to a connection (+ secret token), never to a PeerJS id. */
export const HOST_ID = 'host'
export const GUEST_ID = 'guest'

/** Host-controlled match configuration. */
export interface LobbyState {
  scenarioId: string
  hostSide: PlayerId
  guestSide: PlayerId
  guestConnected: boolean
  guestReady: boolean
  /** each player's own army list (from their army builder); null or absent = the scenario's training roster */
  hostArmy?: ArmyList | null
  guestArmy?: ArmyList | null
}

export type JoinRefusal = 'room-full' | 'game-started' | 'bad-token' | 'version'

export type NetMessage =
  // guest -> host
  | { type: 'hello'; v: number; token?: string }
  | { type: 'prefs'; side?: PlayerId; ready?: boolean; army?: ArmyList | null }
  | { type: 'command'; envelope: CommandEnvelope }
  | { type: 'syncRequest'; haveVersion: number }
  | { type: 'ping'; n: number }
  // host -> guest
  | { type: 'welcome'; token: string; playerId: string; lobby: LobbyState; playing: boolean }
  | { type: 'refused'; reason: JoinRefusal }
  | { type: 'lobby'; lobby: LobbyState }
  | { type: 'start'; save: string }
  | { type: 'accepted'; action: ActionRecord }
  | { type: 'rejected'; commandId: string; code: RejectCode; reason: string }
  | { type: 'snapshot'; save: string; why: string }
  | { type: 'pong'; n: number }
  // both
  | { type: 'bye' }

/** Guest -> host messages are tiny; only snapshots (host -> guest) are big. */
export const MAX_FROM_GUEST = 16_000
export const MAX_FROM_HOST = 4_000_000

export const encode = (m: NetMessage): string => JSON.stringify(m)

const REJECT_CODES: readonly string[] = ['malformed', 'wrong-game', 'duplicate', 'bad-sequence', 'stale-state', 'unauthorized', 'illegal']
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown, max = 256): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
const isInt = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min
const isSide = (v: unknown): v is PlayerId => FACTIONS.includes(v as PlayerId)

function lobbyOf(v: unknown): LobbyState | null {
  if (!isObj(v)) return null
  const { scenarioId, hostSide, guestSide, guestConnected, guestReady } = v
  if (!isStr(scenarioId, 64) || !isSide(hostSide) || !isSide(guestSide)) return null
  if (typeof guestConnected !== 'boolean' || typeof guestReady !== 'boolean') return null
  const army = (a: unknown) => (a == null ? null : parseArmyList(a))
  return { scenarioId, hostSide, guestSide, guestConnected, guestReady, hostArmy: army(v.hostArmy), guestArmy: army(v.guestArmy) }
}

function envelopeOf(v: unknown): CommandEnvelope | null {
  // deep command validation is `submit`'s job; here only the transport-level shape and size
  if (!isObj(v) || !isStr(v.gameId, 128) || !isStr(v.playerId, 128) || !isStr(v.commandId, 128)) return null
  if (!isInt(v.sequence, 1) || !isInt(v.expectedStateVersion) || !isObj(v.command) || typeof v.command.type !== 'string') return null
  return v as unknown as CommandEnvelope
}

function actionOf(v: unknown): ActionRecord | null {
  if (!isObj(v) || !isStr(v.actionId, 128) || !isStr(v.gameId, 128) || !isStr(v.playerId, 128)) return null
  if (!isInt(v.sequence, 1) || !isInt(v.stateVersion, 1) || !isObj(v.command) || !isObj(v.turn) || !isSide(v.side)) return null
  if (v.dice !== undefined && !(isObj(v.dice) && Array.isArray(v.dice.rolls) && isInt(v.dice.rngAfter, 0))) return null
  return v as unknown as ActionRecord
}

/**
 * Parse an incoming string. Returns null for anything oversized, non-JSON, unknown or malformed.
 * `fromGuest` selects the size limit and the allowed message set (a guest may not send host messages).
 */
export function parseMessage(raw: unknown, fromGuest: boolean): NetMessage | null {
  if (typeof raw !== 'string' || raw.length > (fromGuest ? MAX_FROM_GUEST : MAX_FROM_HOST)) return null
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(m) || typeof m.type !== 'string') return null
  switch (m.type) {
    case 'bye': return { type: 'bye' }
    case 'hello':
      if (!fromGuest || !isInt(m.v) || (m.token !== undefined && !isStr(m.token, 128))) return null
      return { type: 'hello', v: m.v, ...(m.token !== undefined ? { token: m.token as string } : {}) }
    case 'prefs': {
      if (!fromGuest || (m.side !== undefined && !isSide(m.side)) || (m.ready !== undefined && typeof m.ready !== 'boolean')) return null
      // an army list: null = the training roster; a malformed one makes the whole message invalid
      const army = m.army === undefined || m.army === null ? m.army : parseArmyList(m.army)
      if (army === null && m.army !== null && m.army !== undefined) return null
      return { type: 'prefs', side: m.side as PlayerId | undefined, ready: m.ready as boolean | undefined, ...(army !== undefined ? { army } : {}) }
    }
    case 'command': {
      const envelope = fromGuest ? envelopeOf(m.envelope) : null
      return envelope && { type: 'command', envelope }
    }
    case 'syncRequest':
      return fromGuest && isInt(m.haveVersion) ? { type: 'syncRequest', haveVersion: m.haveVersion } : null
    case 'ping':
      return fromGuest && isInt(m.n) ? { type: 'ping', n: m.n } : null
    case 'pong':
      return !fromGuest && isInt(m.n) ? { type: 'pong', n: m.n } : null
    case 'welcome': {
      const lobby = lobbyOf(m.lobby)
      if (fromGuest || !lobby || !isStr(m.token, 128) || !isStr(m.playerId, 128) || typeof m.playing !== 'boolean') return null
      return { type: 'welcome', token: m.token, playerId: m.playerId, lobby, playing: m.playing }
    }
    case 'refused':
      return !fromGuest && ['room-full', 'game-started', 'bad-token', 'version'].includes(m.reason as string) ? { type: 'refused', reason: m.reason as JoinRefusal } : null
    case 'lobby': {
      const lobby = lobbyOf(m.lobby)
      return !fromGuest && lobby ? { type: 'lobby', lobby } : null
    }
    case 'start':
    case 'snapshot':
      if (fromGuest || typeof m.save !== 'string') return null
      return m.type === 'start' ? { type: 'start', save: m.save } : { type: 'snapshot', save: m.save, why: typeof m.why === 'string' ? m.why.slice(0, 200) : '' }
    case 'accepted': {
      const action = fromGuest ? null : actionOf(m.action)
      return action && { type: 'accepted', action }
    }
    case 'rejected':
      if (fromGuest || !isStr(m.commandId, 128) || !REJECT_CODES.includes(m.code as string) || typeof m.reason !== 'string') return null
      return { type: 'rejected', commandId: m.commandId, code: m.code as RejectCode, reason: m.reason.slice(0, 300) }
    default:
      return null
  }
}
