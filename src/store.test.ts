import { beforeEach, describe, expect, it } from 'vitest'
import { seats } from './game/gameState'
import { createMatch, nextEnvelope, soloAssignments } from './game/match/match'
import { AUTOSAVE_KEY, useStore } from './store'
import type { Command, GameState } from './game/types'

const st = () => useStore.getState()
const MOVE: Command = { type: 'move', unitId: 'lt', mode: 'normal', positions: { 'lt-0': { x: 2.5, y: 16.5 } } }

/** Fresh game, then force a phase/player the way the other UI tests do. */
function setup(phase: GameState['phase'], active: GameState['activePlayer']) {
  localStorage.clear()
  useStore.setState({ game: null, match: null, history: [], message: null, deploying: null, review: null })
  st().newGame({ human: 'marines', tutorial: false })
  useStore.setState({ game: { ...st().game!, activePlayer: active, phase } })
}

describe('store as orchestration over the match layer', () => {
  beforeEach(() => setup('movement', 'marines'))

  it('a started battle has a match whose state is the published game, and autosaves it with its id', () => {
    setup('command', 'marines')
    useStore.setState({ game: null })
    st().newGame({ human: 'marines', tutorial: false })
    const { match, game } = st()
    expect(match).toMatchObject({ mode: 'training', version: 0 })
    expect(match!.state).toBe(game)
    expect(match!.assignments.marines.type).toBe('local')
    expect(match!.assignments.orks.type).toBe('ai')
    expect(JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!).match.gameId).toBe(match!.gameId)
  })

  it('dispatch wraps the command in an envelope and records an accepted action', () => {
    expect(st().dispatch(MOVE)).toBe(true)
    const m = st().match!
    expect(m.version).toBe(1)
    expect(m.history[0]).toMatchObject({ playerId: 'local', sequence: 1, stateVersion: 1, side: 'marines', command: MOVE })
    expect(m.state).toBe(st().game)
    expect(st().history).toHaveLength(1)
  })

  it('single-player undo restores the whole match (version, counters, history) so the next command still works', () => {
    st().dispatch(MOVE)
    st().undo()
    const m = st().match!
    expect(m).toMatchObject({ version: 0, lastSequence: {}, history: [] })
    expect(st().game).toBe(m.state)
    expect(st().dispatch(MOVE)).toBe(true)
    expect(st().match!.history.map((a) => a.actionId)).toEqual(['local#1'])
  })

  it('refuses a local command while the AI side holds the decision, without changing state', () => {
    useStore.setState({ game: { ...st().game!, activePlayer: 'orks' } })
    const before = st().game
    expect(st().dispatch({ type: 'endPhase' })).toBe(false)
    expect(st().game).toBe(before)
    expect(st().message?.kind).toBe('error')
  })

  it('AI moves enter through the same pipeline as its own participant', () => {
    useStore.setState({ game: { ...st().game!, activePlayer: 'orks' } })
    expect(st().aiStep()).toBe(true)
    expect(st().match!.history.at(-1)).toMatchObject({ playerId: 'ai-orks', side: 'orks' })
    expect(st().history).toEqual([])
    // and the AI never acts for the human side
    useStore.setState({ game: { ...st().game!, activePlayer: 'marines', phase: 'movement' } })
    expect(st().aiStep()).toBe(false)
  })

  it('submit rejects stale and duplicate envelopes from outside and leaves the published game alone', () => {
    const old = nextEnvelope(st().match!, 'local', MOVE)
    expect(st().submit(old).ok).toBe(true)
    const after = st().game
    expect(st().submit(old)).toMatchObject({ ok: false, code: 'duplicate' })
    expect(st().submit({ ...nextEnvelope(st().match!, 'local', { type: 'endPhase' }), expectedStateVersion: 0 })).toMatchObject({ ok: false, code: 'stale-state' })
    expect(st().game).toBe(after)
    expect(st().match!.version).toBe(1)
  })

  it('a shared match keeps accepted actions immutable: no undo snapshots, undo refused', () => {
    const g = st().game!
    useStore.setState({ match: createMatch(g, soloAssignments('marines'), { gameId: 'shared-1', mode: 'shared' }) })
    expect(st().dispatch(MOVE)).toBe(true)
    expect(st().history).toEqual([])
    // even a forged snapshot cannot roll a shared match back
    useStore.setState({ history: [createMatch(g, soloAssignments('marines'), { gameId: 'shared-1', mode: 'shared' })] })
    const now = st().game
    st().undo()
    expect(st().game).toBe(now)
    expect(st().match!.version).toBe(1)
    expect(st().message?.kind).toBe('error')
  })

  it('a shared match cannot be swapped or downgraded by replacing `game` from outside', () => {
    const g = st().game!
    useStore.setState({ match: createMatch({ ...g, players: { ...g.players, orks: { ...g.players.orks, cp: 0 } } }, seats('marines', { type: 'local', playerId: 'me' }, 'orks', { type: 'remote', playerId: 'peer-1' }), { gameId: 'shared-2', mode: 'shared' }) })
    useStore.setState({ game: { ...g, phase: 'charge' } }) // outside interference
    const r = st().submit(nextEnvelope(st().match!, 'me', { type: 'endPhase' }))
    expect(r.ok).toBe(true)
    expect(st().match).toMatchObject({ mode: 'shared', gameId: 'shared-2', version: 1 })
    expect(st().match!.assignments.orks).toEqual({ type: 'remote', playerId: 'peer-1' })
    expect(st().game!.phase).toBe('shooting') // derived from match.state (movement), not from the swapped game
    expect(st().history).toEqual([])
  })

  it('load restores the match block (history and counters) from an autosave', () => {
    st().dispatch(MOVE)
    const saved = st().match!
    useStore.setState({ game: null, match: null })
    expect(st().load(AUTOSAVE_KEY)).toBe(true)
    expect(st().match).toMatchObject({ gameId: saved.gameId, version: 1, lastSequence: { local: 1 } })
    expect(st().match!.history).toEqual(saved.history)
    expect(st().match!.state).toBe(st().game)
    expect(st().dispatch({ type: 'endPhase' })).toBe(true) // sequence continues at 2
  })
})
