import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { resolveGroup, type AttackContext, type RerollPoint } from '../combat/attack'
import { scriptedRoller } from '../dice/dice'
import { actor, apply, validate } from '../engine'
import { alive } from '../gameState'
import type { Command, GameState, WeaponProfile } from '../types'
import { battle, place, unit } from './helpers'

const woundsOf = (s: GameState, id: string) => alive(unit(s, id)).reduce((a, m) => a + m.wounds, 0)

/** The Orks' Deff Dread has charged the Redemptor; the Fight phase starts with the Dread fighting first. */
function fight() {
  const s = battle('marines', 'orks', 'charge', 'orks')
  for (const u of s.units) if (!['red', 'dread'].includes(u.id)) place(s, u.id, [])
  s.players.marines.cp = 2
  s.players.orks.cp = 2
  place(s, 'red', [{ x: 10, y: 10 }])
  place(s, 'dread', [{ x: 14.2, y: 10 }])
  unit(s, 'dread').charged = true
  return apply(s, { type: 'endPhase' }, scriptedRoller([]))
}
const swing: Command = { type: 'fight', unitId: 'dread', targetId: 'red' }
// 5 Dread Klaws attacks: all hit (3+), all wound (6s), then the first save is a 2 (needs 4+)
const UNTIL_FIRST_SAVE = [3, 3, 3, 3, 3, 6, 6, 6, 6, 6, 2]

describe('Command Re-roll in the middle of an attack', () => {
  it('a failed save that matters stops the attack: the defender decides, nothing is applied yet', () => {
    const s0 = fight()
    expect(s0.phase).toBe('fight')
    const s = apply(s0, swing, scriptedRoller(UNTIL_FIRST_SAVE))
    expect(s.pendingReroll).toMatchObject({ player: 'marines', unitId: 'red', kind: 'save', value: 2 })
    expect(s.pendingReroll!.gain).toBeGreaterThanOrEqual(1.5)
    expect(actor(s)).toBe('marines')
    expect(woundsOf(s, 'red')).toBe(woundsOf(s0, 'red'))
    expect(unit(s, 'dread').fought).toBeFalsy()
    // only the answer is accepted
    expect(validate(s, { type: 'endPhase' }).ok).toBe(false)
    expect(validate(s, { type: 'rerollChoice', reroll: true }).ok).toBe(true)
    expect(validate(s0, { type: 'rerollChoice', reroll: true }).ok).toBe(false)
  })

  it('re-rolling: 1 CP, the new die counts, and the rest of the attack goes on (no second re-roll this phase)', () => {
    const s = apply(fight(), swing, scriptedRoller(UNTIL_FIRST_SAVE))
    // the re-roll is a 5 (saved); of the other four saves one more fails, and is not offered again
    const after = apply(s, { type: 'rerollChoice', reroll: true }, scriptedRoller([5, 2, 5, 5, 5]))
    expect(after.pendingReroll).toBeNull()
    expect(after.players.marines.cp).toBe(1)
    expect(unit(after, 'dread').fought).toBe(true)
    const saves = after.diceLog.find((d) => d.title.includes('Дэфф-дред'))!.steps.find((x) => x.label === 'Спасбросок')!
    expect(saves.dice[0]).toMatchObject({ value: 5, success: true, rerolledFrom: 2 })
    expect(saves.dice.filter((d) => !d.success)).toHaveLength(1)
    expect(after.log.some((l) => l.text.includes('Командный переброс'))).toBe(true)
  })

  it('keeping the die: no CP spent, the failed save stands', () => {
    const s0 = fight()
    const s = apply(s0, swing, scriptedRoller(UNTIL_FIRST_SAVE))
    const kept = apply(s, { type: 'rerollChoice', reroll: false }, scriptedRoller([5, 5, 5, 5]))
    expect(kept.pendingReroll).toBeNull()
    expect(kept.players.marines.cp).toBe(2)
    expect(woundsOf(kept, 'red')).toBeLessThan(woundsOf(s0, 'red'))
  })

  it('no pause when the player has no CP', () => {
    const s0 = fight()
    s0.players.marines.cp = 0
    const s = apply(s0, swing, scriptedRoller([...UNTIL_FIRST_SAVE, 5, 5, 5, 5]))
    expect(s.pendingReroll).toBeFalsy()
    expect(unit(s, 'dread').fought).toBe(true)
  })

  it('the AI re-rolls (the game only stops when it is worth it); the beginner keeps its dice', () => {
    const s = apply(fight(), swing, scriptedRoller(UNTIL_FIRST_SAVE))
    expect(decide(s, 'standard')!.cmd).toEqual({ type: 'rerollChoice', reroll: true })
    expect(decide(s, 'beginner')!.cmd).toEqual({ type: 'rerollChoice', reroll: false })
  })
})

describe('re-roll points in the attack sequence', () => {
  const ctx: AttackContext = { hitMod: 0, hitModNotes: [], skillWorsen: 0, lethalHits: false }
  const profile = (p: Partial<WeaponProfile>): WeaponProfile => ({ name: '', range: 24, attacks: 1, skill: 3, s: 12, ap: -3, d: 1, keywords: {}, ...p }) as WeaponProfile
  const target = () => unit(battle('marines', 'orks'), 'dread')
  const run = (p: WeaponProfile, dice: number[], answer: (pt: RerollPoint) => boolean, c: AttackContext = ctx) => {
    const seen: RerollPoint[] = []
    const res = resolveGroup(scriptedRoller(dice), 'A', { weaponName: 'W', profile: p, models: 1, attacks: p.attacks, notes: [] }, target(), c, (pt) => { seen.push(pt); return answer(pt) })
    return { res, seen }
  }

  it('a missed shot of a big gun is offered with its value, and a re-roll replaces the die', () => {
    const { res, seen } = run(profile({ d: 6 }), [2, 4, 6, 1], (pt) => pt.kind === 'hit')
    expect(seen[0]).toMatchObject({ kind: 'hit', value: 2, side: 'attacker' })
    expect(seen[0].gain).toBeGreaterThan(1.5)
    expect(res.steps[0].dice[0]).toMatchObject({ value: 4, success: true, rerolledFrom: 2 })
  })

  it('a low damage roll is offered; a die already re-rolled by an ability is not', () => {
    const dmg = run(profile({ d: 0, randomD: 'D6' }), [4, 4, 1, 1, 6], (pt) => pt.kind === 'damage')
    const d = dmg.seen.find((x) => x.kind === 'damage')!
    expect(d.value).toBe(1)
    expect(dmg.res.steps.find((x) => x.label === 'Урон')!.dice[0]).toMatchObject({ value: 6, rerolledFrom: 1 })
    const twice = run(profile({}), [1, 2, 4, 1, 1], () => false, { ...ctx, rerollHits: 'all' })
    expect(twice.seen.filter((x) => x.kind === 'hit')).toHaveLength(0)
  })
})
