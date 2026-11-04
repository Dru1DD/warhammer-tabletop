// Tiny deterministic BattleRecord built with the real engine: startGame (seed 7) on scenario 0,
// then a few real commands applied with apply(), each re-seeded from the state's own `rng`
// (exactly how replay() must resume dice). Computed at module load; no Date/Math.random.

import { seededRoller } from '../../dice/dice'
import { actor, apply, startGame } from '../../engine'
import { SCENARIOS } from '../../scenarios/scenarios'
import type { Command, GameState } from '../../types'
import { COACH_RECORD_VERSION } from '../types'
import type { BattleRecord, RecordStep } from '../types'

const initial = startGame(SCENARIOS[0].build(), seededRoller(7))

/** Commands in order: end Command, move the Intercessors 3" toward the enemy (normal), end Movement. Which side moves depends on the roll-off, so the move targets the first player's first unit. */
function script(s: GameState): Command[] {
  const unit = s.units.find((u) => u.owner === s.activePlayer)!
  const dx = unit.owner === 'marines' ? 3 : -3
  const positions = Object.fromEntries(unit.models.map((m) => [m.id, { x: m.pos.x + dx, y: m.pos.y }]))
  return [{ type: 'endPhase' }, { type: 'move', unitId: unit.id, mode: 'normal', positions }, { type: 'endPhase' }]
}

const steps: RecordStep[] = []
let state = initial
for (const cmd of script(initial)) {
  steps.push({ cmd, actor: actor(state) })
  state = apply(state, cmd, seededRoller(state.rng))
}

/** State after the last step (exported so tests can check `tip` without replay()). */
export const recordSampleFinalState: GameState = state

export const recordSample: BattleRecord = {
  version: COACH_RECORD_VERSION,
  scenarioId: initial.scenarioId,
  human: 'marines',
  aiLevel: 'standard',
  explain: 'standard',
  initial,
  steps,
  partial: false,
  tip: { nextId: state.nextId, rng: state.rng },
}
