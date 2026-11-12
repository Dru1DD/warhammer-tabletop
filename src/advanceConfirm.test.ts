import { beforeEach, describe, expect, it } from 'vitest'
import { advanceWarning } from './game/advanceAdvice'
import type { ArmyList } from './game/army/armyList'
import { battle, place } from './game/__tests__/helpers'
import { useStore } from './store'
import type { GameState, Vec } from './game/types'

// Battle of 12.11.2026: Rangers II advanced twice with an enemy in reach and did not fire once in the whole game, and
// a Dunerider nobody got into was removed before the battle. Both now ask first.

const st = () => useStore.getState()
const reset = () => {
  localStorage.clear()
  useStore.setState({ game: null, match: null, history: [], message: null, deploying: null, review: null, chargeConfirm: null, chargeOk: null })
}

/** Rangers (galvanic rifles 30″, M6) and one mob of Boyz `gap`″ away; everything else off the board. */
function rangersAnd(gap: number): GameState {
  const s = battle('adeptus_mechanicus', 'orks')
  const rangers = s.units.find((u) => u.datasheetId === 'rangers')!
  const boyz = s.units.find((u) => u.owner === 'orks' && u.datasheetId === 'boyz')!
  for (const u of s.units) if (u !== rangers && u !== boyz) place(s, u.id, [])
  place(s, rangers.id, rangers.models.map((_, i) => ({ x: 4 + (i % 2) * 1.2, y: 6 + Math.floor(i / 2) * 1.2 }) as Vec))
  // the Boyz' nearest base edge `gap`″ from the Rangers' nearest one (32 mm bases)
  place(s, boyz.id, boyz.models.map((_, i) => ({ x: 4 + 1.2 + gap + 1.26 + (i % 2) * 1.3, y: 6 + Math.floor(i / 2) * 1.3 }) as Vec))
  return s
}
const rangersOf = (s: GameState) => s.units.find((u) => u.datasheetId === 'rangers')!

describe('advanceWarning', () => {
  it('an enemy within the rifles’ range: advancing throws the shooting away', () => {
    const s = rangersAnd(20)
    const w = advanceWarning(s, rangersOf(s))!
    expect(w.why).toHaveLength(2)
    expect(w.why[1]).toMatch(/уже в дальности \(30″\)/)
  })

  it('an enemy a Normal move away from range: still a warning', () => {
    const s = rangersAnd(33)
    expect(advanceWarning(s, rangersOf(s))!.why[1]).toMatch(/обычным ходом на 6″/)
  })

  it('no enemy within range plus a Normal move: no warning', () => {
    const s = rangersAnd(40)
    expect(advanceWarning(s, rangersOf(s))).toBeNull()
  })

  it('Conqueror makes every weapon Assault: no warning', () => {
    const s = rangersAnd(20)
    s.players.adeptus_mechanicus.imperative = 'conqueror'
    expect(advanceWarning(s, rangersOf(s))).toBeNull()
  })
})

describe('a wasteful Advance asks first', () => {
  beforeEach(reset)

  function inMovement(gap: number, explain: 'beginner' | 'minimal' = 'beginner') {
    st().newGame({ human: 'adeptus_mechanicus', opponent: 'orks', scenarioId: 'combat-patrol', tutorial: false, explain })
    const s = rangersAnd(gap)
    s.players.adeptus_mechanicus.imperative = 'protector'
    useStore.setState({ game: s })
    return rangersOf(s).id
  }

  it('asks, «Cancel» drops it, «Advance anyway» declares it', () => {
    const id = inMovement(20)
    expect(st().dispatch({ type: 'declareAdvance', unitId: id })).toBe(false)
    expect(st().chargeConfirm).toMatchObject({ kind: 'advance', unitId: id })
    st().confirmCharge(false)
    expect(st().chargeConfirm).toBeNull()
    expect(rangersOf(st().game!).advanceRoll).toBeNull()
    st().dispatch({ type: 'declareAdvance', unitId: id })
    st().confirmCharge(true)
    expect(st().chargeConfirm).toBeNull()
    expect(rangersOf(st().game!).advanceRoll).not.toBeNull()
  })

  it('no question when nothing is in reach, nor in the «minimal» mode', () => {
    expect(st().dispatch({ type: 'declareAdvance', unitId: inMovement(40) })).toBe(true)
    reset()
    expect(st().dispatch({ type: 'declareAdvance', unitId: inMovement(20, 'minimal') })).toBe(true)
    expect(st().chargeConfirm).toBeNull()
  })
})

describe('starting the battle with an empty Dedicated Transport asks first', () => {
  beforeEach(reset)
  const list: ArmyList = { limit: 1000, units: [
    { datasheetId: 'techDominus', size: 1 }, { datasheetId: 'rangers', size: 10 }, { datasheetId: 'dunerider', size: 1 },
  ] }
  const deploy = () => {
    st().startDeployment({ human: 'adeptus_mechanicus', opponent: 'orks', scenarioId: 'combat-patrol', tutorial: false, explain: 'beginner', armies: { adeptus_mechanicus: list } })
    st().autoDeploy()
  }
  const dunerider = () => st().game!.units.find((u) => u.datasheetId === 'dunerider')

  it('«Back to deployment» selects the transport; «Start without it» starts and removes it', () => {
    deploy()
    expect(st().finishDeployment()).toBe(false)
    expect(st().chargeConfirm?.kind).toBe('start')
    st().confirmCharge(false)
    expect(st().deploying).not.toBeNull()
    expect(st().selectedUnitId).toBe(dunerider()!.id)
    expect(st().finishDeployment()).toBe(false)
    st().confirmCharge(true)
    expect(st().deploying).toBeNull()
    expect(dunerider()).toBeUndefined()
  })

  it('with passengers inside: no question', () => {
    deploy()
    st().embarkBeforeBattle(st().game!.units.find((u) => u.datasheetId === 'rangers')!.id, dunerider()!.id)
    expect(st().finishDeployment()).toBe(true)
    expect(dunerider()).toBeDefined()
  })
})
