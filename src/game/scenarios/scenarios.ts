import { PROFILES } from '../data/datasheets'
import { rect } from '../geometry/geometry'
import { SCHEMA_VERSION } from '../gameState'
import type { GameState, ModelState, PlayerId, Terrain, UnitState, Vec } from '../types'

export interface Scenario {
  id: string
  name: string
  description: string
  victory: string
  /** deployment zones (display + documentation) */
  deployment: Record<PlayerId, Vec[]>
  build: () => GameState
}

function unit(id: string, datasheetId: string, owner: PlayerId, name: string, models: [string, Vec][]): UnitState {
  const ms: ModelState[] = models.map(([profileId, pos], i) => ({ id: `${id}-${i}`, profileId, pos, wounds: 0, destroyed: false }))
  return {
    id, datasheetId, owner, name, models: ms, startingModels: ms.length, battleShocked: false,
    move: 'none', movedDistance: 0, advanceRoll: null, advanceRerolled: false, shot: false,
    chargeDeclared: false, charged: false, fought: false, ammoRuntsUsed: false,
  }
}

// Wounds come from profiles so data lives in one place.
const fillWounds = (s: GameState) => {
  for (const u of s.units) for (const m of u.models) m.wounds = PROFILES[m.profileId].w
  return s
}

function makeState(id: string, terrain: Terrain[], objectives: Vec[], mx = 4, ox = 26): GameState {
  return fillWounds({
    schemaVersion: SCHEMA_VERSION,
    scenarioId: id,
    board: { width: 30, height: 22 },
    terrain,
    objectives: objectives.map((pos, i) => ({ id: `o${i + 1}`, pos, controller: null })),
    players: {
      marines: { cp: 0, vp: 0, waaaghUsed: false, riledTurns: 0 },
      orks: { cp: 0, vp: 0, waaaghUsed: false, riledTurns: 0 },
    },
    units: [
      unit('lt', 'lieutenant', 'marines', 'Лейтенант', [['lieutenant', { x: mx - 1.5, y: 11 }]]),
      unit('int', 'intercessors', 'marines', 'Интерсессоры', [
        ['intercessorSergeant', { x: mx, y: 11 }],
        ['intercessor', { x: mx, y: 9 }],
        ['intercessor', { x: mx, y: 13 }],
        ['intercessorGL', { x: mx, y: 7 }],
        ['intercessor', { x: mx, y: 15 }],
      ]),
      unit('boyz', 'boyz', 'orks', 'Бойз', [
        ['nob', { x: ox, y: 11 }],
        ['boy', { x: ox, y: 9 }],
        ['boy', { x: ox, y: 13 }],
        ['boyBigShoota', { x: ox + 1.5, y: 7.5 }],
        ['boyRokkit', { x: ox + 1.5, y: 14.5 }],
        ['boy', { x: ox - 1.5, y: 11 }],
      ]),
    ],
    round: 1,
    maxRounds: 5,
    firstPlayer: 'marines',
    activePlayer: 'marines',
    phase: 'command',
    pendingCharge: null,
    fight: null,
    rng: 1,
    log: [],
    diceLog: [],
    winner: null,
    nextId: 1,
  })
}

const ruin = (id: string, name: string, poly: Vec[]): Terrain => ({ id, name, kind: 'ruin', poly, obscuring: true })
const crater = (id: string, poly: Vec[]): Terrain => ({ id, name: 'Воронка', kind: 'crater', poly, obscuring: false })

const VICTORY =
  'Учебное (неофициальное) правило: 5 раундов. С 2-го раунда в своей фазе командования игрок получает 5 ПО за каждую контролируемую цель. Побеждает тот, у кого больше ПО после 5-го раунда, или тот, кто уничтожил всю армию противника.'

export const SCENARIOS: Scenario[] = [
  {
    id: 'training-outpost',
    name: 'Учебная стычка у аванпоста',
    description:
      'Поле 30″×22″ (как коврик Introductory Set). Космодесант развёртывается у левого края, Орки — у правого. Три маркера целей, хижины-руины блокируют обзор, воронки дают укрытие. Открытое поле — преимущество у стрелков.',
    victory: VICTORY,
    deployment: { marines: rect(0, 0, 6, 22), orks: rect(24, 0, 6, 22) },
    build: () =>
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
      ),
  },
  {
    id: 'ruined-alley',
    name: 'Переулок в руинах',
    description:
      'То же поле, но центр плотно застроен: руины перекрывают линии огня, и Оркам проще подойти вплотную. Зоны развёртывания ближе (9″ от краёв).',
    victory: VICTORY,
    deployment: { marines: rect(0, 0, 9, 22), orks: rect(21, 0, 9, 22) },
    build: () =>
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
        6,
        24,
      ),
  },
]

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]
