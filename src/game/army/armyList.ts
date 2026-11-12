import { composeLoadout, loadoutProblems, WARGEAR, type Loadout } from './wargear'
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
  /** chosen wargear (see army/wargear.ts); absent = the default equipment */
  loadout?: Loadout
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
  captain: { pattern: ['captain'] },
  hellblasters: { leader: 'hellblasterSergeant', pattern: ['hellblaster'] },
  infernus: { leader: 'infernusSergeant', pattern: ['infernusMarine'] },
  bladeguard: { leader: 'bladeguardSergeant', pattern: ['bladeguardVeteran'] },
  boyz: {
    leader: 'nob',
    pattern: ['boy', 'boy', 'boy', 'boy', 'boyBigShoota', 'boy', 'boy', 'boy', 'boy', 'boy', 'boy', 'boy', 'boy', 'boyRokkit', 'boy', 'boy', 'boy', 'boy'],
  },
  deffDread: { pattern: ['deffDread'] },
  warboss: { pattern: ['warboss'] },
  nobz: { pattern: ['nobzNob'] },
  gretchin: { pattern: ['gretchin'] },
  kommandos: { leader: 'kommandoNob', pattern: ['kommando'] },
  hiveTyrant: { pattern: ['hiveTyrant'] },
  termagants: { pattern: ['termagant', 'termagant', 'termagantShard', 'termagant', 'termagant', 'termagantSpike', 'termagant', 'termagant', 'termagantWeb', 'termagant'] },
  hormagaunts: { pattern: ['hormagaunt'] },
  tyranidWarriors: { leader: 'tyranidPrime', pattern: ['tyranidWarriorVenom', 'tyranidWarriorStrangler', 'tyranidWarrior', 'tyranidWarrior', 'tyranidWarrior'] },
  wingedPrime: { pattern: ['wingedPrime'] },
  zoanthropes: { leader: 'neurothrope', pattern: ['zoanthrope'] },
  carnifexes: { pattern: ['carnifex'] },
  barbgaunts: { pattern: ['barbgaunt'] },
  overlord: { pattern: ['overlord'] },
  necronWarriors: { pattern: ['necronWarrior'] },
  skorpekhDestroyers: { pattern: ['skorpekh'] },
  scarabSwarms: { pattern: ['scarab'] },
  royalWarden: { pattern: ['royalWarden'] },
  immortals: { pattern: ['immortal'] },
  lychguard: { pattern: ['lychguard'] },
  canoptekWraiths: { pattern: ['canoptekWraith'] },
  farseer: { pattern: ['farseer'] },
  guardianDefenders: { pattern: [...Array<string>(10).fill('guardian'), 'heavyPlatform'] },
  direAvengers: { leader: 'exarch', pattern: ['direAvenger'] },
  windriders: { pattern: ['windrider', 'windriderLaser', 'windriderCannon'] },
  autarch: { pattern: ['autarch'] },
  aeldariRangers: { pattern: ['aeldariRanger'] },
  wraithguard: { pattern: ['wraithguard'] },
  swoopingHawks: { leader: 'hawkExarch', pattern: ['swoopingHawk'] },
  techDominus: { pattern: ['techDominus'] },
  techManipulus: { pattern: ['techManipulus'] },
  rangers: { leader: 'rangerAlpha', pattern: ['ranger', 'ranger', 'rangerArc', 'ranger', 'ranger', 'rangerCaliver', 'ranger', 'rangerOmnispex', 'ranger'] },
  vanguard: { leader: 'vanguardAlpha', pattern: ['vanguard', 'vanguard', 'vanguardArc', 'vanguard', 'vanguard', 'vanguardCaliver', 'vanguard', 'vanguard', 'vanguard'] },
  breachers: { pattern: ['breacher', 'breacherTorsion', 'breacherHydraulic'] },
  destroyers: { pattern: ['destroyer', 'destroyer', 'destroyerCulverin'] },
  sicarians: { leader: 'sicarianPrinceps', pattern: ['sicarian', 'sicarianTaser'] },
  kastelans: { pattern: ['kastelanGun', 'kastelan'] },
}

/** Model profile ids of a unit of `size` models, with the chosen wargear if any. */
export function composeUnit(datasheetId: string, size: number, loadout?: Loadout): string[] {
  const spec = WARGEAR[datasheetId]
  if (spec && loadout) return composeLoadout(spec, size, loadout)
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
    if (e.loadout) for (const p of loadoutProblems(e.datasheetId, e.size, e.loadout)) out.push(`${shortName(e.datasheetId)}: ${p}`)
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
    500: [...u('captain', 1), ...u('lieutenant', 1), ...u('intercessors', 5), ...u('hellblasters', 5), ...u('infernus', 5), ...u('bladeguard', 3)],
    1000: [...u('captain', 1), ...u('lieutenant', 1, 2), ...u('intercessors', 10), ...u('hellblasters', 10), ...u('infernus', 5), ...u('bladeguard', 6), ...u('redemptor', 1)],
  },
  orks: {
    500: [...u('warboss', 1), ...u('boyz', 20), ...u('nobz', 5), ...u('kommandos', 10), ...u('gretchin', 10)],
    1000: [...u('warboss', 1), ...u('boyz', 20, 2), ...u('boyz', 10), ...u('nobz', 5), ...u('kommandos', 10), ...u('gretchin', 20), ...u('deffDread', 1, 2)],
  },
  tyranids: {
    500: [...u('wingedPrime', 1), ...u('tyranidWarriors', 3), ...u('termagants', 20), ...u('zoanthropes', 3), ...u('carnifexes', 1), ...u('barbgaunts', 5)],
    1000: [...u('hiveTyrant', 1), ...u('wingedPrime', 1), ...u('tyranidWarriors', 6), ...u('termagants', 20), ...u('hormagaunts', 20), ...u('zoanthropes', 3), ...u('carnifexes', 2), ...u('barbgaunts', 10)],
  },
  necrons: {
    500: [...u('overlord', 1), ...u('royalWarden', 1), ...u('immortals', 10), ...u('lychguard', 5), ...u('canoptekWraiths', 3), ...u('scarabSwarms', 3)],
    1000: [...u('overlord', 1), ...u('royalWarden', 1), ...u('necronWarriors', 20), ...u('immortals', 10, 2), ...u('lychguard', 10), ...u('canoptekWraiths', 3), ...u('skorpekhDestroyers', 3), ...u('scarabSwarms', 3)],
  },
  aeldari: {
    500: [...u('farseer', 1), ...u('autarch', 1), ...u('guardianDefenders', 11), ...u('aeldariRangers', 5), ...u('swoopingHawks', 5), ...u('direAvengers', 5)],
    1000: [...u('farseer', 1), ...u('autarch', 1), ...u('guardianDefenders', 11, 2), ...u('aeldariRangers', 10), ...u('aeldariRangers', 5), ...u('wraithguard', 5), ...u('swoopingHawks', 5), ...u('direAvengers', 10), ...u('windriders', 3)],
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
    const { datasheetId, size, loadout } = e as { datasheetId?: unknown; size?: unknown; loadout?: unknown }
    if (typeof datasheetId !== 'string' || !DATASHEETS[datasheetId] || typeof size !== 'number') return null
    const lo = parseLoadout(loadout)
    units.push(lo && WARGEAR[datasheetId] ? { datasheetId, size, loadout: lo } : { datasheetId, size })
  }
  return { limit: r.limit as PointsLimit, units }
}

/** A stored loadout, or null when absent or malformed (the unit then keeps its default equipment). */
function parseLoadout(raw: unknown): Loadout | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { leader?: unknown; counts?: unknown }
  if (r.leader !== undefined && typeof r.leader !== 'string') return null
  if (!r.counts || typeof r.counts !== 'object') return null
  const counts: Record<string, number> = {}
  for (const [k, v] of Object.entries(r.counts as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return null
    counts[k] = v
  }
  return { ...(typeof r.leader === 'string' ? { leader: r.leader } : {}), counts }
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
