import { expectedGroupDamage } from './ai/ai'
import { chargeForecast, type ChargeForecast } from './chargeAdvice'
import { engagementAdvice, type EngagementAdvice } from './engagementAdvice'
import { shootPlan } from './engine'
import { dist } from './geometry/geometry'
import { alive, CHARGE_RANGE, enemiesOf, ENGAGEMENT_RANGE, profileOf, unitDistance } from './gameState'
import { unitCanSee } from './rules/visibility'
import type { GameState, UnitState, Vec } from './types'

// "What happens if I stand here?" for the movement phase: from the planned positions of one unit, which enemy units it
// could shoot in the coming shooting phase (and the expected damage), which it sees but cannot reach, and which enemy
// units could shoot it or reach it with a charge in their next turn. Pure: the state is never changed.

export interface SightRow {
  unitId: string
  name: string
  /** expected wounds (an average over all dice, see ai/ai.ts expectedGroupDamage) */
  dmg: number
  /** own shooting: how many models of the unit would fire at it (in range and sight), and how many there are */
  firing?: number
  models?: number
}

export interface ChargeThreat {
  unitId: string
  name: string
  /** distance the charge has to cover after the enemy's normal move, inches */
  need: number
  /** chance that 2D6 covers it (terrain on the way is ignored) */
  p: number
}

export interface MovePreview {
  /** you can shoot these from the new spot */
  canShoot: SightRow[]
  /** you see these, but no weapon reaches (or only Assault weapons may fire after an Advance) */
  seenOutOfRange: SightRow[]
  /** these can shoot you there, if they stay where they are */
  shotBy: SightRow[]
  /** these may charge you next turn */
  chargedBy: ChargeThreat[]
  /** what the move mode means for shooting */
  note: string | null
  /** the best target is reached by fewer than half of the unit's models: move so that the whole unit fires */
  partial: SightRow | null
  /** the charges this unit could declare from the planned spot (normal move only), best first */
  charges: ChargeForecast[]
  /** a unit locked in combat: stay or fall back (computed on where it stands now) */
  engagement: EngagementAdvice | null
}

const P2D6_AT_LEAST: number[] = [1, 1, 1, 35 / 36, 33 / 36, 30 / 36, 26 / 36, 21 / 36, 15 / 36, 10 / 36, 6 / 36, 3 / 36, 1 / 36]

/** Chance that a 2D6 charge roll covers `need` inches (a roll of 2 always fails, as in the engine). */
export function chargeChance(need: number): number {
  const n = Math.max(3, Math.ceil(need - 1e-9))
  return n > 12 ? 0 : P2D6_AT_LEAST[n]
}

/** The unit as it would stand after the move: positions from the draft, move mode and distance set. */
function movedUnit(u: UnitState, draft: Record<string, Vec>, mode: UnitState['move']): UnitState {
  let moved = 0
  const models = u.models.map((m) => {
    const p = draft[m.id]
    if (!p) return m
    moved = Math.max(moved, dist(m.pos, p))
    return { ...m, pos: p }
  })
  return { ...u, models, move: mode, movedDistance: moved }
}

/** Enemy unit as it would be at the start of its next turn (not moved yet, so Heavy and the like apply). */
const fresh = (u: UnitState): UnitState => ({ ...u, move: 'none', movedDistance: 0 })

const expected = (s: GameState, shooter: UnitState, target: UnitState): number | null => volley(s, shooter, target)?.dmg ?? null

/** Expected wounds and the number of models that fire, or null when the unit cannot shoot the target at all. */
function volley(s: GameState, shooter: UnitState, target: UnitState): { dmg: number; firing: number } | null {
  const plan = shootPlan(s, shooter, target)
  return plan.problem ? null : { dmg: plan.groups.reduce((a, g) => a + expectedGroupDamage(g, target), 0), firing: plan.firingModels.length }
}

export function movePreview(s: GameState, unitId: string, draft: Record<string, Vec>, mode: 'normal' | 'advance' | 'fallBack'): MovePreview | null {
  const u0 = s.units.find((u) => u.id === unitId)
  if (!u0 || !alive(u0).length) return null
  const me = movedUnit(u0, draft, mode)
  const hypo: GameState = { ...s, units: s.units.map((u) => (u.id === me.id ? me : u.owner !== me.owner ? fresh(u) : u)) }
  const foes = enemiesOf(hypo, me).filter((e) => alive(e).length)
  const out: MovePreview = { canShoot: [], seenOutOfRange: [], shotBy: [], chargedBy: [], note: null, partial: null, charges: [], engagement: null }
  if (mode === 'advance') out.note = 'После продвижения (Advance) стреляет только оружие Assault, и атаковать (charge) нельзя.'
  if (mode === 'fallBack') out.note = 'После отступления (Fall Back) отряд в этот ход не стреляет и не атакует.'

  for (const e of foes) {
    const row = { unitId: e.id, name: e.name }
    if (mode !== 'fallBack') {
      const v = volley(hypo, me, e)
      if (v) out.canShoot.push({ ...row, dmg: v.dmg, firing: v.firing, models: alive(me).length })
      else if (unitCanSee(hypo, me, e)) out.seenOutOfRange.push({ ...row, dmg: 0 })
    }
    const back = expected(hypo, e, me)
    if (back !== null) out.shotBy.push({ ...row, dmg: back })
    // charge next turn: a normal move of M first (it cannot end within Engagement Range), then 2D6
    const m = Math.min(...alive(e).map((x) => profileOf(x).m))
    const need = Math.max(unitDistance(e, me) - m, ENGAGEMENT_RANGE)
    if (need <= CHARGE_RANGE) out.chargedBy.push({ ...row, need, p: chargeChance(need) })
  }
  // charges from the new spot: only after a normal move (no charge after Advance or Fall Back)
  if (mode === 'normal') out.charges = chargeForecast(hypo, me)
  if (mode === 'fallBack') out.engagement = engagementAdvice(s, u0)
  out.canShoot.sort((a, b) => b.dmg - a.dmg)
  // the most common slip in the battles: a unit that ends its move where only part of it sees the target
  const best = out.canShoot[0]
  if (best && best.models! > 1 && best.firing! * 2 < best.models!) out.partial = best
  out.shotBy.sort((a, b) => b.dmg - a.dmg)
  out.chargedBy.sort((a, b) => b.p - a.p)
  return out
}
