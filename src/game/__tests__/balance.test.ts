// Balance simulation (NOT part of `npm test`): AI-vs-AI battles for every pairing of the six armies, both
// seatings, several seeds, the tactical ('standard') AI. Prints a markdown report to the console.
//   BALANCE_SIM=1 npx vitest run src/game/__tests__/balance.test.ts --disableConsoleIntercept
// BALANCE_FACTION=adeptus_mechanicus limits it to the pairings of that army; BALANCE_SEEDS=1,2 picks the seeds.
// Results are summarised in docs/armies.md; re-run after any rules, datasheet or AI change.

import { describe, it } from 'vitest'
import { decide } from '../ai/ai'
import { seededRoller } from '../dice/dice'
import { apply, startGame } from '../engine'
import { FACTION_NAME } from '../data/datasheets'
import { scenarioById } from '../scenarios/scenarios'
import { FACTIONS, type GameState, type PlayerId } from '../types'

const SEEDS = (process.env.BALANCE_SEEDS ?? '1,2,3,4').split(',').map(Number)

interface Result {
  winner: PlayerId | 'draw'; round: number; vp: Record<string, number>; first: PlayerId; lost: Record<string, number>; actions: number
  /** wounds taken by each side (damage dealt by the other) and wounds it started with */
  taken: Record<string, number>; wounds: Record<string, number>
  /** units alive at the end / at the start */
  alive: Record<string, number>; units: Record<string, number>
  /** counts of faction-ability events during the battle (command types, dice-log titles, log lines) */
  uses: Record<string, number>
}

const woundsOf = (s: GameState, f: PlayerId) => s.units.filter((u) => u.owner === f).reduce((n, u) => n + u.models.filter((m) => !m.destroyed).reduce((a, m) => a + m.wounds, 0), 0)
const aliveUnits = (s: GameState, f: PlayerId) => s.units.filter((u) => u.owner === f && u.models.some((m) => !m.destroyed)).length
const ABILITY_EVENTS: [string, (t: string) => boolean][] = [
  ['Repulsor Grid', (t) => t.startsWith('Отталкивающая решётка')],
  ['Data-spike', (t) => t.startsWith('Шип данных')],
  ['Voices in the Code', (t) => t.startsWith('Голоса в коде')],
  ['Reanimation', (t) => t.startsWith('Реанимация')],
  ['Self-destruction', (t) => t.startsWith('Самоуничтожение')],
]

function lostModels(s: GameState, f: PlayerId, start: number) {
  return start - s.units.filter((u) => u.owner === f).reduce((n, u) => n + u.models.filter((m) => !m.destroyed).length, 0)
}

function battle(west: PlayerId, east: PlayerId, seed: number): Result {
  let s = startGame(scenarioById('combat-patrol').build([west, east]), seededRoller(seed))
  const first = s.firstPlayer
  const start = (f: PlayerId) => s.units.filter((u) => u.owner === f).reduce((n, u) => n + u.models.length, 0)
  const [sw, se] = [start(west), start(east)]
  const w0 = { [west]: woundsOf(s, west), [east]: woundsOf(s, east) }
  const u0 = { [west]: aliveUnits(s, west), [east]: aliveUnits(s, east) }
  const uses: Record<string, number> = {}
  const bump = (k: string) => (uses[k] = (uses[k] ?? 0) + 1)
  let n = 0
  let seenDice = s.diceLog.at(-1)?.id ?? 0
  let seenLog = s.log.at(-1)?.id ?? 0
  while (!s.winner) {
    const d = decide(s, 'standard')!
    if (d.cmd.type === 'imperative') bump(`Imperative: ${d.cmd.imperative}`)
    if (d.cmd.type === 'divineWork') bump('Defend the Divine Work')
    if (d.cmd.type === 'callShadow') bump('Shadow in the Warp')
    if (d.cmd.type === 'callWaaagh') bump('Waaagh!')
    if (d.cmd.type === 'guide') bump('Guide')
    s = apply(s, d.cmd, seededRoller(s.rng))
    for (const e of s.diceLog.filter((x) => x.id > seenDice)) {
      for (const [k, f] of ABILITY_EVENTS) if (f(e.title)) bump(k)
      if (e.steps.some((st) => st.label === 'Feel No Pain')) bump('Feel No Pain')
    }
    for (const l of s.log.filter((x) => x.id > seenLog)) if (l.text.includes('Objective Scouted')) bump('Objective Scouted')
    seenDice = s.diceLog.at(-1)?.id ?? seenDice
    seenLog = s.log.at(-1)?.id ?? seenLog
    if (++n > 3000) throw new Error('action cap')
  }
  return {
    winner: s.winner, round: s.round, vp: { [west]: s.players[west].vp, [east]: s.players[east].vp }, first,
    lost: { [west]: lostModels(s, west, sw), [east]: lostModels(s, east, se) }, actions: n,
    taken: { [west]: w0[west] - woundsOf(s, west), [east]: w0[east] - woundsOf(s, east) }, wounds: w0,
    alive: { [west]: aliveUnits(s, west), [east]: aliveUnits(s, east) }, units: u0, uses,
  }
}

describe.skipIf(!process.env.BALANCE_SIM)('balance simulation', () => {
  it('prints the matrix', () => {
    const rows: string[] = []
    const total: Record<string, { w: number; g: number }> = Object.fromEntries(FACTIONS.map((f) => [f, { w: 0, g: 0 }]))
    let firstWins = 0, games = 0, westWins = 0
    const only = process.env.BALANCE_FACTION
    const detail: Record<string, { games: number; dealt: number; taken: number; alive: number; units: number; vp: number; uses: Record<string, number> }> = {}
    for (let i = 0; i < FACTIONS.length; i++)
      for (let j = i + 1; j < FACTIONS.length; j++) {
        const a = FACTIONS[i], b = FACTIONS[j]
        if (only && a !== only && b !== only) continue
        const res: Result[] = []
        for (const seed of SEEDS) {
          res.push(battle(a, b, seed)) // a west
          res.push(battle(b, a, seed)) // b west
        }
        const wa = res.filter((r) => r.winner === a).length, wb = res.filter((r) => r.winner === b).length
        const avg = (f: (r: Result) => number) => (res.reduce((x, r) => x + f(r), 0) / res.length).toFixed(1)
        rows.push(`| ${FACTION_NAME[a]} vs ${FACTION_NAME[b]} | ${wa} : ${wb} : ${res.length - wa - wb} | ${avg((r) => r.round)} | ${avg((r) => r.vp[a])} : ${avg((r) => r.vp[b])} | ${avg((r) => r.lost[a])} / ${avg((r) => r.lost[b])} |`)
        for (const f of [a, b]) {
          const d = (detail[f] ??= { games: 0, dealt: 0, taken: 0, alive: 0, units: 0, vp: 0, uses: {} })
          const foe = f === a ? b : a
          for (const r of res) {
            d.games++; d.dealt += r.taken[foe]; d.taken += r.taken[f]; d.alive += r.alive[f]; d.units += r.units[f]; d.vp += r.vp[f]
            for (const [k, v] of Object.entries(r.uses)) d.uses[`${f}:${k}`] = (d.uses[`${f}:${k}`] ?? 0) + v
          }
        }
        total[a].w += wa; total[a].g += res.length
        total[b].w += wb; total[b].g += res.length
        for (const r of res) { games++; if (r.winner === r.first) firstWins++ }
        westWins += res.filter((r, k) => r.winner === (k % 2 === 0 ? a : b)).length
      }
    console.log(['', '| Pairing | Wins (A : B : draws) | Avg end round | Avg VP (A : B) | Avg models lost (A / B) |', '|---|---|---|---|---|', ...rows].join('\n'))
    console.log(['', '| Army | Wins | Games | Win rate |', '|---|---|---|---|', ...FACTIONS.filter((f) => total[f].g).map((f) => `| ${FACTION_NAME[f]} | ${total[f].w} | ${total[f].g} | ${Math.round((100 * total[f].w) / total[f].g)}% |`)].join('\n'))
    console.log(['', '| Army | Games | Wounds dealt / battle | Wounds taken / battle | Damage ratio | Units alive at end | Avg VP (≈ objective turns × 5) |', '|---|---|---|---|---|---|---|',
      ...Object.entries(detail).map(([f, d]) => `| ${FACTION_NAME[f as PlayerId]} | ${d.games} | ${(d.dealt / d.games).toFixed(1)} | ${(d.taken / d.games).toFixed(1)} | ${(d.dealt / Math.max(1, d.taken)).toFixed(2)} | ${(d.alive / d.games).toFixed(1)} / ${(d.units / d.games).toFixed(1)} | ${(d.vp / d.games).toFixed(1)} |`)].join('\n'))
    console.log(['', '| Event (battles of this army, any side: read by the owner of the ability) | Count | Per battle |', '|---|---|---|',
      ...Object.entries(detail).flatMap(([, d]) => Object.entries(d.uses).map(([k, v]) => `| ${k} | ${v} | ${(v / d.games).toFixed(2)} |`))].join('\n'))
    console.log(`\nGames: ${games}; the side that took the first turn won ${firstWins} (${Math.round((100 * firstWins) / games)}%); the west seat won ${westWins}.`)
  }, 7200000)
})
