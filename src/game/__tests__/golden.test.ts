// Golden-master regression test for engine + AI.
//
// Plays AI-vs-AI games to the end (seeds x scenarios x AI levels) using the
// STORE-STYLE path (fresh `seededRoller(state.rng)` for every command, exactly like
// src/store.ts dispatch) and compares a compact fingerprint of each game with the
// inline GOLDEN table below: winner, final round, VP, action count, a hash of the final
// state and a hash of the dice-log values.
//
// A failure here means dice order, RNG consumption, or game outcomes changed.
//
// Regenerating the table is legitimate ONLY for an intentional rules/AI-behaviour change
// (never for refactors, instrumentation or "it's flaky" - it is fully deterministic):
//   UPDATE_GOLDEN=1 npx vitest run src/game/__tests__/golden.test.ts --disableConsoleIntercept
// The test prints a paste-ready table to the console (and still asserts, so it fails
// until you paste it). It never writes files; paste the output over GOLDEN by hand and
// review the diff.
//
// Hash normalization drops every property named `meta` (so optional instrumentation fields
// added to DiceEntry later do not change hashes) and sorts object keys (so reordering an
// object literal in a refactor does not change hashes).

import { describe, expect, it } from 'vitest'
import { decide, type AiLevel } from '../ai/ai'
import { seededRoller } from '../dice/dice'
import { apply, startGame, validate } from '../engine'
import { SCENARIOS } from '../scenarios/scenarios'
import type { GameState } from '../types'

// seed 5 (not 3): Orks win the roll-off and go first; seeds 1 and 2 give Marines first turn
const SEEDS = [1, 2, 5]
const LEVELS: AiLevel[] = ['beginner', 'standard']
const ACTION_CAP = 3000

interface Golden {
  winner: string
  round: number
  marinesVp: number
  orksVp: number
  actions: number
  stateHash: string
  diceHash: string
}

/** Recursively drop `meta` properties and sort object keys (nothing else). */
function normalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalize)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) if (k !== 'meta') out[k] = normalize((v as Record<string, unknown>)[k])
    return out
  }
  return v
}

/** FNV-1a 32-bit over the JSON of the normalized value. */
function hash(v: unknown): string {
  const str = JSON.stringify(normalize(v))
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function play(scenarioIdx: number, level: AiLevel, seed: number): Golden {
  let s: GameState = startGame(SCENARIOS[scenarioIdx].build(), seededRoller(seed))
  let actions = 0
  while (!s.winner) {
    if (actions >= ACTION_CAP) throw new Error(`action cap ${ACTION_CAP} hit (${SCENARIOS[scenarioIdx].id}/${level}/${seed})`)
    const d = decide(s, level)
    if (!d) throw new Error('AI returned no decision before game end')
    const v = validate(s, d.cmd)
    if (!v.ok) throw new Error(`illegal AI command ${JSON.stringify(d.cmd)}: ${v.reason}`)
    s = apply(s, d.cmd, seededRoller(s.rng))
    actions++
  }
  const diceValues = s.diceLog.map((e) => e.steps.map((st) => st.dice.map((x) => x.value)))
  return {
    winner: String(s.winner),
    round: s.round,
    marinesVp: s.players.marines.vp,
    orksVp: s.players.orks.vp,
    actions,
    stateHash: hash(s),
    diceHash: hash(diceValues),
  }
}

const key = (scenarioId: string, level: AiLevel, seed: number) => `${scenarioId}|${level}|${seed}`

const GOLDEN: Record<string, Golden> = {
  'training-outpost|beginner|1': {winner:'marines',round:2,marinesVp:5,orksVp:0,actions:22,stateHash:'210effa8',diceHash:'ba4fe03b'},
  'training-outpost|beginner|2': {winner:'marines',round:2,marinesVp:5,orksVp:0,actions:23,stateHash:'0e427d41',diceHash:'9cbc612e'},
  'training-outpost|beginner|5': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:13,stateHash:'004b3c1e',diceHash:'c27b0faa'},
  'training-outpost|standard|1': {winner:'marines',round:2,marinesVp:5,orksVp:0,actions:24,stateHash:'c06199a0',diceHash:'b45bbf23'},
  'training-outpost|standard|2': {winner:'marines',round:2,marinesVp:5,orksVp:0,actions:22,stateHash:'a436de41',diceHash:'cf45cf3b'},
  'training-outpost|standard|5': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:13,stateHash:'fa826210',diceHash:'1ced9735'},
  'ruined-alley|beginner|1': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:21,stateHash:'28d2632c',diceHash:'f8f7a5f5'},
  'ruined-alley|beginner|2': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:21,stateHash:'d716f419',diceHash:'bb7b3ccc'},
  'ruined-alley|beginner|5': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:20,stateHash:'f72daf38',diceHash:'d5822297'},
  'ruined-alley|standard|1': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:21,stateHash:'57262552',diceHash:'7b856e9b'},
  'ruined-alley|standard|2': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:20,stateHash:'8ae6d008',diceHash:'d3d4b33a'},
  'ruined-alley|standard|5': {winner:'marines',round:3,marinesVp:10,orksVp:0,actions:46,stateHash:'dad4f6a6',diceHash:'7eac90c5'},
  'combat-patrol|beginner|1': {winner:'marines',round:5,marinesVp:35,orksVp:5,actions:132,stateHash:'5f24db72',diceHash:'8d620f36'},
  'combat-patrol|beginner|2': {winner:'marines',round:5,marinesVp:30,orksVp:10,actions:118,stateHash:'7fb59958',diceHash:'e8206b6f'},
  'combat-patrol|beginner|5': {winner:'marines',round:3,marinesVp:10,orksVp:10,actions:94,stateHash:'9ce6d775',diceHash:'4fa05374'},
  'combat-patrol|standard|1': {winner:'marines',round:4,marinesVp:15,orksVp:10,actions:104,stateHash:'55183d4b',diceHash:'19bee467'},
  'combat-patrol|standard|2': {winner:'marines',round:4,marinesVp:20,orksVp:10,actions:107,stateHash:'c215b3ec',diceHash:'244c693a'},
  'combat-patrol|standard|5': {winner:'draw',round:5,marinesVp:20,orksVp:20,actions:127,stateHash:'0b45aabd',diceHash:'14743b87'},
}

describe('golden master: engine + AI', () => {
  it('matches recorded AI-vs-AI games', { timeout: 300_000 }, () => {
    const actual: Record<string, Golden> = {}
    SCENARIOS.forEach((sc, i) => {
      for (const level of LEVELS) for (const seed of SEEDS) actual[key(sc.id, level, seed)] = play(i, level, seed)
    })

    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    if (env?.UPDATE_GOLDEN === '1') {
      const lines = Object.entries(actual).map(([k, g]) => `  '${k}': ${JSON.stringify(g).replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")},`)
      console.log(`UPDATE_GOLDEN: paste over GOLDEN:\nconst GOLDEN: Record<string, Golden> = {\n${lines.join('\n')}\n}`)
    }
    expect(actual).toEqual(GOLDEN)
  })
})
