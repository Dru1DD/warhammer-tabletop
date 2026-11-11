// The AI speed-ups (line-of-sight memo, spatial pruning in move planning, range short-cut in
// scoring) must not change a single decision. This test plays seeded AI-vs-AI games, store-style
// (fresh `seededRoller(state.rng)` per command), and compares a hash of the exact command sequence
// (positions included, every float digit) with the one recorded on the code BEFORE the speed-ups.
//
// Re-recording is legitimate only for an intentional AI or rules change:
//   RECORD_AI=1 npx vitest run src/game/__tests__/aiEquivalence.test.ts --disableConsoleIntercept

import { describe, expect, it } from 'vitest'
import { decide, type AiLevel } from '../ai/ai'
import type { ArmyList, ListEntry, PointsLimit } from '../army/armyList'
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
  // re-recorded: the AI now spends CP on core and army (detachment) Stratagems, and on reactions in the opponent's turn
  'patrol marines-orks standard': { actions: 113, commands: '8ebb15d3' },
  'patrol aeldari-mechanicus beginner': { actions: 67, commands: '0b060236' },
  '500 tyranids-necrons standard': { actions: 60, commands: '52c02177' },
  '1000 orks-aeldari standard': { actions: 40, commands: 'ab874ebb' },
}

// The army lists these games were recorded with: the presets as of bfe917d. They are pinned here so that
// a later preset change (new units for a faction) does not look like an AI change.
const u = (datasheetId: string, size: number, copies = 1): ListEntry[] => Array.from({ length: copies }, () => ({ datasheetId, size }))
const PINNED: Partial<Record<PlayerId, Partial<Record<PointsLimit, ListEntry[]>>>> = {
  tyranids: { 500: [...u('hiveTyrant', 1), ...u('termagants', 20), ...u('hormagaunts', 20), ...u('tyranidWarriors', 3)] },
  necrons: { 500: [...u('overlord', 1), ...u('necronWarriors', 10, 2), ...u('skorpekhDestroyers', 3, 2), ...u('scarabSwarms', 3, 2)] },
  orks: { 1000: [...u('boyz', 20, 4), ...u('boyz', 10, 2), ...u('deffDread', 1, 2)] },
  aeldari: { 1000: [...u('farseer', 1, 2), ...u('guardianDefenders', 11, 3), ...u('direAvengers', 10, 2), ...u('windriders', 6), ...u('windriders', 3)] },
}
const pinned = (f: PlayerId, limit: PointsLimit): ArmyList => ({ limit, units: PINNED[f]![limit]!.map((e) => ({ ...e })) })

function fnv(str: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function play(g: Game) {
  const armies = g.points ? { [g.sides[0]]: pinned(g.sides[0], g.points), [g.sides[1]]: pinned(g.sides[1], g.points) } : {}
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
