// Healing and reviving (core rules 02.02.04): healing returns lost wounds first (damaged models),
// then revives destroyed non-CHARACTER models with ONE wound remaining. A unit never grows beyond
// its starting strength (revived models were part of it). Used by Necron Reanimation Protocols.

import { basesOverlap, dist, EPS } from '../geometry/geometry'
import { alive, checkCoherency, enemiesOf, ENGAGEMENT_RANGE, profileOf, radiusOf } from '../gameState'
import { terrainBlock } from './movement'
import type { GameState, ModelState, UnitState, Vec } from '../types'

/** Where a revived model of `u` can stand: touching-ish a living model, legal base, outside engagement range. */
export function reviveSpot(s: GameState, u: UnitState, m: ModelState): Vec | null {
  const r = radiusOf(m)
  const living = alive(u)
  if (!living.length) return null
  const everyone = s.units.flatMap(alive)
  const foes = enemiesOf(s, u).flatMap(alive)
  for (const gap of [0.05, 0.4, 0.8, 1.2, 1.6]) {
    for (const anchor of living) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        const d = r + radiusOf(anchor) + gap
        const pos = { x: anchor.pos.x + Math.cos(a) * d, y: anchor.pos.y + Math.sin(a) * d }
        if (pos.x - r < 0 || pos.y - r < 0 || pos.x + r > s.board.width || pos.y + r > s.board.height) continue
        if (everyone.some((o) => basesOverlap(pos, r, o.pos, radiusOf(o)))) continue
        if (terrainBlock(s, u, r, pos, pos, true)) continue
        if (foes.some((f) => dist(pos, f.pos) - r - radiusOf(f) <= ENGAGEMENT_RANGE + EPS)) continue
        if (checkCoherency([...living, m].map((x) => ({ m: x, pos: x === m ? pos : x.pos })))) continue
        return pos
      }
    }
  }
  return null
}

/** Mutates `u`. `n` = wounds to regain. */
export function healUnit(s: GameState, u: UnitState, n: number): { healed: number; revived: number } {
  let left = n
  let healed = 0
  let revived = 0
  for (const m of alive(u)) {
    const lost = profileOf(m).w - m.wounds
    const take = Math.min(lost, left)
    m.wounds += take
    left -= take
    healed += take
  }
  for (const m of u.models) {
    if (left <= 0) break
    if (!m.destroyed || profileOf(m).character) continue
    const spot = reviveSpot(s, u, m)
    if (!spot) continue
    m.destroyed = false
    m.wounds = 1
    m.pos = spot
    left--
    revived++
  }
  return { healed, revived }
}

