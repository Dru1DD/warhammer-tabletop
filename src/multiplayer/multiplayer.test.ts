import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMatch, nextEnvelope } from '../game/match/match'
import { bare } from '../game/__tests__/helpers'
import { applyAccepted, matchFromSave, sharedAssignments, snapshotOf, viewAs } from './sync'
import type { ActionRecord, CommandEnvelope, MatchState } from '../game/match/types'
import type { Command, PlayerId } from '../game/types'
import { GuestSession } from './guest'
import { guestPort, hostPort, testMatch } from './harness'
import { HostSession } from './host'
import { memoryPair } from './link'
import { defaultLobby, normalizeLobby, startProblem } from './lobby'
import type { LobbyState } from './protocol'
import { encode, GUEST_ID, HOST_ID, MAX_FROM_GUEST, parseMessage, PROTOCOL_VERSION } from './protocol'

let tokenN = 0
function setup(opts: { silence_ms?: number; match?: (l: LobbyState) => MatchState } = {}) {
  const hp = hostPort()
  const host = new HostSession({
    port: hp.port,
    newToken: () => `tok-${++tokenN}`,
    silence_ms: opts.silence_ms,
    startMatch: (l) => {
      const m = opts.match ? opts.match(l) : testMatch(l)
      hp.set(m)
      return m
    },
  })
  const gp = guestPort()
  const guest = new GuestSession({ port: gp.port, ping_ms: 5000, silence_ms: opts.silence_ms })
  const connect = (g: GuestSession = guest) => {
    const pair = memoryPair()
    host.accept(pair.a)
    g.attach(pair.b)
    return pair
  }
  return { hp, host, gp, guest, connect }
}

function ready(opts?: Parameters<typeof setup>[0]) {
  const s = setup(opts)
  s.connect()
  s.guest.setPrefs({ ready: true })
  expect(s.host.start()).toBeNull()
  return s
}

const END: Command = { type: 'endPhase' }
const PASS: Command = { type: 'passReaction' }
const hostCmd = (s: ReturnType<typeof setup>, c: Command) => s.hp.port.submit(nextEnvelope(s.hp.port.get()!, HOST_ID, c), { silent: false })
const json = (m: MatchState | null) => JSON.stringify(m?.state)

/** Play until it is the guest's turn to decide; returns the number of host actions taken. */
function toGuestTurn(s: ReturnType<typeof setup>) {
  for (let i = 0; i < 40; i++) {
    const m = s.hp.port.get()!
    const side = m.assignments[Object.keys(m.assignments).find((k) => m.assignments[k as PlayerId].playerId === GUEST_ID) as PlayerId]
    if (m.state.reaction) {
      // a reaction window: whoever it waits for passes
      if (decider(m) === HOST_ID) hostCmd(s, PASS)
      else s.guest.sendCommand(nextEnvelope(s.gp.port.get()!, GUEST_ID, PASS))
      continue
    }
    if (side.playerId === GUEST_ID && decider(m) === GUEST_ID) return
    if (decider(m) === HOST_ID) hostCmd(s, END)
    else break
  }
}
const decider = (m: MatchState) => m.assignments[(m.state.reaction?.player ?? m.state.fight?.selecting ?? m.state.activePlayer) as PlayerId].playerId

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

// ---------------------------------------------------------------- protocol

describe('protocol', () => {
  it('round-trips valid messages and rejects garbage, oversize and wrong-direction messages', () => {
    const hello = encode({ type: 'hello', v: PROTOCOL_VERSION, token: 'x' })
    expect(parseMessage(hello, true)).toEqual({ type: 'hello', v: 1, token: 'x' })
    expect(parseMessage(hello, false)).toBeNull() // host never receives... and a guest never receives hello
    expect(parseMessage('not json', true)).toBeNull()
    expect(parseMessage('{"type":"nope"}', true)).toBeNull()
    expect(parseMessage(42, true)).toBeNull()
    expect(parseMessage(JSON.stringify({ type: 'ping', n: 1, pad: 'x'.repeat(MAX_FROM_GUEST) }), true)).toBeNull()
    expect(parseMessage('{"type":"start","save":"x"}', true)).toBeNull() // guest may not send host messages
    expect(parseMessage('{"type":"prefs","side":"hackers"}', true)).toBeNull()
    expect(parseMessage('{"type":"command","envelope":{"gameId":"g","playerId":"guest","sequence":0,"expectedStateVersion":0,"commandId":"c","command":{"type":"x"}}}', true)).toBeNull()
  })
})

describe('lobby rules', () => {
  it('keeps factions distinct and scenario valid; start needs a ready guest', () => {
    const l = normalizeLobby({ ...defaultLobby(), hostSide: 'necrons', guestSide: 'necrons', scenarioId: 'nope' })
    expect(l.guestSide).not.toBe('necrons')
    expect(startProblem(l)).toMatch(/второго игрока/)
    expect(startProblem({ ...l, guestConnected: true })).toMatch(/не готов/)
    expect(startProblem({ ...l, guestConnected: true, guestReady: true })).toBeNull()
  })
})

// ---------------------------------------------------------------- join / lobby

describe('room joining', () => {
  it('guest joins, receives the lobby, picks a faction and readiness; the host controls the configuration', () => {
    const s = setup()
    s.connect()
    expect(s.guest.state).toMatchObject({ link: 'connected', playing: false, token: 'tok-' + tokenN })
    expect(s.host.state).toMatchObject({ guest: 'connected', lobby: { guestConnected: true, guestReady: false } })
    s.guest.setPrefs({ side: 'necrons' })
    expect(s.host.state.lobby.guestSide).toBe('necrons')
    expect(s.guest.state.lobby?.guestSide).toBe('necrons')
    s.guest.setPrefs({ ready: true })
    expect(s.guest.state.lobby?.guestReady).toBe(true)
    s.host.setConfig({ hostSide: 'tyranids' }) // changing the setup resets readiness
    expect(s.guest.state.lobby).toMatchObject({ hostSide: 'tyranids', guestReady: false })
    expect(s.host.start()).toMatch(/не готов/)
  })
  it('refuses to start until ready, and refuses a guest taking the host faction', () => {
    const s = setup()
    s.connect()
    s.host.setConfig({ hostSide: 'marines' })
    s.guest.setPrefs({ side: 'marines' })
    expect(s.host.state.lobby.guestSide).not.toBe('marines')
    expect(s.host.start()).not.toBeNull()
  })
  it('rejects a third connection while the room is full, and a wrong protocol version', () => {
    const s = setup()
    s.connect()
    const third = new GuestSession({ port: guestPort().port })
    s.connect(third)
    expect(third.state).toMatchObject({ link: 'refused', refusal: 'room-full' })
    expect(s.guest.state.link).toBe('connected')
    const pair = memoryPair()
    s.host.accept(pair.a)
    const replies: string[] = []
    pair.b.onMessage = (d) => replies.push(String(d))
    pair.b.send(encode({ type: 'hello', v: 99 }))
    expect(replies[0]).toContain('version')
  })
  it('ignores everything but hello from an unknown connection', () => {
    const s = setup()
    const pair = memoryPair()
    s.host.accept(pair.a)
    pair.b.send(encode({ type: 'prefs', side: 'orks' }))
    pair.b.send(encode({ type: 'command', envelope: { gameId: 'g', playerId: HOST_ID, sequence: 1, expectedStateVersion: 0, commandId: 'x', command: END } }))
    expect(s.host.state.guest).toBe('absent')
  })
  it('frees the lobby slot when the guest leaves', () => {
    const s = setup()
    s.connect()
    s.guest.leave()
    expect(s.host.state).toMatchObject({ guest: 'absent', lobby: { guestConnected: false } })
    const again = new GuestSession({ port: guestPort().port })
    s.connect(again)
    expect(again.state.link).toBe('connected')
  })
})

// ---------------------------------------------------------------- the match

describe('host-authoritative match', () => {
  it('start sends the same match to both; each seat belongs to exactly one participant', () => {
    const s = ready()
    s.host.setConfig({}) // no-op once playing
    const h = s.hp.port.get()!
    const g = s.gp.port.get()!
    expect(s.guest.state.playing).toBe(true)
    expect(g.mode).toBe('shared')
    expect(json(g)).toBe(json(h))
    expect(Object.values(h.assignments).map((c) => c.playerId).sort()).toEqual([GUEST_ID, HOST_ID])
    expect(Object.values(g.assignments).filter((c) => c.type === 'local').map((c) => c.playerId)).toEqual([GUEST_ID])
    expect(s.gp.log.side).toBe(s.host.state.lobby.guestSide)
  })

  it('works for any faction pair', () => {
    for (const [a, b] of [['tyranids', 'necrons'], ['aeldari', 'marines'], ['orks', 'aeldari']] as [PlayerId, PlayerId][]) {
      const s = setup()
      s.connect()
      s.host.setConfig({ hostSide: a, scenarioId: 'combat-patrol' })
      s.guest.setPrefs({ side: b })
      s.guest.setPrefs({ ready: true })
      expect(s.host.start()).toBeNull()
      expect(s.gp.log.side).toBe(b)
      expect(json(s.gp.port.get())).toBe(json(s.hp.port.get()))
    }
  })

  it("host actions reach the guest as accepted actions with the dice the host rolled; states stay identical", () => {
    const s = ready()
    let rolled: ActionRecord | undefined
    for (let i = 0; i < 60 && !rolled; i++) {
      const m = s.hp.port.get()!
      if (decider(m) !== HOST_ID) break
      const r = hostCmd(s, END)
      if (r.ok && r.action.dice) rolled = r.action
      expect(json(s.gp.port.get())).toBe(json(s.hp.port.get()))
    }
    const g = s.gp.port.get()!
    expect(g.version).toBe(s.hp.port.get()!.version)
    expect(g.history).toEqual(s.hp.port.get()!.history)
    expect(g.state.rng).toBe(s.hp.port.get()!.state.rng)
    expect(g.state.diceLog).toEqual(s.hp.port.get()!.state.diceLog)
  })

  it('guest command: not applied locally, applied by the host, then mirrored', () => {
    const s = ready()
    toGuestTurn(s)
    const g0 = s.gp.port.get()!
    expect(decider(g0)).toBe(GUEST_ID)
    const env = nextEnvelope(g0, GUEST_ID, END)
    expect(s.guest.sendCommand(env)).toBe(true)
    // synchronous mock link: the answer has already arrived
    expect(s.hp.port.get()!.version).toBe(g0.version + 1)
    expect(s.gp.port.get()!.version).toBe(g0.version + 1)
    expect(s.guest.state.pending).toBeNull()
    expect(json(s.gp.port.get())).toBe(json(s.hp.port.get()))
  })

  it('does not apply an unconfirmed guest command: until the host answers, the guest state is unchanged', () => {
    const s = ready()
    toGuestTurn(s)
    const g0 = s.gp.port.get()!
    const silent = memoryPair()
    silent.a.onMessage = null // nobody listens on the host end
    const lone = new GuestSession({ port: s.gp.port })
    lone.attach(silent.b)
    silent.b.onMessage?.(encode({ type: 'welcome', token: 't', playerId: GUEST_ID, lobby: s.host.state.lobby, playing: true }))
    lone.sendCommand(nextEnvelope(g0, GUEST_ID, END))
    expect(s.gp.port.get()).toBe(g0)
    expect(s.hp.port.get()!.version).toBe(g0.version)
  })

  it('rejects a guest command while it is the host turn (ownership at the engine boundary), without changing state', () => {
    const s = ready()
    const m = s.hp.port.get()!
    expect(decider(m)).toBe(HOST_ID)
    const before = json(m)
    const env = nextEnvelope(m, GUEST_ID, END)
    s.guest.sendCommand(env)
    expect(json(s.hp.port.get())).toBe(before)
    expect(s.hp.port.get()!.version).toBe(m.version)
    expect(s.gp.log.notes.at(-1)).toMatch(/другой игрок/)
    expect(s.guest.state.pending).toBeNull()
  })

  it("rejects commands that use the other side's units (move, shoot), by ownership, without touching state", () => {
    const s = ready()
    toGuestTurn(s)
    const g = s.gp.port.get()!
    const enemy = g.state.units.find((u) => u.owner !== s.gp.log.side)!
    const own = g.state.units.find((u) => u.owner === s.gp.log.side)!
    const v = g.version
    const before = json(s.hp.port.get())
    const attempts: Command[] = [
      { type: 'move', unitId: enemy.id, mode: 'normal', positions: Object.fromEntries(enemy.models.map((m) => [m.id, { x: m.pos.x + 1, y: m.pos.y }])) },
      { type: 'shoot', unitId: enemy.id, targetId: own.id },
      { type: 'declareAdvance', unitId: enemy.id },
      { type: 'declareCharge', unitId: enemy.id },
    ]
    for (const cmd of attempts) {
      s.gp.log.notes.length = 0
      s.guest.sendCommand(nextEnvelope(s.gp.port.get()!, GUEST_ID, cmd))
      expect(s.gp.log.notes).toHaveLength(1)
      expect(s.gp.log.notes[0]).not.toMatch(/другой игрок/) // it is the guest's turn: the refusal comes from the engine's ownership rule
      expect(s.hp.port.get()!.version).toBe(v)
      expect(json(s.hp.port.get())).toBe(before)
    }
  })

  it('dice rolled by the host reach the guest identically: records, dice log and RNG', () => {
    const shooting = (l: LobbyState) => createMatch(bare('shooting', l.hostSide), sharedAssignments(l.hostSide, l.guestSide), { gameId: 'g-test', mode: 'shared' })
    const s = setup({ match: shooting })
    s.connect()
    s.host.setConfig({ hostSide: 'marines', scenarioId: 'training-outpost' })
    s.guest.setPrefs({ side: 'orks' })
    s.guest.setPrefs({ ready: true })
    expect(s.host.start()).toBeNull()
    const hm = () => s.hp.port.get()!
    const gm = () => s.gp.port.get()!
    // host shoots
    const r1 = hostCmd(s, { type: 'shoot', unitId: 'int', targetId: 'boyz' })
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    expect(r1.action.dice?.rolls.length).toBeGreaterThan(0)
    expect(gm().history.at(-1)?.dice).toEqual(r1.action.dice)
    expect(gm().state.diceLog).toEqual(hm().state.diceLog)
    expect(gm().state.rng).toBe(hm().state.rng)
    expect(json(gm())).toBe(json(hm()))
  })

  it("dice rolled for a guest command are the host's: the guest's own shot comes back with the host's roll record", () => {
    const guestShoots = (l: LobbyState) => {
      const st = bare('shooting', l.guestSide)
      const int = st.units.find((u) => u.id === 'int')!
      const boyz = st.units.find((u) => u.id === 'boyz')!
      const at = int.models[0].pos
      boyz.models.forEach((m, i) => { m.pos = { x: at.x + 8, y: at.y + i * 1.5 } })
      return createMatch(st, sharedAssignments(l.hostSide, l.guestSide), { gameId: 'g-test', mode: 'shared' })
    }
    const s = setup({ match: guestShoots })
    s.connect()
    s.host.setConfig({ hostSide: 'marines', scenarioId: 'training-outpost' })
    s.guest.setPrefs({ side: 'orks' })
    s.guest.setPrefs({ ready: true })
    expect(s.host.start()).toBeNull()
    const hm = () => s.hp.port.get()!
    const gm = () => s.gp.port.get()!
    expect(decider(hm())).toBe(GUEST_ID)
    const logLen = hm().state.diceLog.length
    s.guest.sendCommand(nextEnvelope(gm(), GUEST_ID, { type: 'shoot', unitId: 'boyz', targetId: 'int' }))
    expect(s.gp.log.notes).toEqual([])
    expect(hm().version).toBe(1)
    const action = hm().history[0]
    expect(action.dice?.rolls.length).toBeGreaterThan(0)
    expect(hm().state.diceLog.length).toBeGreaterThan(logLen)
    expect(gm().history[0]).toEqual(action)
    expect(gm().state.diceLog).toEqual(hm().state.diceLog)
    expect(gm().state.rng).toBe(hm().state.rng)
    expect(gm().state.rng).toBe(action.dice!.rngAfter)
    expect(json(gm())).toBe(json(hm()))
  })

  it('binds identity to the connection: a guest claiming to be the host is rejected', () => {
    const s = ready()
    const pair = s.connect(new GuestSession({ port: guestPort().port, token: 'tok-' + tokenN })) // returning guest swaps in
    const m = s.hp.port.get()!
    const forged: CommandEnvelope = nextEnvelope(m, HOST_ID, END)
    const replies: string[] = []
    const orig = pair.b.onMessage
    pair.b.onMessage = (d) => { replies.push(String(d)); orig?.(d) }
    pair.b.send(encode({ type: 'command', envelope: forged }))
    expect(s.hp.port.get()!.version).toBe(m.version)
    expect(replies.some((r) => r.includes('"unauthorized"'))).toBe(true)
  })

  it('duplicates and stale versions are rejected without mutation', () => {
    const s = ready()
    toGuestTurn(s)
    const g = s.gp.port.get()!
    const env = nextEnvelope(g, GUEST_ID, END)
    s.guest.sendCommand(env)
    const v = s.hp.port.get()!.version
    // replay the very same envelope straight at the host
    const pair = memoryPair()
    s.host.accept(pair.a)
    const dupGuest = new GuestSession({ port: guestPort().port, token: 'tok-' + tokenN })
    dupGuest.attach(pair.b)
    const res = s.hp.port.submit(env, { silent: true })
    expect(res).toMatchObject({ ok: false, code: 'duplicate' })
    const stale = s.hp.port.submit({ ...nextEnvelope(s.hp.port.get()!, GUEST_ID, END), expectedStateVersion: 0 }, { silent: true })
    expect(stale).toMatchObject({ ok: false, code: 'stale-state' })
    expect(s.hp.port.get()!.version).toBe(v)
  })

  it('one command in flight: a second send before the answer is refused locally', () => {
    const s = ready()
    toGuestTurn(s)
    const g = s.gp.port.get()!
    const pair = memoryPair()
    const g2 = new GuestSession({ port: s.gp.port })
    pair.a.onMessage = null
    g2.attach(pair.b)
    // fake a welcome so the session is "connected" but the host never answers
    pair.b.onMessage?.(encode({ type: 'welcome', token: 't', playerId: GUEST_ID, lobby: s.host.state.lobby, playing: true }))
    expect(g2.sendCommand(nextEnvelope(g, GUEST_ID, END))).toBe(true)
    expect(g2.sendCommand(nextEnvelope(g, GUEST_ID, END))).toBe(false)
    expect(s.gp.log.notes.at(-1)).toMatch(/Дождитесь/)
  })

  it('a long scripted game ends byte-identical on both sides', () => {
    const s = ready()
    for (let i = 0; i < 200 && !s.hp.port.get()!.state.winner; i++) {
      const m = s.hp.port.get()!
      const who = decider(m)
      const cmd: Command = m.state.reaction ? PASS : END
      if (who === HOST_ID) hostCmd(s, cmd)
      else s.guest.sendCommand(nextEnvelope(s.gp.port.get()!, GUEST_ID, cmd))
    }
    expect(s.hp.port.get()!.version).toBeGreaterThan(20)
    expect(json(s.gp.port.get())).toBe(json(s.hp.port.get()))
    expect(s.gp.port.get()!.history).toEqual(s.hp.port.get()!.history)
  })
})

// ---------------------------------------------------------------- sync

describe('synchronisation safety', () => {
  it('a gap, a dice mismatch or a wrong game asks for a resync instead of being applied', () => {
    const s = ready()
    hostCmd(s, END)
    const m = s.hp.port.get()!
    const prev = s.gp.port.get()!
    const a = m.history.at(-1)!
    expect(applyAccepted(prev, a)).toMatchObject({ kind: 'old' })
    expect(applyAccepted({ ...prev, version: prev.version - 1, history: prev.history.slice(0, -1) }, { ...a, stateVersion: a.stateVersion + 1 })).toMatchObject({ kind: 'resync' })
    expect(applyAccepted(prev, { ...a, gameId: 'other' })).toMatchObject({ kind: 'resync' })
    const base = createMatch(m.initial, m.assignments, { gameId: m.gameId, mode: 'shared' })
    const first = m.history[0]
    expect(applyAccepted(base, { ...first, dice: { rolls: [1, 2, 3], rngAfter: 1 } })).toMatchObject({ kind: 'resync', why: 'кубики не совпали' })
  })

  it('a desynced guest recovers through a host snapshot', () => {
    const s = ready()
    hostCmd(s, END)
    s.gp.port.install(createMatch(s.hp.port.get()!.initial, s.gp.port.get()!.assignments, { gameId: 'g-test', mode: 'shared' }), 'orks') // corrupt: guest forgets everything
    hostCmd(s, END) // guest sees a gap -> syncRequest -> snapshot
    expect(json(s.gp.port.get())).toBe(json(s.hp.port.get()))
    expect(s.gp.port.get()!.version).toBe(s.hp.port.get()!.version)
  })

  it('snapshots round-trip through the save format and keep RNG state', () => {
    const s = ready()
    hostCmd(s, END)
    const m = s.hp.port.get()!
    const r = matchFromSave(snapshotOf(m), GUEST_ID)
    expect(r.ok && r.match.state.rng).toBe(m.state.rng)
    expect(r.ok && r.match.version).toBe(m.version)
    expect(r.ok && viewAs(r.match, HOST_ID).assignments).toEqual(m.assignments)
    expect(matchFromSave('{}', GUEST_ID).ok).toBe(false)
    const training = JSON.parse(snapshotOf(m))
    training.match.mode = 'training'
    expect(matchFromSave(JSON.stringify(training), GUEST_ID).ok).toBe(false)
  })
})

// ---------------------------------------------------------------- connection lifecycle

describe('disconnect and reconnect', () => {
  it('guest drops: host keeps the match and marks the guest lost; the returning guest (token) gets a snapshot and resumes', () => {
    const s = ready()
    const gp = guestPort()
    const token = s.guest.state.token!
    const g = new GuestSession({ port: gp.port, token })
    const link = memoryPair()
    s.host.accept(link.a)
    g.attach(link.b) // the returning guest replaces the first connection
    expect(g.state).toMatchObject({ link: 'connected', playing: true })
    expect(s.guest.state.link).toBe('lost')
    link.b.close()
    expect(s.host.state).toMatchObject({ guest: 'lost', playing: true })
    hostCmd(s, END) // the match goes on while the guest is away
    const g2 = new GuestSession({ port: gp.port, token })
    s.connect(g2)
    expect(g2.state).toMatchObject({ link: 'connected', playing: true })
    expect(json(gp.port.get())).toBe(json(s.hp.port.get()))
    expect(gp.port.get()!.version).toBe(s.hp.port.get()!.version)
  })

  it('a stranger cannot take over a started game, a wrong token is refused', () => {
    const s = ready()
    const stranger = new GuestSession({ port: guestPort().port })
    s.connect(stranger)
    expect(stranger.state).toMatchObject({ link: 'refused', refusal: 'game-started' })
    const thief = new GuestSession({ port: guestPort().port, token: 'guess' })
    s.connect(thief)
    expect(thief.state).toMatchObject({ link: 'refused', refusal: 'bad-token' })
    expect(s.host.state.guest).toBe('connected')
  })

  it('silence is detected on both sides (dead peer without a close event)', () => {
    const s = setup({ silence_ms: 12_000 })
    const lost = vi.fn()
    const g = new GuestSession({ port: guestPort().port, ping_ms: 5000, silence_ms: 12_000, onLost: lost })
    const pair = memoryPair()
    s.host.accept(pair.a)
    g.attach(pair.b)
    expect(g.state.link).toBe('connected')
    pair.cut()
    vi.advanceTimersByTime(30_000)
    expect(lost).toHaveBeenCalled()
    expect(g.state.link).toBe('lost')
    expect(s.host.state.guest).toBe('absent')
  })

  it('guest sees the host leave', () => {
    const s = setup()
    const lost = vi.fn()
    const g = new GuestSession({ port: guestPort().port, onLost: lost })
    s.connect(g)
    s.host.close()
    expect(g.state.link).toBe('lost')
    expect(lost).toHaveBeenCalled()
  })

  it('a restored host (resume with the saved token and match) accepts the returning guest and sends the state', () => {
    const s = ready()
    hostCmd(s, END)
    const saved = s.hp.port.get()!
    const token = s.guest.state.token!
    s.host.close()

    const hp2 = hostPort()
    hp2.set(saved)
    const host2 = new HostSession({ port: hp2.port, newToken: () => 'new', startMatch: () => saved })
    host2.resume(saved, token)
    const gp = guestPort()
    const g = new GuestSession({ port: gp.port, token })
    const pair = memoryPair()
    host2.accept(pair.a)
    g.attach(pair.b)
    expect(g.state).toMatchObject({ link: 'connected', playing: true })
    expect(json(gp.port.get())).toBe(json(saved))
    host2.close()
  })

  it('a guest command is rejected once the host is gone for good (no authoritative moves without the host)', () => {
    const s = ready()
    toGuestTurn(s)
    const m = s.gp.port.get()!
    s.host.close()
    expect(s.guest.sendCommand(nextEnvelope(m, GUEST_ID, END))).toBe(false)
    expect(s.gp.port.get()).toBe(m)
  })
})
