import { describe, expect, it, vi } from 'vitest'
import { createMatch, nextEnvelope, soloAssignments, submit } from '../match/match'
import { deserialize, saveMatch, SAVE_FORMAT, serialize } from '../persistence'
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

describe('save format migrations', () => {
  const v1 = (s = started(9), human?: 'marines' | 'orks') => JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01T00:00:00.000Z', human, state: s })

  it('loads a format-1 save (no format field) and derives a fresh match from it, state untouched', () => {
    const s = started(9)
    const r = deserialize(v1(s, 'orks'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.file.state).toEqual(s)
    expect(r.file.format).toBe(SAVE_FORMAT)
    const m = r.file.match
    expect(m).toMatchObject({ mode: 'training', version: 0, lastSequence: {}, history: [] })
    expect(m.assignments.orks).toEqual({ type: 'local', playerId: 'local' })
    expect(m.assignments.marines.type).toBe('ai')
    expect(m.initial).toEqual(s)
    expect(m.gameId).toMatch(/^legacy-/)
  })
  it('migration is deterministic and defaults the human side to marines', () => {
    const a = deserialize(v1(started(9)))
    const b = deserialize(v1(started(9)))
    expect(a).toEqual(b)
    if (a.ok) expect(a.file.match.assignments.marines.type).toBe('local')
  })
  it('round-trips a format-2 save: match block carries history but NOT a second copy of the state', () => {
    let m = createMatch(started(11), soloAssignments('marines'), { gameId: 'g-test' })
    const side = m.state.activePlayer
    const mine = soloAssignments('marines')[side].playerId
    const r = submit(m, nextEnvelope(m, mine, { type: 'endPhase' }))
    expect(r.ok).toBe(true)
    if (r.ok) m = r.match
    const raw = serialize(m.state, 'marines', new Date(0), m)
    const parsed = JSON.parse(raw)
    expect(parsed.format).toBe(2)
    expect(parsed.match.state).toBeUndefined()
    const back = deserialize(raw)
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.file.state).toEqual(m.state)
    expect(back.file.match).toMatchObject({ gameId: 'g-test', version: 1, lastSequence: { [mine]: 1 } })
    expect(back.file.match.history).toEqual(m.history)
    expect(back.file.match.initial).toEqual(m.initial)
  })
  it('ignores a damaged match block and rebuilds it from the state', () => {
    const m = createMatch(started(3), soloAssignments('marines'), { gameId: 'g-test' })
    const bad = JSON.parse(serialize(m.state, 'marines', new Date(0), m))
    bad.match.version = 4 // history is empty: inconsistent
    const r = deserialize(JSON.stringify(bad))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.file.match).toMatchObject({ version: 0, gameId: expect.stringMatching(/^legacy-/) })
    delete bad.match.assignments
    expect(deserialize(JSON.stringify(bad)).ok).toBe(true)
    // a corrupt sequence counter would reject every local command forever: rebuild instead
    const corrupt = JSON.parse(serialize(m.state, 'marines', new Date(0), m))
    corrupt.match.lastSequence = { local: 'x' }
    const c = deserialize(JSON.stringify(corrupt))
    expect(c.ok && c.file.match.lastSequence).toEqual({})
    corrupt.match.lastSequence = {}
    corrupt.match.version = 1
    corrupt.match.history = [null]
    expect(deserialize(JSON.stringify(corrupt)).ok && JSON.stringify(deserialize(JSON.stringify(corrupt)))).toContain('legacy-')
  })
  it('refuses a save from a newer format and keeps rejecting other state schemas', () => {
    const f = JSON.parse(v1())
    f.format = SAVE_FORMAT + 1
    const r = deserialize(JSON.stringify(f))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('более новой')
    f.format = undefined
    f.schemaVersion = 2
    expect(deserialize(JSON.stringify(f)).ok).toBe(false)
  })
  it('saveMatch falls back to a slim save when the full one exceeds the storage quota', () => {
    const m = createMatch(started(5), soloAssignments('marines'), { gameId: 'g-test' })
    const full = serialize(m.state, 'marines', new Date(0), m).length
    const stored: Record<string, string> = {}
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => {
      if (v.length >= full) throw new DOMException('quota', 'QuotaExceededError')
      stored[k] = v
    })
    expect(saveMatch('k', m, 'marines')).toBe(true)
    expect(JSON.parse(stored.k).match).toBeUndefined()
    expect(deserialize(stored.k).ok).toBe(true)
    spy.mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
    expect(saveMatch('k', m, 'marines')).toBe(false)
    spy.mockRestore()
  })
})
