import { describe, expect, it } from 'vitest'
import { SCENARIOS } from '../scenarios/scenarios'
import { boxOf, fitBox, newPiece, parseLayout, withBox } from '../terrainLayout'

describe('terrain layout editing', () => {
  const board = { width: 30, height: 22 }
  it('snaps to half inches, clamps size and keeps pieces on the board', () => {
    expect(fitBox({ x: 28.3, y: -2, w: 4.2, h: 0.1 }, board)).toEqual({ x: 26, y: 0, w: 4, h: 0.5 })
    expect(fitBox({ x: 1, y: 1, w: 40, h: 3 }, board).w).toBe(12)
  })
  it('round-trips a rectangle and adds uniquely named pieces in the centre', () => {
    const s = SCENARIOS[0].build()
    const t = withBox(s.terrain[0], { x: 2, y: 3, w: 5, h: 1 })
    expect(boxOf(t)).toEqual({ x: 2, y: 3, w: 5, h: 1 })
    const p = newPiece(s, 'crater')
    expect(p.kind).toBe('crater')
    expect(p.obscuring).toBe(false)
    expect(s.terrain.some((x) => x.id === p.id)).toBe(false)
    expect(boxOf(p)).toEqual({ x: 13.5, y: 9.5, w: 3, h: 3 })
    expect(newPiece(s, 'wall').obscuring).toBe(true)
  })
  it('rejects malformed saved layouts', () => {
    const s = SCENARIOS[0].build()
    expect(parseLayout(s.terrain)).toEqual(s.terrain)
    expect(parseLayout({})).toBeNull()
    expect(parseLayout([{ ...s.terrain[0], kind: 'lava' }])).toBeNull()
    expect(parseLayout([{ ...s.terrain[0], poly: [{ x: 1, y: 'a' }, { x: 1, y: 1 }, { x: 2, y: 2 }] }])).toBeNull()
  })
})
