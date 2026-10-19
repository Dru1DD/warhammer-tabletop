import type { Vec } from '../game/types'

// The only world (inches) <-> screen (CSS px) conversion in the app.
// screen = offset + world * scale, where scale = pixels per inch.

export interface Viewport {
  scale: number
  x: number
  y: number
}

export const MIN_SCALE = 6
export const MAX_SCALE = 120

export const worldToScreen = (v: Viewport, p: Vec): Vec => ({ x: v.x + p.x * v.scale, y: v.y + p.y * v.scale })
export const screenToWorld = (v: Viewport, p: Vec): Vec => ({ x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale })

/** Zoom by `factor` keeping the world point under `screen` fixed. */
export function zoomAt(v: Viewport, screen: Vec, factor: number): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
  const w = screenToWorld(v, screen)
  return { scale, x: screen.x - w.x * scale, y: screen.y - w.y * scale }
}

/** Fit a board of `board` inches into a `w`×`h` px area with `margin` px. */
export function fitBoard(board: { width: number; height: number }, w: number, h: number, margin = 24): Viewport {
  const scale = Math.max(MIN_SCALE, Math.min((w - 2 * margin) / board.width, (h - 2 * margin) / board.height))
  return { scale, x: (w - board.width * scale) / 2, y: (h - board.height * scale) / 2 }
}

/** Clamp `p` to within `max` inches of `origin`. */
export function clampToRadius(origin: Vec, p: Vec, max: number): Vec {
  const dx = p.x - origin.x, dy = p.y - origin.y
  const d = Math.hypot(dx, dy)
  if (d <= max || d === 0) return p
  return { x: origin.x + (dx / d) * max, y: origin.y + (dy / d) * max }
}
