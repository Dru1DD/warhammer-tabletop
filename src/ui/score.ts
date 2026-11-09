import { FACTION_NAME } from '../game/data/datasheets'
import { sidesOf } from '../game/gameState'
import type { GameState, PlayerId } from '../game/types'

const SHORT_NAME: Record<PlayerId, string> = { marines: 'КД', orks: 'Орки', tyranids: 'Тираниды', necrons: 'Некроны', aeldari: 'Аэльдари' }

/** "КД 5 : 0 Орки" (west : east) with short or full faction names. */
export function scoreText(g: GameState, names: 'short' | 'full' = 'short'): string {
  const [a, b] = sidesOf(g)
  const n = names === 'short' ? SHORT_NAME : FACTION_NAME
  return `${n[a]} ${g.players[a].vp} : ${g.players[b].vp} ${n[b]}`
}
