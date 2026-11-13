import { assaultAll } from './engine'
import { alive, enemiesOf, engagedUnits, fmt, hasAbility, profileOf, unitDistance, weaponsOf } from './gameState'
import type { GameState, UnitState } from './types'
import { quote, tr } from '../i18n/index'

// “Really Advance?” for beginners: after an Advance only Assault weapons shoot, so advancing a unit of riflemen
// that has (or after a Normal move would have) an enemy in range throws its shooting away. Battle of 12.11.2026:
// Rangers II advanced twice and did not fire once in the whole game. Pure.

export interface AdvanceWarning {
  why: string[]
}

/** Why an Advance would cost this unit its shooting, or null when it does not: no ranged weapons that need a
 * Normal move, everything shoots after an Advance anyway, or no enemy within their range plus a Normal move. */
export function advanceWarning(s: GameState, unit: UnitState): AdvanceWarning | null {
  const models = alive(unit)
  if (!models.length || engagedUnits(s, unit).length) return null
  if (assaultAll(s, unit) || hasAbility(unit, 'elevatedStrider')) return null
  // the main ranged weapons (not pistols) with no Assault profile: these fall silent after an Advance
  const lost = new Map<string, { name: string; range: number }>()
  for (const m of models)
    for (const w of weaponsOf(m)) {
      if (w.profiles[0].range === 'melee' || w.profiles[0].keywords.closeQuarters) continue
      if (w.profiles.some((p) => p.keywords.assault)) continue
      const range = Math.max(...w.profiles.map((p) => (typeof p.range === 'number' ? p.range : 0)))
      if (range > 0) lost.set(w.id, { name: w.name, range })
    }
  if (!lost.size) return null
  const reach = Math.max(...[...lost.values()].map((w) => w.range))
  const move = profileOf(models[0]).m
  let nearest: { unit: UnitState; d: number } | null = null
  for (const e of enemiesOf(s, unit)) {
    const d = unitDistance(unit, e)
    if (!nearest || d < nearest.d) nearest = { unit: e, d }
  }
  if (!nearest || nearest.d > reach + move) return null
  const weapons = [...lost.values()].map((w) => w.name).join(', ')
  return {
    why: [
      tr('After an Advance {name} does not shoot with {weapons}: they are not Assault weapons.', { name: quote(unit.name), weapons }),
      nearest.d <= reach
        ? tr('{target} is {fmt}″ away — already within range ({range}″).', { target: quote(nearest.unit.name), fmt: fmt(nearest.d), range: reach })
        : tr('{target} is {fmt}″ away: a Normal move of {m}″ brings the unit within range ({range}″).', { target: quote(nearest.unit.name), fmt: fmt(nearest.d), m: move, range: reach }),
    ],
  }
}
