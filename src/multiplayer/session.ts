// Glue: PeerJS + HostSession/GuestSession + the app store. The UI talks to this file only.
// Module-level singletons are fine: one browser tab = one online room.

import { create } from 'zustand'
import { deserialize, readStorage, saveToStorage } from '../game/persistence'
import type { MatchState } from '../game/match/types'
import type { PlayerId } from '../game/types'
import { MP_SAVE_KEY, useStore } from '../store'
import { GuestSession, type GuestPort, type GuestState } from './guest'
import { HostSession, type GuestStatus, type HostState, type MatchPort } from './host'
import { defaultLobby } from './lobby'
import { openPeer, PeerFailureError, type PeerHandle } from './peer'
import { HOST_ID, type JoinRefusal, type LobbyState } from './protocol'
import { reconnectLoop } from './reconnect'
import { sharedAssignments, viewAs } from './sync'

export const ROOM_PREFIX = 'wh40k-tt-'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
export const HOST_SESSION_KEY = 'wh40k-training-mp-host'
export const GUEST_SESSION_KEY = 'wh40k-training-mp-guest'

export type ConnStatus = 'connecting' | 'connected' | 'lost' | 'reconnecting' | 'failed'

export const STATUS_TEXT: Record<ConnStatus, string> = {
  connecting: 'Подключение...',
  connected: 'Подключено.',
  lost: 'Соединение потеряно.',
  reconnecting: 'Переподключение...',
  failed: 'Соединение потеряно.',
}

export interface MpState {
  /** which online screen is open ('none' = start screen / battle) */
  screen: 'none' | 'menu' | 'room'
  role: 'host' | 'guest' | null
  code: string | null
  status: ConnStatus
  lobby: LobbyState | null
  playing: boolean
  /** host only: the opponent's connection */
  guest: GuestStatus
  error: string | null
  busy: boolean
}

const idle: MpState = { screen: 'none', role: null, code: null, status: 'connecting', lobby: null, playing: false, guest: 'absent', error: null, busy: false }
export const useMp = create<MpState>(() => idle)
const set = (p: Partial<MpState>) => useMp.setState(p)

let handle: PeerHandle | null = null
let host: HostSession | null = null
let guest: GuestSession | null = null
/** bumped on every start/leave: an async step that finds a different value was abandoned */
let epoch = 0

// ------------------------------------------------------------ codes and links

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))
export const makeCode = () => Array.from(randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
const newToken = () => Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('')

/** Accepts a bare code, "wh40k-tt-CODE" or a whole invitation link; null if it is not a valid room code. */
export function parseRoomCode(input: string): string | null {
  let t = input.trim()
  try {
    const q = new URL(t).searchParams.get('room')
    if (q) t = q
  } catch {
    /* not a URL */
  }
  t = t.toUpperCase().replace(ROOM_PREFIX.toUpperCase(), '')
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(t) ? t : null
}

export const inviteLink = (code: string) => `${location.origin}${location.pathname}?room=${code}`

const REFUSALS: Record<JoinRefusal, string> = {
  'room-full': 'В комнате уже два игрока.',
  'game-started': 'В этой комнате партия уже идёт.',
  'bad-token': 'Партия идёт с другим игроком: вас не узнали.',
  version: 'Версии игры у игроков различаются. Обновите страницу.',
}

function failureText(e: unknown): string {
  const kind = e instanceof PeerFailureError ? e.kind : 'other'
  if (kind === 'peer-unavailable') return 'Комната не найдена. Проверьте код и убедитесь, что хозяин не закрыл страницу.'
  if (kind === 'network') return 'Нет связи с сервером соединений. Проверьте интернет и попробуйте ещё раз.'
  if (kind === 'timeout') return 'Не удалось установить прямое соединение. Возможно, мешает сетевой экран или VPN.'
  return 'Не удалось подключиться. Попробуйте ещё раз.'
}

// ------------------------------------------------------------ saved sessions (one local record each)

interface SavedHost { code: string; token: string | null; gameId: string | null }
interface SavedGuest { code: string; token: string }

function readJson<T>(key: string, ok: (v: Record<string, unknown>) => boolean): T | null {
  try {
    const v = JSON.parse(readStorage(key) ?? 'null')
    return v && typeof v === 'object' && ok(v) ? (v as T) : null
  } catch {
    return null
  }
}

/** A host save that can be reopened: shared match + the room record that belongs to it, and the match not finished. */
export function savedHostGame(): { session: SavedHost; match: MatchState } | null {
  const session = readJson<SavedHost>(HOST_SESSION_KEY, (v) => typeof v.code === 'string')
  const r = deserialize(readStorage(MP_SAVE_KEY))
  if (!session || !r.ok || r.file.match.mode !== 'shared' || r.file.state.winner || (session.gameId && session.gameId !== r.file.match.gameId)) return null
  return { session, match: viewAs({ ...r.file.match, state: r.file.state }, HOST_ID) }
}

export const savedGuestRoom = () => readJson<SavedGuest>(GUEST_SESSION_KEY, (v) => typeof v.code === 'string' && typeof v.token === 'string')

// ------------------------------------------------------------ ports onto the store

const storePort: MatchPort = {
  get: () => useStore.getState().match,
  submit: (env, opts) => useStore.getState().submit(env, opts),
  subscribe: (fn) => useStore.subscribe((s, p) => { if (s.match !== p.match) fn(s.match) }),
}

const guestPort: GuestPort = {
  get: () => (useStore.getState().shared?.role === 'guest' ? useStore.getState().match : null),
  install: (m) => useStore.getState().installShared(m, 'guest', (env) => guest?.sendCommand(env) ?? false),
  commit: (m, action) => {
    const st = useStore.getState()
    if (st.match) st.commitAccepted(st.match, { match: m, action })
  },
  notify: (t) => useStore.getState().setMessage(t, 'error'),
}

// ------------------------------------------------------------ host

export async function createRoom(restore?: { session: SavedHost; match: MatchState }) {
  if (useMp.getState().busy || host || guest) return
  const my = ++epoch
  set({ ...idle, screen: 'room', role: 'host', busy: true, lobby: defaultLobby() })
  try {
    let h: PeerHandle | null = null
    let code = ''
    for (let i = 0; i < 6 && !h; i++) {
      code = restore?.session.code ?? makeCode()
      try {
        h = await openPeer(ROOM_PREFIX + code)
      } catch (e) {
        if (!(e instanceof PeerFailureError && e.kind === 'unavailable-id')) throw e
        // a restored room code may still be held by the signaling server for a moment
        if (restore) await new Promise((r) => setTimeout(r, 2500))
      }
    }
    if (!h) throw new PeerFailureError('unavailable-id')
    if (my !== epoch) return h.destroy()
    handle = h
    if (restore) useStore.getState().installShared(restore.match, 'host')
    host = new HostSession({
      port: storePort,
      newToken,
      startMatch: (l) => useStore.getState().startSharedHost({ scenarioId: l.scenarioId, hostSide: l.hostSide, guestSide: l.guestSide, hostArmy: l.hostArmy ?? null, guestArmy: l.guestArmy ?? null, assignments: sharedAssignments(l.hostSide, l.guestSide) }),
      onChange: (s: HostState) => set({ lobby: s.lobby, playing: s.playing, guest: s.guest }),
      onSession: ({ token, gameId }) => saveToStorage(HOST_SESSION_KEY, JSON.stringify({ code, token, gameId })),
    })
    if (restore) host.resume(restore.match, restore.session.token)
    // the host plays the faction and the army list of its start screen
    else configureRoom({ hostSide: useStore.getState().settings.human })
    h.onConnection((link) => host?.accept(link))
    h.onSignaling((up) => set({ status: up ? 'connected' : 'reconnecting' }))
    set({ code, status: 'connected', busy: false, lobby: host.state.lobby, playing: host.state.playing })
  } catch (e) {
    if (my === epoch) {
      set({ busy: false, status: 'failed', error: failureText(e) })
      teardown()
    }
  }
}

/** Host lobby settings; a faction change also brings that faction's list from the army builder (or the training roster). */
export const configureRoom = (c: { scenarioId?: string; hostSide?: PlayerId }) =>
  host?.setConfig(c.hostSide ? { ...c, hostArmy: useStore.getState().settings.armies?.[c.hostSide] ?? null } : c)

/** Host presses «Начать матч»; returns a Russian reason on failure. */
export const startRoomMatch = (): string | null => (host ? host.start() : 'Комната не создана.')

// ------------------------------------------------------------ guest

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Resolves when the guest's connection attempt has an outcome. */
async function outcome(g: GuestSession, ms: number, my: number): Promise<'connected' | 'refused' | 'lost'> {
  for (let waited = 0; waited < ms && my === epoch; waited += 100) {
    if (g.state.link === 'connected') return 'connected'
    if (g.state.link === 'refused') return 'refused'
    if (g.state.link === 'lost') return 'lost'
    await sleep(100)
  }
  return 'lost'
}

function onGuestChange(s: GuestState) {
  const patch: Partial<MpState> = { lobby: s.lobby, playing: s.playing }
  if (s.link === 'connected') patch.status = 'connected'
  if (s.link === 'refused') {
    patch.status = 'failed'
    patch.error = s.refusal ? REFUSALS[s.refusal] : 'Подключение отклонено.'
    if (s.refusal === 'bad-token') saveToStorage(GUEST_SESSION_KEY, 'null')
  }
  set(patch)
  const code = useMp.getState().code
  if (s.token && code && s.link === 'connected') saveToStorage(GUEST_SESSION_KEY, JSON.stringify({ code, token: s.token }))
}

export async function joinRoom(input: string, token?: string | null) {
  const mp = useMp.getState()
  const code = parseRoomCode(input)
  if (!code) return set({ screen: 'menu', error: 'Введите код комнаты (6 символов) или ссылку-приглашение.' })
  if (mp.role === 'host' && mp.code === code) return set({ error: 'Нельзя присоединиться к собственной комнате.' })
  if (mp.busy || host || guest) return
  const my = ++epoch
  set({ ...idle, screen: 'room', role: 'guest', code, busy: true })
  try {
    handle = await openPeer()
    if (my !== epoch) return handle.destroy()
    guest = new GuestSession({ port: guestPort, token, onChange: onGuestChange, onLost: () => void reconnect(my) })
    guest.attach(await handle.connect(ROOM_PREFIX + code))
    const r = await outcome(guest, 15_000, my)
    if (my !== epoch) return
    if (r === 'lost') throw new PeerFailureError('timeout')
    set({ busy: false })
    if (r === 'refused') teardown()
  } catch (e) {
    if (my !== epoch) return
    set({ busy: false, status: 'failed', error: failureText(e) })
    teardown()
  }
}

/** The data connection died: try again with the stored token; the host answers with a full snapshot. */
async function reconnect(my: number, delays?: number[]) {
  if (!guest || my !== epoch) return
  const g = guest
  set({ status: 'reconnecting', error: null })
  const r = await reconnectLoop(
    async () => {
      try {
        handle?.destroy()
        handle = await openPeer()
        g.attach(await handle.connect(ROOM_PREFIX + useMp.getState().code))
      } catch {
        return 'retry'
      }
      const o = await outcome(g, 10_000, my)
      return o === 'connected' ? 'connected' : o === 'refused' ? 'stop' : 'retry'
    },
    { delays, cancelled: () => my !== epoch },
  )
  if (my !== epoch) return
  if (r === 'gave-up') set({ status: 'failed', error: 'Хозяин не отвечает. Партия приостановлена, пока он не вернётся.' })
}

/** Manual retry after the automatic attempts ran out. */
export const retryReconnect = () => void reconnect(epoch, [0])

/** Guest lobby choices; picking a faction or getting ready also sends that faction's list from the army builder. */
export function setGuestPrefs(p: { side?: PlayerId; ready?: boolean }) {
  const side = p.side ?? useMp.getState().lobby?.guestSide
  const send = p.side !== undefined || p.ready === true
  guest?.setPrefs(send && side ? { ...p, army: useStore.getState().settings.armies?.[side] ?? null } : p)
}

// ------------------------------------------------------------ leaving

function teardown() {
  host?.close()
  guest?.leave()
  handle?.destroy()
  host = guest = handle = null
}

/** Leave the room (and the battle, if one is running). A guest's rejoin record is forgotten; a host's save stays for «Восстановить». */
export function leaveRoom() {
  epoch++
  if (guest) saveToStorage(GUEST_SESSION_KEY, 'null')
  if (host && useStore.getState().game?.winner) {
    saveToStorage(HOST_SESSION_KEY, 'null')
    saveToStorage(MP_SAVE_KEY, '')
  }
  teardown()
  useStore.getState().quit()
  useMp.setState(idle)
}

export const openOnlineMenu = () => set({ ...idle, screen: 'menu' })
export const closeOnlineMenu = () => set({ screen: 'none', error: null })
