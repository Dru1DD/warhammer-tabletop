import { DATASHEETS } from '../data/datasheets'
import { COHERENCY_ALL, hasAbility, newUnit, radiusOf, sidesOf } from '../gameState'
import { deploymentProblem, deploymentZone } from '../rules/deployment'
import type { GameState, PlayerId, UnitState, Vec } from '../types'
import { composeUnit, shortName, type ArmyList } from './armyList'

// Puts an army list on the board: every unit is set up legally inside its side's deployment zone
// (the same check as the deployment step, rules/deployment.ts). Units fill the zone from the front
// line backwards; characters go last, next to the unit they are most likely to lead.

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
const GAP = 0.1 // between bases in a formation, inches
const STEP = 0.5 // anchor grid, inches

const isCharacter = (u: UnitState) => DATASHEETS[u.datasheetId].keywords.includes('CHARACTER')

/** The units of `list` with display names and ids, models not yet placed. */
export function listUnits(faction: PlayerId, list: ArmyList): UnitState[] {
  const total: Record<string, number> = {}
  for (const e of list.units) total[e.datasheetId] = (total[e.datasheetId] ?? 0) + 1
  const seen: Record<string, number> = {}
  return list.units.map((e) => {
    const n = (seen[e.datasheetId] = (seen[e.datasheetId] ?? 0) + 1)
    const name = total[e.datasheetId] > 1 ? `${shortName(e.datasheetId)} ${ROMAN[n - 1] ?? n}` : shortName(e.datasheetId)
    return newUnit(`${e.datasheetId}-${n}`, e.datasheetId, faction, name, composeUnit(e.datasheetId, e.size, e.loadout).map((p) => [p, { x: 0, y: 0 }]))
  })
}

/**
 * Offsets of a unit's models in a grid: columns go from the front line back, rows along the edge.
 * 'deep' (default): as many columns as the zone is deep (the densest packing); 'wide': as few columns as
 * possible (a line along the front). Never so spread out that two models end up farther apart than
 * coherency allows.
 */
export function formation(u: UnitState, maxDepth: number, shape: 'deep' | 'wide' = 'deep'): { dx: number; dy: number }[] {
  const radii = u.models.map(radiusOf)
  const n = radii.length
  // rows of `cols` models, each base touching the next with GAP between them (bases differ: a Nob is bigger than a Boy)
  const layout = (cols: number) => {
    const offs: { dx: number; dy: number }[] = []
    let y = 0
    let prevRowR = 0
    for (let start = 0; start < n; start += cols) {
      const row = radii.slice(start, start + cols)
      const rowR = Math.max(...row)
      if (start > 0) y += prevRowR + rowR + GAP
      let x = 0
      row.forEach((r, j) => {
        if (j > 0) x += row[j - 1] + r + GAP
        offs.push({ dx: x, dy: y })
      })
      prevRowR = rowR
    }
    return offs
  }
  const fits = (offs: { dx: number; dy: number }[]) => {
    for (let i = 0; i < n; i++) {
      if (offs[i].dx + radii[i] + radii[0] > maxDepth - 0.1) return false
      for (let j = i + 1; j < n; j++) if (Math.hypot(offs[i].dx - offs[j].dx, offs[i].dy - offs[j].dy) - radii[i] - radii[j] > COHERENCY_ALL - 0.2) return false
    }
    return true
  }
  if (shape === 'wide')
    for (let cols = 1; cols <= n; cols++) {
      const offs = layout(cols)
      if (fits(offs)) return offs
    }
  for (let cols = n; cols > 1; cols--) {
    const offs = layout(cols)
    if (fits(offs)) return offs
  }
  return layout(1)
}

/** Area the unit's bases cover, to set up the bulkiest units first. */
export const footprint = (u: UnitState) => u.models.reduce((a, m) => a + (2 * radiusOf(m) + GAP) ** 2, 0)

const centre = (ps: Vec[]): Vec => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length })

/**
 * Adds the units of `list` to `s` for `faction`, each placed legally in the faction's deployment
 * zone. Mutates `s`. Throws (in Russian) when a unit does not fit.
 */
export function musterArmy(s: GameState, faction: PlayerId, list: ArmyList): void {
  const zone = deploymentZone(s, faction)
  const xs = zone.map((p) => p.x)
  const ys = zone.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const west = sidesOf(s)[0] === faction
  const front = west ? maxX : minX
  const back = west ? -1 : 1 // direction from the front line towards the own board edge
  const depth = maxX - minX

  const units = listUnits(faction, list)
  const order = [...units.filter((u) => !isCharacter(u)).sort((a, b) => footprint(b) - footprint(a)), ...units.filter(isCharacter)]
  const placed: UnitState[] = []
  let charIndex = 0
  for (const u of order) {
    const offs = formation(u, depth)
    const r = Math.max(...u.models.map(radiusOf))
    const anchors: Vec[] = []
    for (let a = r + 0.05; a <= depth - r; a += STEP)
      for (let y = minY + r + 0.05; y <= maxY - r; y += STEP) anchors.push({ x: front + back * a, y })
    if (isCharacter(u)) {
      // next to the unit it would lead (a Leader-support unit if the army has one, else any)
      const leadable = placed.filter((p) => !isCharacter(p) && hasAbility(p, 'ledUnit'))
      const pool = leadable.length ? leadable : placed.filter((p) => !isCharacter(p))
      const partner = pool.length ? pool[charIndex++ % pool.length] : null
      if (partner) {
        const c = centre(partner.models.map((m) => m.pos))
        anchors.sort((p, q) => Math.hypot(p.x - c.x, p.y - c.y) - Math.hypot(q.x - c.x, q.y - c.y))
      }
    }
    const spot = anchors
      .map((a) => Object.fromEntries(u.models.map((m, i) => [m.id, { x: a.x + back * offs[i].dx, y: a.y + offs[i].dy }])) as Record<string, Vec>)
      .find((pos) => !deploymentProblem(s, u, pos))
    if (!spot) throw new Error(`Не хватает места в зоне развёртывания для «${u.name}». Уберите часть отрядов.`)
    for (const m of u.models) m.pos = spot[m.id]
    s.units.push(u)
    placed.push(u)
  }
  // keep the list order in the roster panel
  s.units = [...s.units.filter((x) => !units.includes(x)), ...units]
}
