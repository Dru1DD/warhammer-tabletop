import { describe, expect, it } from 'vitest'
import { WEAPONS } from '../data/datasheets'
import { scriptedRoller } from '../dice/dice'
import { resolveGroup, saveTarget, woundTarget } from '../combat/attack'
import { alive } from '../gameState'
import { bare } from './helpers'

const ctx = { hitMod: 0, hitModNotes: [], skillWorsen: 0, lethalHits: false }

describe('wound table', () => {
  it.each([[10, 5, 2], [6, 5, 3], [5, 5, 4], [4, 5, 5], [2, 5, 6], [3, 6, 6], [4, 7, 5]])('S%i vs T%i wounds on %i+', (s, t, n) => {
    expect(woundTarget(s, t)).toBe(n)
  })
})

describe('attack sequence', () => {
  it('resolves hit, wound, save and damage with every die recorded', () => {
    const s = bare()
    const boyz = s.units.find((u) => u.id === 'boyz')!
    // bolt rifle focused: BS3+, S6 vs T5 → 3+, AP-1 vs Sv5+ → 6+, D2
    const g = { weaponName: 'Bolt rifle', profile: WEAPONS.boltRifle.profiles[0], models: 3, attacks: 3, notes: [] }
    // hits: 1(miss) 3(hit) 6(hit) ; wounds: 2(fail) 5(ok) ; saves: 4 (fail, need 6)
    const r = resolveGroup(scriptedRoller([1, 3, 6, 2, 5, 4]), 'Int', g, boyz, ctx)
    expect(r.steps[0].dice.map((d) => d.success)).toEqual([false, true, true])
    expect(r.steps[1].target).toBe('3+')
    expect(r.steps[2].target).toBe('6+')
    expect(r.damage).toBe(1) // 1-wound Boy: excess damage is lost
    expect(r.killed).toBe(1)
    expect(alive(boyz)).toHaveLength(5)
  })
  it('allocates to non-character, lowest-W models first; Nob last', () => {
    const s = bare()
    const boyz = s.units.find((u) => u.id === 'boyz')!
    const g = { weaponName: 'x', profile: WEAPONS.boltRifle.profiles[0], models: 5, attacks: 5, notes: [] }
    resolveGroup(scriptedRoller([6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 1, 1, 1, 1, 1]), 'Int', g, boyz, ctx)
    expect(alive(boyz).map((m) => m.profileId)).toEqual(['nob'])
  })
  it('Lethal Hits: critical hit wounds automatically', () => {
    const s = bare()
    const boyz = s.units.find((u) => u.id === 'boyz')!
    const g = { weaponName: 'x', profile: WEAPONS.ltBoltPistol.profiles[0], models: 1, attacks: 1, notes: [] }
    // hit 6 (crit → auto wound, no wound roll), save 1 (fail)
    const r = resolveGroup(scriptedRoller([6, 1]), 'Lt', g, boyz, { ...ctx, lethalHits: true })
    expect(r.steps[1].dice).toHaveLength(0)
    expect(r.killed).toBe(1)
  })
  it('cover worsens BS; hit modifiers are capped at +1', () => {
    const s = bare()
    const boyz = s.units.find((u) => u.id === 'boyz')!
    const g = { weaponName: 'x', profile: WEAPONS.boltRifle.profiles[0], models: 1, attacks: 1, notes: [] }
    const r = resolveGroup(scriptedRoller([3, 1]), 'Int', g, boyz, { ...ctx, skillWorsen: 1 })
    expect(r.steps[0].target).toBe('4+')
    expect(r.steps[0].dice[0].success).toBe(false)
    const r2 = resolveGroup(scriptedRoller([3, 1]), 'Int', g, boyz, { ...ctx, skillWorsen: 1, hitMod: 3, hitModNotes: ['a', 'b', 'c'] })
    expect(r2.steps[0].dice[0].success).toBe(true) // 3 + 1 (capped) ≥ 4
  })
  it('uses an invulnerable save when better than modified armour', () => {
    const s = bare()
    const nob = s.units.find((u) => u.id === 'boyz')!.models[0]
    expect(saveTarget(nob, -3).need).toBe(8)
    expect(saveTarget(nob, -3, 5)).toEqual({ need: 5, kind: 'непробиваемый (invulnerable)' })
    expect(saveTarget(nob, 0, 5).need).toBe(5)
  })
  it('unmodified 1 always fails a save even with a 2+ save', () => {
    const s = bare()
    const lt = s.units.find((u) => u.id === 'lt')!
    const g = { weaponName: 'x', profile: WEAPONS.choppa.profiles[0], models: 1, attacks: 1, notes: [] }
    const r = resolveGroup(scriptedRoller([6, 6, 1]), 'Boy', g, lt, ctx)
    expect(r.steps[2].dice[0].success).toBe(false)
    expect(lt.models[0].wounds).toBe(3)
  })
})
