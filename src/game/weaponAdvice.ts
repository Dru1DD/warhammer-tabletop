import { woundTarget } from './combat/attack'
import type { RandomDie, Weapon, WeaponProfile } from './types'

// What a weapon profile is good at, for beginners: its expected result per firing model against three reference
// targets, turned into ratings and a short hint. Pure; uses the same dice maths as the engine (hit, wound, save, damage
// with Sustained/Lethal Hits, Anti-X and Devastating Wounds), without situational modifiers (cover, Heavy, buffs).

export type TargetKind = 'horde' | 'elite' | 'heavy'

export interface Reference {
  label: string
  t: number
  sv: number
  /** invulnerable save, if any: used when it is better than the armour save after AP */
  invuln?: number
  w: number
  models: number
  keywords: string[]
}

/** Typical targets: a cheap horde (Termagants, Gretchin), elite infantry (Intercessors), a big monster or vehicle. */
export const REFERENCE: Record<TargetKind, Reference> = {
  horde: { label: 'толпы пехоты', t: 3, sv: 5, w: 1, models: 10, keywords: ['INFANTRY'] },
  elite: { label: 'бронированная пехота', t: 4, sv: 3, w: 2, models: 5, keywords: ['INFANTRY'] },
  heavy: { label: 'техника и монстры', t: 10, sv: 2, w: 12, models: 1, keywords: ['VEHICLE', 'MONSTER'] },
}

const AVG: Record<RandomDie, number> = { D3: 2, D6: 3.5, '3D3': 6 }
const faces = (ok: (v: number) => boolean) => [1, 2, 3, 4, 5, 6].filter(ok).length / 6

/** Expected wounds removed per firing model against the reference (each failed save does at most `w` damage). */
export function profileVs(p: WeaponProfile, ref: Reference): number {
  const k = p.keywords
  const attacks = p.attacks + (p.randomA ? AVG[p.randomA] : 0) + (k.blast ?? 0) * Math.floor(ref.models / 5) + (k.rapidFire ?? 0) / 2
  const heavyTarget = ref.keywords.includes('VEHICLE') || ref.keywords.includes('MONSTER')
  let normalHits: number, critHits: number
  if (p.skill === null || k.torrent) {
    normalHits = 1
    critHits = 0
  } else {
    const pHit = faces((v) => v !== 1 && v >= Math.max(2, p.skill!))
    critHits = 1 / 6
    normalHits = pHit - critHits + critHits * (k.sustainedHits ?? 0)
  }
  const lethal = k.lethalHits === true || (k.lethalHits === 'nonMV' && !heavyTarget)
  const rolls = normalHits + (lethal ? 0 : critHits)
  const auto = lethal ? critHits : 0
  const wt = woundTarget(p.s, ref.t)
  const anti = k.anti && ref.keywords.includes(k.anti.keyword) ? k.anti.roll : 7
  let pWound = faces((v) => v !== 1 && (v >= wt || v >= anti))
  const pCrit = faces((v) => v >= Math.min(6, anti))
  if (k.twinLinked) pWound += (1 - pWound) * pWound
  const dev = k.devastatingWounds ? rolls * pCrit : 0
  const normal = rolls * pWound - dev + auto
  const need = Math.min(ref.sv + Math.abs(p.ap), ref.invuln ?? 7)
  const pFail = need > 6 ? 1 : (need - 1) / 6
  const dmg = Math.min(p.d + (p.randomD ? AVG[p.randomD] : 0), ref.w)
  return attacks * (normal * pFail + dev) * dmg
}

/** A typical result per firing model against each kind of target, used to see what a weapon leans towards. */
const TYPICAL: Record<TargetKind, number> = { horde: 0.8, elite: 0.3, heavy: 0.8 }
/** Wounds per firing model against a big vehicle or monster: at or above it «пробивает», below it «почти бесполезно». */
const CRACKS_ARMOUR = 0.5
const USELESS_VS_ARMOUR = 0.1

const AGAINST: Record<TargetKind, string> = { horde: 'против толп пехоты', elite: 'против бронированной пехоты', heavy: 'против техники и монстров' }

export interface WeaponAdvice {
  /** per firing model: models killed (horde, elite) or wounds (heavy) */
  value: Record<TargetKind, number>
  /** what it does best, relative to a typical weapon (one or two kinds) */
  best: TargetKind[]
  /** it reliably wounds big vehicles and monsters */
  cracksArmour: boolean
  /** it barely scratches big vehicles and monsters */
  uselessVsArmour: boolean
  /** short lines for the player, e.g. «👥 Лучше всего против толп пехоты», «⚠ По технике и монстрам почти бесполезно» */
  lines: string[]
}

export function weaponAdvice(p: WeaponProfile): WeaponAdvice {
  // Anti-X helps only against X (VEHICLE or MONSTER, not both), so the general ratings leave it out; it gets its own line
  const { anti: _anti, ...general } = p.keywords
  const plain = { ...p, keywords: general }
  const value = {
    horde: profileVs(plain, REFERENCE.horde) / REFERENCE.horde.w,
    elite: profileVs(plain, REFERENCE.elite) / REFERENCE.elite.w,
    heavy: profileVs(plain, REFERENCE.heavy),
  }
  const kinds = Object.keys(value) as TargetKind[]
  const lean = (t: TargetKind) => value[t] / TYPICAL[t]
  const top = Math.max(...kinds.map(lean))
  const best = kinds.filter((t) => lean(t) >= top * 0.85)
  const cracksArmour = value.heavy >= CRACKS_ARMOUR
  const uselessVsArmour = value.heavy < USELESS_VS_ARMOUR
  const lines: string[] = []
  const icon: Record<TargetKind, string> = { horde: '👥', elite: '🛡', heavy: '🔨' }
  lines.push(`${icon[best[0]]} Лучше всего ${best.map((t) => AGAINST[t]).join(' и ')}`)
  if (cracksArmour && !best.includes('heavy')) lines.push('🔨 Пробивает технику и монстров')
  if (uselessVsArmour) lines.push('⚠ По технике и монстрам почти бесполезно')
  if (p.keywords.devastatingWounds) lines.push('💥 Шестёрка на ранение проходит сквозь любую броню (Devastating Wounds)')
  if (p.keywords.anti) {
    const { keyword, roll } = p.keywords.anti
    const who: Record<string, string> = { VEHICLE: 'технику', MONSTER: 'монстров', INFANTRY: 'пехоту', PSYKER: 'псайкеров', CHARACTER: 'персонажей', FLY: 'летающих' }
    lines.push(`🎯 Против ${keyword} ранит на ${roll}+ (Anti-${keyword})${roll <= 4 && who[keyword] ? ` — хорошо бьёт ${who[keyword]}` : ''}`)
  }
  return { value, best, cracksArmour, uselessVsArmour, lines }
}

/** How far a weapon reaches: «30″», «24″ / 12″» for two profiles, «ближний бой» for a melee weapon. */
export function weaponReach(w: Weapon): string {
  if (w.profiles.some((p) => p.range === 'melee')) return 'ближний бой'
  const ranges = [...new Set(w.profiles.map((p) => p.range as number))].sort((a, b) => b - a)
  return ranges.map((r) => `${r}″`).join(' / ')
}
