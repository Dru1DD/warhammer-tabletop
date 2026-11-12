import { describe, expect, it } from 'vitest'
import { baseRadius, rect } from '../geometry/geometry'
import { getUnit } from '../gameState'
import { chargeChance, movePreview } from '../movePreview'
import type { GameState, Vec } from '../types'
import { bare, column, place } from './helpers'

const r32 = baseRadius(32)

/** Intercessors at x = 3 and a Boyz mob `edge` inches away (edge to edge), every other unit removed. */
function duel(edge: number): GameState {
  const s = bare('movement', 'marines')
  for (const u of s.units) if (u.id !== 'int' && u.id !== 'boyz') place(s, u.id, [])
  place(s, 'int', column(3, 6, 5))
  place(s, 'boyz', column(3 + 2 * r32 + edge, 6, 10, 1.1))
  return s
}

/** Draft that shifts every Intercessor by (dx, dy). */
const shifted = (s: GameState, dx: number, dy = 0): Record<string, Vec> =>
  Object.fromEntries(getUnit(s, 'int').models.filter((m) => !m.destroyed).map((m) => [m.id, { x: m.pos.x + dx, y: m.pos.y + dy }]))

describe('move preview', () => {
  it('in the open: you can shoot them, they can shoot and charge you', () => {
    const s = duel(11)
    const p = movePreview(s, 'int', shifted(s, 1), 'normal')!
    expect(p.canShoot.map((r) => r.unitId)).toEqual(['boyz'])
    expect(p.canShoot[0].dmg).toBeGreaterThan(0)
    expect(p.shotBy.map((r) => r.unitId)).toEqual(['boyz'])
    expect(p.chargedBy).toHaveLength(1)
    // about 10" after the 1" move (the Nob's base is larger), the Boyz move 6" first: a charge of just under 4"
    expect(p.chargedBy[0].need).toBeGreaterThan(3.5)
    expect(p.chargedBy[0].need).toBeLessThanOrEqual(4)
    expect(p.chargedBy[0].p).toBeCloseTo(33 / 36, 5)
    expect(p.note).toBeNull()
  })

  it('in the open the whole unit fires: no warning', () => {
    const s = duel(11)
    const p = movePreview(s, 'int', shifted(s, 1), 'normal')!
    expect(p.canShoot[0].firing).toBe(p.canShoot[0].models)
    expect(p.partial).toBeNull()
  })

  it('when a wall hides most of the unit from the target, it says how many models fire and warns', () => {
    const s = bare('movement', 'marines')
    for (const u of s.units) if (u.id !== 'int' && u.id !== 'boyz') place(s, u.id, [])
    place(s, 'int', [{ x: 3, y: 2 }, { x: 3, y: 3.5 }, { x: 3, y: 5 }, { x: 3, y: 20 }, { x: 3, y: 21.5 }])
    place(s, 'boyz', column(3 + 2 * r32 + 11, 18, 10, 1.1))
    s.terrain = [{ id: 'w', name: 'wall', kind: 'ruin', obscuring: true, poly: rect(4.5, 0, 0.5, 10) }]
    const p = movePreview(s, 'int', {}, 'normal')!
    expect(p.canShoot[0]).toMatchObject({ unitId: 'boyz', firing: 2, models: 5 })
    expect(p.partial?.unitId).toBe('boyz')
  })

  it('behind an obscuring wall nobody sees anybody, but a charge is still possible', () => {
    const s = duel(11)
    s.terrain = [{ id: 'w', name: 'wall', kind: 'ruin', obscuring: true, poly: rect(8, 0, 1, s.board.height) }]
    const p = movePreview(s, 'int', shifted(s, 1), 'normal')!
    expect(p.canShoot).toEqual([])
    expect(p.seenOutOfRange).toEqual([])
    expect(p.shotBy).toEqual([])
    expect(p.chargedBy.map((r) => r.unitId)).toEqual(['boyz'])
  })

  it('too far: seen but out of range, and out of charge reach', () => {
    const s = duel(40)
    const p = movePreview(s, 'int', shifted(s, -1), 'normal')!
    expect(p.canShoot).toEqual([])
    expect(p.seenOutOfRange.map((r) => r.unitId)).toEqual(['boyz'])
    expect(p.chargedBy).toEqual([])
  })

  it('uses the planned positions, not the current ones', () => {
    const s = duel(30)
    expect(movePreview(s, 'int', {}, 'normal')!.canShoot).toEqual([])
    // 6" closer: within 24"
    expect(movePreview(s, 'int', shifted(s, 6), 'normal')!.canShoot.map((r) => r.unitId)).toEqual(['boyz'])
  })

  it('explains what Advance and Fall Back mean for shooting', () => {
    const s = duel(11)
    expect(movePreview(s, 'int', shifted(s, 1), 'advance')!.note).toContain('Assault')
    const fb = movePreview(s, 'int', shifted(s, -1), 'fallBack')!
    expect(fb.note).toContain('не стреляет')
    expect(fb.canShoot).toEqual([])
  })

  it('never changes the game state', () => {
    const s = duel(11)
    const before = JSON.stringify(s)
    movePreview(s, 'int', shifted(s, 2), 'normal')
    expect(JSON.stringify(s)).toBe(before)
  })

  it('charge chance follows 2D6 (a roll of 2 always fails)', () => {
    expect(chargeChance(2)).toBeCloseTo(35 / 36)
    expect(chargeChance(3)).toBeCloseTo(35 / 36)
    expect(chargeChance(7)).toBeCloseTo(21 / 36)
    expect(chargeChance(7.2)).toBeCloseTo(15 / 36)
    expect(chargeChance(12)).toBeCloseTo(1 / 36)
    expect(chargeChance(12.1)).toBe(0)
  })
})
