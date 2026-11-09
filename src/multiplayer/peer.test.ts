// The PeerJS adapter against a hand-made fake of the `peerjs` module (no network, no WebRTC).

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (...a: unknown[]) => void
class Emitter {
  h = new Map<string, Handler[]>()
  on(e: string, f: Handler) { this.h.set(e, [...(this.h.get(e) ?? []), f]); return this }
  once(e: string, f: Handler) { const w: Handler = (...a) => { this.h.set(e, (this.h.get(e) ?? []).filter((x) => x !== w)); f(...a) }; return this.on(e, w) }
  emit(e: string, ...a: unknown[]) { (this.h.get(e) ?? []).slice().forEach((f) => f(...a)) }
}
class FakeConn extends Emitter {
  sent: unknown[] = []
  closed = false
  send(d: unknown) { this.sent.push(d) }
  close() { this.closed = true; this.emit('close') }
}
const instances: FakePeer[] = []
const last = () => instances.at(-1)!
class FakePeer extends Emitter {
  id: string
  destroyed = false
  disconnected = false
  reconnects = 0
  conns: FakeConn[] = []
  opts?: unknown
  constructor(a?: unknown, opts?: unknown) {
    super()
    this.opts = opts
    instances.push(this)
    this.id = typeof a === 'string' ? a : 'random-id'
    if (typeof a !== 'string') this.opts = a
    setTimeout(() => (FakePeer.fail ? this.emit('error', { type: FakePeer.fail, message: 'x' }) : this.emit('open', this.id)), 0)
  }
  static fail: string | null = null
  connect() { const c = new FakeConn(); this.conns.push(c); return c }
  reconnect() { this.reconnects++; this.disconnected = false; this.emit('open', this.id) }
  destroy() { this.destroyed = true }
}
vi.mock('peerjs', () => ({ Peer: FakePeer }))

const { openPeer, PeerFailureError, peerOptions } = await import('./peer')

beforeEach(() => { FakePeer.fail = null; vi.useRealTimers() })

describe('openPeer', () => {
  it('registers under the given id and hands incoming connections over once they are open', async () => {
    const h = await openPeer('wh40k-tt-ABCDEF')
    expect(h.id).toBe('wh40k-tt-ABCDEF')
    const got: unknown[] = []
    h.onConnection((l) => { l.onMessage = (d) => got.push(d) })
    const conn = new FakeConn()
    last().emit('connection', conn)
    conn.emit('data', 'ignored: not open yet') // no consumer yet, must not throw
    conn.emit('open')
    conn.emit('data', 'hello')
    expect(got).toEqual(['hello'])
  })

  it('maps signaling errors to typed failures', async () => {
    FakePeer.fail = 'unavailable-id'
    await expect(openPeer('x')).rejects.toMatchObject({ kind: 'unavailable-id' })
    FakePeer.fail = 'network'
    await expect(openPeer()).rejects.toMatchObject({ kind: 'network' })
  })

  it('connect resolves on open, rejects on peer-unavailable', async () => {
    const h = await openPeer()
    const p = h.connect('room')
    last().conns[0].emit('open')
    const link = await p
    link.send('x')
    expect(last().conns[0].sent).toEqual(['x'])
    let closed = 0
    link.onClose = () => closed++
    last().conns[0].emit('close')
    expect(closed).toBe(1)

    const bad = h.connect('missing')
    last().emit('error', { type: 'peer-unavailable', message: 'nope' })
    await expect(bad).rejects.toBeInstanceOf(PeerFailureError)
    await expect(bad).rejects.toMatchObject({ kind: 'peer-unavailable' })
  })

  it('connect times out when the channel never opens', async () => {
    const h = await openPeer()
    vi.useFakeTimers()
    const p = h.connect('room')
    const assertion = expect(p).rejects.toMatchObject({ kind: 'timeout' })
    await vi.advanceTimersByTimeAsync(16_000)
    await assertion
  })

  it('keeps trying to restore the signaling connection and reports it', async () => {
    const h = await openPeer('id')
    const ups: boolean[] = []
    h.onSignaling((up) => ups.push(up))
    last().disconnected = true
    last().emit('disconnected')
    expect(last().reconnects).toBe(1)
    expect(ups).toEqual([false, true])
    h.destroy()
    expect(last().destroyed).toBe(true)
  })
})

describe('peerOptions', () => {
  it('is empty by default (PeerJS Cloud) and reads a self-hosted server and ICE servers from env', () => {
    expect(peerOptions({})).toEqual({})
    expect(peerOptions({ VITE_PEER_HOST: 'peers.example.org', VITE_PEER_PORT: '9000', VITE_PEER_PATH: '/mp', VITE_PEER_SECURE: 'true', VITE_PEER_ICE_SERVERS: '[{"urls":"stun:s.example.org"}]' }))
      .toEqual({ host: 'peers.example.org', port: 9000, path: '/mp', secure: true, config: { iceServers: [{ urls: 'stun:s.example.org' }] } })
    expect(peerOptions({ VITE_PEER_ICE_SERVERS: 'not json' })).toEqual({})
  })
})
