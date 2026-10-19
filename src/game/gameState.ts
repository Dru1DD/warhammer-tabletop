import { DATASHEETS, PROFILES, WEAPONS } from './data/datasheets'
import { baseRadius, edgeDistance, withinRange, circlePolygonDistance } from './geometry/geometry'
import type { GameState, ModelProfile, ModelState, Objective, PlayerId, UnitState, Vec } from './types'

export const SCHEMA_VERSION = 1
export const ENGAGEMENT_RANGE = 2
export const COHERENCY_NEAR = 2
export const COHERENCY_ALL = 9
export const CHARGE_RANGE = 12
export const PILE_IN = 3
export const CONSOLIDATE = 3
export const OBJECTIVE_RANGE = 3
export const OBJECTIVE_MARKER_MM = 40

export const other = (p: PlayerId): PlayerId => (p === 'marines' ? 'orks' : 'marines')

export const profileOf = (m: ModelState): ModelProfile => PROFILES[m.profileId]
export const radiusOf = (m: ModelState) => baseRadius(profileOf(m).baseMm)
export const datasheetOf = (u: UnitState) => DATASHEETS[u.datasheetId]
export const hasAbility = (u: UnitState, a: string) => datasheetOf(u).abilities.includes(a as never)
export const alive = (u: UnitState) => u.models.filter((m) => !m.destroyed)
export const isDestroyed = (u: UnitState) => alive(u).length === 0
export const weaponsOf = (m: ModelState) => profileOf(m).weapons.map((id) => WEAPONS[id])

export function getUnit(s: GameState, id: string): UnitState {
  const u = s.units.find((x) => x.id === id)
  if (!u) throw new Error(`unknown unit ${id}`)
  return u
}

export const findUnit = (s: GameState, id: string) => s.units.find((x) => x.id === id)
export const unitsOf = (s: GameState, p: PlayerId) => s.units.filter((u) => u.owner === p && !isDestroyed(u))
export const enemiesOf = (s: GameState, u: UnitState) => unitsOf(s, other(u.owner))

export function modelDistance(a: ModelState, b: ModelState, aPos: Vec = a.pos, bPos: Vec = b.pos) {
  return edgeDistance(aPos, radiusOf(a), bPos, radiusOf(b))
}

/** Closest edge-to-edge distance between two units. */
export function unitDistance(a: UnitState, b: UnitState): number {
  let d = Infinity
  for (const ma of alive(a)) for (const mb of alive(b)) d = Math.min(d, modelDistance(ma, mb))
  return d
}

export const modelEngagedWith = (m: ModelState, enemy: UnitState, pos: Vec = m.pos) =>
  alive(enemy).some((e) => withinRange(modelDistance(m, e, pos), ENGAGEMENT_RANGE))

export const engagedUnits = (s: GameState, u: UnitState) =>
  enemiesOf(s, u).filter((e) => withinRange(unitDistance(u, e), ENGAGEMENT_RANGE))

export const isEngaged = (s: GameState, u: UnitState) => engagedUnits(s, u).length > 0

/** Half-strength: multi-model units — models remaining ≤ half of starting
 * strength; single-model units — wounds remaining ≤ half of W. (Approximation,
 * see docs/research.md.) */
export function atHalfStrength(u: UnitState): boolean {
  const a = alive(u)
  if (u.startingModels === 1) return a.length === 0 || a[0].wounds * 2 <= profileOf(a[0]).w
  return a.length * 2 <= u.startingModels
}

export const modelInObjectiveRange = (m: ModelState, o: Objective, pos: Vec = m.pos) =>
  withinRange(edgeDistance(pos, radiusOf(m), o.pos, baseRadius(OBJECTIVE_MARKER_MM)), OBJECTIVE_RANGE)

export const unitNearObjective = (u: UnitState, o: Objective) => alive(u).some((m) => modelInObjectiveRange(m, o))

export function objectiveLevels(s: GameState, o: Objective): Record<PlayerId, number> {
  const lv: Record<PlayerId, number> = { marines: 0, orks: 0 }
  for (const u of s.units) {
    if (u.battleShocked) continue
    for (const m of alive(u)) if (modelInObjectiveRange(m, o)) lv[u.owner] += profileOf(m).oc
  }
  return lv
}

export function updateObjectiveControl(s: GameState) {
  for (const o of s.objectives) {
    const lv = objectiveLevels(s, o)
    o.controller = lv.marines > lv.orks ? 'marines' : lv.orks > lv.marines ? 'orks' : null
  }
}

export const modelInTerrain = (s: GameState, m: ModelState, pos: Vec = m.pos) =>
  s.terrain.some((t) => circlePolygonDistance(pos, radiusOf(m), t.poly) === 0)

export function addLog(s: GameState, text: string, level: GameState['log'][number]['level'] = 'standard') {
  s.log.push({ id: s.nextId++, round: s.round, player: s.activePlayer, phase: s.phase, text, level })
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400)
}

export function checkCoherency(models: { m: ModelState; pos: Vec }[]): string | null {
  if (models.length < 2) return null
  for (const a of models) {
    let near = false
    for (const b of models) {
      if (a === b) continue
      const d = modelDistance(a.m, b.m, a.pos, b.pos)
      if (withinRange(d, COHERENCY_NEAR)) near = true
      if (!withinRange(d, COHERENCY_ALL))
        return `${profileOf(a.m).name} дальше ${COHERENCY_ALL}" от другой модели отряда — нарушена связность (coherency).`
    }
    if (!near) return `${profileOf(a.m).name} не в пределах ${COHERENCY_NEAR}" ни от одной модели отряда — нарушена связность (coherency).`
  }
  return null
}

export const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')
