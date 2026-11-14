import { pointInPolygon, segmentCrossesPolygon } from '../geometry/geometry'
import { alive, other, radiusOf, sidesOf, unitsOf } from '../gameState'
import { deploymentProblem, deploymentZone } from '../rules/deployment'
import type { GameState, PlayerId, UnitState, Vec } from '../types'
import { footprint, formation } from './placement'
import { unitProfile, type UnitProfile, type UnitRole } from './roles'
import { tr } from '../../i18n/index'

// Deployment presets: one click sets up a whole army in a doctrine (storm forward, gun line, hold the
// objectives, hide). A preset is not a list of positions but weights per unit role (army/roles.ts), so it
// fits any army on any board: a solver tries every legal spot in the deployment zone and gives each unit
// the best one for its role. The same presets set up the AI's army.

export type DeployPresetId = 'assault' | 'gunline' | 'control' | 'defensive'

export interface DeployPreset {
  id: DeployPresetId
  name: string
  icon: string
  /** what the preset does, one line */
  blurb: string
}

export const DEPLOY_PRESETS: DeployPreset[] = [
  { id: 'assault', name: tr('Assault'), icon: '⚔', blurb: tr('Melee units and screens go on the front line opposite the nearest targets, shooters cover from behind.') },
  { id: 'gunline', name: tr('Firing line'), icon: '🎯', blurb: tr('Shooters are spread across the whole zone with a view of the field, melee units wait in cover for a counterattack.') },
  { id: 'control', name: tr('Field control'), icon: '🚩', blurb: tr('One unit per objective, fast ones on the flanks, shooters in the centre. Watches the whole field.') },
  { id: 'defensive', name: tr('Defence'), icon: '🛡', blurb: tr('Everything behind cover and out of the enemy’s line of fire. If the enemy shoots first.') },
]

/** How a doctrine treats one role. */
interface Stance {
  /** how far forward: 0 = own board edge, 1 = front line of the zone */
  fwd: number
  /** which lane along the zone the unit heads for */
  lane: 'focus' | 'spread' | 'objective' | 'flank' | 'centre' | 'free'
  /** + wants open lines of fire on the enemy, − hides from them */
  exposure: number
  /** likes standing in terrain (cover for infantry) */
  cover: number
  shape: 'deep' | 'wide'
}

type Doctrine = Record<Exclude<UnitRole, 'character' | 'infiltrator'>, Stance> & {
  /** role of the unit a character prefers to join */
  leads: UnitRole[]
  /** infiltrators: + push for objectives, − stay hidden */
  infiltrate: 'objective' | 'hidden'
}

const DOCTRINES: Record<DeployPresetId, Doctrine> = {
  assault: {
    assault: { fwd: 1, lane: 'focus', exposure: -0.4, cover: 0.3, shape: 'deep' },
    screen: { fwd: 1, lane: 'focus', exposure: 0, cover: 0, shape: 'wide' },
    shooter: { fwd: 0.55, lane: 'focus', exposure: 0.8, cover: 0.3, shape: 'wide' },
    leads: ['assault', 'screen'],
    infiltrate: 'objective',
  },
  gunline: {
    shooter: { fwd: 0.45, lane: 'spread', exposure: 1.5, cover: 0.5, shape: 'wide' },
    assault: { fwd: 0.25, lane: 'centre', exposure: -1.2, cover: 0.6, shape: 'deep' },
    screen: { fwd: 1, lane: 'spread', exposure: 0, cover: 0, shape: 'wide' },
    leads: ['shooter'],
    infiltrate: 'hidden',
  },
  control: {
    shooter: { fwd: 0.6, lane: 'centre', exposure: 1, cover: 0.4, shape: 'wide' },
    assault: { fwd: 0.85, lane: 'objective', exposure: -0.3, cover: 0.3, shape: 'deep' },
    screen: { fwd: 0.9, lane: 'objective', exposure: 0, cover: 0, shape: 'wide' },
    leads: ['shooter', 'assault'],
    infiltrate: 'objective',
  },
  defensive: {
    shooter: { fwd: 0.25, lane: 'free', exposure: -2, cover: 1, shape: 'deep' },
    assault: { fwd: 0.2, lane: 'free', exposure: -2, cover: 1, shape: 'deep' },
    screen: { fwd: 0.6, lane: 'free', exposure: -1, cover: 0.5, shape: 'wide' },
    leads: ['shooter', 'assault', 'screen'],
    infiltrate: 'hidden',
  },
}

const STEP = 1 // candidate grid, inches
const FINE = 0.5 // second pass when nothing fits on the coarse grid

const centre = (ps: Vec[]): Vec => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length })

/** Clear line between two points: no obscuring terrain crossed, except a piece one of the points is inside. */
function lineClear(s: GameState, a: Vec, b: Vec): boolean {
  for (const t of s.terrain) {
    if (!t.obscuring) continue
    if (pointInPolygon(a, t.poly) || pointInPolygon(b, t.poly)) continue
    if (segmentCrossesPolygon(a, b, t.poly)) return false
  }
  return true
}

/** Where the enemy will be looking from. Its placed units if it has any on the board, else points spread over its zone. */
function enemyEyes(s: GameState, faction: PlayerId, useUnits: boolean): Vec[] {
  const foes = unitsOf(s, other(s, faction))
  if (useUnits && foes.length) return foes.map((u) => centre(alive(u).map((m) => m.pos)))
  const zone = deploymentZone(s, other(s, faction))
  const xs = zone.map((p) => p.x), ys = zone.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const out: Vec[] = []
  for (const fx of [0.25, 0.75]) for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) out.push({ x: x0 + (x1 - x0) * fx, y: y0 + (y1 - y0) * fy })
  return out
}

export interface PresetResult {
  /** new position of every model of the faction's units */
  positions: Record<string, Vec>
  /** role of each unit (id → role) */
  roles: Record<string, UnitRole>
  /** false when the doctrine could not fit everyone and the dense fallback packing was used */
  followed: boolean
}

interface Frame {
  minX: number; maxX: number; minY: number; maxY: number
  front: number; back: number; depth: number; height: number
}

function frameOf(s: GameState, faction: PlayerId): Frame {
  const zone = deploymentZone(s, faction)
  const xs = zone.map((p) => p.x), ys = zone.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const west = sidesOf(s)[0] === faction
  return { minX, maxX, minY, maxY, front: west ? maxX : minX, back: west ? -1 : 1, depth: maxX - minX, height: maxY - minY }
}

/** Lanes (y coordinates) the doctrine sends each unit to, before scoring. */
function laneTargets(s: GameState, f: Frame, units: { u: UnitState; p: UnitProfile; st: Stance }[]): Map<UnitState, number | null> {
  const out = new Map<UnitState, number | null>()
  const objs = [...s.objectives].sort((a, b) => Math.abs(a.pos.x - f.front) - Math.abs(b.pos.x - f.front))
  const objYs = objs.map((o) => Math.min(f.maxY, Math.max(f.minY, o.pos.y)))
  const focusYs = objYs.slice(0, Math.max(1, Math.min(2, objYs.length)))
  const mid = (f.minY + f.maxY) / 2
  const flanks = [f.minY + f.height * 0.15, f.maxY - f.height * 0.15]
  const spread = units.filter((x) => x.st.lane === 'spread')
  const counters: Record<string, number> = {}
  const next = (k: string) => (counters[k] = (counters[k] ?? -1) + 1)
  // objective lanes go to the units with the most Objective Control first
  const byOc = [...units].sort((a, b) => b.p.oc - a.p.oc)
  for (const x of byOc) {
    switch (x.st.lane) {
      case 'focus': out.set(x.u, focusYs[next('focus') % focusYs.length]); break
      case 'objective': {
        const i = next('objective')
        out.set(x.u, i < objYs.length ? objYs[i] : x.p.fast ? flanks[i % 2] : objYs[i % Math.max(1, objYs.length)] ?? mid)
        break
      }
      case 'flank': out.set(x.u, flanks[next('flank') % 2]); break
      case 'centre': out.set(x.u, mid + ((next('centre') % 3) - 1) * f.height * 0.15); break
      case 'spread': {
        const i = spread.indexOf(x)
        out.set(x.u, f.minY + (f.height * (i + 0.5)) / spread.length)
        break
      }
      default: out.set(x.u, null)
    }
  }
  return out
}

/** Distance between two units' closest bases, approximated from their centres and spans. */
function gapBetween(a: { c: Vec; span: number }, b: { c: Vec; span: number }) {
  return Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y) - a.span - b.span
}

/**
 * Sets up `faction`'s army in `preset`. Pure: returns the positions, `s` is not changed.
 * `seeEnemy`: score lines of fire against the enemy units on the board (the player sets up after the AI);
 * otherwise against the enemy's deployment zone (the AI sets up first).
 */
export function deployWithPreset(s: GameState, faction: PlayerId, preset: DeployPresetId, seeEnemy = true): PresetResult {
  const doctrine = DOCTRINES[preset]
  const mine = unitsOf(s, faction)
  const roles = Object.fromEntries(mine.map((u) => [u.id, unitProfile(u).role])) as Record<string, UnitRole>
  const eyes = enemyEyes(s, faction, seeEnemy)
  // a crowded zone leaves no room for gaps between units: retry tighter before giving up on the doctrine
  const result =
    solve(s, faction, doctrine, eyes, { order: 'doctrine', gap: 2.5, pack: false }) ??
    solve(s, faction, doctrine, eyes, { order: 'bulk', gap: 1, pack: false }) ??
    solve(s, faction, doctrine, eyes, { order: 'bulk', gap: 0, pack: true })
  if (result) return { positions: result, roles, followed: true }
  return { positions: Object.fromEntries(mine.flatMap((u) => u.models.map((m) => [m.id, m.pos]))), roles, followed: false }
}

interface Attempt {
  order: 'doctrine' | 'bulk'
  /** gap wanted between units, inches */
  gap: number
  /** dense packing: every unit in its deepest formation, pressed against the units already placed */
  pack: boolean
}

function solve(s: GameState, faction: PlayerId, doctrine: Doctrine, eyes: Vec[], { order, gap, pack }: Attempt): Record<string, Vec> | null {
  const f = frameOf(s, faction)
  const mineOrig = unitsOf(s, faction)
  // work on copies with the faction's units off the board, adding each one as it is placed
  const work: GameState = { ...s, units: s.units.filter((u) => u.owner !== faction || alive(u).length === 0) }
  const units = mineOrig.map((u) => ({ u: structuredClone(u), p: unitProfile(u) }))
  const body = units.filter((x) => x.p.role !== 'character' && x.p.role !== 'infiltrator').map((x) => ({ ...x, st: doctrine[x.p.role as keyof Omit<Doctrine, 'leads' | 'infiltrate'>] }))
  const lanes = laneTargets(s, f, body)
  const rank: Record<string, number> = { screen: 0, assault: 1, shooter: 2 }
  const ordered =
    order === 'bulk'
      ? [...body].sort((a, b) => footprint(b.u) - footprint(a.u))
      : [...body].sort((a, b) => rank[a.p.role] - rank[b.p.role] || footprint(b.u) - footprint(a.u))
  const placed: { u: UnitState; role: UnitRole; c: Vec; span: number }[] = []

  const anchorsIn = (r: number, step: number): Vec[] => {
    const out: Vec[] = []
    for (let a = r + 0.05; a <= f.depth - r; a += step) for (let y = f.minY + r + 0.05; y <= f.maxY - r; y += step) out.push({ x: f.front + f.back * a, y })
    return out
  }
  const coverFrac = (ps: Vec[]) => ps.filter((p) => s.terrain.some((t) => pointInPolygon(p, t.poly))).length / ps.length
  const exposureOf = (c: Vec) => (eyes.length ? eyes.filter((e) => lineClear(s, c, e)).length / eyes.length : 0)
  const crowd = (c: Vec, span: number) => placed.reduce((a, q) => a + Math.max(0, gap - gapBetween({ c, span }, q)), 0)
  // packing: stay close to the zone's own edge and to the units already placed, so the rest still fits
  const packing = (c: Vec, span: number) =>
    pack ? -0.4 * Math.min(f.height, ...placed.map((q) => Math.max(0, gapBetween({ c, span }, q)))) : 0

  /** Best legal spot for `u` by `score`, trying the coarse grid first. */
  const place = (u: UnitState, offs: { dx: number; dy: number }[], anchorsFor: (step: number) => Vec[], score: (ps: Vec[], c: Vec, span: number) => number): boolean => {
    for (const step of [STEP, FINE]) {
      const cands = anchorsFor(step).map((a) => {
        const ps = u.models.map((_, i) => ({ x: a.x + f.back * offs[i].dx, y: a.y + offs[i].dy }))
        const c = centre(ps)
        const span = Math.max(...ps.map((p, i) => Math.hypot(p.x - c.x, p.y - c.y) + radiusOf(u.models[i])))
        return { ps, c, span, score: score(ps, c, span) }
      })
      cands.sort((a, b) => b.score - a.score)
      for (const cand of cands) {
        const pos = Object.fromEntries(u.models.map((m, i) => [m.id, cand.ps[i]]))
        if (deploymentProblem(work, u, pos)) continue
        u.models.forEach((m, i) => (m.pos = cand.ps[i]))
        work.units = [...work.units, u]
        placed.push({ u, role: unitProfile(u).role, c: cand.c, span: cand.span })
        return true
      }
    }
    return false
  }

  for (const x of ordered) {
    // a block no deeper than 60% of the zone, so the doctrine has room to put it forward or back
    const offs = pack ? formation(x.u, f.depth, 'deep') : formation(x.u, x.st.shape === 'deep' ? f.depth * 0.6 : f.depth, x.st.shape)
    const r = Math.max(...x.u.models.map(radiusOf))
    const laneY = lanes.get(x.u) ?? null
    const ok = place(x.u, offs, (step) => anchorsIn(r, step), (ps, c, span) => {
      const fwd = 1 - Math.abs(c.x - f.front) / f.depth
      let sc = -3 * Math.abs(fwd - x.st.fwd)
      if (laneY !== null) sc -= (4 * Math.abs(c.y - laneY)) / f.height
      sc += x.st.exposure * exposureOf(c)
      sc += x.st.cover * coverFrac(ps)
      sc -= 0.8 * crowd(c, span)
      return sc + packing(c, span)
    })
    if (!ok) return null
  }

  // infiltrators: anywhere legal on the board (more than 8″ from the enemy), near an objective or out of sight
  for (const x of units.filter((y) => y.p.role === 'infiltrator')) {
    const offs = formation(x.u, s.board.width / 2, 'deep')
    const r = Math.max(...x.u.models.map(radiusOf))
    const anchors = (step: number) => {
      const out: Vec[] = []
      for (let px = r + 0.05; px <= s.board.width - r; px += step) for (let y = r + 0.05; y <= s.board.height - r; y += step) out.push({ x: px, y })
      return out
    }
    const ok = place(x.u, offs, anchors, (ps, c, span) => {
      const toObj = Math.min(...s.objectives.map((o) => Math.hypot(o.pos.x - c.x, o.pos.y - c.y)), 30)
      const hide = 1 - exposureOf(c)
      const sc = doctrine.infiltrate === 'objective' ? -toObj / 6 + hide : -toObj / 15 + 2 * hide
      return sc + coverFrac(ps) * 0.5 - 0.8 * crowd(c, span)
    })
    if (!ok) return null
  }

  // characters on their own (the others are inside the units they lead): behind a unit, by the doctrine's preference
  const taken = new Set<UnitState>()
  for (const x of units.filter((y) => y.p.role === 'character')) {
    const bodies = placed.filter((q) => q.role !== 'character')
    const pick = (pool: typeof bodies) =>
      [...pool].sort((a, b) => doctrine.leads.indexOf(a.role) - doctrine.leads.indexOf(b.role)).find((q) => doctrine.leads.includes(q.role) && !taken.has(q.u)) ?? pool.find((q) => !taken.has(q.u))
    const partner = pick(bodies) ?? bodies[0]
    if (partner) taken.add(partner.u)
    const offs = formation(x.u, f.depth, 'deep')
    const r = Math.max(...x.u.models.map(radiusOf))
    const ok = place(x.u, offs, (step) => anchorsIn(r, step), (_ps, c) => {
      if (!partner) return -Math.abs(c.x - f.front)
      const d = Math.min(...alive(partner.u).map((m) => Math.hypot(m.pos.x - c.x, m.pos.y - c.y) - radiusOf(m)))
      // behind the partner rather than in front of it
      const behind = Math.abs(c.x - f.front) - Math.abs(partner.c.x - f.front)
      return -d + (behind > 0 ? 0.3 : 0) - 0.5 * exposureOf(c)
    })
    if (!ok) return null
  }
  return Object.fromEntries(units.flatMap((x) => x.u.models.map((m) => [m.id, m.pos])))
}

/** How well a preset suits the army (0..1), with the reason shown on the card. Uses wounds as the measure of how
 * much of the army a role takes up. */
export function presetFit(s: GameState, faction: PlayerId, preset: DeployPresetId): { fit: number; why: string } {
  const share = (p: PlayerId, roles: UnitRole[]) => {
    const us = unitsOf(s, p).map((u) => unitProfile(u))
    const total = us.reduce((a, x) => a + x.wounds, 0) || 1
    return us.filter((x) => roles.includes(x.role)).reduce((a, x) => a + x.wounds, 0) / total
  }
  const pct = (v: number) => `${Math.round(v * 100)}%`
  switch (preset) {
    case 'assault': {
      const v = share(faction, ['assault', 'screen'])
      return { fit: v, why: tr('melee and screens — {pct} of the army', { pct: pct(v) }) }
    }
    case 'gunline': {
      const v = share(faction, ['shooter'])
      return { fit: v, why: tr('shooters — {pct} of the army', { pct: pct(v) }) }
    }
    case 'control': {
      const a = share(faction, ['assault', 'screen'])
      const g = share(faction, ['shooter'])
      const v = Math.max(0, 1 - Math.abs(a - g)) * 0.9
      return { fit: v, why: tr('mixed army: assault {pct}, shooters {pct2}', { pct: pct(a), pct2: pct(g) }) }
    }
    case 'defensive': {
      const v = share(other(s, faction), ['shooter']) * 0.85
      return { fit: v, why: tr('the opponent’s shooters — {pct}', { pct: pct(v / 0.85) }) }
    }
  }
}

/** The preset that suits the army best. */
export function recommendedPreset(s: GameState, faction: PlayerId): DeployPresetId {
  let best: DeployPresetId = 'control'
  let bestFit = -1
  for (const p of DEPLOY_PRESETS) {
    const { fit } = presetFit(s, faction, p.id)
    if (fit > bestFit + 1e-9) [best, bestFit] = [p.id, fit]
  }
  return best
}

/** Applies `preset` to `faction` in `s` (mutates). */
export function applyPreset(s: GameState, faction: PlayerId, preset: DeployPresetId, seeEnemy = true): PresetResult {
  const res = deployWithPreset(s, faction, preset, seeEnemy)
  for (const u of s.units) if (u.owner === faction) for (const m of u.models) if (res.positions[m.id]) m.pos = { ...res.positions[m.id] }
  return res
}
