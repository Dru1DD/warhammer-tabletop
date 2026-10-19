import { seededRoller } from '../dice/dice'
import { startGame } from '../engine'
import { SCENARIOS } from '../scenarios/scenarios'
import type { GameState, Phase, PlayerId, Vec } from '../types'

/** Fresh scenario state, no terrain, at the given phase for the given player. */
export function bare(phase: Phase = 'movement', active: PlayerId = 'marines'): GameState {
  const s = SCENARIOS[0].build()
  s.terrain = []
  s.objectives = []
  s.phase = phase
  s.activePlayer = active
  s.firstPlayer = 'marines'
  return s
}

export function place(s: GameState, unitId: string, positions: Vec[]) {
  const u = s.units.find((x) => x.id === unitId)!
  u.models.forEach((m, i) => {
    if (positions[i]) m.pos = positions[i]
    else m.destroyed = true
  })
}

export const started = (seed = 42) => startGame(SCENARIOS[0].build(), seededRoller(seed))

/** Column of n positions spaced 1.5" apart vertically. */
export const column = (x: number, y: number, n: number, gap = 1.5): Vec[] => Array.from({ length: n }, (_, i) => ({ x, y: y + i * gap }))
