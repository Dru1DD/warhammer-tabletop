import { describe, expect, it } from 'vitest'
import { DATASHEETS } from '../data/datasheets'
import { armyPoints, fmtPoints, pointsPerModel, POINTS, unitPoints } from '../data/points'
import { armyOf } from '../scenarios/scenarios'
import { FACTIONS, type PlayerId } from '../types'

describe('unit points', () => {
  it('every datasheet has a cost and every cost belongs to a datasheet', () => {
    expect(Object.keys(POINTS).sort()).toEqual(Object.keys(DATASHEETS).sort())
    for (const brackets of Object.values(POINTS)) {
      expect(brackets.length).toBeGreaterThan(0)
      for (const b of brackets) expect(b.points).toBeGreaterThan(0)
    }
  })

  it('uses the Field Manual price for a listed unit size', () => {
    expect(unitPoints('intercessors', 5)).toEqual({ points: 80, exact: true })
    expect(unitPoints('intercessors', 10)).toEqual({ points: 150, exact: true })
    expect(unitPoints('guardianDefenders', 11)).toEqual({ points: 90, exact: true })
  })

  it('pro-rates a size the Field Manual does not list', () => {
    expect(unitPoints('boyz', 6)).toEqual({ points: 45, exact: false }) // Introductory Set mob
    expect(unitPoints('kastelans', 3)).toEqual({ points: 240, exact: false })
    expect(fmtPoints(unitPoints('boyz', 6))).toBe('≈ 45 очк.')
  })

  it('gives an indicative per-model cost', () => {
    expect(pointsPerModel('intercessors', 5)).toBe(16)
    expect(pointsPerModel('redemptor', 1)).toBe(195)
  })

  it('totals the Combat Patrol armies', () => {
    const total = (f: PlayerId) => armyPoints(armyOf('combat-patrol', f)!)
    expect(total('marines')).toEqual({ points: 475, exact: true })
    expect(total('orks')).toEqual({ points: 335, exact: true })
    expect(total('tyranids')).toEqual({ points: 385, exact: true })
    expect(total('necrons')).toEqual({ points: 295, exact: true })
    expect(total('aeldari')).toEqual({ points: 315, exact: true })
    expect(total('adeptus_mechanicus')).toEqual({ points: 865, exact: false }) // 3 Kastelans are pro-rated
    for (const f of FACTIONS) expect(total(f).points).toBeGreaterThan(0)
  })

  it('counts mustered models, so casualties do not change the cost', () => {
    const army = armyOf('combat-patrol', 'marines')!
    army[1].models = army[1].models.slice(0, 2)
    expect(armyPoints(army).points).toBe(475)
  })
})
