import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import {
  composeUnit, COMPOSITION, entryCosts, listPoints, listProblems, maxCopies, parseArmies, POINTS_LIMITS, presetList, unknownProfiles,
  type ArmyList,
} from '../army/armyList'
import { listUnits } from '../army/placement'
import { DATASHEETS, PROFILES } from '../data/datasheets'
import { legalSizes, listedCost } from '../data/points'
import { seededRoller } from '../dice/dice'
import { apply, startGame, validate } from '../engine'
import { deploymentIssues } from '../rules/deployment'
import { scenarioById } from '../scenarios/scenarios'
import { FACTIONS, type PlayerId } from '../types'

const patrol = scenarioById('combat-patrol')
const pairs = FACTIONS.flatMap((a, i) => FACTIONS.slice(i + 1).map((b): [PlayerId, PlayerId] => [a, b]))

describe('unit compositions', () => {
  it('every datasheet has a composition of real profiles of its own faction', () => {
    expect(Object.keys(COMPOSITION).sort()).toEqual(Object.keys(DATASHEETS).sort())
    expect(unknownProfiles()).toEqual([])
    for (const id of Object.keys(COMPOSITION))
      for (const n of legalSizes(id)) {
        const models = composeUnit(id, n)
        expect(models, `${id} × ${n}`).toHaveLength(n)
      }
  })

  it('a bigger unit carries proportionally more special weapons', () => {
    const count = (id: string, n: number, p: string) => composeUnit(id, n).filter((x) => x === p).length
    expect(count('intercessors', 5, 'intercessorGL')).toBe(1)
    expect(count('intercessors', 10, 'intercessorGL')).toBe(2)
    expect(count('boyz', 10, 'nob')).toBe(1)
    expect(count('boyz', 20, 'nob')).toBe(1)
    expect(count('boyz', 20, 'boyBigShoota') + count('boyz', 20, 'boyRokkit')).toBe(2)
    expect(composeUnit('guardianDefenders', 11).at(-1)).toBe('heavyPlatform')
  })
})

describe('army list rules', () => {
  it('later copies of some units cost more', () => {
    expect(listedCost('redemptor', 1, 1)).toBe(195)
    expect(listedCost('redemptor', 1, 3)).toBe(210)
    expect(listedCost('kastelans', 2, 2)).toBe(180)
    const list: ArmyList = { limit: 1000, units: [{ datasheetId: 'kastelans', size: 2 }, { datasheetId: 'kastelans', size: 4 }] }
    expect(entryCosts(list)).toEqual([160, 340])
  })

  it('flags unlisted sizes, other factions, too many copies and going over the limit', () => {
    const bad: ArmyList = {
      limit: 500,
      units: [
        { datasheetId: 'boyz', size: 6 },
        { datasheetId: 'lieutenant', size: 1 },
        ...Array.from({ length: 4 }, () => ({ datasheetId: 'deffDread', size: 1 })),
      ],
    }
    const problems = listProblems('orks', bad)
    expect(problems.some((p) => p.includes('размер 6'))).toBe(true)
    expect(problems.some((p) => p.includes('не из этой фракции'))).toBe(true)
    expect(problems.some((p) => p.includes('не больше 3'))).toBe(true)
    expect(listProblems('orks', { limit: 500, units: [] })).toContain('В армии нет ни одного отряда.')
    expect(maxCopies('boyz')).toBe(6)
    expect(listProblems('orks', { limit: 500, units: Array.from({ length: 7 }, () => ({ datasheetId: 'boyz', size: 10 })) }).join()).toMatch(/Перебор очков: 525 из 500/)
  })

  it('every preset is legal and fits its limit', () => {
    for (const f of FACTIONS)
      for (const limit of POINTS_LIMITS) {
        const list = presetList(f, limit)
        expect(listProblems(f, list), `${f} ${limit}`).toEqual([])
        expect(listPoints(list)).toBeGreaterThan(limit * 0.85)
      }
    // the table in docs/armies.md
    const totals = Object.fromEntries(FACTIONS.map((f) => [f, POINTS_LIMITS.map((l) => listPoints(presetList(f, l)))]))
    expect(totals).toEqual({
      marines: [480, 980, 1500, 1985, 2485],
      orks: [495, 975, 1495, 1995, 2500],
      tyranids: [480, 1000, 1480, 2000, 2500],
      necrons: [495, 990, 1475, 1985, 2500],
      aeldari: [480, 980, 1460, 1985, 2445],
      adeptus_mechanicus: [490, 970, 1495, 1985, 2485],
    })
  })

  it('reads lists back from storage and drops broken ones', () => {
    const marines = presetList('marines', 500)
    expect(parseArmies({ marines, orks: { limit: 500, units: [{ datasheetId: 'lieutenant', size: 1 }] }, necrons: { limit: 750, units: [] } })).toEqual({ marines })
    expect(parseArmies('junk')).toEqual({})
  })

  it('numbers repeated units and keeps their ids unique', () => {
    const units = listUnits('marines', presetList('marines', 1000))
    expect(units.map((u) => u.name)).toEqual(['Капитан', 'Лейтенант I', 'Лейтенант II', 'Отделение интерсессоров', 'Отделение адских бластеров', 'Отделение Инфернус', 'Ветераны Bladeguard', 'Дредноут «Редемптор»'])
    expect(new Set(units.flatMap((u) => u.models.map((m) => m.id))).size).toBe(units.reduce((n, u) => n + u.models.length, 0))
    for (const u of units) for (const m of u.models) expect(m.wounds).toBe(PROFILES[m.profileId].w)
  })
})

describe('mustering an army list on the board', () => {
  // bigger lists play on the 44″×60″ board (strikeForce.test.ts)
  it.each(POINTS_LIMITS.filter((l) => l <= (patrol.maxPoints ?? 0)))('every pair of %i-point presets sets up legally on both sides', (limit) => {
    for (const [a, b] of pairs) {
      const s = patrol.build([a, b], { [a]: presetList(a, limit), [b]: presetList(b, limit) })
      for (const f of [a, b]) {
        const mine = s.units.filter((u) => u.owner === f)
        expect(mine.length).toBe(presetList(f, limit).units.length)
        expect(deploymentIssues(s, f, mine.map((u) => u.id)), `${f} vs ${a === f ? b : a} at ${limit}`).toEqual([])
      }
    }
  }, 120000)

  it('a custom list can face a default training roster', () => {
    const s = patrol.build(['marines', 'orks'], { orks: presetList('orks', 500) })
    expect(s.units.filter((u) => u.owner === 'marines').map((u) => u.id)).toEqual(['lt', 'int', 'int2', 'aint', 'red'])
    expect(s.units.filter((u) => u.owner === 'orks')).toHaveLength(5)
    expect(deploymentIssues(s, 'orks', s.units.filter((u) => u.owner === 'orks').map((u) => u.id))).toEqual([])
  })

  it('a Tech-Priest is set up next to a Skitarii unit it can lead', () => {
    const s = patrol.build(['marines', 'adeptus_mechanicus'], { adeptus_mechanicus: presetList('adeptus_mechanicus', 500) })
    const dominus = s.units.find((u) => u.datasheetId === 'techDominus')!
    const near = s.units.filter((u) => u.owner === 'adeptus_mechanicus' && u !== dominus).some((u) =>
      u.models.some((m) => Math.hypot(m.pos.x - dominus.models[0].pos.x, m.pos.y - dominus.models[0].pos.y) < 5))
    expect(near).toBe(true)
  })

  it('reports a list that does not fit instead of overlapping models', () => {
    const huge: ArmyList = { limit: 1000, units: Array.from({ length: 30 }, () => ({ datasheetId: 'boyz', size: 20 })) }
    expect(() => patrol.build(['marines', 'orks'], { orks: huge })).toThrow(/Не хватает места/)
  })

  it('the AI moves units of a custom list without an illegal command', () => {
    // Bigger armies make the AI slow (movement planning and line of sight grow with model count), so only a few decisions here.
    let s = startGame(patrol.build(['marines', 'aeldari'], { marines: presetList('marines', 500), aeldari: presetList('aeldari', 500) }), seededRoller(3))
    const r = seededRoller(5)
    const moved = new Set<string>()
    for (let i = 0; i < 12 && s.round === 1; i++) {
      const d = decide(s, 'standard')!
      const v = validate(s, d.cmd)
      if (!v.ok) throw new Error(`illegal AI command ${JSON.stringify(d.cmd)}: ${v.reason}`)
      if (d.cmd.type === 'move') moved.add(d.cmd.unitId)
      s = apply(s, d.cmd, r)
    }
    expect(moved.size).toBeGreaterThan(0)
  }, 120000)
})
