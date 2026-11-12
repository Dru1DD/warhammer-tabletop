import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { seededRoller } from '../dice/dice'
import { apply, startGame } from '../engine'
import { enemiesOf, unitDistance } from '../gameState'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState } from '../types'

/** Let the AI play the Tyranids' first Movement phase; distance of the Hormagaunts to the nearest enemy before and after. */
function firstMove(seed: number): { before: number; after: number } {
  const r = seededRoller(seed)
  let s: GameState = startGame(scenarioById('combat-patrol').build(['tyranids', 'adeptus_mechanicus']), r)
  // play on (both AIs) until the Tyranids' own Movement phase of round 1 is over
  const near = (g: GameState) => {
    const h = g.units.find((u) => u.owner === 'tyranids' && u.datasheetId === 'hormagaunts')!
    return Math.min(...enemiesOf(g, h).map((e) => unitDistance(h, e)))
  }
  let before = NaN
  for (let i = 0; i < 400 && !s.winner; i++) {
    if (s.activePlayer === 'tyranids' && s.phase === 'movement' && Number.isNaN(before)) before = near(s)
    if (!Number.isNaN(before) && (s.phase !== 'movement' || s.activePlayer !== 'tyranids')) break
    s = apply(s, decide(s, 'standard')!.cmd, r)
  }
  return { before, after: near(s) }
}

describe('melee swarms close in', () => {
  it('Hormagaunts far from the enemy run at it instead of waiting in cover (battle of 12.11.2026)', { timeout: 120_000 }, () => {
    for (const seed of [1, 2]) {
      const { before, after } = firstMove(seed)
      expect(before).toBeGreaterThan(12)
      // M10″ (plus an Advance): they should end at least 6″ closer
      expect(before - after).toBeGreaterThanOrEqual(6)
    }
  })
})
