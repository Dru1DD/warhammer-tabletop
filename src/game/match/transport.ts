// FUTURE NETWORKING BOUNDARY: types only, nothing here is implemented or imported by the game.
//
// Intended topology: one HOST holds the authoritative MatchState and runs `submit()`.
// Guests send CommandEnvelopes; the host answers with the accepted ActionRecord (broadcast to all)
// or a rejection (to the sender only). A PeerJS/WebRTC adapter implements `MatchTransport`;
// the engine and match layer never import it. Messages are plain JSON.

import type { ActionRecord, CommandEnvelope, MatchMeta, MatchState, PlayerAssignments, RejectCode, SideId } from './types'

export type PeerStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

/** What a peer needs to rebuild the host's match: replay base plus accepted actions. */
export interface MatchSnapshot {
  meta: Omit<MatchMeta, 'history'>
  /** current state, to skip replaying from `initial` */
  state: MatchState['state']
  history: readonly ActionRecord[]
}

export type NetMessage =
  | { type: 'hello'; gameId: string; playerId: string; side?: SideId }
  | { type: 'command'; envelope: CommandEnvelope }
  | { type: 'accepted'; action: ActionRecord }
  | { type: 'rejected'; commandId: string; code: RejectCode; reason: string }
  | { type: 'syncRequest'; gameId: string; haveVersion: number }
  | { type: 'syncSnapshot'; snapshot: MatchSnapshot }

export interface MatchInvite {
  gameId: string
  /** transport-specific join token (e.g. a PeerJS peer id) */
  token: string
}

export type Unsubscribe = () => void

export interface MatchTransport {
  // lifecycle
  createMatch(assignments: PlayerAssignments): Promise<MatchInvite>
  joinMatch(invite: MatchInvite): Promise<{ playerId: string; side: SideId }>
  disconnect(): void
  // traffic
  sendCommand(envelope: CommandEnvelope): void
  broadcastAccepted(action: ActionRecord): void
  sendRejected(toPlayerId: string, commandId: string, code: RejectCode, reason: string): void
  requestSync(haveVersion: number): Promise<MatchSnapshot>
  // events
  onCommand(handler: (envelope: CommandEnvelope, fromPlayerId: string) => void): Unsubscribe
  onAccepted(handler: (action: ActionRecord) => void): Unsubscribe
  /** guest side: the host refused one of our commands (answer to `sendRejected`) */
  onRejected(handler: (commandId: string, code: RejectCode, reason: string) => void): Unsubscribe
  /** host side: a peer asks to catch up; the handler returns what it is missing */
  onSyncRequest(handler: (fromPlayerId: string, haveVersion: number) => MatchSnapshot | Promise<MatchSnapshot>): Unsubscribe
  onPeerStatus(handler: (playerId: string, status: PeerStatus) => void): Unsubscribe
}
