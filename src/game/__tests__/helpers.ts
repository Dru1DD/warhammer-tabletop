import { seededRoller } from '../dice/dice'
import { apply, startGame } from '../engine'
import type { Roller } from '../dice/dice'
import { SCENARIOS, scenarioById } from '../scenarios/scenarios'
import type { GameState, Phase, PlayerId, UnitState, Vec } from '../types'

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

/**
 * Takes the characters out of every attached unit again: each becomes a unit of its own, with the id its models were
 * made with (the Combat Patrol rosters: 'lt', 'overlord', 'farseer', 'dominus', 'manipulus'), at the head of its army as
 * the rosters had them before attached units. For tests of a character on its own; attached units are tested in
 * attached.test.ts.
 */
export function detachAll(s: GameState, owners?: PlayerId[]): GameState {
  const chars: UnitState[] = []
  for (const u of s.units) {
    if (!u.attached?.length || (owners && !owners.includes(u.owner))) continue
    const names = u.name.split(' + ')
    u.attached.forEach((p, i) => {
      const models = u.models.filter((m) => p.models.includes(m.id))
      u.models = u.models.filter((m) => !p.models.includes(m.id))
      u.startingModels -= models.length
      const id = models[0].id.replace(/-\d+$/, '')
      const { attached: _a, ...rest } = u
      chars.push({ ...rest, id, datasheetId: p.datasheetId, name: names[i + 1] ?? id, models, startingModels: models.length })
    })
    u.name = names[0]
    delete u.attached
  }
  const out: UnitState[] = []
  for (const u of s.units) {
    if (!out.some((x) => x.owner === u.owner)) out.push(...chars.filter((c) => c.owner === u.owner))
    out.push(u)
  }
  s.units = out
  return s
}

/** Large-board battle between any two factions: no terrain, no objectives, given phase and active side. The rosters'
 * characters stand on their own unless `attached` (see detachAll). */
export function battle(west: PlayerId, east: PlayerId, phase: Phase = 'movement', active: PlayerId = west, attached = false): GameState {
  const s = scenarioById('combat-patrol').build([west, east])
  if (!attached) detachAll(s)
  s.terrain = []
  s.objectives = []
  s.phase = phase
  s.activePlayer = active
  s.firstPlayer = west
  return s
}

/** Move every model of a unit by (dx, dy). */
export function shift(s: GameState, unitId: string, dx: number, dy: number) {
  const u = s.units.find((x) => x.id === unitId)!
  for (const m of u.models) m.pos = { x: m.pos.x + dx, y: m.pos.y + dy }
}

/** Put the first model of a unit at `to` and shift the rest with it (keeps the formation). */
export function moveUnitTo(s: GameState, unitId: string, to: Vec) {
  const u = s.units.find((x) => x.id === unitId)!
  const dx = to.x - u.models[0].pos.x, dy = to.y - u.models[0].pos.y
  shift(s, unitId, dx, dy)
}

export const unit = (s: GameState, id: string) => s.units.find((x) => x.id === id)!

/** End the phase; a reaction window the other side gets is passed, so the game moves on as before reactions existed. */
export function endPhase(s: GameState, r: Roller): GameState {
  let x = apply(s, { type: 'endPhase' }, r)
  while (x.reaction && !x.winner) x = apply(x, { type: 'passReaction' }, r)
  return x
}
