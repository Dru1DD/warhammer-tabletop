import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { composeUnit, type ArmyList } from '../army/armyList'
import { scenarioById } from '../scenarios/scenarios'
import { seededRoller } from '../dice/dice'
import { apply, shootPlan, startGame, validate } from '../engine'
import { alive, enemiesOf, newUnit, unitDistance } from '../gameState'
import { aiEmbark, carryProblem, disembarkSpot, embark, passengersOf } from '../rules/transports'
import type { GameState, Vec } from '../types'
import { battle, column, place } from './helpers'

/** Mechanicus vs Orks, everything off the board but the Boyz far away, the Rangers and a Skorpius Dunerider. */
function setup(phase: GameState['phase'] = 'movement') {
  const s = battle('adeptus_mechanicus', 'orks', phase, 'adeptus_mechanicus')
  const boyz = s.units.find((u) => u.owner === 'orks' && u.datasheetId === 'boyz')!
  const rangers = s.units.find((u) => u.datasheetId === 'rangers')!
  for (const u of s.units) if (u !== boyz && u !== rangers) place(s, u.id, [])
  place(s, boyz.id, column(40, 4, 10, 1.2))
  place(s, rangers.id, [...column(9, 12.5, 5, 1.1), ...column(10.1, 12.5, 5, 1.1)])
  const t = newUnit('sd', 'dunerider', 'adeptus_mechanicus', 'Dunerider', composeUnit('dunerider', 1).map((p) => [p, { x: 13, y: 15 } as Vec]))
  s.units.push(t)
  return { s, boyz, rangers, t }
}
const unit = (s: GameState, id: string) => [...s.units, ...(s.embarked ?? [])].find((u) => u.id === id)!

describe('transport capacity', () => {
  it('the Dunerider takes Mechanicus infantry, not Kataphrons, and 12 models at most', () => {
    const { s, rangers, t } = setup()
    expect(carryProblem(s, rangers, t)).toBeNull()
    const breachers = s.units.find((u) => u.datasheetId === 'breachers') ?? newUnit('br', 'breachers', 'adeptus_mechanicus', 'Breachers', composeUnit('breachers', 3).map((p) => [p, { x: 1, y: 1 } as Vec]))
    expect(carryProblem(s, breachers, t)).toBeTruthy()
    embark(s, rangers.id, t.id, true)
    const vanguard = newUnit('vg', 'vanguard', 'adeptus_mechanicus', 'Vanguard', composeUnit('vanguard', 10).map((p) => [p, { x: 1, y: 1 } as Vec]))
    expect(carryProblem(s, vanguard, t)).toBeTruthy()
  })
})

describe('embarking and disembarking', () => {
  it('a unit embarks after its move, every model within 3″; then it is off the board', () => {
    const r = seededRoller(1)
    let s = setup().s
    const cmd = { type: 'embark' as const, unitId: 'rng-1', transportId: 'sd' }
    const rangers = s.units.find((u) => u.datasheetId === 'rangers')!
    cmd.unitId = rangers.id
    expect(validate(s, cmd).ok).toBe(false) // has not moved yet
    rangers.move = 'normal'
    expect(validate(s, cmd)).toEqual({ ok: true })
    s = apply(s, cmd, r)
    expect(passengersOf(s, 'sd').map((u) => u.id)).toEqual([rangers.id])
    expect(s.units.some((u) => u.id === rangers.id)).toBe(false)
    expect(enemiesOf(s, s.units.find((u) => u.owner === 'orks')!).some((u) => u.id === rangers.id)).toBe(false)
  })

  it('Tactical disembark (the transport has not moved): the unit can still move; not in the phase it embarked', () => {
    const r = seededRoller(2)
    const { s, rangers, t } = setup()
    embark(s, rangers.id, t.id, true)
    const inside = unit(s, rangers.id)
    expect(disembarkSpot(s, inside, { x: 20, y: 15 })).toBeNull() // embarked this phase
    delete inside.embarkedThisPhase
    const pos = disembarkSpot(s, inside, { x: 20, y: 15 })!
    expect(pos).toBeTruthy()
    const after = apply(s, { type: 'disembark', unitId: rangers.id, positions: pos }, r)
    const out = unit(after, rangers.id)
    expect(out.move).toBe('none')
    expect(unitDistance(out, t)).toBeLessThanOrEqual(3)
    expect(validate(after, { type: 'embark', unitId: rangers.id, transportId: t.id }).ok).toBe(false) // set up this turn
  })

  it('Rapid disembark (the transport moved): no further move and no charge this turn', () => {
    const r = seededRoller(3)
    const { s, rangers, t } = setup()
    embark(s, rangers.id, t.id, true)
    delete unit(s, rangers.id).embarkedThisPhase
    t.move = 'normal'
    const pos = disembarkSpot(s, unit(s, rangers.id), { x: 20, y: 15 })!
    let after = apply(s, { type: 'disembark', unitId: rangers.id, positions: pos }, r)
    expect(unit(after, rangers.id).move).toBe('normal')
    after = { ...after, phase: 'charge' }
    expect(validate(after, { type: 'declareCharge', unitId: rangers.id }).ok).toBe(false)
  })

  it('not wholly within 3″ of the transport, and not after it Advanced', () => {
    const { s, rangers, t } = setup()
    embark(s, rangers.id, t.id, true)
    const inside = unit(s, rangers.id)
    delete inside.embarkedThisPhase
    const far = Object.fromEntries(alive(inside).map((m, i) => [m.id, { x: 25, y: 5 + i * 1.1 }]))
    expect(validate(s, { type: 'disembark', unitId: rangers.id, positions: far }).ok).toBe(false)
    t.move = 'advance'
    expect(disembarkSpot(s, inside, { x: 20, y: 15 })).toBeNull()
  })
})

describe('a destroyed transport', () => {
  it('its passengers make an Emergency Disembark: within 6″, battle-shocked, no charge', () => {
    const r = seededRoller(4)
    const { s, rangers, t } = setup('shooting')
    embark(s, rangers.id, t.id, true)
    for (const m of t.models) m.destroyed = true
    const after = apply(s, { type: 'endPhase' }, r)
    const out = unit(after, rangers.id)
    expect(after.embarked ?? []).toHaveLength(0)
    expect(after.units.some((u) => u.id === rangers.id)).toBe(true)
    expect(out.battleShocked).toBe(true)
    expect(out.noChargeThisTurn).toBe(true)
    for (const m of alive(out)) expect(Math.hypot(m.pos.x - 13, m.pos.y - 15)).toBeLessThanOrEqual(2.07 + 6 + 0.01)
    expect(after.diceLog.some((d) => d.title.includes(out.name))).toBe(true)
  })

  it('an army whose units are all inside a transport is not wiped out', () => {
    const r = seededRoller(5)
    const { s, rangers, t } = setup('shooting')
    embark(s, rangers.id, t.id, true)
    const after = apply(s, { type: 'endPhase' }, r)
    expect(after.winner).toBeFalsy()
  })
})

describe('the battle', () => {
  it('an empty Dedicated Transport is removed before the battle; a filled one stays', () => {
    const { s, rangers, t } = setup()
    const empty = startGame(structuredClone(s), seededRoller(6))
    expect(empty.units.some((u) => u.id === t.id)).toBe(false)
    embark(s, rangers.id, t.id, true)
    const filled = startGame(s, seededRoller(6))
    expect(filled.units.some((u) => u.id === t.id)).toBe(true)
  })

  it('Firing Deck 2: two passengers fire their weapons with the transport', () => {
    const { s, rangers, t, boyz } = setup('shooting')
    place(s, boyz.id, column(30, 10, 10, 1.2))
    const without = shootPlan(s, t, boyz).groups.map((g) => g.weaponName)
    embark(s, rangers.id, t.id, true)
    const withDeck = shootPlan(s, t, boyz).groups
    expect(withDeck.length).toBeGreaterThan(without.length)
    expect(withDeck.reduce((a, g) => a + g.models, 0)).toBe(1 + 2)
  })

  it('the AI fills its Dedicated Transport before the battle', () => {
    const { s, t } = setup()
    aiEmbark(s, 'adeptus_mechanicus')
    expect(passengersOf(s, t.id)).toHaveLength(1)
  })
})


describe('the AI and transports', () => {
  it('gets its passengers out at the start of its Movement phase, then a whole battle plays out', { timeout: 300_000 }, () => {
    const r = seededRoller(8)
    const list: ArmyList = { limit: 1000, units: [
      { datasheetId: 'techDominus', size: 1 }, { datasheetId: 'rangers', size: 10 }, { datasheetId: 'rangers', size: 10 },
      { datasheetId: 'dunerider', size: 1 }, { datasheetId: 'kastelans', size: 2 },
    ] }
    const s0 = scenarioById('combat-patrol').build(['adeptus_mechanicus', 'orks'], { adeptus_mechanicus: list })
    aiEmbark(s0, 'adeptus_mechanicus')
    expect(s0.embarked ?? []).toHaveLength(1)
    let s = startGame(s0, r)
    let out = 0
    for (let i = 0; i < 5000 && !s.winner; i++) {
      const d = decide(s, 'standard')!
      if (d.cmd.type === 'disembark') out++
      s = apply(s, d.cmd, r)
    }
    expect(out).toBe(1)
    expect(s.winner).toBeTruthy()
  })
})
