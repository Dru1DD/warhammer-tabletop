import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { started } from '../game/__tests__/helpers'
import { bare, column, place } from '../game/__tests__/helpers'
import { getUnit } from '../game/gameState'
import { serialize } from '../game/persistence'
import { AUTOSAVE_KEY, TUTORIAL_KEY, useStore } from '../store'
import { deploymentHint, endPhaseWarning, nextStepHint } from './guidance'
import { LESSONS } from './help'

vi.mock('./Board', () => ({ Board: () => <div data-testid="board" /> }))

const reset = () => {
  localStorage.clear()
  useStore.setState({ game: null, message: null, history: [], deploying: null, deployHistory: [], draft: {}, tutorialDone: [] })
}

describe('guided deployment (store)', () => {
  beforeEach(reset)

  for (const human of ['marines', 'orks'] as const) {
    it(`${human}: place units, undo, finish into round 1 without touching the old autosave`, () => {
      localStorage.setItem(AUTOSAVE_KEY, 'old-game')
      const st = useStore.getState()
      st.startDeployment({ human, tutorial: false })
      expect(useStore.getState().deploying).toEqual({ placed: [] })
      expect(useStore.getState().aiStep()).toBe(false) // AI waits during setup
      expect(useStore.getState().dispatch({ type: 'endPhase' })).toBe(false)
      expect(useStore.getState().finishDeployment()).toBe(false)
      expect(useStore.getState().message?.text).toContain('ещё не расставлен')

      const mine = useStore.getState().game!.units.filter((u) => u.owner === human)
      const first = mine[0]
      // illegal: drag a model into the middle of the board
      useStore.getState().select(first.id)
      useStore.getState().setDraft({ [first.models[0].id]: { x: 15, y: 11 } })
      expect(useStore.getState().placeUnit(first.id)).toBe(false)
      expect(useStore.getState().message?.text).toContain('зоне развёртывания')
      // legal: confirm suggested placement, then undo it
      useStore.getState().clearDraft()
      expect(useStore.getState().placeUnit(first.id)).toBe(true)
      expect(useStore.getState().deploying!.placed).toEqual([first.id])
      useStore.getState().undo()
      expect(useStore.getState().deploying!.placed).toEqual([])

      useStore.getState().autoDeploy()
      expect(useStore.getState().deploying!.placed.sort()).toEqual(mine.map((u) => u.id).sort())
      expect(localStorage.getItem(AUTOSAVE_KEY)).toBe('old-game')

      expect(useStore.getState().finishDeployment()).toBe(true)
      const g = useStore.getState().game!
      expect(useStore.getState().deploying).toBeNull()
      expect(g.phase).toBe('command')
      expect(g.diceLog[0].title).toContain('первый ход')
      expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBe('old-game')
    })
  }

  it('moves a whole unit inside the zone and keeps the new positions', () => {
    useStore.getState().startDeployment({ human: 'marines', tutorial: false })
    useStore.getState().select('lt')
    useStore.getState().setDraft({ 'lt-0': { x: 2, y: 3 } })
    expect(useStore.getState().placeUnit('lt')).toBe(true)
    expect(getUnit(useStore.getState().game!, 'lt').models[0].pos).toEqual({ x: 2, y: 3 })
    expect(useStore.getState().selectedUnitId).toBe('int') // next unplaced unit
  })

  it('loading a save leaves deployment mode', () => {
    localStorage.setItem('wh40k-training-save', serialize(started(5), 'marines'))
    useStore.getState().startDeployment({ human: 'marines' })
    expect(useStore.getState().load()).toBe(true)
    expect(useStore.getState().deploying).toBeNull()
  })

  it('renders the four deployment steps and the start button', () => {
    useStore.getState().startDeployment({ human: 'marines', tutorial: false })
    render(<App />)
    expect(screen.getByText('1. Ваша армия')).toBeInTheDocument()
    expect(screen.getByText('4. Проверка')).toBeInTheDocument()
    expect(screen.getByText('Начать битву ▶')).toBeDisabled()
    fireEvent.click(screen.getByText('Оставить остальных на предложенных местах'))
    expect(screen.getByText('Начать битву ▶')).toBeEnabled()
    fireEvent.click(screen.getByText('Начать битву ▶'))
    expect(useStore.getState().deploying).toBeNull()
  })
})

describe('movement draft', () => {
  beforeEach(reset)
  it('cancel restores the original positions; confirm commits them', () => {
    useStore.getState().newGame({ human: 'marines', tutorial: false })
    const g = useStore.getState().game!
    useStore.setState({ game: { ...g, activePlayer: 'marines', phase: 'movement' }, selectedUnitId: 'lt' })
    useStore.getState().setDraft({ 'lt-0': { x: 2.5, y: 15 } })
    useStore.getState().clearDraft()
    expect(useStore.getState().draft).toEqual({})
    expect(getUnit(useStore.getState().game!, 'lt').models[0].pos).toEqual({ x: 2.5, y: 11 })
    useStore.getState().setDraft({ 'lt-0': { x: 2.5, y: 15 } })
    expect(useStore.getState().dispatch({ type: 'move', unitId: 'lt', mode: 'normal', positions: useStore.getState().draft })).toBe(true)
    expect(getUnit(useStore.getState().game!, 'lt').models[0].pos).toEqual({ x: 2.5, y: 15 })
  })
})

describe('phase guidance', () => {
  const ui = { selectedUnitId: null, draft: {}, measuring: false }
  it('reminds about optional actions before ending a phase, only while units can act', () => {
    const s = bare('movement')
    expect(endPhaseWarning(s, 'marines')).toContain('«Лейтенант»')
    expect(endPhaseWarning(s, 'marines')).toContain('необязательно')
    for (const u of s.units) u.move = 'normal'
    expect(endPhaseWarning(s, 'marines')).toBeNull()
    expect(endPhaseWarning(bare('command'), 'marines')).toBeNull()
    expect(endPhaseWarning(s, 'orks')).toBeNull() // not their turn
  })
  it('says the phase is optional, and explains consequences after a move', () => {
    const s = bare('movement')
    expect(nextStepHint(s, 'marines', ui).text).toContain('необязательно')
    getUnit(s, 'int').move = 'advance'
    const h = nextStepHint(s, 'marines', { ...ui, selectedUnitId: 'int' })
    expect(h.text).toContain('уже переместился')
    expect(h.text).toContain('Assault')
    for (const u of s.units) u.move = 'normal'
    expect(nextStepHint(s, 'marines', ui).text).toContain('больше нечего делать')
  })
  it('shooting with nothing in range is "nothing to do", not a requirement', () => {
    const s = bare('shooting')
    place(s, 'int', column(1, 5, 5))
    place(s, 'lt', [{ x: 1, y: 14 }])
    place(s, 'boyz', column(28.5, 5, 6))
    expect(endPhaseWarning(s, 'marines')).toBeNull()
    expect(nextStepHint(s, 'marines', ui).text).toContain('больше нечего делать')
  })
  it('deployment hint explains an illegal placement with the engine reason', () => {
    const s = bare('command')
    const bad = deploymentHint(s, 'marines', { selectedUnitId: 'lt', draft: { 'lt-0': { x: 15, y: 11 } }, placed: [] })
    expect(bad.tone).toBe('warn')
    expect(bad.text).toContain('зоне развёртывания')
    expect(deploymentHint(s, 'marines', { selectedUnitId: null, draft: {}, placed: ['lt', 'int'] }).text).toContain('Начать битву')
  })
})

describe('tutorial progress', () => {
  beforeEach(reset)
  it('is stored by lesson id, survives a new game and can be reset', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length)
    useStore.getState().newGame({ human: 'marines', tutorial: true })
    useStore.getState().completeLesson('measure') // done out of order
    expect(JSON.parse(localStorage.getItem(TUTORIAL_KEY)!)).toEqual(['measure'])
    useStore.getState().newGame()
    expect(useStore.getState().tutorialDone).toEqual(['measure'])
    useStore.getState().resetTutorial()
    expect(useStore.getState().tutorialDone).toEqual([])
  })
  it('auto-completes the deployment lesson for a quick start and shows the next one', () => {
    useStore.getState().newGame({ human: 'marines', tutorial: true })
    render(<App />)
    expect(useStore.getState().tutorialDone).toContain('deploy')
    expect(screen.getByLabelText('Обучение')).toHaveTextContent('Знакомство с отрядами')
    fireEvent.click(screen.getByText('Пропустить шаг'))
    expect(screen.getByLabelText('Обучение')).toHaveTextContent('Измерение')
  })
})

describe('save compatibility', () => {
  beforeEach(reset)
  it('loads a save written before these changes (same schema, no new fields)', () => {
    const s = started(9)
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ schemaVersion: 1, savedAt: '2026-01-01T00:00:00.000Z', human: 'orks', state: s }))
    expect(useStore.getState().load(AUTOSAVE_KEY)).toBe(true)
    expect(useStore.getState().game).toEqual(s)
    expect(useStore.getState().settings.human).toBe('orks')
  })
})

describe('phase status', () => {
  it('fight in progress and a pending charge are not optional', async () => {
    const { phaseStatus } = await import('./guidance')
    const s = bare('fight')
    place(s, 'int', column(10, 5, 5))
    place(s, 'boyz', column(11.5, 5, 6))
    s.fight = { selecting: 'marines', step: 'rest' }
    const f = phaseStatus(s, 'marines')
    expect(f.canEnd).toBe(false)
    expect(f.reason).toContain('должны сражаться')
    const c = bare('charge')
    c.pendingCharge = { unitId: 'int', roll: 8, dice: [4, 4], targets: ['boyz'] }
    expect(phaseStatus(c, 'marines').canEnd).toBe(false)
    expect(phaseStatus(bare('movement'), 'marines')).toMatchObject({ canEnd: true })
  })
})

describe('slower, explained shooting', () => {
  beforeEach(reset)
  const shootingState = (explain: 'beginner' | 'minimal') => {
    useStore.getState().newGame({ human: 'marines', tutorial: false, explain })
    const s = bare('shooting')
    place(s, 'int', column(10, 5, 5))
    place(s, 'boyz', column(20, 5, 6))
    useStore.setState({ game: s, selectedUnitId: 'int' })
  }
  it('opens a step-by-step review after an attack and pauses the AI until closed', () => {
    shootingState('beginner')
    useStore.getState().setAim('boyz')
    expect(useStore.getState().dispatch({ type: 'shoot', unitId: 'int', targetId: 'boyz' })).toBe(true)
    expect(useStore.getState().aimTargetId).toBeNull()
    expect(useStore.getState().review).not.toBeNull()
    render(<App />)
    const region = screen.getByRole('region', { name: 'Разбор атаки' })
    expect(region).toHaveTextContent('1. Попадание')
    expect(region).toHaveTextContent('по одному на каждую атаку')
    fireEvent.click(screen.getByText('Дальше ▶'))
    expect(region).toHaveTextContent('Силы оружия против Стойкости')
    // hand the turn to the AI: it must wait while the review is open
    useStore.setState({ game: { ...useStore.getState().game!, activePlayer: 'orks' } })
    expect(useStore.getState().aiStep()).toBe(false)
    fireEvent.click(screen.getByText('Пропустить разбор'))
    expect(useStore.getState().review).toBeNull()
  })
  it('independent style keeps the fast flow (no review)', () => {
    shootingState('minimal')
    useStore.getState().dispatch({ type: 'shoot', unitId: 'int', targetId: 'boyz' })
    expect(useStore.getState().review).toBeNull()
  })
  it('selecting another unit drops the picked target', () => {
    shootingState('beginner')
    useStore.getState().setAim('boyz')
    useStore.getState().select('lt')
    expect(useStore.getState().aimTargetId).toBeNull()
  })
})

describe('moving part of a unit', () => {
  it('one or two models may move while the rest stay, if the unit stays coherent', async () => {
    const { validate } = await import('../game/engine')
    const s = bare('movement')
    place(s, 'int', column(5, 5, 5, 2))
    place(s, 'boyz', column(25, 5, 6))
    expect(validate(s, { type: 'move', unitId: 'int', mode: 'normal', positions: { 'int-0': { x: 6.5, y: 5 } } }).ok).toBe(true)
    expect(validate(s, { type: 'move', unitId: 'int', mode: 'normal', positions: { 'int-0': { x: 6.5, y: 5 }, 'int-1': { x: 6.5, y: 7 } } }).ok).toBe(true)
    const far = validate(s, { type: 'move', unitId: 'int', mode: 'normal', positions: { 'int-0': { x: 10, y: 5 } } })
    expect(far.ok).toBe(false)
    if (!far.ok) expect(far.reason).toContain('связность')
  })
})

describe('characteristics help', () => {
  beforeEach(reset)
  it('every column header has a tooltip and the glossary explains it', () => {
    useStore.getState().newGame({ human: 'marines', tutorial: false, explain: 'beginner' })
    useStore.setState({ selectedUnitId: 'lt', layout: { roster: true, log: false } })
    render(<App />)
    for (const k of ['M', 'T', 'Sv', 'W', 'Ld', 'OC', 'A', 'BS/WS', 'S', 'AP', 'D']) {
      const abbr = screen.getAllByText(k, { selector: 'abbr' })[0]
      expect(abbr.getAttribute('title')).toBeTruthy()
    }
    expect(screen.getByTitle(/Стойкость \(Toughness\)/)).toBeInTheDocument()
    expect(screen.getByText('Что значат эти буквы?')).toBeInTheDocument()
  })
})

describe('custom terrain', () => {
  beforeEach(reset)
  it('is editable only during setup, undoable, and reused for the next game of that scenario', async () => {
    const { newPiece } = await import('../game/terrainLayout')
    const { TERRAIN_KEY } = await import('../store')
    useStore.getState().startDeployment({ human: 'marines', tutorial: false, scenarioId: 'training-outpost' })
    const g = useStore.getState().game!
    const n = g.terrain.length
    useStore.getState().editTerrain([...g.terrain, newPiece(g, 'ruin')])
    expect(useStore.getState().game!.terrain).toHaveLength(n + 1)
    expect(JSON.parse(localStorage.getItem(TERRAIN_KEY)!)['training-outpost']).toHaveLength(n + 1)
    useStore.getState().undo()
    expect(useStore.getState().game!.terrain).toHaveLength(n)
    useStore.getState().editTerrain(g.terrain.slice(1))
    useStore.getState().autoDeploy()
    useStore.getState().finishDeployment()
    // battle started: edits are ignored
    useStore.getState().editTerrain([])
    expect(useStore.getState().game!.terrain).toHaveLength(n - 1)
    // a new game of the same scenario uses the saved layout; reset restores the scenario
    useStore.getState().newGame({ scenarioId: 'training-outpost' })
    expect(useStore.getState().game!.terrain).toHaveLength(n - 1)
    useStore.getState().startDeployment()
    useStore.getState().resetTerrain()
    expect(useStore.getState().game!.terrain).toHaveLength(n)
    expect(JSON.parse(localStorage.getItem(TERRAIN_KEY)!)['training-outpost']).toBeUndefined()
  })
  it('falls back to the scenario terrain when the saved layout is corrupt', () => {
    localStorage.setItem('wh40k-training-terrain', JSON.stringify({ 'training-outpost': [{ id: 'x' }] }))
    useStore.getState().newGame({ scenarioId: 'training-outpost' })
    expect(useStore.getState().game!.terrain.length).toBeGreaterThan(0)
    expect(useStore.getState().game!.terrain[0].id).toBe('t1')
  })
})

describe('compact layout', () => {
  beforeEach(reset)
  it('collapses roster and log on small screens, expands on demand and remembers it', () => {
    useStore.getState().newGame({ human: 'marines', tutorial: false })
    useStore.setState({ layout: { roster: false, log: false } })
    render(<App />)
    // rail still selects units
    fireEvent.click(screen.getByRole('button', { name: 'Интерсессоры' }))
    expect(useStore.getState().selectedUnitId).toBe('int')
    expect(screen.queryByLabelText('Карточка отряда')).toBeNull()
    fireEvent.click(screen.getByLabelText('Показать отряды'))
    expect(screen.getByLabelText('Карточка отряда')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/▲ Журнал/))
    expect(screen.getByText('▼ Свернуть')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('wh40k-training-layout')!)).toEqual({ roster: true, log: true })
  })
})
