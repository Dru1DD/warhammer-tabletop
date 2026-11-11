import { describe, expect, it } from 'vitest'
import { listProblems, presetList, type ArmyList } from '../army/armyList'
import { PROFILES, WEAPONS } from '../data/datasheets'
import { fmtRandom, scriptedRoller } from '../dice/dice'
import { apply, maxMove, meleeSetup, shootPlan, validate } from '../engine'
import { alphaWarrior, invulnOverrideOf } from '../gameState'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, Phase, PlayerId, UnitState } from '../types'
import { endPhase, moveUnitTo } from './helpers'

// Winged Tyranid Prime, Zoanthropes, Carnifexes, Barbgaunts (11th edition, Wahapedia), see docs/tyranids.md.

const NIDS: ArmyList = {
  limit: 1000,
  units: [
    { datasheetId: 'wingedPrime', size: 1 },
    { datasheetId: 'tyranidWarriors', size: 3 },
    { datasheetId: 'zoanthropes', size: 3 },
    { datasheetId: 'carnifexes', size: 1 },
    { datasheetId: 'barbgaunts', size: 5 },
    { datasheetId: 'termagants', size: 10 },
  ],
}

/** Tyranids (west) against the Marine training roster (east), no terrain or objectives. */
function battle(phase: Phase = 'shooting', active: PlayerId = 'tyranids'): GameState {
  const s = scenarioById('combat-patrol').build(['marines', 'tyranids'], { tyranids: NIDS })
  s.terrain = []
  s.objectives = []
  s.phase = phase
  s.activePlayer = active
  s.firstPlayer = 'marines'
  return s
}
const byDs = (s: GameState, id: string): UnitState => s.units.find((u) => u.datasheetId === id)!

describe('Tyranid datasheets (11th edition)', () => {
  it('characteristics and bases', () => {
    const stats = (id: string) => { const p = PROFILES[id]; return [p.m, p.t, p.sv, p.w, p.ld, p.oc, p.invuln, p.baseMm] }
    expect(stats('wingedPrime')).toEqual([12, 5, 4, 6, 7, 1, undefined, 50])
    expect(stats('zoanthrope')).toEqual([5, 5, 5, 3, 7, 1, 4, 40])
    expect(stats('neurothrope')).toEqual([5, 5, 5, 3, 7, 1, 4, 40])
    expect(stats('carnifex')).toEqual([8, 9, 2, 8, 8, 3, undefined, 86]) // round base of the 105×70 mm oval's area
    expect(stats('barbgaunt')).toEqual([6, 4, 4, 2, 8, 1, undefined, 40])
  })

  it('weapons', () => {
    const w = (id: string, i = 0) => {
      const p = WEAPONS[id].profiles[i]
      return [p.range, fmtRandom(p.attacks, p.randomA), p.skill, p.s, p.ap, fmtRandom(p.d, p.randomD), p.keywords]
    }
    expect(w('primeTalons')).toEqual(['melee', '6', 2, 6, -1, '2', {}])
    expect(w('warpBlast')).toEqual([24, 'D3', 3, 7, -2, 'D3', { blast: 1, psychic: true }])
    expect(w('warpBlast', 1)).toEqual([24, '1', 3, 12, -3, 'D6+1', { lethalHits: true, psychic: true }])
    expect(w('carnifexTalons')).toEqual(['melee', '6', 4, 9, -2, '3', {}])
    expect(w('carnifexExtraTalons')).toEqual(['melee', '2', 4, 9, -2, '3', { extraAttacks: true }])
    expect(w('barblauncher')).toEqual([24, 'D6', 4, 5, 0, '1', { blast: 1, heavy: true }])
  })

  it('the units muster with their datasheet composition', () => {
    const s = battle()
    expect(byDs(s, 'zoanthropes').models.map((m) => m.profileId)).toEqual(['neurothrope', 'zoanthrope', 'zoanthrope'])
    expect(byDs(s, 'barbgaunts').models).toHaveLength(5)
    expect(listProblems('tyranids', NIDS)).toEqual([])
  })
})

describe('Warp Field (Zoanthropes)', () => {
  it('friendly Tyranids within 6″ have a 6+ invulnerable save, farther ones do not', () => {
    const s = battle()
    const zo = byDs(s, 'zoanthropes')
    const carnifex = byDs(s, 'carnifexes')
    moveUnitTo(s, zo.id, { x: 8, y: 6 })
    moveUnitTo(s, carnifex.id, { x: 8, y: 11 })
    expect(invulnOverrideOf(s, carnifex)).toBe(6)
    expect(invulnOverrideOf(s, zo)).toBe(6) // their own 4+ is better and still used
    moveUnitTo(s, carnifex.id, { x: 8, y: 25 })
    expect(invulnOverrideOf(s, carnifex)).toBeUndefined()
    expect(invulnOverrideOf(s, s.units.find((u) => u.owner === 'marines')!)).toBeUndefined()
  })
})

describe('Alpha Warrior (Winged Prime)', () => {
  it('within 3″ of Tyranid Warriors both get Sustained Hits 1', () => {
    const s = battle('fight')
    const prime = byDs(s, 'wingedPrime')
    const warriors = byDs(s, 'tyranidWarriors')
    moveUnitTo(s, warriors.id, { x: 8, y: 6 })
    prime.models[0].pos = { x: 8, y: 9.5 }
    expect(alphaWarrior(s, prime)).toBe(true)
    expect(alphaWarrior(s, warriors)).toBe(true)
    const target = s.units.find((u) => u.owner === 'marines')!
    const set = meleeSetup(s, prime, target, WEAPONS.primeTalons.profiles[0])
    expect(set.profile.keywords.sustainedHits).toBe(1)
    expect(set.notes).toContain('Alpha Warrior: Sustained Hits 1')
    // far away: no bonus
    prime.models[0].pos = { x: 8, y: 25 }
    expect(alphaWarrior(s, prime)).toBe(false)
    expect(alphaWarrior(s, warriors)).toBe(false)
    expect(meleeSetup(s, prime, target, WEAPONS.primeTalons.profiles[0]).profile.keywords.sustainedHits).toBeUndefined()
  })

  it('the bonus reaches the Warriors\' shooting', () => {
    const s = battle()
    const prime = byDs(s, 'wingedPrime')
    const warriors = byDs(s, 'tyranidWarriors')
    const int = s.units.find((u) => u.id === 'int')!
    moveUnitTo(s, warriors.id, { x: 14, y: 6 })
    prime.models[0].pos = { x: 14, y: 9.8 }
    moveUnitTo(s, int.id, { x: 30, y: 6 })
    const plan = shootPlan(s, warriors, int)
    expect(plan.groups.length).toBeGreaterThan(0)
    for (const g of plan.groups) expect(g.profile.keywords.sustainedHits, g.weaponName).toBeGreaterThanOrEqual(1)
  })
})

describe('Disruption Bombardment (Barbgaunts)', () => {
  /** Barbgaunts hit the Intercessors (INFANTRY) at 14″. */
  const shoot = () => {
    const s = battle()
    const bg = byDs(s, 'barbgaunts')
    const int = s.units.find((u) => u.id === 'int')!
    moveUnitTo(s, bg.id, { x: 12, y: 6 })
    moveUnitTo(s, int.id, { x: 26, y: 6 })
    const cmd = { type: 'shoot' as const, unitId: bg.id, targetId: int.id }
    expect(validate(s, cmd).ok).toBe(true)
    return { s, after: apply(s, cmd, scriptedRoller(Array(120).fill(4))), int }
  }

  it('a hit INFANTRY unit gets −2″ Move and −2 to Advance rolls', () => {
    const { s, after, int } = shoot()
    const t = after.units.find((u) => u.id === int.id)!
    expect(t.disrupted).toBe(true)
    expect(maxMove(s.units.find((u) => u.id === int.id)!)).toBe(6)
    expect(maxMove(t)).toBe(4)
    expect(maxMove({ ...t, advanceRoll: 5 })).toBe(4 + 3)
    expect(maxMove({ ...t, advanceRoll: 1 })).toBe(4)
  })

  it('and −2 to its Charge roll, until the end of its owner\'s next turn', () => {
    const { after, int } = shoot()
    // Marines' turn: charge with dice 4 + 4 = 8 − 2 = 6
    let s = after
    for (let i = 0; i < 20 && !(s.activePlayer === 'marines' && s.phase === 'charge'); i++) s = endPhase(s, scriptedRoller(Array(60).fill(3)))
    expect(s.units.find((u) => u.id === int.id)!.disrupted).toBe(true)
    const charged = apply(s, { type: 'declareCharge', unitId: int.id }, scriptedRoller([4, 4]))
    expect(charged.diceLog.at(-1)!.steps[0].note).toMatch(/дистанция атаки 6".*Disruption Bombardment/)
    // the end of the Marines' turn clears it
    let t = charged
    if (t.pendingCharge) t = apply(t, { type: 'skipCharge', unitId: int.id }, scriptedRoller([]))
    for (let i = 0; i < 10 && t.activePlayer === 'marines'; i++) t = apply(t, { type: 'endPhase' }, scriptedRoller(Array(60).fill(3)))
    expect(t.units.find((u) => u.id === int.id)!.disrupted).toBeUndefined()
  })

  it('does not affect MONSTER or VEHICLE targets', () => {
    const s = battle()
    const bg = byDs(s, 'barbgaunts')
    const red = s.units.find((u) => u.id === 'red')!
    moveUnitTo(s, bg.id, { x: 12, y: 20 })
    moveUnitTo(s, red.id, { x: 26, y: 20 })
    const after = apply(s, { type: 'shoot', unitId: bg.id, targetId: red.id }, scriptedRoller(Array(120).fill(4)))
    expect(after.units.find((u) => u.id === red.id)!.disrupted).toBeUndefined()
  })
})

describe('Tyranid presets with the new units', () => {
  it('both presets use the new units and stay legal', () => {
    for (const limit of [500, 1000] as const) {
      const list = presetList('tyranids', limit)
      expect(listProblems('tyranids', list)).toEqual([])
      for (const id of ['wingedPrime', 'zoanthropes', 'carnifexes', 'barbgaunts']) expect(list.units.some((e) => e.datasheetId === id), `${limit} ${id}`).toBe(true)
    }
  })
})
