import { basePoints, circlePolygonDistance, segmentCrossesPolygon } from '../geometry/geometry'
import { alive, isInfantry, modelInTerrain, radiusOf } from '../gameState'
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

export function modelCanSee(s: GameState, a: ModelState, b: ModelState): boolean {
  const ter = relevantTerrain(s, a, b)
  if (ter.length === 0) return true
  const pa = basePoints(a.pos, radiusOf(a))
  const pb = basePoints(b.pos, radiusOf(b))
  return pa.some((p) => pb.some((q) => clear(p, q, ter)))
}

/** Every sample point of target is visible from some point of the observer. */
export function modelFullyVisible(s: GameState, a: ModelState, b: ModelState): boolean {
  const ter = relevantTerrain(s, a, b)
  if (ter.length === 0) return true
  const pa = basePoints(a.pos, radiusOf(a))
  return basePoints(b.pos, radiusOf(b)).every((q) => pa.some((p) => clear(p, q, ter)))
}

export const visibleTargets = (s: GameState, m: ModelState, target: UnitState) => alive(target).filter((t) => modelCanSee(s, m, t))

export const unitCanSee = (s: GameState, shooter: UnitState, target: UnitState) =>
  alive(shooter).some((m) => visibleTargets(s, m, target).length > 0)

/** Benefit of cover vs a ranged attack: every target model is INFANTRY within a
 * terrain area, or not fully visible to any shooting model due to terrain. */
export function hasCover(s: GameState, shooters: ModelState[], target: UnitState): boolean {
  const inf = isInfantry(target)
  return alive(target).every(
    (t) => (inf && modelInTerrain(s, t)) || !shooters.some((sm) => modelFullyVisible(s, sm, t)),
  )
}
