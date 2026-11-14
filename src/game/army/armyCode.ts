import { DATASHEETS, FACTION_NAME } from '../data/datasheets'
import { readStorage, saveToStorage } from '../persistence'
import { FACTIONS, type PlayerId } from '../types'
import { parseArmyList, type ArmyList } from './armyList'
import { tr } from '../../i18n/index'

// Sharing and keeping army lists: a short text code a friend can paste ("army code"), and named lists saved in this
// browser ("My rosters"). Both carry the loadouts. Pure apart from the two storage helpers at the end.

const PREFIX = 'WH40K1.'

/** The list as a code: `WH40K1.` + base64url of {f: faction, l: limit, u: [[datasheetId, size, loadout?, attachTo?]…]}
 * (`loadout` is 0 when only `attachTo` follows; `attachTo` is the index of the unit a character joins, or null). */
export function encodeArmy(faction: PlayerId, list: ArmyList): string {
  const u = list.units.map((e) =>
    e.attachTo !== undefined ? [e.datasheetId, e.size, e.loadout ?? 0, e.attachTo] : e.loadout ? [e.datasheetId, e.size, e.loadout] : [e.datasheetId, e.size],
  )
  const json = JSON.stringify({ f: faction, l: list.limit, u, ...(list.noDetachment ? { d: 0 } : {}) })
  return PREFIX + btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export type Decoded = { ok: true; faction: PlayerId; list: ArmyList } | { ok: false; error: string }

/** Read a code back. Spaces and line breaks (from a messenger) are ignored; every datasheet must exist and belong to the faction. */
export function decodeArmy(code: string): Decoded {
  const text = code.replace(/\s+/g, '')
  if (!text.startsWith(PREFIX)) return { ok: false, error: tr('That is not an army code: it starts with “WH40K1.”.') }
  let raw: unknown
  try {
    const b64 = text.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/')
    raw = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
  } catch {
    return { ok: false, error: tr('The code is damaged: copy it in full.') }
  }
  const r = raw as { f?: unknown; l?: unknown; u?: unknown; d?: unknown }
  if (!FACTIONS.includes(r.f as PlayerId) || !Array.isArray(r.u)) return { ok: false, error: tr('The code is damaged: no faction or units.') }
  const faction = r.f as PlayerId
  const units = r.u.map((x) => (Array.isArray(x) ? { datasheetId: x[0], size: x[1], ...(x[2] ? { loadout: x[2] } : {}), ...(x.length > 3 ? { attachTo: x[3] } : {}) } : null))
  const list = parseArmyList({ limit: r.l, units, ...(r.d === 0 ? { noDetachment: true } : {}) })
  if (!list) return { ok: false, error: tr('The code has units that are not in this version of the game, or an invalid points limit.') }
  if (list.units.some((e) => DATASHEETS[e.datasheetId].faction !== faction)) return { ok: false, error: tr('The “{item}” army code has units of another faction.', { item: FACTION_NAME[faction] }) }
  return { ok: true, faction, list }
}

// ---------------------------------------------------------------- "My rosters" (this browser only)

export interface SavedList { name: string; list: ArmyList; savedAt: string }
export type SavedLists = Partial<Record<PlayerId, SavedList[]>>

export const SAVED_LISTS_KEY = 'wh40k-training-saved-armies'

/** Saved lists from storage; anything malformed is dropped. */
export function parseSavedLists(raw: unknown): SavedLists {
  const out: SavedLists = {}
  if (!raw || typeof raw !== 'object') return out
  for (const f of FACTIONS) {
    const arr = (raw as Record<string, unknown>)[f]
    if (!Array.isArray(arr)) continue
    const lists: SavedList[] = []
    for (const x of arr) {
      const s = x as { name?: unknown; list?: unknown; savedAt?: unknown }
      const list = parseArmyList(s?.list)
      if (typeof s?.name === 'string' && s.name && list && list.units.every((e) => DATASHEETS[e.datasheetId].faction === f))
        lists.push({ name: s.name, list, savedAt: typeof s.savedAt === 'string' ? s.savedAt : '' })
    }
    if (lists.length) out[f] = lists
  }
  return out
}

/** The list under `name` added or replaced (same name = overwrite), newest first. */
export function withSaved(all: SavedLists, faction: PlayerId, name: string, list: ArmyList, now = new Date().toISOString()): SavedLists {
  const rest = (all[faction] ?? []).filter((x) => x.name !== name)
  return { ...all, [faction]: [{ name, list, savedAt: now }, ...rest] }
}

export function withoutSaved(all: SavedLists, faction: PlayerId, name: string): SavedLists {
  const rest = (all[faction] ?? []).filter((x) => x.name !== name)
  const out = { ...all }
  if (rest.length) out[faction] = rest
  else delete out[faction]
  return out
}

export function loadSavedLists(): SavedLists {
  try {
    return parseSavedLists(JSON.parse(readStorage(SAVED_LISTS_KEY) ?? 'null'))
  } catch {
    return {}
  }
}

export const storeSavedLists = (all: SavedLists) => saveToStorage(SAVED_LISTS_KEY, JSON.stringify(all))
