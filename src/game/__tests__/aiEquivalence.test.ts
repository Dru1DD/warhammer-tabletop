// The AI speed-ups (line-of-sight memo, spatial pruning in move planning, range short-cut in
// scoring) must not change a single decision. This test plays seeded AI-vs-AI games, store-style
// (fresh `seededRoller(state.rng)` per command), and compares a hash of the exact command sequence
// (positions included, every float digit) with the one recorded on the code BEFORE the speed-ups.
//
// Re-recording is legitimate only for an intentional AI or rules change:
//   RECORD_AI=1 npx vitest run src/game/__tests__/aiEquivalence.test.ts --disableConsoleIntercept

import { describe, expect, it } from 'vitest'
import { decide, type AiLevel } from '../ai/ai'
import { presetList, type PointsLimit } from '../army/armyList'
import { seededRoller } from '../dice/dice'
import { apply, startGame, validate } from '../engine'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, PlayerId } from '../types'

interface Game { sides: [PlayerId, PlayerId]; points: PointsLimit | null; level: AiLevel; seed: number; maxActions: number }

const GAMES: Record<string, Game> = {
  // training rosters, played to the end
  'patrol marines-orks standard': { sides: ['marines', 'orks'], points: null, level: 'standard', seed: 3, maxActions: 1000 },
  'patrol aeldari-mechanicus beginner': { sides: ['aeldari', 'adeptus_mechanicus'], points: null, level: 'beginner', seed: 4, maxActions: 1000 },
  // big armies: the opening decisions, where the movement planner and line of sight dominate
  '500 tyranids-necrons standard': { sides: ['tyranids', 'necrons'], points: 500, level: 'standard', seed: 5, maxActions: 60 },
  '1000 orks-aeldari standard': { sides: ['orks', 'aeldari'], points: 1000, level: 'standard', seed: 6, maxActions: 40 },
}

// recorded on feature/army-builder (bfe917d), before the speed-ups
const RECORDED: Record<string, { actions: number; commands: string }> = {
  'patrol marines-orks standard': { actions: 104, commands: 'eb6bc23e' },
  'patrol aeldari-mechanicus beginner': { actions: 63, commands: '6e29935e' },
  '500 tyranids-necrons standard': { actions: 60, commands: '1e7dfd25' },
  '1000 orks-aeldari standard': { actions: 40, commands: 'e650b68a' },
}

function fnv(str: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function play(g: Game) {
  const armies = g.points ? { [g.sides[0]]: presetList(g.sides[0], g.points), [g.sides[1]]: presetList(g.sides[1], g.points) } : {}
  let s: GameState = startGame(scenarioById('combat-patrol').build(g.sides, armies), seededRoller(g.seed))
  const cmds: string[] = []
  while (!s.winner && cmds.length < g.maxActions) {
    const d = decide(s, g.level)
    if (!d) break
    const v = validate(s, d.cmd)
    if (!v.ok) throw new Error(`illegal AI command ${JSON.stringify(d.cmd)}: ${v.reason}`)
    cmds.push(JSON.stringify(d.cmd))
    s = apply(s, d.cmd, seededRoller(s.rng))
  }
  return { actions: cmds.length, commands: fnv(cmds.join('\n')) }
}

describe('AI speed-ups keep every decision', () => {
  for (const [name, g] of Object.entries(GAMES))
    it(name, { timeout: 180_000 }, () => {
      const got = play(g)
      const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      if (env?.RECORD_AI === '1') console.log(`RECORD_AI  '${name}': ${JSON.stringify(got).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'")},`)
      expect(got).toEqual(RECORDED[name])
    })
})
