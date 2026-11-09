// Balance simulation (NOT part of `npm test`): AI-vs-AI battles for every pairing of the five armies, both
// seatings, several seeds, the tactical ('standard') AI. Prints a markdown report to the console.
//   BALANCE_SIM=1 npx vitest run src/game/__tests__/balance.test.ts --disableConsoleIntercept
// Results are summarised in docs/armies.md; re-run after any rules, datasheet or AI change.

import { describe, it } from 'vitest'
import { decide } from '../ai/ai'
import { seededRoller } from '../dice/dice'
import { apply, startGame } from '../engine'
import { FACTION_NAME } from '../data/datasheets'
import { scenarioById } from '../scenarios/scenarios'
import { FACTIONS, type GameState, type PlayerId } from '../types'

const SEEDS = (process.env.BALANCE_SEEDS ?? '1,2,3,4').split(',').map(Number)

interface Result { winner: PlayerId | 'draw'; round: number; vp: Record<string, number>; first: PlayerId; lost: Record<string, number>; actions: number }

function lostModels(s: GameState, f: PlayerId, start: number) {
  return start - s.units.filter((u) => u.owner === f).reduce((n, u) => n + u.models.filter((m) => !m.destroyed).length, 0)
}

function battle(west: PlayerId, east: PlayerId, seed: number): Result {
  let s = startGame(scenarioById('combat-patrol').build([west, east]), seededRoller(seed))
  const first = s.firstPlayer
  const start = (f: PlayerId) => s.units.filter((u) => u.owner === f).reduce((n, u) => n + u.models.length, 0)
  const [sw, se] = [start(west), start(east)]
  let n = 0
  while (!s.winner) {
    const d = decide(s, 'standard')!
    s = apply(s, d.cmd, seededRoller(s.rng))
    if (++n > 3000) throw new Error('action cap')
  }
  return { winner: s.winner, round: s.round, vp: { [west]: s.players[west].vp, [east]: s.players[east].vp }, first, lost: { [west]: lostModels(s, west, sw), [east]: lostModels(s, east, se) }, actions: n }
}

describe.skipIf(!process.env.BALANCE_SIM)('balance simulation', () => {
  it('prints the matrix', () => {
    const rows: string[] = []
    const total: Record<string, { w: number; g: number }> = Object.fromEntries(FACTIONS.map((f) => [f, { w: 0, g: 0 }]))
    let firstWins = 0, games = 0, westWins = 0
    for (let i = 0; i < FACTIONS.length; i++)
      for (let j = i + 1; j < FACTIONS.length; j++) {
        const a = FACTIONS[i], b = FACTIONS[j]
        const res: Result[] = []
        for (const seed of SEEDS) {
          res.push(battle(a, b, seed)) // a west
          res.push(battle(b, a, seed)) // b west
        }
        const wa = res.filter((r) => r.winner === a).length, wb = res.filter((r) => r.winner === b).length
        const avg = (f: (r: Result) => number) => (res.reduce((x, r) => x + f(r), 0) / res.length).toFixed(1)
        rows.push(`| ${FACTION_NAME[a]} vs ${FACTION_NAME[b]} | ${wa} : ${wb} : ${res.length - wa - wb} | ${avg((r) => r.round)} | ${avg((r) => r.vp[a])} : ${avg((r) => r.vp[b])} | ${avg((r) => r.lost[a])} / ${avg((r) => r.lost[b])} |`)
        total[a].w += wa; total[a].g += res.length
        total[b].w += wb; total[b].g += res.length
        for (const r of res) { games++; if (r.winner === r.first) firstWins++ }
        westWins += res.filter((r, k) => r.winner === (k % 2 === 0 ? a : b)).length
      }
    console.log(['', '| Pairing | Wins (A : B : draws) | Avg end round | Avg VP (A : B) | Avg models lost (A / B) |', '|---|---|---|---|---|', ...rows].join('\n'))
    console.log(['', '| Army | Wins | Games | Win rate |', '|---|---|---|---|', ...FACTIONS.map((f) => `| ${FACTION_NAME[f]} | ${total[f].w} | ${total[f].g} | ${Math.round((100 * total[f].w) / total[f].g)}% |`)].join('\n'))
    console.log(`\nGames: ${games}; the side that took the first turn won ${firstWins} (${Math.round((100 * firstWins) / games)}%); the west seat won ${westWins}.`)
  }, 7200000)
})
