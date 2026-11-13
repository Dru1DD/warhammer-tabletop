import type { GameState, ModelState, PlayerId, Vec } from '../game/types'

/** A model that was alive before an action and is destroyed after it: the board keeps drawing it as a "ghost" and
 * removes it at `delay` ms, so casualties disappear one after another instead of all at once. */
export interface Casualty {
  model: ModelState
  owner: PlayerId
  pos: Vec
  delay: number
}

/** Total time the casualties of one action are spread over (ms), and the longest gap between two of them. */
const SPREAD_MS = 2400
const MAX_GAP_MS = 260

/** Models alive in `prev` and destroyed in `next`, in table order (unit by unit), each with its turn to fall. */
export function casualties(prev: GameState, next: GameState): Casualty[] {
  const was = new Map<string, { pos: Vec; owner: PlayerId }>()
  for (const u of prev.units) for (const m of u.models) if (!m.destroyed) was.set(m.id, { pos: m.pos, owner: u.owner })
  const dead: Omit<Casualty, 'delay'>[] = []
  for (const u of next.units)
    for (const m of u.models) {
      const before = m.destroyed && was.get(m.id)
      if (before) dead.push({ model: m, owner: before.owner, pos: before.pos })
    }
  const gap = Math.min(MAX_GAP_MS, SPREAD_MS / Math.max(1, dead.length))
  return dead.map((c, i) => ({ ...c, delay: i * gap }))
}

/** Seconds a model takes to slide `inches` across the table. */
export const moveSeconds = (inches: number) => Math.min(0.6, 0.25 + inches * 0.04)

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
