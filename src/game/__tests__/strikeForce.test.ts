import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '../geometry/geometry'
import { deploymentProblem, deploymentZone } from '../rules/deployment'
import { scenarioById } from '../scenarios/scenarios'
import { LAYOUT_IDS, layoutFor, MAP_IDS, MAPS } from '../scenarios/strikeForce'
import { FACTIONS, type PlayerId } from '../types'

const area = (poly: { x: number; y: number }[]) => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p.x * q.y - q.x * p.y }, 0)) / 2

describe('44″×60″ battlefield', () => {
  it('six maps: zones inside the board, the same size on both sides, five objectives (two homes in their zones)', () => {
    for (const id of MAP_IDS) {
      const m = MAPS[id]
      expect(m.board.width * m.board.height).toBe(44 * 60)
      for (const p of [...m.deployment.west, ...m.deployment.east]) {
        expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(m.board.width)
        expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(m.board.height)
      }
      expect(area(m.deployment.west)).toBeCloseTo(area(m.deployment.east))
      expect(m.objectives).toHaveLength(5)
      const homes = m.objectives.filter((o) => o.role === 'home')
      expect(homes.map((o) => o.side).sort()).toEqual(['east', 'west'])
      for (const h of homes) expect(pointInPolygon(h.pos, m.deployment[h.side!])).toBe(true)
    }
  })

  it('no objective sits in a container or a barricade, on any map and layout', () => {
    for (const id of MAP_IDS) for (const l of LAYOUT_IDS) {
      const terrain = layoutFor(l, MAPS[id].board)
      for (const o of MAPS[id].objectives)
        for (const t of terrain.filter((x) => x.kind === 'container' || x.kind === 'barricade')) expect(pointInPolygon(o.pos, t.poly), `${id}/${l}/${t.id}`).toBe(false)
    }
  })

  it('every army at 1000 points fits in its zone on every map and layout, legally', { timeout: 120_000 }, () => {
    for (const id of MAP_IDS) for (const l of LAYOUT_IDS) {
      const sides: [PlayerId, PlayerId][] = [['marines', 'orks'], ['tyranids', 'necrons'], ['aeldari', 'adeptus_mechanicus']]
      for (const pair of sides) {
        const s = scenarioById('strike-force').build(pair, {}, undefined, { mapId: id, layoutId: l })
        expect(s.mapId).toBe(id)
        expect(s.board).toEqual(MAPS[id].board)
        for (const u of s.units) expect(deploymentProblem(s, u, Object.fromEntries(u.models.map((m) => [m.id, m.pos])))).toBeNull()
        for (const f of pair) expect(deploymentZone(s, f)).toEqual(MAPS[id].deployment[pair[0] === f ? 'west' : 'east'])
      }
    }
    expect(FACTIONS).toHaveLength(6)
  })

  it('home objectives belong to the side whose zone holds them', () => {
    const s = scenarioById('strike-force').build(['orks', 'marines'], {}, undefined, { mapId: 'dawnOfWar', layoutId: 'B' })
    const homes = s.objectives.filter((o) => o.role === 'home')
    expect(homes.map((o) => o.home).sort()).toEqual(['marines', 'orks'])
    for (const o of homes) expect(pointInPolygon(o.pos, deploymentZone(s, o.home!))).toBe(true)
  })
})
