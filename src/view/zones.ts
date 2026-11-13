// What the board draws for ability zones (#59): the shapes, their outline, the badges on affected units and the notes
// while a unit is dragged. Pure functions over the game state; the registry of zones is game/rules/zones.ts.
import { alive, findUnit, radiusOf } from '../game/gameState'
import { dist } from '../game/geometry/geometry'
import { unitsCovered, zonesOf, zonesOn, type ZoneDef, type ZoneHit } from '../game/rules/zones'
import type { GameState, UnitState, Vec } from '../game/types'
import { tr } from '../i18n/index'

export interface ZoneCircle { x: number; y: number; r: number }

/** How a zone is coloured: a bonus for the owner's units, a penalty for the enemy's, a leader link, an explosion. */
export type ZoneTone = 'help' | 'harm' | 'leader' | 'explosion'

export interface ZoneShape {
  key: string
  zone: ZoneDef
  sourceId: string
  tone: ZoneTone
  /** one circle per model of the source: the zone's range from the edge of its base */
  circles: ZoneCircle[]
  /** the outer edge of the union of the circles, as polylines */
  outline: Vec[][]
  /** where the name goes: above the topmost circle */
  label: { x: number; y: number; text: string }
}

export const zoneTone = (z: ZoneDef): ZoneTone =>
  z.kind === 'explosion' ? 'explosion' : z.kind === 'leader' ? 'leader' : z.side === 'enemies' ? 'harm' : 'help'

/** The game with the dragged models at their planned places (a move draft), so zones and badges follow the ghost. */
export function withDraft(s: GameState, draft: Record<string, Vec>): GameState {
  if (!Object.keys(draft).length) return s
  return { ...s, units: s.units.map((u) => (u.models.some((m) => draft[m.id]) ? { ...u, models: u.models.map((m) => (draft[m.id] ? { ...m, pos: draft[m.id] } : m)) } : u)) }
}

/** The parts of the circles' edges that no other circle covers: the outline of their union. */
export function unionOutline(circles: ZoneCircle[], steps = 96): Vec[][] {
  const out: Vec[][] = []
  const inside = (p: Vec, skip: number) => circles.some((c, j) => j !== skip && dist(p, c) < c.r - 1e-6)
  circles.forEach((c, i) => {
    let run: Vec[] = []
    for (let k = 0; k <= steps; k++) {
      const a = (k / steps) * Math.PI * 2
      const p = { x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r }
      if (inside(p, i)) {
        if (run.length > 1) out.push(run)
        run = []
      } else run.push(p)
    }
    if (run.length > 1) out.push(run)
  })
  return out
}

/** The shapes of the zones that `sources` project (Deadly Demise only when `explosions`). */
export function zoneShapes(s: GameState, sources: UnitState[], explosions = false): ZoneShape[] {
  const out: ZoneShape[] = []
  for (const u of sources)
    for (const z of zonesOf(s, u)) {
      if (z.kind === 'explosion' && !explosions) continue
      const circles = alive(u).map((m) => ({ x: m.pos.x, y: m.pos.y, r: z.radius + radiusOf(m) }))
      const top = circles.reduce((a, c) => (c.y - c.r < a.y - a.r ? c : a), circles[0])
      out.push({
        key: `${z.id}:${u.id}`, zone: z, sourceId: u.id, tone: zoneTone(z), circles, outline: unionOutline(circles),
        label: { x: top.x, y: top.y - top.r, text: `${z.name} ${z.radius}″` },
      })
    }
  return out
}

export interface Badge { text: string; tone: ZoneTone }

/** Badge text for one zone hit: "4++", or "4++ 3/10" when only some models are wholly within. */
export const badgeText = (h: ZoneHit) => (h.inside < h.of ? `${h.badge} ${h.inside}/${h.of}` : h.badge)

/** Badges for every unit some zone affects. Synapse covers nearly every Tyranid, so its badge shows only while its
 * zone is drawn (`shown`: the keys of the drawn shapes). */
export function zoneBadges(s: GameState, shown: Set<string>): Map<string, Badge[]> {
  const out = new Map<string, Badge[]>()
  for (const t of s.units) {
    if (!alive(t).length || t.embarkedIn) continue
    const list = zonesOn(s, t)
      .filter((h) => h.zone.id !== 'synapse' || shown.has(`${h.zone.id}:${h.source.id}`))
      .map((h) => ({ text: badgeText(h), tone: zoneTone(h.zone) }))
    const unique = [...new Map(list.map((b) => [b.text, b])).values()]
    if (unique.length) out.set(t.id, unique)
  }
  return out
}

/** While unit `unitId` is dragged: whom its zones will cover from there, and which zones it enters or leaves. */
export function dragZoneNotes(before: GameState, after: GameState, unitId: string): string[] {
  const u0 = findUnit(before, unitId), u1 = findUnit(after, unitId)
  if (!u0 || !u1) return []
  const notes: string[] = []
  for (const z of zonesOf(after, u1)) {
    if (z.kind === 'explosion') continue
    const now = unitsCovered(after, z, u1).filter((t) => t.id !== u1.id).map((t) => t.name)
    notes.push(now.length ? tr('{zone} will cover: {list}', { zone: z.name, list: now.join(', ') }) : tr('{zone} will cover nobody', { zone: z.name }))
  }
  const key = (h: ZoneHit) => `${h.zone.id}:${h.source.id}`
  const was = new Map(zonesOn(before, u0).map((h) => [key(h), h]))
  const will = new Map(zonesOn(after, u1).map((h) => [key(h), h]))
  for (const [k, h] of will) if (!was.has(k)) notes.push(tr('Enters {zone} ({name}): {badge}', { zone: h.zone.name, name: h.source.name, badge: badgeText(h) }))
  for (const [k, h] of was) if (!will.has(k)) notes.push(tr('Leaves {zone} ({name})', { zone: h.zone.name, name: h.source.name }))
  return notes
}
