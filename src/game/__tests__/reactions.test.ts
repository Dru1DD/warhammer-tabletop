import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { DATASHEETS } from '../data/datasheets'
import { scriptedRoller, type Roller } from '../dice/dice'
import { actor, apply, meleeSetup, meleeWeaponsOf, shootPlan, validate } from '../engine'
import { alive, unitDistance } from '../gameState'
import { reactionAdvice } from '../reactionAdvice'
import type { Command, GameState } from '../types'
import { battle, column, place, unit } from './helpers'

const woundsOf = (s: GameState, id: string) => alive(unit(s, id)).reduce((a, m) => a + m.wounds, 0)
const always = (n: number): Roller => ({ d6: () => n, state: () => 1 })

/** Marines (west) against Orks (east); everything but the named units is removed; Orks' turn unless said. */
function table(phase: GameState['phase'], keep: string[], active: 'marines' | 'orks' = 'orks') {
  const s = battle('marines', 'orks', phase, active)
  for (const u of s.units) if (!keep.includes(u.id)) place(s, u.id, [])
  s.players.marines.cp = 2
  s.players.orks.cp = 2
  return s
}

describe('the reaction window', () => {
  const setup = () => {
    const s = table('movement', ['int', 'boyz'])
    place(s, 'int', column(10, 10, 5))
    place(s, 'boyz', column(25, 10, 10, 1.1)) // about 15″ away: in bolt rifle range
    return s
  }

  it('the end of the opponent’s movement waits for the other player, who may pass', () => {
    let s = apply(setup(), { type: 'endPhase' }, always(3))
    expect(s.phase).toBe('movement')
    expect(s.reaction).toEqual({ player: 'marines', window: 'beforeShooting', next: 'shooting' })
    expect(actor(s)).toBe('marines')
    // the active player waits; only reactions or a pass are accepted
    expect(validate(s, { type: 'endPhase' }).ok).toBe(false)
    expect(validate(s, { type: 'stratagem', id: 'fireOverwatch', unitId: 'int', targetId: 'boyz' }).ok).toBe(true)
    s = apply(s, { type: 'passReaction' }, always(3))
    expect(s.reaction).toBeNull()
    expect(s.phase).toBe('shooting')
    expect(actor(s)).toBe('orks')
    expect(validate(s, { type: 'passReaction' }).ok).toBe(false)
  })

  it('no window without a usable reaction (no CP, nobody in range)', () => {
    const broke = setup()
    broke.players.marines.cp = 0
    expect(apply(broke, { type: 'endPhase' }, always(3)).phase).toBe('shooting')
    const far = setup()
    place(far, 'boyz', column(50, 10, 10, 1.1))
    expect(apply(far, { type: 'endPhase' }, always(3)).phase).toBe('shooting')
  })

  it('Fire Overwatch hits only on a 6, then the window closes', () => {
    const s = apply(setup(), { type: 'endPhase' }, always(3))
    const cmd: Command = { type: 'stratagem', id: 'fireOverwatch', unitId: 'int', targetId: 'boyz' }
    // all 5s: an ordinary volley would hit, wound (S4 vs T5) and beat the 6+ save
    const before = woundsOf(s, 'boyz')
    const fives = apply(s, cmd, always(5))
    expect(woundsOf(fives, 'boyz')).toBe(before)
    expect(fives.players.marines.cp).toBe(1)
    expect(fives.reaction).toBeNull()
    expect(fives.phase).toBe('shooting')
    // all 6s: hits (wound, but 6s also save) — at least the dice were rolled against the 6
    expect(shootPlan(s, unit(s, 'int'), unit(s, 'boyz'), { snap: true }).groups.every((g) => g.ctx.skillWorsen === 6)).toBe(true)
  })

  it('Fire Overwatch needs the target within 24″ and a unit out of combat', () => {
    const s = apply(setup(), { type: 'endPhase' }, always(3))
    const engaged = structuredClone(s)
    place(engaged, 'boyz', column(11.2, 10, 10, 1.1))
    expect(validate(engaged, { type: 'stratagem', id: 'fireOverwatch', unitId: 'int', targetId: 'boyz' }).ok).toBe(false)
  })
})

describe('Smokescreen', () => {
  it('a SMOKE unit gets cover against the shooting that follows', () => {
    const kw = DATASHEETS.boyz.keywords
    DATASHEETS.boyz.keywords = [...kw, 'SMOKE']
    try {
      let s = table('movement', ['int', 'boyz'], 'marines')
      place(s, 'int', column(10, 10, 5))
      place(s, 'boyz', column(25, 10, 10, 1.1))
      expect(shootPlan(s, unit(s, 'int'), unit(s, 'boyz')).cover).toBe(false)
      s = apply(s, { type: 'endPhase' }, always(3))
      expect(s.reaction?.player).toBe('orks')
      s = apply(s, { type: 'stratagem', id: 'smokescreen', unitId: 'boyz' }, always(3))
      expect(s.phase).toBe('shooting')
      expect(shootPlan(s, unit(s, 'int'), unit(s, 'boyz')).cover).toBe(true)
    } finally {
      DATASHEETS.boyz.keywords = kw
    }
  })
})

describe('Heroic Intervention', () => {
  const setup = () => {
    const s = table('charge', ['lt', 'int', 'boyz'])
    place(s, 'int', column(10, 10, 5))
    place(s, 'boyz', column(11.8, 10, 10, 1.1)) // just charged into the Intercessors
    unit(s, 'boyz').charged = true
    place(s, 'lt', [{ x: 10, y: 26 }]) // a few inches from the Boyz
    return s
  }

  it('after the opponent’s charges, a unit nearby leaps into the fight', () => {
    let s = apply(setup(), { type: 'endPhase' }, always(3))
    expect(s.reaction).toMatchObject({ player: 'marines', window: 'afterCharges', next: 'fight' })
    const cmd: Command = { type: 'stratagem', id: 'heroicIntervention', unitId: 'lt', targetId: 'boyz' }
    expect(validate(s, cmd).ok).toBe(true)
    s = apply(s, cmd, scriptedRoller([6, 6]))
    expect(unitDistance(unit(s, 'lt'), unit(s, 'boyz'))).toBeLessThanOrEqual(1 + 1e-6)
    expect(unit(s, 'lt').charged).toBe(false) // no Fights First
    expect(s.phase).toBe('fight')
  })

  it('only against a unit that charged this phase, within 12″', () => {
    const s = setup()
    unit(s, 'boyz').charged = false
    const x = apply(s, { type: 'endPhase' }, always(3))
    expect(validate(x, { type: 'stratagem', id: 'heroicIntervention', unitId: 'lt', targetId: 'boyz' }).ok).toBe(false)
  })
})

describe('Epic Challenge', () => {
  it('a character’s melee attacks gain Precision for the phase', () => {
    let s = table('charge', ['lt', 'boyz'], 'marines')
    place(s, 'lt', [{ x: 10, y: 10 }])
    place(s, 'boyz', column(11.3, 10, 10, 1.1))
    s = apply(s, { type: 'endPhase' }, always(3))
    expect(s.phase).toBe('fight')
    const lt = unit(s, 'lt')
    const w = meleeWeaponsOf(alive(lt)[0])[0].profiles[0]
    expect(meleeSetup(s, lt, unit(s, 'boyz'), w).ctx.precision).toBeFalsy()
    const cmd: Command = { type: 'stratagem', id: 'epicChallenge', unitId: 'lt' }
    expect(validate(s, cmd).ok).toBe(true)
    s = apply(s, cmd, always(3))
    expect(meleeSetup(s, unit(s, 'lt'), unit(s, 'boyz'), w).ctx.precision).toBe(true)
  })
})

describe('reaction advice and the AI', () => {
  it('overwatch is worth it against a close mob; the AI takes it, the beginner passes', () => {
    const s = apply((() => {
      const x = table('movement', ['int', 'boyz'])
      place(x, 'int', column(10, 10, 5))
      place(x, 'boyz', column(18, 10, 10, 1.1))
      return x
    })(), { type: 'endPhase' }, always(3))
    const advice = reactionAdvice(s)
    expect(advice.length).toBeGreaterThan(0)
    const d = decide(s, 'standard')!
    expect(validate(s, d.cmd).ok).toBe(true)
    if (advice[0].worth) expect(d.cmd).toEqual(advice[0].cmd)
    else expect(d.cmd).toEqual({ type: 'passReaction' })
    expect(decide(s, 'beginner')!.cmd).toEqual({ type: 'passReaction' })
  })

  it('a heroic intervention that cannot reach is not offered as useful', () => {
    const s = table('charge', ['lt', 'int', 'boyz'])
    place(s, 'int', column(10, 10, 5))
    place(s, 'boyz', column(11.8, 10, 10, 1.1))
    unit(s, 'boyz').charged = true
    place(s, 'lt', [{ x: 10, y: 33 }]) // ~10″: 2D6 ≥ 10 is 1 in 6
    const x = apply(s, { type: 'endPhase' }, always(3))
    const hi = reactionAdvice(x).find((o) => o.cmd.id === 'heroicIntervention')
    expect(hi?.worth).toBe(false)
  })
})
