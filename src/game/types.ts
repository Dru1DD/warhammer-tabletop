// All positions and distances are in inches (world units). Origin = top-left
// corner of the battlefield, +x to the right, +y downwards.

export interface Vec {
  x: number
  y: number
}

export type PlayerId = 'marines' | 'orks'
export type Phase = 'command' | 'movement' | 'shooting' | 'charge' | 'fight'
export const PHASES: Phase[] = ['command', 'movement', 'shooting', 'charge', 'fight']

export interface WeaponKeywords {
  rapidFire?: number
  heavy?: boolean
  assault?: boolean
  closeQuarters?: boolean
  blast?: number
  torrent?: boolean
  /** Lethal Hits; 'nonMV' = only against non-MONSTER / non-VEHICLE targets */
  lethalHits?: boolean | 'nonMV'
  hazardous?: boolean
  cleave?: number
  devastatingWounds?: boolean
}

export interface WeaponProfile {
  name: string
  /** inches, or 'melee' */
  range: number | 'melee'
  /** fixed part of A; with `randomA` the total is randomA + attacks (e.g. D3+3) */
  attacks: number
  randomA?: RandomDie
  /** BS/WS target number; null = no roll (Torrent) */
  skill: number | null
  s: number
  ap: number
  /** fixed part of D; with `randomD` the total is randomD + d */
  d: number
  randomD?: RandomDie
  keywords: WeaponKeywords
}

export type RandomDie = 'D3' | 'D6'

/** A weapon with one or more profiles; the player picks one profile per attack. */
export interface Weapon {
  id: string
  name: string
  profiles: WeaponProfile[]
}

export interface ModelProfile {
  id: string
  name: string
  m: number
  t: number
  sv: number
  w: number
  ld: number
  oc: number
  invuln?: number
  baseMm: number
  character?: boolean
  weapons: string[]
}

export type AbilityId =
  | 'boltDiscipline'
  | 'tacticalPrecision'
  | 'ammoRunts'
  | 'tideOfMuscle'
  | 'waaagh'
  | 'dutyEternal'
  | 'dreadArd'
  | 'deadlyDemise1'
  | 'deadlyDemiseD3'
  | 'targetedIntercession'

export interface Datasheet {
  id: string
  name: string
  faction: PlayerId
  keywords: string[]
  abilities: AbilityId[]
}

export interface ModelState {
  id: string
  profileId: string
  pos: Vec
  wounds: number
  destroyed: boolean
}

export type MoveKind = 'none' | 'normal' | 'advance' | 'fallBack'

export interface UnitState {
  id: string
  datasheetId: string
  owner: PlayerId
  name: string
  models: ModelState[]
  startingModels: number
  battleShocked: boolean
  // per-turn flags, reset at start of each turn
  move: MoveKind
  /** largest distance any model moved this turn (for HEAVY) */
  movedDistance: number
  advanceRoll: number | null
  advanceRerolled: boolean
  shot: boolean
  chargeDeclared: boolean
  charged: boolean
  fought: boolean
  // per-battle
  ammoRuntsUsed: boolean
}

/** crater = exposed; barricade = light; ruin / woods / container = dense (container is also solid) */
export type TerrainKind = 'ruin' | 'crater' | 'woods' | 'barricade' | 'container'

export interface Terrain {
  id: string
  name: string
  kind: TerrainKind
  /** polygon, clockwise, inches */
  poly: Vec[]
  /** blocks line of sight through it (obscuring) */
  obscuring: boolean
}

export interface Objective {
  id: string
  pos: Vec
  /** player that holds it as "secured" (sticky) or null */
  controller: PlayerId | null
}

export interface PlayerState {
  cp: number
  vp: number
  waaaghUsed: boolean
  /** Waaagh! riled-up turns remaining (counts down at end of every turn) */
  riledTurns: number
}

export interface PendingCharge {
  unitId: string
  roll: number
  dice: number[]
  targets: string[]
}

export interface FightState {
  /** whose turn it is to select a unit to fight */
  selecting: PlayerId
  /** 'first' = Fights First units still to pick, 'rest' = remaining */
  step: 'first' | 'rest'
}

export type ExplainLevel = 'beginner' | 'standard' | 'minimal'

export interface LogEntry {
  id: number
  round: number
  player: PlayerId
  phase: Phase
  text: string
  /** lowest explanation level at which this entry is shown */
  level: ExplainLevel
}

export interface DieRoll {
  value: number
  success: boolean
  rerolledFrom?: number
  critical?: boolean
}

export interface AttackStep {
  label: string
  target: string
  dice: DieRoll[]
  note?: string
}

export interface DiceEntry {
  id: number
  round: number
  player: PlayerId
  title: string
  steps: AttackStep[]
  summary: string
}

export interface GameState {
  schemaVersion: number
  scenarioId: string
  board: { width: number; height: number }
  terrain: Terrain[]
  objectives: Objective[]
  players: Record<PlayerId, PlayerState>
  units: UnitState[]
  round: number
  maxRounds: number
  firstPlayer: PlayerId
  activePlayer: PlayerId
  phase: Phase
  pendingCharge: PendingCharge | null
  fight: FightState | null
  rng: number
  log: LogEntry[]
  diceLog: DiceEntry[]
  winner: PlayerId | 'draw' | null
  nextId: number
}

export type Command =
  | { type: 'declareAdvance'; unitId: string }
  | { type: 'rerollAdvance'; unitId: string }
  | { type: 'move'; unitId: string; mode: 'normal' | 'advance' | 'fallBack'; positions: Record<string, Vec> }
  | {
      type: 'shoot'
      unitId: string
      targetId: string
      /** weaponId -> profile index; missing = 0 */
      profiles?: Record<string, number>
      usePistols?: boolean
      useAmmoRunts?: boolean
    }
  | { type: 'declareCharge'; unitId: string }
  | { type: 'chargeMove'; unitId: string; targetIds: string[] }
  | { type: 'skipCharge'; unitId: string }
  | { type: 'fight'; unitId: string; targetId: string }
  | { type: 'callWaaagh' }
  | { type: 'endPhase' }

export type Validation = { ok: true } | { ok: false; reason: string }
