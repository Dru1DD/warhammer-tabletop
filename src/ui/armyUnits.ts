import { listProblems } from '../game/army/armyList'
import { listUnits } from '../game/army/placement'
import { FACTION_NAME } from '../game/data/datasheets'
import { armyOf } from '../game/scenarios/scenarios'
import type { PlayerId, UnitState } from '../game/types'
import type { Settings } from '../store'

/** Units a faction fields with these settings: its army list, or the scenario's training roster. */
export function armyUnits(settings: Settings, faction: PlayerId): UnitState[] {
  const list = settings.armies?.[faction]
  if (list) return listUnits(faction, list)
  return armyOf(settings.scenarioId, faction) ?? armyOf('combat-patrol', faction)!
}

/** Problems of the lists that would play with these settings (the two sides only). */
export function battleListProblems(settings: Settings): string[] {
  return [settings.human, settings.opponent].flatMap((f) => {
    const list = settings.armies?.[f]
    return list ? listProblems(f, list).map((p) => `${FACTION_NAME[f]}: ${p}`) : []
  })
}
