import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { seededRoller } from '../dice/dice'
import { apply, startGame } from '../engine'
import { addLog } from '../gameState'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState } from '../types'
import { bare } from './helpers'

describe('the battle log', () => {
  it('keeps every entry, not only the latest ones', () => {
    const s = bare()
    const before = s.log.length
    for (let i = 0; i < 1000; i++) addLog(s, `entry ${i}`)
    expect(s.log.length).toBe(before + 1000)
    expect(s.log[before].text).toBe('entry 0')
  })

  it('still has round 1 at the end of a whole AI-against-AI battle (battle of 13.11.2026)', { timeout: 300_000 }, () => {
    const r = seededRoller(7)
    let s: GameState = startGame(scenarioById('strike-force').build(['adeptus_mechanicus', 'orks']), r)
    const first = s.log[0]
    for (let i = 0; i < 4000 && !s.winner; i++) s = apply(s, decide(s, 'standard')!.cmd, r)
    expect(s.winner).toBeTruthy()
    expect(s.log.length).toBeGreaterThan(400)
    expect(s.log[0]).toEqual(first)
  })
})
