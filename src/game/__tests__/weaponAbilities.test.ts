import { describe, expect, it } from 'vitest'
import { resolveGroup, type AttackContext, type AttackGroup } from '../combat/attack'
import { scriptedRoller } from '../dice/dice'
import { meleePlan, meleeSetup, meleeWeaponsOf, shootPlan } from '../engine'
import { alive } from '../gameState'
import { WEAPONS } from '../data/datasheets'
import type { UnitState, WeaponProfile } from '../types'
import { battle, moveUnitTo, unit } from './helpers'

// Weapon abilities added for the Tyranid / Necron / Aeldari datasheets, each against scripted dice.
// Dice order inside resolveGroup: [random attacks] hits, wounds (re-rolls inline), saves, random damage.

const profile = (p: Partial<WeaponProfile> = {}): WeaponProfile => ({ name: '', range: 12, attacks: 1, skill: 3, s: 4, ap: 0, d: 1, keywords: {}, ...p })
const grp = (p: Partial<WeaponProfile>, attacks = 1, extra: Partial<AttackGroup> = {}): AttackGroup => ({ weaponName: 'тест', profile: profile(p), models: 1, attacks, notes: [], ...extra })
const ctx: AttackContext = { hitMod: 0, hitModNotes: [], skillWorsen: 0, lethalHits: false }
const dice = (r: ReturnType<typeof resolveGroup>, label: string) => r.steps.find((s) => s.label === label)!.dice
const woundsLeft = (u: UnitState) => alive(u).reduce((a, m) => a + m.wounds, 0)

const target = () => unit(battle('marines', 'tyranids'), 'int') // Intercessors: T5, 3+, W2 x5

describe('Twin-linked', () => {
  it('re-rolls failed wound rolls (also natural 1s)', () => {
    const t = target()
    const r = resolveGroup(scriptedRoller([4, 4, 2, 5, 1, 6, 6, 6]), 'A', grp({ skill: 2, s: 5, keywords: { twinLinked: true } }, 2), t, ctx)
    expect(dice(r, 'Ранение')).toEqual([
      { value: 5, success: true, critical: false, rerolledFrom: 2 },
      { value: 6, success: true, critical: true, rerolledFrom: 1 },
    ])
  })
  it('without it the same rolls fail', () => {
    const r = resolveGroup(scriptedRoller([4, 4, 2, 1]), 'A', grp({ skill: 2, s: 5 }, 2), target(), ctx)
    expect(dice(r, 'Ранение').map((d) => d.success)).toEqual([false, false])
  })
})

describe('Devastating Wounds', () => {
  it('a critical wound deals D mortal wounds with no save', () => {
    const t = target()
    // hit 4, wound 6 (critical): 3 mortal wounds; NO save dice are consumed (the script would throw)
    const r = resolveGroup(scriptedRoller([4, 6]), 'A', grp({ skill: 2, s: 5, d: 3, keywords: { devastatingWounds: true } }), t, ctx)
    expect(r.damage).toBe(3)
    expect(woundsLeft(t)).toBe(10 - 3)
    expect(alive(t)).toHaveLength(4) // one model died, mortal wounds spill over to the next
  })
  it('a normal wound is saved normally', () => {
    const t = target()
    const r = resolveGroup(scriptedRoller([4, 4, 6]), 'A', grp({ skill: 2, s: 5, d: 3, keywords: { devastatingWounds: true } }), t, ctx)
    expect(r.damage).toBe(0)
  })
  it('rolls a random D characteristic for the mortal wounds', () => {
    const t = target()
    const r = resolveGroup(scriptedRoller([4, 6, 4]), 'A', grp({ skill: 2, s: 5, d: 0, randomD: 'D3', keywords: { devastatingWounds: true } }), t, ctx)
    expect(r.damage).toBe(2) // d6 4 -> D3 = 2
  })
})

describe('Sustained Hits', () => {
  it('a critical hit scores extra hits', () => {
    const r = resolveGroup(scriptedRoller([6, 5, 5, 6, 6]), 'A', grp({ skill: 3, s: 5, keywords: { sustainedHits: 1 } }), target(), ctx)
    expect(dice(r, 'Ранение')).toHaveLength(2)
  })
  it('combines with Lethal Hits: one auto-wound plus one extra rolled hit', () => {
    const r = resolveGroup(scriptedRoller([6, 5, 6, 6]), 'A', grp({ skill: 3, s: 5, keywords: { sustainedHits: 1 } }), target(), { ...ctx, lethalHits: true })
    expect(dice(r, 'Ранение')).toHaveLength(1)
    expect(dice(r, 'Спасбросок')).toHaveLength(2) // auto-wound + 1 rolled wound
  })
  it('a group-level value (Bladestorm) works without the weapon keyword', () => {
    const r = resolveGroup(scriptedRoller([6, 5, 5, 6, 6]), 'A', grp({ skill: 3, s: 5 }, 1, { sustainedHits: 1 }), target(), ctx)
    expect(dice(r, 'Ранение')).toHaveLength(2)
  })
})

describe('Anti-X', () => {
  it('an unmodified wound roll of Y+ against keyword X is a critical wound', () => {
    const t = target() // INFANTRY, T5; S2 would need a 6 normally
    const anti = grp({ skill: 2, s: 2, keywords: { anti: { keyword: 'INFANTRY', roll: 2 }, devastatingWounds: true } })
    const r = resolveGroup(scriptedRoller([4, 2]), 'A', anti, t, ctx)
    expect(dice(r, 'Ранение')[0]).toMatchObject({ value: 2, success: true, critical: true })
    expect(r.damage).toBe(1)
  })
  it('does nothing against other targets', () => {
    const red = unit(battle('marines', 'tyranids'), 'red') // VEHICLE
    const anti = grp({ skill: 2, s: 2, keywords: { anti: { keyword: 'INFANTRY', roll: 2 } } })
    const r = resolveGroup(scriptedRoller([4, 2]), 'A', anti, red, ctx)
    expect(dice(r, 'Ранение')[0].success).toBe(false)
  })
})

describe('Psychic', () => {
  const worse: AttackContext = { ...ctx, skillWorsen: 1, hitMod: -1, hitModNotes: ['тест'] }
  it('ignores cover and negative hit modifiers', () => {
    const r = resolveGroup(scriptedRoller([3, 6, 6]), 'A', grp({ skill: 3, s: 5, keywords: { psychic: true } }), target(), worse)
    expect(dice(r, 'Попадание')[0].success).toBe(true)
  })
  it('the same roll misses without Psychic', () => {
    const r = resolveGroup(scriptedRoller([3]), 'A', grp({ skill: 3, s: 5 }), target(), worse)
    expect(dice(r, 'Попадание')[0].success).toBe(false)
  })
})

describe('re-rolling hits', () => {
  it("'ones' re-rolls only natural 1s", () => {
    const r = resolveGroup(scriptedRoller([1, 5, 2, 6, 6]), 'A', grp({ skill: 4, s: 5 }, 2), target(), { ...ctx, rerollHits: 'ones' })
    expect(dice(r, 'Попадание')).toEqual([
      { value: 5, success: true, critical: false, rerolledFrom: 1 },
      { value: 2, success: false, critical: false },
    ])
  })
  it("'all' re-rolls every failed hit", () => {
    const r = resolveGroup(scriptedRoller([2, 5, 6, 6]), 'A', grp({ skill: 4, s: 5 }), target(), { ...ctx, rerollHits: 'all' })
    expect(dice(r, 'Попадание')[0]).toMatchObject({ value: 5, success: true, rerolledFrom: 2 })
  })
})

describe('Extra Attacks', () => {
  it('a Hive Tyrant swings its bonesword AND its scything talons', () => {
    const s = battle('marines', 'tyranids')
    const tyrant = unit(s, 'tyrant')
    expect(meleeWeaponsOf(tyrant.models[0]).map((w) => w.id)).toEqual(['boneswordLashWhip', 'scythingTalons'])
    moveUnitTo(s, 'int', { x: tyrant.models[0].pos.x - 2.3, y: tyrant.models[0].pos.y })
    const groups = meleePlan(s, tyrant, unit(s, 'int'))
    expect(groups.map((g) => g.weaponName)).toEqual([WEAPONS.boneswordLashWhip.name, WEAPONS.scythingTalons.name])
    expect(groups.map((g) => g.attacks)).toEqual([6, 4])
  })
  it('other models still use a single melee weapon', () => {
    const s = battle('marines', 'necrons')
    expect(meleeWeaponsOf(unit(s, 'overlord').models[0]).map((w) => w.id)).toEqual(['overlordsBlade'])
  })
})

describe('One Shot', () => {
  it('the Overlord fires the tachyon arrow once per battle', () => {
    const s = battle('necrons', 'marines', 'shooting', 'necrons')
    const o = unit(s, 'overlord')
    const t = unit(s, 'lt')
    moveUnitTo(s, 'lt', { x: o.models[0].pos.x + 30, y: o.models[0].pos.y })
    const first = shootPlan(s, o, t)
    expect(first.problem).toBeNull()
    expect(first.oneShots).toEqual([`${o.models[0].id}:tachyonArrow`])
    o.spent = first.oneShots
    expect(shootPlan(s, o, t).problem).not.toBeNull()
  })
})

describe('melee setup', () => {
  it('Whirling Onslaught re-rolls 1s, and every miss after a charge', () => {
    const s = battle('necrons', 'marines', 'fight', 'necrons')
    const sk = unit(s, 'skorp')
    const base = WEAPONS.hyperphaseWeapons.profiles[0]
    expect(meleeSetup(s, sk, unit(s, 'int'), base).ctx.rerollHits).toBe('ones')
    sk.charged = true
    expect(meleeSetup(s, sk, unit(s, 'int'), base).ctx.rerollHits).toBe('all')
  })
})
