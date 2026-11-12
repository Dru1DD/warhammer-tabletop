import type { UnitState } from '../types'

/** One row of the Munitorum Field Manual: a unit of exactly `models` models costs `points`. */
export interface PointsBracket {
  models: number
  points: number
}

/** Where the numbers come from; shown in the UI next to army totals. */
export const POINTS_SOURCE = {
  name: 'Munitorum Field Manual (Dakkapedia)',
  url: 'https://dakkapedia.com',
  updated: '2026-06-17',
}

/**
 * Unit costs by datasheet id: the price of the first copy. Some units cost more from the 2nd/3rd
 * copy onward; those prices are in `POINTS_LATER` and apply to army lists (see army/armyList.ts).
 */
export const POINTS: Record<string, PointsBracket[]> = {
  // Space Marines
  lieutenant: [{ models: 1, points: 45 }],
  intercessors: [{ models: 5, points: 80 }, { models: 10, points: 150 }],
  assaultIntercessors: [{ models: 5, points: 75 }, { models: 10, points: 150 }],
  redemptor: [{ models: 1, points: 195 }],
  captain: [{ models: 1, points: 80 }],
  hellblasters: [{ models: 5, points: 110 }, { models: 10, points: 220 }],
  infernus: [{ models: 5, points: 85 }, { models: 10, points: 170 }],
  bladeguard: [{ models: 3, points: 80 }, { models: 6, points: 160 }],
  // Orks
  boyz: [{ models: 10, points: 75 }, { models: 20, points: 150 }],
  deffDread: [{ models: 1, points: 110 }],
  warboss: [{ models: 1, points: 75 }],
  nobz: [{ models: 5, points: 105 }, { models: 10, points: 210 }],
  // Dakkapedia lists 11 / 22 models (Runtherd included in an older composition); the 11th-edition datasheet is 10–20 Gretchin
  gretchin: [{ models: 10, points: 45 }, { models: 20, points: 80 }],
  kommandos: [{ models: 10, points: 120 }],
  // Tyranids
  hiveTyrant: [{ models: 1, points: 195 }],
  termagants: [{ models: 10, points: 60 }, { models: 20, points: 110 }],
  hormagaunts: [{ models: 10, points: 70 }, { models: 20, points: 120 }],
  tyranidWarriors: [{ models: 3, points: 60 }, { models: 6, points: 120 }],
  wingedPrime: [{ models: 1, points: 65 }],
  zoanthropes: [{ models: 3, points: 100 }, { models: 6, points: 200 }],
  carnifexes: [{ models: 1, points: 90 }, { models: 2, points: 180 }],
  barbgaunts: [{ models: 5, points: 55 }, { models: 10, points: 110 }],
  // Necrons
  overlord: [{ models: 1, points: 90 }],
  necronWarriors: [{ models: 10, points: 80 }, { models: 20, points: 190 }],
  skorpekhDestroyers: [{ models: 3, points: 85 }, { models: 6, points: 170 }],
  scarabSwarms: [{ models: 3, points: 40 }, { models: 6, points: 80 }],
  royalWarden: [{ models: 1, points: 50 }],
  immortals: [{ models: 5, points: 70 }, { models: 10, points: 140 }],
  lychguard: [{ models: 5, points: 80 }, { models: 10, points: 160 }],
  canoptekWraiths: [{ models: 3, points: 95 }, { models: 6, points: 220 }],
  // Aeldari (10 Guardians + the Heavy Weapon Platform = 11 models)
  farseer: [{ models: 1, points: 70 }],
  guardianDefenders: [{ models: 11, points: 90 }],
  direAvengers: [{ models: 5, points: 75 }, { models: 10, points: 150 }],
  windriders: [{ models: 3, points: 80 }, { models: 6, points: 160 }],
  autarch: [{ models: 1, points: 85 }],
  aeldariRangers: [{ models: 5, points: 60 }, { models: 10, points: 110 }],
  wraithguard: [{ models: 5, points: 145 }],
  swoopingHawks: [{ models: 5, points: 100 }, { models: 10, points: 190 }],
  // Adeptus Mechanicus
  techDominus: [{ models: 1, points: 65 }],
  techManipulus: [{ models: 1, points: 60 }],
  rangers: [{ models: 10, points: 85 }],
  vanguard: [{ models: 10, points: 90 }],
  breachers: [{ models: 3, points: 150 }, { models: 6, points: 320 }],
  destroyers: [{ models: 3, points: 100 }, { models: 6, points: 210 }],
  sicarians: [{ models: 5, points: 75 }, { models: 10, points: 155 }],
  kastelans: [{ models: 2, points: 160 }, { models: 4, points: 320 }],
  sulphurhounds: [{ models: 3, points: 55 }, { models: 6, points: 95 }],
  ironstriders: [{ models: 1, points: 80 }, { models: 2, points: 160 }, { models: 3, points: 250 }],
  onager: [{ models: 1, points: 150 }],
  electroPriests: [{ models: 5, points: 60 }, { models: 10, points: 120 }],
}

/**
 * Units that cost more from a later copy on (Field Manual "1st–2nd unit" / "3rd+ unit" rows):
 * copy number `fromCopy` (1-based) and every later one use `brackets`.
 */
export const POINTS_LATER: Record<string, { fromCopy: number; brackets: PointsBracket[] }> = {
  redemptor: { fromCopy: 3, brackets: [{ models: 1, points: 210 }] },
  bladeguard: { fromCopy: 3, brackets: [{ models: 3, points: 90 }, { models: 6, points: 170 }] },
  deffDread: { fromCopy: 3, brackets: [{ models: 1, points: 120 }] },
  nobz: { fromCopy: 3, brackets: [{ models: 5, points: 115 }, { models: 10, points: 220 }] },
  swoopingHawks: { fromCopy: 3, brackets: [{ models: 5, points: 115 }, { models: 10, points: 205 }] },
  canoptekWraiths: { fromCopy: 2, brackets: [{ models: 3, points: 115 }, { models: 6, points: 240 }] },
  skorpekhDestroyers: { fromCopy: 3, brackets: [{ models: 3, points: 95 }, { models: 6, points: 180 }] },
  sicarians: { fromCopy: 3, brackets: [{ models: 5, points: 85 }, { models: 10, points: 165 }] },
  kastelans: { fromCopy: 2, brackets: [{ models: 2, points: 180 }, { models: 4, points: 340 }] },
  ironstriders: { fromCopy: 3, brackets: [{ models: 1, points: 95 }, { models: 2, points: 175 }, { models: 3, points: 265 }] },
}

/** Unit sizes the Field Manual lists for a datasheet. */
export const legalSizes = (datasheetId: string): number[] => (POINTS[datasheetId] ?? []).map((b) => b.models)

/** Exact cost of the `copy`-th unit (1-based) of a datasheet at a listed size, or null for an unlisted size. */
export function listedCost(datasheetId: string, models: number, copy = 1): number | null {
  const later = POINTS_LATER[datasheetId]
  const brackets = later && copy >= later.fromCopy ? later.brackets : POINTS[datasheetId]
  return brackets?.find((b) => b.models === models)?.points ?? null
}

export interface UnitCost {
  points: number
  /** false when the unit size is not in the Field Manual and the cost is pro-rated per model */
  exact: boolean
}

/**
 * Cost of the `copy`-th unit (1-based) of a datasheet with `models` models. A size that the Field
 * Manual lists costs exactly that; any other size (e.g. the Introductory Set's 6 Boyz) is pro-rated
 * from the smallest bracket.
 */
export function unitPoints(datasheetId: string, models: number, copy = 1): UnitCost {
  const brackets = POINTS[datasheetId]
  if (!brackets?.length) return { points: 0, exact: false }
  const listed = listedCost(datasheetId, models, copy)
  if (listed !== null) return { points: listed, exact: true }
  const base = brackets[0]
  return { points: Math.round((base.points / base.models) * models), exact: false }
}

/** Indicative per-model cost: the unit cost split evenly between its models. */
export function pointsPerModel(datasheetId: string, models: number, copy = 1): number {
  return models > 0 ? Math.round(unitPoints(datasheetId, models, copy).points / models) : 0
}

/** Which copy of its datasheet `u` is among its owner's units (1-based, in roster order). */
export const copyIndex = (units: UnitState[], u: UnitState) =>
  units.filter((x) => x.owner === u.owner && x.datasheetId === u.datasheetId).indexOf(u) + 1 || 1

/** Army cost from the units as they were mustered (casualties do not change the list cost). */
export function armyPoints(units: UnitState[]): UnitCost {
  return units.reduce<UnitCost>(
    (sum, u) => {
      const c = unitPoints(u.datasheetId, u.startingModels, copyIndex(units, u))
      return { points: sum.points + c.points, exact: sum.exact && c.exact }
    },
    { points: 0, exact: true },
  )
}

/** "475 очк." or "≈ 45 очк." when the cost is pro-rated. */
export const fmtPoints = (c: UnitCost) => `${c.exact ? '' : '≈ '}${c.points} очк.`
