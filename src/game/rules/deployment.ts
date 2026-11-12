import { basesOverlap, circlePolygonDistance, EPS, pointInPolygon, pointSegmentDistance } from '../geometry/geometry'
import { alive, checkCoherency, enemiesOf, hasAbility, modelDistance, other, profileOf, radiusOf, sidesOf, unitsOf } from '../gameState'
import { terrainBlock } from './movement'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, PlayerId, UnitState, Vec } from '../types'
import { quote, tr } from '../../i18n/index'

// Deployment = setting up units before round 1. Rule used here: every base
// wholly within the player's deployment zone, on the board, no overlapping
// bases, unit in coherency, not inside solid terrain, non-INFANTRY not inside
// dense terrain (see docs/research.md).

export const deploymentZone = (s: GameState, p: PlayerId): Vec[] => (s.deployment ?? scenarioById(s.scenarioId).deployment)[sidesOf(s)[0] === p ? 'west' : 'east']

/** Base of radius r at c lies entirely inside the polygon. */
export function baseWhollyWithin(c: Vec, r: number, poly: Vec[]): boolean {
  if (!pointInPolygon(c, poly)) return false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (pointSegmentDistance(c, poly[j], poly[i]) < r - EPS) return false
  return true
}

/** Infiltrators: no deployment-zone limit, but more than this far from the enemy zone and every enemy model. */
export const INFILTRATE_DISTANCE = 8

/** Reason the unit cannot be set up at `positions` (missing = current), or null. */
export function deploymentProblem(s: GameState, unit: UnitState, positions: Record<string, Vec>): string | null {
  const zone = deploymentZone(s, unit.owner)
  const final = alive(unit).map((m) => ({ m, pos: positions[m.id] ?? m.pos }))
  const others = s.units.flatMap((u) => (u.id === unit.id ? [] : alive(u)))
  const infiltrates = hasAbility(unit, 'infiltrators')
  const foes = infiltrates ? enemiesOf(s, unit).flatMap(alive) : []
  for (const { m, pos } of final) {
    const r = radiusOf(m)
    const name = profileOf(m).name
    if (pos.x - r < -EPS || pos.y - r < -EPS || pos.x + r > s.board.width + EPS || pos.y + r > s.board.height + EPS)
      return tr('{name}: the base goes beyond the edge of the field.', { name })
    if (infiltrates) {
      const foeZone = deploymentZone(s, other(s, unit.owner))
      if (circlePolygonDistance(pos, r, foeZone) <= INFILTRATE_DISTANCE + EPS)
        return tr('{name}: Infiltrators are set up more than {INFILTRATE_DISTANCE}″ from the enemy deployment zone.', { name, INFILTRATE_DISTANCE })
      if (foes.some((f) => modelDistance(m, f, pos) <= INFILTRATE_DISTANCE + EPS))
        return tr('{name}: Infiltrators are set up more than {INFILTRATE_DISTANCE}″ from enemy models.', { name, INFILTRATE_DISTANCE })
    } else if (!baseWhollyWithin(pos, r, zone))
      return tr('{name}: the base must stand entirely in your deployment zone — move the model inside the highlighted area.', { name })
    for (const o of others) if (basesOverlap(pos, r, o.pos, radiusOf(o))) return tr('{name}: the base overlaps a model of another unit.', { name })
    const tb = terrainBlock(s, unit, r, pos, pos, true)
    if (tb) return `${name}: ${tb}`
    for (const f of final) if (f.m !== m && basesOverlap(pos, r, f.pos, radiusOf(f.m))) return tr('{name}: the unit’s model bases overlap.', { name })
  }
  return checkCoherency(final)
}

/** Problems that block finishing deployment for player `p`, given the set of placed unit ids. */
export function deploymentIssues(s: GameState, p: PlayerId, placed: string[]): string[] {
  const out: string[] = []
  for (const u of unitsOf(s, p)) {
    if (!placed.includes(u.id)) out.push(tr('“{name}” has not been placed yet.', { name: u.name }))
    else {
      const why = deploymentProblem(s, u, {})
      if (why) out.push(`${quote(u.name)}: ${why}`)
    }
  }
  return out
}
