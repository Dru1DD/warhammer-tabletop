import { SCHEMA_VERSION } from './gameState'
import type { GameState, PlayerId } from './types'
import { PHASES } from './types'

export const SAVE_KEY = 'wh40k-training-save'

export interface SaveFile {
  schemaVersion: number
  savedAt: string
  /** which faction the human played */
  human?: PlayerId
  state: GameState
}

export function serialize(state: GameState, human?: PlayerId, now = new Date()): string {
  const file: SaveFile = { schemaVersion: SCHEMA_VERSION, savedAt: now.toISOString(), human, state }
  return JSON.stringify(file)
}

export type LoadResult = { ok: true; file: SaveFile } | { ok: false; reason: string }

/** Parse and sanity-check a save; never throws. */
export function deserialize(raw: string | null): LoadResult {
  if (!raw) return { ok: false, reason: 'Сохранение не найдено.' }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'Файл сохранения повреждён (неверный JSON).' }
  }
  const f = data as Partial<SaveFile>
  if (typeof f !== 'object' || f === null || typeof f.schemaVersion !== 'number')
    return { ok: false, reason: 'Неизвестный формат сохранения.' }
  if (f.schemaVersion !== SCHEMA_VERSION)
    return { ok: false, reason: `Сохранение от другой версии (схема ${f.schemaVersion}, нужна ${SCHEMA_VERSION}). Начните новую битву.` }
  const s = f.state as GameState | undefined
  const valid =
    !!s &&
    Array.isArray(s.units) &&
    s.units.every((u) => Array.isArray(u.models) && u.models.every((m) => Number.isFinite(m.pos?.x) && Number.isFinite(m.pos?.y))) &&
    PHASES.includes(s.phase) &&
    !!s.players?.marines && !!s.players?.orks &&
    Number.isFinite(s.board?.width) && Number.isFinite(s.round) && Number.isFinite(s.rng)
  if (!valid) return { ok: false, reason: 'Сохранение повреждено: не хватает данных о состоянии игры.' }
  return { ok: true, file: f as SaveFile }
}

export function saveToStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
