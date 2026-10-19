import { describe, expect, it } from 'vitest'
import { baseRadius, basesOverlap, edgeDistance, pointInPolygon, rect, segmentCrossesPolygon, withinRange } from '../geometry/geometry'

describe('geometry', () => {
  const r32 = baseRadius(32)
  it('converts base mm to inch radius', () => {
    expect(baseRadius(25.4)).toBeCloseTo(0.5)
    expect(r32).toBeCloseTo(0.6299, 3)
  })
  it('measures edge-to-edge between circular bases', () => {
    expect(edgeDistance({ x: 0, y: 0 }, 0.5, { x: 3, y: 4 }, 0.5)).toBeCloseTo(4)
  })
  it('touching bases are 0 apart and do not overlap', () => {
    const d = 2 * r32
    expect(edgeDistance({ x: 0, y: 0 }, r32, { x: d, y: 0 }, r32)).toBe(0)
    expect(basesOverlap({ x: 0, y: 0 }, r32, { x: d, y: 0 }, r32)).toBe(false)
  })
  it('overlapping bases clamp to 0 and are detected', () => {
    expect(edgeDistance({ x: 0, y: 0 }, r32, { x: 0.5, y: 0 }, r32)).toBe(0)
    expect(basesOverlap({ x: 0, y: 0 }, r32, { x: 0.5, y: 0 }, r32)).toBe(true)
  })
  it('target exactly at range is in range, slightly beyond is not', () => {
    expect(withinRange(24, 24)).toBe(true)
    expect(withinRange(24.01, 24)).toBe(false)
  })
  it('polygon tests', () => {
    const p = rect(0, 0, 2, 2)
    expect(pointInPolygon({ x: 1, y: 1 }, p)).toBe(true)
    expect(pointInPolygon({ x: 3, y: 1 }, p)).toBe(false)
    expect(segmentCrossesPolygon({ x: -1, y: 1 }, { x: 3, y: 1 }, p)).toBe(true)
    expect(segmentCrossesPolygon({ x: -1, y: 3 }, { x: 3, y: 3 }, p)).toBe(false)
  })
})
