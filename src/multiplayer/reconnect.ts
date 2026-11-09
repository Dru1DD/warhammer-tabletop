// Reconnection policy for the guest: bounded retries with backoff, then hand control back to the player.

export const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 8000, 8000, 8000, 8000]

export type Attempt = 'connected' | 'retry' | 'stop'

/**
 * Run `attempt` until it reports `connected` or `stop`, waiting `delays[i]` before try i.
 * Returns 'connected', 'stopped' (deliberate leave / refusal) or 'gave-up'.
 */
export async function reconnectLoop(
  attempt: (n: number) => Promise<Attempt>,
  opts: { delays?: number[]; sleep?: (ms: number) => Promise<void>; cancelled?: () => boolean } = {},
): Promise<'connected' | 'stopped' | 'gave-up'> {
  const { delays = RECONNECT_DELAYS_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), cancelled = () => false } = opts
  for (let i = 0; i < delays.length; i++) {
    await sleep(delays[i])
    if (cancelled()) return 'stopped'
    const r = await attempt(i)
    if (r === 'connected') return 'connected'
    if (r === 'stop') return 'stopped'
  }
  return 'gave-up'
}
