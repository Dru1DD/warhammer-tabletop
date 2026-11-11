import { describe, expect, it } from 'vitest'
import { scenarioById } from '../scenarios/scenarios'
import { unitAdvice } from '../unitAdvice'
import { profileVs, REFERENCE } from '../weaponAdvice'
import type { GameState, WeaponProfile } from '../types'

const patrol = () => scenarioById('combat-patrol').build(['adeptus_mechanicus', 'tyranids'])
const byDatasheet = (s: GameState, id: string) => s.units.find((u) => u.datasheetId === id)!

describe('unit advice', () => {
  it('reads the role off the datasheet and explains it', () => {
    const s = patrol()
    const rangers = unitAdvice(byDatasheet(s, 'rangers'), s)
    expect(rangers.role).toBe('shooter')
    expect(rangers.title).toContain('Стрелки')
    expect(rangers.tips.join(' ')).toContain('В рукопашную не лезьте')
    // a shooting unit is rated on its guns only
    expect(rangers.strongVs).toContain('стрельба')
    expect(rangers.strongVs).not.toContain('рукопашная')
    expect(unitAdvice(byDatasheet(s, 'kastelans'), s).role).toBe('assault')
  })

  it('what to fear depends on the unit: vehicles fear heavy weapons, hordes fear volume of fire', () => {
    const s = patrol()
    expect(unitAdvice(byDatasheet(s, 'kastelans'), s).fears).toContain('тяжёлого оружия')
    expect(unitAdvice(byDatasheet(s, 'termagants'), s).fears).toContain('массового огня')
    expect(unitAdvice(byDatasheet(s, 'rangers'), s).fears).toContain('бронебойного')
  })

  it('in a battle: the Hive Tyrant is among the worst threats to Skitarii Rangers', () => {
    const s = patrol()
    const a = unitAdvice(byDatasheet(s, 'rangers'), s)
    expect(a.worstThreats).toContain(byDatasheet(s, 'hiveTyrant').name)
    expect(a.bestTargets.length).toBeGreaterThan(0)
  })

  it('without a battle there are no target lists', () => {
    const s = patrol()
    const a = unitAdvice(byDatasheet(s, 'rangers'))
    expect(a.bestTargets).toEqual([])
    expect(a.worstThreats).toEqual([])
  })

  it('an invulnerable save caps what AP can do', () => {
    const p: WeaponProfile = { name: '', range: 24, attacks: 1, skill: 2, s: 8, ap: -4, d: 1, keywords: {} }
    const plain = profileVs(p, { ...REFERENCE.elite })
    const shielded = profileVs(p, { ...REFERENCE.elite, invuln: 4 })
    expect(shielded).toBeLessThan(plain)
    // 3+ save at AP-4 is no save at all; a 4+ invulnerable save still stops half
    expect(shielded / plain).toBeCloseTo(0.5, 6)
  })
})

describe('a destroyed unit', () => {
  // the unit card stays open after the selected unit dies; it used to crash the page (white screen)
  it('is still described from its datasheet, with no battle targets', () => {
    const s = patrol()
    const rangers = byDatasheet(s, 'rangers')
    for (const m of rangers.models) m.destroyed = true
    const a = unitAdvice(rangers, s)
    expect(a.role).toBe('shooter')
    expect(a.fears).toContain('бронебойного')
    expect(a.strongVs).toContain('стрельба')
    expect(a.bestTargets).toEqual([])
    expect(a.worstThreats).toEqual([])
  })
})
