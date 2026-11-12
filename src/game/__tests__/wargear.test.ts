import { describe, expect, it } from 'vitest'
import { TOKENS, tokenImageFor } from '../../assets/manifest'
import { composeUnit, listProblems, parseArmyList, presetList, type ArmyList, type PointsLimit } from '../army/armyList'
import { decide } from '../ai/ai'
import { seededRoller } from '../dice/dice'
import { apply, startGame, validate } from '../engine'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, PlayerId } from '../types'
import { listUnits } from '../army/placement'
import { loadoutOf, loadoutProblems, WARGEAR } from '../army/wargear'
import { DATASHEETS, PROFILES, WEAPONS } from '../data/datasheets'
import { legalSizes } from '../data/points'

describe('wargear data', () => {
  it('every variant is a model profile with known weapons and a token', () => {
    for (const [id, spec] of Object.entries(WARGEAR)) {
      const profiles = [...(spec.leader ?? []), spec.base, ...spec.groups.flatMap((g) => g.variants)].map((v) => v.profile)
      for (const p of profiles) {
        expect(PROFILES[p], `${id}: ${p}`).toBeDefined()
        expect(TOKENS[p], `token for ${p}`).toBeDefined()
        for (const w of PROFILES[p].weapons) expect(WEAPONS[w], `${p}: ${w}`).toBeDefined()
      }
    }
  })

  it('the transuranic arquebus: 36″, S7 AP-2 D3 damage, Heavy and Precision', () => {
    const p = WEAPONS.transuranicArquebus.profiles[0]
    expect([p.range, p.attacks, p.s, p.ap, p.randomD]).toEqual([36, 1, 7, -2, 'D3'])
    expect(p.keywords).toMatchObject({ heavy: true, precision: true })
  })
})

describe('loadouts', () => {
  it('compose the unit: leader first, then the chosen variants, the rest default', () => {
    const models = composeUnit('rangers', 10, { leader: 'rangerAlphaPistol', counts: { rangerArquebus: 1, rangerOmnispex: 1 } })
    expect(models).toHaveLength(10)
    expect(models[0]).toBe('rangerAlphaPistol')
    expect(models.filter((p) => p === 'rangerArquebus')).toHaveLength(1)
    expect(models.filter((p) => p === 'rangerOmnispex')).toHaveLength(1)
    expect(models.filter((p) => p === 'ranger')).toHaveLength(7)
  })

  it('without a loadout the unit keeps its old default composition', () => {
    expect(composeUnit('rangers', 10)).toEqual(composeUnit('rangers', 10, undefined))
    expect(composeUnit('kastelans', 2)).toEqual(['kastelanGun', 'kastelan'])
  })

  it('limits from the datasheets: Rangers one special weapon, Vanguard one of each, nothing beyond the unit size', () => {
    expect(loadoutProblems('rangers', 10, { counts: { rangerArc: 1, rangerCaliver: 1 } }).join(' ')).toContain('Особое оружие')
    expect(loadoutProblems('rangers', 10, { counts: { rangerCaliver: 1, rangerOmnispex: 1 } })).toEqual([])
    expect(loadoutProblems('vanguard', 10, { counts: { vanguardArc: 1, vanguardCaliver: 1, vanguardArquebus: 1 } })).toEqual([])
    expect(loadoutProblems('vanguard', 10, { counts: { vanguardArc: 2 } }).join(' ')).toContain('Дуговая винтовка')
    expect(loadoutProblems('kastelans', 2, { counts: { kastelanGun: 2, kastelanHeavyTwin: 1 } }).join(' ')).toContain('больше')
    expect(loadoutProblems('breachers', 3, { counts: { breacherTorsion: 3 } })).toEqual([])
    expect(loadoutProblems('techDominus', 1, { leader: 'techDominusSerpentaRay', counts: {} })).toEqual([])
    expect(loadoutProblems('rangers', 10, { counts: { kastelanGun: 1 } }).join(' ')).toContain('Неизвестный')
  })

  it('the editor starts from the default equipment, and shows that default Rangers have two special weapons', () => {
    const lo = loadoutOf(WARGEAR.rangers, composeUnit('rangers', 10))
    expect(lo).toEqual({ leader: 'rangerAlpha', counts: { rangerArc: 1, rangerCaliver: 1, rangerOmnispex: 1 } })
    // the 11th edition datasheet allows one: the old default breaks it, which the editor reports
    expect(loadoutProblems('rangers', 10, lo).length).toBeGreaterThan(0)
  })

  it('a list keeps its loadouts through storage and builds units with them', () => {
    const list: ArmyList = { limit: 500, units: [{ datasheetId: 'kastelans', size: 2, loadout: { counts: { kastelanHeavyTwin: 2 } } }, { datasheetId: 'techDominus', size: 1, loadout: { leader: 'techDominusRay', counts: {} } }] }
    const back = parseArmyList(JSON.parse(JSON.stringify(list)))!
    expect(back).toEqual(list)
    expect(listProblems('adeptus_mechanicus', back)).toEqual([])
    const units = listUnits('adeptus_mechanicus', back)
    expect(units[0].models.map((m) => m.profileId)).toEqual(['kastelanHeavyTwin', 'kastelanHeavyTwin'])
    expect(units[1].models[0].profileId).toBe('techDominusRay')
    // a malformed loadout is dropped, the unit keeps its default equipment
    const bad = parseArmyList({ limit: 500, units: [{ datasheetId: 'kastelans', size: 2, loadout: { counts: { kastelanGun: -1 } } }] })!
    expect(bad.units[0].loadout).toBeUndefined()
  })

  it('an illegal loadout makes the list unplayable', () => {
    const list: ArmyList = { limit: 500, units: [{ datasheetId: 'rangers', size: 10, loadout: { counts: { rangerArc: 1, rangerArquebus: 1 } } }] }
    expect(listProblems('adeptus_mechanicus', list).join(' ')).toContain('Особое оружие')
  })
})

describe('wargear of the other armies', () => {
  it('every army has options, and every default composition is within the limits (except the Rangers, see docs)', () => {
    const factions = new Set(Object.keys(WARGEAR).map((id) => DATASHEETS[id].faction))
    expect([...factions].sort()).toEqual(['adeptus_mechanicus', 'aeldari', 'marines', 'necrons', 'orks', 'tyranids'])
    for (const [id, spec] of Object.entries(WARGEAR))
      for (const n of legalSizes(id)) {
        if (id === 'rangers') continue
        expect(loadoutProblems(id, n, loadoutOf(spec, composeUnit(id, n))), `${id} x${n}`).toEqual([])
      }
  })

  it('a variant keeps the base model and changes only its weapons, save or wounds', () => {
    expect(PROFILES.lychguardShield).toMatchObject({ t: PROFILES.lychguard.t, w: PROFILES.lychguard.w, invuln: 4, weapons: ['hyperphaseSword'] })
    expect(PROFILES.captainShield.w).toBe(PROFILES.captain.w + 1)
    expect(PROFILES.immortalTesla.weapons).toContain('teslaCarbine')
  })

  it('Guardian Defenders need exactly one Heavy Weapon Platform', () => {
    expect(loadoutProblems('guardianDefenders', 11, { counts: {} }).join(' ')).toContain('ровно одна')
    expect(loadoutProblems('guardianDefenders', 11, { counts: { platformLance: 1, platformScatter: 1 } }).join(' ')).toContain('не больше 1')
    const models = composeUnit('guardianDefenders', 11, { counts: { platformLance: 1 } })
    expect(models.filter((p) => p === 'platformLance')).toHaveLength(1)
    expect(models.filter((p) => p === 'guardian')).toHaveLength(10)
  })

  it('per-N limits scale with the unit size: Boyz get one special weapon of each kind per 10 models', () => {
    expect(loadoutProblems('boyz', 20, { leader: 'nobKlawRokkit', counts: { boyBigShoota: 2, boyRokkit: 2, boyBurna: 2 } })).toEqual([])
    expect(loadoutProblems('boyz', 10, { counts: { boyBurna: 2 } }).join(' ')).toContain('Бурна')
  })

  it('variants without their own token borrow the token and art of their base model', () => {
    expect(TOKENS.captainPlasma).toEqual(TOKENS.captain)
    expect(tokenImageFor('immortalTesla')).toBe(tokenImageFor('immortal'))
  })
})

describe('battles with the new wargear', () => {
  /** Every unit with options takes its most unusual loadout: the last leader option and the last variant of each group. */
  const geared = (faction: PlayerId, limit: PointsLimit): ArmyList => {
    const list = presetList(faction, limit)
    list.units = list.units.map((e) => {
      const spec = WARGEAR[e.datasheetId]
      if (!spec) return e
      const counts: Record<string, number> = {}
      let free = e.size - (spec.leader ? 1 : 0)
      for (const g of spec.groups) {
        const last = g.variants[g.variants.length - 1]
        const n = Math.min(g.max(e.size), g.variantMax?.[last.profile] ?? Infinity, free)
        if (n > 0) { counts[last.profile] = n; free -= n }
      }
      return { ...e, loadout: { ...(spec.leader ? { leader: spec.leader[spec.leader.length - 1].profile } : {}), counts } }
    })
    return list
  }

  for (const [a, b] of [['marines', 'orks'], ['tyranids', 'necrons'], ['aeldari', 'adeptus_mechanicus']] as [PlayerId, PlayerId][])
    it(`${a} against ${b}: every AI command stays legal`, { timeout: 120_000 }, () => {
      const lists = { [a]: geared(a, 500), [b]: geared(b, 500) }
      expect(listProblems(a, lists[a]!)).toEqual([])
      expect(listProblems(b, lists[b]!)).toEqual([])
      let s: GameState = startGame(scenarioById('combat-patrol').build([a, b], lists), seededRoller(7))
      for (let i = 0; i < 400 && !s.winner; i++) {
        const d = decide(s, 'standard')
        if (!d) break
        const v = validate(s, d.cmd)
        expect(v.ok, JSON.stringify(d.cmd)).toBe(true)
        s = apply(s, d.cmd, seededRoller(s.rng))
      }
      expect(s.round).toBeGreaterThanOrEqual(2)
    })
})
