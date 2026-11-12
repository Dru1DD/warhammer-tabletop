import { FACTION_NAME } from '../game/data/datasheets'
import { sidesOf } from '../game/gameState'
import type { GameState, PlayerId } from '../game/types'
import { tr } from '../i18n/index'

const SHORT_NAME: Record<PlayerId, string> = { marines: tr('SM'), orks: tr('Orks'), tyranids: tr('Tyranids'), necrons: tr('Necrons'), aeldari: tr('Aeldari'), adeptus_mechanicus: tr('Mechanicus') }

/** "SM 5 : 0 Orks" (west : east) with short or full faction names. */
export function scoreText(g: GameState, names: 'short' | 'full' = 'short'): string {
  const [a, b] = sidesOf(g)
  const n = names === 'short' ? SHORT_NAME : FACTION_NAME
  return `${n[a]} ${g.players[a].vp} : ${g.players[b].vp} ${n[b]}`
}
