// All positions and distances are in inches (world units). Origin = top-left
// corner of the battlefield, +x to the right, +y downwards.

export interface Vec {
  x: number
  y: number
}

/** A side on the table is identified by its faction. A battle has exactly two distinct sides. */
export type PlayerId = 'marines' | 'orks' | 'tyranids' | 'necrons' | 'aeldari' | 'adeptus_mechanicus'
export const FACTIONS: PlayerId[] = ['marines', 'orks', 'tyranids', 'necrons', 'aeldari', 'adeptus_mechanicus']
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
  /** Twin-linked: re-roll failed wound rolls */
  twinLinked?: boolean
  /** Extra Attacks: used in addition to the model's other melee weapon */
  extraAttacks?: boolean
  /** Sustained Hits X: each critical hit scores X extra hits */
  sustainedHits?: number
  /** Anti-X Y+: against units with keyword X an unmodified wound roll of Y+ is a critical wound */
  anti?: { keyword: string; roll: number }
  /** Psychic: BS/WS and hit-roll modifiers (cover, negative modifiers) may be ignored */
  psychic?: boolean
  /** One Shot: can be used once per battle */
  oneShot?: boolean
  /** Ignores Cover: the target gets no benefit of cover against this weapon */
  ignoresCover?: boolean
  /** Precision: wounds are allocated to a CHARACTER model of the target unit first */
  precision?: boolean
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
  /** weapon platform: crew model that dies with its unit's last non-platform model (Crewed Platform) */
  platform?: boolean
  /** unit-wide wargear carried by this model (e.g. Omnispex: the whole unit ignores cover) */
  wargear?: Wargear[]
  weapons: string[]
}

export type Wargear = 'omnispex'

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
  // Tyranids
  | 'synapse'
  | 'shadowInTheWarp'
  | 'onslaught'
  | 'boundingLeap'
  | 'adaptablePredators'
  | 'skulkingHorrors'
  | 'willOfTheHiveMind'
  // Necrons
  | 'reanimation'
  | 'legion'
  | 'implacableResilience'
  | 'whirlingOnslaught'
  | 'selfDestruction'
  | 'chitteringSwarm'
  | 'myWillBeDone'
  // Aeldari
  | 'battleFocus'
  | 'guide'
  | 'branchingFates'
  | 'swiftDemise'
  | 'bladestorm'
  | 'crewedPlatform'
  | 'fleetOfFoot'
  // Adeptus Mechanicus
  | 'doctrina'
  | 'ledUnit'
  | 'lordOfMachineCult'
  | 'dataSpike'
  | 'galvanicField'
  | 'defendDivineWork'
  | 'objectiveScouted'
  | 'radSaturation'
  | 'breachingCommand'
  | 'infiltrators'
  | 'stealth'
  | 'voicesInTheCode'
  | 'neurostaticInterference'
  | 'repulsorGrid'
  | 'sentinelDirectives'
  | 'scouts'
  | 'roboticBodyguard'

export interface Datasheet {
  id: string
  name: string
  faction: PlayerId
  keywords: string[]
  abilities: AbilityId[]
  /** short role description shown on the unit card */
  description?: string
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
  /** One Shot weapons already used, as `${modelId}:${weaponId}` (absent until the first use) */
  spent?: string[]
  /** Guide already used by this unit this turn (absent otherwise) */
  guided?: boolean
  /** Defend the Divine Work: 4+ invulnerable save until the start of its owner's next turn (absent otherwise) */
  warded?: boolean
  /** Data-spike: melee weapon skill worsened by 1 until the end of the Fight phase (absent otherwise) */
  spiked?: boolean
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
  /** player that currently controls it (recomputed from Objective Control) or null */
  controller: PlayerId | null
  /** Objective Scouted: this player keeps control until the opponent's level exceeds theirs (absent otherwise) */
  held?: PlayerId
}

export interface PlayerState {
  cp: number
  vp: number
  waaaghUsed: boolean
  /** Waaagh! riled-up turns remaining (counts down at end of every turn) */
  riledTurns: number
  /** Tyranids: Shadow in the Warp already used this battle (only present for that army) */
  shadowUsed?: boolean
  /** Aeldari: Battle Focus tokens left this battle round (only present for that army) */
  focus?: number
  /** Aeldari: enemy unit marked by Guide until this player's next Command phase */
  guide?: string | null
  /** Adeptus Mechanicus: Doctrina Imperative chosen for the current round (null = not chosen yet; only present for that army) */
  imperative?: Imperative | null
  /** Adeptus Mechanicus: Defend the Divine Work already used this battle (only present for that army) */
  divineUsed?: boolean
}

export type Imperative = 'protector' | 'conqueror'
export const IMPERATIVES: Imperative[] = ['protector', 'conqueror']

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
  /** [west, east] factions. Absent = the original pair ['marines', 'orks'] (keeps old saves and states identical). */
  sides?: [PlayerId, PlayerId]
}

export type Command =
  | { type: 'declareAdvance'; unitId: string }
  | { type: 'rerollAdvance'; unitId: string }
  | {
      type: 'move'
      unitId: string
      mode: 'normal' | 'advance' | 'fallBack'
      positions: Record<string, Vec>
      /** FLY: "take to the skies" (−2″ max, ignore models and terrain) */
      fly?: boolean
      /** Aeldari Battle Focus, Swift as the Wind: spend a token for +2″ */
      swift?: boolean
    }
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
  | { type: 'callShadow' }
  | { type: 'guide'; unitId: string; targetId: string }
  | { type: 'imperative'; imperative: Imperative }
  | { type: 'divineWork'; unitId: string }
  | { type: 'endPhase' }

export type Validation = { ok: true } | { ok: false; reason: string }
