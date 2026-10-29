import { describe, expect, it } from 'vitest'
import { baseRadius } from '../geometry/geometry'
import { getUnit } from '../gameState'
import { baseWhollyWithin, deploymentIssues, deploymentProblem, deploymentZone } from '../rules/deployment'
import { SCENARIOS } from '../scenarios/scenarios'
import { rect } from '../geometry/geometry'

describe('deployment', () => {
  it('every scenario offers legal default positions for both armies', () => {
    for (const sc of SCENARIOS) {
      const s = sc.build()
      for (const u of s.units) expect(deploymentProblem(s, u, {}), `${sc.id}/${u.id}`).toBeNull()
      expect(deploymentIssues(s, 'marines', ['lt', 'int'])).toEqual([])
      expect(deploymentIssues(s, 'orks', ['boyz'])).toEqual([])
    }
  })
  it('requires the whole base inside the zone', () => {
    const zone = rect(0, 0, 6, 22)
    const r = baseRadius(32)
    expect(baseWhollyWithin({ x: 6 - r, y: 5 }, r, zone)).toBe(true)
    expect(baseWhollyWithin({ x: 6 - r + 0.1, y: 5 }, r, zone)).toBe(false)
    const s = SCENARIOS[0].build()
    expect(deploymentZone(s, 'marines')).toEqual(zone)
    expect(deploymentProblem(s, getUnit(s, 'lt'), { 'lt-0': { x: 5.8, y: 18 } })).toContain('зоне развёртывания')
  })
  it('rejects overlapping bases and broken coherency, and lists unplaced units', () => {
    const s = SCENARIOS[0].build()
    expect(deploymentProblem(s, getUnit(s, 'lt'), { 'lt-0': { x: 4, y: 11 } })).toContain('пересекается')
    expect(deploymentProblem(s, getUnit(s, 'int'), { 'int-4': { x: 4, y: 20 } })).toContain('связность')
    expect(deploymentIssues(s, 'marines', ['lt'])).toEqual(['«Интерсессоры» ещё не расставлен.'])
  })
})
