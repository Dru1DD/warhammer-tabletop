import { describe, expect, it } from 'vitest'
import { TOKENS } from '../../assets/manifest'
import { composeUnit, listProblems, parseArmyList, type ArmyList } from '../army/armyList'
import { listUnits } from '../army/placement'
import { loadoutOf, loadoutProblems, WARGEAR } from '../army/wargear'
import { PROFILES, WEAPONS } from '../data/datasheets'

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
