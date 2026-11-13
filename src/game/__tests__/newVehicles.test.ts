import { describe, expect, it } from 'vitest'
import { composeUnit, listProblems, parseArmyList, presetList, type ArmyList } from '../army/armyList'
import { decide } from '../ai/ai'
import { listUnits } from '../army/placement'
import { loadoutOf, loadoutProblems, WARGEAR } from '../army/wargear'
import { TOKENS } from '../../assets/manifest'
import { portraitFor } from '../../assets/tokenArt'
import { ABILITY_TEXT, DATASHEETS, PROFILES, WEAPONS } from '../data/datasheets'
import { POINTS } from '../data/points'
import { slotCombos, slotProfileId, VEHICLE_DATASHEETS, VEHICLE_SLOTS } from '../data/vehicles'
import { avgDie, rollDie, seededRoller } from '../dice/dice'
import { apply, isDamaged, shootPlan, startGame, validate } from '../engine'
import { scenarioById } from '../scenarios/scenarios'
import { hasKeyword, newUnit, unitKeywords } from '../gameState'
import { carryProblem, embark } from '../rules/transports'
import { meetsRequirement, STRATAGEMS } from '../rules/stratagems'
import type { GameState, PlayerId, UnitState, Vec } from '../types'
import { battle, column, place } from './helpers'

// Rhino, Predator Annihilator, Trukk, Battlewagon, Ghost Ark, Doomsday Ark, Wave Serpent, Fire Prism, Exocrine and
// Tyrannofex (11th edition, Wahapedia 13.11.2026), the optional wargear of single-model vehicles, and the Onager's.

const NEW = ['rhino', 'predatorAnnihilator', 'trukk', 'battlewagon', 'ghostArk', 'doomsdayArk', 'waveSerpent', 'firePrism', 'exocrine', 'tyrannofex']

/** A unit of `datasheetId` for `owner` at `at`, with these model profiles (default: its default composition). */
function add(s: GameState, owner: PlayerId, datasheetId: string, at: Vec[], profiles = composeUnit(datasheetId, at.length), id = datasheetId): UnitState {
  const u = newUnit(id, datasheetId, owner, id, profiles.map((p, i) => [p, at[i] ?? at[at.length - 1]]))
  s.units.push(u)
  return u
}

/** A battle of `west` against `east` with every pre-built unit off the board. */
function empty(west: PlayerId, east: PlayerId, phase: GameState['phase'] = 'shooting') {
  const s = battle(west, east, phase, west)
  for (const u of s.units) place(s, u.id, [])
  return s
}

describe('new vehicles and monsters: data', () => {
  it('every datasheet has its faction, points, composition, token, portrait, ability texts and weapons', () => {
    expect(Object.keys(VEHICLE_DATASHEETS).sort()).toEqual([...NEW].sort())
    for (const id of NEW) {
      const d = DATASHEETS[id]
      expect(POINTS[id], id).toBeDefined()
      expect(composeUnit(id, 1), id).toEqual([id])
      expect(TOKENS[id], id).toBeDefined()
      expect(portraitFor(id), id).toBeDefined()
      for (const a of d.abilities) expect(ABILITY_TEXT[a], `${id}: ${a}`).toMatch(/[а-яА-Я]/)
      for (const w of PROFILES[id].weapons) expect(WEAPONS[w], `${id}: ${w}`).toBeDefined()
      expect(d.keywords.includes('VEHICLE') || d.keywords.includes('MONSTER'), id).toBe(true)
    }
  })

  it('every slot combination of every vehicle is a profile with existing weapons and a token', () => {
    for (const [id, v] of Object.entries(VEHICLE_SLOTS))
      for (const b of v.bases)
        for (const combo of slotCombos(v.slots)) {
          const p = PROFILES[slotProfileId(b, combo)]
          expect(p, `${id}: ${slotProfileId(b, combo)}`).toBeDefined()
          for (const w of p.weapons) expect(WEAPONS[w], `${p.id}: ${w}`).toBeDefined()
          expect(TOKENS[p.id], p.id).toBeDefined()
          expect(portraitFor(p.id), p.id).toBeDefined()
        }
  })

  it('2D6 attacks roll 2 to 12, 7 on average', () => {
    const r = seededRoller(3)
    const rolls = Array.from({ length: 600 }, () => rollDie(r, '2D6'))
    expect(Math.min(...rolls)).toBe(2)
    expect(Math.max(...rolls)).toBe(12)
    expect(avgDie('2D6')).toBe(7)
  })

  it('the Onager eradication beamer, dissipated, is S9 as on the datasheet', () => {
    expect(WEAPONS.eradicationBeamer.profiles[0].s).toBe(9)
  })
})

describe('optional wargear slots', () => {
  it('a Battlewagon with three big shootas and a wreckin’ ball', () => {
    const loadout = { counts: {}, slots: { shootas: 'Shoota3', ball: 'Ball' } }
    expect(loadoutProblems('battlewagon', 1, loadout)).toEqual([])
    const [p] = composeUnit('battlewagon', 1, loadout)
    expect(p).toBe('battlewagonShoota3Ball')
    expect(PROFILES[p].weapons).toEqual(['crushinBulk', 'wagonBigShootaX3', 'wreckinBall'])
    expect(WEAPONS.wagonBigShootaX3.profiles[0]).toMatchObject({ attacks: 9, keywords: { rapidFire: 6 } })
    expect(loadoutOf(WARGEAR.battlewagon, [p])).toEqual(loadout)
  })

  it('a Predator swaps its lascannons for heavy bolters; an unknown choice is an error', () => {
    const [p] = composeUnit('predatorAnnihilator', 1, { counts: {}, slots: { sponsons: 'Hb', hk: 'Hk' } })
    expect(PROFILES[p].weapons).toEqual(['predatorTwinLascannon', 'armouredTracks', 'predatorHeavyBolterX2', 'hunterKillerMissile'])
    expect(loadoutProblems('predatorAnnihilator', 1, { counts: {}, slots: { sponsons: 'Plasma' } })).toHaveLength(1)
  })

  it('the Onager: its main weapon and both extras together; two stubbers become one weapon', () => {
    const loadout = { counts: { onagerNeutron: 1 }, slots: { stubber: 'Stubber', tether: 'Tether' } }
    expect(loadoutProblems('onager', 1, loadout)).toEqual([])
    const [p] = composeUnit('onager', 1, loadout)
    expect(p).toBe('onagerNeutronStubberTether')
    expect(PROFILES[p].weapons).toEqual(['neutronLaser', 'cognisHeavyStubberX2', 'dunecrawlerLegs'])
    expect(WEAPONS.cognisHeavyStubberX2.profiles[0]).toMatchObject({ attacks: 6, keywords: { rapidFire: 6, sustainedHits: 1 } })
    expect(PROFILES[p].wargear).toEqual(['dataTether'])
    expect(loadoutOf(WARGEAR.onager, [p])).toEqual(loadout)
  })

  it('a data-tethered Onager loses SMOKE, so Smokescreen cannot target it', () => {
    const s = empty('adeptus_mechanicus', 'orks')
    const plain = add(s, 'adeptus_mechanicus', 'onager', [{ x: 10, y: 10 }], ['onager'], 'o1')
    const tethered = add(s, 'adeptus_mechanicus', 'onager', [{ x: 20, y: 10 }], ['onagerTether'], 'o2')
    expect(meetsRequirement(plain, STRATAGEMS.smokescreen)).toBe(true)
    expect(hasKeyword(tethered, 'SMOKE')).toBe(false)
    expect(unitKeywords(tethered)).not.toContain('SMOKE')
    expect(meetsRequirement(tethered, STRATAGEMS.smokescreen)).toBe(false)
  })

  it('an army list keeps the slots through storage and musters the vehicle with its wargear', () => {
    const list: ArmyList = { limit: 1000, units: [{ datasheetId: 'waveSerpent', size: 1, loadout: { counts: {}, slots: { turret: 'Lance' } } }] }
    expect(parseArmyList(JSON.parse(JSON.stringify(list)))).toEqual(list)
    const [u] = listUnits('aeldari', list)
    expect(u.models.map((m) => m.profileId)).toEqual(['waveSerpentLance'])
    expect(PROFILES.waveSerpentLance.weapons).toContain('twinBrightLance')
  })
})

describe('new vehicle rules', () => {
  it('damaged at 1–5 (Doomsday Ark) and 1–6 (Battlewagon) wounds', () => {
    const s = empty('necrons', 'orks')
    const ark = add(s, 'necrons', 'doomsdayArk', [{ x: 10, y: 10 }])
    const wagon = add(s, 'orks', 'battlewagon', [{ x: 40, y: 10 }])
    ark.models[0].wounds = 6
    wagon.models[0].wounds = 7
    expect([isDamaged(ark), isDamaged(wagon)]).toEqual([false, false])
    ark.models[0].wounds = 5
    wagon.models[0].wounds = 6
    expect([isDamaged(ark), isDamaged(wagon)]).toEqual([true, true])
  })

  it('Wave Serpent Shield: −1 to wound when Strength beats Toughness; Mobile Fortress: −1 Damage', () => {
    const s = empty('marines', 'aeldari')
    const predator = add(s, 'marines', 'predatorAnnihilator', [{ x: 10, y: 20 }])
    const serpent = add(s, 'aeldari', 'waveSerpent', [{ x: 30, y: 20 }])
    const lances = shootPlan(s, predator, serpent).groups.find((g) => g.profile.s > 9)!
    expect(lances.ctx.woundMod).toBe(-1)
    const s2 = empty('marines', 'orks')
    const p2 = add(s2, 'marines', 'predatorAnnihilator', [{ x: 10, y: 20 }])
    const wagon = add(s2, 'orks', 'battlewagon', [{ x: 30, y: 20 }])
    expect(shootPlan(s2, p2, wagon).groups.every((g) => g.ctx.damageMod === -1)).toBe(true)
  })

  it('Overwhelming Obliteration: the doomsday cannon has Devastating Wounds only if the Ark stood still', () => {
    const s = empty('necrons', 'orks')
    const ark = add(s, 'necrons', 'doomsdayArk', [{ x: 10, y: 20 }])
    const boyz = add(s, 'orks', 'boyz', column(40, 18, 10, 1.2), composeUnit('boyz', 10))
    const cannon = () => shootPlan(s, ark, boyz).groups.find((g) => /судного дня/.test(g.weaponName))!
    ark.move = 'none'
    expect(cannon().profile.keywords.devastatingWounds).toBe(true)
    ark.move = 'normal'
    expect(cannon().profile.keywords.devastatingWounds).toBeFalsy()
  })

  it('transports: a Ghost Ark takes Necron Warriors and an Overlord, not Immortals; Wraithguard take 2 places in a Wave Serpent', () => {
    const s = empty('necrons', 'aeldari', 'movement')
    const ark = add(s, 'necrons', 'ghostArk', [{ x: 10, y: 10 }])
    const warriors = add(s, 'necrons', 'necronWarriors', column(20, 10, 10, 1.2), composeUnit('necronWarriors', 10))
    const overlord = add(s, 'necrons', 'overlord', [{ x: 14, y: 20 }])
    const immortals = add(s, 'necrons', 'immortals', column(30, 10, 5, 1.2), composeUnit('immortals', 5))
    expect(carryProblem(s, warriors, ark)).toBeNull()
    expect(carryProblem(s, immortals, ark)).toMatch(/воинов-некронов/)
    embark(s, warriors.id, ark.id, true)
    expect(carryProblem(s, overlord, ark)).toBeNull()

    const serpent = add(s, 'aeldari', 'waveSerpent', [{ x: 50, y: 30 }])
    const guards = add(s, 'aeldari', 'wraithguard', column(60, 30, 5, 1.6), composeUnit('wraithguard', 5))
    const avengers = add(s, 'aeldari', 'direAvengers', column(60, 40, 5, 1.2), composeUnit('direAvengers', 5))
    expect(carryProblem(s, guards, serpent)).toBeNull()
    embark(s, guards.id, serpent.id, true)
    expect(carryProblem(s, avengers, serpent)).toMatch(/5\D+2\D+12/)
  })

  // the 500-point preset plus the army's new vehicles, each with the last choice of every slot
  const withVehicles = (faction: PlayerId): ArmyList => {
    const list = presetList(faction, 500)
    const extra = Object.values(VEHICLE_DATASHEETS).filter((d) => d.faction === faction).map((d) => d.id)
    if (faction === 'adeptus_mechanicus') extra.push('onager')
    for (const id of extra) {
      const slots = Object.fromEntries((VEHICLE_SLOTS[id]?.slots ?? []).map((sl) => [sl.id, sl.choices[sl.choices.length - 1].id]))
      list.units.push({ datasheetId: id, size: 1, ...(VEHICLE_SLOTS[id] ? { loadout: { counts: {}, slots } } : {}) })
    }
    return { ...list, limit: 1000 }
  }
  for (const [a, b] of [['marines', 'orks'], ['necrons', 'aeldari'], ['tyranids', 'adeptus_mechanicus']] as [PlayerId, PlayerId][])
    it(`${a} against ${b} with the new vehicles: every AI command stays legal`, { timeout: 120_000 }, () => {
      const lists = { [a]: withVehicles(a), [b]: withVehicles(b) }
      expect(listProblems(a, lists[a]!)).toEqual([])
      expect(listProblems(b, lists[b]!)).toEqual([])
      let s: GameState = startGame(scenarioById('combat-patrol').build([a, b], lists), seededRoller(11))
      for (let i = 0; i < 400 && !s.winner; i++) {
        const d = decide(s, 'standard')
        if (!d) break
        expect(validate(s, d.cmd).ok, JSON.stringify(d.cmd)).toBe(true)
        s = apply(s, d.cmd, seededRoller(s.rng))
      }
      expect(s.round).toBeGreaterThanOrEqual(2)
    })

  it('a Rhino carries Intercessors, a Trukk carries Boyz', () => {
    const s = empty('marines', 'orks', 'movement')
    const rhino = add(s, 'marines', 'rhino', [{ x: 10, y: 10 }])
    const squad = add(s, 'marines', 'intercessors', column(20, 10, 5, 1.2), composeUnit('intercessors', 5))
    expect(carryProblem(s, squad, rhino)).toBeNull()
    const trukk = add(s, 'orks', 'trukk', [{ x: 40, y: 10 }])
    const boyz = add(s, 'orks', 'boyz', column(50, 10, 10, 1.2), composeUnit('boyz', 10))
    expect(carryProblem(s, boyz, trukk)).toBeNull()
  })
})
