import { quote, tr } from '../i18n/index'
import { isDestroyed, other } from './gameState'
import {
  actionCompletes, actionProblem, cappedSum, commandEntries, MISSION_ACTION, PRIMARY, turnEndEntries, unitsLostThisTurn, type VpEntry,
} from './rules/missions'
import { RESERVE_DEADLINE, RESERVE_FROM_ROUND, reservesOf } from './rules/reserves'
import { cardOutlooks, SECONDARY } from './rules/secondaries'
import type { GameState, Objective, PlayerId } from './types'

// The turn plan of a 44″×60″ battle: what the primary mission and the secondary cards would score with the board as it
// is, which objectives are worth taking or keeping, which actions are open, and what the reserves still need. The numbers
// come from the same functions that score the mission (rules/missions.ts, rules/secondaries.ts), so the plan cannot
// promise what the game would not give.

export type PlanKind = 'score' | 'chance' | 'keep' | 'action' | 'secondary' | 'reserve' | 'warn'

export interface PlanLine {
  kind: PlanKind
  text: string
  /** VP at stake, for sorting and the badge */
  vp?: number
}

const objName = (s: GameState, o: Objective) => {
  const value = s.objectives.indexOf(o) + 1
  return o.role === 'home' && o.home !== undefined ? tr('O{value} home', { value }) : o.role === 'central' ? tr('O{value} center', { value }) : o.role === 'expansion' ? tr('O{value} flank', { value }) : tr('O{value}', { value })
}
const reasons = (es: VpEntry[]) => es.map((e) => e.why).join('; ')

/** The battle round of `p`'s next "end of Command phase" scoring, and whether it is the Command phase going on now. */
function nextCommand(s: GameState, p: PlayerId): { round: number; now: boolean } | null {
  let round: number
  let now: boolean
  if (s.activePlayer === p && s.phase === 'command') {
    round = s.round
    now = true
  } else {
    round = s.activePlayer === p || p === s.firstPlayer ? s.round + 1 : s.round
    now = false
  }
  // round 5 scores these lines at the end of the turn (they are part of the turn-end projection then)
  if (round >= 5 || round > s.maxRounds || round < 2) return null
  return { round, now }
}

/** What `p` would score at the end of the current turn (p is the active player), board as it is. */
function turnEndNow(s: GameState, p: PlayerId): VpEntry[] {
  const completed = s.units.filter((u) => u.owner === p && u.action && actionCompletes(s, u))
  const lost = Object.fromEntries([p, other(s, p)].map((x) => [x, unitsLostThisTurn(s, x).length])) as Record<PlayerId, number>
  return turnEndEntries(s, p, completed, lost)
}

/** Primary VP `p` would get from the next scoring moments with the board as it is (within the caps). */
function projected(s: GameState, p: PlayerId): number {
  let vp = 0
  if (s.activePlayer === p && s.phase !== 'command') vp += cappedSum(s, p, turnEndNow(s, p), s.round)
  const c = nextCommand(s, p)
  if (c) vp += cappedSum(s, p, commandEntries(s, p, c.round), c.round)
  return vp
}

const withController = (s: GameState, o: Objective, who: PlayerId | null): GameState => ({
  ...s,
  objectives: s.objectives.map((x) => (x.id === o.id ? { ...x, controller: who } : x)),
})

/** Primary VP at stake on each objective for `p`: `gain` if p took it, `loss` if p lost it to the opponent. */
export function objectiveStakes(s: GameState, p: PlayerId): Record<string, { gain?: number; loss?: number }> {
  if (!s.mission) return {}
  const foe = other(s, p)
  const base = projected(s, p)
  const out: Record<string, { gain?: number; loss?: number }> = {}
  for (const o of s.objectives) {
    if (o.controller === p) {
      const loss = base - projected(withController(s, o, foe), p)
      if (loss > 0) out[o.id] = { loss }
    } else {
      const gain = projected(withController(s, o, p), p) - base
      if (gain > 0) out[o.id] = { gain }
    }
  }
  return out
}

/** The turn plan for `p` (most useful lines first). Empty outside a mission battle. */
export function turnPlan(s: GameState, p: PlayerId): PlanLine[] {
  if (!s.mission && !s.secondary && !s.reserves?.length) return []
  const out: PlanLine[] = []
  const foe = other(s, p)
  const mine = s.activePlayer === p

  if (s.mission) {
    const card = PRIMARY[s.mission.primary]
    // 1. what the board as it is would score
    if (mine && s.phase !== 'command') {
      const es = turnEndNow(s, p)
      const vp = cappedSum(s, p, es, s.round)
      out.push(vp
        ? { kind: 'score', vp, text: tr('If you end the turn now — +{vp} VP of the primary mission ({reasons}).', { vp, reasons: reasons(es) }) }
        : { kind: 'score', vp: 0, text: tr('If you end the turn now, {name} will score nothing.', { name: quote(card.name) }) })
    }
    const c = nextCommand(s, p)
    if (c) {
      const es = commandEntries(s, p, c.round)
      const vp = cappedSum(s, p, es, c.round)
      const r = reasons(es)
      out.push(vp
        ? { kind: 'score', vp, text: c.now ? tr('At the end of this Command phase: +{vp} VP if the objectives stay yours ({reasons}).', { vp, reasons: r }) : tr('In your Command phase (round {round}): +{vp} VP if the objectives stay yours ({reasons}).', { round: c.round, vp, reasons: r }) }
        : { kind: 'score', vp: 0, text: c.now ? tr('At the end of this Command phase the primary mission will score nothing yet — it needs an objective it counts.') : tr('In your Command phase (round {round}) the primary mission will score nothing yet — it needs an objective it counts.', { round: c.round }) })
    }

    // 2. objectives worth taking, and the ones to keep
    const stakes = objectiveStakes(s, p)
    const chances = s.objectives
      .map((o) => ({ o, gain: stakes[o.id]?.gain ?? 0 }))
      .filter((x) => x.gain > 0)
      .sort((a, b) => b.gain - a.gain)
    for (const { o, gain } of chances.slice(0, 3))
      out.push({ kind: 'chance', vp: gain, text: o.controller === foe ? tr('Take {obj} (the opponent holds it now) — another +{gain} VP.', { obj: objName(s, o), gain }) : tr('Take {obj} — another +{gain} VP.', { obj: objName(s, o), gain }) })
    const keeps = s.objectives
      .map((o) => ({ o, loss: stakes[o.id]?.loss ?? 0 }))
      .filter((x) => x.loss > 0)
      .sort((a, b) => b.loss - a.loss)
    for (const { o, loss } of keeps.slice(0, 2)) out.push({ kind: 'keep', vp: loss, text: tr('Do not give up {obj} — you would lose {loss} VP.', { obj: objName(s, o), loss }) })

    // 3. objective actions
    const act = card.action
    if (act) {
      const info = MISSION_ACTION[act]
      for (const u of s.units.filter((x) => x.owner === p && x.action && !isDestroyed(x))) {
        const o = s.objectives.find((x) => x.id === u.action!.objectiveId)!
        out.push(actionCompletes(s, u)
          ? { kind: 'action', vp: info.vp, text: tr('{unit} is performing {action} at {obj}: hold the objective until the end of the turn — +{vp} VP.', { unit: quote(u.name), action: quote(info.name), obj: objName(s, o), vp: info.vp }) }
          : { kind: 'warn', vp: info.vp, text: tr('{unit} is performing {action}, but {obj} is not yours now — the action will fail unless you retake it.', { unit: quote(u.name), action: quote(info.name), obj: objName(s, o) }) })
      }
      if (mine && s.phase === 'shooting') {
        for (const u of s.units.filter((x) => x.owner === p && !isDestroyed(x) && !x.action))
          for (const o of s.objectives)
            if (!actionProblem(s, u, o.id))
              out.push({ kind: 'action', vp: info.vp, text: tr('{unit} can start {action} at {obj} instead of shooting — +{vp} VP at the end of the turn if the objective is yours.', { unit: quote(u.name), action: quote(info.name), obj: objName(s, o), vp: info.vp }) })
      } else if (mine && s.round >= info.fromRound && (s.phase === 'command' || s.phase === 'movement'))
        out.push({ kind: 'action', text: tr('The action {action}: in the Shooting phase a unit at an objective (other than its own home) can do it instead of shooting — +{vp} VP. Move units up to the objectives.', { action: quote(info.name), vp: info.vp }) })
    }
  }

  // 4. secondary cards
  for (const c of cardOutlooks(s, p)) {
    const name = SECONDARY[c.card].name
    out.push(c.vp > 0
      ? { kind: 'secondary', vp: c.vp, text: tr('🃏 {name} is met: +{vp} VP {when} ({why}).', { name: quote(name), vp: c.vp, when: c.when, why: c.why }) }
      : { kind: 'secondary', vp: 0, text: tr('🃏 {name} — {need}; scored {when}.', { name: quote(name), need: c.need, when: c.when }) })
  }

  // 5. reserves
  const res = reservesOf(s, p)
  if (res.length) {
    const list = res.map((u) => quote(u.name)).join(', ')
    if (s.round < RESERVE_FROM_ROUND) out.push({ kind: 'reserve', text: tr('In Reserves: {list} — they arrive from round {round}, in your Movement phase.', { list, round: RESERVE_FROM_ROUND }) })
    else if (s.round >= RESERVE_DEADLINE)
      out.push({ kind: 'warn', text: tr('Last chance: {list} in Reserves — if they do not arrive by the end of round {round}, they are destroyed.', { list, round: RESERVE_DEADLINE }) })
    else out.push({ kind: 'reserve', text: mine && s.phase === 'movement' ? tr('You can bring in from Reserves now: {list}.', { list }) : tr('In Reserves: {list} — they arrive in your Movement phase (or by “Rapid Ingress” at the end of the opponent’s turn).', { list }) })
  }
  return out
}
