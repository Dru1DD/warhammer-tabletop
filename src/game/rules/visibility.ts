import { basePoints, circlePolygonDistance, pointInPolygon, segmentCrossesPolygon } from '../geometry/geometry'
import { alive, isInfantry, modelDistance, modelInTerrain, radiusOf } from '../gameState'
import type { GameState, ModelState, Terrain, UnitState, Vec } from '../types'

// Line of sight approximation: a line between sample points on both bases
// (centre + 8 edge points). Obscuring terrain blocks a line unless one of the
// two models is inside that terrain area. Models do not block line of sight.

// A line between two bases lies inside the bounding box of both bases, so terrain whose bounding box misses that box
// can neither block the line nor contain either base: skip it without the expensive polygon tests (same result).
const boxCache = new WeakMap<Terrain, [number, number, number, number]>()
const boxOf = (t: Terrain) => {
  let b = boxCache.get(t)
  if (!b) {
    const xs = t.poly.map((p) => p.x), ys = t.poly.map((p) => p.y)
    b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    boxCache.set(t, b)
  }
  return b
}
const inReach = (t: Terrain, a: ModelState, b: ModelState) => {
  const [x0, y0, x1, y1] = boxOf(t)
  const ra = radiusOf(a), rb = radiusOf(b)
  return x1 >= Math.min(a.pos.x - ra, b.pos.x - rb) && x0 <= Math.max(a.pos.x + ra, b.pos.x + rb) &&
    y1 >= Math.min(a.pos.y - ra, b.pos.y - rb) && y0 <= Math.max(a.pos.y + ra, b.pos.y + rb)
}

const relevantTerrain = (s: GameState, a: ModelState, b: ModelState): Terrain[] =>
  s.terrain.filter(
    (t) => t.obscuring && inReach(t, a, b) && circlePolygonDistance(a.pos, radiusOf(a), t.poly) > 0 && circlePolygonDistance(b.pos, radiusOf(b), t.poly) > 0,
  )

const clear = (p: Vec, q: Vec, terrain: Terrain[]) => !terrain.some((t) => segmentCrossesPolygon(p, q, t.poly))

// Memo. Line of sight between two models depends only on the obscuring terrain and on both bases (centre and radius),
// so the answer is cached by those values. The AI asks the same questions over and over (every candidate move is
// scored against every enemy, and units that stayed put are scored again on the next decision); `apply` clones the
// state, so the terrain is identified by its content, not by the array.
const MEMO_LIMIT = 400_000
interface Memo { see: Map<string, boolean>; full: Map<string, boolean> }
const byArray = new WeakMap<Terrain[], Memo>()
const byContent = new Map<string, Memo>()
function memoFor(s: GameState): Memo {
  let memo = byArray.get(s.terrain)
  if (!memo) {
    const key = JSON.stringify(s.terrain.filter((t) => t.obscuring).map((t) => t.poly))
    memo = byContent.get(key)
    if (!memo) {
      // one board at a time in practice; never keep stale boards around
      if (byContent.size >= 4) byContent.clear()
      memo = { see: new Map(), full: new Map() }
      byContent.set(key, memo)
    }
    byArray.set(s.terrain, memo)
  }
  if (memo.see.size >= MEMO_LIMIT) memo.see.clear()
  if (memo.full.size >= MEMO_LIMIT) memo.full.clear()
  return memo
}
const pairKey = (a: ModelState, b: ModelState) => `${a.pos.x},${a.pos.y},${radiusOf(a)},${b.pos.x},${b.pos.y},${radiusOf(b)}`

/** `segmentCrossesPolygon` minus its two point-in-polygon tests (done once per sample point by the caller), with
 * `segmentsIntersect` inlined: the same arithmetic in the same order, so the same answer bit for bit. */
function edgesCross(a: Vec, b: Vec, poly: Vec[]): boolean {
  const rx = b.x - a.x, ry = b.y - a.y
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const q1 = poly[j], q2 = poly[i]
    const sx = q2.x - q1.x, sy = q2.y - q1.y
    const denom = rx * sy - ry * sx
    const qpx = q1.x - a.x, qpy = q1.y - a.y
    if (Math.abs(denom) < 1e-12) continue // parallel: treat as non-crossing
    const t = (qpx * sy - qpy * sx) / denom
    const u = (qpx * ry - qpy * rx) / denom
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true
  }
  return false
}

/** Some line between a sample point of `a` and one of `b` crosses none of the terrain (`clear`), with each sample
 * point's point-in-polygon test computed once instead of once per line. */
function canSee(s: GameState, a: ModelState, b: ModelState): boolean {
  const ter = relevantTerrain(s, a, b)
  if (ter.length === 0) return true
  const pa = basePoints(a.pos, radiusOf(a))
  const pb = basePoints(b.pos, radiusOf(b))
  const inA = ter.map((t) => pa.map((p) => pointInPolygon(p, t.poly)))
  const inB = ter.map((t) => pb.map((q) => pointInPolygon(q, t.poly)))
  for (let i = 0; i < pa.length; i++)
    for (let j = 0; j < pb.length; j++) {
      let blocked = false
      for (let k = 0; k < ter.length && !blocked; k++) blocked = inA[k][i] || inB[k][j] || edgesCross(pa[i], pb[j], ter[k].poly)
      if (!blocked) return true
    }
  return false
}

export function modelCanSee(s: GameState, a: ModelState, b: ModelState): boolean {
  const memo = memoFor(s).see
  const key = pairKey(a, b)
  let v = memo.get(key)
  if (v === undefined) {
    v = canSee(s, a, b)
    memo.set(key, v)
  }
  return v
}

function fullyVisible(s: GameState, a: ModelState, b: ModelState): boolean {
  const ter = relevantTerrain(s, a, b)
  if (ter.length === 0) return true
  const pa = basePoints(a.pos, radiusOf(a))
  return basePoints(b.pos, radiusOf(b)).every((q) => pa.some((p) => clear(p, q, ter)))
}

/** Every sample point of target is visible from some point of the observer. */
export function modelFullyVisible(s: GameState, a: ModelState, b: ModelState): boolean {
  const memo = memoFor(s).full
  const key = pairKey(a, b)
  let v = memo.get(key)
  if (v === undefined) {
    v = fullyVisible(s, a, b)
    memo.set(key, v)
  }
  return v
}

export const visibleTargets = (s: GameState, m: ModelState, target: UnitState) => alive(target).filter((t) => modelCanSee(s, m, t))

/** Some model of `target` is visible to model `m`. */
export const seesAny = (s: GameState, m: ModelState, target: UnitState) => alive(target).some((t) => modelCanSee(s, m, t))

export const unitCanSee = (s: GameState, shooter: UnitState, target: UnitState) => alive(shooter).some((m) => seesAny(s, m, target))

/** Distance from `m` to the nearest model of `target` it can see (Infinity if none): the same value as the minimum
 * over `visibleTargets`, found by testing line of sight nearest-first instead of to every model. */
export function nearestVisibleDistance(s: GameState, m: ModelState, target: UnitState): number {
  const byDist = alive(target).map((t) => ({ t, d: modelDistance(m, t) })).sort((a, b) => a.d - b.d)
  for (const x of byDist) if (modelCanSee(s, m, x.t)) return x.d
  return Infinity
}

/** Benefit of cover vs a ranged attack: every target model is INFANTRY within a
 * terrain area, or not fully visible to any shooting model due to terrain. */
export function hasCover(s: GameState, shooters: ModelState[], target: UnitState): boolean {
  const inf = isInfantry(target)
  return alive(target).every(
    (t) => (inf && modelInTerrain(s, t)) || !shooters.some((sm) => modelFullyVisible(s, sm, t)),
  )
}
