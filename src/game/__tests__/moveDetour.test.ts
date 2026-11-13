import { describe, expect, it } from 'vitest'
import { composeUnit } from '../army/armyList'
import { rect } from '../geometry/geometry'
import { alive, newUnit, radiusOf } from '../gameState'
import { movePath, moveProblem } from '../rules/movement'
import type { GameState, UnitState, Vec } from '../types'
import { battle, place } from './helpers'

// A model that is not INFANTRY may not cross dense terrain, but it may walk around it: the move is the length of the
// way it takes (battle of 12.11.2026: a Sulphurhound with M12″ was refused a short move because the straight line
// crossed a wood it could easily go round).

/** One Serberys Sulphurhound (MOUNTED, M12″) at `at`, a 5″×5″ wood just ahead of it, everything else off the board. */
function hound(at: Vec): { s: GameState; u: UnitState } {
  const s = battle('adeptus_mechanicus', 'orks', 'movement', 'adeptus_mechanicus')
  for (const u of s.units) place(s, u.id, [])
  const u = newUnit('hound', 'sulphurhounds', 'adeptus_mechanicus', 'Hound', composeUnit('sulphurhounds', 3).slice(0, 1).map((p) => [p, at] as [string, Vec]))
  s.units.push(u)
  s.terrain = [{ id: 'w', name: 'Wood', kind: 'woods', obscuring: true, poly: rect(10, 8, 5, 5) }]
  return { s, u }
}
const to = (u: UnitState, p: Vec) => ({ [alive(u)[0].id]: p })

describe('moving around dense terrain', () => {
  it('the straight line crosses the wood, but the way round is shorter than the move: legal', () => {
    // the straight line (11″) clips the top of the wood; going just above it is a little longer
    const { s, u } = hound({ x: 7, y: 7.5 })
    const target = { x: 18, y: 7.5 }
    const way = movePath(s, u, radiusOf(alive(u)[0]), alive(u)[0].pos, target)!
    expect(way.points.length).toBeGreaterThan(2)
    expect(way.length).toBeGreaterThan(11)
    expect(way.length).toBeLessThanOrEqual(12)
    expect(moveProblem(s, u, to(u, target), 12, 'normal')).toBeNull()
  })

  it('a way round longer than the move is refused, and says how long it is', () => {
    const { s, u } = hound({ x: 7, y: 7.5 })
    expect(moveProblem(s, u, to(u, { x: 18, y: 7.5 }), 11, 'normal')).toMatch(/11"/)
  })

  it('infantry still walks straight through the wood', () => {
    const s = battle('adeptus_mechanicus', 'orks', 'movement', 'adeptus_mechanicus')
    const rangers = s.units.find((u) => u.datasheetId === 'rangers')!
    for (const u of s.units) if (u !== rangers) place(s, u.id, [])
    place(s, rangers.id, [{ x: 7, y: 10.5 }])
    s.terrain = [{ id: 'w', name: 'Wood', kind: 'woods', obscuring: true, poly: rect(10, 8, 5, 5) }]
    const way = movePath(s, rangers, radiusOf(alive(rangers)[0]), { x: 7, y: 10.5 }, { x: 17, y: 10.5 })!
    expect(way.points).toHaveLength(2)
  })

  it('no detour when the straight line is clear', () => {
    const { s, u } = hound({ x: 7, y: 3 })
    const way = movePath(s, u, radiusOf(alive(u)[0]), alive(u)[0].pos, { x: 18, y: 3 })!
    expect(way.points).toHaveLength(2)
  })
})
