import { describe, expect, it } from 'vitest'
import { tokenImageFor } from '../assets/manifest'
import { PORTRAIT_PROFILES, portraitFor } from '../assets/tokenArt'
import { PROFILES } from '../game/data/datasheets'
import { getUnit } from '../game/gameState'
import { bare, column, place } from '../game/__tests__/helpers'
import { actionableUnits, canActNow, nextPhaseLabel, nextStepHint, targetCommand } from './guidance'

const ui = { selectedUnitId: null, draft: {}, measuring: false }

describe('guidance', () => {
  it('lists units that can still move, and drops them after moving', () => {
    const s = bare('movement')
    expect(actionableUnits(s, 'marines').map((u) => u.id)).toEqual(['lt', 'int'])
    getUnit(s, 'lt').move = 'normal'
    expect(actionableUnits(s, 'marines').map((u) => u.id)).toEqual(['int'])
    expect(actionableUnits(s, 'orks')).toEqual([]) // not their turn
  })
  it('shooting: only units with a legal target can act', () => {
    const s = bare('shooting')
    place(s, 'int', column(1, 5, 5))
    place(s, 'boyz', column(28.5, 5, 6))
    expect(canActNow(s, getUnit(s, 'int'))).toBe(false) // >24″ away
    place(s, 'boyz', column(14, 5, 6))
    expect(canActNow(s, getUnit(s, 'int'))).toBe(true)
  })
  it('click on an enemy maps to the phase command', () => {
    const s = bare('shooting')
    expect(targetCommand(s, getUnit(s, 'int'), getUnit(s, 'boyz'))).toEqual({ type: 'shoot', unitId: 'int', targetId: 'boyz' })
    s.phase = 'movement'
    expect(targetCommand(s, getUnit(s, 'int'), getUnit(s, 'boyz'))).toBeNull()
  })
  it('hints describe the next step and the illegal-draft reason', () => {
    const s = bare('movement')
    expect(nextStepHint(s, 'marines', ui).text).toContain('зелёной рамкой')
    expect(nextStepHint(s, 'orks', ui).tone).toBe('wait')
    const bad = nextStepHint(s, 'marines', { ...ui, selectedUnitId: 'lt', draft: { 'lt-0': { x: 20, y: 11 } } })
    expect(bad.tone).toBe('warn')
    expect(bad.text).toContain('больше допустимых')
    expect(nextPhaseLabel(s)).toBe('Далее: Стрельба')
    s.phase = 'fight'
    expect(nextPhaseLabel(s)).toBe('Завершить ход')
  })
})

describe('token art', () => {
  it('has an original SVG portrait for every model profile', () => {
    expect(PORTRAIT_PROFILES.sort()).toEqual(Object.keys(PROFILES).sort())
    for (const id of PORTRAIT_PROFILES) expect(decodeURIComponent(portraitFor(id)!)).toMatch(/^data:image\/svg\+xml;charset=utf-8,<svg/)
  })
  it('prefers the player photo over the built-in portrait', () => {
    expect(tokenImageFor('boy')).toBe(portraitFor('boy'))
    expect(tokenImageFor('boy', { boy: 'data:image/jpeg;base64,xx' })).toBe('data:image/jpeg;base64,xx')
  })
})
