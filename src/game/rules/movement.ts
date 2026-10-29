import { basesOverlap, circlePolygonDistance, dist, EPS, sweptCircleHits, sweptCircleHitsPolygon, withinRange } from '../geometry/geometry'
import {
  alive, checkCoherency, enemiesOf, ENGAGEMENT_RANGE, fmt, isInfantry, isMV, modelDistance, profileOf, radiusOf, TERRAIN_CATEGORY,
} from '../gameState'
import type { GameState, ModelState, UnitState, Vec } from '../types'

export type MoveMode = 'normal' | 'advance' | 'fallBack' | 'charge' | 'pileIn' | 'consolidate'

/** Terrain that stops this model moving from `from` to `to` (13.06): solid features
 * can't be ended in; dense ones can only be crossed by INFANTRY. */
export function terrainBlock(s: GameState, unit: UnitState, r: number, from: Vec, to: Vec, placing = false): string | null {
  if (!placing && dist(from, to) <= EPS) return null
  const infantry = isInfantry(unit)
  for (const t of s.terrain) {
    const cat = TERRAIN_CATEGORY[t.kind] ?? { category: 'exposed' }
    if (cat.solid && circlePolygonDistance(to, r, t.poly) === 0) return `нельзя заканчивать движение внутри «${t.name}» (сплошной тиррейн).`
    if (cat.category === 'dense' && !infantry && sweptCircleHitsPolygon(from, to, r, t.poly))
      return `«${t.name}» — плотный тиррейн: сквозь него проходит только пехота. Обойдите его.`
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
      return `${name(m)}: перемещение ${fmt(d)}" больше допустимых ${fmt(maxDist)}".`
    if (pos.x - r < -EPS || pos.y - r < -EPS || pos.x + r > s.board.width + EPS || pos.y + r > s.board.height + EPS)
      return `${name(m)}: подставка выходит за край поля.`
    // MONSTER/VEHICLE may move through non-M/V models in normal and advance moves (17.01)
    const overModels = isMV(unit) && (mode === 'normal' || mode === 'advance')
    if (d > EPS) {
      for (const e of enemyModels)
        if (!(overModels && !isMV(e.unit)) && sweptCircleHits(m.pos, pos, r, e.m.pos, radiusOf(e.m)))
          return `${name(m)}: нельзя проходить сквозь вражеские модели.`
    }
    const tb = terrainBlock(s, unit, r, m.pos, pos)
    if (tb) return `${name(m)}: ${tb}`
    for (const o of others)
      if (basesOverlap(pos, r, o.pos, radiusOf(o))) return `${name(m)}: подставка пересекается с другой моделью.`
    for (const f of final)
      if (f.m !== m && basesOverlap(pos, r, f.pos, radiusOf(f.m))) return `${name(m)}: подставки моделей отряда пересекаются.`

    if (mode === 'normal' || mode === 'advance' || mode === 'fallBack') {
      for (const e of enemyModels)
        if (withinRange(modelDistance(m, e.m, pos), ENGAGEMENT_RANGE))
          return `${name(m)}: нельзя заканчивать движение в зоне контакта (engagement range, ${ENGAGEMENT_RANGE}") с врагом.`
    } else {
      for (const e of enemyModels)
        if (!allowedEngage.includes(e.unit.id) && withinRange(modelDistance(m, e.m, pos), ENGAGEMENT_RANGE))
          return `${name(m)}: нельзя входить в контакт с отрядом, который не является целью.`
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
): Record<string, Vec> {
  const models = [...alive(unit)].sort((a, b) => dist(a.pos, goal(a).pos) - dist(b.pos, goal(b).pos))
  const placed: Record<string, Vec> = {}
  const enemyModels = enemiesOf(s, unit).flatMap((e) => alive(e).map((m) => ({ m, unit: e })))
  const others = s.units.flatMap((u) => (u.id === unit.id ? [] : alive(u)))
  const engageLimit = mode === 'normal' || mode === 'advance' || mode === 'fallBack'

  const overModels = isMV(unit) && (mode === 'normal' || mode === 'advance')
  const ok = (m: ModelState, pos: Vec) => {
    const r = radiusOf(m)
    if (pos.x - r < 0 || pos.y - r < 0 || pos.x + r > s.board.width || pos.y + r > s.board.height) return false
    if (dist(m.pos, pos) > maxDist + EPS) return false
    if (terrainBlock(s, unit, r, m.pos, pos)) return false
    for (const e of enemyModels) {
      if (!(overModels && !isMV(e.unit)) && sweptCircleHits(m.pos, pos, r, e.m.pos, radiusOf(e.m))) return false
      const ed = modelDistance(m, e.m, pos)
      if (withinRange(ed, ENGAGEMENT_RANGE) && (engageLimit || !allowedEngage.includes(e.unit.id))) return false
    }
    for (const o of others) if (basesOverlap(pos, r, o.pos, radiusOf(o))) return false
    for (const other of models) {
      const p = placed[other.id] ?? (other === m ? null : other.pos)
      if (p && basesOverlap(pos, r, p, radiusOf(other))) return false
    }
    return true
  }

  for (const m of models) {
    const g = goal(m)
    const r = radiusOf(m)
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
          if (!ok(m, pos)) continue
          const score = dist(pos, g.pos)
          if (score < bestScore - EPS) { bestScore = score; best = pos }
        }
      }
    }
    if (!ok(m, best)) best = m.pos
    placed[m.id] = best
  }
  return placed
}
