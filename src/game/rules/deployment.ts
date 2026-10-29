import { basesOverlap, EPS, pointInPolygon, pointSegmentDistance } from '../geometry/geometry'
import { alive, checkCoherency, profileOf, radiusOf, unitsOf } from '../gameState'
import { terrainBlock } from './movement'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, PlayerId, UnitState, Vec } from '../types'

// Deployment = setting up units before round 1. Rule used here: every base
// wholly within the player's deployment zone, on the board, no overlapping
// bases, unit in coherency, not inside solid terrain, non-INFANTRY not inside
// dense terrain (see docs/research.md).

export const deploymentZone = (s: GameState, p: PlayerId): Vec[] => scenarioById(s.scenarioId).deployment[p]

/** Base of radius r at c lies entirely inside the polygon. */
export function baseWhollyWithin(c: Vec, r: number, poly: Vec[]): boolean {
  if (!pointInPolygon(c, poly)) return false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (pointSegmentDistance(c, poly[j], poly[i]) < r - EPS) return false
  return true
}

/** Reason the unit cannot be set up at `positions` (missing = current), or null. */
export function deploymentProblem(s: GameState, unit: UnitState, positions: Record<string, Vec>): string | null {
  const zone = deploymentZone(s, unit.owner)
  const final = alive(unit).map((m) => ({ m, pos: positions[m.id] ?? m.pos }))
  const others = s.units.flatMap((u) => (u.id === unit.id ? [] : alive(u)))
  for (const { m, pos } of final) {
    const r = radiusOf(m)
    const name = profileOf(m).name
    if (pos.x - r < -EPS || pos.y - r < -EPS || pos.x + r > s.board.width + EPS || pos.y + r > s.board.height + EPS)
      return `${name}: подставка выходит за край поля.`
    if (!baseWhollyWithin(pos, r, zone))
      return `${name}: подставка должна целиком стоять в вашей зоне развёртывания — передвиньте модель внутрь подсвеченной области.`
    for (const o of others) if (basesOverlap(pos, r, o.pos, radiusOf(o))) return `${name}: подставка пересекается с моделью другого отряда.`
    const tb = terrainBlock(s, unit, r, pos, pos, true)
    if (tb) return `${name}: ${tb}`
    for (const f of final) if (f.m !== m && basesOverlap(pos, r, f.pos, radiusOf(f.m))) return `${name}: подставки моделей отряда пересекаются.`
  }
  return checkCoherency(final)
}

/** Problems that block finishing deployment for player `p`, given the set of placed unit ids. */
export function deploymentIssues(s: GameState, p: PlayerId, placed: string[]): string[] {
  const out: string[] = []
  for (const u of unitsOf(s, p)) {
    if (!placed.includes(u.id)) out.push(`«${u.name}» ещё не расставлен.`)
    else {
      const why = deploymentProblem(s, u, {})
      if (why) out.push(`«${u.name}»: ${why}`)
    }
  }
  return out
}
