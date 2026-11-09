// Pure lobby rules: the host owns the configuration, the guest picks a faction and says "ready".

import { FACTIONS, type PlayerId } from '../game/types'
import { scenarioById, SCENARIOS } from '../game/scenarios/scenarios'
import type { LobbyState } from './protocol'

const supports = (scenarioId: string, a: PlayerId, b: PlayerId) => {
  const f = SCENARIOS.find((s) => s.id === scenarioId)?.factions
  return !!f && f.includes(a) && f.includes(b)
}

/** Valid, distinct factions on a scenario that has both armies (else the all-factions "combat-patrol"). */
export function normalizeLobby(l: LobbyState): LobbyState {
  const hostSide = FACTIONS.includes(l.hostSide) ? l.hostSide : 'marines'
  let guestSide = FACTIONS.includes(l.guestSide) && l.guestSide !== hostSide ? l.guestSide : (hostSide === 'orks' ? 'marines' : 'orks')
  if (guestSide === hostSide) guestSide = FACTIONS.find((f) => f !== hostSide)!
  const scenarioId = supports(l.scenarioId, hostSide, guestSide) ? scenarioById(l.scenarioId).id : 'combat-patrol'
  return { ...l, hostSide, guestSide, scenarioId, guestReady: l.guestReady && guestSide === l.guestSide && scenarioId === l.scenarioId }
}

export const defaultLobby = (): LobbyState => ({ scenarioId: 'training-outpost', hostSide: 'marines', guestSide: 'orks', guestConnected: false, guestReady: false })

/** Factions the guest may take next to the host's faction in this scenario. */
export const guestChoices = (l: LobbyState): PlayerId[] => FACTIONS.filter((f) => f !== l.hostSide && supports(l.scenarioId, l.hostSide, f))

/** Returns a Russian reason when the match cannot start yet, else null. */
export function startProblem(l: LobbyState): string | null {
  if (!l.guestConnected) return 'Ждём второго игрока.'
  if (!l.guestReady) return 'Второй игрок ещё не готов.'
  if (l.hostSide === l.guestSide) return 'Фракции игроков должны различаться.'
  if (!supports(l.scenarioId, l.hostSide, l.guestSide)) return 'В сценарии нет армий для этой пары фракций.'
  return null
}
