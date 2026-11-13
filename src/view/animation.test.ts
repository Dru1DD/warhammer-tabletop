import { describe, expect, it } from 'vitest'
import { started } from '../game/__tests__/helpers'
import { casualties } from './animation'

describe('casualties', () => {
  it('lists models that died between two states, one after another', () => {
    const a = started()
    const b = structuredClone(a)
    const u = b.units.findIndex((x) => x.models.length >= 3)
    const models = b.units[u].models.slice(0, 3)
    for (const m of models) m.destroyed = true
    const dead = casualties(a, b)
    expect(dead.map((c) => c.model.id)).toEqual(models.map((m) => m.id))
    expect(dead.map((c) => c.delay)).toEqual([0, 260, 520])
    expect(dead[0].pos).toEqual(a.units[u].models[0].pos)
    expect(casualties(b, b)).toEqual([])
    expect(casualties(b, a)).toEqual([])
  })
  it('squeezes a big loss into a bounded time', () => {
    const a = started()
    const b = structuredClone(a)
    for (const u of b.units) for (const m of u.models) m.destroyed = true
    const dead = casualties(a, b)
    expect(dead.length).toBeGreaterThan(10)
    expect(dead.at(-1)!.delay).toBeLessThan(2400)
  })
})
