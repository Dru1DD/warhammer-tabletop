import type { Vec } from '../types'

export const MM_PER_INCH = 25.4
/** float tolerance for "exactly at range" comparisons (1/1000 inch) */
export const EPS = 1e-3

export const baseRadius = (baseMm: number) => baseMm / MM_PER_INCH / 2

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })
export const len = (a: Vec) => Math.hypot(a.x, a.y)
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)

/** Edge-to-edge distance between two circular bases. 0 when touching/overlapping. */
export const edgeDistance = (a: Vec, ra: number, b: Vec, rb: number) => Math.max(0, dist(a, b) - ra - rb)

/** Bases overlap (touching is allowed). */
export const basesOverlap = (a: Vec, ra: number, b: Vec, rb: number) => dist(a, b) < ra + rb - EPS

export const withinRange = (d: number, range: number) => d <= range + EPS

const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x

export function segmentsIntersect(p1: Vec, p2: Vec, q1: Vec, q2: Vec): boolean {
  const r = sub(p2, p1)
  const s = sub(q2, q1)
  const denom = cross(r, s)
  const qp = sub(q1, p1)
  if (Math.abs(denom) < 1e-12) return false // parallel: treat as non-crossing
  const t = cross(qp, s) / denom
  const u = cross(qp, r) / denom
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

export function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function segmentCrossesPolygon(a: Vec, b: Vec, poly: Vec[]): boolean {
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return true
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (segmentsIntersect(a, b, poly[j], poly[i])) return true
  }
  return false
}

/** Distance from point p to segment ab. */
export function pointSegmentDistance(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a)
  const l2 = ab.x * ab.x + ab.y * ab.y
  if (l2 === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2))
  return dist(p, add(a, scale(ab, t)))
}

/** Does a base of radius r travelling from a to b pass through a circle (c, rc)? */
export function sweptCircleHits(a: Vec, b: Vec, r: number, c: Vec, rc: number): boolean {
  return pointSegmentDistance(c, a, b) < r + rc - EPS
}

/** Closest distance from a circle to a polygon's area (0 if overlapping). */
export function circlePolygonDistance(c: Vec, r: number, poly: Vec[]): number {
  if (pointInPolygon(c, poly)) return 0
  let d = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, pointSegmentDistance(c, poly[j], poly[i]))
  return Math.max(0, d - r)
}

/** Sample points: centre plus n points on the base edge (for line-of-sight checks). */
export function basePoints(c: Vec, r: number, n = 8): Vec[] {
  const pts = [c]
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push({ x: c.x + Math.cos(a) * r * 0.98, y: c.y + Math.sin(a) * r * 0.98 })
  }
  return pts
}

export function polygonCentroid(poly: Vec[]): Vec {
  const s = poly.reduce((acc, p) => add(acc, p), { x: 0, y: 0 })
  return scale(s, 1 / poly.length)
}

export const rect = (x: number, y: number, w: number, h: number): Vec[] => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
]
