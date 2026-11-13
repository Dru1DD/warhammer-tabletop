// Ability zones: auras and the other abilities that work within a distance of a unit (#59). One registry for the board
// and the unit card; the rules themselves stay in their functions (engine.ts, gameState.ts), and zones.test.ts checks
// that both agree. Checked against the 11th-edition datasheets on Wahapedia, 13.11.2026 (docs/zones.md).
import { tr } from '../../i18n/index'
import {
  alive, BATTLELINE_RANGE, battlelineSupport, datasheetOf, hasAbility, hasKeyword, imperativeOf, isDestroyed, LEADER_RANGE, ledUnitOf,
  modelDistance, NEUROSTATIC_RANGE, PSYCHIC_GUIDANCE_RANGE, RAD_RANGE, radiusOf, SYNAPSE_RANGE, unitDistance, WARP_FIELD_RANGE,
} from '../gameState'
import { EPS } from '../geometry/geometry'
import type { GameState, ModelState, UnitState } from '../types'

/** Emanatus Force Field (Onager Dunecrawler): 6″, each model wholly within. */
export const EMANATUS_RANGE = 6
/** Deadly Demise: the explosion reaches units within 6″ of the destroyed model. */
export const DEADLY_DEMISE_RANGE = 6

export type ZoneId =
  | 'radSaturation' | 'neurostaticInterference' | 'emanatusForceField' | 'onslaught' | 'warpField'
  | 'synapse' | 'battleline' | 'psychicGuidance' | 'leader' | 'nobleLeader' | 'deadlyDemise'

export interface ZoneDef {
  id: ZoneId
  /** shown in the legend, the zone label and the unit card */
  name: string
  /** aura: the Aura keyword; zone: works the same way without it; leader: the game's 3″ stand-in for an attached leader;
   * explosion: Deadly Demise, drawn on hover only */
  kind: 'aura' | 'zone' | 'leader' | 'explosion'
  radius: number
  /** edge: the closest bases are within the radius; wholly: a model counts only when its whole base is within */
  measure: 'edge' | 'wholly'
  /** whose units it acts on, as seen from the source */
  side: 'friends' | 'enemies' | 'all'
  /** whether the source unit itself is in its own zone */
  self?: boolean
  /** whether `u` projects this zone */
  source: (s: GameState, u: UnitState) => boolean
  /** the badge on `target` inside the zone of `src` (distance aside), or null when the zone does nothing to it */
  effect: (s: GameState, src: UnitState, target: UnitState) => string | null
}

const admech = (u: UnitState) => datasheetOf(u).faction === 'adeptus_mechanicus'
const tyranid = (u: UnitState) => datasheetOf(u).faction === 'tyranids'
const admechBattleline = (u: UnitState) => admech(u) && hasKeyword(u, 'BATTLELINE')

export const ZONES: ZoneDef[] = [
  {
    id: 'radSaturation', name: tr('Rad-saturation'), kind: 'aura', radius: RAD_RANGE, measure: 'edge', side: 'enemies',
    source: (_, u) => hasAbility(u, 'radSaturation'),
    effect: (_, __, t) => (hasKeyword(t, 'VEHICLE') ? null : tr('−1 OC')),
  },
  {
    id: 'neurostaticInterference', name: tr('Neurostatic Interference'), kind: 'aura', radius: NEUROSTATIC_RANGE, measure: 'edge', side: 'enemies',
    source: (_, u) => hasAbility(u, 'neurostaticInterference'),
    effect: (s, src) => (battlelineSupport(s, src) ? tr('−2 Ld') : tr('−1 Ld')),
  },
  {
    id: 'emanatusForceField', name: tr('Emanatus Force Field'), kind: 'aura', radius: EMANATUS_RANGE, measure: 'wholly', side: 'friends',
    source: (_, u) => hasAbility(u, 'emanatusForceField'),
    effect: (_, __, t) => (admechBattleline(t) ? '4++' : null),
  },
  {
    id: 'onslaught', name: tr('Onslaught'), kind: 'aura', radius: SYNAPSE_RANGE, measure: 'edge', side: 'friends', self: true,
    source: (_, u) => hasAbility(u, 'onslaught'),
    effect: (_, __, t) => (tyranid(t) ? 'Assault, Lethal' : null),
  },
  {
    id: 'warpField', name: tr('Warp Field'), kind: 'aura', radius: WARP_FIELD_RANGE, measure: 'edge', side: 'friends', self: true,
    source: (_, u) => hasAbility(u, 'warpField'),
    effect: (_, __, t) => (tyranid(t) ? '6++' : null),
  },
  {
    id: 'synapse', name: tr('Synapse'), kind: 'zone', radius: SYNAPSE_RANGE, measure: 'edge', side: 'friends', self: true,
    source: (_, u) => tyranid(u) && hasKeyword(u, 'SYNAPSE'),
    effect: (_, __, t) => (tyranid(t) ? tr('Synapse') : null),
  },
  {
    id: 'battleline', name: tr('Near Battleline'), kind: 'zone', radius: BATTLELINE_RANGE, measure: 'edge', side: 'friends',
    source: (_, u) => admechBattleline(u),
    effect: (s, _, t) => {
      if (!admech(t) || hasKeyword(t, 'BATTLELINE')) return null
      if (hasAbility(t, 'breachingCommand')) return tr('re-roll hits')
      if (hasAbility(t, 'lineBreakers')) return tr('Line-breakers +2')
      if (hasAbility(t, 'neurostaticInterference')) return tr('−2 Ld')
      if (imperativeOf(s, t) === 'conqueror') return tr('AP +1')
      return null
    },
  },
  {
    id: 'psychicGuidance', name: tr('Psychic Guidance'), kind: 'zone', radius: PSYCHIC_GUIDANCE_RANGE, measure: 'edge', side: 'friends',
    source: (_, u) => hasKeyword(u, 'AELDARI') && hasKeyword(u, 'PSYKER'),
    effect: (_, __, t) => (hasAbility(t, 'psychicGuidance') ? tr('+1 to hit') : null),
  },
  {
    id: 'leader', name: tr('Leads a unit'), kind: 'leader', radius: LEADER_RANGE, measure: 'edge', side: 'friends',
    source: (_, u) => hasAbility(u, 'lordOfMachineCult') || hasAbility(u, 'galvanicField'),
    effect: (s, src, t) => (ledUnitOf(s, src)?.id !== t.id ? null : hasAbility(src, 'lordOfMachineCult') ? 'FNP 5+' : 'Lethal Hits'),
  },
  {
    id: 'nobleLeader', name: tr('Leads a unit'), kind: 'leader', radius: LEADER_RANGE, measure: 'edge', side: 'friends',
    source: (_, u) => datasheetOf(u).faction === 'necrons' && hasKeyword(u, 'NOBLE'),
    effect: (_, __, t) => (hasAbility(t, 'guardianProtocols') ? tr('−1 to wound') : null),
  },
  {
    id: 'deadlyDemise', name: tr('Deadly Demise'), kind: 'explosion', radius: DEADLY_DEMISE_RANGE, measure: 'edge', side: 'all',
    source: (_, u) => hasAbility(u, 'deadlyDemise1') || hasAbility(u, 'deadlyDemiseD3') || hasAbility(u, 'deadlyDemiseD6'),
    effect: () => null,
  },
]

export const zoneById = (id: ZoneId) => ZONES.find((z) => z.id === id)!

/** Whether model `m` is wholly within `r` of a model of `src` (its whole base). */
const whollyWithin = (m: ModelState, src: UnitState, r: number) => alive(src).some((o) => modelDistance(m, o) + 2 * radiusOf(m) <= r + EPS)

/** The zones unit `u` projects (none when it is destroyed or not on the board). */
export const zonesOf = (s: GameState, u: UnitState) => (isDestroyed(u) || u.embarkedIn ? [] : ZONES.filter((z) => z.source(s, u)))

const sideOk = (z: ZoneDef, src: UnitState, t: UnitState) =>
  z.side === 'all' || (z.side === 'friends' ? t.owner === src.owner : t.owner !== src.owner)

/** The models of `t` inside zone `z` of `src` (all of them for an edge zone the unit is in, none when it is out). */
export function modelsInZone(z: ZoneDef, src: UnitState, t: UnitState): ModelState[] {
  if (isDestroyed(t) || t.embarkedIn || !sideOk(z, src, t)) return []
  if (t.id === src.id) return z.self ? alive(t) : []
  if (z.measure === 'wholly') return alive(t).filter((m) => whollyWithin(m, src, z.radius))
  return unitDistance(src, t) <= z.radius + EPS ? alive(t) : []
}

export interface ZoneHit {
  zone: ZoneDef
  source: UnitState
  /** the badge text */
  badge: string
  /** models inside the zone, and all models of the unit (they differ only for a wholly-within zone) */
  inside: number
  of: number
}

/** Every zone that does something to unit `t` now: what, from whom, and how many of its models. */
export function zonesOn(s: GameState, t: UnitState): ZoneHit[] {
  const out: ZoneHit[] = []
  for (const src of s.units)
    for (const z of zonesOf(s, src)) {
      const inside = modelsInZone(z, src, t).length
      if (!inside) continue
      const badge = z.effect(s, src, t)
      if (badge) out.push({ zone: z, source: src, badge, inside, of: alive(t).length })
    }
  return out
}

/** The units zone `z` of `src` does something to now (for the "covers N units" note while dragging). */
export const unitsCovered = (s: GameState, z: ZoneDef, src: UnitState) =>
  s.units.filter((t) => modelsInZone(z, src, t).length > 0 && z.effect(s, src, t) !== null)
