// Deterministic dice. The RNG state lives in GameState.rng so a saved game
// replays identically; tests can inject a scripted roller.

export interface Roller {
  d6(): number
  /** current RNG state to store back into GameState */
  state(): number
}

/** mulberry32 PRNG */
export function seededRoller(seed: number): Roller {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { d6: () => Math.floor(next() * 6) + 1, state: () => s }
}

/** Returns the given values in order; throws when exhausted (test helper). */
export function scriptedRoller(values: number[], seed = 1): Roller {
  let i = 0
  return {
    d6: () => {
      if (i >= values.length) throw new Error(`scripted dice exhausted after ${values.length} rolls`)
      return values[i++]
    },
    state: () => seed,
  }
}

export const rollMany = (r: Roller, n: number) => Array.from({ length: n }, () => r.d6())

/** D3 = D6 halved, rounded up. */
export const rollDie = (r: Roller, die: 'D3' | 'D6') => (die === 'D3' ? Math.ceil(r.d6() / 2) : r.d6())

export const avgDie = (die: 'D3' | 'D6' | undefined) => (die === 'D3' ? 2 : die === 'D6' ? 3.5 : 0)

/** "D3+3", "D6", "4" */
export const fmtRandom = (fixed: number, die?: 'D3' | 'D6') => (die ? (fixed ? `${die}+${fixed}` : die) : `${fixed}`)
