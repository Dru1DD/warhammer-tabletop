import { PROFILES } from '../data/datasheets'
import { MECHANICUS_WARGEAR } from './wargearMechanicus'
import { OTHER_WARGEAR } from './wargearOthers'
import { tr } from '../../i18n/index'

// Wargear options (loadouts) of a datasheet, as the army builder offers them. A loadout says which model profile each
// model of the unit uses: every profile already carries its own weapons, so a "plasma caliver" option is simply the
// profile of a Skitarius with a plasma caliver. Limits come from the datasheet's Wargear Options (11th edition,
// Wahapedia), e.g. "for every 10 models, up to 2 can take a special weapon". Points do not depend on wargear here.

export interface Variant {
  /** model profile id */
  profile: string
  /** short label for the builder, e.g. "Plasma Caliver" */
  label: string
}

export interface VariantGroup {
  id: string
  /** for the player: "Special weapon (up to 2 per 10 models)" */
  label: string
  variants: Variant[]
  /** how many models of the unit may take a variant of this group, for a unit of `size` models */
  max: (size: number) => number
  /** a cap for one variant inside the group (e.g. at most 1 transuranic arquebus) */
  variantMax?: Record<string, number>
  /** how many models must take a variant of this group (e.g. exactly one Heavy Weapon Platform) */
  min?: number
}

export interface WargearSpec {
  /** the unit's leader (Alpha, Princeps): one model, it picks one of these profiles; the first one is the default */
  leader?: Variant[]
  /** the default trooper: every model not given a variant */
  base: Variant
  groups: VariantGroup[]
}

/** A unit's chosen loadout: the leader's profile and how many troopers take each variant (the rest are `base`). */
export interface Loadout {
  leader?: string
  counts: Record<string, number>
}

export const WARGEAR: Record<string, WargearSpec> = { ...MECHANICUS_WARGEAR, ...OTHER_WARGEAR }

/** Model profiles of a unit with this loadout: the leader first, then the variants, then the base troopers. */
export function composeLoadout(spec: WargearSpec, size: number, loadout: Loadout): string[] {
  const out: string[] = []
  if (spec.leader) out.push(loadout.leader && spec.leader.some((v) => v.profile === loadout.leader) ? loadout.leader : spec.leader[0].profile)
  for (const g of spec.groups)
    for (const v of g.variants) for (let i = 0; i < (loadout.counts[v.profile] ?? 0) && out.length < size; i++) out.push(v.profile)
  while (out.length < size) out.push(spec.base.profile)
  return out
}

/** The loadout matching the unit's default equipment (its model profiles without a chosen loadout). */
export function loadoutOf(spec: WargearSpec, profiles: string[]): Loadout {
  const variants = new Set(spec.groups.flatMap((g) => g.variants.map((v) => v.profile)))
  const counts: Record<string, number> = {}
  for (const p of spec.leader ? profiles.slice(1) : profiles) if (variants.has(p)) counts[p] = (counts[p] ?? 0) + 1
  return { ...(spec.leader ? { leader: profiles[0] } : {}), counts }
}

/** What is wrong with a loadout, in Russian; empty when it is legal. */
export function loadoutProblems(datasheetId: string, size: number, loadout: Loadout): string[] {
  const spec = WARGEAR[datasheetId]
  if (!spec) return [tr('This unit has no wargear options.')]
  const out: string[] = []
  if (loadout.leader && !spec.leader?.some((v) => v.profile === loadout.leader)) out.push(tr('Unknown unit leader wargear.'))
  const known = new Set(spec.groups.flatMap((g) => g.variants.map((v) => v.profile)))
  for (const [p, n] of Object.entries(loadout.counts)) {
    if (!known.has(p)) out.push(tr('Unknown wargear option “{value}”.', { value: PROFILES[p]?.name ?? p }))
    if (!Number.isInteger(n) || n < 0) out.push(tr('The number of models with an option must be a whole number, zero or more.'))
  }
  const troopers = size - (spec.leader ? 1 : 0)
  let used = 0
  for (const g of spec.groups) {
    const n = g.variants.reduce((a, v) => a + (loadout.counts[v.profile] ?? 0), 0)
    used += n
    if (n > g.max(size)) out.push(tr('{label}: at most {max} per unit of {size}.', { label: g.label, max: g.max(size), size }))
    if (g.min !== undefined && n < g.min) out.push(tr('{label}: you must pick {min}.', { label: g.label, min: g.min }))
    for (const v of g.variants) {
      const cap = g.variantMax?.[v.profile]
      if (cap !== undefined && (loadout.counts[v.profile] ?? 0) > cap) out.push(tr('{label}: at most {cap} per unit.', { label: v.label, cap }))
    }
  }
  if (used > troopers) out.push(tr('There are more wargear options than models ({used} of {troopers}).', { used, troopers }))
  return out
}
