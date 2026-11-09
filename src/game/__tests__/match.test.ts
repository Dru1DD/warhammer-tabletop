import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decide, type AiLevel } from '../ai/ai'
import { seededRoller } from '../dice/dice'
import { seats } from '../gameState'
import { apply, startGame } from '../engine'
import {
  aiProposal, controllerOf, createMatch, decidingSide, isLocallyUndoable, nextEnvelope, replay, soloAssignments, submit, undoTo,
} from '../match/match'
import type { CommandEnvelope, MatchState, PlayerAssignments } from '../match/types'
import { deserialize, serialize } from '../persistence'
import { SCENARIOS } from '../scenarios/scenarios'
import type { Command, GameState } from '../types'
import { bare, column, place } from './helpers'

const marinesTurn = (phase: 'command' | 'movement' | 'shooting' = 'movement', mode: 'training' | 'shared' = 'training') =>
  createMatch(bare(phase, 'marines'), soloAssignments('marines'), { gameId: 'g1', mode })
const orksTurn = () => createMatch(bare('movement', 'orks'), soloAssignments('marines'), { gameId: 'g1' })
const END: Command = { type: 'endPhase' }

function accept(m: MatchState, playerId: string, cmd: Command) {
  const r = submit(m, nextEnvelope(m, playerId, cmd))
  if (!r.ok) throw new Error(`${r.code}: ${r.reason}`)
  return r
}

describe('player ownership', () => {
  it('maps sides to controllers and follows the current decision', () => {
    const m = marinesTurn()
    expect(controllerOf(m)).toEqual({ type: 'local', playerId: 'local' })
    expect(controllerOf(orksTurn())).toEqual({ type: 'ai', playerId: 'ai-orks' })
  })
  it('in the fight phase the decision belongs to the selecting side, not the active player', () => {
    const s = bare('fight', 'marines')
    s.fight = { selecting: 'orks', step: 'rest' }
    const m = createMatch(s, soloAssignments('marines'), { gameId: 'g1' })
    expect(decidingSide(m)).toBe('orks')
    expect(controllerOf(m).type).toBe('ai')
  })
})

describe('command authorization (engine-side, not UI)', () => {
  it('rejects a sender who does not control the deciding side, without touching the match', () => {
    const m = marinesTurn()
    const before = JSON.stringify(m)
    for (const who of ['ai-orks', 'ai-marines', 'stranger']) {
      const r = submit(m, nextEnvelope(m, who, END))
      expect(r).toMatchObject({ ok: false, code: 'unauthorized' })
    }
    expect(JSON.stringify(m)).toBe(before)
    expect(submit(orksTurn(), nextEnvelope(orksTurn(), 'local', END))).toMatchObject({ ok: false, code: 'unauthorized' })
  })
  it('local and AI senders go through the same pipeline and rules', () => {
    expect(submit(marinesTurn(), nextEnvelope(marinesTurn(), 'local', END)).ok).toBe(true)
    const o = orksTurn()
    expect(submit(o, nextEnvelope(o, 'ai-orks', END)).ok).toBe(true)
  })
  it("a controller still cannot move the other side's unit", () => {
    const m = marinesTurn()
    const r = submit(m, nextEnvelope(m, 'local', { type: 'move', unitId: 'boyz', mode: 'normal', positions: {} }))
    expect(r).toMatchObject({ ok: false, code: 'illegal' })
  })
  it('passes the engine reason through verbatim', () => {
    const m = marinesTurn()
    const r = submit(m, nextEnvelope(m, 'local', { type: 'move', unitId: 'lt', mode: 'normal', positions: { 'lt-0': { x: 20, y: 11 } } }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('больше допустимых')
  })
})

describe('sequencing and state versions', () => {
  it('every accepted action bumps the version and is recorded without extra state', () => {
    const m0 = marinesTurn()
    const r1 = accept(m0, 'local', END)
    expect(r1.match.version).toBe(1)
    expect(r1.action).toMatchObject({
      actionId: 'local#1', gameId: 'g1', sequence: 1, stateVersion: 1, playerId: 'local', side: 'marines',
      turn: { round: 1, activePlayer: 'marines', phase: 'movement' }, command: END,
    })
    expect(Object.keys(r1.action).sort()).toEqual(['actionId', 'command', 'gameId', 'playerId', 'sequence', 'side', 'stateVersion', 'turn'])
    const r2 = accept(r1.match, 'local', END)
    expect(r2.match.version).toBe(2)
    expect(r2.match.history.map((a) => a.stateVersion)).toEqual([1, 2])
    // input match is never mutated
    expect(m0.version).toBe(0)
    expect(m0.history).toHaveLength(0)
    expect(m0.state.phase).toBe('movement')
  })
  it('rejects a duplicate command (same id, or an already used sequence number)', () => {
    const r1 = accept(marinesTurn(), 'local', END)
    const dup = nextEnvelope(marinesTurn(), 'local', END) // same commandId local#1
    expect(submit(r1.match, dup)).toMatchObject({ ok: false, code: 'duplicate' })
    expect(submit(r1.match, { ...dup, commandId: 'other-id', expectedStateVersion: 1 })).toMatchObject({ ok: false, code: 'duplicate' })
  })
  it('rejects commands out of sequence', () => {
    const m = marinesTurn()
    expect(submit(m, { ...nextEnvelope(m, 'local', END), sequence: 3, commandId: 'local#3' })).toMatchObject({ ok: false, code: 'bad-sequence' })
  })
  it('rejects commands based on an outdated (or future) state version', () => {
    const r1 = accept(marinesTurn(), 'local', END)
    const env = nextEnvelope(r1.match, 'local', END)
    expect(submit(r1.match, { ...env, expectedStateVersion: 0 })).toMatchObject({ ok: false, code: 'stale-state' })
    expect(submit(r1.match, { ...env, expectedStateVersion: 5 })).toMatchObject({ ok: false, code: 'stale-state' })
  })
  it('rejects a command for another game', () => {
    const m = marinesTurn()
    expect(submit(m, { ...nextEnvelope(m, 'local', END), gameId: 'other' })).toMatchObject({ ok: false, code: 'wrong-game' })
  })
  it('a rejection consumes nothing: the next valid command with the same sequence is accepted', () => {
    const m = marinesTurn()
    const good = nextEnvelope(m, 'local', END)
    for (const bad of [{ ...good, expectedStateVersion: 9 }, { ...good, sequence: 4 }, { ...good, gameId: 'x' }, nextEnvelope(m, 'ai-orks', END)])
      expect(submit(m, bad).ok).toBe(false)
    const r = submit(m, good)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.match.lastSequence).toEqual({ local: 1 })
  })
  it('malformed envelopes and hostile payloads are rejected, never thrown', () => {
    const m = marinesTurn()
    const good = nextEnvelope(m, 'local', END)
    const junk: unknown[] = [null, 'x', {}, { ...good, sequence: 0 }, { ...good, sequence: 1.5 }, { ...good, playerId: '' }, { ...good, command: null }, { ...good, command: {} }, { ...good, expectedStateVersion: -1 }]
    for (const j of junk) expect(submit(m, j as CommandEnvelope)).toMatchObject({ ok: false, code: 'malformed' })
    const noPositions = nextEnvelope(m, 'local', { type: 'move', unitId: 'lt', mode: 'normal' } as unknown as Command)
    expect(submit(m, noPositions)).toMatchObject({ ok: false, code: 'illegal' })
    expect(submit(m, nextEnvelope(m, 'local', { type: 'nope' } as unknown as Command)).ok).toBe(false)
    expect(submit(m, { ...good, playerId: '__proto__' })).toMatchObject({ ok: false, code: 'unauthorized' })
  })
})

describe('dice in action records', () => {
  it('records raw rolls and the resulting RNG state only when dice were rolled', () => {
    const s = bare('shooting', 'marines')
    place(s, 'int', column(10, 5, 5))
    place(s, 'boyz', column(20, 5, 6))
    const m = createMatch(s, soloAssignments('marines'), { gameId: 'g1' })
    const shot = accept(m, 'local', { type: 'shoot', unitId: 'int', targetId: 'boyz' })
    expect(shot.action.dice!.rolls.length).toBeGreaterThan(0)
    expect(shot.action.dice!.rolls.every((v) => v >= 1 && v <= 6)).toBe(true)
    expect(shot.action.dice!.rngAfter).toBe(shot.match.state.rng)
    // same command through the plain engine consumes the same dice
    expect(shot.match.state).toEqual(apply(s, { type: 'shoot', unitId: 'int', targetId: 'boyz' }, seededRoller(s.rng)))
    expect(accept(marinesTurn(), 'local', END).action.dice).toBeUndefined()
  })
})

// ---------------------------------------------------------------- AI + replay

const AI_VS_AI: PlayerAssignments = seats('marines', { type: 'ai', playerId: 'ai-marines' }, 'orks', { type: 'ai', playerId: 'ai-orks' })

function playThroughMatch(initial: GameState, level: AiLevel) {
  let m = createMatch(initial, AI_VS_AI, { gameId: 'ai-game' })
  for (let i = 0; !m.state.winner; i++) {
    if (i > 3000) throw new Error('action cap')
    const p = aiProposal(m, level)
    if (!p) throw new Error('no AI proposal')
    const r = submit(m, p.envelope)
    if (!r.ok) throw new Error(`${r.code}: ${r.reason}`)
    m = r.match
  }
  return m
}

function playDirect(initial: GameState, level: AiLevel) {
  let s = initial
  while (!s.winner) s = apply(s, decide(s, level)!.cmd, seededRoller(s.rng))
  return s
}

describe('AI compatibility and deterministic replay', () => {
  const initial = startGame(SCENARIOS[0].build(), seededRoller(2))
  const played = playThroughMatch(initial, 'beginner')

  it('an AI-vs-AI game through submit equals the direct apply loop (same dice, same final state)', () => {
    expect(played.state).toEqual(playDirect(initial, 'beginner'))
    expect(played.version).toBe(played.history.length)
    expect(new Set(played.history.map((a) => a.playerId))).toEqual(new Set(['ai-marines', 'ai-orks']))
  })

  it('AI proposals depend only on the state (testable without the pipeline) and only for AI-controlled sides', () => {
    const a = decide(initial, 'standard')
    expect(decide(initial, 'standard')).toEqual(a)
    const humanTurn = createMatch(bare('movement', 'marines'), soloAssignments('marines'), { gameId: 'g' })
    expect(aiProposal(humanTurn, 'standard')).toBeNull()
  })

  it('serialised history alone is enough to replay to an identical final state', () => {
    const file = deserialize(serialize(played.state, undefined, new Date(0), played))
    expect(file.ok).toBe(true)
    if (!file.ok) return
    const { match } = file.file
    expect(match.history).toHaveLength(played.history.length)
    const r = replay(match, match.history)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.match.state).toEqual(played.state)
    expect(JSON.stringify(r.match.state)).toBe(JSON.stringify(played.state))
    expect(r.match.version).toBe(played.version)
    expect(r.match.lastSequence).toEqual(played.lastSequence)
    expect(r.match.history).toEqual(played.history)
  })

  it('replay reports tampered history instead of throwing', () => {
    const tamperedDice = structuredClone([...played.history])
    const i = tamperedDice.findIndex((a) => a.dice)
    tamperedDice[i].dice!.rolls[0] = (tamperedDice[i].dice!.rolls[0] % 6) + 1
    expect(replay(played, tamperedDice)).toMatchObject({ ok: false, atIndex: i })
    const skipped = played.history.slice(1)
    expect(replay(played, skipped)).toMatchObject({ ok: false, atIndex: 0 })
    const forged = structuredClone([...played.history])
    forged[0].playerId = 'stranger'
    expect(replay(played, forged)).toMatchObject({ ok: false, atIndex: 0 })
  })
})

describe('undo policy', () => {
  const move: Command = { type: 'move', unitId: 'lt', mode: 'normal', positions: { 'lt-0': { x: 2.5, y: 16.5 } } }
  it('allows local undo for dice-free local actions in training mode only', () => {
    const t = accept(marinesTurn(), 'local', move)
    expect(isLocallyUndoable(t.action, t.match)).toBe(true)
    expect(undoTo(t.match, marinesTurn())).not.toBeNull()
    const sh = accept(marinesTurn('movement', 'shared'), 'local', move)
    expect(isLocallyUndoable(sh.action, sh.match)).toBe(false)
    expect(undoTo(sh.match, marinesTurn('movement', 'shared'))).toBeNull()
  })
  it('never offers undo for endPhase, dice, or foreign snapshots', () => {
    const e = accept(marinesTurn(), 'local', END)
    expect(isLocallyUndoable(e.action, e.match)).toBe(false)
    const s = bare('shooting', 'marines')
    place(s, 'int', column(10, 5, 5))
    place(s, 'boyz', column(20, 5, 6))
    const shot = accept(createMatch(s, soloAssignments('marines'), { gameId: 'g1' }), 'local', { type: 'shoot', unitId: 'int', targetId: 'boyz' })
    expect(isLocallyUndoable(shot.action, shot.match)).toBe(false)
    expect(undoTo(e.match, createMatch(bare(), soloAssignments('marines'), { gameId: 'other' }))).toBeNull()
  })
})

describe('architecture boundary', () => {
  // Read from disk on every run (a glob import would be served from Vitest's module cache).
  const root = join(import.meta.dirname, '..')
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) return f === '__tests__' || f === '__fixtures__' ? [] : walk(p)
      return f.endsWith('.ts') ? [p] : []
    })
  const sources = walk(root).map((f) => [f, readFileSync(f, 'utf8')] as const)

  it('src/game never imports UI, store or networking libraries', () => {
    expect(sources.length).toBeGreaterThan(10)
    for (const [file, code] of sources) {
      const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map((x) => x[1])
      for (const i of imports) expect(i, file).not.toMatch(/^(react|react-dom|zustand|konva|react-konva|peerjs|simple-peer)(\/|$)|\/store$|\/ui\//)
    }
  })
  it('the only networking dependency is peerjs, and only src/multiplayer/peer.ts imports it', () => {
    const pkg = JSON.parse(readFileSync(join(root, '..', '..', 'package.json'), 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.filter((d) => /peer|webrtc|socket/i.test(d))).toEqual(['peerjs'])
    const mp = join(root, '..', 'multiplayer')
    const importers = readdirSync(mp).filter((f) => /\.tsx?$/.test(f) && /from\s+'peerjs'|import\('peerjs'\)/.test(readFileSync(join(mp, f), 'utf8')))
    expect(importers).toEqual(['peer.ts'])
  })
  it('match layer has no clock or randomness', () => {
    const matchFiles = sources.filter(([f]) => f.includes('/match/'))
    expect(matchFiles.length).toBeGreaterThanOrEqual(3)
    for (const [f, code] of matchFiles) expect(code, f).not.toMatch(/Date\.now|new Date|Math\.random|crypto\.|performance\.now/)
  })
})
