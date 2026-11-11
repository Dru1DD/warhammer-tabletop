import { describe, expect, it } from 'vitest'
import { WEAPONS } from '../data/datasheets'
import { baseRadius } from '../geometry/geometry'
import { getUnit } from '../gameState'
import { adviceWarnings, shotAdvice } from '../shotAdvice'
import { REFERENCE, profileVs, weaponAdvice } from '../weaponAdvice'
import type { WeaponProfile } from '../types'
import { bare, column, place } from './helpers'

const byName = (part: string): WeaponProfile => Object.values(WEAPONS).find((w) => w.name.includes(part))!.profiles[0]

describe('weapon advice', () => {
  it('basic infantry guns are for hordes and barely scratch vehicles', () => {
    for (const name of ['Galvanic Rifle', 'Radium Carbine', 'Fleshborer']) {
      const a = weaponAdvice(byName(name))
      expect(a.best, name).toEqual(['horde'])
      expect(a.uselessVsArmour, name).toBe(true)
      expect(a.lines.some((l) => l.includes('почти бесполезно')), name).toBe(true)
    }
  })

  it('flamers are for hordes, heavy guns crack armour', () => {
    expect(weaponAdvice(byName('Heavy Flamer')).best).toContain('horde')
    expect(weaponAdvice(byName('Volkite')).cracksArmour).toBe(true)
    // Anti-VEHICLE: rated without it (it does not help against monsters), explained on its own line
    expect(weaponAdvice(byName('Heavy Grav-cannon')).lines.join(' ')).toContain('(Anti-VEHICLE) — хорошо бьёт технику')
    expect(weaponAdvice(byName('Redemptor Fist')).best).toEqual(['heavy'])
  })

  it('Devastating Wounds and Anti are explained', () => {
    const p = { ...byName('Galvanic Rifle'), keywords: { devastatingWounds: true, anti: { keyword: 'VEHICLE', roll: 4 } } }
    const lines = weaponAdvice(p).lines.join(' ')
    expect(lines).toContain('Devastating Wounds')
    expect(lines).toContain('VEHICLE')
  })

  it('expected damage follows the dice: S4 AP0 D1 BS3+ against T3 Sv5+ is 4/6 × 4/6 × 4/6', () => {
    const p: WeaponProfile = { name: '', range: 24, attacks: 1, skill: 3, s: 4, ap: 0, d: 1, keywords: {} }
    expect(profileVs(p, REFERENCE.horde)).toBeCloseTo((4 / 6) * (4 / 6) * (4 / 6), 6)
  })
})

const r32 = baseRadius(32)

/** Intercessors at x = 3 facing a Boyz mob 10" away (`boyzLeft` models, all plain 1-wound Boyz) and a second, full
 * mob `second` inches away; nothing else on the table. */
function range(boyzLeft: number, second = 10) {
  const s = bare('shooting', 'marines')
  for (const u of s.units) if (!['int', 'boyz'].includes(u.id)) place(s, u.id, [])
  place(s, 'int', column(3, 6, 5))
  const mob = structuredClone(getUnit(s, 'boyz'))
  place(s, 'boyz', column(3 + 2 * r32 + 10, 6, boyzLeft, 1.1))
  for (const m of getUnit(s, 'boyz').models) Object.assign(m, { profileId: 'boy', wounds: 1 })
  mob.id = 'boyz2'
  mob.name = 'Бойз II'
  mob.models.forEach((m, i) =>
    Object.assign(m, { id: `b2-${i}`, profileId: 'boy', wounds: 1, destroyed: false, pos: { x: 3 + 2 * r32 + second + Math.floor(i / 2) * 1.1, y: 18 + (i % 2) * 1.1 } }),
  )
  s.units.push(mob)
  return s
}

describe('shot advice', () => {
  it('rates every enemy unit and stars the best one', () => {
    const s = range(10)
    const adv = shotAdvice(s, getUnit(s, 'int'))
    const boyz = adv.find((a) => a.targetId === 'boyz')!
    expect(boyz.problem).toBeNull()
    expect(boyz.dmg).toBeGreaterThan(0)
    expect(boyz.kills).toBeLessThanOrEqual(boyz.models)
    expect(adv.filter((a) => a.best)).toHaveLength(1)
  })

  it('warns about overkill on an almost dead unit when another target is worth shooting', () => {
    const s = range(1)
    const adv = shotAdvice(s, getUnit(s, 'int'))
    const boy = adv.find((a) => a.targetId === 'boyz')!
    expect(boy.woundsLeft).toBe(1)
    expect(boy.overkill).toBe(true)
    expect(adviceWarnings(boy, adv).join(' ')).toContain('Перебор')
  })

  it('a unit that cannot be shot gets the engine reason and no rating', () => {
    const s = range(10, 40)
    const far = shotAdvice(s, getUnit(s, 'int')).find((a) => a.targetId === 'boyz2')!
    expect(far.problem).not.toBeNull()
    expect(far.dmg).toBe(0)
    expect(far.best).toBe(false)
  })
})
