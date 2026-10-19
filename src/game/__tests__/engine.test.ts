import { describe, expect, it } from 'vitest'
import { scriptedRoller, seededRoller } from '../dice/dice'
import { apply, shootPlan, validate } from '../engine'
import { baseRadius, rect } from '../geometry/geometry'
import { alive, getUnit } from '../gameState'
import type { GameState } from '../types'
import { bare, column, place, started } from './helpers'

const r32 = baseRadius(32)
const r40 = baseRadius(40)

describe('initialisation', () => {
  it('builds both armies from the Introductory Set', () => {
    const s = started()
    const ids = s.units.map((u) => [u.id, u.models.length])
    expect(ids).toEqual([['lt', 1], ['int', 5], ['boyz', 6]])
    expect(getUnit(s, 'lt').models[0].wounds).toBe(4)
    expect(s.round).toBe(1)
    expect(s.phase).toBe('command')
    expect(s.players.marines.cp).toBe(1)
    expect(s.players.orks.cp).toBe(1)
    expect(s.diceLog[0].title).toContain('первый ход')
  })
})

describe('phases and turns', () => {
  it('cycles command → movement → shooting → charge → fight → next player', () => {
    let s = started(1)
    const first = s.activePlayer
    const r = seededRoller(5)
    for (const p of ['movement', 'shooting', 'charge', 'fight']) {
      s = apply(s, { type: 'endPhase' }, r)
      expect(s.phase).toBe(p)
    }
    s = apply(s, { type: 'endPhase' }, r)
    expect(s.phase).toBe('command')
    expect(s.activePlayer).not.toBe(first)
    expect(s.round).toBe(1)
    for (let i = 0; i < 5; i++) s = apply(s, { type: 'endPhase' }, r)
    expect(s.round).toBe(2)
    expect(s.activePlayer).toBe(first)
  })
  it('ends after 5 battle rounds and compares VP', () => {
    let s = started(3)
    const r = seededRoller(1)
    for (let i = 0; i < 5 * 2 * 5; i++) s = apply(s, { type: 'endPhase' }, r)
    expect(s.winner).not.toBeNull()
    expect(validate(s, { type: 'endPhase' }).ok).toBe(false)
  })
})

describe('movement validation', () => {
  const s0 = () => {
    const s = bare('movement')
    place(s, 'int', column(5, 5, 5, 2))
    place(s, 'boyz', column(25, 5, 6))
    return s
  }
  it('allows a move of exactly M and rejects slightly more', () => {
    const s = s0()
    const u = getUnit(s, 'int')
    const exact = Object.fromEntries(u.models.map((m) => [m.id, { x: m.pos.x + 6, y: m.pos.y }]))
    expect(validate(s, { type: 'move', unitId: 'int', mode: 'normal', positions: exact })).toEqual({ ok: true })
    const over = Object.fromEntries(u.models.map((m) => [m.id, { x: m.pos.x + 6.01, y: m.pos.y }]))
    const v = validate(s, { type: 'move', unitId: 'int', mode: 'normal', positions: over })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toContain('больше допустимых')
  })
  it('rejects overlapping bases, leaving the board and breaking coherency', () => {
    const s = s0()
    const [a, b] = getUnit(s, 'int').models
    expect(validate(s, { type: 'move', unitId: 'int', mode: 'normal', positions: { [a.id]: { ...b.pos, y: b.pos.y - 0.5 } } }).ok).toBe(false)
    expect(validate(s, { type: 'move', unitId: 'int', mode: 'normal', positions: { [a.id]: { x: 0.1, y: a.pos.y } } }).ok).toBe(false)
    const v = validate(s, { type: 'move', unitId: 'int', mode: 'normal', positions: { [a.id]: { x: a.pos.x + 5, y: a.pos.y } } })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toContain('связность')
  })
  it('allows touching bases', () => {
    const s = bare('movement')
    place(s, 'lt', [{ x: 10, y: 10 }])
    place(s, 'int', column(10 + r40 + r32, 10, 5, 1.5))
    const u = getUnit(s, 'lt')
    expect(validate(s, { type: 'move', unitId: 'lt', mode: 'normal', positions: { [u.models[0].id]: { x: 10, y: 10 } } }).ok).toBe(true)
  })
  it('rejects ending within engagement range of an enemy', () => {
    const s = s0()
    place(s, 'lt', [{ x: 18, y: 5 }])
    const v = validate(s, { type: 'move', unitId: 'lt', mode: 'normal', positions: { 'lt-0': { x: 23, y: 5 } } })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toContain('зоне контакта')
  })
  it('invalid actions do not mutate state', () => {
    const s = s0()
    const snapshot = JSON.stringify(s)
    expect(() => apply(s, { type: 'move', unitId: 'int', mode: 'normal', positions: { 'int-0': { x: 29, y: 5 } } }, seededRoller(1))).toThrow()
    expect(JSON.stringify(s)).toBe(snapshot)
  })
  it('advance adds D6 to M', () => {
    let s = s0()
    s = apply(s, { type: 'declareAdvance', unitId: 'lt' }, scriptedRoller([4]))
    expect(getUnit(s, 'lt').advanceRoll).toBe(4)
    const p = getUnit(s, 'lt').models[0].pos
    expect(validate(s, { type: 'move', unitId: 'lt', mode: 'advance', positions: { 'lt-0': { x: p.x, y: p.y + 10 } } }).ok).toBe(true)
    expect(validate(s, { type: 'move', unitId: 'lt', mode: 'advance', positions: { 'lt-0': { x: p.x, y: p.y + 10.1 } } }).ok).toBe(false)
  })
})

function shootingState(distanceEdge: number): GameState {
  const s = bare('shooting')
  place(s, 'lt', [{ x: 2, y: 20 }])
  place(s, 'int', [{ x: 3, y: 10 }])
  // Boy at exactly `distanceEdge` inches edge-to-edge from the intercessor
  place(s, 'boyz', [{ x: 3 + 2 * r32 + distanceEdge, y: 10 }])
  getUnit(s, 'boyz').models[0].profileId = 'boy'
  getUnit(s, 'boyz').models[0].wounds = 1
  return s
}

describe('shooting', () => {
  it('target exactly at 24" is in range; beyond is not', () => {
    expect(validate(shootingState(24), { type: 'shoot', unitId: 'int', targetId: 'boyz' }).ok).toBe(true)
    const v = validate(shootingState(24.05), { type: 'shoot', unitId: 'int', targetId: 'boyz' })
    expect(v.ok).toBe(false)
  })
  it('Rapid Fire adds attacks at half range', () => {
    expect(shootPlan(shootingState(12), getUnit(shootingState(12), 'int'), getUnit(shootingState(12), 'boyz')).groups[0].attacks).toBe(2)
    const s = shootingState(13)
    expect(shootPlan(s, getUnit(s, 'int'), getUnit(s, 'boyz')).groups[0].attacks).toBe(1)
  })
  it('line of sight is blocked by obscuring terrain', () => {
    const s = shootingState(10)
    s.terrain = [{ id: 'w', name: 'wall', kind: 'ruin', obscuring: true, poly: rect(8, 5, 1, 10) }]
    const v = validate(s, { type: 'shoot', unitId: 'int', targetId: 'boyz' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toContain('линию видимости')
  })
  it('a target inside terrain gets cover (BS worsened by 1)', () => {
    const s = shootingState(10)
    const boy = getUnit(s, 'boyz').models[0]
    s.terrain = [{ id: 'c', name: 'crater', kind: 'crater', obscuring: false, poly: rect(boy.pos.x - 1, 9, 2, 2) }]
    expect(shootPlan(s, getUnit(s, 'int'), getUnit(s, 'boyz')).cover).toBe(true)
  })
  it('resolves a shot through the engine and logs dice', () => {
    const s = shootingState(10)
    // focused fire, rapid fire → 2 attacks: hits 4,4 ; wounds 3,3 ; saves 2,2 → both fail, D2 kills the boy
    const s2 = apply(s, { type: 'shoot', unitId: 'int', targetId: 'boyz' }, scriptedRoller([4, 4, 3, 3, 2, 2]))
    expect(alive(getUnit(s2, 'boyz'))).toHaveLength(0)
    expect(s2.winner).toBe('marines')
    expect(s2.diceLog.at(-1)!.steps.map((x) => x.label)).toEqual(['Попадание', 'Ранение', 'Спасбросок', 'Урон'])
  })
  it('a unit cannot shoot twice or after falling back', () => {
    const s = shootingState(10)
    s.units.find((u) => u.id === 'int')!.shot = true
    expect(validate(s, { type: 'shoot', unitId: 'int', targetId: 'boyz' }).ok).toBe(false)
    const s2 = shootingState(10)
    s2.units.find((u) => u.id === 'int')!.move = 'fallBack'
    expect(validate(s2, { type: 'shoot', unitId: 'int', targetId: 'boyz' }).ok).toBe(false)
  })
  it('Heavy gives +1 to hit only if the unit moved 3" or less', () => {
    const s = shootingState(20)
    expect(shootPlan(s, getUnit(s, 'int'), getUnit(s, 'boyz')).groups[0].ctx.hitMod).toBe(1)
    getUnit(s, 'int').movedDistance = 3.5
    expect(shootPlan(s, getUnit(s, 'int'), getUnit(s, 'boyz')).groups[0].ctx.hitMod).toBe(0)
  })
})

describe('charge and fight', () => {
  function chargeState() {
    const s = bare('charge', 'orks')
    place(s, 'lt', [{ x: 2, y: 20 }])
    place(s, 'int', column(10, 5, 5, 1.5))
    place(s, 'boyz', column(16, 5, 6, 1.5))
    return s
  }
  it('a roll of 2 always fails', () => {
    const s = apply(chargeState(), { type: 'declareCharge', unitId: 'boyz' }, scriptedRoller([1, 1]))
    expect(s.pendingCharge).toBeNull()
    expect(getUnit(s, 'boyz').charged).toBe(false)
  })
  it('charge succeeds, unit ends engaged and fights first', () => {
    let s = apply(chargeState(), { type: 'declareCharge', unitId: 'boyz' }, scriptedRoller([6, 5]))
    expect(s.pendingCharge?.targets).toEqual(['int'])
    expect(validate(s, { type: 'endPhase' }).ok).toBe(false)
    s = apply(s, { type: 'chargeMove', unitId: 'boyz', targetIds: ['int'] }, seededRoller(1))
    expect(getUnit(s, 'boyz').charged).toBe(true)
    s = apply(s, { type: 'endPhase' }, seededRoller(2))
    expect(s.phase).toBe('fight')
    expect(s.fight?.selecting).toBe('orks')
    expect(validate(s, { type: 'fight', unitId: 'int', targetId: 'boyz' }).ok).toBe(false)
    s = apply(s, { type: 'fight', unitId: 'boyz', targetId: 'int' }, seededRoller(3))
    expect(getUnit(s, 'boyz').fought).toBe(true)
    // marines strike back if they survived
    if (alive(getUnit(s, 'int')).length) {
      expect(s.fight?.selecting).toBe('marines')
      s = apply(s, { type: 'fight', unitId: 'int', targetId: 'boyz' }, seededRoller(4))
    }
    expect(s.fight).toBeNull()
    expect(validate(s, { type: 'endPhase' }).ok).toBe(true)
  })
  it('cannot charge after advancing or from more than 12"', () => {
    const s = chargeState()
    getUnit(s, 'boyz').move = 'advance'
    expect(validate(s, { type: 'declareCharge', unitId: 'boyz' }).ok).toBe(false)
    const far = bare('charge', 'orks')
    expect(validate(far, { type: 'declareCharge', unitId: 'boyz' }).ok).toBe(false)
  })
})

describe('objectives and victory', () => {
  it('scores 5 VP per controlled objective in the command phase from round 2', () => {
    let s = bare('fight', 'orks')
    s.round = 1
    s.objectives = [{ id: 'o', pos: { x: 5, y: 5 }, controller: null }]
    place(s, 'int', column(5, 6, 5, 1.5))
    s = apply(s, { type: 'endPhase' }, seededRoller(1))
    expect(s.round).toBe(2)
    expect(s.activePlayer).toBe('marines')
    expect(s.objectives[0].controller).toBe('marines')
    expect(s.players.marines.vp).toBe(5)
  })
  it('battle-shocked units have OC 0', () => {
    const s = bare('movement')
    s.objectives = [{ id: 'o', pos: { x: 5, y: 5 }, controller: null }]
    place(s, 'int', column(5, 6, 5, 1.5))
    getUnit(s, 'int').battleShocked = true
    s.units = s.units.filter((u) => u.id !== 'lt')
    const s2 = apply(s, { type: 'endPhase' }, seededRoller(1))
    expect(s2.objectives[0].controller).toBeNull()
  })
  it('out-of-coherency models are removed at end of turn', () => {
    let s = bare('fight')
    place(s, 'int', [{ x: 5, y: 5 }, { x: 5, y: 6.5 }, { x: 5, y: 8 }, { x: 5, y: 9.5 }, { x: 20, y: 20 }])
    s = apply(s, { type: 'endPhase' }, seededRoller(1))
    expect(alive(getUnit(s, 'int'))).toHaveLength(4)
  })
})
