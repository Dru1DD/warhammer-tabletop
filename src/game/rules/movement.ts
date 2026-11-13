import { basesOverlap, circlePolygonDistance, dist, edgeDistance, EPS, polygonCentroid, sweptCircleHits, sweptCircleHitsPolygon, withinRange } from '../geometry/geometry'
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

/** The dense terrain a non-INFANTRY base would cross on the straight line `from` → `to` (null: none, or it may cross). */
function denseOnLine(s: GameState, unit: UnitState, r: number, from: Vec, to: Vec, fly: boolean): Terrain | null {
  if (fly || isInfantry(unit) || dist(from, to) <= EPS) return null
  for (const t of s.terrain) {
    if (clearOf(t, r, from, to)) continue
    if ((TERRAIN_CATEGORY[t.kind] ?? { category: 'exposed' }).category === 'dense' && sweptCircleHitsPolygon(from, to, r, t.poly)) return t
  }
  return null
}

/** A base's way from `from` to `to`: the straight line, or — when dense terrain it may not cross is in the way — the
 * shortest route around it (11th edition: a model moves along any path; its move is the length of that path). The route
 * goes through points just outside the corners of the blocking terrain; enemy models are not crossed either (unless
 * `overModels`). Null when there is no way round. */
export function movePath(
  s: GameState, unit: UnitState, r: number, from: Vec, to: Vec, fly = false,
  enemies: { pos: Vec; r: number }[] = [], overModels = false,
): { points: Vec[]; length: number } | null {
  const blocked = (a: Vec, b: Vec) =>
    !!denseOnLine(s, unit, r, a, b, fly) || (!fly && !overModels && enemies.some((e) => sweptCircleHits(a, b, r, e.pos, e.r)))
  if (!denseOnLine(s, unit, r, from, to, fly)) return { points: [from, to], length: dist(from, to) }
  // corners of every dense terrain area, pushed out far enough for the base to pass
  const nodes: Vec[] = [from, to]
  for (const t of s.terrain) {
    if ((TERRAIN_CATEGORY[t.kind] ?? { category: 'exposed' }).category !== 'dense') continue
    const c = polygonCentroid(t.poly)
    for (const v of t.poly) {
      const dx = v.x - c.x, dy = v.y - c.y
      const len = Math.hypot(dx, dy) || 1
      const push = r * 1.45 + 0.1
      const w = { x: v.x + (dx / len) * push, y: v.y + (dy / len) * push }
      if (w.x - r < 0 || w.y - r < 0 || w.x + r > s.board.width || w.y + r > s.board.height) continue
      nodes.push(w)
    }
  }
  // Dijkstra over the visibility graph of those points
  const n = nodes.length
  const best = new Array<number>(n).fill(Infinity)
  const prev = new Array<number>(n).fill(-1)
  const done = new Array<boolean>(n).fill(false)
  best[0] = 0
  for (;;) {
    let i = -1
    for (let k = 0; k < n; k++) if (!done[k] && best[k] < Infinity && (i < 0 || best[k] < best[i])) i = k
    if (i < 0 || i === 1) break
    done[i] = true
    for (let k = 0; k < n; k++) {
      if (done[k] || k === i) continue
      const len = best[i] + dist(nodes[i], nodes[k])
      if (len >= best[k] || blocked(nodes[i], nodes[k])) continue
      best[k] = len
      prev[k] = i
    }
  }
  if (best[1] === Infinity) return null
  const points: Vec[] = []
  for (let k = 1; k >= 0; k = prev[k]) points.unshift(nodes[k])
  return { points, length: best[1] }
}

/**
 * Validate final positions for a unit move. Each model moves in a straight line from its current position, or around
 * dense terrain it may not cross (`movePath`). Returns a reason or null if legal.
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
    // MONSTER/VEHICLE may move through non-M/V models in normal and advance moves (17.01)
    const overModels = isMV(unit) && (mode === 'normal' || mode === 'advance')
    // the way it goes: straight, or around dense terrain it may not cross (then its move is the length of the detour)
    const straight = dist(m.pos, pos)
    const nearEnemies = nearby(enemyModels, (e) => e.m, m.pos, r, Math.max(straight, maxDist))
    const crossing = denseOnLine(s, unit, r, m.pos, pos, fly)
    const path = crossing ? movePath(s, unit, r, m.pos, pos, fly, nearEnemies.filter((e) => !(overModels && !isMV(e.unit))).map((e) => ({ pos: e.m.pos, r: radiusOf(e.m) })), overModels) : null
    if (crossing && !path) return `${name(m)}: ${tr('“{name}” is dense terrain: only infantry pass through it. Go around.', { name: crossing.name })}`
    const d = path ? path.length : straight
    if (d > maxDist + EPS)
      return path
        ? tr('{name}: the way around “{terrain}” is {fmt}", more than the allowed {fmt2}".', { name: name(m), terrain: crossing!.name, fmt: fmt(d), fmt2: fmt(maxDist) })
        : tr('{name}: the move of {fmt}" is more than the allowed {fmt2}".', { name: name(m), fmt: fmt(d), fmt2: fmt(maxDist) })
    if (pos.x - r < -EPS || pos.y - r < -EPS || pos.x + r > s.board.width + EPS || pos.y + r > s.board.height + EPS)
      return tr('{name}: the base goes beyond the edge of the field.', { name: name(m) })
    if (d > EPS && !path) {
      for (const e of nearEnemies)
        if (!fly && !(overModels && !isMV(e.unit)) && sweptCircleHits(m.pos, pos, r, e.m.pos, radiusOf(e.m)))
          return tr('{name}: you cannot move through enemy models.', { name: name(m) })
    }
    // dense terrain on the way was handled above (a detour was found); solid terrain still cannot be ended in
    const tb = path ? terrainBlock(s, unit, r, pos, pos, true, fly) : terrainBlock(s, unit, r, m.pos, pos, false, fly)
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
