// PeerJS adapter: the only file that talks to PeerJS. Loaded lazily so single-player never pays for it.
// Signaling server and ICE servers are configuration (Vite env), not code; see docs/multiplayer.md.

import type { DataConnection, Peer } from 'peerjs'
import type { Link } from './link'

export type PeerFailure = 'unavailable-id' | 'peer-unavailable' | 'network' | 'timeout' | 'other'

export class PeerFailureError extends Error {
  readonly kind: PeerFailure
  constructor(kind: PeerFailure, detail?: string) {
    super(detail ?? kind)
    this.kind = kind
  }
}

/** Handle the session layer uses; `fakePeer` implements the same shape in tests. */
export interface PeerHandle {
  readonly id: string
  /** a remote peer connected to us (its data channel is open) */
  onConnection(cb: (link: Link) => void): void
  /** open a data channel to `remoteId` */
  connect(remoteId: string): Promise<Link>
  /** signaling server connection lost / restored (existing data channels keep working while it is down) */
  onSignaling(cb: (up: boolean) => void): void
  destroy(): void
}

/** Optional self-hosted PeerServer / TURN, from Vite env. Unset = PeerJS Cloud (0.peerjs.com) with PeerJS's default STUN/TURN. */
export function peerOptions(env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>) {
  const o: Record<string, unknown> = {}
  if (env.VITE_PEER_HOST) o.host = env.VITE_PEER_HOST
  if (env.VITE_PEER_PORT) o.port = Number(env.VITE_PEER_PORT)
  if (env.VITE_PEER_PATH) o.path = env.VITE_PEER_PATH
  if (env.VITE_PEER_SECURE) o.secure = env.VITE_PEER_SECURE !== 'false'
  if (env.VITE_PEER_ICE_SERVERS) {
    try {
      o.config = { iceServers: JSON.parse(env.VITE_PEER_ICE_SERVERS) }
    } catch {
      /* invalid JSON: keep PeerJS defaults */
    }
  }
  return o
}

const OPEN_TIMEOUT_MS = 15_000

function linkOf(conn: DataConnection): Link {
  const link: Link = {
    onMessage: null,
    onClose: null,
    send: (d) => void conn.send(d),
    close: () => conn.close(),
  }
  conn.on('data', (d) => link.onMessage?.(d))
  conn.on('close', () => link.onClose?.())
  conn.on('error', () => link.onClose?.())
  return link
}

function kindOf(type: string): PeerFailure {
  if (type === 'unavailable-id') return 'unavailable-id'
  if (type === 'peer-unavailable') return 'peer-unavailable'
  if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') return 'network'
  return 'other'
}

/** Register with the signaling server (`id` undefined = random id). Rejects with a `PeerFailureError`. */
export async function openPeer(id?: string): Promise<PeerHandle> {
  const { Peer: PeerCtor } = await import('peerjs')
  const peer: Peer = id ? new PeerCtor(id, peerOptions()) : new PeerCtor(peerOptions())
  const connectionCbs: ((l: Link) => void)[] = []
  const signalingCbs: ((up: boolean) => void)[] = []
  let failConnect: ((e: PeerFailureError) => void) | null = null
  let retry: ReturnType<typeof setTimeout> | null = null

  await new Promise<void>((resolve, reject) => {
    peer.once('open', () => resolve())
    peer.once('error', (e) => reject(new PeerFailureError(kindOf(e.type), e.message)))
  })

  peer.on('error', (e) => failConnect?.(new PeerFailureError(kindOf(e.type), e.message)))
  peer.on('connection', (conn) => {
    const link = linkOf(conn)
    conn.on('open', () => connectionCbs.forEach((cb) => cb(link)))
  })
  // the signaling socket dropped: keep trying to get it back (new peers cannot find us meanwhile)
  const restore = () => {
    if (peer.destroyed || !peer.disconnected) return
    peer.reconnect()
    retry = setTimeout(restore, 4000)
  }
  peer.on('disconnected', () => {
    signalingCbs.forEach((cb) => cb(false))
    restore()
  })
  peer.on('open', () => {
    if (retry) clearTimeout(retry)
    signalingCbs.forEach((cb) => cb(true))
  })

  return {
    id: peer.id,
    onConnection: (cb) => connectionCbs.push(cb),
    onSignaling: (cb) => signalingCbs.push(cb),
    connect: (remoteId) =>
      new Promise<Link>((resolve, reject) => {
        const conn = peer.connect(remoteId, { reliable: true })
        const timer = setTimeout(() => done(new PeerFailureError('timeout')), OPEN_TIMEOUT_MS)
        const done = (e?: PeerFailureError) => {
          clearTimeout(timer)
          failConnect = null
          if (e) {
            conn.close()
            reject(e)
          } else resolve(linkOf(conn))
        }
        failConnect = done
        conn.on('open', () => done())
        conn.on('error', () => done(new PeerFailureError('other')))
      }),
    destroy: () => {
      if (retry) clearTimeout(retry)
      peer.destroy()
    },
  }
}
