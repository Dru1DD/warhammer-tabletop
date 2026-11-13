import { describe, expect, it } from 'vitest'
import { listUnits, musterArmy } from '../army/placement'
import { composeUnit, type ArmyList } from '../army/armyList'
import { rollDie, seededRoller } from '../dice/dice'
import { apply, isDamaged, shootPlan, validate } from '../engine'
import { alive, feelNoPainOf, newUnit, radiusOf } from '../gameState'
import { dist } from '../geometry/geometry'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, UnitState, Vec } from '../types'
import { battle, column, place } from './helpers'

// Serberys Sulphurhounds, Ironstrider Ballistarii, Onager Dunecrawler, Corpuscarii Electro-Priests (11th edition).

/** A Mechanicus unit of `datasheetId` added to a bare Mechanicus-vs-Orks battle at the given positions. */
function add(s: GameState, datasheetId: string, size: number, at: Vec[], id = datasheetId): UnitState {
  const profiles = composeUnit(datasheetId, size)
  const u = newUnit(id, datasheetId, 'adeptus_mechanicus', id, profiles.map((p, i) => [p, at[i] ?? at[at.length - 1]]))
  s.units.push(u)
  return u
}

/** Mechanicus against Orks with every pre-built unit off the board but the Boyz (and Rangers when `rangers`). */
function bare(phase: GameState['phase'], rangers = false) {
  const s = battle('adeptus_mechanicus', 'orks', phase, 'adeptus_mechanicus')
  const boyz = s.units.find((u) => u.owner === 'orks' && u.datasheetId === 'boyz')!
  const keepRangers = rangers ? s.units.find((u) => u.datasheetId === 'rangers') : undefined
  for (const u of s.units) if (u !== boyz && u !== keepRangers) place(s, u.id, [])
  place(s, boyz.id, column(30, 4, 10, 1.2))
  return { s, boyz, rangers: keepRangers }
}

describe('new Adeptus Mechanicus units', () => {
  it('3D3 attacks roll 3 to 9', () => {
    const r = seededRoller(1)
    const rolls = Array.from({ length: 400 }, () => rollDie(r, '3D3'))
    expect(Math.min(...rolls)).toBe(3)
    expect(Math.max(...rolls)).toBe(9)
  })

  it('Ironstrider Ballistarii shoot every weapon after an Advance, and after Falling Back (Elevated Strider)', () => {
    const { s, boyz } = bare('shooting')
    const strider = add(s, 'ironstriders', 1, [{ x: 10, y: 8 }])
    strider.move = 'advance'
    const plan = shootPlan(s, strider, boyz)
    expect(plan.problem).toBeNull()
    expect(plan.groups.map((g) => g.weaponName).join()).toMatch(/автопушка/)
    strider.move = 'fallBack'
    expect(validate(s, { type: 'shoot', unitId: strider.id, targetId: boyz.id }).ok).toBe(true)
  })

  it('a damaged Onager (4 wounds or fewer) hits at −1', () => {
    const { s, boyz } = bare('shooting')
    const onager = add(s, 'onager', 1, [{ x: 10, y: 8 }])
    expect(isDamaged(onager)).toBe(false)
    const full = shootPlan(s, onager, boyz).groups[0].ctx.hitMod
    onager.models[0].wounds = 4
    expect(isDamaged(onager)).toBe(true)
    expect(shootPlan(s, onager, boyz).groups[0].ctx.hitMod).toBe(full - 1)
  })

  it('the Onager\'s force field gives each friendly Battleline model wholly within 6″ a 4+ invulnerable save against shooting', () => {
    const { s, boyz, rangers } = bare('shooting', true)
    place(s, rangers!.id, column(14, 4, 10))
    s.activePlayer = 'orks'
    const before = shootPlan(s, boyz, rangers!).groups
    expect(before.every((g) => g.ctx.invulnOverride === undefined && g.ctx.invulnByModel === undefined)).toBe(true)
    const onager = add(s, 'onager', 1, [{ x: 8, y: 10 }])
    const groups = shootPlan(s, boyz, rangers!).groups
    // the force field is per model: the unit as a whole gets nothing, the models wholly within 6″ get 4+
    expect(groups.every((g) => g.ctx.invulnOverride === undefined)).toBe(true)
    const covered = new Set(Object.entries(groups[0].ctx.invulnByModel ?? {}).filter(([, v]) => v === 4).map(([id]) => id))
    const o = alive(onager)[0]
    for (const m of alive(rangers!)) expect(covered.has(m.id), m.id).toBe(dist(m.pos, o.pos) + radiusOf(m) - radiusOf(o) <= 6 + 1e-6)
    // the column reaches past the field: some Rangers are covered, some are not
    expect(covered.size).toBeGreaterThan(0)
    expect(covered.size).toBeLessThan(10)
    // a model only partly within 6″ is not covered, although the unit is within 6″
    const partly = alive(rangers!).find((m) => !covered.has(m.id) && dist(m.pos, o.pos) - radiusOf(m) - radiusOf(o) <= 6)
    expect(partly).toBeDefined()
  })

  it('Electro-Priests: Feel No Pain 5+, and the infantry they hit is shocked (−2″ Move, −2 to Advance and Charge)', () => {
    const { s, boyz } = bare('shooting')
    const priests = add(s, 'electroPriests', 10, column(24, 4, 10))
    expect(feelNoPainOf(s, priests)).toBe(5)
    const after = apply(s, { type: 'shoot', unitId: priests.id, targetId: boyz.id }, seededRoller(3))
    expect(after.units.find((u) => u.id === boyz.id)!.disrupted).toBe(true)
  })

  it('Sulphurhounds: mortal wounds on the charged unit when the charge move ends (Line-breakers)', () => {
    const { s, boyz } = bare('charge')
    const hounds = add(s, 'sulphurhounds', 6, column(25.5, 4, 6, 2.2))
    s.pendingCharge = { unitId: hounds.id, roll: 12, dice: [6, 6], targets: [boyz.id] }
    hounds.chargeDeclared = true
    const after = apply(s, { type: 'chargeMove', unitId: hounds.id, targetIds: [boyz.id] }, seededRoller(5))
    expect(after.diceLog.some((d) => d.title.startsWith('Прорыв строя'))).toBe(true)
  })

  it('a Stratagem on Ironstriders gives back 1 CP on a 5+ (Broad Spectrum Data-tether)', () => {
    const { s } = bare('shooting')
    const strider = add(s, 'ironstriders', 1, [{ x: 10, y: 8 }])
    s.players.adeptus_mechanicus.cp = 3
    const after = apply(s, { type: 'stratagem', id: 'lethalDosage', unitId: strider.id }, seededRoller(2))
    expect(after.diceLog.some((d) => d.title.startsWith('Канал данных'))).toBe(true)
  })

  it('an army with all four new units musters legally', () => {
    const s = scenarioById('combat-patrol').build(['adeptus_mechanicus', 'orks'])
    s.units = s.units.filter((u) => u.owner !== 'adeptus_mechanicus')
    const list: ArmyList = { limit: 1000, units: [
      { datasheetId: 'sulphurhounds', size: 6, loadout: { counts: { sulphurhoundCarbine: 2 } } },
      { datasheetId: 'ironstriders', size: 2, loadout: { counts: { ironstriderLascannon: 1 } } },
      { datasheetId: 'onager', size: 1, loadout: { counts: { onagerNeutron: 1 } } },
      { datasheetId: 'electroPriests', size: 10 },
    ] }
    expect(listUnits('adeptus_mechanicus', list).map((u) => u.models.length)).toEqual([6, 2, 1, 10])
    musterArmy(s, 'adeptus_mechanicus', list)
    expect(s.units.filter((u) => u.owner === 'adeptus_mechanicus').map((u) => u.datasheetId)).toEqual(['sulphurhounds', 'ironstriders', 'onager', 'electroPriests'])
    expect(s.units.find((u) => u.datasheetId === 'onager')!.models[0].profileId).toBe('onagerNeutron')
  })
})
