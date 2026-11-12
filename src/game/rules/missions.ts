import { FACTION_NAME } from '../data/datasheets'
import { pointInPolygon } from '../geometry/geometry'
import { addLog, alive, ENGAGEMENT_RANGE, isDestroyed, other, profileOf, sidesOf, unitNearObjective, unitsWithin } from '../gameState'
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
    name: 'Господство на поле', nameEn: 'Battlefield Dominance',
    lines: [
      'Раунды 1–2, конец вашего хода: 2 ПО, если у вас больше целей, чем у противника.',
      'Со 2-го раунда, конец вашей фазы командования (в 5-м раунде — конец хода): 3 ПО за каждую вашу цель и ещё 2 ПО за каждую, кроме домашней, если вы держите свою домашнюю цель.',
    ],
  },
  meatgrinder: {
    name: 'Мясорубка', nameEn: 'Meatgrinder',
    lines: [
      'Любой раунд, конец вашего хода: 3 ПО, если в этот ход уничтожен хотя бы один отряд противника.',
      'Со 2-го раунда, конец вашей фазы командования (в 5-м раунде — конец хода): 4 ПО, если вы держите хотя бы одну цель, кроме домашней.',
      'Со 2-го раунда, конец вашего хода: 5 ПО, если в этот ход уничтожено больше вражеских отрядов, чем вы потеряли в прошлый ход.',
      'Конец битвы: 5 ПО, если вы держите домашнюю цель противника.',
    ],
  },
  outmanoeuvre: {
    name: 'Обходной манёвр', nameEn: 'Outmanoeuvre',
    lines: [
      'Любой раунд, конец вашего хода: 10 ПО, если вы держите домашнюю цель противника.',
      'Раунд 1, конец вашего хода: 4 ПО за каждую вашу цель, кроме домашней.',
      'Раунды 2–3, конец вашей фазы командования: 5 ПО за каждую вашу цель, кроме домашней.',
      'С 4-го раунда, конец вашего хода: 6 ПО за каждую вашу цель, кроме домашней.',
    ],
  },
  gatherIntel: {
    name: 'Сбор разведданных', nameEn: 'Gather Intel',
    action: 'extractIntel',
    lines: [
      'Раунд 1, конец вашего хода: 6 ПО, если вы держите центральную цель.',
      'Со 2-го раунда, конец вашей фазы командования (в 5-м раунде — конец хода): 4 ПО, если вы держите хотя бы одну цель, кроме домашней.',
      'Со 2-го раунда, конец вашего хода: 7 ПО за каждый отряд, завершивший действие «Добыть сведения».',
      'Конец битвы: 5 ПО, если на поле три или больше ваших маркера операции, и 5 ПО, если ваш маркер стоит у домашней цели противника.',
    ],
  },
  sabotage: {
    name: 'Диверсия', nameEn: 'Sabotage',
    action: 'sabotage',
    lines: [
      'Любой раунд, конец вашего хода: 3 ПО за каждый отряд, совершивший диверсию, и ещё 2 ПО за каждый из них у цели на территории противника.',
      'Со 2-го раунда, конец вашей фазы командования (в 5-м раунде — конец хода): 4 ПО, если вы держите хотя бы одну цель, кроме домашней.',
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
    name: 'Добыть сведения', nameEn: 'Extract Intelligence', fromRound: 2, vp: 7,
    text: 'Фаза стрельбы, со 2-го раунда: отряд у цели (кроме своей домашней), где ещё нет вашего маркера операции. Завершается в конце хода, если отряд держит цель: у цели ставится ваш маркер операции.',
  },
  sabotage: {
    name: 'Диверсия', nameEn: 'Sabotage', fromRound: 1, vp: 3,
    text: 'Фаза стрельбы: отряд у цели (кроме своей домашней). Завершается в конце хода, если отряд держит цель: отряд совершил диверсию.',
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
  const capped = got < vp ? ` (лимит: засчитано ${got} из ${vp})` : ''
  addLog(s, `${FACTION_NAME[p]}: +${got} ПО — ${PRIMARY[m.primary].name}: ${why}${capped}.`, 'minimal')
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
      if (mine.length) out.push({ vp: mine.length * 3, why: `${mine.length} цел. × 3` })
      const home = mine.some((o) => isHomeOf(o, p))
      const extra = mine.filter((o) => !isHomeOf(o, p)).length
      if (home && extra) out.push({ vp: extra * 2, why: `домашняя цель удержана: ещё ${extra} × 2` })
      break
    }
    case 'meatgrinder':
    case 'gatherIntel':
    case 'sabotage':
      if (heldNotHome(s, p).length) out.push({ vp: 4, why: 'удержана цель вне своей зоны' })
      break
    case 'outmanoeuvre':
      if (round <= 3) {
        const n = heldNotHome(s, p).length
        if (n) out.push({ vp: n * 5, why: `${n} цел. (кроме домашней) × 5` })
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
      if (round <= 2 && held(s, p).length > held(s, foe).length) out.push({ vp: 2, why: 'целей больше, чем у противника' })
      break
    case 'meatgrinder':
      if (lost[foe] > 0) out.push({ vp: 3, why: `уничтожено вражеских отрядов в этот ход: ${lost[foe]}` })
      if (round >= 2 && lost[foe] > m.lostLastTurn[p]) out.push({ vp: 5, why: `уничтожено ${lost[foe]}, потеряно в прошлый ход ${m.lostLastTurn[p]}` })
      break
    case 'outmanoeuvre': {
      if (holdsEnemyHome(s, p)) out.push({ vp: 10, why: 'удержана домашняя цель противника' })
      const n = heldNotHome(s, p).length
      if (n && round === 1) out.push({ vp: n * 4, why: `${n} цел. (кроме домашней) × 4` })
      if (n && round >= 4) out.push({ vp: n * 6, why: `${n} цел. (кроме домашней) × 6` })
      break
    }
    case 'gatherIntel': {
      if (round === 1 && held(s, p).some((o) => o.role === 'central')) out.push({ vp: 6, why: 'удержана центральная цель' })
      const n = completed.filter((u) => u.action!.id === 'extractIntel').length
      if (round >= 2 && n) out.push({ vp: n * 7, why: `сведения добыты: ${n} отряд(а) × 7` })
      break
    }
    case 'sabotage': {
      const done = completed.filter((u) => u.action!.id === 'sabotage')
      if (done.length) out.push({ vp: done.length * 3, why: `диверсия: ${done.length} отряд(а) × 3` })
      const deep = done.filter((u) => s.objectives.some((o) => inTerritory(s, foe, o) && unitNearObjective(u, o))).length
      if (deep) out.push({ vp: deep * SABOTAGE_TERRITORY_BONUS, why: `${deep} из них на территории противника × ${SABOTAGE_TERRITORY_BONUS}` })
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
      addLog(s, `${u.name}: действие «${info.name}» завершено${u.action.id === 'extractIntel' ? ' — у цели поставлен маркер операции' : ''}.`, 'minimal')
    } else if (!isDestroyed(u)) addLog(s, `${u.name}: действие «${info.name}» сорвано — отряд не держит цель.`, 'standard')
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
    if (m.primary === 'meatgrinder' && holdsEnemyHome(s, p)) scorePrimary(s, p, 5, 'конец битвы: удержана домашняя цель противника', true)
    if (m.primary === 'gatherIntel') {
      const mine = m.markers.filter((x) => x.owner === p)
      if (mine.length >= 3) scorePrimary(s, p, 5, `конец битвы: маркеров операции на поле — ${mine.length}`, true)
      if (mine.some((x) => s.objectives.some((o) => o.id === x.objectiveId && isHomeOf(o, foe)))) scorePrimary(s, p, 5, 'конец битвы: маркер у домашней цели противника', true)
    }
  }
}

/** Why this unit cannot start a mission action at this objective now, or null when it can. */
export function actionProblem(s: GameState, u: UnitState, objectiveId: string): string | null {
  const m = s.mission
  const id = m && PRIMARY[m.primary].action
  if (!m || !id) return 'В этой миссии нет действий.'
  const info = MISSION_ACTION[id]
  if (s.phase !== 'shooting') return 'Действие начинается в фазе стрельбы.'
  if (u.owner !== s.activePlayer) return 'Действие начинают в свой ход.'
  if (s.round < info.fromRound) return `«${info.name}» можно начать только с ${info.fromRound}-го раунда.`
  if (u.action) return 'Отряд уже выполняет действие.'
  if (u.shot) return 'Отряд уже стрелял в этой фазе.'
  if (u.battleShocked) return 'Отряд в боевом шоке.'
  if (!alive(u).some((x) => profileOf(x).oc > 0)) return 'У отряда OC 0 — он не может выполнять действия.'
  if (u.move === 'advance' || u.move === 'fallBack') return 'Отряд продвигался или отступал в этот ход.'
  if (s.units.some((e) => e.owner !== u.owner && !isDestroyed(e) && isEngagedWith(u, e))) return 'Отряд в контакте с врагом.'
  const o = s.objectives.find((x) => x.id === objectiveId)
  if (!o) return 'Нет такой цели.'
  if (isHomeOf(o, u.owner)) return 'Не у своей домашней цели.'
  if (!unitNearObjective(u, o)) return 'Отряд должен быть в пределах цели (3″).'
  if (s.units.some((x) => x.owner === u.owner && x.action?.objectiveId === objectiveId)) return 'У этой цели действие уже начал другой ваш отряд.'
  if (id === 'extractIntel' && m.markers.some((x) => x.owner === u.owner && x.objectiveId === objectiveId)) return 'У этой цели уже стоит ваш маркер операции.'
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

/** One line for the log and the header: «Миссия: Диверсия (Sabotage)». */
export const missionName = (s: GameState) => (s.mission ? `${PRIMARY[s.mission.primary].name} (${PRIMARY[s.mission.primary].nameEn})` : null)
