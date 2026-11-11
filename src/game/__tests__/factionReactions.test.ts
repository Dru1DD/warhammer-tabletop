import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { scriptedRoller, seededRoller } from '../dice/dice'
import { actor, apply, meleePlan, shootPlan, validate } from '../engine'
import { alive } from '../gameState'
import { reactionAdvice } from '../reactionAdvice'
import type { Command, GameState, StratagemId } from '../types'
import { battle, column, place, unit } from './helpers'

/** The Orks' Deff Dread has charged the Redemptor; the Fight phase starts with the Dread fighting first. */
function dreadFight() {
  const s = battle('marines', 'orks', 'charge', 'orks')
  for (const u of s.units) if (!['red', 'dread'].includes(u.id)) place(s, u.id, [])
  s.players.marines.cp = 2
  s.players.orks.cp = 0
  place(s, 'red', [{ x: 10, y: 10 }])
  place(s, 'dread', [{ x: 14.2, y: 10 }])
  unit(s, 'dread').charged = true
  return apply(s, { type: 'endPhase' }, scriptedRoller([]))
}
const swing: Command = { type: 'fight', unitId: 'dread', targetId: 'red' }
const buff = (s: GameState, id: string, b: StratagemId) => { (unit(s, id).phaseBuffs ??= []).push(b) }

describe('the onTargeted window', () => {
  it('opens for the target before any dice; the attack waits and only that unit can be the reaction', () => {
    const s0 = dreadFight()
    const s = apply(s0, swing, scriptedRoller([]))
    expect(s.reaction).toMatchObject({ player: 'marines', window: 'onTargeted', unitId: 'red', attack: swing })
    expect(actor(s)).toBe('marines')
    expect(unit(s, 'dread').fought).toBeFalsy()
    expect(s.diceLog.length).toBe(s0.diceLog.length)
    expect(validate(s, { type: 'stratagem', id: 'armourOfContempt', unitId: 'red' }).ok).toBe(true)
    expect(validate(s, { type: 'stratagem', id: 'armourOfContempt', unitId: 'lt' }).ok).toBe(false)
    expect(validate(s, { type: 'endPhase' }).ok).toBe(false)
    // outside the window the Stratagem cannot be used
    expect(validate(s0, { type: 'stratagem', id: 'armourOfContempt', unitId: 'red' }).ok).toBe(false)
  })

  it('no window without CP: the attack is resolved at once', () => {
    const s0 = dreadFight()
    s0.players.marines.cp = 0
    const s = apply(s0, swing, seededRoller(3))
    expect(s.reaction).toBeFalsy()
    expect(unit(s, 'dread').fought).toBe(true)
  })

  it('Armour of Contempt: 1 CP, the attack goes on with AP worse by 1, and the effect ends with that attack', () => {
    const s = apply(dreadFight(), swing, scriptedRoller([]))
    const after = apply(s, { type: 'stratagem', id: 'armourOfContempt', unitId: 'red' }, seededRoller(5))
    expect(after.reaction).toBeFalsy()
    expect(after.players.marines.cp).toBe(1)
    expect(unit(after, 'dread').fought).toBe(true)
    expect(after.diceLog.some((d) => d.title.includes('Дэфф-дред') && d.title.includes('Доспех презрения'))).toBe(true)
    expect(unit(after, 'red').phaseBuffs ?? []).not.toContain('armourOfContempt')
  })

  it('passing resolves the waiting attack as before', () => {
    const s = apply(dreadFight(), swing, scriptedRoller([]))
    let after = apply(s, { type: 'passReaction' }, seededRoller(5))
    // the Marines may still be asked about a Command Re-roll of a save: keep the dice
    while (after.pendingReroll) after = apply(after, { type: 'rerollChoice', reroll: false }, seededRoller(5))
    expect(after.players.marines.cp).toBe(2)
    expect(unit(after, 'dread').fought).toBe(true)
    expect(after.diceLog.some((d) => d.title.includes('Доспех презрения'))).toBe(false)
  })
})

describe('defensive effects on the attack', () => {
  it('Armour of Contempt worsens AP by 1, never above 0', () => {
    const s = dreadFight()
    const klaw = (st: GameState) => meleePlan(st, unit(st, 'dread'), unit(st, 'red'))[0].profile.ap
    const before = klaw(s)
    buff(s, 'red', 'armourOfContempt')
    expect(klaw(s)).toBe(Math.min(0, before + 1))
  })

  it('Lightning-Fast Reactions: −1 to hit', () => {
    const s = battle('marines', 'aeldari', 'shooting', 'marines')
    for (const u of s.units) if (!['int', 'guardians'].includes(u.id)) place(s, u.id, [])
    place(s, 'int', column(10, 10, 5))
    place(s, 'guardians', column(22, 10, 10, 1.2))
    const mod = () => shootPlan(s, unit(s, 'int'), unit(s, 'guardians')).groups[0].ctx.hitMod
    const m0 = mod()
    buff(s, 'guardians', 'lightningFastReactions')
    expect(mod()).toBe(m0 - 1)
  })

  it('Bulwark Imperative: 4+ invulnerable save against shooting; Baleful Halo: −1 to wound in melee', () => {
    const s = battle('marines', 'adeptus_mechanicus', 'shooting', 'marines')
    for (const u of s.units) if (!['int', 'rangers', 'aint', 'vanguard'].includes(u.id)) place(s, u.id, [])
    place(s, 'int', column(10, 10, 5))
    place(s, 'rangers', column(22, 10, 10, 1.2))
    buff(s, 'rangers', 'bulwarkImperative')
    expect(shootPlan(s, unit(s, 'int'), unit(s, 'rangers')).groups[0].ctx.invulnOverride).toBe(4)
    place(s, 'vanguard', column(30, 10, 5, 1.2))
    place(s, 'aint', column(31.1, 10, 5, 1.2))
    buff(s, 'vanguard', 'balefulHalo')
    expect(meleePlan(s, unit(s, 'aint'), unit(s, 'vanguard'))[0].ctx.woundMod).toBe(-1)
  })

  it('Rapid Regeneration: Feel No Pain 6+, 5+ within Synapse Range', () => {
    const s = battle('marines', 'tyranids', 'shooting', 'marines')
    for (const u of s.units) if (!['int', 'termagants', 'tyrant'].includes(u.id)) place(s, u.id, [])
    place(s, 'int', column(10, 10, 5))
    place(s, 'termagants', column(22, 10, 10, 1.2))
    place(s, 'tyrant', [{ x: 40, y: 40 }])
    buff(s, 'termagants', 'rapidRegeneration')
    const fnp = () => shootPlan(s, unit(s, 'int'), unit(s, 'termagants')).groups[0].ctx.fnp
    expect(fnp()).toBe(6)
    place(s, 'tyrant', [{ x: 26, y: 14 }])
    expect(fnp()).toBe(5)
  })
})

describe('the fallen strike back (Death Frenzy, A Worthy Death, Orks Is Never Beaten)', () => {
  function gauntFight() {
    const s = battle('marines', 'tyranids', 'charge', 'marines')
    for (const u of s.units) if (!['aint', 'hormagaunts'].includes(u.id)) place(s, u.id, [])
    s.players.marines.cp = 0
    s.players.tyranids.cp = 2
    place(s, 'hormagaunts', column(20, 10, 10, 1.3))
    place(s, 'aint', column(21.15, 10, 5, 1.3))
    unit(s, 'aint').charged = true
    return apply(s, { type: 'endPhase' }, scriptedRoller([]))
  }
  const strike: Command = { type: 'fight', unitId: 'aint', targetId: 'hormagaunts' }

  it('each destroyed model rolls a D6 and on 4+ fights the attacker before it is removed', () => {
    const s = apply(gauntFight(), strike, scriptedRoller([]))
    expect(s.reaction).toMatchObject({ window: 'onTargeted', player: 'tyranids', unitId: 'hormagaunts' })
    const after = apply(s, { type: 'stratagem', id: 'deathFrenzy', unitId: 'hormagaunts' }, seededRoller(7))
    const fallen = unit(after, 'hormagaunts').models.filter((m) => m.destroyed).length
    expect(fallen).toBeGreaterThan(0)
    const frenzy = after.diceLog.find((d) => d.title === 'Предсмертное неистовство: Гормагауны')!
    expect(frenzy.steps[0].dice).toHaveLength(fallen)
    const saved = frenzy.steps[0].dice.filter((d) => d.success).length
    expect(after.diceLog.some((d) => d.title.startsWith('Предсмертное неистовство: Гормагауны → Штурмовые интерсессоры'))).toBe(saved > 0)
  })

  it('not for a unit that has already fought this phase', () => {
    const s = apply(gauntFight(), strike, scriptedRoller([]))
    unit(s, 'hormagaunts').fought = true
    expect(validate(s, { type: 'stratagem', id: 'deathFrenzy', unitId: 'hormagaunts' }).ok).toBe(false)
  })
})

describe('Protocol of the Undying Legions', () => {
  function volley(seed: number) {
    const s = battle('marines', 'necrons', 'shooting', 'marines')
    for (const u of s.units) if (!['int', 'nwar'].includes(u.id)) place(s, u.id, [])
    s.players.marines.cp = 0
    s.players.necrons.cp = 1
    place(s, 'int', column(10, 10, 5))
    place(s, 'nwar', column(22, 8, 10, 1.2))
    return apply(s, { type: 'shoot', unitId: 'int', targetId: 'nwar' }, seededRoller(seed))
  }

  it('after the attacks that destroyed Necron Warriors: heal D3 at once, bringing models back', () => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((x) => volley(x).reaction?.window === 'afterAttacks')!
    expect(seed).toBeDefined()
    const s = volley(seed)
    expect(s.reaction).toMatchObject({ player: 'necrons', window: 'afterAttacks', unitId: 'nwar' })
    const before = alive(unit(s, 'nwar')).length
    const after = apply(s, { type: 'stratagem', id: 'undyingLegions', unitId: 'nwar' }, scriptedRoller([6]))
    expect(after.reaction).toBeFalsy()
    expect(after.players.necrons.cp).toBe(0)
    expect(alive(unit(after, 'nwar')).length).toBeGreaterThan(before)
    expect(after.log.some((l) => l.text.includes('Протокол бессмертных легионов'))).toBe(true)
    expect(after.phase).toBe('shooting')
  })
})

describe('advice and the AI', () => {
  it('a defensive reaction against an attack it barely changes is not worth the CP', () => {
    // Boyz' sluggas and choppas have AP 0: Armour of Contempt changes nothing
    const s = battle('marines', 'orks', 'shooting', 'orks')
    for (const u of s.units) if (!['int', 'boyz'].includes(u.id)) place(s, u.id, [])
    s.players.marines.cp = 2
    place(s, 'int', column(10, 10, 5))
    place(s, 'boyz', column(20, 8, 10, 1.2))
    const w = apply(s, { type: 'shoot', unitId: 'boyz', targetId: 'int' }, scriptedRoller([]))
    expect(w.reaction?.window).toBe('onTargeted')
    const aoc = reactionAdvice(w).find((o) => o.cmd.id === 'armourOfContempt')!
    expect(aoc.worth).toBe(false)
    expect(decide(w, 'standard')!.cmd).toEqual({ type: 'passReaction' })
  })

  it('the Deff Dread klaws (AP −2) against a 2+ save: Armour of Contempt saves too little to pay for itself', () => {
    const s = apply(dreadFight(), swing, scriptedRoller([]))
    expect(reactionAdvice(s).find((o) => o.cmd.id === 'armourOfContempt')!.worth).toBe(false)
  })

  it('Skorpekh Destroyers (AP −2, nine attacks) against Intercessors: the standard AI uses Armour of Contempt; the beginner passes', () => {
    const s0 = battle('marines', 'necrons', 'charge', 'necrons')
    for (const u of s0.units) if (!['int', 'skorp'].includes(u.id)) place(s0, u.id, [])
    s0.players.marines.cp = 2
    s0.players.necrons.cp = 0
    place(s0, 'int', column(10, 10, 5, 1.3))
    place(s0, 'skorp', column(11.6, 10, 3, 1.3))
    unit(s0, 'skorp').charged = true
    const f = apply(s0, { type: 'endPhase' }, scriptedRoller([]))
    const s = apply(f, { type: 'fight', unitId: 'skorp', targetId: 'int' }, scriptedRoller([]))
    expect(s.reaction?.window).toBe('onTargeted')
    const aoc = reactionAdvice(s).find((o) => o.cmd.id === 'armourOfContempt')!
    expect(aoc.worth).toBe(true)
    expect(decide(s, 'standard')!.cmd).toMatchObject({ type: 'stratagem', id: 'armourOfContempt', unitId: 'int' })
    expect(decide(s, 'beginner')!.cmd).toEqual({ type: 'passReaction' })
  })
})
