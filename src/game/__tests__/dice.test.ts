import { describe, expect, it } from 'vitest'
import { rollMany, scriptedRoller, seededRoller } from '../dice/dice'

describe('dice', () => {
  it('seeded rolls are reproducible and in 1..6', () => {
    const a = rollMany(seededRoller(7), 200)
    const b = rollMany(seededRoller(7), 200)
    expect(a).toEqual(b)
    expect(a.every((v) => v >= 1 && v <= 6)).toBe(true)
    expect(new Set(a).size).toBe(6)
  })
  it('state can resume a sequence', () => {
    const r = seededRoller(9)
    rollMany(r, 5)
    const resumed = seededRoller(r.state())
    expect(rollMany(resumed, 5)).toEqual(rollMany(r, 5))
  })
  it('scripted roller returns given values and throws when exhausted', () => {
    const r = scriptedRoller([3, 6])
    expect([r.d6(), r.d6()]).toEqual([3, 6])
    expect(() => r.d6()).toThrow()
  })
})
