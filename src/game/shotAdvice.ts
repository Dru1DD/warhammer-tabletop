import { expectedGroupDamage } from './ai/ai'
import { shootPlan } from './engine'
import { alive, enemiesOf, fmt } from './gameState'
import type { GameState, UnitState } from './types'
import { tr } from '../i18n/index'

// Shooting phase advice for beginners: for every enemy unit, the expected wounds and models killed by this unit's
// shooting, which target is best, and two common mistakes: overkill on an almost dead unit, and a target that barely
// gets scratched while a much better one is available. Pure; expected values only (averages over all dice).

export interface TargetAdvice {
  targetId: string
  name: string
  /** the engine's reason why this unit cannot shoot it, or null */
  problem: string | null
  /** expected wounds (each failed save capped at the model's wounds) */
  dmg: number
  /** expected models killed (capped at the models left) */
  kills: number
  models: number
  woundsLeft: number
  best: boolean
  /** expected damage far above what the target has left while another target is worth shooting */
  overkill: boolean
  /** a much better target is available */
  poor: boolean
}

export function shotAdvice(s: GameState, unit: UnitState, opts: Parameters<typeof shootPlan>[3] = {}): TargetAdvice[] {
  const rows = enemiesOf(s, unit).filter((e) => alive(e).length).map((e): TargetAdvice => {
    const plan = shootPlan(s, unit, e, opts)
    const dmg = plan.problem ? 0 : plan.groups.reduce((a, g) => a + expectedGroupDamage(g, e), 0)
    const models = alive(e).length
    const woundsLeft = alive(e).reduce((a, m) => a + m.wounds, 0)
    return { targetId: e.id, name: e.name, problem: plan.problem, dmg, kills: Math.min(models, dmg / (woundsLeft / models)), models, woundsLeft, best: false, overkill: false, poor: false }
  })
  const eff = (r: TargetAdvice) => Math.min(r.dmg, r.woundsLeft)
  const usable = rows.filter((r) => !r.problem && r.dmg > 0)
  if (!usable.length) return rows
  const top = usable.reduce((a, b) => (eff(b) > eff(a) ? b : a))
  top.best = true
  for (const r of usable) {
    const others = usable.filter((o) => o !== r && eff(o) >= 1)
    r.overkill = r.dmg >= 2 * r.woundsLeft && r.dmg - r.woundsLeft >= 1.5 && others.length > 0
    r.poor = !r.best && eff(top) >= 1 && eff(r) < 0.35 * eff(top)
  }
  return rows
}

/** One line for the player, e.g. "≈ 2.1 wounds → ~2 of 10 models". */
export function adviceLine(a: TargetAdvice): string {
  const kills = a.kills >= 1 ? String(Math.round(a.kills)) : fmt(a.kills)
  return tr('≈ {fmt} wounds → ~{kills} of {models} models', { fmt: fmt(a.dmg), kills, models: a.models })
}

/** Warnings for the player, empty when the choice is fine. */
export function adviceWarnings(a: TargetAdvice, all: TargetAdvice[]): string[] {
  const out: string[] = []
  const top = all.find((r) => r.best)
  if (a.overkill) out.push(tr('Overkill: the target has {woundsLeft} wounds left, and ~{fmt} are expected. Some shots will be wasted — better to finish it with a weaker unit.', { woundsLeft: a.woundsLeft, fmt: fmt(a.dmg) }))
  if (a.poor && top) out.push(tr('Weak: “{name}” will take ~{fmt} wounds.', { name: top.name, fmt: fmt(Math.min(top.dmg, top.woundsLeft)) }))
  return out
}
