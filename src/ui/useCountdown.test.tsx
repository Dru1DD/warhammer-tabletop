import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountdown } from './useCountdown'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useCountdown', () => {
  it('is off without a limit, counts down whole seconds, and restarts for a new question', () => {
    expect(renderHook(() => useCountdown('q', 0)).result.current).toBeNull()
    const h = renderHook(({ k }) => useCountdown(k, 20_000), { initialProps: { k: 'q1' } })
    expect(h.result.current).toBe(20)
    act(() => { vi.advanceTimersByTime(5_100) })
    expect(h.result.current).toBe(15)
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(h.result.current).toBe(0)
    h.rerender({ k: 'q2' })
    expect(h.result.current).toBe(20)
  })
})
