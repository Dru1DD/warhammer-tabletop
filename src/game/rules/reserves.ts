import { FACTION_NAME } from '../data/datasheets'
import { armyPoints, unitPoints, copyIndex } from '../data/points'
import { basesOverlap, dist, edgeDistance, EPS, pointInPolygon } from '../geometry/geometry'
import { formation } from '../army/placement'
import { addLog, alive, checkCoherency, hasAbility, other, profileOf, radiusOf, sidesOf, unitsOf } from '../gameState'
import { terrainBlock } from './movement'
import { destroyPassengers, passengersOf } from './transports'
import type { GameState, PlayerId, UnitState, Vec } from '../types'
import { quote, tr } from '../../i18n/index'

// Strategic Reserves (Core Rules 20, 11th edition, Wahapedia): before the battle up to half of the army's points may wait
// off the battlefield. From round 2 a unit arrives in its owner's Movement phase (Ingress Move): wholly within 6″ of a
// battlefield edge and more than 8″ from every enemy model, and before round 3 not in the enemy's deployment zone. Deep
// Strike units may arrive anywhere more than 8″ from the enemy. Rapid Ingress (1 CP): at the end of the opponent's
// Movement phase. Units still in reserve at the end of round 3 are destroyed. Reserve units live in `s.reserves`, off the
// board, so nothing else in the engine sees them (docs/reserves.md).

export const RESERVE_SHARE = 0.5
export const INGRESS_EDGE = 6
export const INGRESS_ENEMY = 8
export const RESERVE_FROM_ROUND = 2
/** units not arrived by the end of this round are destroyed */
export const RESERVE_DEADLINE = 3
export const RAPID_INGRESS_CP = 1

export const reservesOf = (s: GameState, p: PlayerId) => (s.reserves ?? []).filter((u) => u.owner === p)
export const canDeepStrike = (u: UnitState) => hasAbility(u, 'deepStrike')

/** The army's whole cost (on the board and in reserve) and the cost of its reserves. */
export function reserveBudget(s: GameState, p: PlayerId): { army: number; reserved: number; limit: number } {
  const all = [...s.units, ...(s.reserves ?? []), ...(s.embarked ?? [])].filter((u) => u.owner === p)
  const army = armyPoints(all).points
  // units embarked in a transport in reserve count too
  const inReserve = reservesOf(s, p).flatMap((t) => [t, ...passengersOf(s, t.id)])
  const reserved = inReserve.reduce((a, u) => a + unitPoints(u.datasheetId, u.startingModels, copyIndex(all, u)).points, 0)
  return { army, reserved, limit: Math.floor(army * RESERVE_SHARE) }
}

/** Why this unit cannot go into Strategic Reserves (before the battle), or null. */
export function reserveProblem(s: GameState, u: UnitState): string | null {
  const all = [...s.units, ...(s.reserves ?? []), ...(s.embarked ?? [])].filter((x) => x.owner === u.owner)
  const { reserved, limit } = reserveBudget(s, u.owner)
  const cost = unitPoints(u.datasheetId, u.startingModels, copyIndex(all, u)).points
  if (reserved + cost > limit) return tr('Reserves hold at most half of the army’s points: {reserved} + {cost} > {limit}.', { reserved, cost, limit })
  if (unitsOf(s, u.owner).length <= 1) return tr('At least one unit must start the battle on the battlefield.')
  return null
}

/** Move a unit between the board and the reserves (deployment step). */
export function toReserve(s: GameState, unitId: string) {
  const u = s.units.find((x) => x.id === unitId)
  if (!u) return
  s.units = s.units.filter((x) => x !== u)
  ;(s.reserves ??= []).push(u)
}
export function fromReserve(s: GameState, unitId: string) {
  const u = s.reserves?.find((x) => x.id === unitId)
  if (!u) return
  s.reserves = s.reserves!.filter((x) => x !== u)
  s.units.push(u)
}

const zoneOf = (s: GameState, p: PlayerId): Vec[] => s.deployment?.[sidesOf(s)[0] === p ? 'west' : 'east'] ?? []

/** Can `p` make an Ingress Move now: its own Movement phase, or Rapid Ingress at the end of the opponent's? */
export function ingressWindow(s: GameState, p: PlayerId, rapid: boolean): string | null {
  if (s.round < RESERVE_FROM_ROUND) return tr('Reserves arrive from round {round}.', { round: RESERVE_FROM_ROUND })
  if (!rapid) {
    if (s.reaction) return tr('A reaction window is open right now.')
    if (s.activePlayer !== p || s.phase !== 'movement') return tr('Reserves arrive in your own Movement phase (or with Rapid Ingress at the end of the opponent’s Movement phase).')
    return null
  }
  if (s.reaction?.window !== 'beforeShooting' || s.reaction.player !== p) return tr('Rapid Ingress is used at the end of the opponent’s Movement phase.')
  if (s.players[p].rapidIngressUsed) return tr('Rapid Ingress has already been used in this phase.')
  if (s.players[p].cp < RAPID_INGRESS_CP) return tr('You need {cost} CP.', { cost: RAPID_INGRESS_CP })
  return null
}

/** Why the reserve unit cannot be set up at these positions now, or null. */
export function arrivalProblem(s: GameState, u: UnitState, positions: Record<string, Vec>, rapid = false): string | null {
  const when = ingressWindow(s, u.owner, rapid)
  if (when) return when
  const foes = s.units.filter((x) => x.owner !== u.owner).flatMap(alive)
  const others = s.units.flatMap(alive)
  const deep = canDeepStrike(u)
  const foeZone = zoneOf(s, other(s, u.owner))
  const final = alive(u).map((m) => ({ m, pos: positions[m.id] }))
  for (const { m, pos } of final) {
    const name = profileOf(m).name
    if (!pos) return tr('{name}: no position.', { name })
    const r = radiusOf(m)
    if (pos.x - r < -EPS || pos.y - r < -EPS || pos.x + r > s.board.width + EPS || pos.y + r > s.board.height + EPS) return tr('{name}: the base goes beyond the edge of the board.', { name })
    if (!deep) {
      const edge = Math.min(pos.x + r, pos.y + r, s.board.width - pos.x + r, s.board.height - pos.y + r)
      if (edge > INGRESS_EDGE + EPS) return tr('{name}: from Reserves the unit is set up wholly within {edge}″ of a board edge (it has no Deep Strike).', { name, edge: INGRESS_EDGE })
      if (s.round < RESERVE_DEADLINE && pointInPolygon(pos, foeZone)) return tr('{name}: before round {round} — not in the enemy deployment zone.', { name, round: RESERVE_DEADLINE })
    }
    if (foes.some((f) => edgeDistance(pos, r, f.pos, radiusOf(f)) <= INGRESS_ENEMY + EPS)) return tr('{name}: more than {range}″ from all enemy models.', { name, range: INGRESS_ENEMY })
    if (others.some((o) => basesOverlap(pos, r, o.pos, radiusOf(o)))) return tr('{name}: the base overlaps another model.', { name })
    const tb = terrainBlock(s, u, r, pos, pos, true)
    if (tb) return tr('{name}: {problem}', { name, problem: tb })
    for (const f of final) if (f.m !== m && f.pos && basesOverlap(pos, r, f.pos, radiusOf(f.m))) return tr('{name}: the unit’s model bases overlap each other.', { name })
  }
  return checkCoherency(final.map((f) => ({ m: f.m, pos: f.pos! })))
}

/** Set up the unit from reserves (the command was validated). It counts as having made a Normal move. */
export function arrive(s: GameState, unitId: string, positions: Record<string, Vec>, rapid: boolean) {
  const u = s.reserves!.find((x) => x.id === unitId)!
  s.reserves = s.reserves!.filter((x) => x !== u)
  for (const m of u.models) if (positions[m.id]) m.pos = { ...positions[m.id] }
  u.move = 'normal'
  u.movedDistance = INGRESS_EDGE
  u.setUpThisTurn = true
  s.units.push(u)
  if (rapid) {
    s.players[u.owner].cp -= RAPID_INGRESS_CP
    s.players[u.owner].rapidIngressUsed = true
  }
  const p = { faction: FACTION_NAME[u.owner], name: quote(u.name), cost: RAPID_INGRESS_CP }
  addLog(s, rapid ? tr('{faction}: {name} — Rapid Ingress ({cost} CP). The unit moves no more this turn.', p) : canDeepStrike(u) ? tr('{faction}: {name} — Deep Strike. The unit moves no more this turn.', p) : tr('{faction}: {name} — arrives from Reserves. The unit moves no more this turn.', p), 'minimal')
}

/** End of round 3: units still in reserve are destroyed (they join the board's list as destroyed units). */
export function expireReserves(s: GameState) {
  if (!s.reserves?.length || s.round < RESERVE_DEADLINE) return
  for (const u of s.reserves) {
    for (const m of u.models) m.destroyed = true
    destroyPassengers(s, u)
    s.units.push(u)
    addLog(s, tr('{faction}: {name} never came out of Reserves by the end of round {round} — the unit is destroyed.', { faction: FACTION_NAME[u.owner], name: quote(u.name), round: RESERVE_DEADLINE }), 'minimal')
  }
  s.reserves = []
}

/** Model positions of the unit as a formation anchored at `a`: rows along `dir` (0: offsets as is, 1: swapped axes), mirrored by `sx`, `sy`. */
function laid(u: UnitState, a: Vec, offs: { dx: number; dy: number }[], swap: boolean, sx: number, sy: number): Record<string, Vec> {
  return Object.fromEntries(alive(u).map((m, i) => {
    const o = offs[i] ?? { dx: 0, dy: 0 }
    const dx = swap ? o.dy : o.dx, dy = swap ? o.dx : o.dy
    return [m.id, { x: a.x + sx * dx, y: a.y + sy * dy }]
  }))
}

/** A legal set-up for the reserve unit as close as possible to `near`, or null (tries ~600 anchors nearest to it). */
export function arrivalSpot(s: GameState, u: UnitState, near: Vec, rapid = false): Record<string, Vec> | null {
  if (ingressWindow(s, u.owner, rapid)) return null
  const live = { ...u, models: alive(u) }
  const offs = formation(live, canDeepStrike(u) ? 12 : INGRESS_EDGE)
  const r = Math.max(...alive(u).map(radiusOf))
  const anchors: Vec[] = []
  // Deep Strike: anywhere; otherwise only the 6″ bands along the edges can hold the unit
  const deep = canDeepStrike(u)
  const W = s.board.width, H = s.board.height
  for (let x = r; x <= W - r; x += 1)
    for (let y = r; y <= H - r; y += 1)
      if (deep || x <= INGRESS_EDGE || x >= W - INGRESS_EDGE || y <= INGRESS_EDGE || y >= H - INGRESS_EDGE) anchors.push({ x, y })
  anchors.sort((a, b) => dist(a, near) - dist(b, near))
  for (const a of anchors.slice(0, 600))
    for (const swap of [false, true])
      for (const sx of [1, -1])
        for (const sy of [1, -1]) {
          const pos = laid(u, a, offs, swap, sx, sy)
          if (!arrivalProblem(s, u, pos, rapid)) return pos
        }
  return null
}

/** Spots worth offering for a reserve unit: the legal set-up nearest to each objective (one per objective). */
export function arrivalChoices(s: GameState, u: UnitState, rapid = false): { label: string; positions: Record<string, Vec> }[] {
  const out: { label: string; positions: Record<string, Vec> }[] = []
  s.objectives.forEach((o, i) => {
    const pos = arrivalSpot(s, u, o.pos, rapid)
    if (!pos) return
    const c = Object.values(pos)[0]
    if (out.some((x) => dist(Object.values(x.positions)[0], c) < 2)) return
    out.push({ label: tr('at objective {obj}', { obj: tr('O{value}', { value: i + 1 }) }), positions: pos })
  })
  return out
}

/** Where the AI brings a reserve unit: the objective it does not hold that is nearest to the enemy's side. */
export function aiArrivalTarget(s: GameState, p: PlayerId): Vec {
  const foeZone = zoneOf(s, other(s, p))
  const fc = foeZone.length ? foeZone.reduce((a, v) => ({ x: a.x + v.x / foeZone.length, y: a.y + v.y / foeZone.length }), { x: 0, y: 0 }) : { x: s.board.width / 2, y: s.board.height / 2 }
  const open = s.objectives.filter((o) => o.controller !== p)
  const list = open.length ? open : s.objectives
  return [...list].sort((a, b) => dist(a.pos, fc) - dist(b.pos, fc))[0]?.pos ?? fc
}

/** Before the battle the AI keeps its Deep Strike units in reserve (within the points limit). */
export function aiReserves(s: GameState, p: PlayerId) {
  for (const u of unitsOf(s, p).filter(canDeepStrike)) if (!reserveProblem(s, u)) toReserve(s, u.id)
}
