import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { actor } from '../engine'
import { decideAsync, resetAiWorker, type AiWorkerLike } from '../ai/aiClient'
import type { AiRequest, AiResponse } from '../ai/worker'
import { useStore } from '../../store'
import { started } from './helpers'

// The AI runs in a Web Worker in the browser. jsdom has no workers, so a stand-in runs `decide` on a
// structured clone of the message, replying on a later tick like a real worker would.
class FakeWorker implements AiWorkerLike {
  onmessage: AiWorkerLike['onmessage'] = null
  onerror: AiWorkerLike['onerror'] = null
  received: AiRequest[] = []
  terminated = false
  mode: 'ok' | 'error-reply' | 'crash'
  constructor(mode: 'ok' | 'error-reply' | 'crash' = 'ok') {
    this.mode = mode
  }
  postMessage(msg: AiRequest) {
    const copy = structuredClone(msg)
    this.received.push(copy)
    setTimeout(() => {
      if (this.mode === 'crash') return this.onerror?.(new ErrorEvent('error'))
      const reply: AiResponse = this.mode === 'error-reply' ? { id: copy.id, error: 'boom' } : { id: copy.id, decision: decide(copy.state, copy.level) }
      this.onmessage?.(new MessageEvent('message', { data: reply }))
    }, 0)
  }
  terminate() {
    this.terminated = true
  }
}

afterEach(() => resetAiWorker(undefined))

describe('decideAsync', () => {
  it('without workers it answers on the main thread, the same as decide', async () => {
    resetAiWorker(null)
    const s = started()
    expect(await decideAsync(s, 'standard')).toEqual(decide(s, 'standard'))
  })

  it('with a worker it posts the state without the logs and returns the worker\'s answer', async () => {
    const w = new FakeWorker()
    resetAiWorker(w)
    const s = started()
    expect(s.log.length + s.diceLog.length).toBeGreaterThan(0)
    expect(await decideAsync(s, 'standard')).toEqual(decide(s, 'standard'))
    expect(w.received).toHaveLength(1)
    expect(w.received[0].state.log).toEqual([])
    expect(w.received[0].state.diceLog).toEqual([])
    expect(w.received[0].state.units).toEqual(s.units)
  })

  it('falls back to the main thread when the worker reports an error or crashes', async () => {
    const s = started()
    resetAiWorker(new FakeWorker('error-reply'))
    expect(await decideAsync(s, 'beginner')).toEqual(decide(s, 'beginner'))
    const crashing = new FakeWorker('crash')
    resetAiWorker(crashing)
    expect(await decideAsync(s, 'beginner')).toEqual(decide(s, 'beginner'))
    expect(crashing.terminated).toBe(true)
    // after a crash it stays on the main thread
    expect(await decideAsync(s, 'standard')).toEqual(decide(s, 'standard'))
    expect(crashing.received).toHaveLength(1)
  })
})

describe('store: aiStepAsync', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({ game: null, match: null, history: [], deploying: null, review: null, aiThinking: false, aiActionsThisTurn: 0, aiNotes: [] })
    // the human plays the Orks, so the Marines (AI) act first in the training scenario
    useStore.getState().setSettings({ human: 'orks', opponent: 'marines', scenarioId: 'training-outpost', armies: {} })
  })

  /** A new battle where the AI (the Marines) has the next decision. */
  const aiToAct = () => {
    for (let i = 0; i < 30; i++) {
      useStore.getState().newGame()
      if (actor(useStore.getState().game!) === 'marines') return
    }
    throw new Error('the AI never got the first turn')
  }

  it('makes exactly the move the synchronous step makes, and shows that the AI is thinking meanwhile', async () => {
    resetAiWorker(new FakeWorker())
    aiToAct()
    const init = useStore.getState()
    expect(useStore.getState().aiStep()).toBe(true)
    const viaSync = JSON.stringify(useStore.getState().game)
    useStore.setState({ game: init.game, match: init.match, history: [], aiNotes: [], aiActionsThisTurn: 0 })
    const p = useStore.getState().aiStepAsync()
    expect(useStore.getState().aiThinking).toBe(true)
    expect(await p).toBe(true)
    expect(useStore.getState().aiThinking).toBe(false)
    expect(JSON.stringify(useStore.getState().game)).toBe(viaSync)
  })

  it('drops an answer for a game that moved on while the AI was thinking', async () => {
    resetAiWorker(new FakeWorker())
    aiToAct()
    const p = useStore.getState().aiStepAsync()
    // the player starts another battle before the answer arrives
    useStore.getState().newGame()
    const fresh = useStore.getState().game
    expect(await p).toBe(false)
    expect(useStore.getState().game).toBe(fresh)
  })

  it('does not start a second decision while one is in progress', async () => {
    const w = new FakeWorker()
    resetAiWorker(w)
    aiToAct()
    const a = useStore.getState().aiStepAsync()
    const b = useStore.getState().aiStepAsync()
    expect(await b).toBe(false)
    expect(await a).toBe(true)
    expect(w.received).toHaveLength(1)
  })
})
