import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PanelBoundary } from './PanelBoundary'

let broken = true
function Flaky() {
  if (broken) throw new Error('нет живых моделей')
  return <p>панель работает</p>
}

describe('PanelBoundary', () => {
  it('a rendering error in a panel shows a notice next to the rest of the page, and «Повторить» renders it again', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    broken = true
    render(
      <div>
        <p>поле боя</p>
        <PanelBoundary name="Действия"><Flaky /></PanelBoundary>
      </div>,
    )
    expect(screen.getByText('поле боя')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Панель «Действия» не смогла отрисоваться: нет живых моделей')
    broken = false
    fireEvent.click(screen.getByText('Повторить'))
    expect(screen.getByText('панель работает')).toBeInTheDocument()
    quiet.mockRestore()
  })
})
