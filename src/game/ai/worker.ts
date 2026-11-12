// Web Worker entry: runs the AI's `decide` off the main thread, so the page stays responsive while the
// AI thinks. It is the same pure function the store calls synchronously; only where it runs changes.

import type { AiDecision, AiLevel } from './ai'
import type { GameState } from '../types'

export interface AiRequest {
  id: number
  state: GameState
  level: AiLevel
}

export type AiResponse = { id: number; decision: AiDecision | null } | { id: number; error: string }

// `./ai` is imported dynamically on purpose: it pulls in the i18n module, which awaits the language catalog at the top
// level. A static import would delay this module, and the first message would arrive before `onmessage` is set and be
// lost (the AI then "thinks" forever in every language except English).
const ready = import('./ai')

self.onmessage = async (e: MessageEvent<AiRequest>) => {
  const { id, state, level } = e.data
  try {
    const decision = (await ready).decide(state, level)
    ;(self as unknown as Worker).postMessage({ id, decision } satisfies AiResponse)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies AiResponse)
  }
}
