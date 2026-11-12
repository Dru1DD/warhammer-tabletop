import { alive, datasheetOf, hasAbility, hasKeyword, isMV, isFlyer, profileOf, weaponsOf } from '../gameState'
import type { RandomDie, UnitState, WeaponProfile } from '../types'
import { tr } from '../../i18n/index'

// Battlefield role of a unit, read off its datasheet: what it is good at decides where a deployment preset
// (army/deployPresets.ts) puts it. Nothing is tagged by hand, so new datasheets get a role automatically.

export type UnitRole = 'assault' | 'shooter' | 'screen' | 'character' | 'infiltrator'

export const ROLE_NAME: Record<UnitRole, string> = {
  assault: tr('assault'),
  shooter: tr('shooters'),
  screen: tr('screen'),
  character: tr('character'),
  infiltrator: tr('saboteurs'),
}

export const ROLE_ICON: Record<UnitRole, string> = { assault: '⚔', shooter: '🎯', screen: '🪖', character: '👑', infiltrator: '🥷' }

export interface UnitProfile {
  role: UnitRole
  /** rough expected damage per turn against a typical target (T4, 3+ save) */
  ranged: number
  melee: number
  /** longest weapon range, inches (0 = no ranged weapons) */
  range: number
  /** Move characteristic of the slowest model */
  speed: number
  /** total Objective Control */
  oc: number
  /** total wounds: a stand-in for how much the army invested in the unit */
  wounds: number
  tough: boolean
  fast: boolean
}

const AVG: Record<RandomDie, number> = { D3: 2, D6: 3.5, '3D3': 6 }
const pSkill = (skill: number | null) => (skill === null ? 1 : Math.max(1, Math.min(5, 7 - skill)) / 6)

/** Expected damage of one profile against T4 / 3+ (wound roll from S, save worsened by AP, damage capped at 3). */
export function profileOutput(p: WeaponProfile): number {
  const a = p.attacks + (p.randomA ? AVG[p.randomA] : 0) + (p.keywords.blast ? 1 : 0) + (p.keywords.rapidFire ?? 0) / 2
  const wound = p.s >= 8 ? 5 / 6 : p.s > 4 ? 4 / 6 : p.s === 4 ? 3 / 6 : p.s >= 3 ? 2 / 6 : 1 / 6
  const save = Math.min(1, Math.max(0, (3 - Math.abs(p.ap) <= 1 ? 1 : 7 - (3 + Math.abs(p.ap))) / 6))
  const d = Math.min(3, p.d + (p.randomD ? AVG[p.randomD] : 0))
  return a * pSkill(p.skill) * wound * (1 - save) * d
}

/** Damage output of a unit: every ranged weapon fires (its best profile); in melee each model uses its best weapon
 * plus any Extra Attacks weapon. */
function outputs(u: UnitState): { ranged: number; melee: number; range: number } {
  let ranged = 0
  let melee = 0
  let range = 0
  for (const m of alive(u)) {
    let bestMelee = 0
    let extra = 0
    for (const w of weaponsOf(m)) {
      const best = Math.max(...w.profiles.map(profileOutput))
      const p0 = w.profiles[0]
      if (p0.range === 'melee') {
        if (p0.keywords.extraAttacks) extra += best
        else bestMelee = Math.max(bestMelee, best)
      } else {
        ranged += best
        for (const p of w.profiles) if (p.range !== 'melee') range = Math.max(range, p.range)
      }
    }
    melee += bestMelee + extra
  }
  return { ranged, melee, range }
}

/** Role and the numbers behind it. */
export function unitProfile(u: UnitState): UnitProfile {
  const models = alive(u)
  const { ranged, melee, range } = outputs(u)
  const speed = Math.min(...models.map((m) => profileOf(m).m))
  const oc = models.reduce((a, m) => a + profileOf(m).oc, 0)
  const wounds = models.reduce((a, m) => a + profileOf(m).w, 0)
  const fast = speed >= 9 || isFlyer(u)
  const base = { ranged, melee, range, speed, oc, wounds, tough: isMV(u), fast }
  if (datasheetOf(u).keywords.includes('CHARACTER')) return { role: 'character', ...base }
  if (hasAbility(u, 'infiltrators')) return { role: 'infiltrator', ...base }
  // many cheap bodies that do little damage: a screen (Gretchin, Termagants)
  const perModel = (ranged + melee) / models.length
  if (models.length >= 10 && perModel < 0.25 && !hasKeyword(u, 'BATTLELINE')) return { role: 'screen', ...base }
  if (models.length >= 10 && perModel < 0.18) return { role: 'screen', ...base }
  if (melee > 1.4 * ranged) return { role: 'assault', ...base }
  if (ranged > 1.2 * melee) return { role: 'shooter', ...base }
  // mixed: short guns and a quick unit mean it wants to close in
  return { role: range <= 12 || fast ? 'assault' : 'shooter', ...base }
}
