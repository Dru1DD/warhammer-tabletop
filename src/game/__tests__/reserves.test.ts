import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { seededRoller } from '../dice/dice'
import { apply, reactionCommands, startGame, validate } from '../engine'
import { alive, hasKeyword, isDestroyed } from '../gameState'
import { arrivalProblem, arrivalSpot, reserveBudget, reserveProblem, reservesOf, toReserve } from '../rules/reserves'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, PlayerId, Vec } from '../types'
import { endPhase } from './helpers'

// hammerAnvil 60×44: zones x < 18 (west) and x > 42 (east)
function battle(west: PlayerId = 'marines', east: PlayerId = 'orks', round = 2, phase: GameState['phase'] = 'movement'): GameState {
  const s = scenarioById('strike-force').build([west, east], {}, undefined, { mapId: 'hammerAnvil', layoutId: 'A', primary: 'training', secondaries: 'none' })
  s.round = round
  s.phase = phase
  s.activePlayer = west
  s.firstPlayer = west
  return s
}
const trooper = (s: GameState, p: PlayerId) => s.units.find((u) => u.owner === p && hasKeyword(u, 'INFANTRY') && !hasKeyword(u, 'CHARACTER'))!
/** the unit's formation shifted so its first model stands at `to` */
const at = (s: GameState, id: string, to: Vec) => {
  const u = [...s.units, ...(s.reserves ?? [])].find((x) => x.id === id)!
  const a = alive(u)[0].pos
  return Object.fromEntries(alive(u).map((m) => [m.id, { x: m.pos.x - a.x + to.x, y: m.pos.y - a.y + to.y }]))
}

describe('Strategic Reserves before the battle', () => {
  it('up to half of the army\'s points', () => {
    const s = battle()
    const { army, limit } = reserveBudget(s, 'marines')
    expect(limit).toBe(Math.floor(army / 2))
    const units = s.units.filter((u) => u.owner === 'marines')
    for (const u of units) if (!reserveProblem(s, u)) toReserve(s, u.id)
    expect(reserveBudget(s, 'marines').reserved).toBeLessThanOrEqual(limit)
    expect(reservesOf(s, 'marines').length).toBeGreaterThan(0)
    expect(s.units.some((u) => u.owner === 'marines')).toBe(true)
  })
})

describe('arriving from reserves', () => {
  it('from round 2, in your Movement phase, within 6″ of an edge and more than 8″ from the enemy', () => {
    const s = battle('marines', 'orks', 1)
    const u = trooper(s, 'marines')
    toReserve(s, u.id)
    const edge = at(s, u.id, { x: 25, y: 1.5 })
    expect(arrivalProblem(s, u, edge)).toMatch(/2-го раунда/)
    s.round = 2
    expect(arrivalProblem(s, u, edge)).toBeNull()
    expect(arrivalProblem(s, u, at(s, u.id, { x: 25, y: 20 }))).toMatch(/6″ от края/)
    // the enemy deployment zone is closed before round 3
    expect(arrivalProblem(s, u, at(s, u.id, { x: 50, y: 1.5 }))).toBeTruthy()
    s.phase = 'shooting'
    expect(arrivalProblem(s, u, edge)).toMatch(/фазе движения/)
  })

  it('not within 8″ of an enemy model', () => {
    const s = battle()
    const u = trooper(s, 'marines')
    toReserve(s, u.id)
    const ork = trooper(s, 'orks')
    for (const m of ork.models) m.pos = { x: 26, y: 8 + (m.pos.y % 3) }
    expect(arrivalProblem(s, u, at(s, u.id, { x: 25, y: 1.5 }))).toMatch(/8″/)
  })

  it('the arrival command puts the unit on the board; it does not move again this turn', () => {
    const r = seededRoller(1)
    let s = battle()
    const u = trooper(s, 'marines')
    toReserve(s, u.id)
    const positions = arrivalSpot(s, u, { x: 30, y: 0 })!
    expect(positions).toBeTruthy()
    s = apply(s, { type: 'arrive', unitId: u.id, positions }, r)
    expect(reservesOf(s, 'marines')).toHaveLength(0)
    const on = s.units.find((x) => x.id === u.id)!
    expect(on.move).toBe('normal')
    expect(validate(s, { type: 'declareAdvance', unitId: u.id }).ok).toBe(false)
  })

  it('Deep Strike: anywhere more than 8″ from the enemy, even in the enemy zone', () => {
    const s = battle('marines', 'aeldari', 3)
    s.activePlayer = 'aeldari'
    const hawks = s.units.find((u) => u.datasheetId === 'swoopingHawks')
    expect(hawks, 'the Aeldari 1000-point preset fields Swooping Hawks').toBeTruthy()
    if (!hawks) return
    toReserve(s, hawks.id)
    for (const m of s.units.filter((u) => u.owner === 'marines').flatMap((u) => u.models)) m.pos = { x: 5 + (m.pos.x % 5), y: 5 + (m.pos.y % 30) }
    expect(arrivalProblem(s, hawks, at(s, hawks.id, { x: 30, y: 22 }))).toBeNull()
  })

  it('units not arrived by the end of round 3 are destroyed; an army in reserve is not wiped out', () => {
    const r = seededRoller(2)
    let s = battle('marines', 'orks', 3, 'fight')
    s.activePlayer = 'orks' // the second player's turn ends round 3
    const u = trooper(s, 'marines')
    toReserve(s, u.id)
    s.fight = null
    s = endPhase(s, r)
    expect(reservesOf(s, 'marines')).toHaveLength(0)
    expect(isDestroyed(s.units.find((x) => x.id === u.id)!)).toBe(true)
    expect(s.winner).toBeFalsy()
  })
})

describe('Rapid Ingress', () => {
  it('at the end of the opponent\'s Movement phase, for 1 CP', () => {
    const r = seededRoller(3)
    let s = battle('marines', 'orks', 2)
    const u = trooper(s, 'orks')
    toReserve(s, u.id)
    s.players.orks.cp = 2
    s = apply(s, { type: 'endPhase' }, r)
    expect(s.reaction?.window).toBe('beforeShooting')
    const rapid = reactionCommands(s).find((c) => c.type === 'arrive')
    expect(rapid).toBeTruthy()
    s = apply(s, rapid!, r)
    expect(s.players.orks.cp).toBe(1)
    expect(s.units.some((x) => x.id === u.id)).toBe(true)
    // once per phase; other reactions may still be offered, then the shooting starts
    expect(reactionCommands(s).some((c) => c.type === 'arrive')).toBe(false)
    while (s.reaction) s = apply(s, { type: 'passReaction' }, r)
    expect(s.phase).toBe('shooting')
  })

  it('not in round 1 and not without CP', () => {
    const r = seededRoller(4)
    let s = battle('marines', 'orks', 2)
    toReserve(s, trooper(s, 'orks').id)
    s.players.orks.cp = 0
    s = apply(s, { type: 'endPhase' }, r)
    expect(reactionCommands(s).some((c) => c.type === 'arrive')).toBe(false)
  })
})

describe('the AI and reserves', () => {
  it('brings its reserves in during its Movement phase, and a whole battle plays out', { timeout: 300_000 }, () => {
    const r = seededRoller(9)
    const s0 = scenarioById('strike-force').build(['necrons', 'tyranids'], {}, undefined, { mapId: 'dawnOfWar', layoutId: 'B', primary: 'sabotage' })
    for (const p of ['necrons', 'tyranids'] as PlayerId[]) toReserve(s0, s0.units.find((u) => u.owner === p && !hasKeyword(u, 'CHARACTER'))!.id)
    let s = startGame(s0, r)
    let arrived = 0
    for (let i = 0; i < 6000 && !s.winner; i++) {
      const d = decide(s, 'standard')!
      if (d.cmd.type === 'arrive') arrived++
      s = apply(s, d.cmd, r)
    }
    expect(s.winner).toBeTruthy()
    expect(arrived).toBe(2)
    expect(s.reserves ?? []).toHaveLength(0)
  })
})
