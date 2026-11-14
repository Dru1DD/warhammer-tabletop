import { describe, expect, it } from 'vitest'
import { attachments, POINTS_LIMITS, presetList, type ArmyList } from '../army/armyList'
import { pointInPolygon } from '../geometry/geometry'
import { deploymentProblem, deploymentZone } from '../rules/deployment'
import { boardForLists, scenarioById, takesLists } from '../scenarios/scenarios'
import { LAYOUT_IDS, layoutFor, MAP_IDS, MAPS } from '../scenarios/strikeForce'
import { FACTIONS, type GameState, type PlayerId } from '../types'

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

  it('every preset over 1000 points (1500, 2000, 2500) fits in its zone on every map, legally', { timeout: 300_000 }, () => {
    const pairs: [PlayerId, PlayerId][] = [['marines', 'orks'], ['tyranids', 'necrons'], ['aeldari', 'adeptus_mechanicus']]
    for (const limit of POINTS_LIMITS.filter((l) => l > 1000))
      MAP_IDS.forEach((id, i) => {
        for (const pair of pairs) {
          const lists = Object.fromEntries(pair.map((f) => [f, presetList(f, limit)]))
          const s = scenarioById('strike-force').build(pair, lists, undefined, { mapId: id, layoutId: LAYOUT_IDS[i % LAYOUT_IDS.length] })
          // a character that joins a unit is inside it
          for (const f of pair) expect(s.units.filter((u) => u.owner === f), `${f} ${limit} ${id}`).toHaveLength(attachments(lists[f]).filter((j) => j === null).length)
          for (const u of s.units) expect(deploymentProblem(s, u, Object.fromEntries(u.models.map((m) => [m.id, m.pos]))), `${u.id} ${limit} ${id}`).toBeNull()
        }
      })
  })

  it('a side without its own list plays the preset at its opponent’s limit (1000 points when neither has a list)', () => {
    const ids = (s: GameState, f: PlayerId) => s.units.filter((u) => u.owner === f).map((u) => u.datasheetId)
    /** the units a list fields: its entries without the characters that join another unit */
    const fielded = (l: ArmyList) => l.units.filter((_, i) => attachments(l)[i] === null).map((e) => e.datasheetId)
    const build = (lists: Partial<Record<PlayerId, ArmyList>>) => scenarioById('strike-force').build(['marines', 'orks'], lists, undefined, { mapId: 'hammerAnvil', layoutId: 'A' })
    expect(ids(build({ orks: presetList('orks', 2000) }), 'marines')).toEqual(fielded(presetList('marines', 2000)))
    expect(ids(build({ marines: presetList('marines', 1500) }), 'orks')).toEqual(fielded(presetList('orks', 1500)))
    expect(ids(build({}), 'marines')).toEqual(fielded(presetList('marines', 1000)))
  })

  it('sets up a dense list in a narrow zone with a narrower formation instead of reporting no room', () => {
    // the biggest units of every Ork datasheet up to 2000 points; its densest formations left the Gretchin no room on Sweeping Engagement
    const dense: ArmyList = {
      limit: 2000,
      units: ([
        ['deffDread', 1], ['boyz', 20], ['warboss', 1], ['nobz', 10], ['gretchin', 20], ['kommandos', 10], ['trukk', 1], ['battlewagon', 1],
        ['deffDread', 1], ['boyz', 20], ['warboss', 1], ['nobz', 10], ['gretchin', 20], ['kommandos', 10], ['trukk', 1], ['battlewagon', 1], ['trukk', 1],
      ] as const).map(([datasheetId, size]) => ({ datasheetId, size })),
    }
    const s = scenarioById('strike-force').build(['orks', 'marines'], { orks: dense }, undefined, { mapId: 'sweeping', layoutId: 'A' })
    const orks = s.units.filter((u) => u.owner === 'orks')
    expect(orks).toHaveLength(15) // the two Warbosses lead the two Boyz mobs
    for (const u of orks) expect(deploymentProblem(s, u, Object.fromEntries(u.models.map((m) => [m.id, m.pos]))), u.id).toBeNull()
  })

  it('lists over 1000 points need this board: Combat Patrol takes up to 1000', () => {
    const patrol = scenarioById('combat-patrol')
    const strike = scenarioById('strike-force')
    expect(takesLists(patrol, [presetList('orks', 1000), undefined])).toBe(true)
    expect(takesLists(patrol, [presetList('orks', 1000), presetList('marines', 1500)])).toBe(false)
    expect(takesLists(strike, [presetList('orks', 2500)])).toBe(true)
    expect(takesLists(scenarioById('training-outpost'), [presetList('orks', 500)])).toBe(false)
    expect(takesLists(scenarioById('training-outpost'), [null, undefined])).toBe(true)
    expect(boardForLists('marines', 'orks', [presetList('orks', 500)])).toBe('combat-patrol')
    expect(boardForLists('marines', 'orks', [presetList('orks', 2000)])).toBe('strike-force')
  })

  it('home objectives belong to the side whose zone holds them', () => {
    const s = scenarioById('strike-force').build(['orks', 'marines'], {}, undefined, { mapId: 'dawnOfWar', layoutId: 'B' })
    const homes = s.objectives.filter((o) => o.role === 'home')
    expect(homes.map((o) => o.home).sort()).toEqual(['marines', 'orks'])
    for (const o of homes) expect(pointInPolygon(o.pos, deploymentZone(s, o.home!))).toBe(true)
  })
})

describe('44″×30″ (Combat Patrol) layouts', () => {
  const pairs: [PlayerId, PlayerId][] = [['marines', 'orks'], ['tyranids', 'necrons'], ['aeldari', 'adeptus_mechanicus']]
  it('A is the original layout; B and C are new, and the default build stays A', () => {
    const a = scenarioById('combat-patrol').build(['marines', 'orks'])
    expect(a.layoutId).toBeUndefined()
    expect(scenarioById('combat-patrol').build(['marines', 'orks'], {}, undefined, { layoutId: 'A' }).terrain).toEqual(a.terrain)
    const b = scenarioById('combat-patrol').build(['marines', 'orks'], {}, undefined, { layoutId: 'B' })
    expect(b.layoutId).toBe('B')
    expect(b.terrain).not.toEqual(a.terrain)
  })

  it('training rosters and 500-point presets stand legally on B and C; no objective is in a container or a barricade', { timeout: 120_000 }, () => {
    for (const l of ['B', 'C'] as const) for (const pair of pairs) for (const lists of [{}, { [pair[0]]: presetList(pair[0], 500), [pair[1]]: presetList(pair[1], 500) }]) {
      const s = scenarioById('combat-patrol').build(pair, lists, undefined, { layoutId: l })
      for (const u of s.units) expect(deploymentProblem(s, u, Object.fromEntries(u.models.map((m) => [m.id, m.pos]))), `${l} ${u.name}`).toBeNull()
      for (const o of s.objectives) for (const t of s.terrain.filter((x) => x.kind === 'container' || x.kind === 'barricade')) expect(pointInPolygon(o.pos, t.poly)).toBe(false)
    }
  })
})
