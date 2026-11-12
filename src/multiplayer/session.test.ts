// The real session + store + UI-facing state against a fake PeerJS network (no internet): each test plays one side
// with the app code and the other with the plain Host/Guest classes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextEnvelope } from '../game/match/match'
import type { Command } from '../game/types'
import { AUTOSAVE_KEY, MP_SAVE_KEY, useStore } from '../store'
import { GuestSession } from './guest'
import { guestPort, hostPort, testMatch } from './harness'
import { HostSession } from './host'
import { memoryPair, type Link } from './link'
import { GUEST_ID, HOST_ID } from './protocol'
import type { PeerHandle } from './peer'
import { PeerFailureError } from './peer'

// ---- fake signaling network
const peers = new Map<string, { onConn: ((l: Link) => void)[]; sig: ((up: boolean) => void)[] }>()
let anon = 0
vi.mock('./peer', async (orig) => ({
  ...(await orig<typeof import('./peer')>()),
  openPeer: async (id?: string): Promise<PeerHandle> => {
    const pid = id ?? `anon-${++anon}`
    if (peers.has(pid)) throw new PeerFailureError('unavailable-id')
    const me = { onConn: [] as ((l: Link) => void)[], sig: [] as ((up: boolean) => void)[] }
    peers.set(pid, me)
    return {
      id: pid,
      onConnection: (cb) => me.onConn.push(cb),
      onSignaling: (cb) => me.sig.push(cb),
      connect: async (remote) => {
        const target = peers.get(remote)
        if (!target) throw new PeerFailureError('peer-unavailable')
        const pair = memoryPair()
        target.onConn.forEach((cb) => cb(pair.a))
        return pair.b
      },
      destroy: () => void peers.delete(pid),
    }
  },
}))

const { createRoom, joinRoom, leaveRoom, configureRoom, startRoomMatch, setGuestPrefs, useMp, parseRoomCode, ROOM_PREFIX, makeCode, inviteLink, HOST_SESSION_KEY, GUEST_SESSION_KEY, savedHostGame, retryReconnect } = await import('./session')

const st = () => useStore.getState()
const END: Command = { type: 'endPhase' }
const decider = () => st().match!.assignments[(st().game!.reaction?.player ?? st().game!.fight?.selecting ?? st().game!.activePlayer)].playerId

beforeEach(() => { localStorage.clear(); peers.clear() })
afterEach(() => { leaveRoom(); vi.useRealTimers() })

/** A plain guest that joins the app's hosted room (through the fake network). */
async function plainGuest(code: string, token?: string) {
  const gp = guestPort()
  const guest = new GuestSession({ port: gp.port, token })
  const link = await (await (await import('./peer')).openPeer()).connect(ROOM_PREFIX + code)
  guest.attach(link)
  return { guest, gp }
}

describe('room codes', () => {
  it('generates valid codes and parses codes, prefixed ids and invitation links', () => {
    const c = makeCode()
    expect(parseRoomCode(c)).toBe(c)
    expect(parseRoomCode(` ${c.toLowerCase()} `)).toBe(c)
    expect(parseRoomCode(ROOM_PREFIX + c)).toBe(c)
    expect(parseRoomCode(inviteLink(c))).toBe(c)
    for (const bad of ['', 'abc', 'K7M2Q', 'K7M2QXX', 'K7M2Q0', 'ООООOO', '<script>']) expect(parseRoomCode(bad)).toBeNull()
  })
})

describe('app as host', () => {
  it('creates a room, lobby with a joining guest, starts, and stays authoritative', async () => {
    await createRoom()
    const mp = useMp.getState()
    expect(mp).toMatchObject({ role: 'host', status: 'connected', screen: 'room' })
    expect(mp.code).toMatch(/^[A-Z2-9]{6}$/)
    const { guest, gp } = await plainGuest(mp.code!)
    expect(useMp.getState().guest).toBe('connected')
    expect(startRoomMatch()).toMatch(/не готов/)
    configureRoom({ hostSide: 'tyranids', scenarioId: 'combat-patrol' })
    guest.setPrefs({ side: 'necrons' })
    guest.setPrefs({ ready: true })
    expect(useMp.getState().lobby).toMatchObject({ hostSide: 'tyranids', guestSide: 'necrons', guestReady: true })
    expect(startRoomMatch()).toBeNull()

    expect(st().shared?.role).toBe('host')
    expect(st().settings).toMatchObject({ human: 'tyranids', opponent: 'necrons' })
    expect(st().match!.mode).toBe('shared')
    expect(JSON.stringify(gp.port.get()!.state)).toBe(JSON.stringify(st().game))
    expect(gp.log.side).toBe('necrons')
    // saved under the multiplayer key only
    expect(localStorage.getItem(MP_SAVE_KEY)).toBeTruthy()
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull()

    // host plays through the normal dispatch; the guest mirrors it (the Tyranids first choose their Hyper-adaptation)
    expect(st().dispatch({ type: 'hyperAdaptation', choice: 'swarming' })).toBe(true)
    for (let i = 0; i < 10 && decider() === HOST_ID; i++) expect(st().dispatch(END)).toBe(true)
    expect(gp.port.get()!.version).toBe(st().match!.version)
    expect(JSON.stringify(gp.port.get()!.state)).toBe(JSON.stringify(st().game))
    expect(decider()).toBe(GUEST_ID)

    // a guest command out of turn... and a valid one in turn
    const v = st().match!.version
    guest.sendCommand(nextEnvelope(gp.port.get()!, GUEST_ID, END))
    expect(st().match!.version).toBe(v + 1)
    expect(JSON.stringify(gp.port.get()!.state)).toBe(JSON.stringify(st().game))
  })

  it("a guest's rejected command is answered to the guest only: the host's screen shows no error", async () => {
    await createRoom()
    const { guest, gp } = await plainGuest(useMp.getState().code!)
    guest.setPrefs({ ready: true })
    startRoomMatch()
    // the host's battle seed is random: whoever won the roll-off, get to a decision that belongs to the host
    for (let i = 0; i < 20 && decider() === GUEST_ID; i++) guest.sendCommand(nextEnvelope(gp.port.get()!, GUEST_ID, st().game!.reaction ? { type: 'passReaction' } : END))
    expect(decider()).toBe(HOST_ID)
    gp.log.notes.length = 0
    useStore.setState({ message: null })
    const v = st().match!.version
    guest.sendCommand(nextEnvelope(gp.port.get()!, GUEST_ID, END)) // not the guest's turn
    expect(st().match!.version).toBe(v)
    expect(st().message).toBeNull()
    expect(gp.log.notes.length).toBe(1)
  })

  it('the guest dropping pauses nothing on the host: status lost, match kept, rejoin with the token restores', async () => {
    await createRoom()
    const code = useMp.getState().code!
    const first = await plainGuest(code)
    first.guest.setPrefs({ ready: true })
    startRoomMatch()
    const token = first.guest.state.token!
    first.guest.leave()
    expect(useMp.getState()).toMatchObject({ guest: 'left', playing: true })
    expect(st().game).not.toBeNull()
    st().dispatch(END)
    const again = await plainGuest(code, token)
    expect(useMp.getState().guest).toBe('connected')
    expect(JSON.stringify(again.gp.port.get()!.state)).toBe(JSON.stringify(st().game))
  })

  it('refuses a third player and saves a restorable room', async () => {
    await createRoom()
    const code = useMp.getState().code!
    const a = await plainGuest(code)
    a.guest.setPrefs({ ready: true })
    startRoomMatch()
    const intruder = await plainGuest(code)
    expect(intruder.guest.state).toMatchObject({ link: 'refused', refusal: 'game-started' })
    const saved = savedHostGame()
    expect(saved?.session.code).toBe(code)
    expect(saved?.session.token).toBe(a.guest.state.token)
    expect(saved?.match.version).toBe(st().match!.version)
  })

  it('a restored host reopens the same room code and the returning guest gets the state back', async () => {
    await createRoom()
    const code = useMp.getState().code!
    const a = await plainGuest(code)
    a.guest.setPrefs({ ready: true })
    startRoomMatch()
    st().dispatch(END)
    const token = a.guest.state.token!
    const before = JSON.stringify(st().game)
    leaveRoom() // host closes (the save stays)
    expect(st().game).toBeNull()

    const saved = savedHostGame()!
    await createRoom(saved)
    expect(useMp.getState()).toMatchObject({ role: 'host', code, playing: true })
    expect(JSON.stringify(st().game)).toBe(before)
    const back = await plainGuest(code, token)
    expect(back.guest.state).toMatchObject({ link: 'connected', playing: true })
    expect(JSON.stringify(back.gp.port.get()!.state)).toBe(before)
  })

  it('cannot join its own room', async () => {
    await createRoom()
    const code = useMp.getState().code!
    await joinRoom(code)
    expect(useMp.getState()).toMatchObject({ role: 'host', code, error: 'Нельзя присоединиться к собственной комнате.' })
    expect(peers.size).toBe(1)
  })

  it('leaving releases the room, restores single-player settings and forgets a finished game', async () => {
    const before = st().settings
    await createRoom()
    const code = useMp.getState().code!
    const a = await plainGuest(code)
    a.guest.setPrefs({ ready: true })
    configureRoom({ hostSide: 'aeldari', scenarioId: 'combat-patrol' })
    a.guest.setPrefs({ ready: true })
    startRoomMatch()
    expect(st().settings.human).toBe('aeldari')
    leaveRoom()
    expect(st().game).toBeNull()
    expect(st().shared).toBeNull()
    expect(st().settings).toEqual(before)
    expect(useMp.getState().role).toBeNull()
    expect(peers.has(ROOM_PREFIX + code)).toBe(false)
    expect(a.guest.state.link).toBe('lost')
  })
})

describe('app as guest', () => {
  /** Host side played by the plain classes on the fake network. */
  async function plainHost(code = 'ABCDEF') {
    const hp = hostPort()
    const host = new HostSession({ port: hp.port, newToken: () => 'secret', startMatch: (l) => { const m = testMatch(l); hp.set(m); return m } })
    const h = await (await import('./peer')).openPeer(ROOM_PREFIX + code)
    h.onConnection((l) => host.accept(l))
    return { hp, host, code }
  }

  it('joins, picks a faction, plays; commands travel to the host and only the host result changes the screen', async () => {
    const { hp, host, code } = await plainHost()
    await joinRoom(code)
    expect(useMp.getState()).toMatchObject({ role: 'guest', status: 'connected', busy: false })
    setGuestPrefs({ side: 'orks' })
    setGuestPrefs({ ready: true })
    expect(host.state.lobby).toMatchObject({ guestSide: 'orks', guestReady: true })
    expect(host.start()).toBeNull()

    expect(st().shared?.role).toBe('guest')
    expect(st().settings.human).toBe('orks')
    expect(st().match!.assignments.orks).toMatchObject({ type: 'local', playerId: GUEST_ID })
    expect(JSON.stringify(st().game)).toBe(JSON.stringify(hp.port.get()!.state))
    // the guest never saves over the single-player autosave or hosts any save
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull()
    expect(localStorage.getItem(MP_SAVE_KEY)).toBeNull()

    // host turn: the guest's click is refused by the host (ownership), nothing changes locally
    expect(decider()).toBe(HOST_ID)
    const g0 = st().game
    st().dispatch(END)
    expect(st().game).toBe(g0)
    expect(st().message?.text).toMatch(/другой игрок/)

    // the host acts, the guest sees it; then the guest acts through dispatch
    for (let i = 0; i < 10 && decider() === HOST_ID; i++) hp.port.submit(nextEnvelope(hp.port.get()!, HOST_ID, END), { silent: false })
    expect(JSON.stringify(st().game)).toBe(JSON.stringify(hp.port.get()!.state))
    expect(st().dispatch(END)).toBe(true)
    expect(st().match!.version).toBe(hp.port.get()!.version)
    expect(JSON.stringify(st().game)).toBe(JSON.stringify(hp.port.get()!.state))
    // the guest cannot run the pipeline itself
    expect(st().submit(nextEnvelope(st().match!, GUEST_ID, END))).toMatchObject({ ok: false, code: 'unauthorized' })
  })

  it('reports an unknown room in Russian and stays out of the room', async () => {
    await joinRoom('ZZZZZZ')
    expect(useMp.getState()).toMatchObject({ status: 'failed', busy: false })
    expect(useMp.getState().error).toMatch(/Комната не найдена/)
    expect(await new Promise((r) => r(peers.size))).toBe(0)
  })

  it('rejects an invalid code without connecting', async () => {
    await joinRoom('nope')
    expect(useMp.getState().error).toMatch(/код комнаты/i)
    expect(useMp.getState().role).toBeNull()
  })

  it('reports a full room', async () => {
    const { host, code } = await plainHost()
    await plainGuestJoin(code)
    await joinRoom(code)
    expect(useMp.getState().error).toMatch(/два игрока/)
    expect(host.state.guest).toBe('connected')
  })

  it('reconnects after the link drops: Переподключение..., then a fresh snapshot', async () => {
    const { hp, host, code } = await plainHost()
    await joinRoom(code)
    setGuestPrefs({ ready: true })
    host.start()
    expect(localStorage.getItem(GUEST_SESSION_KEY)).toContain(code)
    // the host side loses the connection (its end closes)
    vi.useFakeTimers()
    const hostLink = (host as unknown as { link: Link }).link
    hostLink.close()
    expect(useMp.getState().status).toBe('reconnecting')
    // the match moves on while the guest is away
    hp.port.submit(nextEnvelope(hp.port.get()!, HOST_ID, END), { silent: false })
    await vi.advanceTimersByTimeAsync(1500)
    expect(useMp.getState().status).toBe('connected')
    expect(st().match!.version).toBe(hp.port.get()!.version)
    expect(JSON.stringify(st().game)).toBe(JSON.stringify(hp.port.get()!.state))
  })

  it('gives up after the retries when the host never comes back, and blocks commands; manual retry works once it is back', async () => {
    const { hp, host, code } = await plainHost()
    await joinRoom(code)
    setGuestPrefs({ ready: true })
    host.start()
    vi.useFakeTimers()
    host.close()
    peers.delete(ROOM_PREFIX + code)
    expect(useMp.getState().status).toBe('reconnecting')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(useMp.getState()).toMatchObject({ status: 'failed' })
    expect(useMp.getState().error).toMatch(/Хозяин не отвечает/)
    const g = st().game
    expect(st().dispatch(END)).toBe(false)
    expect(st().game).toBe(g)
    // the host returns (restored from its saved state) under the same code
    const host2 = new HostSession({ port: hostPort2(hp), newToken: () => 'x', startMatch: () => hp.port.get()! })
    host2.resume(hp.port.get()!, 'secret')
    const h = await (await import('./peer')).openPeer(ROOM_PREFIX + code)
    h.onConnection((l) => host2.accept(l))
    retryReconnect()
    await vi.advanceTimersByTimeAsync(500)
    expect(useMp.getState().status).toBe('connected')
  })
})

function hostPort2(hp: ReturnType<typeof hostPort>) {
  return hp.port
}

async function plainGuestJoin(code: string) {
  const g = new GuestSession({ port: guestPort().port })
  g.attach(await (await (await import('./peer')).openPeer()).connect(ROOM_PREFIX + code))
  return g
}

describe('persistence keys', () => {
  it('uses its own storage keys', () => {
    expect(new Set([MP_SAVE_KEY, AUTOSAVE_KEY, HOST_SESSION_KEY, GUEST_SESSION_KEY]).size).toBe(4)
  })
})
