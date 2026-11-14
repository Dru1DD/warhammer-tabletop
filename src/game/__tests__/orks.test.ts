import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { listProblems, presetList, type ArmyList } from '../army/armyList'
import { PROFILES, WEAPONS } from '../data/datasheets'
import { scriptedRoller } from '../dice/dice'
import { apply, meleeSetup, unitActions, validate } from '../engine'
import { alive, updateObjectiveControl } from '../gameState'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, Phase } from '../types'
import { moveUnitTo, unit } from './helpers'

// Warboss, Nobz, Gretchin and Kommandos (11th edition, Wahapedia Orks app v1.2), see docs/orks.md.

const LIST: ArmyList = {
  limit: 1000,
  units: [
    // the Warboss on its own: these tests are about his own datasheet (a Warboss leading a unit: attached.test.ts)
    { datasheetId: 'warboss', size: 1, attachTo: null },
    { datasheetId: 'nobz', size: 5 },
    { datasheetId: 'gretchin', size: 10 },
    { datasheetId: 'kommandos', size: 10 },
  ],
}

/** Marines (training roster, west) against the new Ork units (east), no terrain or objectives. */
function orks(phase: Phase = 'movement', active: 'orks' | 'marines' = 'orks'): GameState {
  const s = scenarioById('combat-patrol').build(['marines', 'orks'], { orks: LIST })
  s.terrain = []
  s.objectives = []
  s.phase = phase
  s.activePlayer = active
  s.firstPlayer = 'marines'
  return s
}

describe('Ork datasheets (11th edition)', () => {
  it('characteristics and bases', () => {
    const stats = (id: string) => { const p = PROFILES[id]; return [p.m, p.t, p.sv, p.w, p.ld, p.oc, p.invuln, p.baseMm] }
    expect(stats('warboss')).toEqual([6, 6, 4, 6, 6, 1, 5, 50])
    expect(stats('nobzNob')).toEqual([6, 5, 4, 3, 7, 1, undefined, 40])
    expect(stats('gretchin')).toEqual([6, 2, 6, 1, 8, 1, undefined, 25])
    expect(stats('kommando')).toEqual([6, 5, 5, 1, 7, 1, undefined, 32])
    expect(stats('kommandoNob')).toEqual([6, 5, 5, 3, 7, 1, undefined, 32])
    expect(PROFILES.warboss.character).toBe(true)
  })

  it('weapons', () => {
    const w = (id: string) => { const p = WEAPONS[id].profiles[0]; return [p.range, p.attacks, p.skill, p.s, p.ap, p.d] }
    expect(w('kustomShoota')).toEqual([18, 4, 5, 4, 0, 1])
    expect(WEAPONS.kustomShoota.profiles[0].keywords).toEqual({ lethalHits: 'nonMV', rapidFire: 2 })
    expect(w('bossKustomChoppa')).toEqual(['melee', 6, 2, 7, -2, 2])
    expect(WEAPONS.bossKustomChoppa.profiles[0].keywords).toEqual({ cleave: 2 })
    expect(w('kustomKrumpa')).toEqual(['melee', 3, 3, 10, -2, 2])
    expect(w('grotBlasta')).toEqual([12, 1, 4, 3, 0, 1])
    expect(w('scavengedShivs')).toEqual(['melee', 1, 5, 2, 0, 1])
  })

  it('the units muster with their datasheet composition', () => {
    const s = orks()
    const count = (id: string) => s.units.find((u) => u.datasheetId === id)!.models.map((m) => m.profileId)
    expect(count('warboss')).toEqual(['warboss'])
    expect(count('nobz')).toEqual(Array(5).fill('nobzNob'))
    expect(count('gretchin')).toEqual(Array(10).fill('gretchin'))
    expect(count('kommandos')).toEqual(['kommandoNob', ...Array(9).fill('kommando')])
    expect(listProblems('orks', LIST)).toEqual([])
  })
})

describe('Might Is Right (Warboss)', () => {
  it('+3 A and +2 S on melee attacks only after charging', () => {
    const s = orks('fight')
    const boss = s.units.find((u) => u.datasheetId === 'warboss')!
    const target = unit(s, 'int')
    const choppa = WEAPONS.bossKustomChoppa.profiles[0]
    expect(meleeSetup(s, boss, target, choppa).profile).toMatchObject({ attacks: 6, s: 7 })
    boss.charged = true
    const after = meleeSetup(s, boss, target, choppa)
    expect(after.profile).toMatchObject({ attacks: 9, s: 9 })
    expect(after.notes).toContain('Might Is Right +3 A, +2 S')
    // the Nobz have no such rule
    const nobz = s.units.find((u) => u.datasheetId === 'nobz')!
    nobz.charged = true
    expect(meleeSetup(s, nobz, target, WEAPONS.kustomKrumpa.profiles[0]).profile).toMatchObject({ attacks: 3, s: 10 })
  })
})

describe('Bomb Squig (Kommandos)', () => {
  /** Kommandos have made a normal move and stand 8″ from the Intercessors. */
  const ready = () => {
    const s = orks()
    const k = s.units.find((u) => u.datasheetId === 'kommandos')!
    k.move = 'normal'
    moveUnitTo(s, k.id, { x: 22, y: 6 })
    moveUnitTo(s, 'int', { x: 14, y: 6 })
    return { s, k }
  }

  it('on a 3+ the target suffers D3 mortal wounds, once per battle', () => {
    const { s, k } = ready()
    const cmd = { type: 'bombSquig' as const, unitId: k.id, targetId: 'int' }
    expect(validate(s, cmd)).toEqual({ ok: true })
    const after = apply(s, cmd, scriptedRoller([4, 6])) // 4: it explodes; D3 from 6 = 3 mortal wounds
    const int = unit(after, 'int')
    expect(int.models.reduce((n, m) => n + m.wounds, 0)).toBe(10 - 3)
    expect(after.diceLog.at(-1)!.title).toBe(`Бомбосквиг: ${k.name}`)
    expect(unit(after, k.id).bombSquigUsed).toBe(true)
    expect(validate(after, cmd)).toMatchObject({ ok: false, reason: expect.stringMatching(/раз за битву/) })
  })

  it('on a 1–2 the squig fizzles, and it is still spent', () => {
    const { s, k } = ready()
    const after = apply(s, { type: 'bombSquig', unitId: k.id, targetId: 'int' }, scriptedRoller([2]))
    expect(alive(unit(after, 'int')).every((m) => m.wounds === 2)).toBe(true)
    expect(unit(after, k.id).bombSquigUsed).toBe(true)
  })

  it('needs a normal move this phase and a target within 12″', () => {
    const { s, k } = ready()
    const cmd = { type: 'bombSquig' as const, unitId: k.id, targetId: 'int' }
    for (const move of ['none', 'advance', 'fallBack'] as const) {
      const t = structuredClone(s)
      unit(t, k.id).move = move
      expect(validate(t, cmd).ok, move).toBe(false)
    }
    const far = structuredClone(s)
    moveUnitTo(far, 'int', { x: 6, y: 6 })
    expect(validate(far, cmd)).toMatchObject({ ok: false, reason: expect.stringMatching(/дальше 12″/) })
    const shooting = structuredClone(s)
    shooting.phase = 'shooting'
    expect(validate(shooting, cmd).ok).toBe(false)
  })

  it('the unit card offers it after a normal move, and the AI uses it', () => {
    const { s, k } = ready()
    expect(unitActions(s, k.id).some((a) => a.id === 'squig:int' && a.ok)).toBe(true)
    // only Kommandos are left to act this phase
    for (const u of s.units) if (u.owner === 'orks') u.move = 'normal'
    const d = decide(s, 'standard')!
    expect(d.cmd.type).toBe('bombSquig')
    expect(d.explanation).toMatch(/бомбосквига/)
  })
})

describe("Thievin' Scavengers (Gretchin)", () => {
  it('Gretchin on an objective at the end of the Movement phase keep it after they leave', () => {
    const s = orks()
    const g = s.units.find((u) => u.datasheetId === 'gretchin')!
    s.objectives = [{ id: 'o1', pos: { ...g.models[0].pos }, controller: null }]
    updateObjectiveControl(s)
    expect(s.objectives[0].controller).toBe('orks')
    const after = apply(s, { type: 'endPhase' }, scriptedRoller([]))
    expect(after.phase).toBe('shooting')
    expect(after.objectives[0].held).toBe('orks')
    const gone = structuredClone(after)
    moveUnitTo(gone, g.id, { x: 40, y: 28 })
    updateObjectiveControl(gone)
    expect(gone.objectives[0].controller).toBe('orks')
  })

  it('other Ork units do not secure objectives', () => {
    const s = orks()
    const nobz = s.units.find((u) => u.datasheetId === 'nobz')!
    s.objectives = [{ id: 'o1', pos: { ...nobz.models[0].pos }, controller: null }]
    updateObjectiveControl(s)
    // Nobz alone near it (Gretchin far away)
    moveUnitTo(s, s.units.find((u) => u.datasheetId === 'gretchin')!.id, { x: 40, y: 28 })
    updateObjectiveControl(s)
    const after = apply(s, { type: 'endPhase' }, scriptedRoller([]))
    expect(after.objectives[0].held).toBeUndefined()
  })
})

describe('Ork presets with the new units', () => {
  it('both presets use the new units and stay legal', () => {
    for (const limit of [500, 1000] as const) {
      const list = presetList('orks', limit)
      expect(listProblems('orks', list)).toEqual([])
      for (const id of ['warboss', 'nobz', 'gretchin', 'kommandos']) expect(list.units.some((e) => e.datasheetId === id), `${limit} ${id}`).toBe(true)
    }
  })
})
