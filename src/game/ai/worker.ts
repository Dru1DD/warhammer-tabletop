// Web Worker entry: runs the AI's `decide` off the main thread, so the page stays responsive while the
// AI thinks. It is the same pure function the store calls synchronously; only where it runs changes.

import { decide, type AiLevel } from './ai'
import type { GameState } from '../types'

export interface AiRequest {
  id: number
  state: GameState
  level: AiLevel
}

export type AiResponse = { id: number; decision: ReturnType<typeof decide> } | { id: number; error: string }

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const { id, state, level } = e.data
  try {
    const decision = decide(state, level)
    ;(self as unknown as Worker).postMessage({ id, decision } satisfies AiResponse)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies AiResponse)
  }
}
