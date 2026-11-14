import { describe, expect, it } from 'vitest'
import { attachments, composeUnit, listProblems, listPoints, presetList, withoutEntry, PRESETS, type ArmyList } from '../army/armyList'
import { decodeArmy, encodeArmy } from '../army/armyCode'
import { listUnits } from '../army/placement'
import { armyPoints } from '../data/points'
import { meleePlan, shootPlan, shockFailChance } from '../engine'
import { pickModelForDamage } from '../combat/attack'
import {
  alive, atHalfStrength, attackToughness, feelNoPainOf, hasAbility, hasAbilityAll, hasKeyword, isDestroyed, isLed, leadingAbility, newUnit, profileOf,
} from '../gameState'
import { attachUnit } from '../rules/attached'
import { canDeepStrike } from '../rules/reserves'
import { FACTIONS, type GameState, type PlayerId, type UnitState, type Vec } from '../types'
import { battle, column } from './helpers'

// Attached units (core rules 19): a Leader or Support character joins a bodyguard unit before the battle and the two
// are one unit for every rule (rules/attached.ts, docs/leaders.md).

const entry = (datasheetId: string, size: number, attachTo?: number | null) => ({ datasheetId, size, ...(attachTo !== undefined ? { attachTo } : {}) })
const list = (...units: ReturnType<typeof entry>[]): ArmyList => ({ limit: 2000, units })

/** A unit of `datasheetId` with one model at each position. */
function make(owner: PlayerId, datasheetId: string, at: Vec[], id: string): UnitState {
  return newUnit(id, datasheetId, owner, id, composeUnit(datasheetId, at.length).map((p, i) => [p, at[i]]))
}

/** A board of `a` against `b` with only the given units (ids must not be the scenario's: theirs are removed). */
function board(a: PlayerId, b: PlayerId, phase: GameState['phase'] = 'shooting', ...units: UnitState[]): GameState {
  const s = battle(a, b, phase, a)
  s.units = units
  return s
}

describe('the army list: who joins whom', () => {
  it('each character joins a unit of its list; one with no character yet first, then the biggest', () => {
    const l = list(entry('techDominus', 1), entry('techManipulus', 1), entry('rangers', 10), entry('breachers', 3), entry('vanguard', 10))
    expect(attachments(l)).toEqual([2, 4, null, null, null])
  })

  it('a unit takes one Leader and one Support: Captain and Lieutenant may share the Intercessors', () => {
    const l = list(entry('captain', 1), entry('lieutenant', 1), entry('intercessors', 10))
    expect(attachments(l)).toEqual([2, 2, null])
    const two = list(entry('captain', 1), entry('captain', 1), entry('intercessors', 10))
    expect(attachments(two)).toEqual([2, null, null])
  })

  it('a player’s choice wins; null keeps the character on its own; an illegal choice is reported', () => {
    const l = list(entry('techDominus', 1, 3), entry('rangers', 10), entry('kastelans', 2), entry('breachers', 3))
    expect(attachments(l)).toEqual([3, null, null, null])
    expect(attachments({ ...l, units: [entry('techDominus', 1, null), ...l.units.slice(1)] })).toEqual([null, null, null, null])
    const bad = { ...l, units: [entry('techDominus', 1, 2), ...l.units.slice(1)] } // Kastelans are not on the Tech-Priest's list
    expect(attachments(bad)[0]).toBeNull()
    expect(listProblems('adeptus_mechanicus', bad).join(' ')).toMatch(/Доминус/)
  })

  it('a Support character must join a unit', () => {
    const alone = list(entry('lieutenant', 1), entry('redemptor', 1))
    expect(listProblems('marines', alone).some((p) => /Лейтенант/.test(p))).toBe(true)
    expect(listProblems('marines', list(entry('lieutenant', 1), entry('hellblasters', 5)))).toEqual([])
  })

  it('removing a unit keeps the other choices pointing at the same units', () => {
    const l = list(entry('rangers', 10), entry('techDominus', 1, 2), entry('vanguard', 10))
    const after = withoutEntry(l, 0)
    expect(after.units[0]).toEqual(entry('techDominus', 1, 1))
    expect(withoutEntry(after, 1).units[0]).toEqual(entry('techDominus', 1)) // its unit is gone: the game picks again
  })

  it('the army code keeps the choice', () => {
    const l = list(entry('techDominus', 1, 2), entry('rangers', 10), entry('vanguard', 10), entry('techManipulus', 1, null))
    const back = decodeArmy(encodeArmy('adeptus_mechanicus', l))
    expect(back.ok && back.list.units).toEqual(l.units)
  })

  it('every preset is legal and every Support character in it joins a unit', () => {
    for (const f of FACTIONS)
      for (const limit of Object.keys(PRESETS[f]).map(Number) as (keyof (typeof PRESETS)[PlayerId])[]) {
        const l = presetList(f, limit)
        expect(listProblems(f, l), `${f} ${limit}`).toEqual([])
        const units = listUnits(f, l)
        expect(armyPoints(units).points, `${f} ${limit}: the attached units cost what the list does`).toBe(listPoints(l))
      }
  })
})

describe('an attached unit is one unit', () => {
  const rangersLed = () => {
    const [u] = listUnits('adeptus_mechanicus', list(entry('techDominus', 1), entry('rangers', 10)))
    return u
  }

  it('it is mustered as one unit: the bodyguard’s datasheet, the character’s models, a starting strength of 11', () => {
    const u = rangersLed()
    expect(u.datasheetId).toBe('rangers')
    expect(u.startingModels).toBe(11)
    expect(u.attached).toEqual([{ datasheetId: 'techDominus', kind: 'leader', models: [u.models[10].id] }])
    expect(u.name).toMatch(/рейнджеры \+ .*Доминус/i)
  })

  it('has the keywords and abilities of both parts, while each has a living model', () => {
    const u = rangersLed()
    expect(hasKeyword(u, 'CHARACTER')).toBe(true)
    expect(hasKeyword(u, 'BATTLELINE')).toBe(true)
    expect(hasAbility(u, 'dataSpike')).toBe(true)
    expect(leadingAbility(u, 'lordOfMachineCult')).toBe(true)
    u.models[10].destroyed = true // the Dominus falls: its abilities and keywords go with it
    expect(hasKeyword(u, 'CHARACTER')).toBe(false)
    expect(hasAbility(u, 'dataSpike')).toBe(false)
    expect(isLed(u)).toBe(false)
  })

  it('attacks use the bodyguard’s Toughness, the character’s once no bodyguard is left (19.02)', () => {
    const s = board('adeptus_mechanicus', 'marines', 'shooting',
      attachUnit(make('adeptus_mechanicus', 'breachers', column(10, 8, 3, 2.5), 'b'), make('adeptus_mechanicus', 'techDominus', [{ x: 12.5, y: 10.5 }], 'd')))
    const u = s.units.find((x) => x.id === 'b')!
    expect(attackToughness(u)).toBe(7)
    for (const m of u.models.slice(0, 3)) m.destroyed = true
    expect(attackToughness(u)).toBe(4)
  })

  it('it is destroyed only with its last model, and below half once the bodyguard is gone', () => {
    const u = rangersLed()
    for (const m of u.models.slice(0, 10)) m.destroyed = true
    expect(isDestroyed(u)).toBe(false)
    expect(atHalfStrength(u)).toBe(true)
    // the leader keeps its "while leading" abilities after its bodyguard is destroyed (19.04)
    expect(feelNoPainOf({} as GameState, u)).toBe(5)
  })

  it('Lord of the Machine Cult: Feel No Pain 5+ for the unit, 4+ for Electro-Priests, none for a Dominus on its own', () => {
    expect(feelNoPainOf({} as GameState, rangersLed())).toBe(5)
    const [ep] = listUnits('adeptus_mechanicus', list(entry('techDominus', 1), entry('electroPriests', 5)))
    expect(feelNoPainOf({} as GameState, ep)).toBe(4)
    const [alone] = listUnits('adeptus_mechanicus', list(entry('techDominus', 1, null)))
    expect(feelNoPainOf({} as GameState, alone)).toBeUndefined()
  })

  it('Deep Strike only when every model has it: a Winged Prime leading Tyranid Warriors cannot (24.09)', () => {
    const [led] = listUnits('tyranids', list(entry('wingedPrime', 1), entry('tyranidWarriors', 3)))
    expect(hasAbility(led, 'deepStrike')).toBe(true)
    expect(hasAbilityAll(led, 'deepStrike')).toBe(false)
    expect(canDeepStrike(led)).toBe(false)
    const [alone] = listUnits('tyranids', list(entry('wingedPrime', 1, null)))
    expect(canDeepStrike(alone)).toBe(true)
  })

  it('the Battle-shock test uses the best Leadership in the unit', () => {
    const s = board('orks', 'marines', 'command', ...listUnits('orks', list(entry('warboss', 1), entry('boyz', 10))))
    const u = s.units.find((x) => x.id === 'boyz-1')!
    expect(alive(u).map((m) => profileOf(m).ld).sort()).toEqual([6, ...Array(10).fill(7)]) // the Warboss has Ld 6+, the Boyz 7+
    expect(shockFailChance(s, u)).toBeCloseTo(10 / 36, 5) // fails only on 2D6 of 5 or less
  })
})

describe('abilities of "this model" stay with the character', () => {
  it('Might Is Right: +3 A and +2 S for the Warboss’s attacks only', () => {
    const boyz = make('orks', 'boyz', column(10, 8, 10, 1.1), 'boyz')
    const boss = make('orks', 'warboss', [{ x: 11.2, y: 8 }], 'boss')
    const s = board('orks', 'marines', 'fight', attachUnit(boyz, boss), make('marines', 'intercessors', column(12.2, 8, 5, 1.1), 'int'))
    const u = s.units.find((x) => x.id === 'boyz')!
    u.charged = true
    const groups = meleePlan(s, u, s.units.find((x) => x.id === 'int')!)
    const boss1 = groups.filter((g) => g.notes.some((n) => n.includes('Might Is Right')))
    expect(boss1.length).toBeGreaterThan(0)
    expect(boss1.every((g) => g.models === 1)).toBe(true)
    expect(groups.filter((g) => !g.notes.some((n) => n.includes('Might Is Right'))).length).toBeGreaterThan(0)
  })

  it('Implacable Resilience: −1 Damage only for attacks allocated to the Overlord', () => {
    const war = make('necrons', 'lychguard', column(20, 8, 5, 1.6), 'lg')
    const ov = make('necrons', 'overlord', [{ x: 21.6, y: 8 }], 'ov')
    const s = board('marines', 'necrons', 'shooting', make('marines', 'hellblasters', column(8, 8, 5, 1.4), 'hb'), attachUnit(war, ov))
    const plan = shootPlan(s, s.units.find((x) => x.id === 'hb')!, s.units.find((x) => x.id === 'lg')!)
    expect(plan.problem).toBeNull()
    for (const g of plan.groups) {
      expect(g.ctx.damageMod ?? 0).toBe(0)
      expect(g.ctx.damageModByModel).toEqual({ [ov.models[0].id]: -1 })
    }
  })

  it('Guardian Protocols: −1 to wound while the Overlord leads the Lychguard', () => {
    const war = make('necrons', 'lychguard', column(20, 8, 5, 1.6), 'lg')
    const ov = make('necrons', 'overlord', [{ x: 21.6, y: 8 }], 'ov')
    const s = board('marines', 'necrons', 'shooting', make('marines', 'hellblasters', column(8, 8, 5, 1.4), 'hb'), attachUnit(war, ov))
    const hb = s.units.find((x) => x.id === 'hb')!, lg = s.units.find((x) => x.id === 'lg')!
    expect(shootPlan(s, hb, lg).groups.every((g) => g.ctx.woundMod === -1)).toBe(true) // plasma S8 beats T5
    ov.models[0].destroyed = true // the same model object is in the attached unit
    expect(shootPlan(s, hb, lg).groups.some((g) => g.ctx.woundMod === -1)).toBe(false)
  })

  it('wounds go to the bodyguard before the character, unless Precision picks it', () => {
    const u = attachUnit(make('adeptus_mechanicus', 'rangers', column(20, 8, 2, 1.1), 'r'), make('adeptus_mechanicus', 'techDominus', [{ x: 21.5, y: 8.5 }], 'd'))
    expect(pickModelForDamage(u)?.id).toBe(u.models[0].id)
    u.models[0].destroyed = true
    expect(pickModelForDamage(u)?.id).toBe(u.models[1].id)
    expect(pickModelForDamage(u, true)?.id).toBe(u.models[2].id)
  })
})
