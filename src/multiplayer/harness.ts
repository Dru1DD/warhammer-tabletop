// Test doubles shared by the multiplayer tests: a plain-object match port for each side and a deterministic battle.

import { seededRoller } from '../game/dice/dice'
import { startGame } from '../game/engine'
import { createMatch, submit } from '../game/match/match'
import type { MatchState } from '../game/match/types'
import { scenarioById } from '../game/scenarios/scenarios'
import type { PlayerId } from '../game/types'
import type { GuestPort } from './guest'
import type { MatchPort } from './host'
import type { LobbyState } from './protocol'
import { sharedAssignments } from './sync'

export function testMatch(l: Pick<LobbyState, 'scenarioId' | 'hostSide' | 'guestSide'>, seed = 7): MatchState {
  const sides: [PlayerId, PlayerId] = l.hostSide <= l.guestSide ? [l.hostSide, l.guestSide] : [l.guestSide, l.hostSide]
  const g = startGame(scenarioById(l.scenarioId).build(sides), seededRoller(seed))
  return createMatch(g, sharedAssignments(l.hostSide, l.guestSide), { gameId: 'g-test', mode: 'shared' })
}

export function hostPort() {
  let m: MatchState | null = null
  const subs = new Set<(m: MatchState | null) => void>()
  const set = (n: MatchState | null) => { m = n; subs.forEach((f) => f(m)) }
  const port: MatchPort = {
    get: () => m,
    submit: (env) => {
      const r = submit(m!, env)
      if (r.ok) set(r.match)
      return r
    },
    subscribe: (f) => { subs.add(f); return () => subs.delete(f) },
  }
  return { port, set }
}

export function guestPort() {
  let m: MatchState | null = null
  const log = { notes: [] as string[], installs: 0, side: null as PlayerId | null }
  const port: GuestPort = {
    get: () => m,
    install: (n, side) => { m = n; log.installs++; log.side = side },
    commit: (n) => { m = n },
    notify: (t) => log.notes.push(t),
  }
  return { port, log }
}

