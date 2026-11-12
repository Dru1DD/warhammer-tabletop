// Host side: owns the lobby and the authoritative match. Guest commands go through the same `port.submit`
// as the host's own UI clicks, so there is exactly one rules pipeline. No PeerJS, no React.

import { controllerOf, nextEnvelope } from '../game/match/match'
import type { CommandEnvelope, MatchState, SubmitResult } from '../game/match/types'
import type { Command } from '../game/types'
import type { PlayerId } from '../game/types'
import type { Link } from './link'
import { defaultLobby, normalizeLobby, startProblem } from './lobby'
import { encode, GUEST_ID, parseMessage, PROTOCOL_VERSION, type JoinRefusal, type LobbyState, type NetMessage } from './protocol'
import { snapshotOf } from './sync'

/** The host's view of its match. The app backs it with the store; tests with a plain object. */
export interface MatchPort {
  get(): MatchState | null
  /** one pipeline for every command; the result is also reported to the caller (guest) */
  submit(env: CommandEnvelope, opts: { silent: boolean }): SubmitResult
  subscribe(fn: (m: MatchState | null) => void): () => void
}

export type GuestStatus = 'absent' | 'connected' | 'lost' | 'left'

export interface HostState {
  lobby: LobbyState
  playing: boolean
  guest: GuestStatus
}

export interface HostOptions {
  port: MatchPort
  /** build the battle for this lobby and install it in the port (host-side seed, `startGame`); returns it */
  startMatch(lobby: LobbyState): MatchState
  newToken(): string
  onChange?(s: HostState): void
  /** guest token and game id changed: persist them so a restored host can accept the guest again */
  onSession?(s: { token: string | null; gameId: string | null }): void
  hello_timeout_ms?: number
  silence_ms?: number
  /** how long a reaction or a Command Re-roll question waits for its player before it is passed (DECISION_TIMEOUT) */
  decision_timeout_ms?: number
}

const HELLO_TIMEOUT = 10_000
const SILENCE = 20_000
/** A reaction window or a Command Re-roll question unanswered this long is passed for its player (stage 2 of the Stratagems:
 * "wait for the opponent with a timeout, then skip"). The UI shows the same countdown. */
export const DECISION_TIMEOUT = 20_000

export class HostSession {
  private lobby: LobbyState = defaultLobby()
  private playing = false
  private gameId: string | null = null
  private token: string | null = null
  private link: Link | null = null
  private status: GuestStatus = 'absent'
  private lastSeen = 0
  private sentVersion = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private unsub: () => void
  private closed = false
  /** the open question being timed: the match version it appeared at */
  private decision: { version: number; timer: ReturnType<typeof setTimeout> } | null = null

  private o: HostOptions
  constructor(o: HostOptions) {
    this.o = o
    this.unsub = o.port.subscribe((m) => {
      this.flush(m)
      this.watchDecision(m)
    })
    this.timer = setInterval(() => {
      if (this.link && Date.now() - this.lastSeen > (o.silence_ms ?? SILENCE)) this.drop(this.link, 'lost')
    }, 2000)
  }

  get state(): HostState {
    return { lobby: this.lobby, playing: this.playing, guest: this.status }
  }

  private emit() {
    this.o.onChange?.(this.state)
  }

  private send(link: Link, m: NetMessage) {
    try {
      link.send(encode(m))
    } catch {
      /* a broken pipe is detected by close/silence handling */
    }
  }

  // ------------------------------------------------------------ lobby

  setConfig(c: { scenarioId?: string; hostSide?: PlayerId; hostArmy?: LobbyState['hostArmy'] }) {
    if (this.playing) return
    this.lobby = normalizeLobby({ ...this.lobby, ...c, guestReady: false })
    this.pushLobby()
  }

  private pushLobby() {
    this.lobby = { ...this.lobby, guestConnected: this.status === 'connected' }
    if (this.link && this.status === 'connected') this.send(this.link, { type: 'lobby', lobby: this.lobby })
    this.emit()
  }

  /** Start the match when both are connected and ready. Returns a Russian reason on failure. */
  start(): string | null {
    if (this.playing) return 'Партия уже идёт.'
    const why = startProblem({ ...this.lobby, guestConnected: this.status === 'connected' })
    if (why) return why
    const match = this.o.startMatch(this.lobby)
    this.resume(match, this.token)
    if (this.link) this.send(this.link, { type: 'start', save: snapshotOf(match) })
    return null
  }

  /** Enter the playing phase with an existing match (new battle or a restored save). */
  resume(match: MatchState, token: string | null) {
    this.playing = true
    this.gameId = match.gameId
    this.token = token
    this.sentVersion = match.version
    this.o.onSession?.({ token, gameId: match.gameId })
    this.emit()
    this.watchDecision(match)
  }

  // ------------------------------------------------------------ connections

  /** A new inbound connection. It is untrusted until a valid `hello`. */
  accept(link: Link) {
    const hello = setTimeout(() => {
      if (this.link !== link) link.close()
    }, this.o.hello_timeout_ms ?? HELLO_TIMEOUT)
    link.onMessage = (raw) => {
      if (this.closed) return
      const m = parseMessage(raw, true)
      if (!m) return
      if (this.link === link) {
        this.lastSeen = Date.now()
        this.fromGuest(link, m)
      } else if (m.type === 'hello') {
        clearTimeout(hello)
        this.hello(link, m)
      }
    }
    link.onClose = () => {
      clearTimeout(hello)
      if (this.link === link) this.drop(link, 'lost')
    }
  }

  private refuse(link: Link, reason: JoinRefusal) {
    this.send(link, { type: 'refused', reason })
    link.onMessage = null
    link.onClose = null
    setTimeout(() => link.close(), 200)
  }

  private hello(link: Link, m: Extract<NetMessage, { type: 'hello' }>) {
    if (m.v !== PROTOCOL_VERSION) return this.refuse(link, 'version')
    const owner = this.token !== null && m.token === this.token
    if (this.playing) {
      if (!this.token) return this.refuse(link, 'game-started')
      if (!owner) return this.refuse(link, m.token ? 'bad-token' : 'game-started')
    } else if (this.status === 'connected' && !owner) {
      return this.refuse(link, 'room-full')
    }
    // a returning guest replaces its own half-dead connection
    const old = this.link
    this.link = link
    if (old && old !== link) {
      old.onMessage = null
      old.onClose = null
      old.close()
    }
    if (!owner) this.token = this.o.newToken()
    this.status = 'connected'
    this.lastSeen = Date.now()
    this.lobby = { ...this.lobby, guestConnected: true, guestReady: owner ? this.lobby.guestReady : false }
    this.send(link, { type: 'welcome', token: this.token!, playerId: GUEST_ID, lobby: this.lobby, playing: this.playing })
    const match = this.o.port.get()
    if (this.playing && match) {
      this.send(link, { type: 'snapshot', save: snapshotOf(match), why: 'reconnect' })
      this.sentVersion = match.version
    }
    this.o.onSession?.({ token: this.token, gameId: this.gameId })
    this.emit()
  }

  private drop(link: Link, why: 'lost' | 'left') {
    if (this.link !== link) return
    link.onMessage = null
    link.onClose = null
    link.close()
    this.link = null
    if (this.playing) {
      this.status = why // the slot stays reserved for the token holder
    } else {
      this.status = 'absent'
      this.token = null
      this.lobby = { ...this.lobby, guestConnected: false, guestReady: false }
    }
    this.emit()
  }

  // ------------------------------------------------------------ guest messages

  private fromGuest(link: Link, m: NetMessage) {
    switch (m.type) {
      case 'ping':
        return this.send(link, { type: 'pong', n: m.n })
      case 'bye':
        return this.drop(link, 'left')
      case 'prefs': {
        if (this.playing) return
        const next = { ...this.lobby }
        if (m.side !== undefined) {
          next.guestSide = m.side
          next.guestReady = false
        }
        if (m.army !== undefined) {
          next.guestArmy = m.army
          if (m.ready === undefined) next.guestReady = false
        }
        if (m.ready !== undefined) next.guestReady = m.ready
        const fixed = normalizeLobby(next)
        // an invalid faction choice is silently reverted by the echo below
        this.lobby = fixed.guestSide === next.guestSide ? fixed : { ...fixed, guestReady: false }
        return this.pushLobby()
      }
      case 'syncRequest': {
        const match = this.o.port.get()
        if (!this.playing || !match) return
        this.sentVersion = match.version
        return this.send(link, { type: 'snapshot', save: snapshotOf(match), why: 'sync' })
      }
      case 'command':
        return this.command(link, m.envelope)
    }
  }

  private command(link: Link, env: CommandEnvelope) {
    const refuse = (code: 'unauthorized' | 'illegal' | 'wrong-game', reason: string) =>
      this.send(link, { type: 'rejected', commandId: env.commandId, code, reason })
    if (!this.playing || !this.o.port.get()) return refuse('illegal', 'Партия ещё не началась.')
    // identity comes from the connection, never from the message
    if (env.playerId !== GUEST_ID) return refuse('unauthorized', 'Идентификатор игрока не совпадает с вашим подключением.')
    if (env.gameId !== this.gameId) return refuse('wrong-game', 'Команда относится к другой партии.')
    const r = this.o.port.submit(env, { silent: true })
    if (r.ok) this.flush(this.o.port.get())
    else this.send(link, { type: 'rejected', commandId: env.commandId, code: r.code, reason: r.reason })
  }

  /** Broadcast every accepted action the guest has not seen yet; resend a snapshot if the host's match went backwards. */
  private flush(m: MatchState | null) {
    if (!this.playing || !m || m.gameId !== this.gameId || !this.link || this.status !== 'connected') return
    if (m.version < this.sentVersion) {
      this.sentVersion = m.version
      return this.send(this.link, { type: 'snapshot', save: snapshotOf(m), why: 'resync' })
    }
    for (const action of m.history.slice(this.sentVersion)) this.send(this.link, { type: 'accepted', action })
    this.sentVersion = m.version
  }

  // ------------------------------------------------------------ decision timeout

  /** A reaction window or a re-roll question is open: time it (once per match version); anything else clears the timer. */
  private watchDecision(m: MatchState | null) {
    const open = this.playing && !!m && m.gameId === this.gameId && !m.state.winner && !!(m.state.reaction || m.state.pendingReroll)
    if (!open) return this.clearDecision()
    if (this.decision?.version === m!.version) return
    this.clearDecision()
    const version = m!.version
    this.decision = { version, timer: setTimeout(() => this.timeOut(version), this.o.decision_timeout_ms ?? DECISION_TIMEOUT) }
  }

  private clearDecision() {
    if (this.decision) clearTimeout(this.decision.timer)
    this.decision = null
  }

  /** Nobody answered: pass for the deciding player, through the same pipeline (the envelope carries that player's id). */
  private timeOut(version: number) {
    this.decision = null
    const m = this.o.port.get()
    if (this.closed || !this.playing || !m || m.version !== version) return
    const cmd: Command | null = m.state.pendingReroll ? { type: 'rerollChoice', reroll: false } : m.state.reaction ? { type: 'passReaction' } : null
    if (!cmd) return
    const r = this.o.port.submit(nextEnvelope(m, controllerOf(m).playerId, cmd), { silent: true })
    if (r.ok) this.flush(this.o.port.get())
  }

  /** Leave the room: tell the guest, release everything. */
  close() {
    if (this.closed) return
    this.closed = true
    this.unsub()
    this.clearDecision()
    if (this.timer) clearInterval(this.timer)
    const link = this.link
    this.link = null
    if (link) {
      this.send(link, { type: 'bye' })
      link.onMessage = null
      link.onClose = null
      link.close()
    }
  }
}
