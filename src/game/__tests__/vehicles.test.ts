import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { resolveGroup } from '../combat/attack'
import { WEAPONS } from '../data/datasheets'
import { scriptedRoller, seededRoller } from '../dice/dice'
import { apply, meleePlan, shootPlan, startGame, validate } from '../engine'
import { rect } from '../geometry/geometry'
import { alive, getUnit } from '../gameState'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, Terrain } from '../types'
import { column, place } from './helpers'

/** Combat patrol with no terrain/objectives, at the given phase. */
function patrol(phase: GameState['phase'] = 'shooting', active: 'marines' | 'orks' = 'marines'): GameState {
  const s = scenarioById('combat-patrol').build()
  s.terrain = []
  s.objectives = []
  s.phase = phase
  s.activePlayer = active
  return s
}

const ruin: Terrain = { id: 'r', name: 'Руины', kind: 'ruin', obscuring: true, poly: rect(14, 12, 4, 6) }

describe('random characteristics', () => {
  it('rolls D3 extra attacks per model and D3 extra damage per failed save', () => {
    const s = patrol()
    const target = getUnit(s, 'dread')
    const p = { ...WEAPONS.redemptorFist.profiles[0], skill: 3 }
    // fist: 5 attacks, D3+3 damage, vs Deff Dread (Dread 'Ard −1 damage)
    // each failed save is followed by its damage roll
    const dice = [6, 6, 1, 1, 1, /* wounds */ 6, 6, /* save, D3 */ 1, 6, /* save, D3 */ 1, 1]
    const res = resolveGroup(scriptedRoller(dice), 'Редемптор', { weaponName: 'fist', profile: p, models: 1, attacks: 5, notes: [] }, target, {
      hitMod: 0, hitModNotes: [], skillWorsen: 0, lethalHits: false, damageMod: -1,
    })
    // (3+3−1) + (1+3−1) = 8 damage: Deff Dread (8 W) destroyed
    expect(res.damage).toBe(8)
    expect(res.killed).toBe(1)
    expect(res.steps.find((x) => x.label === 'Урон')!.dice.map((d) => d.value)).toEqual([3, 1])
  })
  it('macro plasma adds a D3 attack roll step before hitting', () => {
    const s = patrol()
    place(s, 'red', [{ x: 10, y: 15 }])
    place(s, 'dread', [{ x: 30, y: 15 }])
    const plan = shootPlan(s, getUnit(s, 'red'), getUnit(s, 'dread'))
    const g = plan.groups.find((x) => x.profile.randomA)!
    expect(g.randomAttacks).toBe(1)
    const res = resolveGroup(seededRoller(3), 'Редемптор', g, getUnit(s, 'dread'), g.ctx)
    expect(res.steps[0].label).toBe('Атаки')
    const total = 3 + res.steps[0].dice[0].value
    expect(res.steps[1].dice).toHaveLength(total)
  })
})

describe('MONSTER / VEHICLE rules', () => {
  it('"non-M/V" Lethal Hits do not work against vehicles; Duty Eternal and Dread \'Ard apply', () => {
    const s = patrol()
    place(s, 'boyz', column(20, 2, 10, 1.5).map((p, i) => ({ x: p.x + (i % 2) * 1.5, y: 2 + Math.floor(i / 2) * 2 })))
    place(s, 'red', [{ x: 12, y: 6 }])
    place(s, 'int', column(12, 14, 5))
    const boyz = getUnit(s, 'boyz')
    s.activePlayer = 'orks'
    const vsRed = shootPlan(s, boyz, getUnit(s, 'red'))
    expect(vsRed.problem).toBeNull()
    expect(vsRed.groups.every((g) => !g.ctx.lethalHits)).toBe(true)
    const vsInt = shootPlan(s, boyz, getUnit(s, 'int'))
    expect(vsInt.groups.find((g) => g.weaponName.startsWith('Шута'))!.ctx.lethalHits).toBe(true)
    // Deff Dread klaws S12 vs Redemptor T10: −1 to wound
    place(s, 'dread', [{ x: 12 + 1.77 + 1.18 + 0.5, y: 6 }])
    const melee = meleePlan(s, getUnit(s, 'dread'), getUnit(s, 'red'))
    expect(melee[0].ctx.woundMod).toBe(-1)
    const back = meleePlan(s, getUnit(s, 'red'), getUnit(s, 'dread'))
    expect(back[0].ctx.damageMod).toBe(-1)
  })
  it('an engaged vehicle can shoot non-Blast weapons at the unit it is engaged with, at −1 to hit', () => {
    const s = patrol('shooting', 'orks')
    place(s, 'dread', [{ x: 20, y: 15 }])
    place(s, 'int', column(20 + 1.18 + 0.63 + 0.5, 11, 5))
    const plan = shootPlan(s, getUnit(s, 'dread'), getUnit(s, 'int'))
    expect(plan.problem).toBeNull()
    expect(plan.groups.map((g) => g.weaponName)).toEqual(['Большая шута дреда (Big Shoota)']) // Skorcha has Blast
    expect(plan.groups[0].ctx.hitModNotes).toContain('техника в контакте −1')
    // the Redemptor's guns are all Blast: nothing to fire while engaged
    place(s, 'red', [{ x: 32, y: 15 }])
    place(s, 'boyz', [{ x: 32 + 1.77 + 0.63 + 0.5, y: 15 }])
    s.activePlayer = 'marines'
    expect(shootPlan(s, getUnit(s, 'red'), getUnit(s, 'boyz')).problem).toBeTruthy()
  })
  it('vehicles cannot cross dense terrain, infantry can; no one ends inside a container', () => {
    const s = patrol('movement')
    s.terrain = [ruin, { id: 'c', name: 'Контейнер', kind: 'container', obscuring: true, poly: rect(8, 24, 3, 1.5) }]
    place(s, 'red', [{ x: 12, y: 15 }])
    const v = validate(s, { type: 'move', unitId: 'red', mode: 'normal', positions: { 'red-0': { x: 20, y: 15 } } })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toContain('плотный тиррейн')
    expect(validate(s, { type: 'move', unitId: 'red', mode: 'normal', positions: { 'red-0': { x: 12, y: 21 } } }).ok).toBe(true)
    place(s, 'lt', [{ x: 13, y: 13 }])
    expect(validate(s, { type: 'move', unitId: 'lt', mode: 'normal', positions: { 'lt-0': { x: 18.9, y: 13 } } }).ok).toBe(true)
    place(s, 'lt', [{ x: 9.5, y: 28 }])
    const c = validate(s, { type: 'move', unitId: 'lt', mode: 'normal', positions: { 'lt-0': { x: 9.5, y: 24.8 } } })
    expect(c.ok).toBe(false)
    if (!c.ok) expect(c.reason).toContain('Контейнер')
  })
  it('vehicles get no cover just for standing in terrain; infantry do', () => {
    const s = patrol()
    s.terrain = [{ id: 'k', name: 'Воронка', kind: 'crater', obscuring: false, poly: rect(28, 12, 6, 6) }]
    place(s, 'dread', [{ x: 31, y: 15 }])
    place(s, 'int', column(15, 13, 5))
    expect(shootPlan(s, getUnit(s, 'int'), getUnit(s, 'dread')).cover).toBe(false)
    place(s, 'boyz', [{ x: 30, y: 13 }, { x: 31.5, y: 13 }, { x: 30, y: 15 }])
    place(s, 'dread', [{ x: 40, y: 2 }])
    expect(shootPlan(s, getUnit(s, 'int'), getUnit(s, 'boyz')).cover).toBe(true)
  })
  it('Deadly Demise: a destroyed vehicle explodes on a 6 and hits every unit within 6″', () => {
    let s = patrol('shooting')
    place(s, 'dread', [{ x: 20, y: 15 }])
    getUnit(s, 'dread').models[0].wounds = 1
    place(s, 'boyz', [{ x: 23, y: 15 }])
    place(s, 'int', [{ x: 5, y: 15 }]) // one sergeant, >12″ away: one bolt-rifle shot
    // hit 6, wound 6, save 1 (fails), then Deadly Demise D6 = 6
    s = apply(s, { type: 'shoot', unitId: 'int', targetId: 'dread' }, scriptedRoller([6, 6, 1, 6]))
    expect(alive(getUnit(s, 'dread'))).toHaveLength(0)
    expect(s.diceLog.some((d) => d.title.startsWith('Deadly Demise') && d.summary.includes('Бойз I'))).toBe(true)
    expect(alive(getUnit(s, 'boyz'))).toHaveLength(0)
  })
})

describe('combat patrol scenario', () => {
  it.each([7, 8])('AI vs AI plays a full legal game (seed %i) and it lasts longer than the intro', (seed) => {
    let s = startGame(scenarioById('combat-patrol').build(), seededRoller(seed))
    const r = seededRoller(seed * 13)
    let actions = 0
    while (!s.winner && actions < 4000) {
      const d = decide(s, 'standard')!
      const v = validate(s, d.cmd)
      if (!v.ok) throw new Error(`illegal AI command ${JSON.stringify(d.cmd)}: ${v.reason}`)
      s = apply(s, d.cmd, r)
      actions++
    }
    expect(s.winner).not.toBeNull()
    expect(s.round).toBeGreaterThanOrEqual(3)
  }, 60000)
})
