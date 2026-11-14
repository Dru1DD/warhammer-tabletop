import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { listProblems, presetList, type ArmyList } from '../army/armyList'
import { PROFILES, WEAPONS } from '../data/datasheets'
import { scriptedRoller } from '../dice/dice'
import { apply, meleeSetup, shootPlan, unitActions, validate } from '../engine'
import { alive } from '../gameState'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, Phase, PlayerId, UnitState } from '../types'
import { detachAll, moveUnitTo, place } from './helpers'

// Royal Warden, Immortals, Lychguard, Canoptek Wraiths (11th edition, Wahapedia), see docs/necrons.md.

const CRONS: ArmyList = {
  limit: 1000,
  units: [
    // the Overlord leads the Lychguard (Guardian Protocols); the Warden stays on its own
    { datasheetId: 'overlord', size: 1, attachTo: 3 },
    { datasheetId: 'royalWarden', size: 1, attachTo: null },
    { datasheetId: 'immortals', size: 5 },
    { datasheetId: 'lychguard', size: 5 },
    { datasheetId: 'canoptekWraiths', size: 3 },
  ],
}

/** Marine training roster (west) against the Necrons (east), no terrain or objectives. */
function battle(phase: Phase = 'shooting', active: PlayerId = 'necrons'): GameState {
  const s = detachAll(scenarioById('combat-patrol').build(['marines', 'necrons'], { necrons: CRONS }), ['marines'])
  s.terrain = []
  s.objectives = []
  s.phase = phase
  s.activePlayer = active
  s.firstPlayer = 'marines'
  return s
}
const byDs = (s: GameState, id: string): UnitState => s.units.find((u) => u.datasheetId === id)!
const unitById = (s: GameState, id: string): UnitState => s.units.find((u) => u.id === id)!

describe('Necron datasheets (11th edition)', () => {
  it('characteristics and bases', () => {
    const stats = (id: string) => { const p = PROFILES[id]; return [p.m, p.t, p.sv, p.w, p.ld, p.oc, p.invuln, p.baseMm] }
    expect(stats('royalWarden')).toEqual([5, 5, 3, 4, 6, 1, undefined, 32])
    expect(stats('immortal')).toEqual([5, 5, 3, 1, 7, 2, undefined, 32])
    expect(stats('lychguard')).toEqual([5, 5, 3, 2, 7, 1, undefined, 32])
    expect(stats('canoptekWraith')).toEqual([10, 6, 3, 4, 8, 2, 4, 50])
  })

  it('weapons', () => {
    const w = (id: string) => { const p = WEAPONS[id].profiles[0]; return [p.range, p.attacks, p.skill, p.s, p.ap, p.d, p.keywords] }
    expect(w('relicGaussBlaster')).toEqual([24, 2, 3, 5, -1, 2, { lethalHits: true, rapidFire: 2 }])
    expect(w('wardenCcw')).toEqual(['melee', 4, 3, 5, 0, 1, {}])
    expect(w('gaussBlaster')).toEqual([24, 2, 3, 5, -1, 1, { lethalHits: true }])
    expect(w('immortalCcw')).toEqual(['melee', 2, 3, 4, 0, 1, {}])
    expect(w('warscythe')).toEqual(['melee', 2, 3, 8, -3, 2, { devastatingWounds: true }])
    expect(w('viciousClaws')).toEqual(['melee', 4, 4, 6, -1, 2, {}])
  })

  it('every new unit has Reanimation Protocols and musters with its composition', () => {
    const s = battle()
    for (const id of ['royalWarden', 'immortals', 'lychguard', 'canoptekWraiths']) expect(byDs(s, id).models.length).toBeGreaterThan(0)
    expect(byDs(s, 'canoptekWraiths').models.map((m) => m.profileId)).toEqual(['canoptekWraith', 'canoptekWraith', 'canoptekWraith'])
    expect(listProblems('necrons', CRONS)).toEqual([])
  })
})

describe('Implacable Eradication (Immortals)', () => {
  it('re-roll wound rolls of 1, or every failed one against a target within range of an objective', () => {
    const s = battle()
    const imm = byDs(s, 'immortals')
    const int = unitById(s, 'int')
    moveUnitTo(s, imm.id, { x: 30, y: 6 })
    moveUnitTo(s, int.id, { x: 14, y: 6 })
    expect(shootPlan(s, imm, int).groups[0].ctx.rerollWounds).toBe('ones')
    s.objectives = [{ id: 'o1', pos: { ...int.models[0].pos }, controller: null }]
    const near = shootPlan(s, imm, int).groups[0]
    expect(near.ctx.rerollWounds).toBe('all')
    expect(near.notes).toContain('Implacable Eradication: переброс ранений (цель у объекта)')
  })

  it('a wound roll of 1 is re-rolled in the dice log', () => {
    const s = battle()
    const imm = byDs(s, 'immortals')
    const int = unitById(s, 'int')
    moveUnitTo(s, imm.id, { x: 30, y: 6 })
    moveUnitTo(s, int.id, { x: 14, y: 6 })
    // 10 hit rolls of 3 (hits, no crits), then the first wound roll is a 1 and its re-roll a 4
    const after = apply(s, { type: 'shoot', unitId: imm.id, targetId: int.id }, scriptedRoller([...Array(10).fill(3), 1, 4, ...Array(40).fill(2)]))
    const wound = after.diceLog.at(-1)!.steps.find((st) => st.label === 'Ранение')!
    expect(wound.dice[0]).toMatchObject({ value: 4, rerolledFrom: 1 })
  })
})

describe('Guardian Protocols (Lychguard)', () => {
  it('−1 to wound for attacks with S above their T while a NOBLE leads them', () => {
    const s = battle('fight', 'marines')
    const lg = byDs(s, 'lychguard')
    expect(lg.attached?.map((p) => p.datasheetId)).toEqual(['overlord'])
    const ov = lg.models.find((m) => m.profileId === 'overlord')!
    moveUnitTo(s, lg.id, { x: 30, y: 15 })
    const red = unitById(s, 'red')
    const fist = WEAPONS.redemptorFist.profiles[0]
    expect(meleeSetup(s, red, lg, fist).ctx).toMatchObject({ woundMod: -1, woundModNote: 'Guardian Protocols: сила больше стойкости' })
    // S5 is not above T5
    expect(meleeSetup(s, unitById(s, 'int'), lg, WEAPONS.knivesAndFists.profiles[0]).ctx.woundMod).toBe(0)
    // the Overlord falls
    ov.destroyed = true
    expect(meleeSetup(s, red, lg, fist).ctx.woundMod).toBe(0)
  })
})

describe('Royal Warden', () => {
  it('Adaptive Strategy: shoots after Falling Back', () => {
    const s = battle()
    const rw = byDs(s, 'royalWarden')
    const int = unitById(s, 'int')
    moveUnitTo(s, int.id, { x: 20, y: 6 })
    rw.models[0].pos = { x: 30, y: 6 }
    rw.move = 'fallBack'
    expect(validate(s, { type: 'shoot', unitId: rw.id, targetId: int.id })).toEqual({ ok: true })
    const imm = byDs(s, 'immortals')
    imm.move = 'fallBack'
    expect(validate(s, { type: 'shoot', unitId: imm.id, targetId: int.id }).ok).toBe(false)
  })

  it('Engrammatic Logic: frees a battle-shocked unit within 12″, once per battle; the AI uses it', () => {
    const s = battle('command')
    const rw = byDs(s, 'royalWarden')
    const imm = byDs(s, 'immortals')
    imm.battleShocked = true
    moveUnitTo(s, imm.id, { x: rw.models[0].pos.x, y: rw.models[0].pos.y + 4 })
    const cmd = { type: 'engrammatic' as const, unitId: rw.id, targetId: imm.id }
    expect(validate(s, cmd)).toEqual({ ok: true })
    expect(unitActions(s, rw.id).some((a) => a.id === `engram:${imm.id}` && a.ok)).toBe(true)
    const d = decide(s, 'standard')!
    expect(d.cmd).toEqual(cmd)
    const after = apply(s, cmd, scriptedRoller([]))
    expect(unitById(after, imm.id).battleShocked).toBe(false)
    unitById(after, imm.id).battleShocked = true
    expect(validate(after, cmd)).toMatchObject({ ok: false, reason: expect.stringMatching(/раз за битву/) })
    const far = structuredClone(s)
    moveUnitTo(far, imm.id, { x: rw.models[0].pos.x, y: rw.models[0].pos.y > 15 ? 2 : 28 })
    expect(validate(far, cmd).ok).toBe(false)
  })
})

describe('Wraith Form (Canoptek Wraiths)', () => {
  /** Wraiths fly 7.9″ over the Lieutenant (only the middle one crosses its base). */
  const flyOver = () => {
    const s = battle('movement')
    const wr = byDs(s, 'canoptekWraiths')
    place(s, wr.id, [{ x: 12, y: 15 }, { x: 12, y: 17 }, { x: 12, y: 19 }])
    place(s, 'lt', [{ x: 16, y: 17 }])
    const positions = Object.fromEntries(wr.models.map((m) => [m.id, { x: m.pos.x + 7.9, y: m.pos.y }]))
    const cmd = { type: 'move' as const, unitId: wr.id, mode: 'normal' as const, positions, fly: true }
    expect(validate(s, cmd)).toEqual({ ok: true })
    return { s: apply(s, cmd, scriptedRoller([])), wr }
  }

  it('after a Normal move the units it passed over can be hit, D6 per model, 4+ = 1 mortal wound', () => {
    const { s, wr } = flyOver()
    expect(unitById(s, wr.id).wraithTargets).toEqual(['lt'])
    expect(unitActions(s, wr.id).some((a) => a.id === 'wraith:lt' && a.ok)).toBe(true)
    const after = apply(s, { type: 'wraithForm', unitId: wr.id, targetId: 'lt' }, scriptedRoller([4, 6, 2]))
    expect(alive(unitById(after, 'lt'))[0].wounds).toBe(4 - 2)
    expect(unitById(after, wr.id).wraithTargets).toBeUndefined()
    expect(validate(after, { type: 'wraithForm', unitId: wr.id, targetId: 'lt' }).ok).toBe(false)
  })

  it('a unit it did not pass over is not a valid target', () => {
    const { s, wr } = flyOver()
    expect(validate(s, { type: 'wraithForm', unitId: wr.id, targetId: 'int' }).ok).toBe(false)
  })

  it('the AI uses it after its move', () => {
    const { s, wr } = flyOver()
    for (const u of s.units) if (u.owner === 'necrons' && u.id !== wr.id) u.move = 'normal'
    const d = decide(s, 'standard')!
    expect(d.cmd).toEqual({ type: 'wraithForm', unitId: wr.id, targetId: 'lt' })
  })
})

describe('Necron presets with the new units', () => {
  it('both presets use the new units and stay legal', () => {
    for (const limit of [500, 1000] as const) {
      const list = presetList('necrons', limit)
      expect(listProblems('necrons', list)).toEqual([])
      for (const id of ['royalWarden', 'immortals', 'lychguard', 'canoptekWraiths']) expect(list.units.some((e) => e.datasheetId === id), `${limit} ${id}`).toBe(true)
    }
  })
})
