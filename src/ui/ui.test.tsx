import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { useStore } from '../store'

// Konva needs a real canvas; the board is covered by engine/transform tests.
vi.mock('./Board', () => ({ Board: () => <div data-testid="board" /> }))

describe('UI', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({ game: null, message: null, history: [] })
  })

  it('starts a game in Russian with both factions selectable', () => {
    render(<App />)
    expect(screen.getByText('Тренировочный стол 40K')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Орки'))
    fireEvent.click(screen.getByText('Начать новую битву'))
    expect(useStore.getState().settings.human).toBe('orks')
    expect(screen.getByTestId('board')).toBeInTheDocument()
    expect(screen.getAllByText(/Бойз/).length).toBeGreaterThan(0)
  })

  it('shows a specific reason for an unavailable action', () => {
    useStore.getState().newGame({ human: 'marines', tutorial: false })
    const g = useStore.getState().game!
    // force a human shooting phase with enemies out of range
    useStore.setState({ game: { ...g, activePlayer: 'marines', phase: 'shooting' }, selectedUnitId: 'lt' })
    render(<App />)
    expect(screen.getByText(/цель на .* дальность 12″|Нет оружия/)).toBeInTheDocument()
    expect(screen.getByText('Стрелять по «Бойз»')).toBeDisabled()
  })

  it('saves and restores a game, and undoes dice-free moves', () => {
    const st = useStore.getState()
    st.newGame({ human: 'marines', tutorial: false })
    const g = useStore.getState().game!
    useStore.setState({ game: { ...g, activePlayer: 'marines', phase: 'movement' } })
    const ok = useStore.getState().dispatch({ type: 'move', unitId: 'lt', mode: 'normal', positions: { 'lt-0': { x: 2.5, y: 16.5 } } })
    expect(ok).toBe(true)
    expect(useStore.getState().history).toHaveLength(1)
    useStore.getState().save()
    useStore.getState().undo()
    expect(useStore.getState().game!.units[0].models[0].pos).toEqual({ x: 2.5, y: 11 })
    expect(useStore.getState().load()).toBe(true)
    expect(useStore.getState().game!.units[0].models[0].pos).toEqual({ x: 2.5, y: 16.5 })
  })

  it('rejects an illegal command without changing state', () => {
    useStore.getState().newGame({ human: 'marines', tutorial: false })
    const g = useStore.getState().game!
    useStore.setState({ game: { ...g, activePlayer: 'marines', phase: 'movement' } })
    const before = useStore.getState().game
    expect(useStore.getState().dispatch({ type: 'move', unitId: 'lt', mode: 'normal', positions: { 'lt-0': { x: 20, y: 11 } } })).toBe(false)
    expect(useStore.getState().game).toBe(before)
    expect(useStore.getState().message?.text).toContain('больше допустимых')
  })
})

describe('store conveniences', () => {
  beforeEach(() => localStorage.clear())
  it('persists custom token photos in localStorage', () => {
    expect(useStore.getState().setCustomToken('nob', 'data:image/jpeg;base64,abc')).toBe(true)
    expect(JSON.parse(localStorage.getItem('wh40k-training-tokens')!)).toEqual({ nob: 'data:image/jpeg;base64,abc' })
    useStore.getState().setCustomToken('nob', null)
    expect(useStore.getState().customTokens).toEqual({})
  })
  it('auto-selects an actionable unit when the phase changes to the human', () => {
    useStore.getState().newGame({ human: 'marines', tutorial: false })
    const g = useStore.getState().game!
    useStore.setState({ game: { ...g, activePlayer: 'marines', phase: 'command' }, selectedUnitId: null })
    useStore.getState().dispatch({ type: 'endPhase' })
    expect(useStore.getState().game!.phase).toBe('movement')
    expect(useStore.getState().selectedUnitId).toBe('lt')
  })
})
