import { FACTION_NAME } from '../data/datasheets'
import { pointInPolygon } from '../geometry/geometry'
import { addLog, alive, ENGAGEMENT_RANGE, isDestroyed, other, profileOf, sidesOf, unitNearObjective, unitsWithin } from '../gameState'
import { tr } from '../../i18n/index'
import type { GameState, MissionActionId, MissionState, Objective, PlayerId, PrimaryId, UnitState } from '../types'

// Primary missions of the 44″×60″ battle: the five cards of the Mirrored World twist (Mission Deck 2026-27, Wahapedia),
// which both players play at once, and the two objective actions they use. The engine calls the scoring hooks at the end
// of a Command phase, at the end of a turn and at the end of the battle; this module holds the texts, the caps and the
// sums. Without a mission (`s.mission` absent) the game keeps its training score (5 VP per objective).

export const PRIMARY_IDS: PrimaryId[] = ['dominance', 'meatgrinder', 'outmanoeuvre', 'gatherIntel', 'sabotage']
/** Primary VP caps: 45 per battle, 15 per battle round (end-of-battle VP are outside the round cap) */
export const PRIMARY_CAP = 45
export const ROUND_CAP = 15

export interface PrimaryInfo {
  name: string
  nameEn: string
  /** the card in plain words, one line per way to score */
  lines: string[]
  action?: MissionActionId
}

export const PRIMARY: Record<PrimaryId, PrimaryInfo> = {
  dominance: {
    name: tr('Battlefield Dominance'), nameEn: 'Battlefield Dominance',
    lines: [
      tr('Rounds 1–2, end of your turn: 2 VP if you control more objectives than your opponent.'),
      tr('From round 2, end of your Command phase (in round 5 — end of the turn): 3 VP for each objective you control, and 2 more VP for each one other than your home objective if you hold your home objective.'),
    ],
  },
  meatgrinder: {
    name: tr('Meatgrinder'), nameEn: 'Meatgrinder',
    lines: [
      tr('Any round, end of your turn: 3 VP if at least one enemy unit was destroyed this turn.'),
      tr('From round 2, end of your Command phase (in round 5 — end of the turn): 4 VP if you control at least one objective other than your home one.'),
      tr('From round 2, end of your turn: 5 VP if more enemy units were destroyed this turn than you lost last turn.'),
      tr('End of the battle: 5 VP if you control the enemy’s home objective.'),
    ],
  },
  outmanoeuvre: {
    name: tr('Outmanoeuvre'), nameEn: 'Outmanoeuvre',
    lines: [
      tr('Any round, end of your turn: 10 VP if you control the enemy’s home objective.'),
      tr('Round 1, end of your turn: 4 VP for each objective you control other than your home one.'),
      tr('Rounds 2–3, end of your Command phase: 5 VP for each objective you control other than your home one.'),
      tr('From round 4, end of your turn: 6 VP for each objective you control other than your home one.'),
    ],
  },
  gatherIntel: {
    name: tr('Gather Intel'), nameEn: 'Gather Intel',
    action: 'extractIntel',
    lines: [
      tr('Round 1, end of your turn: 6 VP if you control the central objective.'),
      tr('From round 2, end of your Command phase (in round 5 — end of the turn): 4 VP if you control at least one objective other than your home one.'),
      tr('From round 2, end of your turn: 7 VP for each unit that completed the “Extract Intelligence” action.'),
      tr('End of the battle: 5 VP if you have three or more operation markers on the board, and 5 VP if your marker stands at the enemy’s home objective.'),
    ],
  },
  sabotage: {
    name: tr('Sabotage'), nameEn: 'Sabotage',
    action: 'sabotage',
    lines: [
      tr('Any round, end of your turn: 3 VP for each unit that sabotaged, and 2 more VP for each of them at an objective in the enemy’s territory.'),
      tr('From round 2, end of your Command phase (in round 5 — end of the turn): 4 VP if you control at least one objective other than your home one.'),
    ],
  },
}

export interface MissionActionInfo {
  name: string
  nameEn: string
  text: string
  /** the first battle round it can be started in */
  fromRound: number
  /** VP for completing it (before the territory bonus of Sabotage), for the AI and the button */
  vp: number
}

export const MISSION_ACTION: Record<MissionActionId, MissionActionInfo> = {
  extractIntel: {
    name: tr('Extract Intelligence'), nameEn: 'Extract Intelligence', fromRound: 2, vp: 7,
    text: tr('Shooting phase, from round 2: a unit at an objective (other than its own home one) where you have no operation marker yet. Completes at the end of the turn if the unit holds the objective: your operation marker is placed at the objective.'),
  },
  sabotage: {
    name: tr('Sabotage'), nameEn: 'Sabotage', fromRound: 1, vp: 3,
    text: tr('Shooting phase: a unit at an objective (other than its own home one). Completes at the end of the turn if the unit holds the objective: the unit has sabotaged.'),
  },
}

export const SABOTAGE_TERRITORY_BONUS = 2

/** A fresh mission for a battle. */
export function newMission(s: GameState, primary: PrimaryId): MissionState {
  const zero = () => Object.fromEntries(sidesOf(s).map((p) => [p, 0])) as Record<PlayerId, number>
  return {
    primary,
    byRound: Object.fromEntries(sidesOf(s).map((p) => [p, [0, 0, 0, 0, 0, 0]])) as Record<PlayerId, number[]>,
    endVp: zero(),
    markers: [],
    lostLastTurn: zero(),
  }
}

export const pickPrimary = (id: string | undefined, rnd = Math.random): PrimaryId =>
  PRIMARY_IDS.includes(id as PrimaryId) ? (id as PrimaryId) : PRIMARY_IDS[Math.floor(rnd() * PRIMARY_IDS.length)]

/** The primary VP a player has scored so far (all rounds and the end of the battle). */
export const primaryTotal = (m: MissionState, p: PlayerId) => m.byRound[p].reduce((a, b) => a + b, 0) + (m.endVp?.[p] ?? 0)

/** Add primary VP within the caps (45 per battle; 15 per round unless `endOfBattle`). Returns what was actually scored. */
export function scorePrimary(s: GameState, p: PlayerId, vp: number, why: string, endOfBattle = false): number {
  const m = s.mission
  if (!m || vp <= 0) return 0
  let got = Math.min(vp, PRIMARY_CAP - primaryTotal(m, p))
  if (!endOfBattle) got = Math.min(got, ROUND_CAP - m.byRound[p][s.round])
  got = Math.max(0, got)
  if (endOfBattle) m.endVp![p] += got
  else m.byRound[p][s.round] += got
  s.players[p].vp += got
  const capped = got < vp ? tr(' (cap: {got} of {vp} counted)', { got, vp }) : ''
  addLog(s, tr('{faction}: +{got} VP — {mission}: {why}{capped}.', { faction: FACTION_NAME[p], got, mission: PRIMARY[m.primary].name, why, capped }), 'minimal')
  return got
}

const isHomeOf = (o: Objective, p: PlayerId) => o.role === 'home' && o.home === p
const held = (s: GameState, p: PlayerId) => s.objectives.filter((o) => o.controller === p)
const heldNotHome = (s: GameState, p: PlayerId) => held(s, p).filter((o) => !isHomeOf(o, p))
const holdsEnemyHome = (s: GameState, p: PlayerId) => held(s, p).some((o) => isHomeOf(o, other(s, p)))

/** Is this objective in `p`'s territory (and not on the line between the halves)? */
export function inTerritory(s: GameState, p: PlayerId, o: Objective): boolean {
  if (!s.territory) return false
  const west = sidesOf(s)[0] === p
  const mine = s.territory[west ? 'west' : 'east'], theirs = s.territory[west ? 'east' : 'west']
  return pointInPolygon(o.pos, mine) && !pointInPolygon(o.pos, theirs)
}

/** VP a card line would give, with the reason for the log (and for the turn plan). */
export interface VpEntry { vp: number; why: string }

/** The "end of your Command phase" lines for `p` in battle round `round`, with the board as it is now. Rounds 2–4 (round
 * 5 scores them at the end of the turn instead). */
export function commandEntries(s: GameState, p: PlayerId, round = s.round): VpEntry[] {
  const m = s.mission
  if (!m || round < 2) return []
  const out: VpEntry[] = []
  switch (m.primary) {
    case 'dominance': {
      const mine = held(s, p)
      if (mine.length) out.push({ vp: mine.length * 3, why: tr('{n} obj. × 3', { n: mine.length }) })
      const home = mine.some((o) => isHomeOf(o, p))
      const extra = mine.filter((o) => !isHomeOf(o, p)).length
      if (home && extra) out.push({ vp: extra * 2, why: tr('home objective held: {extra} more × 2', { extra }) })
      break
    }
    case 'meatgrinder':
    case 'gatherIntel':
    case 'sabotage':
      if (heldNotHome(s, p).length) out.push({ vp: 4, why: tr('held an objective outside your own zone') })
      break
    case 'outmanoeuvre':
      if (round <= 3) {
        const n = heldNotHome(s, p).length
        if (n) out.push({ vp: n * 5, why: tr('{n} obj. (other than home) × {k}', { n, k: 5 }) })
      }
      break
  }
  return out
}

/** The "end of your turn" lines for the active player `p`: `completed` actions, `lost` units this turn (by owner). */
export function turnEndEntries(s: GameState, p: PlayerId, completed: UnitState[], lost: Record<PlayerId, number>, round = s.round): VpEntry[] {
  const m = s.mission
  if (!m) return []
  const foe = other(s, p)
  const out: VpEntry[] = []
  switch (m.primary) {
    case 'dominance':
      if (round <= 2 && held(s, p).length > held(s, foe).length) out.push({ vp: 2, why: tr('more objectives than the opponent') })
      break
    case 'meatgrinder':
      if (lost[foe] > 0) out.push({ vp: 3, why: tr('enemy units destroyed this turn: {n}', { n: lost[foe] }) })
      if (round >= 2 && lost[foe] > m.lostLastTurn[p]) out.push({ vp: 5, why: tr('destroyed {kills}, lost last turn {lost}', { kills: lost[foe], lost: m.lostLastTurn[p] }) })
      break
    case 'outmanoeuvre': {
      if (holdsEnemyHome(s, p)) out.push({ vp: 10, why: tr('held the enemy’s home objective') })
      const n = heldNotHome(s, p).length
      if (n && round === 1) out.push({ vp: n * 4, why: tr('{n} obj. (other than home) × {k}', { n, k: 4 }) })
      if (n && round >= 4) out.push({ vp: n * 6, why: tr('{n} obj. (other than home) × {k}', { n, k: 6 }) })
      break
    }
    case 'gatherIntel': {
      if (round === 1 && held(s, p).some((o) => o.role === 'central')) out.push({ vp: 6, why: tr('held the central objective') })
      const n = completed.filter((u) => u.action!.id === 'extractIntel').length
      if (round >= 2 && n) out.push({ vp: n * 7, why: tr('intelligence extracted: {n} unit(s) × 7', { n }) })
      break
    }
    case 'sabotage': {
      const done = completed.filter((u) => u.action!.id === 'sabotage')
      if (done.length) out.push({ vp: done.length * 3, why: tr('sabotage: {n} unit(s) × 3', { n: done.length }) })
      const deep = done.filter((u) => s.objectives.some((o) => inTerritory(s, foe, o) && unitNearObjective(u, o))).length
      if (deep) out.push({ vp: deep * SABOTAGE_TERRITORY_BONUS, why: tr('{n} of them in the enemy’s territory × {k}', { n: deep, k: SABOTAGE_TERRITORY_BONUS }) })
      break
    }
  }
  // round 5: the Command-phase lines are scored at the end of the turn
  if (round >= 5) out.push(...commandEntries(s, p, round))
  return out
}

/** The sum of `entries` that the caps would let `p` score in battle round `round` (endOfBattle: outside the round cap). */
export function cappedSum(s: GameState, p: PlayerId, entries: VpEntry[], round: number, endOfBattle = false): number {
  const m = s.mission
  if (!m) return 0
  const raw = entries.reduce((a, e) => a + e.vp, 0)
  let room = PRIMARY_CAP - primaryTotal(m, p)
  if (!endOfBattle) room = Math.min(room, ROUND_CAP - (m.byRound[p][round] ?? 0))
  return Math.max(0, Math.min(raw, room))
}

/** Mission scoring at the end of the active player's Command phase. */
export function missionCommandEnd(s: GameState) {
  if (!s.mission || s.round >= 5) return
  for (const e of commandEntries(s, s.activePlayer)) scorePrimary(s, s.activePlayer, e.vp, e.why)
}

/** A new turn starts: remember who is already dead and who stands on objectives, to count this turn's kills at its end. */
export function missionTurnStart(s: GameState) {
  if (!s.mission && !s.secondary) return
  s.turnStart = {
    deadUnits: s.units.filter((u) => isDestroyed(u)).map((u) => u.id),
    deadModels: s.units.flatMap((u) => u.models.filter((m) => m.destroyed).map((m) => m.id)),
    onObjective: s.units.filter((u) => !isDestroyed(u) && s.objectives.some((o) => unitNearObjective(u, o))).map((u) => u.id),
  }
}

/** Units of `p` destroyed this turn. */
export const unitsLostThisTurn = (s: GameState, p: PlayerId) => {
  const before = new Set(s.turnStart?.deadUnits ?? [])
  return s.units.filter((u) => u.owner === p && isDestroyed(u) && !before.has(u.id))
}

/** Does this unit's action complete: alive, near its objective, and its owner controls the objective? */
export const actionCompletes = (s: GameState, u: UnitState) => {
  const o = s.objectives.find((x) => x.id === u.action!.objectiveId)
  return !!o && !isDestroyed(u) && unitNearObjective(u, o) && o.controller === u.owner
}

/** End of the active player's turn: actions complete, then the card's end-of-turn scoring. Control must be up to date. */
export function missionTurnEnd(s: GameState) {
  const m = s.mission
  if (!m) return
  const p = s.activePlayer
  const lost = Object.fromEntries(sidesOf(s).map((x) => [x, unitsLostThisTurn(s, x).length])) as Record<PlayerId, number>

  // objective actions complete (or fail) at the end of the turn
  const completed: UnitState[] = []
  for (const u of s.units) {
    if (!u.action || u.owner !== p) continue
    const info = MISSION_ACTION[u.action.id]
    if (actionCompletes(s, u)) {
      completed.push(u)
      if (u.action.id === 'extractIntel') m.markers.push({ owner: p, objectiveId: u.action.objectiveId })
      addLog(s, u.action.id === 'extractIntel'
        ? tr('{name}: action “{action}” completed — an operation marker is placed at the objective.', { name: u.name, action: info.name })
        : tr('{name}: action “{action}” completed.', { name: u.name, action: info.name }), 'minimal')
    } else if (!isDestroyed(u)) addLog(s, tr('{name}: action “{action}” failed — the unit does not hold the objective.', { name: u.name, action: info.name }), 'standard')
  }

  for (const e of turnEndEntries(s, p, completed, lost)) scorePrimary(s, p, e.vp, e.why)

  for (const u of s.units) if (u.owner === p) delete u.action
  // the losses of this turn are "the previous turn" for the next player
  m.lostLastTurn = lost
}

/** End of the battle: the cards' end-of-battle VP (outside the round cap). Control must be up to date. */
export function missionBattleEnd(s: GameState) {
  const m = s.mission
  if (!m) return
  for (const p of sidesOf(s)) {
    const foe = other(s, p)
    if (m.primary === 'meatgrinder' && holdsEnemyHome(s, p)) scorePrimary(s, p, 5, tr('end of the battle: held the enemy’s home objective'), true)
    if (m.primary === 'gatherIntel') {
      const mine = m.markers.filter((x) => x.owner === p)
      if (mine.length >= 3) scorePrimary(s, p, 5, tr('end of the battle: operation markers on the board — {n}', { n: mine.length }), true)
      if (mine.some((x) => s.objectives.some((o) => o.id === x.objectiveId && isHomeOf(o, foe)))) scorePrimary(s, p, 5, tr('end of the battle: marker at the enemy’s home objective'), true)
    }
  }
}

/** Why this unit cannot start a mission action at this objective now, or null when it can. */
export function actionProblem(s: GameState, u: UnitState, objectiveId: string): string | null {
  const m = s.mission
  const id = m && PRIMARY[m.primary].action
  if (!m || !id) return tr('There are no actions in this mission.')
  const info = MISSION_ACTION[id]
  if (s.phase !== 'shooting') return tr('An action is started in the Shooting phase.')
  if (u.owner !== s.activePlayer) return tr('An action is started in your own turn.')
  if (s.round < info.fromRound) return tr('“{action}” can only be started from round {round}.', { action: info.name, round: info.fromRound })
  if (u.action) return tr('The unit is already performing an action.')
  if (u.shot) return tr('The unit has already shot in this phase.')
  if (u.battleShocked) return tr('The unit is Battle-shocked.')
  if (!alive(u).some((x) => profileOf(x).oc > 0)) return tr('The unit has OC 0 — it cannot perform actions.')
  if (u.move === 'advance' || u.move === 'fallBack') return tr('The unit Advanced or fell back this turn.')
  if (s.units.some((e) => e.owner !== u.owner && !isDestroyed(e) && isEngagedWith(u, e))) return tr('The unit is in engagement range of the enemy.')
  const o = s.objectives.find((x) => x.id === objectiveId)
  if (!o) return tr('There is no such objective.')
  if (isHomeOf(o, u.owner)) return tr('Not at your own home objective.')
  if (!unitNearObjective(u, o)) return tr('The unit must be within range of the objective (3″).')
  if (s.units.some((x) => x.owner === u.owner && x.action?.objectiveId === objectiveId)) return tr('Another of your units has already started an action at this objective.')
  if (id === 'extractIntel' && m.markers.some((x) => x.owner === u.owner && x.objectiveId === objectiveId)) return tr('Your operation marker already stands at this objective.')
  return null
}

const isEngagedWith = (u: UnitState, e: UnitState) => unitsWithin(u, e, ENGAGEMENT_RANGE)

/** How much an objective is worth to `p` in this battle, relative to an ordinary one (AI movement). */
export function objectiveWorth(s: GameState, p: PlayerId, o: Objective): number {
  const m = s.mission
  if (!m) return 1
  const foe = other(s, p)
  if (isHomeOf(o, foe)) return m.primary === 'outmanoeuvre' ? 2.5 : m.primary === 'meatgrinder' || m.primary === 'gatherIntel' ? 1.5 : 1
  if (isHomeOf(o, p)) return m.primary === 'dominance' ? 1.5 : 0.6
  if (o.role === 'central' && m.primary === 'gatherIntel' && s.round === 1) return 1.5
  return 1
}

/** One line for the log and the header: “Sabotage”, or “<translated name> (Sabotage)” where the translation differs from the official name. */
export const missionName = (s: GameState) => {
  if (!s.mission) return null
  const { name, nameEn } = PRIMARY[s.mission.primary]
  return name === nameEn ? name : `${name} (${nameEn})`
}
