import { describe, expect, it } from 'vitest'
import { decodeArmy, encodeArmy, parseSavedLists, withSaved, withoutSaved } from '../army/armyCode'
import { listProblems, presetList, type ArmyList } from '../army/armyList'

const withLoadout = (): ArmyList => {
  const list = presetList('adeptus_mechanicus', 500)
  list.units = list.units.map((e) => (e.datasheetId === 'rangers' ? { ...e, loadout: { leader: 'rangerAlphaPistol', counts: { rangerCaliver: 1 } } } : e))
  return list
}

describe('army code', () => {
  it('round trip keeps the faction, the limit, every unit and its loadout', () => {
    const list = withLoadout()
    expect(listProblems('adeptus_mechanicus', list)).toEqual([])
    const code = encodeArmy('adeptus_mechanicus', list)
    expect(code).toMatch(/^WH40K1\.[A-Za-z0-9_-]+$/)
    expect(decodeArmy(code)).toEqual({ ok: true, faction: 'adeptus_mechanicus', list })
  })

  it('spaces and line breaks from a messenger are ignored', () => {
    const code = encodeArmy('orks', presetList('orks', 1000))
    const broken = `  ${code.slice(0, 20)}\n${code.slice(20, 50)} ${code.slice(50)}\n`
    expect(decodeArmy(broken)).toMatchObject({ ok: true, faction: 'orks' })
  })

  it('a wrong prefix, a cut code, an unknown unit or a unit of another faction is refused with a reason', () => {
    expect(decodeArmy('hello')).toMatchObject({ ok: false, error: expect.stringContaining('WH40K1.') })
    const code = encodeArmy('marines', presetList('marines', 500))
    expect(decodeArmy(code.slice(0, 30))).toMatchObject({ ok: false })
    const forge = (o: unknown) => 'WH40K1.' + btoa(JSON.stringify(o))
    expect(decodeArmy(forge({ f: 'marines', l: 500, u: [['noSuchUnit', 5]] }))).toMatchObject({ ok: false, error: expect.stringContaining('нет в этой версии') })
    expect(decodeArmy(forge({ f: 'marines', l: 500, u: [['boyz', 10]] }))).toMatchObject({ ok: false, error: expect.stringContaining('другой фракции') })
  })
})

describe('saved lists', () => {
  it('save, overwrite by name (newest first), delete; malformed storage is dropped', () => {
    let all = withSaved({}, 'orks', 'Толпа', presetList('orks', 500), 't1')
    all = withSaved(all, 'orks', 'Дреды', presetList('orks', 1000), 't2')
    all = withSaved(all, 'orks', 'Толпа', presetList('orks', 1000), 't3')
    expect(all.orks!.map((x) => [x.name, x.list.limit, x.savedAt])).toEqual([['Толпа', 1000, 't3'], ['Дреды', 1000, 't2']])
    expect(parseSavedLists(JSON.parse(JSON.stringify(all)))).toEqual(all)
    expect(withoutSaved(withoutSaved(all, 'orks', 'Толпа'), 'orks', 'Дреды')).toEqual({})
    expect(parseSavedLists({ orks: [{ name: '', list: {} }, 5], marines: 'x' })).toEqual({})
    // a list stored under the wrong faction is dropped
    expect(parseSavedLists({ marines: [{ name: 'чужой', list: presetList('orks', 500) }] })).toEqual({})
  })
})
