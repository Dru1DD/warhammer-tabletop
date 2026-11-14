import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { listProblems, presetList, type ArmyList } from '../army/armyList'
import { AELDARI_DATASHEETS, AELDARI_PROFILES, AELDARI_WEAPONS } from '../data/aeldari'
import { AELDARI_EXTRA_DATASHEETS, AELDARI_EXTRA_PROFILES, AELDARI_EXTRA_WEAPONS } from '../data/aeldariExtra'
import { PROFILES, WEAPONS } from '../data/datasheets'
import { MARINE_DATASHEETS, MARINE_PROFILES, MARINE_WEAPONS } from '../data/marines'
import { MECHANICUS_DATASHEETS, MECHANICUS_PROFILES, MECHANICUS_WEAPONS } from '../data/mechanicus'
import { NECRON_DATASHEETS, NECRON_PROFILES, NECRON_WEAPONS } from '../data/necrons'
import { NECRON_EXTRA_DATASHEETS, NECRON_EXTRA_PROFILES, NECRON_EXTRA_WEAPONS } from '../data/necronsExtra'
import { ORK_DATASHEETS, ORK_PROFILES, ORK_WEAPONS } from '../data/orks'
import { TYRANID_DATASHEETS, TYRANID_PROFILES, TYRANID_WEAPONS } from '../data/tyranids'
import { TYRANID_EXTRA_DATASHEETS, TYRANID_EXTRA_PROFILES, TYRANID_EXTRA_WEAPONS } from '../data/tyranidsExtra'
import { fmtRandom, scriptedRoller } from '../dice/dice'
import { apply, meleeSetup, shootPlan, unitActions, validate } from '../engine'
import { alive } from '../gameState'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, Phase, PlayerId, UnitState } from '../types'
import { moveUnitTo, place } from './helpers'

// Autarch, Rangers, Wraithguard, Swooping Hawks (11th edition, Wahapedia), see docs/aeldari.md.

const ELDAR: ArmyList = {
  limit: 1000,
  units: [
    // the Farseer stays on its own (Psychic Guidance measures from it); the Autarch leads the Guardians
    { datasheetId: 'farseer', size: 1, attachTo: null },
    { datasheetId: 'autarch', size: 1 },
    { datasheetId: 'aeldariRangers', size: 5 },
    { datasheetId: 'wraithguard', size: 5 },
    { datasheetId: 'swoopingHawks', size: 5 },
    { datasheetId: 'guardianDefenders', size: 11 },
  ],
}

/** Marine training roster (west) against the Aeldari (east), no terrain or objectives. */
function battle(phase: Phase = 'shooting', active: PlayerId = 'aeldari'): GameState {
  const s = scenarioById('combat-patrol').build(['marines', 'aeldari'], { aeldari: ELDAR })
  s.terrain = []
  s.objectives = []
  s.phase = phase
  s.activePlayer = active
  s.firstPlayer = 'marines'
  return s
}
const byDs = (s: GameState, id: string): UnitState => s.units.find((u) => u.datasheetId === id)!
const unitById = (s: GameState, id: string): UnitState => s.units.find((u) => u.id === id)!

describe('data files never reuse an id (a later file would silently replace the earlier entry)', () => {
  it.each([
    ['weapons', [AELDARI_WEAPONS, AELDARI_EXTRA_WEAPONS, MARINE_WEAPONS, MECHANICUS_WEAPONS, NECRON_WEAPONS, NECRON_EXTRA_WEAPONS, ORK_WEAPONS, TYRANID_WEAPONS, TYRANID_EXTRA_WEAPONS]],
    ['profiles', [AELDARI_PROFILES, AELDARI_EXTRA_PROFILES, MARINE_PROFILES, MECHANICUS_PROFILES, NECRON_PROFILES, NECRON_EXTRA_PROFILES, ORK_PROFILES, TYRANID_PROFILES, TYRANID_EXTRA_PROFILES]],
    ['datasheets', [AELDARI_DATASHEETS, AELDARI_EXTRA_DATASHEETS, MARINE_DATASHEETS, MECHANICUS_DATASHEETS, NECRON_DATASHEETS, NECRON_EXTRA_DATASHEETS, ORK_DATASHEETS, TYRANID_DATASHEETS, TYRANID_EXTRA_DATASHEETS]],
  ] as const)('%s', (_, records) => {
    const seen = new Map<string, number>()
    for (const r of records) for (const k of Object.keys(r)) seen.set(k, (seen.get(k) ?? 0) + 1)
    expect([...seen].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([])
  })
})

describe('Aeldari datasheets (11th edition)', () => {
  it('characteristics and bases', () => {
    const stats = (id: string) => { const p = PROFILES[id]; return [p.m, p.t, p.sv, p.w, p.ld, p.oc, p.invuln, p.baseMm] }
    expect(stats('autarch')).toEqual([7, 3, 3, 4, 6, 1, 4, 32])
    expect(stats('aeldariRanger')).toEqual([7, 3, 5, 1, 7, 1, undefined, 28.5])
    expect(stats('wraithguard')).toEqual([6, 6, 2, 3, 8, 1, undefined, 40])
    expect(stats('hawkExarch')).toEqual([14, 3, 4, 1, 6, 1, 5, 32])
    expect(stats('swoopingHawk')).toEqual([14, 3, 4, 1, 6, 1, undefined, 32])
    // the Skitarii Rangers are untouched
    expect(PROFILES.ranger.name).toBe('Скитарий-рейнджер')
  })

  it('weapons', () => {
    const w = (id: string) => {
      const p = WEAPONS[id].profiles[0]
      return [p.range, fmtRandom(p.attacks, p.randomA), p.skill, p.s, p.ap, fmtRandom(p.d, p.randomD), p.keywords]
    }
    expect(w('starGlaive')).toEqual(['melee', '4', 2, 6, -3, '3', {}])
    expect(w('autarchPistol')).toEqual([12, '1', 2, 4, -1, '1', { assault: true, closeQuarters: true }])
    expect(w('longRifle')).toEqual([36, '1', 3, 4, -1, '2', { heavy: true, precision: true }])
    expect(w('wraithcannon')).toEqual([18, '1', 4, 14, -4, 'D6+1', {}])
    expect(w('hawksTalon')).toEqual([24, '2', 3, 6, -2, '2', { lethalHits: true }])
    expect(w('lasblaster')).toEqual([24, '4', 3, 4, 0, '1', { assault: true, lethalHits: true }])
  })

  it('the units muster with their datasheet composition', () => {
    const s = battle()
    expect(byDs(s, 'swoopingHawks').models.map((m) => m.profileId)).toEqual(['hawkExarch', ...Array(4).fill('swoopingHawk')])
    expect(byDs(s, 'wraithguard').models).toHaveLength(5)
    expect(listProblems('aeldari', ELDAR)).toEqual([])
  })
})

describe('Superlative Strategist (Autarch)', () => {
  it('the unit the Autarch leads re-rolls an Advance roll; other Aeldari cannot', () => {
    const s = battle('movement')
    const au = byDs(s, 'guardianDefenders')
    expect(au.attached?.map((p) => p.datasheetId)).toEqual(['autarch'])
    const after = apply(s, { type: 'declareAdvance', unitId: au.id }, scriptedRoller([1]))
    expect(validate(after, { type: 'rerollAdvance', unitId: au.id })).toEqual({ ok: true })
    const re = apply(after, { type: 'rerollAdvance', unitId: au.id }, scriptedRoller([5]))
    expect(unitById(re, au.id).advanceRoll).toBe(5)
    expect(re.diceLog.at(-1)!.steps[0].note).toMatch(/Superlative Strategist/)
    const gd = byDs(s, 'aeldariRangers')
    const g2 = apply(s, { type: 'declareAdvance', unitId: gd.id }, scriptedRoller([1]))
    expect(validate(g2, { type: 'rerollAdvance', unitId: gd.id }).ok).toBe(false)
  })
})

describe('Rangers: 5+ invulnerable save against ranged attacks only', () => {
  it('applies to shooting, not to melee', () => {
    const s = battle('shooting', 'marines')
    const rg = byDs(s, 'aeldariRangers')
    const int = unitById(s, 'int')
    moveUnitTo(s, rg.id, { x: 30, y: 6 })
    moveUnitTo(s, int.id, { x: 16, y: 6 })
    expect(shootPlan(s, int, rg).groups[0].ctx.invulnOverride).toBe(5)
    expect(meleeSetup(s, int, rg, WEAPONS.knivesAndFists.profiles[0]).ctx.invulnOverride).toBeUndefined()
  })
})

describe('Wraithguard', () => {
  it('War Construct: shoots after Falling Back, but does not charge', () => {
    const s = battle()
    const wg = byDs(s, 'wraithguard')
    const int = unitById(s, 'int')
    moveUnitTo(s, wg.id, { x: 26, y: 6 })
    moveUnitTo(s, int.id, { x: 14, y: 6 })
    wg.move = 'fallBack'
    expect(validate(s, { type: 'shoot', unitId: wg.id, targetId: int.id })).toEqual({ ok: true })
    const charge = structuredClone(s)
    charge.phase = 'charge'
    expect(validate(charge, { type: 'declareCharge', unitId: wg.id }).ok).toBe(false)
  })

  it('Psychic Guidance: +1 to hit within 12″ of the Farseer', () => {
    const s = battle()
    const wg = byDs(s, 'wraithguard')
    const fs = byDs(s, 'farseer')
    const int = unitById(s, 'int')
    moveUnitTo(s, wg.id, { x: 26, y: 6 })
    moveUnitTo(s, int.id, { x: 14, y: 6 })
    fs.models[0].pos = { x: 30, y: 9 }
    const near = shootPlan(s, wg, int).groups[0]
    expect(near.ctx.hitModNotes).toContain('Psychic Guidance +1')
    fs.models[0].pos = { x: 42, y: 28 }
    expect(shootPlan(s, wg, int).groups[0].ctx.hitModNotes).not.toContain('Psychic Guidance +1')
  })
})

describe('Grenade Pack Flyover (Swooping Hawks)', () => {
  const ready = () => {
    const s = battle('movement')
    const hk = byDs(s, 'swoopingHawks')
    place(s, hk.id, [{ x: 22, y: 10 }, { x: 22, y: 11.4 }, { x: 22, y: 12.8 }, { x: 22, y: 14.2 }, { x: 22, y: 15.6 }])
    moveUnitTo(s, 'int', { x: 15, y: 12 })
    hk.move = 'advance'
    return { s, hk }
  }

  it('after any move, a visible enemy unit within 8″: D6 per model, 4+ = 1 mortal wound; once per turn', () => {
    const { s, hk } = ready()
    const cmd = { type: 'grenadePack' as const, unitId: hk.id, targetId: 'int' }
    expect(validate(s, cmd)).toEqual({ ok: true })
    expect(unitActions(s, hk.id).some((a) => a.id === 'grenade:int' && a.ok)).toBe(true)
    const after = apply(s, cmd, scriptedRoller([4, 5, 1, 6, 2]))
    expect(alive(unitById(after, 'int')).reduce((n, m) => n + m.wounds, 0)).toBe(10 - 3)
    expect(validate(after, cmd)).toMatchObject({ ok: false, reason: expect.stringMatching(/раз за ход/) })
    const notMoved = structuredClone(s)
    unitById(notMoved, hk.id).move = 'none'
    expect(validate(notMoved, cmd).ok).toBe(false)
    const far = structuredClone(s)
    moveUnitTo(far, 'int', { x: 6, y: 12 })
    expect(validate(far, cmd).ok).toBe(false)
  })

  it('the AI uses it', () => {
    const { s, hk } = ready()
    for (const u of s.units) if (u.owner === 'aeldari' && u.id !== hk.id) u.move = 'normal'
    expect(decide(s, 'standard')!.cmd).toMatchObject({ type: 'grenadePack', unitId: hk.id })
  })
})

describe('Aeldari presets with the new units', () => {
  it('both presets use the new units and stay legal', () => {
    for (const limit of [500, 1000] as const) {
      const list = presetList('aeldari', limit)
      expect(listProblems('aeldari', list)).toEqual([])
      for (const id of ['autarch', 'aeldariRangers', 'swoopingHawks']) expect(list.units.some((e) => e.datasheetId === id), `${limit} ${id}`).toBe(true)
    }
    expect(presetList('aeldari', 1000).units.some((e) => e.datasheetId === 'wraithguard')).toBe(true)
  })
})
