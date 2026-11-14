import { PROFILES } from '../data/datasheets'
import { rect } from '../geometry/geometry'
import { DEFAULT_SIDES, newUnit, SCHEMA_VERSION, seats } from '../gameState'
import type { GameState, PlayerId, PlayerState, Terrain, UnitState, Vec } from '../types'
import type { ArmyList } from '../army/armyList'
import { musterArmy } from '../army/placement'
import { attachUnit } from '../rules/attached'
import { tr } from '../../i18n/index'
import { presetList } from '../army/armyList'
import { newMission, pickPrimary } from '../rules/missions'
import { newSecondary } from '../rules/secondaries'
import type { SecondaryId } from '../types'
import { LAYOUT_NAME, layoutFor, MAPS, PATROL_LAYOUT_NAME, patrolLayout, pickLayout, pickMap, type LayoutId, type MapId } from './strikeForce'

/** Options of a board with several maps and missions (44″×60″); 'random' or absent picks one. */
export interface BuildOptions {
  mapId?: string
  layoutId?: string
  /** a primary mission id, 'random' or 'training' (5 VP per objective) */
  primary?: string
  /** secondary missions by side ('tactical' when absent), or 'none' for a battle without them */
  secondaries?: 'none' | Partial<Record<PlayerId, { mode: 'tactical' | 'fixed'; fixed?: SecondaryId[] }>>
}

/** Army lists by faction; a faction without one fields its default training roster. */
export type Armies = Partial<Record<PlayerId, ArmyList>>

export interface Scenario {
  id: string
  name: string
  description: string
  victory: string
  /** deployment zones (display + documentation): the west and east edge of the board */
  deployment: { west: Vec[]; east: Vec[] }
  /** factions that have an army for this board */
  factions: PlayerId[]
  /** `sides` = [west, east] factions; default Space Marines (west) vs Orks (east). `opts`: the map and layout of a
   * board that has several (44″×60″); 'random' or absent picks one. */
  build: (sides?: [PlayerId, PlayerId], armies?: Armies, terrain?: Terrain[], opts?: BuildOptions) => GameState
  /** true when the board takes army lists from the army builder (`armies` in `build`, set up around `terrain` if given) */
  customArmies?: boolean
  /** the biggest points limit of a list the board has room for (absent = any) */
  maxPoints?: number
}

/** Maps (depth from the side's own board edge, y) to board coordinates, so any faction can stand on either side. */
type At = (depth: number, y: number) => Vec
const westAt: At = (depth, y) => ({ x: depth, y })
const eastAt = (width: number): At => (depth, y) => ({ x: width - depth, y })

const unit = newUnit

// Wounds come from profiles so data lives in one place.
const fillWounds = (s: GameState) => {
  for (const u of s.units) for (const m of u.models) m.wounds = PROFILES[m.profileId].w
  return s
}

/** Army-rule state of a side. Marines and Orks keep the original shape (old saves and golden states stay identical). */
function playerState(p: PlayerId): PlayerState {
  const base: PlayerState = { cp: 0, vp: 0, waaaghUsed: false, riledTurns: 0 }
  if (p === 'tyranids') return { ...base, shadowUsed: false }
  if (p === 'aeldari') return { ...base, focus: 0, guide: null }
  if (p === 'adeptus_mechanicus') return { ...base, imperative: null, divineUsed: false }
  return base
}

function baseState(id: string, board: GameState['board'], terrain: Terrain[], objectives: Vec[], units: UnitState[], sides: [PlayerId, PlayerId] = DEFAULT_SIDES): GameState {
  const isDefault = sides[0] === DEFAULT_SIDES[0] && sides[1] === DEFAULT_SIDES[1]
  return fillWounds({
    schemaVersion: SCHEMA_VERSION,
    scenarioId: id,
    board,
    terrain,
    objectives: objectives.map((pos, i) => ({ id: `o${i + 1}`, pos, controller: null })),
    players: seats(sides[0], playerState(sides[0]), sides[1], playerState(sides[1])),
    units,
    round: 1,
    maxRounds: 5,
    firstPlayer: sides[0],
    activePlayer: sides[0],
    phase: 'command',
    pendingCharge: null,
    fight: null,
    rng: 1,
    log: [],
    diceLog: [],
    winner: null,
    nextId: 1,
    ...(isDefault ? {} : { sides }),
  })
}

// ---------------------------------------------------------------- armies
// Rosters are written in (depth, y) from the side's own edge; `at` turns them into board coordinates.

type Roster = (at: At) => UnitState[]

/** 10 Boyz in two files (Nob + one special weapon per 10, as the datasheet allows). */
const boyzMob = (at: At, id: string, name: string, depth: number, y: number, special: 'boyBigShoota' | 'boyRokkit'): UnitState =>
  unit(id, 'boyz', 'orks', name, Array.from({ length: 10 }, (_, i): [string, Vec] => [
    i === 2 ? 'nob' : i === 7 ? special : 'boy',
    at(depth - (i % 2) * 1.5, y + Math.floor(i / 2) * 2),
  ]))

const column5 = (at: At, profiles: string[], depth: number, y: number): [string, Vec][] => profiles.map((p, i) => [p, at(depth, y + i * 2)])

/** Introductory-Set armies for the small 30″×22″ boards. `depth` = distance of the main line from the own edge.
 * A training simplification: the Lieutenant stays a unit of its own here (the tutorial moves it on its own), although a
 * Support character joins a unit in a real battle (rules/attached.ts). */
const marinesDuel = (depth: number): Roster => (at) => [
  unit('lt', 'lieutenant', 'marines', tr('Lieutenant'), [['lieutenant', at(depth - 1.5, 11)]]),
  unit('int', 'intercessors', 'marines', tr('Intercessors'), [
    ['intercessorSergeant', at(depth, 11)],
    ['intercessor', at(depth, 9)],
    ['intercessor', at(depth, 13)],
    ['intercessorGL', at(depth, 7)],
    ['intercessor', at(depth, 15)],
  ]),
]
const orksDuel = (depth: number): Roster => (at) => [
  unit('boyz', 'boyz', 'orks', tr('Boyz|group'), [
    ['nob', at(depth, 11)],
    ['boy', at(depth, 9)],
    ['boy', at(depth, 13)],
    ['boyBigShoota', at(depth - 1.5, 7.5)],
    ['boyRokkit', at(depth - 1.5, 14.5)],
    ['boy', at(depth + 1.5, 11)],
  ]),
]

/** Combat Patrol armies for the 44″×30″ board. Characters are inside the units they lead (rules/attached.ts). */
const marinesPatrol: Roster = (at) => [
  unit('int', 'intercessors', 'marines', tr('Intercessors I'), column5(at, ['intercessorSergeant', 'intercessor', 'intercessorGL', 'intercessor', 'intercessor'], 7, 5)),
  attachUnit(
    unit('int2', 'intercessors', 'marines', tr('Intercessors II'), column5(at, ['intercessorSergeant', 'intercessor', 'intercessorGL', 'intercessor', 'intercessor'], 7, 17)),
    unit('lt', 'lieutenant', 'marines', tr('Lieutenant'), [['lieutenant', at(5.4, 17)]]),
  ),
  unit('aint', 'assaultIntercessors', 'marines', tr('Assault Intercessors'), column5(at, ['assaultSergeant', 'assaultIntercessor', 'assaultIntercessor', 'assaultIntercessor', 'assaultIntercessor'], 3, 4)),
  unit('red', 'redemptor', 'marines', tr('Redemptor Dreadnought|short'), [['redemptor', at(4, 23)]]),
]
const orksPatrol: Roster = (at) => [
  boyzMob(at, 'boyz', tr('Boyz I'), 7.5, 4, 'boyBigShoota'),
  boyzMob(at, 'boyz2', tr('Boyz II'), 7.5, 18, 'boyRokkit'),
  boyzMob(at, 'boyz3', tr('Boyz III'), 3.5, 3, 'boyBigShoota'),
  unit('dread', 'deffDread', 'orks', tr('Deff Dread|short'), [['deffDread', at(3.5, 15)]]),
]

/** Two-file formation of `n` models: `pick(i)` chooses the profile, files at `depth` and `depth - gap`. */
const formation = (at: At, n: number, pick: (i: number) => string, depth: number, y: number, step: number, gap = 1.4): [string, Vec][] =>
  Array.from({ length: n }, (_, i): [string, Vec] => [pick(i), at(depth - (i % 2) * gap, y + Math.floor(i / 2) * step)])

/** Tyranids: 1 Hive Tyrant, 10 Termagants, 10 Hormagaunts, 3 Tyranid Warriors (docs/armies.md). */
const tyranidsPatrol: Roster = (at) => [
  unit('tyrant', 'hiveTyrant', 'tyranids', tr('Hive Tyrant'), [['hiveTyrant', at(2.5, 15)]]),
  unit('termagants', 'termagants', 'tyranids', tr('Termagants|group'), formation(at, 10, (i) => (i === 2 ? 'termagantShard' : i === 5 ? 'termagantSpike' : i === 8 ? 'termagantWeb' : 'termagant'), 8.6, 4, 1.6)),
  unit('hormagaunts', 'hormagaunts', 'tyranids', tr('Hormagaunts|group'), formation(at, 10, () => 'hormagaunt', 8.6, 19, 1.6)),
  unit('warriors', 'tyranidWarriors', 'tyranids', tr('Tyranid Warriors'), [
    ['tyranidPrime', at(5.5, 15)],
    ['tyranidWarriorVenom', at(5.5, 12.8)],
    ['tyranidWarriorStrangler', at(5.5, 17.2)],
  ]),
]

/** Necrons: 1 Overlord, 10 Necron Warriors, 3 Skorpekh Destroyers, 3 Canoptek Scarab Swarms. */
const necronsPatrol: Roster = (at) => [
  attachUnit(
    unit('nwar', 'necronWarriors', 'necrons', tr('Necron Warriors|group'), formation(at, 10, () => 'necronWarrior', 8.6, 3.5, 1.7, 1.5)),
    unit('overlord', 'overlord', 'necrons', tr('Overlord'), [['overlord', at(5.6, 6.9)]]),
  ),
  unit('skorp', 'skorpekhDestroyers', 'necrons', tr('Skorpekh Destroyers|group'), [
    ['skorpekh', at(5.5, 12.8)],
    ['skorpekh', at(5.5, 15.2)],
    ['skorpekh', at(5.5, 17.6)],
  ]),
  unit('scarabs', 'scarabSwarms', 'necrons', tr('Scarab Swarms'), [
    ['scarab', at(7.5, 21)],
    ['scarab', at(7.5, 22.8)],
    ['scarab', at(7.5, 24.6)],
  ]),
]

/** Aeldari: 1 Farseer, 10 Guardian Defenders (+ the datasheet's Heavy Weapon Platform), 5 Dire Avengers, 3 Windriders. */
const aeldariPatrol: Roster = (at) => [
  attachUnit(
    unit('guardians', 'guardianDefenders', 'aeldari', tr('Guardian Defenders|group'), [
      ...formation(at, 10, () => 'guardian', 8.6, 3.5, 1.5),
      ['heavyPlatform', at(5.6, 6.5)],
    ]),
    unit('farseer', 'farseer', 'aeldari', tr('Farseer'), [['farseer', at(6.1, 9.5)]]),
  ),
  unit('avengers', 'direAvengers', 'aeldari', tr('Dire Avengers|group'), [
    ['exarch', at(6, 12.5)],
    ['direAvenger', at(6, 14)],
    ['direAvenger', at(6, 15.5)],
    ['direAvenger', at(6, 17)],
    ['direAvenger', at(6, 18.5)],
  ]),
  unit('riders', 'windriders', 'aeldari', tr('Windriders|group'), [
    ['windrider', at(8.5, 21)],
    ['windriderLaser', at(8.5, 23)],
    ['windriderCannon', at(8.5, 25)],
  ]),
]

/**
 * Adeptus Mechanicus: Tech-Priest Dominus, Tech-Priest Manipulus, 10 Skitarii Rangers, 10 Skitarii Vanguard,
 * 3 Kataphron Breachers, 3 Kataphron Destroyers, 5 Sicarian Infiltrators, 3 Kastelan Robots (docs/mechanicus.md).
 * The Tech-Priests lead the Rangers and the Vanguard (attached units).
 */
const mechanicusPatrol: Roster = (at) => [
  attachUnit(
    unit('rangers', 'rangers', 'adeptus_mechanicus', tr('Skitarii Rangers|group'), formation(at, 10, (i) => (i === 0 ? 'rangerAlpha' : i === 3 ? 'rangerArc' : i === 6 ? 'rangerCaliver' : i === 8 ? 'rangerOmnispex' : 'ranger'), 8.6, 3.5, 1.4, 1.2)),
    unit('dominus', 'techDominus', 'adeptus_mechanicus', tr('Tech-Priest Dominus'), [['techDominus', at(5.2, 8)]]),
  ),
  attachUnit(
    unit('vanguard', 'vanguard', 'adeptus_mechanicus', tr('Skitarii Vanguard|group'), formation(at, 10, (i) => (i === 0 ? 'vanguardAlpha' : i === 3 ? 'vanguardArc' : i === 6 ? 'vanguardCaliver' : 'vanguard'), 8.6, 19.5, 1.4, 1.2)),
    unit('manipulus', 'techManipulus', 'adeptus_mechanicus', tr('Tech-Priest Manipulus'), [['techManipulus', at(5.2, 22.5)]]),
  ),
  unit('breachers', 'breachers', 'adeptus_mechanicus', tr('Kataphron Breachers|group'), [
    ['breacher', at(5.5, 11.5)],
    ['breacherTorsion', at(5.5, 14.1)],
    ['breacherHydraulic', at(5.5, 16.7)],
  ]),
  unit('destroyers', 'destroyers', 'adeptus_mechanicus', tr('Kataphron Destroyers|group'), [
    ['destroyer', at(2.6, 11.5)],
    ['destroyer', at(2.6, 14.1)],
    ['destroyerCulverin', at(2.6, 16.7)],
  ]),
  unit('sicarians', 'sicarians', 'adeptus_mechanicus', tr('Sicarian Infiltrators|group'), [
    ['sicarianPrinceps', at(3.2, 20.5)],
    ['sicarian', at(3.2, 22.3)],
    ['sicarianTaser', at(3.2, 24.1)],
    ['sicarian', at(3.2, 25.9)],
    ['sicarianTaser', at(3.2, 27.7)],
  ]),
  unit('kastelans', 'kastelans', 'adeptus_mechanicus', tr('Kastelan Robots|group'), [
    ['kastelanGun', at(8.4, 12.2)],
    ['kastelan', at(8.4, 15)],
    ['kastelanGun', at(8.4, 17.8)],
  ]),
]

export const PATROL_ROSTERS: Record<PlayerId, Roster> = {
  marines: marinesPatrol,
  orks: orksPatrol,
  tyranids: tyranidsPatrol,
  necrons: necronsPatrol,
  aeldari: aeldariPatrol,
  adeptus_mechanicus: mechanicusPatrol,
}

function units(width: number, sides: [PlayerId, PlayerId], roster: (faction: PlayerId, depthOf?: 'west' | 'east') => Roster): UnitState[] {
  return [...roster(sides[0], 'west')(westAt), ...roster(sides[1], 'east')(eastAt(width))]
}

function makeState(id: string, terrain: Terrain[], objectives: Vec[], sides: [PlayerId, PlayerId], mx = 4, ox = 26.5): GameState {
  assertSides(['marines', 'orks'], sides)
  const duel: Partial<Record<PlayerId, Roster>> = { marines: marinesDuel(mx), orks: orksDuel(30 - ox) }
  return baseState(id, { width: 30, height: 22 }, terrain, objectives, units(30, sides, (f) => duel[f]!), sides)
}

function assertSides(factions: PlayerId[], sides: [PlayerId, PlayerId]) {
  if (sides[0] === sides[1]) throw new Error(tr('The sides must be different factions.'))
  for (const f of sides) if (!factions.includes(f)) throw new Error(tr('This scenario has no “{f}” army.', { f }))
}

const ruin = (id: string, name: string, poly: Vec[]): Terrain => ({ id, name, kind: 'ruin', poly, obscuring: true })
const crater = (id: string, poly: Vec[]): Terrain => ({ id, name: tr('Crater'), kind: 'crater', poly, obscuring: false })
const woods = (id: string, poly: Vec[]): Terrain => ({ id, name: tr('Woods'), kind: 'woods', poly, obscuring: true })
const barricade = (id: string, poly: Vec[]): Terrain => ({ id, name: tr('Barricade'), kind: 'barricade', poly, obscuring: true })
const container = (id: string, poly: Vec[]): Terrain => ({ id, name: tr('Container'), kind: 'container', poly, obscuring: true })

const VICTORY =
  tr('Training (unofficial) rule: 5 rounds. From round 2, in their Command phase a player gets 5 VP for each controlled objective. The winner is whoever has more VP after round 5, or whoever destroyed the whole enemy army.')

export const SCENARIOS: Scenario[] = [
  {
    id: 'training-outpost',
    name: tr('Training skirmish at the outpost'),
    description:
      tr('A 30″×22″ field (like the Introductory Set mat). The Space Marines deploy at the left edge, the Orks at the right. Three objective markers, hut-ruins block line of sight, craters give cover. The open field favours shooters.'),
    victory: VICTORY,
    deployment: { west: rect(0, 0, 6, 22), east: rect(24, 0, 6, 22) },
    factions: ['marines', 'orks'],
    build: (sides = DEFAULT_SIDES) =>
      makeState(
        'training-outpost',
        [
          ruin('t1', tr('Hut ruin'), rect(11, 3.5, 4, 3)),
          ruin('t2', tr('Hut ruin'), rect(15, 15.5, 4, 3)),
          crater('t3', rect(5.5, 12, 3, 3)),
          crater('t4', rect(21.5, 7, 3, 3)),
          ruin('t5', tr('Wall debris'), rect(14, 9.5, 2, 0.8)),
        ],
        [{ x: 15, y: 11 }, { x: 8, y: 6 }, { x: 22, y: 16 }],
        sides,
      ),
  },
  {
    id: 'ruined-alley',
    name: tr('Alley in the ruins'),
    description:
      tr('The same field, but the centre is densely built up: ruins block lines of fire, and it is easier for the Orks to close in. Deployment zones are closer (9″ from the edges).'),
    victory: VICTORY,
    deployment: { west: rect(0, 0, 9, 22), east: rect(21, 0, 9, 22) },
    factions: ['marines', 'orks'],
    build: (sides = DEFAULT_SIDES) =>
      makeState(
        'ruined-alley',
        [
          ruin('t1', tr('Ruins'), rect(10, 2, 2.5, 6)),
          ruin('t2', tr('Ruins'), rect(10, 14, 2.5, 6)),
          ruin('t3', tr('Ruins'), rect(17.5, 2, 2.5, 6)),
          ruin('t4', tr('Ruins'), rect(17.5, 14, 2.5, 6)),
          ruin('t5', tr('Hut ruin'), rect(13.5, 8.5, 3, 5)),
          crater('t6', rect(6, 9.5, 2.5, 3)),
          crater('t7', rect(21.5, 9.5, 2.5, 3)),
        ],
        [{ x: 15, y: 4 }, { x: 15, y: 18 }, { x: 15, y: 11 }],
        sides,
        6,
        24,
      ),
  },
  {
    id: 'combat-patrol',
    name: tr('Combat Patrol (big battle)'),
    description:
      tr('A 44″×30″ field and bigger armies; all six armies (Space Marines, Orks, Tyranids, Necrons, Aeldari, Adeptus Mechanicus) are available in any pair — see the army selection screen for the roster. Varied terrain: ruins and woods (vehicles cannot pass), containers (you cannot stand inside), barricades, craters. A longer and tactically richer game.'),
    victory: VICTORY,
    deployment: { west: rect(0, 0, 10, 30), east: rect(34, 0, 10, 30) },
    factions: ['marines', 'orks', 'tyranids', 'necrons', 'aeldari', 'adeptus_mechanicus'],
    customArmies: true,
    // a 10″ zone on a 30″ edge: lists over 1000 points do not fit (they play on the 44″×60″ board)
    maxPoints: 1000,
    build: (sides = DEFAULT_SIDES, armies = {}, layout, opts = {}) => {
      assertSides(['marines', 'orks', 'tyranids', 'necrons', 'aeldari', 'adeptus_mechanicus'], sides)
      // layout A (the original) unless another one is asked for; 'random' picks one of the three
      const layoutId: LayoutId = opts.layoutId ? pickLayout(opts.layoutId) : 'A'
      const state = baseState(
        'combat-patrol',
        { width: 44, height: 30 },
        layout ?? patrolLayout(layoutId) ?? [
          ruin('t1', tr('Manufactorum ruins'), rect(15, 2, 5, 4)),
          ruin('t2', tr('Chapel ruins'), rect(24, 24, 5, 4)),
          woods('t3', rect(12, 17, 4, 5)),
          woods('t4', rect(28, 8, 4, 5)),
          container('t5', rect(20.5, 9, 3, 1.5)),
          container('t6', rect(20.5, 19.5, 3, 1.5)),
          barricade('t7', rect(11, 9, 0.6, 4)),
          barricade('t8', rect(32.4, 17, 0.6, 4)),
          crater('t9', rect(16.5, 24, 3, 3)),
          crater('t10', rect(24.5, 3, 3, 3)),
        ],
        [{ x: 22, y: 15 }, { x: 14, y: 9 }, { x: 30, y: 21 }],
        units(44, sides, (f) => (armies[f] ? () => [] : PATROL_ROSTERS[f])),
        sides,
      )
      for (const f of sides) if (armies[f]) musterArmy(state, f, armies[f])
      // a pure custom list plays without its detachment
      for (const f of sides) if (armies[f]?.noDetachment) state.players[f].noDetachment = true
      if (layoutId !== 'A') state.layoutId = layoutId
      return state
    },
  },
  {
    id: 'strike-force',
    name: tr('Battle 44″×60″ (11th edition maps)'),
    description:
      tr('A full-size 11th edition board. The deployment map is one of the six cards of the 2026-27 Mission Deck (zones and five objectives: one “home” objective for each side, a central one and two on the flanks), the cover is one of three layouts. The armies are your own rosters; a side without its own roster plays the preset at its opponent’s points limit (1000 points if neither side has a roster). Positions on the maps are reconstructed from the 10th edition maps (on the cards they exist only as pictures).'),
    victory: VICTORY,
    deployment: MAPS.hammerAnvil.deployment,
    factions: ['marines', 'orks', 'tyranids', 'necrons', 'aeldari', 'adeptus_mechanicus'],
    customArmies: true,
    build: (sides = DEFAULT_SIDES, armies = {}, layout, opts = {}) => {
      assertSides(['marines', 'orks', 'tyranids', 'necrons', 'aeldari', 'adeptus_mechanicus'], sides)
      const m = MAPS[pickMap(opts.mapId) as MapId]
      const layoutId: LayoutId = pickLayout(opts.layoutId)
      const state = baseState('strike-force', m.board, layout ?? layoutFor(layoutId, m.board), m.objectives.map((o) => o.pos), [], sides)
      state.objectives.forEach((o, i) => {
        const def = m.objectives[i]
        o.role = def.role
        if (def.side) o.home = def.side === 'west' ? sides[0] : sides[1]
      })
      state.deployment = m.deployment
      state.territory = m.territory
      state.mapId = m.id
      state.layoutId = layoutId
      // the primary mission (both sides play the same one: Mirrored World); 'training' keeps 5 VP per objective
      if (opts.primary !== 'training') state.mission = newMission(state, pickPrimary(opts.primary))
      // secondaries: each side Tactical unless its options say Fixed; 'none' turns them off for both
      const sec = opts.secondaries
      if (sec !== 'none')
        state.secondary = Object.fromEntries(sides.map((f) => {
          const cfg = sec?.[f]
          return [f, newSecondary(cfg?.mode ?? 'tactical', cfg?.fixed)]
        })) as GameState['secondary']
      // a side without its own list plays the preset at its opponent's limit, so the armies are the same size
      for (const [f, foe] of [[sides[0], sides[1]], [sides[1], sides[0]]]) musterArmy(state, f, armies[f] ?? presetList(f, armies[foe]?.limit ?? 1000))
      // a pure custom list plays without its detachment
      for (const f of sides) if (armies[f]?.noDetachment) state.players[f].noDetachment = true
      return state
    },
  },
]

/** The 44″×60″ map and layout of a battle, for the player: “Hammer and Anvil, layout A (Manufactorum ruins)”. */
export const mapLine = (s: GameState) => {
  if (s.mapId && s.mapId in MAPS) {
    const map = MAPS[s.mapId as MapId]
    const p = { name: map.name, nameEn: map.nameEn, id: s.layoutId, layout: LAYOUT_NAME[s.layoutId as LayoutId] }
    // English shows only the official name
    return map.name === map.nameEn ? tr('{name}, layout {id} — {layout}', p) : tr('{name} ({nameEn}), layout {id} — {layout}', p)
  }
  return s.scenarioId === 'combat-patrol' && s.layoutId ? tr('Layout {id} — {layout}', { id: s.layoutId, layout: PATROL_LAYOUT_NAME[s.layoutId as LayoutId] }) : null
}

/** The army `faction` fields in a scenario (null if the scenario has none): what the selection screen lists. */
export function armyOf(scenarioId: string, faction: PlayerId): UnitState[] | null {
  const sc = SCENARIOS.find((s) => s.id === scenarioId)
  if (!sc || !sc.factions.includes(faction)) return null
  const foe = sc.factions.find((f) => f !== faction)!
  return sc.build([faction, foe]).units.filter((u) => u.owner === faction)
}

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]

/** True when the board takes these own army lists: any board while there are none, else a board for lists that has room for the biggest. */
export function takesLists(sc: Scenario, lists: (ArmyList | null | undefined)[]): boolean {
  const biggest = Math.max(0, ...lists.map((l) => l?.limit ?? 0))
  return !biggest || (!!sc.customArmies && biggest <= (sc.maxPoints ?? Infinity))
}

/** The first board for this pair that takes the lists: Combat Patrol, or the 44″×60″ board for lists over 1000 points. */
export const boardForLists = (a: PlayerId, b: PlayerId, lists: (ArmyList | null | undefined)[]): string =>
  (SCENARIOS.find((s) => s.factions.includes(a) && s.factions.includes(b) && s.customArmies && takesLists(s, lists)) ?? scenarioById('strike-force')).id
