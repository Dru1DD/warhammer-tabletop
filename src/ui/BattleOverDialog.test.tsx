import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { started } from '../game/__tests__/helpers'
import { useStore } from '../store'

vi.mock('./Board', () => ({ Board: () => <div data-testid="board" /> }))

const finished = (winner: 'marines' | 'orks' | 'draw') => ({ ...started(), winner })

describe('battle-over dialog', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({ game: null, deploying: null, history: [], message: null })
  })

  it('shows on a finished game, links to the preview, closes, reopens', () => {
    useStore.setState({ game: finished('orks'), settings: { ...useStore.getState().settings, human: 'marines' } })
    render(<App />)
    expect(screen.getByRole('dialog', { name: 'Поражение' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /пример отчёта/ })).toHaveAttribute('href', expect.stringContaining('coach-preview.html'))
    fireEvent.click(screen.getByText('Закрыть'))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByLabelText('Итоги'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not show while the game is running', () => {
    useStore.setState({ game: started() })
    render(<App />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByLabelText('Итоги')).toBeNull()
  })
})
