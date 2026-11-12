import { describe, expect, it } from 'vitest'
import { p2d6AtLeast } from '../ai/ai'
import { chargeForecast } from '../chargeAdvice'
import { endPhaseWarning, lastRoundWarning } from '../../ui/guidance'
import type { GameState } from '../types'
import { battle, column, place } from './helpers'

const byDatasheet = (s: GameState, id: string) => s.units.find((u) => u.datasheetId === id)!

/** Skitarii Rangers facing a Hive Tyrant `gap` inches away; everything else removed. */
function rangersVsTyrant(gap: number) {
  const s = battle('adeptus_mechanicus', 'tyranids', 'charge', 'adeptus_mechanicus')
  const rangers = byDatasheet(s, 'rangers')
  const tyrant = byDatasheet(s, 'hiveTyrant')
  for (const u of s.units) if (u !== rangers && u !== tyrant) place(s, u.id, [])
  place(s, rangers.id, column(10, 5, 10))
  place(s, tyrant.id, [{ x: 10 + gap + 3, y: 10 }])
  return { s, rangers, tyrant }
}

describe('charge forecast', () => {
  it('Skitarii charging a Hive Tyrant: a bad trade, and a warning that they are shooters', () => {
    const { s, rangers, tyrant } = rangersVsTyrant(4)
    const f = chargeForecast(s, rangers).find((x) => x.targetId === tyrant.id)!
    expect(f.taken).toBeGreaterThan(f.dealt)
    expect(f.verdict).toBe('bad')
    expect(f.warnings.join(' ')).toContain('Невыгодный размен')
    expect(f.warnings.join(' ')).toContain('стрелки')
  })

  it('the chance follows 2D6 for the distance, and only enemies within 12″ are listed', () => {
    const { s, rangers, tyrant } = rangersVsTyrant(4)
    const f = chargeForecast(s, rangers).find((x) => x.targetId === tyrant.id)!
    expect(f.p).toBeCloseTo(p2d6AtLeast(Math.ceil(f.distance)), 6)
    const far = rangersVsTyrant(20)
    expect(chargeForecast(far.s, far.rangers)).toEqual([])
  })

  it('the enemy strikes back only with its survivors', () => {
    const { s, rangers, tyrant } = rangersVsTyrant(4)
    const f = chargeForecast(s, rangers).find((x) => x.targetId === tyrant.id)!
    expect(f.killsDealt).toBeLessThanOrEqual(f.enemyModels)
    expect(f.killsTaken).toBeLessThanOrEqual(f.myModels)
  })
})

describe('reminders', () => {
  const lastRound = (vp: [number, number], first: 'adeptus_mechanicus' | 'tyranids') => {
    const s = battle('adeptus_mechanicus', 'tyranids', 'movement', 'adeptus_mechanicus')
    s.round = s.maxRounds
    s.firstPlayer = first
    s.players.adeptus_mechanicus.vp = vp[0]
    s.players.tyranids.vp = vp[1]
    return s
  }

  it('last round, moving first and ahead on points: warns that a wiped-out army loses', () => {
    const w = lastRound([20, 15], 'adeptus_mechanicus')
    expect(lastRoundWarning(w, 'adeptus_mechanicus')).toContain('20:15')
    expect(endPhaseWarning(w, 'adeptus_mechanicus')).toContain('Последний раунд')
  })

  it('no warning when the opponent has no turn left, or when behind', () => {
    expect(lastRoundWarning(lastRound([20, 15], 'tyranids'), 'adeptus_mechanicus')).toBeNull()
    expect(lastRoundWarning(lastRound([10, 15], 'adeptus_mechanicus'), 'adeptus_mechanicus')).toBeNull()
    const early = lastRound([20, 15], 'adeptus_mechanicus')
    early.round = 2
    expect(lastRoundWarning(early, 'adeptus_mechanicus')).toBeNull()
  })

  it('reminds about the Imperative before leaving the Command phase', () => {
    const s = battle('adeptus_mechanicus', 'tyranids', 'command', 'adeptus_mechanicus')
    s.players.adeptus_mechanicus.imperative = null
    expect(endPhaseWarning(s, 'adeptus_mechanicus')).toContain('Империатив')
    s.players.adeptus_mechanicus.imperative = 'protector'
    expect(endPhaseWarning(s, 'adeptus_mechanicus') ?? '').not.toContain('Империатив')
  })
})

describe('who else fights back, and support characters', () => {
  /** Sicarians 6″ from two Intercessors; the Assault Intercessors and the Lieutenant stand right next to them (or far away). */
  function sicarians(neighboursNear: boolean) {
    const s = battle('adeptus_mechanicus', 'marines', 'charge', 'adeptus_mechanicus')
    const keep = ['sicarians', 'int', 'aint', 'lt']
    for (const u of s.units) if (!keep.includes(u.id)) place(s, u.id, [])
    place(s, 'sicarians', column(10, 10, 5, 1.3))
    place(s, 'int', column(17, 11, 2, 1.3))
    const off = neighboursNear ? 0 : 20
    place(s, 'aint', column(19.5 + off, 9, 5, 1.3))
    place(s, 'lt', [{ x: 19 + off, y: 13.8 }])
    return s
  }

  it('enemy units standing next to the target are named, and their blows count in the trade', () => {
    const near = chargeForecast(sicarians(true), byDatasheet(sicarians(true), 'sicarians')).find((x) => x.targetId === 'int')!
    const alone = chargeForecast(sicarians(false), byDatasheet(sicarians(false), 'sicarians')).find((x) => x.targetId === 'int')!
    expect(near.joiners.map((x) => x.name)).toEqual(expect.arrayContaining(['Штурмовые интерсессоры', 'Лейтенант']))
    expect(near.warnings.join(' ')).toContain('Рядом с целью')
    expect(near.taken).toBeGreaterThan(alone.taken)
    expect(alone.joiners).toEqual([])
  })

  it('a character in a fight it barely wins or loses badly is warned about; an ordinary unit is not', () => {
    const s = battle('adeptus_mechanicus', 'orks', 'charge', 'adeptus_mechanicus')
    for (const u of s.units) if (!['dominus', 'kastelans', 'boyz'].includes(u.id)) place(s, u.id, [])
    place(s, 'dominus', [{ x: 10, y: 10 }])
    place(s, 'kastelans', [{ x: 10, y: 4 }, { x: 10, y: 6.5 }])
    place(s, 'boyz', column(16, 3, 10, 1.2))
    expect(chargeForecast(s, byDatasheet(s, 'techDominus'))[0].warnings.join(' ')).toContain('персонаж')
    expect(chargeForecast(s, byDatasheet(s, 'kastelans'))[0].warnings.join(' ')).not.toContain('персонаж')
  })
})
