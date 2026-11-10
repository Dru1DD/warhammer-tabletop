import { DATASHEETS, PROFILES } from '../data/datasheets'
import { legalSizes, listedCost } from '../data/points'
import { FACTIONS, type PlayerId } from '../types'

// Army lists built in the army builder. A list is a points limit plus units, each a datasheet
// at a unit size the Munitorum Field Manual lists. Models and their loadouts come from
// COMPOSITION, positions from army/placement.ts.

export const POINTS_LIMITS = [500, 1000] as const
export type PointsLimit = (typeof POINTS_LIMITS)[number]

export interface ListEntry {
  datasheetId: string
  size: number
}

export interface ArmyList {
  limit: PointsLimit
  units: ListEntry[]
}

/** Copies of one datasheet allowed in a list: 3, or 6 for BATTLELINE (the usual "rule of three"). */
export const maxCopies = (datasheetId: string) => (DATASHEETS[datasheetId]?.keywords.includes('BATTLELINE') ? 6 : 3)

/** Datasheets a faction can take, in the order they appear in the data. */
export const datasheetsOf = (faction: PlayerId) => Object.values(DATASHEETS).filter((d) => d.faction === faction)

/** Short Russian name of a datasheet: the part before the English name in brackets. */
export const shortName = (datasheetId: string) => DATASHEETS[datasheetId].name.replace(/\s*\(.*\)\s*$/, '')

/**
 * How a unit of a given size is made up: `leader` (if any) is the first model, then `pattern`
 * repeats until the unit is full. The loadouts follow the default training rosters, so a 10-model
 * unit carries twice the special weapons of a 5-model one.
 */
export const COMPOSITION: Record<string, { leader?: string; pattern: string[] }> = {
  lieutenant: { pattern: ['lieutenant'] },
  intercessors: { leader: 'intercessorSergeant', pattern: ['intercessor', 'intercessorGL', 'intercessor', 'intercessor'] },
  assaultIntercessors: { leader: 'assaultSergeant', pattern: ['assaultIntercessor'] },
  redemptor: { pattern: ['redemptor'] },
  boyz: {
    leader: 'nob',
    pattern: ['boy', 'boy', 'boy', 'boy', 'boyBigShoota', 'boy', 'boy', 'boy', 'boy', 'boy', 'boy', 'boy', 'boy', 'boyRokkit', 'boy', 'boy', 'boy', 'boy'],
  },
  deffDread: { pattern: ['deffDread'] },
  hiveTyrant: { pattern: ['hiveTyrant'] },
  termagants: { pattern: ['termagant', 'termagant', 'termagantShard', 'termagant', 'termagant', 'termagantSpike', 'termagant', 'termagant', 'termagantWeb', 'termagant'] },
  hormagaunts: { pattern: ['hormagaunt'] },
  tyranidWarriors: { leader: 'tyranidPrime', pattern: ['tyranidWarriorVenom', 'tyranidWarriorStrangler', 'tyranidWarrior', 'tyranidWarrior', 'tyranidWarrior'] },
  overlord: { pattern: ['overlord'] },
  necronWarriors: { pattern: ['necronWarrior'] },
  skorpekhDestroyers: { pattern: ['skorpekh'] },
  scarabSwarms: { pattern: ['scarab'] },
  farseer: { pattern: ['farseer'] },
  guardianDefenders: { pattern: [...Array<string>(10).fill('guardian'), 'heavyPlatform'] },
  direAvengers: { leader: 'exarch', pattern: ['direAvenger'] },
  windriders: { pattern: ['windrider', 'windriderLaser', 'windriderCannon'] },
  techDominus: { pattern: ['techDominus'] },
  techManipulus: { pattern: ['techManipulus'] },
  rangers: { leader: 'rangerAlpha', pattern: ['ranger', 'ranger', 'rangerArc', 'ranger', 'ranger', 'rangerCaliver', 'ranger', 'rangerOmnispex', 'ranger'] },
  vanguard: { leader: 'vanguardAlpha', pattern: ['vanguard', 'vanguard', 'vanguardArc', 'vanguard', 'vanguard', 'vanguardCaliver', 'vanguard', 'vanguard', 'vanguard'] },
  breachers: { pattern: ['breacher', 'breacherTorsion', 'breacherHydraulic'] },
  destroyers: { pattern: ['destroyer', 'destroyer', 'destroyerCulverin'] },
  sicarians: { leader: 'sicarianPrinceps', pattern: ['sicarian', 'sicarianTaser'] },
  kastelans: { pattern: ['kastelanGun', 'kastelan'] },
}

/** Model profile ids of a unit of `size` models. */
export function composeUnit(datasheetId: string, size: number): string[] {
  const c = COMPOSITION[datasheetId]
  if (!c) throw new Error(`Нет состава для «${datasheetId}».`)
  const out = c.leader ? [c.leader] : []
  for (let i = 0; out.length < size; i++) out.push(c.pattern[i % c.pattern.length])
  return out
}

/** Cost of each entry in list order (copies of the same datasheet are numbered in that order). */
export function entryCosts(list: ArmyList): number[] {
  const seen: Record<string, number> = {}
  return list.units.map((e) => {
    seen[e.datasheetId] = (seen[e.datasheetId] ?? 0) + 1
    return listedCost(e.datasheetId, e.size, seen[e.datasheetId]) ?? 0
  })
}

export const listPoints = (list: ArmyList) => entryCosts(list).reduce((a, b) => a + b, 0)

/** Everything that makes the list unplayable, in Russian; empty when it is fine. */
export function listProblems(faction: PlayerId, list: ArmyList): string[] {
  const out: string[] = []
  if (!list.units.length) out.push('В армии нет ни одного отряда.')
  const counts: Record<string, number> = {}
  for (const e of list.units) {
    const ds = DATASHEETS[e.datasheetId]
    if (!ds || ds.faction !== faction) {
      out.push(`Отряд «${e.datasheetId}» не из этой фракции.`)
      continue
    }
    if (!legalSizes(e.datasheetId).includes(e.size)) out.push(`${shortName(e.datasheetId)}: размер ${e.size} не из справочника (можно ${legalSizes(e.datasheetId).join(' или ')}).`)
    counts[e.datasheetId] = (counts[e.datasheetId] ?? 0) + 1
  }
  for (const [id, n] of Object.entries(counts))
    if (n > maxCopies(id)) out.push(`${shortName(id)}: не больше ${maxCopies(id)} отрядов (сейчас ${n}).`)
  const pts = listPoints(list)
  if (pts > list.limit) out.push(`Перебор очков: ${pts} из ${list.limit}.`)
  return out
}

const u = (datasheetId: string, size: number, copies = 1): ListEntry[] => Array.from({ length: copies }, () => ({ datasheetId, size }))

/** Ready-made lists for every faction at both limits (each one is legal and within its limit; see tests). */
export const PRESETS: Record<PlayerId, Record<PointsLimit, ListEntry[]>> = {
  marines: {
    500: [...u('lieutenant', 1), ...u('intercessors', 5, 2), ...u('assaultIntercessors', 5), ...u('redemptor', 1)],
    1000: [...u('lieutenant', 1), ...u('intercessors', 10, 2), ...u('intercessors', 5), ...u('assaultIntercessors', 10), ...u('redemptor', 1, 2)],
  },
  orks: {
    500: [...u('boyz', 20), ...u('boyz', 10, 3), ...u('deffDread', 1)],
    1000: [...u('boyz', 20, 4), ...u('boyz', 10, 2), ...u('deffDread', 1, 2)],
  },
  tyranids: {
    500: [...u('hiveTyrant', 1), ...u('termagants', 20), ...u('hormagaunts', 20), ...u('tyranidWarriors', 3)],
    1000: [...u('hiveTyrant', 1, 2), ...u('termagants', 20, 2), ...u('hormagaunts', 20, 2), ...u('tyranidWarriors', 6)],
  },
  necrons: {
    500: [...u('overlord', 1), ...u('necronWarriors', 10, 2), ...u('skorpekhDestroyers', 3, 2), ...u('scarabSwarms', 3, 2)],
    1000: [...u('overlord', 1, 2), ...u('necronWarriors', 20, 2), ...u('skorpekhDestroyers', 6, 2), ...u('scarabSwarms', 3, 2)],
  },
  aeldari: {
    500: [...u('farseer', 1), ...u('guardianDefenders', 11, 2), ...u('direAvengers', 5, 2), ...u('windriders', 3)],
    1000: [...u('farseer', 1, 2), ...u('guardianDefenders', 11, 3), ...u('direAvengers', 10, 2), ...u('windriders', 6), ...u('windriders', 3)],
  },
  adeptus_mechanicus: {
    500: [...u('techDominus', 1), ...u('rangers', 10), ...u('vanguard', 10), ...u('breachers', 3), ...u('destroyers', 3)],
    1000: [...u('techDominus', 1), ...u('techManipulus', 1), ...u('rangers', 10, 2), ...u('vanguard', 10), ...u('breachers', 3), ...u('destroyers', 3, 2), ...u('sicarians', 5), ...u('kastelans', 2)],
  },
}

export const presetList = (faction: PlayerId, limit: PointsLimit): ArmyList => ({ limit, units: PRESETS[faction][limit].map((e) => ({ ...e })) })

/** A list read back from storage, or null if it is not a well-formed list of known datasheets. */
export function parseArmyList(raw: unknown): ArmyList | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { limit?: unknown; units?: unknown }
  if (!POINTS_LIMITS.includes(r.limit as PointsLimit) || !Array.isArray(r.units)) return null
  const units: ListEntry[] = []
  for (const e of r.units) {
    if (!e || typeof e !== 'object') return null
    const { datasheetId, size } = e as { datasheetId?: unknown; size?: unknown }
    if (typeof datasheetId !== 'string' || !DATASHEETS[datasheetId] || typeof size !== 'number') return null
    units.push({ datasheetId, size })
  }
  return { limit: r.limit as PointsLimit, units }
}

/** Per-faction lists from storage; a list whose datasheets belong to another faction is dropped. */
export function parseArmies(raw: unknown): Partial<Record<PlayerId, ArmyList>> {
  const out: Partial<Record<PlayerId, ArmyList>> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const f of FACTIONS) {
    const list = parseArmyList((raw as Record<string, unknown>)[f])
    if (list && list.units.every((e) => DATASHEETS[e.datasheetId].faction === f)) out[f] = list
  }
  return out
}

/** Sanity check for the data: every composed profile exists. Used by tests. */
export const unknownProfiles = () =>
  Object.keys(COMPOSITION).flatMap((id) => legalSizes(id).flatMap((n) => composeUnit(id, n).filter((p) => !PROFILES[p]).map((p) => `${id}: ${p}`)))
