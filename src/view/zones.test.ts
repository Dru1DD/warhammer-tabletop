import { describe, expect, it } from 'vitest'
import { composeUnit } from '../game/army/armyList'
import { newUnit, radiusOf } from '../game/gameState'
import { dist } from '../game/geometry/geometry'
import type { GameState, PlayerId, UnitState, Vec } from '../game/types'
import { battle, column, place } from '../game/__tests__/helpers'
import { dragZoneNotes, unionOutline, withDraft, zoneBadges, zoneShapes } from './zones'

function add(s: GameState, owner: PlayerId, datasheetId: string, at: Vec[], id: string): UnitState {
  const u = newUnit(id, datasheetId, owner, id, composeUnit(datasheetId, at.length).map((p, i) => [p, at[i]]))
  s.units.push(u)
  return u
}

function empty(a: PlayerId, b: PlayerId) {
  const s = battle(a, b, 'movement', a)
  for (const u of s.units) place(s, u.id, [])
  return s
}

describe('zone view', () => {
  it('the outline of overlapping circles is their outer edge only', () => {
    const circles = [{ x: 0, y: 0, r: 2 }, { x: 2, y: 0, r: 2 }]
    const pts = unionOutline(circles).flat()
    expect(pts.length).toBeGreaterThan(50)
    for (const p of pts) expect(circles.some((c) => Math.abs(dist(p, c) - c.r) < 1e-9)).toBe(true)
    for (const p of pts) expect(circles.every((c) => dist(p, c) >= c.r - 1e-6)).toBe(true)
  })

  it('a zone is drawn from the edge of each model’s base, the explosion only when asked', () => {
    const s = empty('adeptus_mechanicus', 'orks')
    const onager = add(s, 'adeptus_mechanicus', 'onager', [{ x: 10, y: 10 }], 'vOnager')
    const shapes = zoneShapes(s, [onager])
    expect(shapes.map((z) => z.zone.id)).toEqual(['emanatusForceField'])
    expect(shapes[0].circles[0].r).toBeCloseTo(6 + radiusOf(onager.models[0]))
    expect(shapes[0].tone).toBe('help')
    expect(zoneShapes(s, [onager], true).map((z) => z.zone.id).sort()).toEqual(['deadlyDemise', 'emanatusForceField'])
  })

  it('badges: 4++ with the share of covered Rangers; Synapse only while its zone is drawn', () => {
    const s = empty('adeptus_mechanicus', 'orks')
    add(s, 'adeptus_mechanicus', 'onager', [{ x: 4, y: 12 }], 'vOnager')
    const rangers = add(s, 'adeptus_mechanicus', 'rangers', column(9, 6, 10, 1.4), 'vRangers')
    const b = zoneBadges(s, new Set()).get(rangers.id)!
    expect(b).toHaveLength(1)
    expect(b[0].text).toMatch(/^4\+\+ \d+\/10$/)

    const t = empty('tyranids', 'marines')
    add(t, 'tyranids', 'tyranidWarriors', column(4, 6, 3, 2), 'vWarriors')
    const gaunts = add(t, 'tyranids', 'termagants', column(8, 6, 5, 1.2), 'vGaunts')
    expect(zoneBadges(t, new Set()).get(gaunts.id)).toBeUndefined()
    expect(zoneBadges(t, new Set(['synapse:vWarriors'])).get(gaunts.id)?.map((x) => x.text)).toEqual(['Синапс'])
  })

  it('dragging the Onager tells whom its field will cover; dragging Rangers out tells they leave it', () => {
    const s = empty('adeptus_mechanicus', 'orks')
    const onager = add(s, 'adeptus_mechanicus', 'onager', [{ x: 4, y: 12 }], 'vOnager')
    const rangers = add(s, 'adeptus_mechanicus', 'rangers', column(30, 6, 10, 1.4), 'vRangers')
    const toward = withDraft(s, { [onager.models[0].id]: { x: 26, y: 12 } })
    expect(dragZoneNotes(s, toward, onager.id).join(' | ')).toMatch(/накроет: vRangers/)
    expect(dragZoneNotes(s, s, onager.id).join(' | ')).toMatch(/никого не накроет/)

    place(s, rangers.id, column(8, 6, 10, 1.4))
    const away = withDraft(s, Object.fromEntries(rangers.models.map((m) => [m.id, { x: m.pos.x + 20, y: m.pos.y }])))
    expect(dragZoneNotes(s, away, rangers.id).join(' | ')).toMatch(/Выйдет из зоны «Силовое поле Эманатус» \(vOnager\)/)
    expect(dragZoneNotes(away, s, rangers.id).join(' | ')).toMatch(/Войдёт в зону «Силовое поле Эманатус» \(vOnager\): 4\+\+/)
  })
})
