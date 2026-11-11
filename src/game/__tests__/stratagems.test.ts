import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { scriptedRoller } from '../dice/dice'
import { apply, validate } from '../engine'
import { alive } from '../gameState'
import type { Command, GameState } from '../types'
import { battle, column, place, unit } from './helpers'

const woundsOf = (s: GameState, id: string) => alive(unit(s, id)).reduce((a, m) => a + m.wounds, 0)

/** Marines (west) against Orks (east) on an open board; everything but the named units is removed. */
function table(phase: GameState['phase'], active: 'marines' | 'orks', keep: string[]) {
  const s = battle('marines', 'orks', phase, active)
  for (const u of s.units) if (!keep.includes(u.id)) place(s, u.id, [])
  s.players.marines.cp = 2
  s.players.orks.cp = 2
  return s
}

describe('Explosives', () => {
  const setup = () => {
    const s = table('shooting', 'marines', ['int', 'boyz'])
    place(s, 'int', column(10, 10, 5))
    place(s, 'boyz', column(17, 10, 10, 1.1)) // about 5.5″ edge to edge
    return s
  }
  const cmd: Command = { type: 'stratagem', id: 'explosives', unitId: 'int', targetId: 'boyz' }

  it('6D6, every 4+ is a mortal wound; costs 1 CP and counts as the unit shooting', () => {
    const s = setup()
    expect(validate(s, cmd).ok).toBe(true)
    const before = woundsOf(s, 'boyz')
    const after = apply(s, cmd, scriptedRoller([4, 4, 4, 1, 2, 6]))
    expect(before - woundsOf(after, 'boyz')).toBe(4)
    expect(after.players.marines.cp).toBe(1)
    expect(unit(after, 'int').shot).toBe(true)
    // once per phase
    expect(validate(after, { ...cmd, unitId: 'int' }).ok).toBe(false)
  })

  it('needs the EXPLOSIVES keyword, 8″, a CP and a unit that is not battle-shocked', () => {
    const far = setup()
    place(far, 'boyz', column(30, 10, 10, 1.1))
    expect(validate(far, cmd).ok).toBe(false)
    const broke = setup()
    broke.players.marines.cp = 0
    const v = validate(broke, cmd)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toContain('CP')
    const shocked = setup()
    unit(shocked, 'int').battleShocked = true
    expect(validate(shocked, cmd).ok).toBe(false)
  })
})

describe('Command Re-roll of a charge', () => {
  const setup = () => {
    const s = table('charge', 'orks', ['int', 'boyz', 'boyz2'])
    place(s, 'int', column(10, 10, 5))
    place(s, 'boyz', column(18, 10, 10, 1.1)) // about 6.7″ away: a 7″ charge, 58% on 2D6
    place(s, 'boyz2', column(18, 22, 10, 1.1))
    return s
  }

  it('re-rolls a failed charge in full, once, right after it was made', () => {
    let s = setup()
    s = apply(s, { type: 'declareCharge', unitId: 'boyz' }, scriptedRoller([1, 2]))
    expect(s.pendingCharge).toBeNull()
    const reroll: Command = { type: 'stratagem', id: 'commandReroll', unitId: 'boyz' }
    expect(validate(s, reroll).ok).toBe(true)
    s = apply(s, reroll, scriptedRoller([6, 6]))
    expect(s.pendingCharge?.unitId).toBe('boyz')
    expect(s.pendingCharge?.roll).toBe(12)
    expect(s.players.orks.cp).toBe(1)
    // the same roll cannot be re-rolled again
    expect(validate(s, reroll).ok).toBe(false)
  })

  it('only right after the roll: any other command closes the window', () => {
    let s = setup()
    s = apply(s, { type: 'declareCharge', unitId: 'boyz' }, scriptedRoller([1, 2]))
    s = apply(s, { type: 'declareCharge', unitId: 'boyz2' }, scriptedRoller([1, 1]))
    expect(validate(s, { type: 'stratagem', id: 'commandReroll', unitId: 'boyz' }).ok).toBe(false)
    expect(validate(s, { type: 'stratagem', id: 'commandReroll', unitId: 'boyz2' }).ok).toBe(true)
  })

  it('the AI re-rolls a failed charge it can still make', () => {
    let s = setup()
    s = apply(s, { type: 'declareCharge', unitId: 'boyz' }, scriptedRoller([1, 2]))
    const d = decide(s, 'standard')!
    expect(d.cmd).toEqual({ type: 'stratagem', id: 'commandReroll', unitId: 'boyz' })
  })
})

describe('Insane Bravery', () => {
  const setup = () => {
    const s = table('command', 'marines', ['int', 'boyz'])
    s.round = 2
    place(s, 'int', column(10, 10, 5))
    place(s, 'boyz', column(40, 10, 10, 1.1))
    s.objectives = [{ id: 'o1', pos: { x: 11, y: 13 }, controller: null }]
    Object.assign(unit(s, 'int'), { battleShocked: true, shockedThisPhase: true })
    return s
  }
  const cmd: Command = { type: 'stratagem', id: 'insaneBravery', unitId: 'int' }

  it('turns the failed test into a pass, and the objective the unit holds is scored', () => {
    const s = setup()
    expect(validate(s, cmd).ok).toBe(true)
    const after = apply(s, cmd, scriptedRoller([]))
    expect(unit(after, 'int').battleShocked).toBe(false)
    expect(after.objectives[0].controller).toBe('marines')
    expect(after.players.marines.vp).toBe(s.players.marines.vp + 5)
    expect(after.players.marines.braveryUsed).toBe(true)
  })

  it('once per battle, and only for a test failed in this Command phase', () => {
    const used = setup()
    used.players.marines.braveryUsed = true
    expect(validate(used, cmd).ok).toBe(false)
    const old = setup()
    unit(old, 'int').shockedThisPhase = false
    expect(validate(old, cmd).ok).toBe(false)
  })
})

describe('Crushing Impact', () => {
  const setup = () => {
    const s = table('charge', 'orks', ['int', 'dread'])
    place(s, 'int', column(10, 10, 5))
    place(s, 'dread', [{ x: 13.5, y: 12 }])
    unit(s, 'dread').charged = true
    return s
  }
  const cmd: Command = { type: 'stratagem', id: 'crushingImpact', unitId: 'dread', targetId: 'int' }

  it('D6 per point of Toughness: 5+ wounds the enemy, 1 wounds yourself', () => {
    const s = setup()
    expect(validate(s, cmd).ok).toBe(true)
    const enemy = woundsOf(s, 'int')
    const own = woundsOf(s, 'dread')
    // Deff Dread T9: nine dice
    const after = apply(s, cmd, scriptedRoller([5, 6, 1, 1, 2, 3, 4, 5, 6]))
    expect(enemy - woundsOf(after, 'int')).toBe(4)
    expect(own - woundsOf(after, 'dread')).toBe(2)
  })

  it('only for a monster or vehicle that charged, and the AI uses it', () => {
    const s = setup()
    unit(s, 'dread').charged = false
    expect(validate(s, cmd).ok).toBe(false)
    expect(decide(setup(), 'standard')!.cmd).toEqual(cmd)
  })
})

it('Stratagems used in a phase are forgotten when the next phase starts', () => {
  let s = table('shooting', 'marines', ['int', 'boyz'])
  place(s, 'int', column(10, 10, 5))
  place(s, 'boyz', column(17, 10, 10, 1.1))
  s = apply(s, { type: 'stratagem', id: 'explosives', unitId: 'int', targetId: 'boyz' }, scriptedRoller([1, 1, 1, 1, 1, 1]))
  expect(s.players.marines.stratagemsThisPhase).toEqual(['explosives'])
  s = apply(s, { type: 'endPhase' }, scriptedRoller([]))
  expect(s.players.marines.stratagemsThisPhase).toEqual([])
  expect(s.players.marines.stratagemUnitsThisPhase).toEqual([])
})
