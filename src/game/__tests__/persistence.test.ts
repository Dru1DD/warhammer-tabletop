import { describe, expect, it } from 'vitest'
import { deserialize, serialize } from '../persistence'
import { started } from './helpers'

describe('persistence', () => {
  it('round-trips a game', () => {
    const s = started(11)
    s.units[0].models[0].pos = { x: 7.25, y: 3.5 }
    s.units[1].models[2].destroyed = true
    const r = deserialize(serialize(s))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.file.state).toEqual(s)
  })
  it('rejects broken JSON, other schema versions and partial data', () => {
    expect(deserialize('{nope').ok).toBe(false)
    expect(deserialize(null).ok).toBe(false)
    const s = started()
    const old = JSON.parse(serialize(s))
    old.schemaVersion = 0
    const r = deserialize(JSON.stringify(old))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('версии')
    const broken = JSON.parse(serialize(s))
    delete broken.state.units
    expect(deserialize(JSON.stringify(broken)).ok).toBe(false)
  })
})
