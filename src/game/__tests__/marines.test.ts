import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { listProblems, presetList, type ArmyList } from '../army/armyList'
import { PROFILES, WEAPONS } from '../data/datasheets'
import { scriptedRoller } from '../dice/dice'
import { apply, meleeSetup, shootPlan, unitActions, validate } from '../engine'
import { alive } from '../gameState'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, Phase, PlayerId, UnitState } from '../types'
import { moveUnitTo } from './helpers'

// Captain, Hellblasters, Infernus, Bladeguard Veterans (11th edition, Wahapedia), see docs/marines.md.

const MARINES: ArmyList = {
  limit: 1000,
  units: [
    // the Captain on its own: these tests are about his own datasheet (a character leading a unit: attached.test.ts)
    { datasheetId: 'captain', size: 1, attachTo: null },
    { datasheetId: 'hellblasters', size: 5 },
    { datasheetId: 'infernus', size: 5 },
    { datasheetId: 'bladeguard', size: 3 },
    { datasheetId: 'intercessors', size: 5 },
  ],
}
/** Kommandos have Stealth: they always count as in cover against ranged attacks. */
const ORKS: ArmyList = { limit: 500, units: [{ datasheetId: 'kommandos', size: 10 }, { datasheetId: 'boyz', size: 10 }, { datasheetId: 'deffDread', size: 1 }] }

function battle(phase: Phase = 'shooting', active: PlayerId = 'marines'): GameState {
  const s = scenarioById('combat-patrol').build(['marines', 'orks'], { marines: MARINES, orks: ORKS })
  s.terrain = []
  s.objectives = []
  s.phase = phase
  s.activePlayer = active
  s.firstPlayer = 'marines'
  return s
}
const byDs = (s: GameState, id: string): UnitState => s.units.find((u) => u.datasheetId === id)!

describe('Space Marine datasheets (11th edition)', () => {
  it('characteristics and bases', () => {
    const stats = (id: string) => { const p = PROFILES[id]; return [p.m, p.t, p.sv, p.w, p.ld, p.oc, p.invuln, p.baseMm] }
    expect(stats('captain')).toEqual([6, 5, 3, 5, 6, 1, 4, 40])
    expect(stats('hellblaster')).toEqual([6, 5, 3, 2, 6, 1, undefined, 32])
    expect(stats('infernusMarine')).toEqual([6, 5, 3, 2, 6, 1, undefined, 32])
    expect(stats('bladeguardVeteran')).toEqual([6, 5, 3, 3, 6, 1, 4, 40])
    expect(stats('bladeguardSergeant')).toEqual([6, 5, 3, 3, 6, 1, 4, 40])
  })

  it('weapons', () => {
    const w = (id: string, i = 0) => { const p = WEAPONS[id].profiles[i]; return [p.range, p.attacks, p.skill, p.s, p.ap, p.d, p.keywords] }
    expect(w('masterCraftedBolter')).toEqual([24, 2, 2, 5, -1, 2, { rapidFire: 1, assault: true }])
    expect(w('captainHeavyBoltPistol')).toEqual([18, 1, 2, 5, -1, 1, { closeQuarters: true }])
    expect(w('captainPowerWeapon')).toEqual(['melee', 6, 2, 6, -2, 2, {}])
    expect(w('plasmaIncinerator')).toEqual([24, 2, 3, 7, -2, 2, { rapidFire: 1, assault: true }])
    expect(w('plasmaIncinerator', 1)).toEqual([24, 2, 3, 8, -3, 2, { rapidFire: 1, assault: true, hazardous: true }])
    expect(w('pyreblaster')).toEqual([12, 3, null, 5, -1, 1, { torrent: true, blast: 1 }])
    expect(w('ceramiteFists')).toEqual(['melee', 3, 3, 5, 0, 1, {}])
    expect(w('masterCraftedPowerSword')).toEqual(['melee', 4, 3, 5, -2, 2, {}])
  })

  it('the units muster with their datasheet composition', () => {
    const s = battle()
    expect(byDs(s, 'hellblasters').models.map((m) => m.profileId)).toEqual(['hellblasterSergeant', ...Array(4).fill('hellblaster')])
    expect(byDs(s, 'infernus').models.map((m) => m.profileId)).toEqual(['infernusSergeant', ...Array(4).fill('infernusMarine')])
    expect(byDs(s, 'bladeguard').models.map((m) => m.profileId)).toEqual(['bladeguardSergeant', 'bladeguardVeteran', 'bladeguardVeteran'])
    expect(listProblems('marines', MARINES)).toEqual([])
  })
})

describe('Finest Hour (Captain)', () => {
  /** The Captain is in base contact with the Boyz in the Fight phase. */
  const engaged = () => {
    const s = battle('fight')
    const cap = byDs(s, 'captain')
    const boyz = byDs(s, 'boyz')
    moveUnitTo(s, boyz.id, { x: 20, y: 10 })
    cap.models[0].pos = { x: 20 - 1.5, y: 10 }
    s.fight = { selecting: 'marines', step: 'rest' }
    return { s, cap, boyz }
  }

  it('+3 A and Devastating Wounds for that fight only, once per battle', () => {
    const { s, cap, boyz } = engaged()
    const sword = WEAPONS.captainPowerWeapon.profiles[0]
    expect(meleeSetup(s, cap, boyz, sword).profile.attacks).toBe(6)
    cap.finestHour = true
    const on = meleeSetup(s, cap, boyz, sword)
    expect(on.profile).toMatchObject({ attacks: 9, keywords: { devastatingWounds: true } })
    expect(on.notes).toContain('Finest Hour +3 A, Devastating Wounds')
    delete cap.finestHour
    const cmd = { type: 'fight' as const, unitId: cap.id, targetId: boyz.id, finestHour: true }
    expect(validate(s, cmd)).toEqual({ ok: true })
    const after = apply(s, cmd, scriptedRoller(Array(60).fill(4)))
    const c = after.units.find((u) => u.id === cap.id)!
    expect(c.finestHourUsed).toBe(true)
    expect(c.finestHour).toBeUndefined()
    expect(after.diceLog.some((d) => d.title.includes('Finest Hour'))).toBe(true)
    const used = structuredClone(s)
    byDs(used, 'captain').finestHourUsed = true
    expect(validate(used, cmd)).toMatchObject({ ok: false })
  })

  it('the AI spends it on a tough enough target', () => {
    const { s, cap, boyz } = engaged()
    const d = decide(s, 'standard')!
    expect(d.cmd).toEqual({ type: 'fight', unitId: cap.id, targetId: boyz.id, finestHour: true })
    expect(d.explanation).toMatch(/Звёздный час/)
  })

  it('a unit without it cannot use it', () => {
    const { s, boyz } = engaged()
    const int = byDs(s, 'intercessors')
    expect(validate(s, { type: 'fight', unitId: int.id, targetId: boyz.id, finestHour: true }).ok).toBe(false)
  })
})

describe('Bladeguard', () => {
  it('+1 to melee hit rolls', () => {
    const s = battle('fight')
    const bg = byDs(s, 'bladeguard')
    const ctx = meleeSetup(s, bg, byDs(s, 'boyz'), WEAPONS.masterCraftedPowerSword.profiles[0]).ctx
    expect(ctx.hitMod).toBe(1)
    expect(ctx.hitModNotes).toContain('Bladeguard +1')
    expect(meleeSetup(s, byDs(s, 'intercessors'), byDs(s, 'boyz'), WEAPONS.knivesAndFists.profiles[0]).ctx.hitMod).toBe(0)
  })
})

describe('Rites of Thermal Appeasement (Hellblasters)', () => {
  it('a supercharged Hazardous roll of 2 does not hurt Hellblasters', () => {
    const s = battle()
    const hb = byDs(s, 'hellblasters')
    const dread = byDs(s, 'deffDread')
    moveUnitTo(s, dread.id, { x: hb.models[0].pos.x + 12, y: hb.models[0].pos.y })
    const cmd = { type: 'shoot' as const, unitId: hb.id, targetId: dread.id, profiles: { plasmaIncinerator: 1 } }
    expect(validate(s, cmd).ok).toBe(true)
    const plan = shootPlan(s, hb, dread, { profiles: { plasmaIncinerator: 1 } })
    expect(plan.hazardousModels).toBe(5)
    // 12 hit rolls of 1 (rapid fire at half range: 5 × 2 + 2), then five Hazardous rolls of 2
    const after = apply(s, cmd, scriptedRoller([...Array(12).fill(1), 2, 2, 2, 2, 2]))
    const hazard = after.diceLog.find((d) => d.title.startsWith('Опасность'))!
    expect(hazard.steps[0].target).toBe('2+')
    expect(hazard.steps[0].dice.map((d) => d.value)).toEqual([2, 2, 2, 2, 2])
    expect(alive(after.units.find((u) => u.id === hb.id)!)).toHaveLength(5)
    // a roll of 1 still fails
    const ones = apply(s, cmd, scriptedRoller([...Array(12).fill(1), 1, 2, 2, 2, 2]))
    expect(ones.log.some((l) => l.text.includes('1 смертельн. ран') && l.text.includes('Hazardous'))).toBe(true)
  })
})

describe('Driven from Cover (Infernus)', () => {
  it('after the Infernus hit a target, other Marines shoot it without its cover until the end of the turn', () => {
    const s = battle()
    const inf = byDs(s, 'infernus')
    const kom = byDs(s, 'kommandos')
    const hb = byDs(s, 'hellblasters')
    moveUnitTo(s, kom.id, { x: inf.models[0].pos.x + 8, y: inf.models[0].pos.y })
    moveUnitTo(s, hb.id, { x: inf.models[0].pos.x, y: inf.models[0].pos.y + 4 })
    // Stealth: the Kommandos count as in cover
    const before = shootPlan(s, hb, kom)
    expect(before.cover).toBe(true)
    expect(before.groups[0].ctx.skillWorsen).toBe(1)
    const after = apply(s, { type: 'shoot', unitId: inf.id, targetId: kom.id }, scriptedRoller(Array(80).fill(3)))
    const k = after.units.find((u) => u.id === kom.id)!
    expect(k.drivenFromCover).toBe('marines')
    const plan = shootPlan(after, after.units.find((u) => u.id === hb.id)!, k)
    expect(plan.groups[0].ctx.skillWorsen).toBe(0)
    expect(plan.groups[0].notes).toContain('Driven from Cover: без укрытия')
    // the next turn the mark is gone
    const next = apply(after, { type: 'endPhase' }, scriptedRoller(Array(40).fill(4)))
    let t = next
    for (let i = 0; i < 10 && t.activePlayer === 'marines'; i++) t = apply(t, { type: 'endPhase' }, scriptedRoller(Array(40).fill(4)))
    expect(t.units.find((u) => u.id === kom.id)!.drivenFromCover).toBeUndefined()
  })

  it('the AI lets the Infernus shoot first', () => {
    const s = battle()
    const inf = byDs(s, 'infernus')
    const kom = byDs(s, 'kommandos')
    moveUnitTo(s, kom.id, { x: inf.models[0].pos.x + 8, y: inf.models[0].pos.y })
    const d = decide(s, 'standard')!
    expect(d.cmd).toMatchObject({ type: 'shoot', unitId: inf.id })
  })
})

describe('Marine presets with the new units', () => {
  it('both presets use the new units and stay legal', () => {
    for (const limit of [500, 1000] as const) {
      const list = presetList('marines', limit)
      expect(listProblems('marines', list)).toEqual([])
      for (const id of ['captain', 'hellblasters', 'infernus', 'bladeguard']) expect(list.units.some((e) => e.datasheetId === id), `${limit} ${id}`).toBe(true)
    }
  })

  it('the unit card offers Finest Hour in the Fight phase', () => {
    const s = battle('fight')
    const cap = byDs(s, 'captain')
    const boyz = byDs(s, 'boyz')
    moveUnitTo(s, boyz.id, { x: 20, y: 10 })
    cap.models[0].pos = { x: 18.5, y: 10 }
    expect(unitActions(s, cap.id).some((a) => a.id === `finest:${boyz.id}`)).toBe(true)
  })
})
