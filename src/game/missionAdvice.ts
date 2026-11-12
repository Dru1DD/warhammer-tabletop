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
  const role = o.role === 'home' ? (o.home === undefined ? '' : ' дом') : o.role === 'central' ? ' центр' : o.role === 'expansion' ? ' фланг' : ''
  return `Ц${s.objectives.indexOf(o) + 1}${role}`
}
const reasons = (es: VpEntry[]) => es.map((e) => e.why).join('; ')

/** The battle round of `p`'s next "end of Command phase" scoring, and how to say when it is. */
function nextCommand(s: GameState, p: PlayerId): { round: number; label: string } | null {
  let round: number
  let label: string
  if (s.activePlayer === p && s.phase === 'command') {
    round = s.round
    label = 'в конце этой фазы командования'
  } else {
    round = s.activePlayer === p || p === s.firstPlayer ? s.round + 1 : s.round
    label = `в вашей фазе командования (раунд ${round})`
  }
  // round 5 scores these lines at the end of the turn (they are part of the turn-end projection then)
  if (round >= 5 || round > s.maxRounds || round < 2) return null
  return { round, label }
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
        ? { kind: 'score', vp, text: `Если закончить ход сейчас — +${vp} ПО основной миссии (${reasons(es)}).` }
        : { kind: 'score', vp: 0, text: `Если закончить ход сейчас, «${card.name}» не даст очков.` })
    }
    const c = nextCommand(s, p)
    if (c) {
      const es = commandEntries(s, p, c.round)
      const vp = cappedSum(s, p, es, c.round)
      out.push(vp
        ? { kind: 'score', vp, text: `${c.label[0].toUpperCase()}${c.label.slice(1)}: +${vp} ПО, если цели останутся за вами (${reasons(es)}).` }
        : { kind: 'score', vp: 0, text: `${c.label[0].toUpperCase()}${c.label.slice(1)} основная миссия пока не даст очков — нужна цель, которую она считает.` })
    }

    // 2. objectives worth taking, and the ones to keep
    const stakes = objectiveStakes(s, p)
    const chances = s.objectives
      .map((o) => ({ o, gain: stakes[o.id]?.gain ?? 0 }))
      .filter((x) => x.gain > 0)
      .sort((a, b) => b.gain - a.gain)
    for (const { o, gain } of chances.slice(0, 3))
      out.push({ kind: 'chance', vp: gain, text: `Возьмите ${objName(s, o)}${o.controller === foe ? ' (сейчас у противника)' : ''} — ещё +${gain} ПО.` })
    const keeps = s.objectives
      .map((o) => ({ o, loss: stakes[o.id]?.loss ?? 0 }))
      .filter((x) => x.loss > 0)
      .sort((a, b) => b.loss - a.loss)
    for (const { o, loss } of keeps.slice(0, 2)) out.push({ kind: 'keep', vp: loss, text: `Не отдавайте ${objName(s, o)} — потеряете ${loss} ПО.` })

    // 3. objective actions
    const act = card.action
    if (act) {
      const info = MISSION_ACTION[act]
      for (const u of s.units.filter((x) => x.owner === p && x.action && !isDestroyed(x))) {
        const o = s.objectives.find((x) => x.id === u.action!.objectiveId)!
        out.push(actionCompletes(s, u)
          ? { kind: 'action', vp: info.vp, text: `«${u.name}» выполняет «${info.name}» у ${objName(s, o)}: удержите цель до конца хода — +${info.vp} ПО.` }
          : { kind: 'warn', vp: info.vp, text: `«${u.name}» выполняет «${info.name}», но ${objName(s, o)} сейчас не ваша — действие сорвётся, если не вернуть цель.` })
      }
      if (mine && s.phase === 'shooting') {
        for (const u of s.units.filter((x) => x.owner === p && !isDestroyed(x) && !x.action))
          for (const o of s.objectives)
            if (!actionProblem(s, u, o.id))
              out.push({ kind: 'action', vp: info.vp, text: `«${u.name}» может начать «${info.name}» у ${objName(s, o)} вместо стрельбы — +${info.vp} ПО в конце хода, если цель будет вашей.` })
      } else if (mine && s.round >= info.fromRound && (s.phase === 'command' || s.phase === 'movement'))
        out.push({ kind: 'action', text: `Действие «${info.name}»: в фазе стрельбы отряд у цели (кроме своей домашней) может выполнить его вместо стрельбы — +${info.vp} ПО. Подведите отряды к целям в движении.` })
    }
  }

  // 4. secondary cards
  for (const c of cardOutlooks(s, p)) {
    const name = SECONDARY[c.card].name
    out.push(c.vp > 0
      ? { kind: 'secondary', vp: c.vp, text: `🃏 «${name}» выполняется: +${c.vp} ПО ${c.when} (${c.why}).` }
      : { kind: 'secondary', vp: 0, text: `🃏 «${name}» — ${c.need}; засчитывается ${c.when}.` })
  }

  // 5. reserves
  const res = reservesOf(s, p)
  if (res.length) {
    const list = res.map((u) => `«${u.name}»`).join(', ')
    if (s.round < RESERVE_FROM_ROUND) out.push({ kind: 'reserve', text: `В резерве: ${list} — выйдут со ${RESERVE_FROM_ROUND}-го раунда, в вашей фазе движения.` })
    else if (s.round >= RESERVE_DEADLINE)
      out.push({ kind: 'warn', text: `Последний шанс: ${list} в резерве — если не выйдут до конца ${RESERVE_DEADLINE}-го раунда, будут уничтожены.` })
    else out.push({ kind: 'reserve', text: mine && s.phase === 'movement' ? `Сейчас можно вывести из резерва: ${list}.` : `В резерве: ${list} — выход в вашей фазе движения (или «Быстрым выходом» в конце хода противника).` })
  }
  return out
}
