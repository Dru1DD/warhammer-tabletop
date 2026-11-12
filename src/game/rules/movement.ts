import { basesOverlap, circlePolygonDistance, dist, edgeDistance, EPS, sweptCircleHits, sweptCircleHitsPolygon, withinRange } from '../geometry/geometry'
import {
  alive, checkCoherency, enemiesOf, ENGAGEMENT_RANGE, fmt, isInfantry, isMV, modelDistance, profileOf, radiusOf, TERRAIN_CATEGORY,
} from '../gameState'
import type { GameState, ModelState, Terrain, UnitState, Vec } from '../types'
import { tr } from '../../i18n/index'

export type MoveMode = 'normal' | 'advance' | 'fallBack' | 'charge' | 'pileIn' | 'consolidate'

// Speed-ups (exact: they only skip checks that cannot fail). Every check below needs the moving base to come
// within its radius of a terrain area, or within `ENGAGEMENT_RANGE` + both radii of another model, somewhere
// along a straight move of at most `maxDist`. Anything farther away is dropped before the per-position loops.
const SLACK = 1
const boxes = new WeakMap<Terrain, [number, number, number, number]>()
function boxOf(t: Terrain) {
  let b = boxes.get(t)
  if (!b) {
    const xs = t.poly.map((p) => p.x), ys = t.poly.map((p) => p.y)
    b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    boxes.set(t, b)
  }
  return b
}
/** The base (radius r) moving from `from` to `to` cannot touch the terrain's bounding box. */
function clearOf(t: Terrain, r: number, from: Vec, to: Vec) {
  const [x0, y0, x1, y1] = boxOf(t)
  const m = r + SLACK
  return Math.max(from.x, to.x) + m < x0 || Math.min(from.x, to.x) - m > x1 || Math.max(from.y, to.y) + m < y0 || Math.min(from.y, to.y) - m > y1
}
/** Every point of the terrain's bounding box is more than `reach` (+ slack) from `at` along some axis. A base of
 * radius r moving from `at` by at most `reach - r` then passes `clearOf` the terrain. */
function farFrom(t: Terrain, at: Vec, reach: number) {
  const [x0, y0, x1, y1] = boxOf(t)
  const m = reach + SLACK
  return at.x + m < x0 || at.x - m > x1 || at.y + m < y0 || at.y - m > y1
}
/** Items whose bases are close enough to a model at `at` moving up to `reach` to block it or end in engagement. */
const nearby = <T>(items: T[], posOf: (x: T) => ModelState, at: Vec, r: number, reach: number) =>
  items.filter((x) => {
    const o = posOf(x)
    return dist(at, o.pos) <= reach + r + radiusOf(o) + ENGAGEMENT_RANGE + SLACK
  })

/** Terrain that stops this model moving from `from` to `to` (13.06): solid features
 * can't be ended in; dense ones can only be crossed by INFANTRY. */
export function terrainBlock(s: GameState, unit: UnitState, r: number, from: Vec, to: Vec, placing = false, fly = false): string | null {
  if (!placing && dist(from, to) <= EPS) return null
  const infantry = isInfantry(unit)
  for (const t of s.terrain) {
    if (clearOf(t, r, from, to)) continue
    const cat = TERRAIN_CATEGORY[t.kind] ?? { category: 'exposed' }
    if (cat.solid && circlePolygonDistance(to, r, t.poly) === 0) return tr('you cannot end a move inside “{name}” (solid terrain).', { name: t.name })
    if (cat.category === 'dense' && !infantry && !fly && sweptCircleHitsPolygon(from, to, r, t.poly))
      return tr('“{name}” is dense terrain: only infantry pass through it. Go around.', { name: t.name })
  }
  return null
}

/**
 * Validate final positions for a unit move. Each model moves in a straight
 * line from its current position. Returns a Russian reason or null if legal.
 */
export function moveProblem(
  s: GameState,
  unit: UnitState,
  positions: Record<string, Vec>,
  maxDist: number,
  mode: MoveMode,
  /** for charge/pile-in: units the move is allowed to end engaged with */
  allowedEngage: string[] = [],
  /** FLY unit "taking to the skies": passes over all models and terrain (21.03) */
  fly = false,
): string | null {
  const models = alive(unit)
  const enemyModels = enemiesOf(s, unit).flatMap((e) => alive(e).map((m) => ({ m, unit: e })))
  const others = s.units.flatMap((u) => (u.id === unit.id ? [] : alive(u)))
  const final = models.map((m) => ({ m, pos: positions[m.id] ?? m.pos }))
  const name = (m: ModelState) => profileOf(m).name

  for (const { m, pos } of final) {
    const r = radiusOf(m)
    const d = dist(m.pos, pos)
    if (d > maxDist + EPS)
      return tr('{name}: the move of {fmt}" is more than the allowed {fmt2}".', { name: name(m), fmt: fmt(d), fmt2: fmt(maxDist) })
    if (pos.x - r < -EPS || pos.y - r < -EPS || pos.x + r > s.board.width + EPS || pos.y + r > s.board.height + EPS)
      return tr('{name}: the base goes beyond the edge of the field.', { name: name(m) })
    // MONSTER/VEHICLE may move through non-M/V models in normal and advance moves (17.01)
    const overModels = isMV(unit) && (mode === 'normal' || mode === 'advance')
    const nearEnemies = nearby(enemyModels, (e) => e.m, m.pos, r, d)
    if (d > EPS) {
      for (const e of nearEnemies)
        if (!fly && !(overModels && !isMV(e.unit)) && sweptCircleHits(m.pos, pos, r, e.m.pos, radiusOf(e.m)))
          return tr('{name}: you cannot move through enemy models.', { name: name(m) })
    }
    const tb = terrainBlock(s, unit, r, m.pos, pos, false, fly)
    if (tb) return `${name(m)}: ${tb}`
    for (const o of nearby(others, (x) => x, m.pos, r, d))
      if (basesOverlap(pos, r, o.pos, radiusOf(o))) return tr('{name}: the base overlaps another model.', { name: name(m) })
    for (const f of final)
      if (f.m !== m && basesOverlap(pos, r, f.pos, radiusOf(f.m))) return tr('{name}: the unit’s model bases overlap.', { name: name(m) })

    if (mode === 'normal' || mode === 'advance' || mode === 'fallBack') {
      for (const e of nearEnemies)
        if (withinRange(modelDistance(m, e.m, pos), ENGAGEMENT_RANGE))
          return tr('{name}: you cannot end a move in engagement range ({ENGAGEMENT_RANGE}") of the enemy.', { name: name(m), ENGAGEMENT_RANGE })
    } else {
      for (const e of nearEnemies)
        if (!allowedEngage.includes(e.unit.id) && withinRange(modelDistance(m, e.m, pos), ENGAGEMENT_RANGE))
          return tr('{name}: you cannot enter engagement range of a unit that is not the target.', { name: name(m) })
    }
  }
  return checkCoherency(final)
}

/**
 * Greedy planner used by AI and by automatic charge / pile-in / consolidation
 * moves: each model heads toward `goal(model)`, keeping `stopAt` inches of
 * edge distance, trying angular offsets when blocked.
 * ponytail: greedy per-model search, not a true path planner (no routing
 * around obstacles); fine for a small board with few models.
 */
export function planMove(
  s: GameState,
  unit: UnitState,
  goal: (m: ModelState) => { pos: Vec; radius: number },
  maxDist: number,
  mode: MoveMode,
  allowedEngage: string[] = [],
  stopAt = 0,
  fly = false,
): Record<string, Vec> {
  const models = [...alive(unit)].sort((a, b) => dist(a.pos, goal(a).pos) - dist(b.pos, goal(b).pos))
  const placed: Record<string, Vec> = {}
  const enemyModels = enemiesOf(s, unit).flatMap((e) => alive(e).map((m) => ({ m, unit: e })))
  const others = s.units.flatMap((u) => (u.id === unit.id ? [] : alive(u)))
  const engageLimit = mode === 'normal' || mode === 'advance' || mode === 'fallBack'

  const overModels = isMV(unit) && (mode === 'normal' || mode === 'advance')
  type Near = {
    /** this model's view of the board: only terrain it could reach */
    s: GameState
    enemies: { m: ModelState; unit: UnitState; r: number }[]
    /** bases it must not overlap: other units' models, then its own unit's (placed or not yet moved) */
    others: { pos: Vec; r: number }[]
    own: { pos: Vec; r: number }[]
  }
  // `near` holds what can matter for `m` (see `nearby`): every position tried is within `maxDist` of the model,
  // so anything farther away can never block it. Radii are looked up once per model, not once per position.
  const ok = (m: ModelState, pos: Vec, near: Near) => {
    const r = radiusOf(m)
    if (pos.x - r < 0 || pos.y - r < 0 || pos.x + r > s.board.width || pos.y + r > s.board.height) return false
    if (dist(m.pos, pos) > maxDist + EPS) return false
    if (terrainBlock(near.s, unit, r, m.pos, pos, false, fly)) return false
    for (const e of near.enemies) {
      if (!fly && !(overModels && !isMV(e.unit)) && sweptCircleHits(m.pos, pos, r, e.m.pos, e.r)) return false
      const ed = edgeDistance(pos, r, e.m.pos, e.r)
      if (withinRange(ed, ENGAGEMENT_RANGE) && (engageLimit || !allowedEngage.includes(e.unit.id))) return false
    }
    for (const o of near.others) if (basesOverlap(pos, r, o.pos, o.r)) return false
    for (const o of near.own) if (basesOverlap(pos, r, o.pos, o.r)) return false
    return true
  }

  for (const m of models) {
    const g = goal(m)
    const r = radiusOf(m)
    const reach = maxDist + EPS
    const close = (p: Vec, ro: number) => dist(m.pos, p) <= reach + r + ro + ENGAGEMENT_RANGE + SLACK
    const near: Near = {
      s: { ...s, terrain: s.terrain.filter((t) => !farFrom(t, m.pos, reach + r)) },
      enemies: nearby(enemyModels, (e) => e.m, m.pos, r, reach).map((e) => ({ ...e, r: radiusOf(e.m) })),
      others: nearby(others, (x) => x, m.pos, r, reach).map((o) => ({ pos: o.pos, r: radiusOf(o) })),
      own: models.flatMap((o) => {
        const p = placed[o.id] ?? (o === m ? null : o.pos)
        return p && close(p, radiusOf(o)) ? [{ pos: p, r: radiusOf(o) }] : []
      }),
    }
    const toGoal = dist(m.pos, g.pos)
    const want = Math.max(0, toGoal - r - g.radius - stopAt)
    let best: Vec = m.pos
    let bestScore = Infinity
    const step = Math.min(maxDist, want)
    if (step > EPS) {
      const baseAngle = Math.atan2(g.pos.y - m.pos.y, g.pos.x - m.pos.x)
      for (const off of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.2, -1.2]) {
        for (const k of [1, 0.85, 0.7, 0.5, 0.3]) {
          const dd = step * k
          const pos = { x: m.pos.x + Math.cos(baseAngle + off) * dd, y: m.pos.y + Math.sin(baseAngle + off) * dd }
          // only a strictly better position can be picked, so a worse one needs no legality check
          const score = dist(pos, g.pos)
          if (!(score < bestScore - EPS) || !ok(m, pos, near)) continue
          bestScore = score
          best = pos
        }
      }
    }
    if (!ok(m, best, near)) best = m.pos
    placed[m.id] = best
  }
  return placed
}
