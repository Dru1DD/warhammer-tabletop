import { describe, expect, it } from 'vitest'
import { composeUnit } from '../army/armyList'
import { emanatusModels, inOnslaught } from '../engine'
import {
  alive, battlelineSupport, inSynapseRange, irradiated, ledUnitOf, neurostaticMod, newUnit, nobleLeads, psychicGuidance, warpField,
} from '../gameState'
import { modelsInZone, unitsCovered, zoneById, ZONES, zonesOf, zonesOn, type ZoneId } from '../rules/zones'
import type { GameState, PlayerId, UnitState, Vec } from '../types'
import { battle, column, place } from './helpers'

// The zone registry (rules/zones.ts) says who is in which aura or zone; the rules decide it in their own functions.
// Both must agree wherever the target stands.

function add(s: GameState, owner: PlayerId, datasheetId: string, at: Vec[], id: string): UnitState {
  const u = newUnit(id, datasheetId, owner, id, composeUnit(datasheetId, at.length).map((p, i) => [p, at[i]]))
  s.units.push(u)
  return u
}

/** An empty board of `a` against `b`. */
function empty(a: PlayerId, b: PlayerId) {
  const s = battle(a, b, 'shooting', a)
  for (const u of s.units) place(s, u.id, [])
  return s
}

/** Moves `t` (a column of models, first at x) from right next to the source to well out of range, 0.37″ at a time. */
function sweep(s: GameState, t: UnitState, check: (x: number) => void) {
  const n = t.models.length
  for (let x = 6; x < 30; x += 0.37) {
    place(s, t.id, column(x, 8, n, 1.3))
    check(x)
  }
}

const hit = (s: GameState, t: UnitState, id: ZoneId) => zonesOn(s, t).find((h) => h.zone.id === id)

describe('zone registry agrees with the rules', () => {
  it('Rad-saturation: enemy non-vehicles within 3″ of Skitarii Vanguard', () => {
    const s = empty('adeptus_mechanicus', 'orks')
    add(s, 'adeptus_mechanicus', 'vanguard', column(4, 8, 5), 'zVanguard')
    const boyz = add(s, 'orks', 'boyz', column(10, 8, 5), 'zBoyz')
    let inside = 0
    sweep(s, boyz, () => {
      expect(!!hit(s, boyz, 'radSaturation')).toBe(irradiated(s, boyz))
      if (irradiated(s, boyz)) inside++
    })
    expect(inside).toBeGreaterThan(0)
  })

  it('Neurostatic Interference: −1, or −2 near friendly Battleline', () => {
    const s = empty('adeptus_mechanicus', 'orks')
    add(s, 'adeptus_mechanicus', 'sicarians', column(4, 8, 5), 'zSicarians')
    const boyz = add(s, 'orks', 'boyz', column(10, 8, 5), 'zBoyz')
    for (const rangersNear of [false, true]) {
      if (rangersNear) add(s, 'adeptus_mechanicus', 'rangers', column(2, 20, 10, 0.9), 'zRangers')
      sweep(s, boyz, () => {
        const mod = neurostaticMod(s, boyz)
        const h = hit(s, boyz, 'neurostaticInterference')
        expect(h?.badge ?? null).toBe(mod === -2 ? '−2 Ld' : mod === -1 ? '−1 Ld' : null)
      })
    }
  })

  it('Emanatus Force Field: exactly the Battleline models the rules protect', () => {
    const s = empty('adeptus_mechanicus', 'orks')
    const onager = add(s, 'adeptus_mechanicus', 'onager', [{ x: 3, y: 14 }], 'zOnager')
    const rangers = add(s, 'adeptus_mechanicus', 'rangers', column(10, 8, 10), 'zRangers')
    const z = zoneById('emanatusForceField')
    let partly = 0
    sweep(s, rangers, () => {
      const ids = modelsInZone(z, onager, rangers).map((m) => m.id).sort()
      expect(ids).toEqual(emanatusModels(s, rangers).sort())
      if (ids.length && ids.length < alive(rangers).length) partly++
    })
    expect(partly).toBeGreaterThan(0)
  })

  it('Onslaught, Warp Field and Synapse', () => {
    const s = empty('tyranids', 'marines')
    add(s, 'tyranids', 'hiveTyrant', [{ x: 3, y: 10 }], 'zTyrant')
    add(s, 'tyranids', 'zoanthropes', column(3, 18, 3), 'zZoanthropes')
    const gaunts = add(s, 'tyranids', 'termagants', column(10, 8, 10), 'zGaunts')
    sweep(s, gaunts, () => {
      expect(!!hit(s, gaunts, 'onslaught')).toBe(inOnslaught(s, gaunts))
      expect(!!hit(s, gaunts, 'warpField')).toBe(warpField(s, gaunts))
      expect(!!hit(s, gaunts, 'synapse')).toBe(inSynapseRange(s, gaunts))
    })
  })

  it('near Battleline: Kataphron Breachers re-roll every hit', () => {
    const s = empty('adeptus_mechanicus', 'orks')
    add(s, 'adeptus_mechanicus', 'rangers', column(3, 8, 10, 0.9), 'zRangers')
    const breachers = add(s, 'adeptus_mechanicus', 'breachers', column(10, 8, 3, 2.5), 'zBreachers')
    sweep(s, breachers, () => expect(!!hit(s, breachers, 'battleline')).toBe(battlelineSupport(s, breachers)))
  })

  it('Psychic Guidance: Wraithguard within 12″ of a Farseer', () => {
    const s = empty('aeldari', 'orks')
    add(s, 'aeldari', 'farseer', [{ x: 3, y: 10 }], 'zFarseer')
    const guard = add(s, 'aeldari', 'wraithguard', column(10, 8, 5, 1.8), 'zWraithguard')
    sweep(s, guard, () => expect(!!hit(s, guard, 'psychicGuidance')).toBe(psychicGuidance(s, guard)))
  })

  it('leaders: the Tech-Priest leads the nearest unit within 3″, a NOBLE guards Lychguard within 3″', () => {
    const s = empty('adeptus_mechanicus', 'orks')
    const dominus = add(s, 'adeptus_mechanicus', 'techDominus', [{ x: 4, y: 10 }], 'zDominus')
    const rangers = add(s, 'adeptus_mechanicus', 'rangers', column(10, 8, 10), 'zRangers')
    sweep(s, rangers, () => expect(!!hit(s, rangers, 'leader')).toBe(ledUnitOf(s, dominus)?.id === rangers.id))

    const n = empty('necrons', 'orks')
    add(n, 'necrons', 'overlord', [{ x: 4, y: 10 }], 'zOverlord')
    const guards = add(n, 'necrons', 'lychguard', column(10, 8, 5, 1.6), 'zLychguard')
    sweep(n, guards, () => expect(!!hit(n, guards, 'nobleLeader')).toBe(nobleLeads(n, guards)))
  })
})

describe('zone registry', () => {
  it('every aura of the game has a zone, with its range', () => {
    const auras = ZONES.filter((z) => z.kind === 'aura').map((z) => [z.id, z.radius, z.measure])
    expect(auras).toEqual([
      ['radSaturation', 3, 'edge'],
      ['neurostaticInterference', 6, 'edge'],
      ['emanatusForceField', 6, 'wholly'],
      ['onslaught', 6, 'edge'],
      ['warpField', 6, 'edge'],
    ])
  })

  it('a destroyed or embarked unit projects no zone; the explosion zone affects nobody until it happens', () => {
    const s = empty('adeptus_mechanicus', 'orks')
    const onager = add(s, 'adeptus_mechanicus', 'onager', [{ x: 3, y: 14 }], 'zOnager')
    const rangers = add(s, 'adeptus_mechanicus', 'rangers', column(5, 8, 10, 0.9), 'zRangers')
    expect(zonesOf(s, onager).map((z) => z.id).sort()).toEqual(['deadlyDemise', 'emanatusForceField'])
    expect(unitsCovered(s, zoneById('emanatusForceField'), onager).map((u) => u.id)).toEqual([rangers.id])
    expect(unitsCovered(s, zoneById('deadlyDemise'), onager)).toEqual([])
    place(s, onager.id, [])
    expect(zonesOf(s, onager)).toEqual([])
    expect(zonesOn(s, rangers)).toEqual([])
  })
})
