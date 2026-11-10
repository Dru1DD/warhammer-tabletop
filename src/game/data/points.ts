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
 * Unit costs by datasheet id. Only the first-unit price is listed: some units cost more from the
 * 2nd/3rd copy onward (Redemptor, Deff Dread, Skorpekh Destroyers, Sicarians, Kastelans), and the
 * rosters here never repeat them.
 */
export const POINTS: Record<string, PointsBracket[]> = {
  // Space Marines
  lieutenant: [{ models: 1, points: 45 }],
  intercessors: [{ models: 5, points: 80 }, { models: 10, points: 150 }],
  assaultIntercessors: [{ models: 5, points: 75 }, { models: 10, points: 150 }],
  redemptor: [{ models: 1, points: 195 }],
  // Orks
  boyz: [{ models: 10, points: 75 }, { models: 20, points: 150 }],
  deffDread: [{ models: 1, points: 110 }],
  // Tyranids
  hiveTyrant: [{ models: 1, points: 195 }],
  termagants: [{ models: 10, points: 60 }, { models: 20, points: 110 }],
  hormagaunts: [{ models: 10, points: 70 }, { models: 20, points: 120 }],
  tyranidWarriors: [{ models: 3, points: 60 }, { models: 6, points: 120 }],
  // Necrons
  overlord: [{ models: 1, points: 90 }],
  necronWarriors: [{ models: 10, points: 80 }, { models: 20, points: 190 }],
  skorpekhDestroyers: [{ models: 3, points: 85 }, { models: 6, points: 170 }],
  scarabSwarms: [{ models: 3, points: 40 }, { models: 6, points: 80 }],
  // Aeldari (10 Guardians + the Heavy Weapon Platform = 11 models)
  farseer: [{ models: 1, points: 70 }],
  guardianDefenders: [{ models: 11, points: 90 }],
  direAvengers: [{ models: 5, points: 75 }, { models: 10, points: 150 }],
  windriders: [{ models: 3, points: 80 }, { models: 6, points: 160 }],
  // Adeptus Mechanicus
  techDominus: [{ models: 1, points: 65 }],
  techManipulus: [{ models: 1, points: 60 }],
  rangers: [{ models: 10, points: 85 }],
  vanguard: [{ models: 10, points: 90 }],
  breachers: [{ models: 3, points: 150 }, { models: 6, points: 320 }],
  destroyers: [{ models: 3, points: 100 }, { models: 6, points: 210 }],
  sicarians: [{ models: 5, points: 75 }, { models: 10, points: 155 }],
  kastelans: [{ models: 2, points: 160 }, { models: 4, points: 320 }],
}

export interface UnitCost {
  points: number
  /** false when the unit size is not in the Field Manual and the cost is pro-rated per model */
  exact: boolean
}

/**
 * Cost of a unit of `models` models. A size that the Field Manual lists costs exactly that;
 * any other size (e.g. the Introductory Set's 6 Boyz) is pro-rated from the smallest bracket.
 */
export function unitPoints(datasheetId: string, models: number): UnitCost {
  const brackets = POINTS[datasheetId]
  if (!brackets?.length) return { points: 0, exact: false }
  const hit = brackets.find((b) => b.models === models)
  if (hit) return { points: hit.points, exact: true }
  const base = brackets[0]
  return { points: Math.round((base.points / base.models) * models), exact: false }
}

/** Indicative per-model cost: the unit cost split evenly between its models. */
export function pointsPerModel(datasheetId: string, models: number): number {
  return models > 0 ? Math.round(unitPoints(datasheetId, models).points / models) : 0
}

/** Army cost from the units as they were mustered (casualties do not change the list cost). */
export function armyPoints(units: UnitState[]): UnitCost {
  return units.reduce<UnitCost>(
    (sum, u) => {
      const c = unitPoints(u.datasheetId, u.startingModels)
      return { points: sum.points + c.points, exact: sum.exact && c.exact }
    },
    { points: 0, exact: true },
  )
}

/** "475 очк." or "≈ 45 очк." when the cost is pro-rated. */
export const fmtPoints = (c: UnitCost) => `${c.exact ? '' : '≈ '}${c.points} очк.`
