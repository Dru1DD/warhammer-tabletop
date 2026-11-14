import { DATASHEETS, PROFILES, WEAPONS } from './data/datasheets'
import { baseRadius, edgeDistance, EPS, withinRange, circlePolygonDistance } from './geometry/geometry'
import type { Datasheet, GameState, ModelProfile, ModelState, Objective, PlayerId, TerrainKind, UnitState, Vec } from './types'
import { DECIMAL_MARK, tr } from '../i18n/index'

export const SCHEMA_VERSION = 1
export const ENGAGEMENT_RANGE = 2
export const COHERENCY_NEAR = 2
export const COHERENCY_ALL = 9
export const CHARGE_RANGE = 12
export const PILE_IN = 3
export const CONSOLIDATE = 3
export const OBJECTIVE_RANGE = 3
export const OBJECTIVE_MARKER_MM = 40

/** A per-side record. Only the battle's two factions exist at runtime; the type is the full Record for easy indexing. */
export const seats = <T>(a: PlayerId, va: T, b: PlayerId, vb: T): Record<PlayerId, T> => ({ [a]: va, [b]: vb }) as Record<PlayerId, T>

export const DEFAULT_SIDES: [PlayerId, PlayerId] = ['marines', 'orks']
/** [west, east] factions of this battle. */
export const sidesOf = (s: Pick<GameState, 'sides'>): [PlayerId, PlayerId] => s.sides ?? DEFAULT_SIDES
/** The opponent of `p` in this battle. */
export const other = (s: Pick<GameState, 'sides'>, p: PlayerId): PlayerId => {
  const [a, b] = sidesOf(s)
  return p === a ? b : a
}

export const profileOf = (m: ModelState): ModelProfile => PROFILES[m.profileId]
const radii = new Map<string, number>()
/** Base radius in inches (cached per profile: it is asked for constantly by line of sight and movement checks). */
export const radiusOf = (m: ModelState) => {
  let r = radii.get(m.profileId)
  if (r === undefined) {
    r = baseRadius(profileOf(m).baseMm)
    radii.set(m.profileId, r)
  }
  return r
}

/** A fresh unit at the start of a battle: models at `models` positions with full wounds. */
export function newUnit(id: string, datasheetId: string, owner: PlayerId, name: string, models: [string, Vec][]): UnitState {
  const ms: ModelState[] = models.map(([profileId, pos], i) => ({ id: `${id}-${i}`, profileId, pos, wounds: PROFILES[profileId]?.w ?? 0, destroyed: false }))
  return {
    id, datasheetId, owner, name, models: ms, startingModels: ms.length, battleShocked: false,
    move: 'none', movedDistance: 0, advanceRoll: null, advanceRerolled: false, shot: false,
    chargeDeclared: false, charged: false, fought: false, ammoRuntsUsed: false,
  }
}
/** The unit's own datasheet: the bodyguard's in an attached unit (name, faction, transport, description). */
export const datasheetOf = (u: UnitState) => DATASHEETS[u.datasheetId]
export const alive = (u: UnitState) => u.models.filter((m) => !m.destroyed)

// ---------------------------------------------------------------- attached units (core rules 19)

/** The attached character part a model belongs to, or undefined for a bodyguard model (or a unit without characters). */
export const partOf = (u: UnitState, m: ModelState) => u.attached?.find((p) => p.models.includes(m.id))
/** Datasheet id of the part a model belongs to: an attached character's, or the unit's own. */
export const modelDatasheetId = (u: UnitState, m: ModelState) => partOf(u, m)?.datasheetId ?? u.datasheetId
/** The models of the unit's own datasheet: every model, or the bodyguard models of an attached unit. */
export const bodyguardModels = (u: UnitState) => (u.attached?.length ? u.models.filter((m) => !partOf(u, m)) : u.models)

/**
 * Datasheets whose abilities and keywords the unit has now. An attached unit has those of every part with a living
 * model (19.03, 19.04): a character's abilities end with its last model, the bodyguard's with theirs. A destroyed unit
 * keeps all of them, so that rules looking back at it still recognise it.
 */
export function liveDatasheets(u: UnitState): Datasheet[] {
  const own = DATASHEETS[u.datasheetId]
  if (!u.attached?.length) return [own]
  const out = bodyguardModels(u).some((m) => !m.destroyed) ? [own] : []
  for (const p of u.attached) if (u.models.some((m) => !m.destroyed && p.models.includes(m.id))) out.push(DATASHEETS[p.datasheetId])
  return out.length ? out : [own, ...u.attached.map((p) => DATASHEETS[p.datasheetId])]
}

/** The unit has the ability: its own datasheet's, or a living attached character's. */
export const hasAbility = (u: UnitState, a: string) =>
  u.attached?.length ? liveDatasheets(u).some((d) => d.abilities.includes(a as never)) : datasheetOf(u).abilities.includes(a as never)
/** Every part of the unit has the ability: Deep Strike, Infiltrators, Stealth, Scouts work for an attached unit only then (24.09). */
export const hasAbilityAll = (u: UnitState, a: string) => liveDatasheets(u).every((d) => d.abilities.includes(a as never))
/** The model's own datasheet has the ability: for abilities of "this model" (Might Is Right, Finest Hour, Implacable Resilience). */
export const modelHasAbility = (u: UnitState, m: ModelState, a: string) => DATASHEETS[modelDatasheetId(u, m)].abilities.includes(a as never)

/** A living attached character of the unit has the ability: "while this model is leading a unit" (19.04). A character
 * on its own leads nobody. */
export const leadingAbility = (u: UnitState, a: string) =>
  !!u.attached?.some((p) => DATASHEETS[p.datasheetId].abilities.includes(a as never) && u.models.some((m) => !m.destroyed && p.models.includes(m.id)))
/** A living attached character of the unit has one of the keywords (Guardian Protocols: "while a NOBLE model is leading this unit"). */
export const ledBy = (u: UnitState, ...k: string[]) =>
  !!u.attached?.some((p) => DATASHEETS[p.datasheetId].keywords.some((x) => k.includes(x)) && u.models.some((m) => !m.destroyed && p.models.includes(m.id)))
/** A character leads the unit: an attached character still has a living model. */
export const isLed = (u: UnitState) => !!u.attached?.some((p) => u.models.some((m) => !m.destroyed && p.models.includes(m.id)))

/** Toughness an attack against the unit uses: the highest of the bodyguard models on the battlefield, or of the
 * characters when no bodyguard is left (19.02). */
export function attackToughness(u: UnitState): number {
  const own = alive(u).filter((m) => !partOf(u, m))
  const ms = own.length ? own : alive(u)
  return ms.length ? Math.max(...ms.map((m) => profileOf(m).t)) : 0
}

/** The unit's keywords: those of its living parts (19.03), without SMOKE when a model carries a broad spectrum data-tether (Onager). */
export function unitKeywords(u: UnitState): string[] {
  const kw = u.attached?.length ? [...new Set(liveDatasheets(u).flatMap((d) => d.keywords))] : datasheetOf(u).keywords
  return hasWargear(u, 'dataTether') ? kw.filter((k) => k !== 'SMOKE') : kw
}
export const hasKeyword = (u: UnitState, ...k: string[]) => unitKeywords(u).some((x) => k.includes(x))
/** MONSTER or VEHICLE: Lethal Hits "non-M/V", cover, engaged shooting and movement differ. */
export const isMV = (u: UnitState) => hasKeyword(u, 'MONSTER', 'VEHICLE')
/** SWARM models are treated like INFANTRY for terrain and cover (13.06, 13.08). */
export const isInfantry = (u: UnitState) => hasKeyword(u, 'INFANTRY', 'SWARM')
export const isFlyer = (u: UnitState) => hasKeyword(u, 'FLY')

// ---------------------------------------------------------------- Adeptus Mechanicus

/** BATTLELINE support radius of the Doctrina Imperatives and Breaching Command. */
export const BATTLELINE_RANGE = 6
export const RAD_RANGE = 3
export const NEUROSTATIC_RANGE = 6

/** The Doctrina Imperative active for this unit (the army's choice, only for units with the ability). */
export function imperativeOf(s: GameState, u: UnitState): 'protector' | 'conqueror' | null {
  return hasAbility(u, 'doctrina') ? (s.players[u.owner].imperative ?? null) : null
}

/** BATTLELINE itself, or within 6″ of a friendly ADEPTUS MECHANICUS BATTLELINE unit (Imperatives, Breaching Command, Neurostatic Interference). */
export function battlelineSupport(s: GameState, u: UnitState): boolean {
  if (hasKeyword(u, 'BATTLELINE')) return true
  return s.units.some((x) => x.id !== u.id && x.owner === u.owner && !isDestroyed(x) && hasKeyword(x, 'BATTLELINE') && hasKeyword(x, 'ADEPTUS MECHANICUS') && unitDistance(u, x) <= BATTLELINE_RANGE + EPS)
}

/** Wargear carried by any living model of the unit. */
export const hasWargear = (u: UnitState, g: string) => alive(u).some((m) => profileOf(m).wargear?.includes(g as never))

/** Feel No Pain value for damage to this unit, or undefined. Lord of the Machine Cult: a Tech-Priest Dominus leading the
 * unit gives 5+, or 4+ to ELECTRO-PRIESTS. */
export function feelNoPainOf(_s: GameState, u: UnitState): number | undefined {
  if (leadingAbility(u, 'lordOfMachineCult')) return hasKeyword(u, 'ELECTRO-PRIESTS') ? 4 : 5
  return hasAbility(u, 'feelNoPain5') ? 5 : undefined
}

/** Best invulnerable save granted to the unit as a whole (Waaagh! 5+, Defend the Divine Work 4+). */
export function invulnOverrideOf(s: GameState, u: UnitState): number | undefined {
  const v = [
    hasAbility(u, 'waaagh') && s.players[u.owner].riledTurns > 0 ? 5 : undefined,
    u.warded ? 4 : undefined,
    warpField(s, u) ? 6 : undefined,
  ].filter((x): x is number => x !== undefined)
  return v.length ? Math.min(...v) : undefined
}

// ---------------------------------------------------------------- Tyranids beyond the first four units

export const WARP_FIELD_RANGE = 6

/** Warp Field (Zoanthropes, aura): a friendly TYRANIDS unit within 6″ (or the Zoanthropes themselves) has a 6+ invulnerable save. */
export function warpField(s: GameState, u: UnitState): boolean {
  if (datasheetOf(u).faction !== 'tyranids' || isDestroyed(u)) return false
  return s.units.some((x) => x.owner === u.owner && !isDestroyed(x) && hasAbility(x, 'warpField') && (x.id === u.id || unitDistance(u, x) <= WARP_FIELD_RANGE + EPS))
}

/** Alpha Warrior: while a Winged Prime leads the unit, every weapon of its models has Sustained Hits 1. */
export const alphaWarrior = (_s: GameState, u: UnitState): boolean => leadingAbility(u, 'alphaWarrior')

// ---------------------------------------------------------------- Aeldari beyond the first four units

export const PSYCHIC_GUIDANCE_RANGE = 12
export const GRENADE_PACK_RANGE = 8

/** Psychic Guidance (Wraithguard): a friendly AELDARI PSYKER within 12″ gives Ld 6+ and +1 to hit. */
export const psychicGuidance = (s: GameState, u: UnitState) =>
  hasAbility(u, 'psychicGuidance') &&
  s.units.some((x) => x.id !== u.id && x.owner === u.owner && !isDestroyed(x) && hasKeyword(x, 'AELDARI') && hasKeyword(x, 'PSYKER') && unitDistance(u, x) <= PSYCHIC_GUIDANCE_RANGE + EPS)

// ---------------------------------------------------------------- Necrons beyond the first four units

export const ENGRAMMATIC_RANGE = 12

/** Guardian Protocols (Lychguard): a NOBLE model is leading the unit. */
export const nobleLeads = (_s: GameState, u: UnitState) => ledBy(u, 'NOBLE')

/** Neurostatic Interference: modifier to Battle-shock and Leadership tests of `u` caused by enemy Sicarians within 6″. */
export function neurostaticMod(s: GameState, u: UnitState): number {
  let mod = 0
  for (const e of s.units) {
    if (e.owner === u.owner || isDestroyed(e) || !hasAbility(e, 'neurostaticInterference')) continue
    if (unitDistance(u, e) > NEUROSTATIC_RANGE + EPS) continue
    mod = Math.min(mod, battlelineSupport(s, e) ? -2 : -1)
  }
  return mod
}

// ---------------------------------------------------------------- Synapse

export const SYNAPSE_RANGE = 6

/** Synapse (Tyranids): a TYRANIDS unit within 6″ of a friendly SYNAPSE unit. */
export function inSynapseRange(s: GameState, u: UnitState): boolean {
  if (datasheetOf(u).faction !== 'tyranids' || isDestroyed(u)) return false
  return s.units.some((x) => x.owner === u.owner && !isDestroyed(x) && hasKeyword(x, 'SYNAPSE') && (x.id === u.id || unitDistance(u, x) <= SYNAPSE_RANGE + EPS))
}


/** 11th-ed terrain categories (13.03–13.06, 13.11). Light and dense make an area obscuring;
 * only INFANTRY may move through dense features (they are assumed taller than 2″);
 * no model may end a move inside a solid feature. */
export const TERRAIN_CATEGORY: Record<TerrainKind, { category: 'exposed' | 'light' | 'dense'; solid?: boolean }> = {
  crater: { category: 'exposed' },
  barricade: { category: 'light' },
  ruin: { category: 'dense' },
  woods: { category: 'dense' },
  container: { category: 'dense', solid: true },
}
export const isDestroyed = (u: UnitState) => alive(u).length === 0
export const weaponsOf = (m: ModelState) => profileOf(m).weapons.map((id) => WEAPONS[id])

export function getUnit(s: GameState, id: string): UnitState {
  const u = s.units.find((x) => x.id === id)
  if (!u) throw new Error(`unknown unit ${id}`)
  return u
}

export const findUnit = (s: GameState, id: string) => s.units.find((x) => x.id === id)
export const unitsOf = (s: GameState, p: PlayerId) => s.units.filter((u) => u.owner === p && !isDestroyed(u))
export const enemiesOf = (s: GameState, u: UnitState) => unitsOf(s, other(s, u.owner))

export function modelDistance(a: ModelState, b: ModelState, aPos: Vec = a.pos, bPos: Vec = b.pos) {
  return edgeDistance(aPos, radiusOf(a), bPos, radiusOf(b))
}

/** Closest edge-to-edge distance between two units. */
export function unitDistance(a: UnitState, b: UnitState): number {
  let d = Infinity
  for (const ma of alive(a)) for (const mb of alive(b)) d = Math.min(d, modelDistance(ma, mb))
  return d
}

export const modelEngagedWith = (m: ModelState, enemy: UnitState, pos: Vec = m.pos) =>
  alive(enemy).some((e) => withinRange(modelDistance(m, e, pos), ENGAGEMENT_RANGE))

/** Bounding box of a unit's living bases: [minX, minY, maxX, maxY]. */
function basesBox(u: UnitState): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const m of alive(u)) {
    const r = radiusOf(m)
    x0 = Math.min(x0, m.pos.x - r); y0 = Math.min(y0, m.pos.y - r)
    x1 = Math.max(x1, m.pos.x + r); y1 = Math.max(y1, m.pos.y + r)
  }
  return [x0, y0, x1, y1]
}

/** `withinRange(unitDistance(a, b), range)`, answered without measuring every pair of models: units whose bases'
 * bounding boxes are farther apart than the range are out of it, otherwise the first pair in range settles it. */
export function unitsWithin(a: UnitState, b: UnitState, range: number): boolean {
  const [ax0, ay0, ax1, ay1] = basesBox(a), [bx0, by0, bx1, by1] = basesBox(b)
  const gap = range + 1
  if (bx0 - ax1 > gap || ax0 - bx1 > gap || by0 - ay1 > gap || ay0 - by1 > gap) return false
  for (const ma of alive(a)) for (const mb of alive(b)) if (withinRange(modelDistance(ma, mb), range)) return true
  return false
}

export const engagedUnits = (s: GameState, u: UnitState) => enemiesOf(s, u).filter((e) => unitsWithin(u, e, ENGAGEMENT_RANGE))

export const isEngaged = (s: GameState, u: UnitState) => engagedUnits(s, u).length > 0

/** Half-strength: multi-model units — models remaining ≤ half of starting
 * strength; single-model units — wounds remaining ≤ half of W. (Approximation,
 * see docs/research.md.) */
export function atHalfStrength(u: UnitState): boolean {
  const a = alive(u)
  if (u.startingModels === 1) return a.length === 0 || a[0].wounds * 2 <= profileOf(a[0]).w
  return a.length * 2 <= u.startingModels
}

export const modelInObjectiveRange = (m: ModelState, o: Objective, pos: Vec = m.pos) =>
  withinRange(edgeDistance(pos, radiusOf(m), o.pos, baseRadius(OBJECTIVE_MARKER_MM)), OBJECTIVE_RANGE)

export const unitNearObjective = (u: UnitState, o: Objective) => alive(u).some((m) => modelInObjectiveRange(m, o))

/** Chittering Swarm: models of a unit engaged with an enemy swarm have OC reduced by 1 (not below 1). */
const chittered = (s: GameState, u: UnitState) =>
  s.units.some((e) => e.owner !== u.owner && hasAbility(e, 'chitteringSwarm') && !isDestroyed(e) && unitDistance(u, e) <= ENGAGEMENT_RANGE + EPS)

/** Rad-saturation (Skitarii Vanguard): models of enemy non-VEHICLE units within 3″ of the unit have OC reduced by 1. */
export const irradiated = (s: GameState, u: UnitState) =>
  !hasKeyword(u, 'VEHICLE') && s.units.some((e) => e.owner !== u.owner && hasAbility(e, 'radSaturation') && !isDestroyed(e) && unitDistance(u, e) <= RAD_RANGE + EPS)

export function objectiveLevels(s: GameState, o: Objective): Record<PlayerId, number> {
  const lv = Object.fromEntries(sidesOf(s).map((p) => [p, 0])) as Record<PlayerId, number>
  for (const u of s.units) {
    if (u.battleShocked) continue
    const near = alive(u).some((m) => modelInObjectiveRange(m, o))
    const shaved = near && chittered(s, u)
    const rad = near && irradiated(s, u)
    for (const m of alive(u)) {
      if (!modelInObjectiveRange(m, o)) continue
      let oc = profileOf(m).oc
      if (shaved && oc > 0) oc = Math.max(1, oc - 1)
      if (rad) oc = Math.max(0, oc - 1)
      lv[u.owner] += oc
    }
  }
  return lv
}

/** Controller of each objective: higher Objective Control wins; Objective Scouted keeps control until the opponent's level is higher. */
export function updateObjectiveControl(s: GameState) {
  const [a, b] = sidesOf(s)
  for (const o of s.objectives) {
    const lv = objectiveLevels(s, o)
    if (o.held && lv[other(s, o.held)] > lv[o.held]) delete o.held
    o.controller = o.held ?? (lv[a] > lv[b] ? a : lv[b] > lv[a] ? b : null)
  }
}

const HOLD_RULE: Record<'objectiveScouted' | 'thievinScavengers', string> = { objectiveScouted: 'Objective Scouted', thievinScavengers: 'Thievin’ Scavengers' }

/** Objective Scouted (end of the owner's Command phase) and Thievin' Scavengers (end of the owner's Movement phase):
 * a unit with `ability` near an objective its army controls keeps it. */
export function holdScoutedObjectives(s: GameState, p: PlayerId, ability: 'objectiveScouted' | 'thievinScavengers' = 'objectiveScouted') {
  for (const o of s.objectives)
    if (o.held !== p && o.controller === p && s.units.some((u) => u.owner === p && !isDestroyed(u) && hasAbility(u, ability) && !u.battleShocked && unitNearObjective(u, o))) {
      o.held = p
      addLog(s, tr('Objective {id} is secured for you ({item}): control stays until the enemy’s level becomes higher than yours.', { id: o.id, item: HOLD_RULE[ability] }), 'standard')
    }
}

export const modelInTerrain = (s: GameState, m: ModelState, pos: Vec = m.pos) =>
  s.terrain.some((t) => circlePolygonDistance(pos, radiusOf(m), t.poly) === 0)

export function addLog(s: GameState, text: string, level: GameState['log'][number]['level'] = 'standard') {
  // the whole battle is kept (a few thousand entries at most), so the log can be read back from the first round
  s.log.push({ id: s.nextId++, round: s.round, player: s.activePlayer, phase: s.phase, text, level })
}

export function checkCoherency(models: { m: ModelState; pos: Vec }[]): string | null {
  if (models.length < 2) return null
  for (const a of models) {
    let near = false
    for (const b of models) {
      if (a === b) continue
      const d = modelDistance(a.m, b.m, a.pos, b.pos)
      if (withinRange(d, COHERENCY_NEAR)) near = true
      if (!withinRange(d, COHERENCY_ALL))
        return tr('{name} is farther than {COHERENCY_ALL}" from another model of the unit — coherency is broken.', { name: profileOf(a.m).name, COHERENCY_ALL })
    }
    if (!near) return tr('{name} is not within {COHERENCY_NEAR}" of any model of the unit — coherency is broken.', { name: profileOf(a.m).name, COHERENCY_NEAR })
  }
  return null
}

export const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', DECIMAL_MARK)
