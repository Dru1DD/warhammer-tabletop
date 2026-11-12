// Runs AI decisions in a Web Worker (see worker.ts) and falls back to the main thread where there are no
// workers (tests, old browsers) or the worker fails. The answer is the same either way: `decide` is pure.

import { decide, type AiDecision, type AiLevel } from './ai'
import type { GameState } from '../types'
import { locale } from '../../i18n/index'
import type { AiRequest, AiResponse } from './worker'

/** The part of the Worker interface used here (a test can pass a stand-in). */
export type AiWorkerLike = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((e: MessageEvent<AiResponse>) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
}

let worker: AiWorkerLike | null | undefined
let nextId = 1
const pending = new Map<number, { resolve: (d: AiDecision | null) => void; state: GameState; level: AiLevel }>()

/** Wire the replies of `w` to the waiting requests. */
function attach(w: AiWorkerLike) {
  w.onmessage = (e) => {
    const p = pending.get(e.data.id)
    if (!p) return
    pending.delete(e.data.id)
    if ('error' in e.data) p.resolve(decide(p.state, p.level)) // the same answer, computed here
    else p.resolve(e.data.decision)
  }
  w.onerror = () => {
    // the worker cannot run here: answer every waiting request on the main thread and stop using it
    w.terminate()
    worker = null
    for (const [id, p] of pending) {
      pending.delete(id)
      p.resolve(decide(p.state, p.level))
    }
  }
}

/** The worker, created on first use; null when workers are unavailable or the worker broke. */
function getWorker(): AiWorkerLike | null {
  if (worker !== undefined) return worker
  if (typeof Worker === 'undefined') return (worker = null)
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: locale }) as unknown as AiWorkerLike
  } catch {
    return (worker = null)
  }
  attach(worker)
  return worker
}

/**
 * The AI's decision for `state`, computed off the main thread when possible. The log and the dice log
 * are left out of the message: the AI never reads them, and they are the largest part of the state.
 */
export function decideAsync(state: GameState, level: AiLevel): Promise<AiDecision | null> {
  const w = getWorker()
  if (!w) return Promise.resolve(decide(state, level))
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, { resolve, state, level })
    w.postMessage({ id, state: { ...state, log: [], diceLog: [] }, level } satisfies AiRequest)
  })
}

/** Test hook: use `w` as the worker (null = no worker, undefined = create one on next use). */
export function resetAiWorker(w: AiWorkerLike | null | undefined = undefined) {
  if (worker) worker.terminate()
  pending.clear()
  worker = w
  if (w) attach(w)
}
