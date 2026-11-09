import { afterAll, describe, expect, it } from 'vitest'
import { aiProposal, createMatch, replay, submit } from '../match/match'
import { seats, unitsOf } from '../gameState'
import { seededRoller } from '../dice/dice'
import { startGame } from '../engine'
import { deserialize, serialize } from '../persistence'
import { scenarioById } from '../scenarios/scenarios'
import { FACTIONS, type GameState, type PlayerId } from '../types'

// Complete AI-vs-AI battles through the real match pipeline for every pair of the five armies:
// legal commands only, a finished battle, casualties, objective control, a full turn for both sides.

const LEVEL = 'beginner' as const
const PAIRS: [PlayerId, PlayerId][] = FACTIONS.flatMap((a, i) => FACTIONS.slice(i + 1).map((b): [PlayerId, PlayerId] => [a, b]))

interface Stats { games: number; shots: number; fights: number; modelsLost: number; vp: number; turns: number }
const stats = Object.fromEntries(FACTIONS.map((f) => [f, { games: 0, shots: 0, fights: 0, modelsLost: 0, vp: 0, turns: 0 } as Stats])) as Record<PlayerId, Stats>

const models = (s: GameState, f: PlayerId) => s.units.filter((u) => u.owner === f).reduce((n, u) => n + u.models.filter((m) => !m.destroyed).length, 0)

function play(a: PlayerId, b: PlayerId, seed: number, level: 'beginner' | 'standard' = LEVEL) {
  const initial = startGame(scenarioById('combat-patrol').build([a, b]), seededRoller(seed))
  const assignments = seats(a, { type: 'ai' as const, playerId: `ai-${a}` }, b, { type: 'ai' as const, playerId: `ai-${b}` })
  let m = createMatch(initial, assignments, { gameId: `sim-${a}-${b}-${seed}` })
  const turns = new Set<string>()
  for (let i = 0; !m.state.winner; i++) {
    expect(i, 'action cap').toBeLessThan(2000)
    const p = aiProposal(m, level)
    expect(p, 'AI always has a decision').not.toBeNull()
    const r = submit(m, p!.envelope)
    if (!r.ok) throw new Error(`${a} vs ${b}: ${r.code}: ${r.reason} ${JSON.stringify(p!.envelope.command).slice(0, 160)}`)
    turns.add(`${m.state.round}${m.state.activePlayer}`)
    m = r.match
  }
  return { initial, m, turns: turns.size }
}

describe('AI-vs-AI battles, all ten pairings (seed 1)', () => {
  it.each(PAIRS)('%s vs %s: a complete battle', (a, b) => {
    const { initial, m, turns } = play(a, b, 1)
    const s = m.state
    expect(s.winner).not.toBeNull()
    expect(turns).toBeGreaterThanOrEqual(2) // both players completed at least one turn
    // legal attacks happened and dice were rolled
    const cmds = m.history.map((h) => h.command.type)
    expect(cmds).toContain('shoot')
    expect(m.history.some((h) => h.dice)).toBe(true)
    for (const f of [a, b]) {
      const lost = initial.units.filter((u) => u.owner === f).reduce((n, u) => n + u.models.length, 0) - models(s, f)
      stats[f].games++
      stats[f].modelsLost += lost
      stats[f].vp += s.players[f].vp
      stats[f].shots += m.history.filter((h) => h.side === f && h.command.type === 'shoot').length
      stats[f].fights += m.history.filter((h) => h.side === f && h.command.type === 'fight').length
      stats[f].turns += m.history.filter((h) => h.side === f && h.command.type === 'endPhase').length
    }
    // objective control: the VP rule only pays for controlled objectives (round 2+) or the battle ended by annihilation
    const vp = s.players[a].vp + s.players[b].vp
    expect(vp > 0 || unitsOf(s, a).length === 0 || unitsOf(s, b).length === 0).toBe(true)
  })

  // the tactical ('standard') AI is the one players face: one battle per new army against the Space Marines
  it.each([['marines', 'tyranids'], ['marines', 'necrons'], ['marines', 'aeldari']] as [PlayerId, PlayerId][])('%s vs %s with the standard AI finishes with legal commands only', (a, b) => {
    const { m } = play(a, b, 2, 'standard')
    expect(m.state.winner).not.toBeNull()
    expect(m.history.length).toBeGreaterThan(20)
  })

  it('is deterministic: same seed, same battle (replay from the serialised history reproduces the final state)', () => {
    const { m } = play('necrons', 'aeldari', 1)
    const file = deserialize(serialize(m.state, undefined, new Date(0), m))
    expect(file.ok).toBe(true)
    if (!file.ok) return
    const r = replay(file.file.match, file.file.match.history)
    expect(r.ok).toBe(true)
    if (r.ok) expect(JSON.stringify(r.match.state)).toBe(JSON.stringify(m.state))
    expect(file.file.state.sides).toEqual(['necrons', 'aeldari']) // non-default sides survive the save format
  })

  afterAll(() => {
    // every army, across its four battles, fired, fought, took casualties and scored from objectives
    for (const f of FACTIONS) {
      expect(stats[f].games, f).toBe(4)
      expect(stats[f].shots + stats[f].fights, `${f} attacked`).toBeGreaterThan(0)
      expect(stats[f].modelsLost, `${f} took casualties`).toBeGreaterThan(0)
      expect(stats[f].vp, `${f} controlled objectives`).toBeGreaterThan(0)
      expect(stats[f].turns, `${f} played turns`).toBeGreaterThan(4)
    }
  })
}, 600000)
