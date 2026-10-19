import { describe, expect, it } from 'vitest'
import { decide, p2d6AtLeast } from '../ai/ai'
import { seededRoller } from '../dice/dice'
import { apply, validate } from '../engine'
import { alive } from '../gameState'
import { started } from './helpers'

function playOut(seed: number, level: 'beginner' | 'standard') {
  let s = started(seed)
  const r = seededRoller(seed * 31)
  let actions = 0
  const kinds = new Set<string>()
  while (!s.winner && actions < 2000) {
    const d = decide(s, level)
    expect(d).not.toBeNull()
    const v = validate(s, d!.cmd)
    if (!v.ok) throw new Error(`illegal AI command ${JSON.stringify(d!.cmd)}: ${v.reason}`)
    kinds.add(d!.cmd.type)
    s = apply(s, d!.cmd, r)
    actions++
  }
  return { s, actions, kinds }
}

describe('AI', () => {
  it('P(2D6 ≥ n)', () => {
    expect(p2d6AtLeast(7)).toBeCloseTo(21 / 36)
    expect(p2d6AtLeast(2)).toBeCloseTo(35 / 36) // a roll of 2 never succeeds
    expect(p2d6AtLeast(13)).toBe(0)
  })
  it.each([[1, 'standard'], [2, 'standard'], [3, 'beginner'], [4, 'beginner'], [5, 'standard']] as const)(
    'seed %i (%s): AI vs AI plays a full legal game to an end state',
    (seed, level) => {
      const { s, actions, kinds } = playOut(seed, level)
      expect(s.winner).not.toBeNull()
      expect(actions).toBeLessThan(2000)
      expect(kinds.has('move')).toBe(true)
      expect(kinds.has('shoot')).toBe(true)
      const losses = s.units.reduce((a, u) => a + u.models.length - alive(u).length, 0)
      expect(losses).toBeGreaterThan(0)
    },
  )
})
