// Pure lobby rules: the host owns the configuration, the guest picks a faction and says "ready".

import { listProblems, type ArmyList } from '../game/army/armyList'
import { DATASHEETS, FACTION_NAME } from '../game/data/datasheets'
import { FACTIONS, type PlayerId } from '../game/types'
import { scenarioById, SCENARIOS } from '../game/scenarios/scenarios'
import type { LobbyState } from './protocol'
import { tr } from '../i18n/index'

const supports = (scenarioId: string, a: PlayerId, b: PlayerId) => {
  const f = SCENARIOS.find((s) => s.id === scenarioId)?.factions
  return !!f && f.includes(a) && f.includes(b)
}

/** A list counts only for the faction it was built for. */
const ownList = (side: PlayerId, list: ArmyList | null | undefined) => (list && list.units.every((e) => DATASHEETS[e.datasheetId]?.faction === side) ? list : null)

/**
 * Valid, distinct factions on a scenario that has both armies (else the all-factions "combat-patrol"). An army list of the
 * wrong faction is dropped; own lists play only on a board that takes them (the Combat Patrol board).
 */
export function normalizeLobby(l: LobbyState): LobbyState {
  const hostSide = FACTIONS.includes(l.hostSide) ? l.hostSide : 'marines'
  let guestSide = FACTIONS.includes(l.guestSide) && l.guestSide !== hostSide ? l.guestSide : (hostSide === 'orks' ? 'marines' : 'orks')
  if (guestSide === hostSide) guestSide = FACTIONS.find((f) => f !== hostSide)!
  const hostArmy = ownList(hostSide, l.hostArmy)
  const guestArmy = ownList(guestSide, l.guestArmy)
  const custom = !!(hostArmy || guestArmy)
  const scenarioId = supports(l.scenarioId, hostSide, guestSide) && (!custom || scenarioById(l.scenarioId).customArmies) ? scenarioById(l.scenarioId).id : 'combat-patrol'
  return { ...l, hostSide, guestSide, scenarioId, hostArmy, guestArmy, guestReady: l.guestReady && guestSide === l.guestSide && scenarioId === l.scenarioId }
}

export const defaultLobby = (): LobbyState => ({ scenarioId: 'training-outpost', hostSide: 'marines', guestSide: 'orks', guestConnected: false, guestReady: false })

/** Factions the guest may take next to the host's faction in this scenario. */
export const guestChoices = (l: LobbyState): PlayerId[] => FACTIONS.filter((f) => f !== l.hostSide && supports(l.scenarioId, l.hostSide, f))

/** Returns a Russian reason when the match cannot start yet, else null. */
export function startProblem(l: LobbyState): string | null {
  if (!l.guestConnected) return tr('Waiting for the second player.')
  if (!l.guestReady) return tr('The second player is not ready yet.')
  if (l.hostSide === l.guestSide) return tr('The players’ factions must differ.')
  if (!supports(l.scenarioId, l.hostSide, l.guestSide)) return tr('The scenario has no armies for this pair of factions.')
  for (const [who, side, list] of [[tr('host’s'), l.hostSide, l.hostArmy], [tr('guest’s'), l.guestSide, l.guestArmy]] as const) {
    const p = list ? listProblems(side, list) : []
    if (p.length) return tr('The {who} roster ({item}) breaks the rules: {item2}', { who, item: FACTION_NAME[side], item2: p[0] })
  }
  return null
}

/** "Training roster" or "Own roster: 495 / 500 pts, 6 units" for the lobby. */
export const armyLine = (list: ArmyList | null | undefined, points: (l: ArmyList) => number) =>
  list ? tr('Own roster: {points} / {limit} pts, {length} units{noDetachment}', { points: points(list), limit: list.limit, length: list.units.length, noDetachment: list.noDetachment ? tr(', no detachment') : '' }) : tr('Training roster')
