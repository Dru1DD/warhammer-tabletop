import { describe, expect, it } from 'vitest'
import { clampToRadius, fitBoard, screenToWorld, worldToScreen, zoomAt } from './transform'

describe('viewport transform', () => {
  const v = { scale: 20, x: 50, y: 10 }
  it('round-trips world and screen coordinates', () => {
    const p = { x: 12.5, y: 7.25 }
    const sp = worldToScreen(v, p)
    expect(sp).toEqual({ x: 300, y: 155 })
    expect(screenToWorld(v, sp)).toEqual(p)
  })
  it('zooms around the pointer', () => {
    const anchor = { x: 200, y: 100 }
    const before = screenToWorld(v, anchor)
    const z = zoomAt(v, anchor, 2)
    expect(z.scale).toBe(40)
    const after = screenToWorld(z, anchor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })
  it('clamps zoom', () => {
    expect(zoomAt(v, { x: 0, y: 0 }, 1000).scale).toBe(120)
  })
  it('fits and centres the board', () => {
    const f = fitBoard({ width: 30, height: 22 }, 648, 1000, 24)
    expect(f.scale).toBe(20)
    expect(f.x).toBe(24)
    expect(f.y).toBeCloseTo((1000 - 440) / 2)
  })
  it('clamps a drag to a maximum radius', () => {
    expect(clampToRadius({ x: 0, y: 0 }, { x: 10, y: 0 }, 6)).toEqual({ x: 6, y: 0 })
    expect(clampToRadius({ x: 0, y: 0 }, { x: 3, y: 4 }, 6)).toEqual({ x: 3, y: 4 })
  })
})
