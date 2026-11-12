import { describe, expect, it } from 'vitest'
import { chargeWarning } from './game/chargeAdvice'
import { unitDistance } from './game/gameState'
import { useStore } from './store'
import type { GameState, Vec } from './game/types'

const st = () => useStore.getState()

/** A fresh training battle in the marines' Charge phase: the Lieutenant `gap`″ (edge to edge, roughly) from the Boyz. */
function setup(gap: number, explain: 'beginner' | 'minimal' = 'beginner') {
  localStorage.clear()
  useStore.setState({ game: null, match: null, history: [], message: null, deploying: null, review: null, chargeConfirm: null, chargeOk: null })
  st().newGame({ human: 'marines', tutorial: false, explain })
  const g: GameState = structuredClone(st().game!)
  g.phase = 'charge'
  g.activePlayer = 'marines'
  const lt = g.units.find((u) => u.id === 'lt')!
  const boyz = g.units.find((u) => u.id === 'boyz')!
  // only these two stay on the board
  for (const u of g.units) if (u !== lt && u !== boyz) for (const m of u.models) m.destroyed = true
  lt.models[0].pos = { x: 4, y: 15 }
  boyz.models.forEach((m, i) => (m.pos = { x: 4 + 1 + gap + 1 + (i % 2) * 1.2, y: 10 + Math.floor(i / 2) * 1.2 } as Vec))
  useStore.setState({ game: g })
  return { lt: g.units.find((u) => u.id === 'lt')!, boyz }
}

describe('a risky charge asks first', () => {
  it('the Lieutenant alone into a mob of Boyz from afar: a warning with the chance and the trade', () => {
    const { lt, boyz } = setup(10)
    expect(unitDistance(lt, boyz)).toBeGreaterThan(9)
    const w = chargeWarning(st().game!, lt)!
    expect(w.why.join(' ')).toMatch(/Мало шансов дойти/)
    expect(st().dispatch({ type: 'declareCharge', unitId: 'lt' })).toBe(false)
    expect(st().chargeConfirm?.unitId).toBe('lt')
    expect(st().game!.units.find((u) => u.id === 'lt')!.chargeDeclared).toBe(false)
  })

  it('«Отмена» drops it, «Атаковать всё равно» declares it', () => {
    setup(10)
    st().dispatch({ type: 'declareCharge', unitId: 'lt' })
    st().confirmCharge(false)
    expect(st().chargeConfirm).toBeNull()
    expect(st().game!.units.find((u) => u.id === 'lt')!.chargeDeclared).toBe(false)
    st().dispatch({ type: 'declareCharge', unitId: 'lt' })
    st().confirmCharge(true)
    expect(st().chargeConfirm).toBeNull()
    expect(st().game!.units.find((u) => u.id === 'lt')!.chargeDeclared).toBe(true)
  })

  it('no question in the «minimal» explanation mode', () => {
    setup(10, 'minimal')
    expect(st().dispatch({ type: 'declareCharge', unitId: 'lt' })).toBe(true)
    expect(st().chargeConfirm).toBeNull()
  })
})
