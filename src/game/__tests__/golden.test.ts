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

// Re-recorded on 9c8381b (after #17 and #18). Two reasons, checked by running this test at every merge since it was
// written: (1) the stateHash of 'combat-patrol|standard|1' and '|2' never matched, from the commit that recorded the
// table onwards (the same values on Windows/Node 24 and in Linux CI/Node 22), while every other field matched up to #16;
// (2) #17 and #18 are intentional rules/AI changes: Stratagems add fields to the state, the AI spends CP, and
// Intercessors and Boyz gained EXPLOSIVES.
const GOLDEN: Record<string, Golden> = {
  'training-outpost|beginner|1': {winner:'marines',round:2,marinesVp:5,orksVp:0,actions:25,stateHash:'583d04b0',diceHash:'ba4fe03b'},
  'training-outpost|beginner|2': {winner:'marines',round:2,marinesVp:5,orksVp:0,actions:28,stateHash:'b0c2f2d6',diceHash:'9cbc612e'},
  'training-outpost|beginner|5': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:16,stateHash:'3cb94bf4',diceHash:'c27b0faa'},
  'training-outpost|standard|1': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:10,stateHash:'b4378576',diceHash:'a834428e'},
  'training-outpost|standard|2': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:9,stateHash:'e09eabdc',diceHash:'3d395dfb'},
  'training-outpost|standard|5': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:18,stateHash:'b36b4726',diceHash:'1ced9735'},
  'ruined-alley|beginner|1': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:27,stateHash:'fc08be4c',diceHash:'707d0055'},
  'ruined-alley|beginner|2': {winner:'marines',round:2,marinesVp:10,orksVp:0,actions:32,stateHash:'604e2b4e',diceHash:'ca976e68'},
  'ruined-alley|beginner|5': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:23,stateHash:'b35b9b8a',diceHash:'d5822297'},
  'ruined-alley|standard|1': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:10,stateHash:'6606228f',diceHash:'a834428e'},
  'ruined-alley|standard|2': {winner:'marines',round:1,marinesVp:0,orksVp:0,actions:30,stateHash:'5bb0b9c3',diceHash:'2e42e9a7'},
  'ruined-alley|standard|5': {winner:'marines',round:2,marinesVp:0,orksVp:5,actions:37,stateHash:'407f6dad',diceHash:'21169fb7'},
  'combat-patrol|beginner|1': {winner:'marines',round:4,marinesVp:20,orksVp:5,actions:122,stateHash:'89c8bd3d',diceHash:'7a1ddf67'},
  'combat-patrol|beginner|2': {winner:'marines',round:4,marinesVp:20,orksVp:10,actions:143,stateHash:'fcff1f54',diceHash:'b8cc9506'},
  'combat-patrol|beginner|5': {winner:'marines',round:4,marinesVp:10,orksVp:15,actions:127,stateHash:'669d52d8',diceHash:'f02c8ab1'},
  'combat-patrol|standard|1': {winner:'marines',round:5,marinesVp:35,orksVp:10,actions:149,stateHash:'34efe107',diceHash:'55618a47'},
  'combat-patrol|standard|2': {winner:'marines',round:4,marinesVp:10,orksVp:10,actions:141,stateHash:'74c549da',diceHash:'238c130c'},
  'combat-patrol|standard|5': {winner:'marines',round:4,marinesVp:20,orksVp:15,actions:131,stateHash:'862b1455',diceHash:'d19004a9'},
}

describe('golden master: engine + AI', () => {
  it('matches recorded AI-vs-AI games', { timeout: 300_000 }, () => {
    const actual: Record<string, Golden> = {}
    SCENARIOS.forEach((sc, i) => {
      // the 44″×60″ board picks a random map when none is given, and its 1000-point battles are long: it has its own
      // tests (strikeForce.test.ts) instead of golden games
      if (sc.id === 'strike-force') return
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
