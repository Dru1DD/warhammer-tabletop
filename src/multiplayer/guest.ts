// Guest side: sends commands, renders what the host accepted. It never commits its own result:
// accepted actions are re-applied only to be checked against the host's dice record, a mismatch is answered with a host snapshot.

import type { ActionRecord, CommandEnvelope, MatchState, RejectCode } from '../game/match/types'
import type { ArmyList } from '../game/army/armyList'
import type { PlayerId } from '../game/types'
import type { Link } from './link'
import { encode, GUEST_ID, parseMessage, PROTOCOL_VERSION, type JoinRefusal, type LobbyState, type NetMessage } from './protocol'
import { applyAccepted, matchFromSave, sideOfParticipant } from './sync'

/** The guest's view of its match. The app backs it with the store; tests with a plain object. */
export interface GuestPort {
  get(): MatchState | null
  /** replace the whole match with the host's snapshot (start, reconnect, resync) */
  install(match: MatchState, mySide: PlayerId): void
  /** publish a match that `applyAccepted` verified */
  commit(match: MatchState, action: ActionRecord): void
  /** show an error to the player */
  notify(text: string): void
}

export type GuestLink = 'connecting' | 'connected' | 'lost' | 'refused' | 'ended'

export interface GuestState {
  link: GuestLink
  lobby: LobbyState | null
  playing: boolean
  token: string | null
  refusal: JoinRefusal | null
  /** command id awaiting the host's answer (one in flight) */
  pending: string | null
}

export interface GuestOptions {
  port: GuestPort
  token?: string | null
  onChange?(s: GuestState): void
  /** the data connection is gone (closed or silent): the owner decides about reconnecting */
  onLost?(): void
  ping_ms?: number
  silence_ms?: number
}

const RESYNC_CODES: RejectCode[] = ['stale-state', 'duplicate', 'bad-sequence', 'wrong-game']

export class GuestSession {
  state: GuestState
  private link: Link | null = null
  private lastSeen = 0
  private n = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private ended = false

  private o: GuestOptions
  constructor(o: GuestOptions) {
    this.o = o
    this.state = { link: 'connecting', lobby: null, playing: false, token: o.token ?? null, refusal: null, pending: null }
  }

  private set(p: Partial<GuestState>) {
    this.state = { ...this.state, ...p }
    this.o.onChange?.(this.state)
  }

  private send(m: NetMessage) {
    try {
      this.link?.send(encode(m))
    } catch {
      /* detected by close/silence */
    }
  }

  /** Use a (new) data connection to the host and introduce ourselves; a stored token proves we are the returning guest. */
  attach(link: Link) {
    this.detach()
    if (this.ended) return
    this.link = link
    this.lastSeen = Date.now()
    this.set({ link: 'connecting', pending: null })
    link.onMessage = (raw) => {
      if (this.link !== link) return
      const m = parseMessage(raw, false)
      if (!m) return
      this.lastSeen = Date.now()
      this.fromHost(m)
    }
    link.onClose = () => {
      if (this.link === link) this.lost()
    }
    this.send({ type: 'hello', v: PROTOCOL_VERSION, ...(this.state.token ? { token: this.state.token } : {}) })
    this.timer = setInterval(() => {
      if (Date.now() - this.lastSeen > (this.o.silence_ms ?? 15_000)) this.lost()
      else this.send({ type: 'ping', n: ++this.n })
    }, this.o.ping_ms ?? 5000)
  }

  private detach() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.link) {
      this.link.onMessage = null
      this.link.onClose = null
      this.link.close()
    }
    this.link = null
  }

  private lost() {
    if (this.ended) return
    this.detach()
    this.set({ link: 'lost', pending: null })
    this.o.onLost?.()
  }

  private install(save: string) {
    const r = matchFromSave(save, GUEST_ID)
    const side = r.ok && sideOfParticipant(r.match, GUEST_ID)
    if (!r.ok || !side) return this.o.port.notify(r.ok ? 'Снимок партии повреждён.' : r.reason)
    this.o.port.install(r.match, side)
    this.set({ playing: true, pending: null })
  }

  private fromHost(m: NetMessage) {
    switch (m.type) {
      case 'welcome':
        return this.set({ link: 'connected', token: m.token, lobby: m.lobby, playing: m.playing })
      case 'refused':
        this.set({ link: 'refused', refusal: m.reason })
        return this.end()
      case 'lobby':
        return this.set({ lobby: m.lobby })
      case 'start':
      case 'snapshot':
        return this.install(m.save)
      case 'bye':
        return this.lost()
      case 'accepted': {
        const match = this.o.port.get()
        if (!match) return
        const r = applyAccepted(match, m.action)
        if (r.kind === 'ok') {
          this.o.port.commit(r.match, r.action)
          if (this.state.pending === m.action.actionId) this.set({ pending: null })
        } else if (r.kind === 'resync') this.send({ type: 'syncRequest', haveVersion: match.version })
        return
      }
      case 'rejected':
        if (this.state.pending !== m.commandId) return
        this.set({ pending: null })
        this.o.port.notify(m.reason)
        if (RESYNC_CODES.includes(m.code)) this.send({ type: 'syncRequest', haveVersion: this.o.port.get()?.version ?? 0 })
        return
      case 'pong':
        return
    }
  }

  // ------------------------------------------------------------ actions

  /** Send a command to the host. One at a time; false means it was not sent (reason shown to the player). */
  sendCommand(env: CommandEnvelope): boolean {
    if (this.state.link !== 'connected') {
      this.o.port.notify('Нет соединения с хозяином комнаты.')
      return false
    }
    if (this.state.pending) {
      this.o.port.notify('Дождитесь ответа на предыдущее действие.')
      return false
    }
    this.set({ pending: env.commandId })
    this.send({ type: 'command', envelope: env })
    return true
  }

  setPrefs(p: { side?: PlayerId; ready?: boolean; army?: ArmyList | null }) {
    this.send({ type: 'prefs', ...p })
  }

  requestSync() {
    this.send({ type: 'syncRequest', haveVersion: this.o.port.get()?.version ?? 0 })
  }

  /** Leave on purpose: tell the host, forget everything. */
  leave() {
    this.send({ type: 'bye' })
    this.end()
  }

  private end() {
    this.ended = true
    this.detach()
    if (this.state.link !== 'refused') this.set({ link: 'ended', pending: null })
  }
}
