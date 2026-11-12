import { expectedGroupDamage, meleePotential, p2d6AtLeast } from './ai/ai'
import { reactionCommands, shootPlan } from './engine'
import { alive, findUnit, fmt, unitDistance } from './gameState'
import { STRATAGEMS } from './rules/stratagems'
import type { Command, GameState, UnitState } from './types'

// Which reactions are worth their Command points right now, for the AI and for the pause dialog («only when useful»).
// Pure; expected values only.

export interface ReactionOption {
  cmd: Extract<Command, { type: 'stratagem' }>
  /** «Огонь на опережение: Рейнджеры → Бойз I» */
  title: string
  /** a comparable value (expected wounds dealt or saved) */
  value: number
  worth: boolean
  /** why, for the player */
  why: string
}

const woundsLeft = (u: UnitState) => alive(u).reduce((a, m) => a + m.wounds, 0)
const shotDamage = (s: GameState, shooter: UnitState, target: UnitState, snap = false) => {
  const plan = shootPlan(s, shooter, target, { snap })
  return plan.problem ? 0 : Math.min(woundsLeft(target), plan.groups.reduce((a, g) => a + expectedGroupDamage(g, target), 0))
}

export function reactionAdvice(s: GameState): ReactionOption[] {
  const out: ReactionOption[] = []
  for (const c of reactionCommands(s)) {
    if (c.type !== 'stratagem') continue
    const info = STRATAGEMS[c.id]
    const u = findUnit(s, c.unitId)!
    const t = c.targetId ? findUnit(s, c.targetId) : undefined
    const title = `${info.name}: ${u.name}${t ? ` → ${t.name}` : ''}`
    if (c.id === 'fireOverwatch' && t) {
      const dmg = shotDamage(s, u, t, true)
      out.push({ cmd: c, title, value: dmg, worth: dmg >= 1, why: `≈ ${fmt(dmg)} ран навскидку (попадание только на «6»)${dmg < 1 ? ' — меньше одной раны, жаль CP' : ''}.` })
    } else if (c.id === 'smokescreen') {
      // the hardest volley the enemy can put into this unit in its coming Shooting phase
      const threat = Math.max(0, ...s.units.filter((e) => e.owner !== u.owner && alive(e).length).map((e) => shotDamage(s, e, u)))
      out.push({ cmd: c, title, value: threat / 4, worth: threat >= 3, why: threat >= 3 ? `По отряду могут нанести ≈ ${fmt(threat)} ран — укрытие заметно снизит урон.` : `По отряду почти некому стрелять (≈ ${fmt(threat)} ран).` })
    } else if (c.id === 'heroicIntervention' && t) {
      const p = p2d6AtLeast(Math.ceil(unitDistance(u, t) - 1e-9))
      const dealt = Math.min(woundsLeft(t), meleePotential(s, u, t, false))
      const taken = Math.min(woundsLeft(u), meleePotential(s, t, u, false))
      const worth = p >= 0.5 && p * dealt >= 1.5 && dealt >= taken * 0.75
      out.push({ cmd: c, title, value: p * dealt, worth, why: `Шанс дойти ${Math.round(p * 100)}%, в бою ≈ ${fmt(dealt)} ран врагу и ≈ ${fmt(taken)} вам.` })
    }
  }
  return out.sort((a, b) => Number(b.worth) - Number(a.worth) || b.value - a.value)
}
