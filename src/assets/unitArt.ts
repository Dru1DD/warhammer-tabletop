// Pictures of the units for the unit card and the board tooltip, so a big army is easier to tell apart. They come from
// the player's own folder `public/unit-art/` (not in the repository: the app ships no Games Workshop images, see
// docs/assets.md). `public/unit-art/index.json` maps a model profile id (one per vehicle loadout) or a datasheet id to
// a file in that folder: { "onagerNeutron": "onager-neutron.jpg", "rangers": "rangers.jpg" }. Without the file the app
// shows no pictures.
import { useEffect, useSyncExternalStore } from 'react'

export type UnitArt = Record<string, string>

const BASE = '/unit-art/'
let art: UnitArt = {}
let loaded = false
const listeners = new Set<() => void>()

/** Reads `public/unit-art/index.json` once; a missing or broken file leaves no pictures. */
export async function loadUnitArt(fetcher: typeof fetch = fetch): Promise<UnitArt> {
  loaded = true
  try {
    const r = await fetcher(`${BASE}index.json`, { cache: 'no-cache' })
    const raw: unknown = r.ok ? await r.json() : {}
    art = parseUnitArt(raw)
  } catch {
    art = {}
  }
  listeners.forEach((f) => f())
  return art
}

/** Only string entries that name a plain file in the folder (no paths, no URLs). */
export function parseUnitArt(raw: unknown): UnitArt {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: UnitArt = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>))
    if (typeof v === 'string' && /^[\w.\- ]+\.(png|jpe?g|webp|gif|avif)$/i.test(v)) out[k] = BASE + encodeURIComponent(v)
  return out
}

/** The picture of a model: its own profile's, or else its datasheet's. */
export const artFor = (a: UnitArt, profileId: string, datasheetId: string): string | undefined => a[profileId] ?? a[datasheetId]

/** The pictures, loaded on first use. */
export function useUnitArt(): UnitArt {
  const a = useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => art,
  )
  useEffect(() => {
    if (!loaded) void loadUnitArt()
  }, [])
  return a
}
