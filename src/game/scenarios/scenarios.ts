import { PROFILES } from '../data/datasheets'
import { rect } from '../geometry/geometry'
import { DEFAULT_SIDES, newUnit, SCHEMA_VERSION, seats } from '../gameState'
import type { GameState, PlayerId, PlayerState, Terrain, UnitState, Vec } from '../types'
import type { ArmyList } from '../army/armyList'
import { musterArmy } from '../army/placement'
import { presetList } from '../army/armyList'
import { LAYOUT_NAME, layoutFor, MAPS, PATROL_LAYOUT_NAME, patrolLayout, pickLayout, pickMap, type LayoutId, type MapId } from './strikeForce'

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
  build: (sides?: [PlayerId, PlayerId], armies?: Armies, terrain?: Terrain[], opts?: { mapId?: string; layoutId?: string }) => GameState
  /** true when the board takes army lists from the army builder (`armies` in `build`, set up around `terrain` if given) */
  customArmies?: boolean
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

/** Introductory-Set armies for the small 30″×22″ boards. `depth` = distance of the main line from the own edge. */
const marinesDuel = (depth: number): Roster => (at) => [
  unit('lt', 'lieutenant', 'marines', 'Лейтенант', [['lieutenant', at(depth - 1.5, 11)]]),
  unit('int', 'intercessors', 'marines', 'Интерсессоры', [
    ['intercessorSergeant', at(depth, 11)],
    ['intercessor', at(depth, 9)],
    ['intercessor', at(depth, 13)],
    ['intercessorGL', at(depth, 7)],
    ['intercessor', at(depth, 15)],
  ]),
]
const orksDuel = (depth: number): Roster => (at) => [
  unit('boyz', 'boyz', 'orks', 'Бойз', [
    ['nob', at(depth, 11)],
    ['boy', at(depth, 9)],
    ['boy', at(depth, 13)],
    ['boyBigShoota', at(depth - 1.5, 7.5)],
    ['boyRokkit', at(depth - 1.5, 14.5)],
    ['boy', at(depth + 1.5, 11)],
  ]),
]

/** Combat Patrol armies for the 44″×30″ board. */
const marinesPatrol: Roster = (at) => [
  unit('lt', 'lieutenant', 'marines', 'Лейтенант', [['lieutenant', at(3, 16)]]),
  unit('int', 'intercessors', 'marines', 'Интерсессоры I', column5(at, ['intercessorSergeant', 'intercessor', 'intercessorGL', 'intercessor', 'intercessor'], 7, 5)),
  unit('int2', 'intercessors', 'marines', 'Интерсессоры II', column5(at, ['intercessorSergeant', 'intercessor', 'intercessorGL', 'intercessor', 'intercessor'], 7, 17)),
  unit('aint', 'assaultIntercessors', 'marines', 'Штурмовые интерсессоры', column5(at, ['assaultSergeant', 'assaultIntercessor', 'assaultIntercessor', 'assaultIntercessor', 'assaultIntercessor'], 3, 4)),
  unit('red', 'redemptor', 'marines', 'Дредноут «Редемптор»', [['redemptor', at(4, 23)]]),
]
const orksPatrol: Roster = (at) => [
  boyzMob(at, 'boyz', 'Бойз I', 7.5, 4, 'boyBigShoota'),
  boyzMob(at, 'boyz2', 'Бойз II', 7.5, 18, 'boyRokkit'),
  boyzMob(at, 'boyz3', 'Бойз III', 3.5, 3, 'boyBigShoota'),
  unit('dread', 'deffDread', 'orks', 'Дэфф-дред', [['deffDread', at(3.5, 15)]]),
]

/** Two-file formation of `n` models: `pick(i)` chooses the profile, files at `depth` and `depth - gap`. */
const formation = (at: At, n: number, pick: (i: number) => string, depth: number, y: number, step: number, gap = 1.4): [string, Vec][] =>
  Array.from({ length: n }, (_, i): [string, Vec] => [pick(i), at(depth - (i % 2) * gap, y + Math.floor(i / 2) * step)])

/** Tyranids: 1 Hive Tyrant, 10 Termagants, 10 Hormagaunts, 3 Tyranid Warriors (docs/armies.md). */
const tyranidsPatrol: Roster = (at) => [
  unit('tyrant', 'hiveTyrant', 'tyranids', 'Тиран Улья', [['hiveTyrant', at(2.5, 15)]]),
  unit('termagants', 'termagants', 'tyranids', 'Термаганты', formation(at, 10, (i) => (i === 2 ? 'termagantShard' : i === 5 ? 'termagantSpike' : i === 8 ? 'termagantWeb' : 'termagant'), 8.6, 4, 1.6)),
  unit('hormagaunts', 'hormagaunts', 'tyranids', 'Гормагауны', formation(at, 10, () => 'hormagaunt', 8.6, 19, 1.6)),
  unit('warriors', 'tyranidWarriors', 'tyranids', 'Воины тиранидов', [
    ['tyranidPrime', at(5.5, 15)],
    ['tyranidWarriorVenom', at(5.5, 12.8)],
    ['tyranidWarriorStrangler', at(5.5, 17.2)],
  ]),
]

/** Necrons: 1 Overlord, 10 Necron Warriors, 3 Skorpekh Destroyers, 3 Canoptek Scarab Swarms. */
const necronsPatrol: Roster = (at) => [
  unit('overlord', 'overlord', 'necrons', 'Оверлорд', [['overlord', at(3, 15)]]),
  unit('nwar', 'necronWarriors', 'necrons', 'Воины некронов', formation(at, 10, () => 'necronWarrior', 8.6, 3.5, 1.7, 1.5)),
  unit('skorp', 'skorpekhDestroyers', 'necrons', 'Скорпекх-разрушители', [
    ['skorpekh', at(5.5, 12.8)],
    ['skorpekh', at(5.5, 15.2)],
    ['skorpekh', at(5.5, 17.6)],
  ]),
  unit('scarabs', 'scarabSwarms', 'necrons', 'Рои скарабеев', [
    ['scarab', at(7.5, 21)],
    ['scarab', at(7.5, 22.8)],
    ['scarab', at(7.5, 24.6)],
  ]),
]

/** Aeldari: 1 Farseer, 10 Guardian Defenders (+ the datasheet's Heavy Weapon Platform), 5 Dire Avengers, 3 Windriders. */
const aeldariPatrol: Roster = (at) => [
  unit('farseer', 'farseer', 'aeldari', 'Фарсир', [['farseer', at(2.5, 15)]]),
  unit('guardians', 'guardianDefenders', 'aeldari', 'Стражи-защитники', [
    ...formation(at, 10, () => 'guardian', 8.6, 3.5, 1.5),
    ['heavyPlatform', at(5.6, 6.5)],
  ]),
  unit('avengers', 'direAvengers', 'aeldari', 'Грозные мстители', [
    ['exarch', at(6, 12.5)],
    ['direAvenger', at(6, 14)],
    ['direAvenger', at(6, 15.5)],
    ['direAvenger', at(6, 17)],
    ['direAvenger', at(6, 18.5)],
  ]),
  unit('riders', 'windriders', 'aeldari', 'Райдеры ветра', [
    ['windrider', at(8.5, 21)],
    ['windriderLaser', at(8.5, 23)],
    ['windriderCannon', at(8.5, 25)],
  ]),
]

/**
 * Adeptus Mechanicus: Tech-Priest Dominus, Tech-Priest Manipulus, 10 Skitarii Rangers, 10 Skitarii Vanguard,
 * 3 Kataphron Breachers, 3 Kataphron Destroyers, 5 Sicarian Infiltrators, 3 Kastelan Robots (docs/mechanicus.md).
 * The Tech-Priests stand within 3″ of the Rangers / Vanguard they escort.
 */
const mechanicusPatrol: Roster = (at) => [
  unit('dominus', 'techDominus', 'adeptus_mechanicus', 'Техножрец-Доминус', [['techDominus', at(5.2, 8)]]),
  unit('manipulus', 'techManipulus', 'adeptus_mechanicus', 'Техножрец-Манипулус', [['techManipulus', at(5.2, 22.5)]]),
  unit('rangers', 'rangers', 'adeptus_mechanicus', 'Скитарии-рейнджеры', formation(at, 10, (i) => (i === 0 ? 'rangerAlpha' : i === 3 ? 'rangerArc' : i === 6 ? 'rangerCaliver' : i === 8 ? 'rangerOmnispex' : 'ranger'), 8.6, 3.5, 1.4, 1.2)),
  unit('vanguard', 'vanguard', 'adeptus_mechanicus', 'Скитарии-авангард', formation(at, 10, (i) => (i === 0 ? 'vanguardAlpha' : i === 3 ? 'vanguardArc' : i === 6 ? 'vanguardCaliver' : 'vanguard'), 8.6, 19.5, 1.4, 1.2)),
  unit('breachers', 'breachers', 'adeptus_mechanicus', 'Катафроны-пробойщики', [
    ['breacher', at(5.5, 11.5)],
    ['breacherTorsion', at(5.5, 14.1)],
    ['breacherHydraulic', at(5.5, 16.7)],
  ]),
  unit('destroyers', 'destroyers', 'adeptus_mechanicus', 'Катафроны-разрушители', [
    ['destroyer', at(2.6, 11.5)],
    ['destroyer', at(2.6, 14.1)],
    ['destroyerCulverin', at(2.6, 16.7)],
  ]),
  unit('sicarians', 'sicarians', 'adeptus_mechanicus', 'Сикарии-диверсанты', [
    ['sicarianPrinceps', at(3.2, 20.5)],
    ['sicarian', at(3.2, 22.3)],
    ['sicarianTaser', at(3.2, 24.1)],
    ['sicarian', at(3.2, 25.9)],
    ['sicarianTaser', at(3.2, 27.7)],
  ]),
  unit('kastelans', 'kastelans', 'adeptus_mechanicus', 'Роботы Кастелан', [
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
  if (sides[0] === sides[1]) throw new Error('Стороны должны быть разными фракциями.')
  for (const f of sides) if (!factions.includes(f)) throw new Error(`В этом сценарии нет армии «${f}».`)
}

const ruin = (id: string, name: string, poly: Vec[]): Terrain => ({ id, name, kind: 'ruin', poly, obscuring: true })
const crater = (id: string, poly: Vec[]): Terrain => ({ id, name: 'Воронка', kind: 'crater', poly, obscuring: false })
const woods = (id: string, poly: Vec[]): Terrain => ({ id, name: 'Лес', kind: 'woods', poly, obscuring: true })
const barricade = (id: string, poly: Vec[]): Terrain => ({ id, name: 'Баррикада', kind: 'barricade', poly, obscuring: true })
const container = (id: string, poly: Vec[]): Terrain => ({ id, name: 'Контейнер', kind: 'container', poly, obscuring: true })

const VICTORY =
  'Учебное (неофициальное) правило: 5 раундов. С 2-го раунда в своей фазе командования игрок получает 5 ПО за каждую контролируемую цель. Побеждает тот, у кого больше ПО после 5-го раунда, или тот, кто уничтожил всю армию противника.'

export const SCENARIOS: Scenario[] = [
  {
    id: 'training-outpost',
    name: 'Учебная стычка у аванпоста',
    description:
      'Поле 30″×22″ (как коврик Introductory Set). Космодесант развёртывается у левого края, Орки — у правого. Три маркера целей, хижины-руины блокируют обзор, воронки дают укрытие. Открытое поле — преимущество у стрелков.',
    victory: VICTORY,
    deployment: { west: rect(0, 0, 6, 22), east: rect(24, 0, 6, 22) },
    factions: ['marines', 'orks'],
    build: (sides = DEFAULT_SIDES) =>
      makeState(
        'training-outpost',
        [
          ruin('t1', 'Хижина-руина', rect(11, 3.5, 4, 3)),
          ruin('t2', 'Хижина-руина', rect(15, 15.5, 4, 3)),
          crater('t3', rect(5.5, 12, 3, 3)),
          crater('t4', rect(21.5, 7, 3, 3)),
          ruin('t5', 'Обломки стены', rect(14, 9.5, 2, 0.8)),
        ],
        [{ x: 15, y: 11 }, { x: 8, y: 6 }, { x: 22, y: 16 }],
        sides,
      ),
  },
  {
    id: 'ruined-alley',
    name: 'Переулок в руинах',
    description:
      'То же поле, но центр плотно застроен: руины перекрывают линии огня, и Оркам проще подойти вплотную. Зоны развёртывания ближе (9″ от краёв).',
    victory: VICTORY,
    deployment: { west: rect(0, 0, 9, 22), east: rect(21, 0, 9, 22) },
    factions: ['marines', 'orks'],
    build: (sides = DEFAULT_SIDES) =>
      makeState(
        'ruined-alley',
        [
          ruin('t1', 'Руины', rect(10, 2, 2.5, 6)),
          ruin('t2', 'Руины', rect(10, 14, 2.5, 6)),
          ruin('t3', 'Руины', rect(17.5, 2, 2.5, 6)),
          ruin('t4', 'Руины', rect(17.5, 14, 2.5, 6)),
          ruin('t5', 'Хижина-руина', rect(13.5, 8.5, 3, 5)),
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
    name: 'Боевой патруль (большая битва)',
    description:
      'Поле 44″×30″ и армии крупнее; здесь доступны все шесть армий (Космодесант, Орки, Тираниды, Некроны, Аэльдари, Адептус Механикус) в любых парах — состав смотрите на экране выбора армии. Разнообразный тиррейн: руины и лес (техника не проходит), контейнеры (внутри нельзя стоять), баррикады, воронки. Игра длиннее и тактически богаче.',
    victory: VICTORY,
    deployment: { west: rect(0, 0, 10, 30), east: rect(34, 0, 10, 30) },
    factions: ['marines', 'orks', 'tyranids', 'necrons', 'aeldari', 'adeptus_mechanicus'],
    customArmies: true,
    build: (sides = DEFAULT_SIDES, armies = {}, layout, opts = {}) => {
      assertSides(['marines', 'orks', 'tyranids', 'necrons', 'aeldari', 'adeptus_mechanicus'], sides)
      // layout A (the original) unless another one is asked for; 'random' picks one of the three
      const layoutId: LayoutId = opts.layoutId ? pickLayout(opts.layoutId) : 'A'
      const state = baseState(
        'combat-patrol',
        { width: 44, height: 30 },
        layout ?? patrolLayout(layoutId) ?? [
          ruin('t1', 'Руины мануфактории', rect(15, 2, 5, 4)),
          ruin('t2', 'Руины часовни', rect(24, 24, 5, 4)),
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
    name: 'Битва 44″×60″ (карты 11-й редакции)',
    description:
      'Полноразмерное поле 11-й редакции. Карта расстановки — одна из шести карточек колоды миссий 2026-27 (зоны и пять целей: по одной «домашней» у каждого, центральная и две на флангах), укрытия — одна из трёх раскладок. Армии — свои составы; без своего состава сторона играет пресетом на 1000 очков. Позиции на картах восстановлены по картам 10-й редакции (на карточках они только на картинках).',
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
      for (const f of sides) musterArmy(state, f, armies[f] ?? presetList(f, 1000))
      return state
    },
  },
]

/** The 44″×60″ map and layout of a battle, for the player: «Молот и наковальня, раскладка A (Руины мануфактории)». */
export const mapLine = (s: GameState) =>
  s.mapId && s.mapId in MAPS
    ? `${MAPS[s.mapId as MapId].name} (${MAPS[s.mapId as MapId].nameEn}), раскладка ${s.layoutId} — ${LAYOUT_NAME[s.layoutId as LayoutId]}`
    : s.scenarioId === 'combat-patrol' && s.layoutId ? `Раскладка ${s.layoutId} — ${PATROL_LAYOUT_NAME[s.layoutId as LayoutId]}` : null

/** The army `faction` fields in a scenario (null if the scenario has none): what the selection screen lists. */
export function armyOf(scenarioId: string, faction: PlayerId): UnitState[] | null {
  const sc = SCENARIOS.find((s) => s.id === scenarioId)
  if (!sc || !sc.factions.includes(faction)) return null
  const foe = sc.factions.find((f) => f !== faction)!
  return sc.build([faction, foe]).units.filter((u) => u.owner === faction)
}

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]
