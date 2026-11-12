import { useEffect, useState } from 'react'

/**
 * Whole seconds left of `ms`, counted from the moment `key` last changed (a new question restarts it). `ms` = 0 turns it
 * off (returns null). Each side counts locally; the host's timer is the one that acts (multiplayer/host.ts).
 */
export function useCountdown(key: unknown, ms: number): number | null {
  const full = ms ? Math.ceil(ms / 1000) : null
  const [left, setLeft] = useState<{ key: unknown; s: number | null }>({ key, s: full })
  useEffect(() => {
    if (!ms) return
    const at = Date.now()
    const t = setInterval(() => setLeft({ key, s: Math.max(0, Math.ceil((at + ms - Date.now()) / 1000)) }), 250)
    return () => clearInterval(t)
  }, [key, ms])
  // a new question shows the full time until the first tick
  return !ms ? null : left.key === key ? left.s : full
}
