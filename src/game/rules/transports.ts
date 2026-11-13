import { FACTION_NAME } from '../data/datasheets'
import { basesOverlap, dist, edgeDistance, EPS } from '../geometry/geometry'
import { addLog, alive, checkCoherency, datasheetOf, ENGAGEMENT_RANGE, hasKeyword, isDestroyed, profileOf, radiusOf, unitsOf, weaponsOf } from '../gameState'
import { terrainBlock } from './movement'
import type { GameState, PlayerId, TransportSpec, UnitState, Vec, Weapon } from '../types'
import { quote, tr } from '../../i18n/index'

// Transports (Core Rules 18, 11th edition, Wahapedia): a TRANSPORT carries units up to its capacity. Units start the battle
// embarked or embark after their move (every model within 3″); they disembark in their Movement phase, wholly within 3″:
// Tactical when the transport has not moved yet (the unit then moves as usual), Rapid when it already moved (no charge
// this turn). When a transport is destroyed, its passengers make an Emergency Disembark: within 6″, as close as possible,
// a hazard roll per model, then battle-shocked and no charge. Embarked units live in `s.embarked`, off the board, so the
// rest of the engine does not see them (docs/transports.md).

export const EMBARK_RANGE = 3
export const DISEMBARK_RANGE = 3
export const EMERGENCY_RANGE = 6

export const transportSpec = (u: UnitState): TransportSpec | undefined => datasheetOf(u).transport
export const isTransport = (u: UnitState) => !!transportSpec(u)
export const passengersOf = (s: GameState, transportId: string) => (s.embarked ?? []).filter((u) => u.embarkedIn === transportId)
export const embarkedOf = (s: GameState, p: PlayerId) => (s.embarked ?? []).filter((u) => u.owner === p)
const usedCapacity = (s: GameState, t: UnitState) => passengersOf(s, t.id).reduce((a, u) => a + alive(u).length, 0)
/** A transport's hull as a round base: its centre and radius (the first living model). */
const hull = (t: UnitState) => {
  const m = alive(t)[0] ?? t.models[0]
  return { c: m.pos, r: radiusOf(m) }
}

/** Why this unit cannot ride in this transport at all (keywords, capacity), or null. */
export function carryProblem(s: GameState, u: UnitState, t: UnitState): string | null {
  const spec = transportSpec(t)
  if (!spec) return tr('{name} is not a transport.', { name: quote(t.name) })
  if (t.owner !== u.owner) return tr('Only a friendly transport.')
  if (isTransport(u)) return tr('A transport cannot embark in another transport.')
  if (!spec.keywords.every((k) => hasKeyword(u, k)) || (spec.exclude ?? []).some((k) => hasKeyword(u, k)))
    return tr('{transport} carries only {kinds}.', { transport: quote(t.name), kinds: spec.label })
  const free = spec.capacity - usedCapacity(s, t)
  if (alive(u).length > free) return tr('Not enough room: {models} models, {free} places left of {capacity}.', { models: alive(u).length, free, capacity: spec.capacity })
  return null
}

/** Why this unit cannot embark now (after its move, every model within 3″ of the transport), or null. */
export function embarkProblem(s: GameState, u: UnitState, t: UnitState): string | null {
  const c = carryProblem(s, u, t)
  if (c) return c
  if (isDestroyed(t)) return tr('The transport is destroyed.')
  if (s.phase !== 'movement' || s.activePlayer !== u.owner) return tr('Units embark in your own Movement phase.')
  if (u.move === 'none') return tr('A unit embarks after it has moved (a Normal move, an Advance or a Fall Back).')
  if (u.setUpThisTurn) return tr('A unit set up on the battlefield this turn cannot embark.')
  const h = hull(t)
  if (!alive(u).every((m) => edgeDistance(m.pos, radiusOf(m), h.c, h.r) <= EMBARK_RANGE + EPS))
    return tr('Every model must be within {range}″ of the transport.', { range: EMBARK_RANGE })
  return null
}

/** Put the unit inside the transport (removed from the board). */
export function embark(s: GameState, unitId: string, transportId: string, quiet = false) {
  const u = s.units.find((x) => x.id === unitId)!
  const t = s.units.find((x) => x.id === transportId)!
  s.units = s.units.filter((x) => x !== u)
  u.embarkedIn = t.id
  u.embarkedThisPhase = true
  ;(s.embarked ??= []).push(u)
  if (!quiet) addLog(s, tr('{name} embarks in {transport}.', { name: quote(u.name), transport: quote(t.name) }), 'minimal')
}

/** During deployment: take the unit out of its transport again (it has to be set up). */
export function leaveBeforeBattle(s: GameState, unitId: string) {
  const u = s.embarked?.find((x) => x.id === unitId)
  if (!u) return
  s.embarked = s.embarked!.filter((x) => x !== u)
  delete u.embarkedIn
  delete u.embarkedThisPhase
  s.units.push(u)
}

/** Tactical (the transport has not moved yet: the unit moves afterwards) or Rapid (it has: no charge this turn). */
export const disembarkMode = (t: UnitState): 'tactical' | 'rapid' => (t.move === 'none' ? 'tactical' : 'rapid')

/** Why this embarked unit cannot disembark now, or null. */
export function disembarkWindow(s: GameState, u: UnitState): string | null {
  const t = s.units.find((x) => x.id === u.embarkedIn)
  if (!t || isDestroyed(t)) return tr('The transport is not on the battlefield.')
  if (s.phase !== 'movement' || s.activePlayer !== u.owner || s.reaction) return tr('Units disembark in your own Movement phase.')
  if (u.embarkedThisPhase) return tr('The unit embarked this phase.')
  if (t.move === 'advance' || t.move === 'fallBack')
    return tr('The transport Advanced or Fell Back this phase: nobody can disembark (a Combat disembark is not in the game).')
  return null
}

/** Why the models cannot be set up at these positions (around a hull at `c`, radius `r`, within `range`), or null. */
function placementProblem(s: GameState, u: UnitState, positions: Record<string, Vec>, c: Vec, r: number, range: number, allowEngaged: boolean): string | null {
  const foes = s.units.filter((x) => x.owner !== u.owner).flatMap(alive)
  const others = s.units.filter((x) => x.id !== u.id).flatMap(alive)
  const final = alive(u).map((m) => ({ m, pos: positions[m.id] }))
  for (const { m, pos } of final) {
    const name = profileOf(m).name
    if (!pos) return tr('{name}: no position.', { name })
    const mr = radiusOf(m)
    if (pos.x - mr < -EPS || pos.y - mr < -EPS || pos.x + mr > s.board.width + EPS || pos.y + mr > s.board.height + EPS) return tr('{name}: the base goes beyond the edge of the board.', { name })
    // wholly within range: the far side of the base is within `range` of the hull
    if (edgeDistance(pos, mr, c, r) + 2 * mr > range + EPS) return tr('{name}: set up wholly within {range}″ of the transport.', { name, range })
    if (!allowEngaged && foes.some((f) => edgeDistance(pos, mr, f.pos, radiusOf(f)) <= ENGAGEMENT_RANGE + EPS)) return tr('{name}: cannot be set up within Engagement Range of an enemy.', { name })
    if (others.some((o) => basesOverlap(pos, mr, o.pos, radiusOf(o)))) return tr('{name}: the base overlaps another model.', { name })
    const tb = terrainBlock(s, u, mr, pos, pos, true)
    if (tb) return `${name}: ${tb}`
    for (const f of final) if (f.m !== m && f.pos && basesOverlap(pos, mr, f.pos, radiusOf(f.m))) return tr('{name}: the unit’s model bases overlap each other.', { name })
  }
  return checkCoherency(final.map((f) => ({ m: f.m, pos: f.pos! })))
}

/** Why the unit cannot disembark at these positions now, or null. */
export function disembarkProblem(s: GameState, u: UnitState, positions: Record<string, Vec>): string | null {
  const w = disembarkWindow(s, u)
  if (w) return w
  const h = hull(s.units.find((x) => x.id === u.embarkedIn)!)
  return placementProblem(s, u, positions, h.c, h.r, DISEMBARK_RANGE, false)
}

/** Ring slots around a hull for one model: from the hull outwards, every ~0.5″ along each ring. */
function slots(c: Vec, hr: number, mr: number, range: number): Vec[] {
  const out: Vec[] = []
  for (let d = hr + mr + 0.05; d + mr <= hr + range + EPS; d += 2 * mr + 0.1) {
    const n = Math.max(8, Math.floor((2 * Math.PI * d) / (2 * mr + 0.1)))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      out.push({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d })
    }
  }
  return out
}

/** Set the unit's models up around a hull: the free slots nearest to `near` first (or nearest the hull when `near` is
 * null). Returns the positions of the models that fit; the caller decides what to do with the rest. */
function placeAround(s: GameState, u: UnitState, c: Vec, hr: number, range: number, near: Vec | null, allowEngaged: boolean): Record<string, Vec> {
  const ms = alive(u)
  const mr = Math.max(...ms.map(radiusOf))
  const foes = s.units.filter((x) => x.owner !== u.owner).flatMap(alive)
  const others = s.units.filter((x) => x.id !== u.id).flatMap(alive)
  const free = slots(c, hr, mr, range).filter((p) =>
    p.x - mr >= 0 && p.y - mr >= 0 && p.x + mr <= s.board.width && p.y + mr <= s.board.height &&
    !others.some((o) => basesOverlap(p, mr, o.pos, radiusOf(o))) &&
    (allowEngaged || !foes.some((f) => edgeDistance(p, mr, f.pos, radiusOf(f)) <= ENGAGEMENT_RANGE + EPS)) &&
    !terrainBlock(s, u, mr, p, p, true))
  const key = near ? (p: Vec) => dist(p, near) : (p: Vec) => dist(p, c)
  free.sort((a, b) => key(a) - key(b))
  const out: Record<string, Vec> = {}
  const taken: Vec[] = []
  for (const m of ms) {
    const p = free.find((q) => !taken.some((t) => basesOverlap(q, radiusOf(m), t, mr)))
    if (!p) break
    out[m.id] = p
    taken.push(p)
  }
  return out
}

/** A legal disembark set-up near `near`, or null. */
export function disembarkSpot(s: GameState, u: UnitState, near: Vec): Record<string, Vec> | null {
  if (disembarkWindow(s, u)) return null
  const h = hull(s.units.find((x) => x.id === u.embarkedIn)!)
  // try the requested side first, then the other sides of the hull
  const tries = [near, ...[0, 1, 2, 3, 4, 5].map((i) => ({ x: h.c.x + Math.cos((i * Math.PI) / 3) * 10, y: h.c.y + Math.sin((i * Math.PI) / 3) * 10 }))]
  for (const n of tries) {
    const pos = placeAround(s, u, h.c, h.r, DISEMBARK_RANGE, n, false)
    if (Object.keys(pos).length === alive(u).length && !placementProblem(s, u, pos, h.c, h.r, DISEMBARK_RANGE, false)) return pos
  }
  return null
}

/** Set the unit up out of its transport (the command was validated). Tactical: it moves afterwards; Rapid: it counts
 * as having moved and cannot charge this turn. */
export function disembark(s: GameState, unitId: string, positions: Record<string, Vec>) {
  const u = s.embarked!.find((x) => x.id === unitId)!
  const t = s.units.find((x) => x.id === u.embarkedIn)!
  const mode = disembarkMode(t)
  s.embarked = s.embarked!.filter((x) => x !== u)
  delete u.embarkedIn
  delete u.embarkedThisPhase
  for (const m of u.models) if (positions[m.id]) m.pos = { ...positions[m.id] }
  u.setUpThisTurn = true
  if (mode === 'rapid') {
    u.move = 'normal'
    u.noChargeThisTurn = true
  } else u.move = 'none'
  s.units.push(u)
  addLog(s, mode === 'tactical'
    ? tr('{name} disembarks from {transport} (Tactical): it can still make its move this phase.', { name: quote(u.name), transport: quote(t.name) })
    : tr('{name} disembarks from {transport} (Rapid: the transport already moved) — no further move and no charge this turn.', { name: quote(u.name), transport: quote(t.name) }), 'minimal')
}

/** Emergency disembark of every unit inside a destroyed transport: within 6″, as close as possible (unengaged if it
 * can), models that do not fit are destroyed. Returns the units and how many models each one has to roll hazard for. */
export function emergencyDisembark(s: GameState, t: UnitState): { unit: UnitState; models: number }[] {
  const out: { unit: UnitState; models: number }[] = []
  const h = hull(t)
  for (const u of passengersOf(s, t.id)) {
    s.embarked = s.embarked!.filter((x) => x !== u)
    delete u.embarkedIn
    delete u.embarkedThisPhase
    let pos = placeAround(s, u, h.c, h.r, EMERGENCY_RANGE, null, false)
    if (Object.keys(pos).length < alive(u).length) pos = placeAround(s, u, h.c, h.r, EMERGENCY_RANGE, null, true)
    let lost = 0
    for (const m of alive(u)) {
      if (pos[m.id]) m.pos = { ...pos[m.id] }
      else { m.destroyed = true; lost++ }
    }
    u.battleShocked = true
    u.noChargeThisTurn = true
    u.setUpThisTurn = true
    s.units.push(u)
    addLog(s, tr('{transport} is destroyed: {name} makes an Emergency Disembark — battle-shocked, no charge this turn.{lost}', { transport: quote(t.name), name: quote(u.name), lost: lost ? ' ' + tr('{lost} models had no room and are destroyed.', { lost }) : '' }), 'minimal')
    out.push({ unit: u, models: alive(u).length })
  }
  return out
}

/** Transports in the Strategic Reserves that are destroyed at the deadline take their passengers with them. */
export function destroyPassengers(s: GameState, t: UnitState) {
  for (const u of passengersOf(s, t.id)) {
    s.embarked = s.embarked!.filter((x) => x !== u)
    delete u.embarkedIn
    for (const m of u.models) m.destroyed = true
    s.units.push(u)
    addLog(s, tr('{name} is destroyed with its transport {transport}.', { name: quote(u.name), transport: quote(t.name) }), 'minimal')
  }
}

/** Start of the battle: a DEDICATED TRANSPORT nobody embarked in is removed (it does not count as destroyed). */
export function removeEmptyDedicated(s: GameState) {
  for (const t of s.units.filter((u) => !isDestroyed(u) && hasKeyword(u, 'DEDICATED TRANSPORT'))) {
    if (passengersOf(s, t.id).length) continue
    s.units = s.units.filter((x) => x !== t)
    addLog(s, tr('{faction}: {transport} is a Dedicated Transport with nobody inside — it is removed before the battle.', { faction: FACTION_NAME[t.owner], transport: quote(t.name) }), 'minimal')
  }
}

/** Firing Deck X: up to X embarked models lend one ranged weapon each (not One Shot) to the transport's volley. */
export function firingDeckWeapons(s: GameState, t: UnitState): Weapon[] {
  const n = transportSpec(t)?.firingDeck ?? 0
  if (!n) return []
  const out: Weapon[] = []
  for (const u of passengersOf(s, t.id))
    for (const m of alive(u)) {
      if (out.length >= n) return out
      const w = weaponsOf(m).find((x) => x.profiles[0].range !== 'melee' && !x.profiles[0].keywords.oneShot)
      if (w) out.push(w)
    }
  return out
}

/** Before the battle the AI fills each of its Dedicated Transports with the first unit that fits. */
export function aiEmbark(s: GameState, p: PlayerId) {
  for (const t of unitsOf(s, p).filter((u) => hasKeyword(u, 'DEDICATED TRANSPORT'))) {
    if (passengersOf(s, t.id).length) continue
    const u = unitsOf(s, p).find((x) => x.id !== t.id && !carryProblem(s, x, t))
    if (u) embark(s, u.id, t.id, true)
  }
}
