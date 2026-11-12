// State synchronisation helpers (pure). Full state travels in the existing save format
// (`serialize` / `deserialize`); single actions are re-applied through the same `submit` pipeline and checked.

import { seats } from '../game/gameState'
import { envelopeOf, submit } from '../game/match/match'
import type { ActionRecord, MatchState, PlayerAssignments, SideId } from '../game/match/types'
import type { PlayerId } from '../game/types'
import { deserialize, serialize } from '../game/persistence'
import { GUEST_ID, HOST_ID } from './protocol'
import { tr } from '../i18n/index'

/** Host view: the host's side is `local`, the guest's side `remote`. */
export const sharedAssignments = (hostSide: PlayerId, guestSide: PlayerId): PlayerAssignments =>
  seats(hostSide, { type: 'local', playerId: HOST_ID }, guestSide, { type: 'remote', playerId: GUEST_ID })

/** Same match seen by `myId`: that participant is `local`, the other one `remote`. */
export function viewAs(m: MatchState, myId: string): MatchState {
  const assignments = Object.fromEntries(
    Object.entries(m.assignments).map(([side, c]) => [side, { type: c.playerId === myId ? 'local' : 'remote', playerId: c.playerId }]),
  ) as MatchState['assignments']
  return { ...m, assignments }
}

export const sideOfParticipant = (m: Pick<MatchState, 'assignments'>, id: string): SideId | undefined =>
  (Object.keys(m.assignments) as SideId[]).find((s) => m.assignments[s].playerId === id)

/** Authoritative full snapshot as a save string (the guest's view of the assignments). */
export const snapshotOf = (m: MatchState, forId: string = GUEST_ID): string =>
  serialize(m.state, sideOfParticipant(m, forId), new Date(), viewAs(m, forId))

export type SnapshotResult = { ok: true; match: MatchState } | { ok: false; reason: string }

/** Parse a snapshot. Only a complete, consistent shared match is accepted (a damaged block would silently become a training match). */
export function matchFromSave(save: string, myId: string): SnapshotResult {
  const r = deserialize(save)
  if (!r.ok) return r
  const { match } = r.file
  if (match.mode !== 'shared') return { ok: false, reason: tr('The snapshot does not belong to a network game.') }
  if (!sideOfParticipant(match, HOST_ID) || !sideOfParticipant(match, GUEST_ID)) return { ok: false, reason: tr('The snapshot does not have both players.') }
  return { ok: true, match: viewAs({ ...match, state: r.file.state }, myId) }
}

export type ApplyResult =
  | { kind: 'ok'; match: MatchState; action: ActionRecord }
  | { kind: 'old' }
  | { kind: 'resync'; why: string }

/**
 * Guest side: re-apply an action the host accepted. The host's RNG state is part of the match, so the same dice come out;
 * they are compared with the host's record and any difference means "ask for a snapshot", never "keep my own result".
 */
export function applyAccepted(m: MatchState, a: ActionRecord): ApplyResult {
  if (a.gameId !== m.gameId) return { kind: 'resync', why: tr('another game') }
  if (a.stateVersion <= m.version) return { kind: 'old' }
  if (a.stateVersion !== m.version + 1) return { kind: 'resync', why: tr('an action was skipped') }
  const r = submit(m, envelopeOf(a))
  if (!r.ok) return { kind: 'resync', why: `${r.code}: ${r.reason}` }
  if (JSON.stringify(r.action.dice) !== JSON.stringify(a.dice)) return { kind: 'resync', why: tr('the dice did not match') }
  return { kind: 'ok', match: r.match, action: r.action }
}
