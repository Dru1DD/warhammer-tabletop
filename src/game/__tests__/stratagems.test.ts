import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { scriptedRoller } from '../dice/dice'
import { apply, maxMove, meleeSetup, meleeWeaponsOf, shootPlan, validate } from '../engine'
import { rect } from '../geometry/geometry'
import { stratagemAvailability } from '../rules/stratagems'
import { reactionAdvice } from '../reactionAdvice'
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
  /** The Orks end their turn; the Marines' Command phase starts with the battle-shocked Intercessors on an objective. */
  const setup = () => {
    const s = table('fight', 'orks', ['int', 'boyz'])
    s.fight = null
    place(s, 'int', column(10, 10, 5))
    place(s, 'boyz', column(40, 10, 10, 1.1))
    s.objectives = [{ id: 'o1', pos: { x: 11, y: 13 }, controller: null }]
    unit(s, 'int').battleShocked = true
    return s
  }
  const cmd: Command = { type: 'stratagem', id: 'insaneBravery', unitId: 'int' }

  it('is offered before the test: the test is passed without a roll, and the objective is scored', () => {
    const s = apply(setup(), { type: 'endPhase' }, scriptedRoller([]))
    expect(s.phase).toBe('command')
    expect(s.round).toBe(2)
    expect(s.reaction).toMatchObject({ player: 'marines', window: 'beforeShockTests' })
    expect(s.shockPending).toEqual(['int'])
    expect(validate(s, cmd).ok).toBe(true)
    const after = apply(s, cmd, scriptedRoller([])) // no dice: the test is not rolled
    expect(unit(after, 'int').battleShocked).toBe(false)
    expect(after.reaction).toBeNull()
    expect(after.shockPending).toBeNull()
    expect(after.objectives[0].controller).toBe('marines')
    expect(after.players.marines.vp).toBe(5)
    expect(after.players.marines.braveryUsed).toBe(true)
  })

  it('passing rolls the test; once per battle; not offered after the test', () => {
    const s = apply(setup(), { type: 'endPhase' }, scriptedRoller([]))
    const failed = apply(s, { type: 'passReaction' }, scriptedRoller([1, 1]))
    expect(unit(failed, 'int').battleShocked).toBe(true)
    expect(validate(failed, cmd).ok).toBe(false)
    const used = setup()
    used.players.marines.braveryUsed = true
    const rolled = apply(used, { type: 'endPhase' }, scriptedRoller([6, 6]))
    expect(rolled.reaction).toBeNull() // nothing to offer: the test is rolled at once
    expect(unit(rolled, 'int').battleShocked).toBe(false)
  })

  it('advice: worth it for a unit on an objective with a real chance to fail', () => {
    const s = apply(setup(), { type: 'endPhase' }, scriptedRoller([]))
    const o = reactionAdvice(s).find((x) => x.cmd.id === 'insaneBravery')!
    expect(o.worth).toBe(true) // Ld 6+: fails on 2D6 ≤ 5, 28%
    expect(decide(s, 'standard')!.cmd).toEqual(cmd)
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

// ---------------------------------------------------------------- army (detachment) Stratagems

describe('army Stratagems', () => {
  it('the army screen tells which Stratagems a list can use and why not', () => {
    const mech = stratagemAvailability('adeptus_mechanicus', ['techDominus', 'rangers', 'vanguard', 'kastelans'])
    const by = (id: string) => mech.find((a) => a.info.id === id)!
    expect(by('explosives').available).toBe(false)
    expect(by('explosives').why).toContain('EXPLOSIVES')
    expect(by('crushingImpact').available).toBe(true) // Kastelans are VEHICLE
    expect(by('lethalDosage').available).toBe(true)
    expect(by('aggressorImperative').available).toBe(true) // Skitarii
    expect(by('extinctionOrder').available).toBe(true) // Tech-Priest
    expect(stratagemAvailability('adeptus_mechanicus', ['rangers']).find((a) => a.info.id === 'extinctionOrder')!.available).toBe(false)
    // another army's Stratagems are not listed
    expect(mech.some((a) => a.info.faction && a.info.faction !== 'adeptus_mechanicus')).toBe(false)
  })

  it('a unit that does not fit the requirement cannot be targeted', () => {
    const s = table('movement', 'orks', ['boyz', 'dread'])
    expect(validate(s, { type: 'stratagem', id: 'fungusFuelInjection', unitId: 'boyz' }).ok).toBe(false)
    expect(validate(s, { type: 'stratagem', id: 'fungusFuelInjection', unitId: 'dread' }).ok).toBe(true)
    // and an army cannot use another army's Stratagem
    expect(validate(s, { type: 'stratagem', id: 'lethalDosage', unitId: 'boyz' }).ok).toBe(false)
  })

  it('Fungus-Fuel Injection: +2 inches of Move for this phase only', () => {
    let s = table('movement', 'orks', ['boyz', 'dread'])
    const m0 = maxMove(unit(s, 'dread'))
    s = apply(s, { type: 'stratagem', id: 'fungusFuelInjection', unitId: 'dread' }, scriptedRoller([]))
    expect(maxMove(unit(s, 'dread'))).toBe(m0 + 2)
    s = apply(s, { type: 'endPhase' }, scriptedRoller([]))
    expect(maxMove(unit(s, 'dread'))).toBe(m0)
  })

  it('Storm of Devastation: the target loses the benefit of cover', () => {
    const s = table('shooting', 'marines', ['int', 'boyz'])
    place(s, 'int', column(10, 10, 5))
    place(s, 'boyz', column(25, 10, 10, 1.1))
    s.terrain = [{ id: 'c', name: 'crater', kind: 'crater', obscuring: false, poly: rect(24, 8, 3, 14) }]
    const plain = shootPlan(s, unit(s, 'int'), unit(s, 'boyz'))
    expect(plain.cover).toBe(true)
    expect(plain.groups.every((g) => g.ctx.skillWorsen >= 1)).toBe(true)
    const after = apply(s, { type: 'stratagem', id: 'stormOfDevastation', unitId: 'int' }, scriptedRoller([]))
    const storm = shootPlan(after, unit(after, 'int'), unit(after, 'boyz'))
    expect(storm.groups.every((g) => g.ctx.skillWorsen < 1)).toBe(true)
  })

  it('Close-Range Dakka adds Rapid Fire 1 within half range; Lethal Dosage gives Lethal Hits', () => {
    const s = table('shooting', 'orks', ['int', 'boyz'])
    place(s, 'int', column(10, 10, 5))
    place(s, 'boyz', column(14, 10, 10, 1.1))
    const attacks = (x: GameState) => shootPlan(x, unit(x, 'boyz'), unit(x, 'int')).groups.reduce((a, g) => a + g.attacks, 0)
    const after = apply(s, { type: 'stratagem', id: 'closeRangeDakka', unitId: 'boyz' }, scriptedRoller([]))
    expect(attacks(after)).toBeGreaterThan(attacks(s))

    const m = battle('adeptus_mechanicus', 'orks', 'shooting', 'adeptus_mechanicus')
    for (const u of m.units) if (!['rangers', 'boyz'].includes(u.id)) place(m, u.id, [])
    m.players.adeptus_mechanicus.cp = 2
    place(m, 'rangers', column(10, 5, 10))
    place(m, 'boyz', column(20, 5, 10, 1.1))
    const dosed = apply(m, { type: 'stratagem', id: 'lethalDosage', unitId: 'rangers' }, scriptedRoller([]))
    expect(shootPlan(dosed, unit(dosed, 'rangers'), unit(dosed, 'boyz')).groups.every((g) => g.ctx.lethalHits)).toBe(true)
  })

  it('Aggressor Imperative: Advance without the roll, +6 inches', () => {
    const m = battle('adeptus_mechanicus', 'orks', 'movement', 'adeptus_mechanicus')
    m.players.adeptus_mechanicus.cp = 1
    const after = apply(m, { type: 'stratagem', id: 'aggressorImperative', unitId: 'rangers' }, scriptedRoller([]))
    expect(unit(after, 'rangers').advanceRoll).toBe(6)
    expect(after.players.adeptus_mechanicus.cp).toBe(0)
  })

  it('Extinction Order: each enemy unit on the objective takes a mortal wound on 4+ and tests battle-shock', () => {
    const m = battle('adeptus_mechanicus', 'orks', 'command', 'adeptus_mechanicus')
    for (const u of m.units) if (!['dominus', 'boyz'].includes(u.id)) place(m, u.id, [])
    m.players.adeptus_mechanicus.cp = 1
    place(m, 'dominus', [{ x: 10, y: 10 }])
    place(m, 'boyz', column(25, 8, 10, 1.1))
    m.objectives = [{ id: 'o1', pos: { x: 25, y: 12 }, controller: null }]
    const cmd: Command = { type: 'stratagem', id: 'extinctionOrder', unitId: 'dominus', targetId: 'o1' }
    expect(validate(m, cmd).ok).toBe(true)
    const before = woundsOf(m, 'boyz')
    const after = apply(m, cmd, scriptedRoller([5, 1, 1])) // 4+, then a failed 2D6 battle-shock test
    expect(before - woundsOf(after, 'boyz')).toBe(1)
    expect(unit(after, 'boyz').battleShocked).toBe(true)
  })

  it('Adrenal Surge makes 5+ a critical hit in melee', () => {
    const s = battle('tyranids', 'marines', 'fight', 'tyranids')
    const gaunts = s.units.find((u) => u.owner === 'tyranids' && alive(u).length > 1)!
    unit(s, gaunts.id).phaseBuffs = ['adrenalSurge']
    const target = s.units.find((u) => u.owner === 'marines')!
    const w = alive(unit(s, gaunts.id))[0]
    const p0 = meleeWeaponsOf(w)[0].profiles[0]
    expect(meleeSetup(s, unit(s, gaunts.id), target, p0).ctx.critHitOn).toBe(5)
  })

  it('the AI spends an army Stratagem on a good volley', () => {
    const s = table('shooting', 'marines', ['int', 'boyz'])
    place(s, 'int', column(10, 10, 5))
    place(s, 'boyz', column(20, 10, 10, 1.1))
    s.players.marines.cp = 3
    let x = s
    const used: string[] = []
    for (let i = 0; i < 4 && !x.winner; i++) {
      const d = decide(x, 'standard')!
      if (d.cmd.type === 'stratagem') used.push(d.cmd.id)
      if (d.cmd.type === 'endPhase') break
      x = apply(x, d.cmd, scriptedRoller(Array.from({ length: 200 }, () => 4)))
    }
    expect(used).toContain('stormOfDevastation')
  })
})
