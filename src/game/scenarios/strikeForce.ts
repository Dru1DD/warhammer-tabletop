import { rect } from '../geometry/geometry'
import { tr } from '../../i18n/index'
import type { Terrain, Vec } from '../types'

// The 44″×60″ battlefield of 11th edition matched play: six deployment maps (the deployment cards of the Mission Deck
// 2026-27) and three terrain layouts. The cards show zones and objectives only as pictures, so the positions here follow
// the 10th edition maps of the same names and are approximate (docs/strike-force.md). Every map is drawn so that the two
// players face each other west–east (the engine's "front" is the x axis): maps with zones on the long edges use a board
// 44″ wide and 60″ tall, the others 60″ wide and 44″ tall. Everything is point-symmetric about the centre.

export type MapId = 'hammerAnvil' | 'dawnOfWar' | 'searchDestroy' | 'sweeping' | 'crucible' | 'tippingPoint'
export type LayoutId = 'A' | 'B' | 'C'
/** home: in a deployment zone (`side` owns it); central: the middle; expansion: the flanks in No Man's Land */
export type ObjectiveRole = 'home' | 'central' | 'expansion'

export interface MapObjective { pos: Vec; role: ObjectiveRole; side?: 'west' | 'east' }

export interface DeploymentMap {
  id: MapId
  name: string
  nameEn: string
  board: { width: number; height: number }
  deployment: { west: Vec[]; east: Vec[] }
  objectives: MapObjective[]
  /** each player's half of the battlefield */
  territory: { west: Vec[]; east: Vec[] }
}

/** The point-mirror of a polygon through the board centre (the east side of a symmetric map). */
const mirror = (poly: Vec[], w: number, h: number): Vec[] => poly.map((p) => ({ x: w - p.x, y: h - p.y }))
const halves = (w: number, h: number) => ({ west: rect(0, 0, w / 2, h), east: rect(w / 2, 0, w / 2, h) })
const objectives = (w: number, h: number, homeWest: Vec, central: Vec, expansion: Vec): MapObjective[] => [
  { pos: homeWest, role: 'home', side: 'west' },
  { pos: { x: w - homeWest.x, y: h - homeWest.y }, role: 'home', side: 'east' },
  { pos: central, role: 'central' },
  { pos: expansion, role: 'expansion' },
  { pos: { x: w - expansion.x, y: h - expansion.y }, role: 'expansion' },
]

/** A quarter of the 60×44 board minus a 9″ circle around the centre (Search and Destroy). */
function quarterZone(): Vec[] {
  const arc: Vec[] = []
  for (let a = 180; a >= 90; a -= 15) arc.push({ x: 30 + 9 * Math.cos((a * Math.PI) / 180), y: 22 + 9 * Math.sin((a * Math.PI) / 180) })
  return [{ x: 0, y: 22 }, ...arc, { x: 30, y: 44 }, { x: 0, y: 44 }]
}

function map(id: MapId, name: string, nameEn: string, w: number, h: number, west: Vec[], objs: MapObjective[]): DeploymentMap {
  return { id, name, nameEn, board: { width: w, height: h }, deployment: { west, east: mirror(west, w, h) }, objectives: objs, territory: halves(w, h) }
}

export const MAPS: Record<MapId, DeploymentMap> = {
  hammerAnvil: map('hammerAnvil', tr('Hammer and Anvil'), 'Hammer and Anvil', 60, 44, rect(0, 0, 18, 44),
    objectives(60, 44, { x: 9, y: 22 }, { x: 30, y: 22 }, { x: 30, y: 8 })),
  dawnOfWar: map('dawnOfWar', tr('Dawn of War'), 'Dawn of War', 44, 60, rect(0, 0, 12, 60),
    objectives(44, 60, { x: 6, y: 30 }, { x: 22, y: 30 }, { x: 22, y: 12 })),
  searchDestroy: map('searchDestroy', tr('Search and Destroy'), 'Search and Destroy', 60, 44, quarterZone(),
    objectives(60, 44, { x: 12, y: 34 }, { x: 30, y: 22 }, { x: 12, y: 10 })),
  sweeping: map('sweeping', tr('Sweeping Engagement'), 'Sweeping Engagement', 44, 60,
    [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 30 }, { x: 14, y: 30 }, { x: 14, y: 60 }, { x: 0, y: 60 }],
    objectives(44, 60, { x: 6, y: 45 }, { x: 22, y: 30 }, { x: 22, y: 12 })),
  crucible: map('crucible', tr('Crucible of Battle'), 'Crucible of Battle', 60, 44, [{ x: 0, y: 8 }, { x: 30, y: 44 }, { x: 0, y: 44 }],
    objectives(60, 44, { x: 8, y: 36 }, { x: 30, y: 22 }, { x: 12, y: 12 })),
  tippingPoint: map('tippingPoint', tr('Tipping Point'), 'Tipping Point', 60, 44,
    [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 22 }, { x: 20, y: 22 }, { x: 20, y: 44 }, { x: 0, y: 44 }],
    objectives(60, 44, { x: 8, y: 33 }, { x: 30, y: 22 }, { x: 22, y: 10 })),
}
export const MAP_IDS = Object.keys(MAPS) as MapId[]
export const LAYOUT_IDS: LayoutId[] = ['A', 'B', 'C']

// ---------------------------------------------------------------- terrain layouts (drawn on the 60×44 board)

type Kind = Terrain['kind']
const piece = (kind: Kind, name: string, obscuring: boolean) => (id: string, poly: Vec[]): Terrain => ({ id, name, kind, poly, obscuring })
const ruin = piece('ruin', tr('Ruins'), true)
const woods = piece('woods', tr('Woods'), true)
const crater = piece('crater', tr('Crater'), false)
const container = piece('container', tr('Container'), true)
const barricade = piece('barricade', tr('Barricade'), true)

/** Each piece and its point-mirror, so both halves of the board are the same. */
function pairs(list: [ReturnType<typeof piece>, number, number, number, number][], centre: Terrain[] = []): Terrain[] {
  const out: Terrain[] = [...centre]
  list.forEach(([make, x, y, w, h], i) => {
    out.push(make(`a${i}`, rect(x, y, w, h)))
    out.push(make(`b${i}`, mirror(rect(x, y, w, h), 60, 44)))
  })
  return out
}

const LAYOUTS: Record<LayoutId, { name: string; pieces: Terrain[] }> = {
  A: {
    name: tr('Manufactorum ruins'),
    pieces: pairs([
      [ruin, 13, 5, 6, 5], [ruin, 21, 28, 5, 6], [woods, 17, 15, 5, 5], [container, 27, 9, 4, 1.5],
      [crater, 46, 13, 3, 3], [barricade, 24, 19.5, 0.6, 4], [ruin, 35, 36, 5, 4],
    ], [ruin('c0', rect(28, 20.5, 4, 3))]),
  },
  B: {
    name: tr('Wooded hills'),
    pieces: pairs([
      [woods, 14, 8, 6, 6], [woods, 22, 30, 6, 5], [crater, 25, 14, 3, 3], [crater, 16, 24, 3, 3],
      [ruin, 36, 4, 5, 4], [barricade, 33, 18, 4, 0.6], [container, 44, 30, 1.5, 4],
    ], [woods('c0', rect(27.5, 19.5, 5, 5))]),
  },
  C: {
    name: tr('City ruins'),
    pieces: pairs([
      [ruin, 13, 4, 5, 6], [ruin, 13, 18, 4, 6], [ruin, 20, 30, 6, 4], [ruin, 23, 9, 5, 4],
      [container, 33, 14, 1.5, 4], [barricade, 20, 25.5, 4, 0.6], [crater, 40, 3, 3, 3],
    ], [ruin('c0', rect(26, 21, 3, 2)), ruin('c1', rect(31, 21, 3, 2))]),
  },
}
export const LAYOUT_NAME: Record<LayoutId, string> = { A: LAYOUTS.A.name, B: LAYOUTS.B.name, C: LAYOUTS.C.name }

/** The terrain of a layout for a map's board: as drawn on 60×44, or transposed for the 44×60 boards. */
export function layoutFor(id: LayoutId, board: { width: number; height: number }): Terrain[] {
  const tall = board.width < board.height
  return LAYOUTS[id].pieces.map((t, i) => ({ ...t, id: `t${i + 1}`, poly: tall ? t.poly.map((p) => ({ x: p.y, y: p.x })) : t.poly.map((p) => ({ ...p })) }))
}

/** `id` or a random one when it is 'random' (or unknown). */
export const pickMap = (id: string | undefined, rnd = Math.random): MapId => (id && id in MAPS ? (id as MapId) : MAP_IDS[Math.floor(rnd() * MAP_IDS.length)])
export const pickLayout = (id: string | undefined, rnd = Math.random): LayoutId => (LAYOUT_IDS.includes(id as LayoutId) ? (id as LayoutId) : LAYOUT_IDS[Math.floor(rnd() * LAYOUT_IDS.length)])

// ---------------------------------------------------------------- terrain layouts of the 44″×30″ board (Combat Patrol)

/** Each piece and its point-mirror on the 44×30 board. Pieces stay between x 11 and 33: the zones (x < 10, x > 34) are
 * left free for the training rosters, which stand on fixed spots. */
function patrolPairs(list: [ReturnType<typeof piece>, number, number, number, number][], centre: Terrain[] = []): Terrain[] {
  const out: Terrain[] = [...centre]
  list.forEach(([make, x, y, w, h], i) => {
    out.push(make(`p${i}`, rect(x, y, w, h)))
    out.push(make(`q${i}`, mirror(rect(x, y, w, h), 44, 30)))
  })
  return out.map((t, i) => ({ ...t, id: `t${i + 1}` }))
}

/** A is the board's original layout (kept in scenarios.ts); B and C are new. */
export const PATROL_LAYOUT_NAME: Record<LayoutId, string> = { A: tr('Classic (as before)'), B: tr('Forest edge'), C: tr('Ruined streets') }
const PATROL_LAYOUTS: Record<'B' | 'C', Terrain[]> = {
  B: patrolPairs([
    [woods, 13, 3, 4, 4], [woods, 18, 18, 4, 4], [crater, 19, 11.5, 2.5, 2.5], [barricade, 16, 12.5, 0.6, 4], [ruin, 24, 2, 4, 3],
  ]),
  C: patrolPairs([
    [ruin, 13, 2, 4, 5], [ruin, 18, 9.5, 3, 3], [container, 25, 6.5, 1.5, 4], [barricade, 12, 20, 4, 0.6], [crater, 28, 13, 2.5, 2.5],
  ], [ruin('c0', rect(20.5, 13.5, 3, 3))]),
}

/** The terrain of a Combat Patrol layout, or null for A (the original layout). */
export const patrolLayout = (id: LayoutId): Terrain[] | null => (id === 'A' ? null : PATROL_LAYOUTS[id].map((t) => ({ ...t, poly: t.poly.map((p) => ({ ...p })) })))
