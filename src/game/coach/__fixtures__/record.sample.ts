// Tiny deterministic BattleRecord built with the REAL engine: startGame (seed 7) on scenario 0,
// then scripted real commands that DO consume dice (an Advance roll and a shooting attack), each
// re-seeded from the state's own `rng` — exactly how replay() must resume dice. Computed at module
// load; no Date/Math.random. Commands are chosen from the engine's own validate(), first legal one.

import { seededRoller } from '../../dice/dice'
import { actor, apply, startGame, validate } from '../../engine'
import { SCENARIOS } from '../../scenarios/scenarios'
import type { Command, GameState } from '../../types'
import { COACH_RECORD_VERSION } from '../types'
import type { BattleRecord, RecordStep } from '../types'

/**
 * Reference implementation of `BattleRecord.tip.digest` (see its doc): FNV-1a 32-bit over
 * `"<unit.id>/<model.id>:<x.toFixed(2)>,<y.toFixed(2)>:<wounds>:<destroyed?1:0>|"` for every model in
 * `state.units` order, as 8 lower-case hex digits. The real record module must produce the same string.
 */
export function referenceDigest(s: GameState): string {
  let h = 0x811c9dc5
  for (const u of s.units)
    for (const m of u.models) {
      const text = `${u.id}/${m.id}:${m.pos.x.toFixed(2)},${m.pos.y.toFixed(2)}:${m.wounds}:${m.destroyed ? 1 : 0}|`
      for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
    }
  return (h >>> 0).toString(16).padStart(8, '0')
}

const initial = startGame(SCENARIOS[0].build(), seededRoller(7))

const steps: RecordStep[] = []
const states: GameState[] = [initial]
let state = initial

/** Records `cmd` (must be legal) and advances `state`, re-seeding the roller from the state's own rng. */
function play(cmd: Command): void {
  steps.push({ cmd, actor: actor(state) })
  state = apply(state, cmd, seededRoller(state.rng))
  states.push(state)
}

// 1. Command -> Movement (no dice).
play({ type: 'endPhase' })

// 2. The active player's first unit declares an Advance (rolls a D6 -> consumes dice, writes a dice entry).
const mover = state.units.find((u) => u.owner === state.activePlayer)!
play({ type: 'declareAdvance', unitId: mover.id })

// 3. ...and advances 3" toward the enemy (no dice).
const dx = mover.owner === 'marines' ? 3 : -3
const moved = state.units.find((u) => u.id === mover.id)!
play({
  type: 'move',
  unitId: mover.id,
  mode: 'advance',
  positions: Object.fromEntries(moved.models.map((m) => [m.id, { x: m.pos.x + dx, y: m.pos.y }])),
})

// 4. Movement -> Shooting (no dice); a reaction window the opponent gets is passed.
play({ type: 'endPhase' })
if (state.reaction) play({ type: 'passReaction' })

// 5. A shot: the first legal (unit, target, profile) combination, so attack dice are rolled.
const enemies = state.units.filter((u) => u.owner !== state.activePlayer)
const shooters = state.units.filter((u) => u.owner === state.activePlayer)
const shotCandidates: Command[] = shooters.flatMap((u) =>
  enemies.flatMap((t): Command[] => [
    { type: 'shoot', unitId: u.id, targetId: t.id },
    // after an Advance only Assault profiles may fire (Bolt Rifle profile 1 = Saturation)
    { type: 'shoot', unitId: u.id, targetId: t.id, profiles: { boltRifle: 1 } },
  ]),
)
const shot = shotCandidates.find((c) => validate(state, c).ok)
if (!shot) throw new Error('record.sample: no legal shot found for the scripted battle')
play(shot)

/** State after the last step (exported so tests can check `tip` without replay()). */
export const recordSampleFinalState: GameState = state

/** All states: `states[0]` = initial, `states[i + 1]` = state after `steps[i]`. */
export const recordSampleStates: readonly GameState[] = states

export const recordSample: BattleRecord = {
  version: COACH_RECORD_VERSION,
  scenarioId: initial.scenarioId,
  human: 'marines',
  aiLevel: 'standard',
  initial,
  steps,
  partial: false,
  tip: { nextId: state.nextId, rng: state.rng, digest: referenceDigest(state) },
}
