import { create } from 'zustand'
import type { AiDecision, AiLevel } from './game/ai/ai'
import { decideAsync } from './game/ai/aiClient'
import { seededRoller } from './game/dice/dice'
import { actor, startGame, validate, type MoveOptions } from './game/engine'
import { other, sidesOf } from './game/gameState'
import {
  aiProposal, controllerOf, createMatch, isLocallyUndoable, localPlayerOf, nextEnvelope, soloAssignments, submit as submitCommand, undoTo,
} from './game/match/match'
import type { ActionRecord, CommandEnvelope, MatchState, PlayerAssignments, SubmitResult } from './game/match/types'
import { deserialize, readStorage, saveMatch, saveToStorage } from './game/persistence'
import { scenarioById } from './game/scenarios/scenarios'
import { parseArmies, type ArmyList } from './game/army/armyList'
import { applyPreset, deployWithPreset, recommendedPreset, type DeployPresetId } from './game/army/deployPresets'
import { deploymentIssues, deploymentProblem } from './game/rules/deployment'
import { parseLayout } from './game/terrainLayout'
import { FACTIONS, type Command, type ExplainLevel, type GameState, type PlayerId, type Terrain, type Vec } from './game/types'
import type { TutorialStart } from './ui/help'
import { actionableUnits, canActNow } from './ui/guidance'

export const AUTOSAVE_KEY = 'wh40k-training-autosave'
export const MANUAL_KEY = 'wh40k-training-save'
const SETTINGS_KEY = 'wh40k-training-settings'
export const TUTORIAL_KEY = 'wh40k-training-tutorial'
export const TERRAIN_KEY = 'wh40k-training-terrain'
const LAYOUT_KEY = 'wh40k-training-layout'

/** Which side panels are expanded. Defaults depend on screen size (13″ laptops start compact). */
export interface Layout {
  roster: boolean
  log: boolean
}

function loadLayout(): Layout {
  const def = { roster: window.innerWidth >= 1600, log: window.innerHeight >= 1000 }
  try {
    const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null')
    return v && typeof v.roster === 'boolean' && typeof v.log === 'boolean' ? v : def
  } catch {
    return def
  }
}
/** Host's autosave of a shared (online) match. Never mixed with the single-player autosave. */
export const MP_SAVE_KEY = 'wh40k-training-mp-save'
export const TOKENS_KEY = 'wh40k-training-tokens'
const MAX_AI_ACTIONS_PER_TURN = 150
export const AI_STEP_MS = 550

export interface Settings {
  human: PlayerId
  /** the computer's faction; must differ from `human` */
  opponent: PlayerId
  aiLevel: AiLevel
  explain: ExplainLevel
  tutorial: boolean
  scenarioId: string
  /** army-builder lists by faction; a faction without one fields its default training roster */
  armies?: Partial<Record<PlayerId, ArmyList>>
  /** 44″×60″ board: the deployment map and the terrain layout ('random' or absent = a random one each battle) */
  mapId?: string
  layoutId?: string
  /** 44″×60″ board: the primary mission ('random' or absent = a random one; 'training' = 5 VP per objective) */
  primary?: string
}

/** A measuring endpoint: a point, or a model base (r > 0) for edge-to-edge distance. */
export interface MeasurePoint {
  p: Vec
  r: number
  label?: string
}

export interface AiNote {
  id: number
  text: string
}

/** Online match info. The store only knows `send`; networking lives in src/multiplayer. */
export interface SharedInfo {
  role: 'host' | 'guest'
  /** guest only: ship a command to the host (the guest never applies commands itself) */
  send: ((env: CommandEnvelope) => boolean) | null
  /** single-player settings to restore (and persist) when the online match ends */
  prevSettings: Settings
}

interface Store {
  game: GameState | null
  shared: SharedInfo | null
  settings: Settings
  selectedUnitId: string | null
  draft: Record<string, Vec>
  groupDrag: boolean
  measuring: boolean
  measure: { a: MeasurePoint | null; b: MeasurePoint | null; range: number }
  message: { text: string; kind: 'error' | 'info' } | null
  /** the match behind `game`: assignments, state version, sequence counters, accepted-action history.
   * null during setup. `game` is always `match.state` while a battle runs (published projection). */
  match: MatchState | null
  /** local undo snapshots (training mode only; never filled in a shared match) */
  history: MatchState[]
  aiNotes: AiNote[]
  aiActionsThisTurn: number
  /** true while the AI is computing its next decision (off the main thread when workers are available) */
  aiThinking: boolean
  /** ids of tutorial lessons already learned (persisted across games) */
  tutorialDone: string[]
  tutorialStart: TutorialStart
  /** non-null while the human sets up their army before round 1 */
  deploying: { placed: string[] } | null
  deployHistory: { game: GameState; placed: string[] }[]
  /** shooting target picked on the board, waiting for «Огонь» */
  aimTargetId: string | null
  /** step-by-step replay of attacks with dice id > afterId; pauses the AI while open */
  review: { afterId: number } | null
  layout: Layout
  /** terrain piece being edited during setup */
  selectedTerrainId: string | null
  shotOptions: { profiles: Record<string, number>; usePistols: boolean; useAmmoRunts: boolean }
  /** FLY / Swift as the Wind toggles for the move being planned */
  moveOptions: MoveOptions
  /** user photos per model profile (data URLs), kept only in this browser */
  customTokens: Record<string, string>

  newGame: (s?: Partial<Settings>) => void
  startDeployment: (s?: Partial<Settings>) => void
  placeUnit: (unitId: string) => boolean
  autoDeploy: () => void
  /** Sets up every unit of the player in a deployment preset (all count as placed; each can still be moved). */
  deployPreset: (id: DeployPresetId) => void
  finishDeployment: () => boolean
  quit: () => void
  /** The single entry point for every command from any controller (local UI, AI, future remote).
   * Returns the full result (accepted action or reject code) so a network adapter can answer the sender. */
  submit: (env: CommandEnvelope, opts?: { silent?: boolean }) => SubmitResult
  /** Publish a match the pipeline already accepted (host: after `submit`; guest: after verifying the host's action). */
  commitAccepted: (prev: MatchState, r: { match: MatchState; action: ActionRecord }) => void
  /** Host: build a fresh battle for an online match (host seed, default positions) and publish it. */
  startSharedHost: (c: { scenarioId: string; hostSide: PlayerId; guestSide: PlayerId; hostArmy?: ArmyList | null; guestArmy?: ArmyList | null; assignments: PlayerAssignments }) => MatchState
  /** Publish an online match (host start / restore, guest start / snapshot). The viewer's side comes from the local controller. */
  installShared: (match: MatchState, role: 'host' | 'guest', send?: SharedInfo['send']) => void
  /** Local player's command: wraps it in an envelope and goes through `submit`. */
  dispatch: (cmd: Command) => boolean
  /** One AI decision, computed synchronously (tests, and the fallback path). */
  aiStep: () => boolean
  /** One AI decision computed in a Web Worker; a result for a game that has moved on meanwhile is dropped. */
  aiStepAsync: () => Promise<boolean>
  select: (unitId: string | null) => void
  setDraft: (positions: Record<string, Vec>) => void
  clearDraft: () => void
  setGroupDrag: (v: boolean) => void
  toggleMeasure: () => void
  setMeasurePoint: (p: MeasurePoint) => void
  setMeasureRange: (r: number) => void
  clearMeasure: () => void
  undo: () => void
  save: () => void
  load: (key?: string) => boolean
  setSettings: (s: Partial<Settings>) => void
  setMessage: (text: string | null, kind?: 'error' | 'info') => void
  setAim: (targetId: string | null) => void
  selectTerrain: (id: string | null) => void
  toggleLayout: (key: keyof Layout) => void
  editTerrain: (terrain: Terrain[]) => void
  resetTerrain: () => void
  closeReview: () => void
  completeLesson: (id: string) => void
  resetTutorial: () => void
  setShotOptions: (o: Partial<Store['shotOptions']>) => void
  setMoveOptions: (o: Partial<MoveOptions>) => void
  setCustomToken: (profileId: string, dataUrl: string | null) => boolean
}

function loadTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** After a turn or phase change, select the first unit the human can act with. */
function autoSelect(game: GameState, prev: GameState | null, human: PlayerId, selected: string | null): string | null {
  if (actor(game) !== human || game.winner) return selected
  const changed = !prev || prev.phase !== game.phase || prev.activePlayer !== game.activePlayer || actor(prev) !== human
  if (!changed) return selected
  const cur = selected ? game.units.find((u) => u.id === selected) : undefined
  if (cur && cur.owner === human && canActNow(game, cur)) return selected
  return actionableUnits(game, human)[0]?.id ?? selected
}

function loadSettings(): Settings {
  const def: Settings = { human: 'marines', opponent: 'orks', aiLevel: 'standard', explain: 'beginner', tutorial: true, scenarioId: 'training-outpost' }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? normalizeSettings({ ...def, ...JSON.parse(raw) }) : def
  } catch {
    return def
  }
}

/** Valid factions, different from each other, on a board that has both armies. */
export function normalizeSettings(s: Settings): Settings {
  const human = FACTIONS.includes(s.human) ? s.human : 'marines'
  let opponent = FACTIONS.includes(s.opponent) && s.opponent !== human ? s.opponent : human === 'orks' ? 'marines' : 'orks'
  if (opponent === human) opponent = FACTIONS.find((f) => f !== human)!
  const armies = parseArmies(s.armies)
  const sc = scenarioById(s.scenarioId)
  // own army lists play on a board that takes them (the Combat Patrol board)
  const custom = !!(armies[human] || armies[opponent])
  const scenarioId = sc.factions.includes(human) && sc.factions.includes(opponent) && (!custom || sc.customArmies) ? sc.id : 'combat-patrol'
  return { ...s, human, opponent, scenarioId, armies }
}

/** The army lists that play in a battle with these settings (only the two sides', only on a board that takes them). */
export function battleArmies(s: Settings): Partial<Record<PlayerId, ArmyList>> {
  if (!scenarioById(s.scenarioId).customArmies) return {}
  const out: Partial<Record<PlayerId, ArmyList>> = {}
  for (const f of [s.human, s.opponent]) if (s.armies?.[f]) out[f] = s.armies[f]
  return out
}

/** [west, east]: the lower faction in the standard order stands in the west (Marines vs Orks stays as it always was). */
export const sidesFor = (a: PlayerId, b: PlayerId): [PlayerId, PlayerId] => (FACTIONS.indexOf(a) <= FACTIONS.indexOf(b) ? [a, b] : [b, a])

const persistSettings = (s: Settings) => saveToStorage(SETTINGS_KEY, JSON.stringify(s))

function loadTutorialDone(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(TUTORIAL_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function savedLayouts(): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(TERRAIN_KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** Scenario state with the player's saved terrain layout (if valid) and the army lists. Throws when a list does not fit. */
function buildScenario(s: Settings): GameState {
  const sc = scenarioById(s.scenarioId)
  // the 44″×60″ boards change with the map, so a saved layout of the editor is not used there
  // nor on Combat Patrol when another layout than the original (A) is chosen
  const custom = sc.id === 'strike-force' || (sc.id === 'combat-patrol' && s.layoutId && s.layoutId !== 'A') ? null : parseLayout(savedLayouts()[sc.id])
  const g = sc.build(sidesFor(s.human, s.opponent), battleArmies(s), custom ?? undefined, { mapId: s.mapId, layoutId: s.layoutId, primary: s.primary })
  if (custom) g.terrain = custom
  if (sc.customArmies) {
    // open battle: both armies start in the deployment preset that suits them (the AI first, unaware of the player)
    const ai = other(g, s.human)
    applyPreset(g, ai, recommendedPreset(g, ai), false)
    applyPreset(g, s.human, recommendedPreset(g, s.human), true)
  }
  return g
}

/** `buildScenario`, or the reason it failed (shown on the start screen). */
function tryBuild(s: Settings): { game: GameState } | { error: string } {
  try {
    return { game: buildScenario(s) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

function saveLayout(scenarioId: string, terrain: Terrain[] | null) {
  const all = savedLayouts()
  if (terrain) all[scenarioId] = terrain
  else delete all[scenarioId]
  return saveToStorage(TERRAIN_KEY, JSON.stringify(all))
}

/** Deterministic from the (random) battle seed; chosen here, outside the pure match layer. */
const newGameId = (seed: number) => `g-${(seed >>> 0).toString(36)}`

/**
 * The match that belongs to `game`. If `game` was replaced from outside the pipeline (deployment, tests,
 * a changed human side) a fresh baseline match is built around it, keeping the game id.
 * A shared match is never rebuilt: its `state` is the only truth and cannot be swapped from the UI.
 */
function matchOf(game: GameState, match: MatchState | null, humanSetting: PlayerId): MatchState {
  if (match?.mode === 'shared') return match
  const human = sidesOf(game).includes(humanSetting) ? humanSetting : sidesOf(game)[0]
  if (match && match.state === game && match.assignments[human]?.type === 'local') return match
  return createMatch(game, soloAssignments(human, other(game, human)), { gameId: match?.gameId ?? newGameId(game.rng) })
}

const tutorialStartOf = (g: GameState): TutorialStart => ({ round: g.round, activePlayer: g.activePlayer, diceCount: g.diceLog.length })

export const useStore = create<Store>((set, get) => {
  /** The match whose next decision belongs to the AI, or null (no battle, setup, review, finished, or a human's turn). */
  const aiMatch = (): MatchState | null => {
    const { game, settings } = get()
    if (!game || get().deploying || get().review || game.winner) return null
    const m = matchOf(game, get().match, settings.human)
    return controllerOf(m).type === 'ai' ? m : null
  }
  /** Submit the AI's proposal (or force the end of the phase if it has none or seems stuck). */
  const applyAiProposal = (m: MatchState, p: { envelope: CommandEnvelope; decision: AiDecision } | null): boolean => {
    let env = p?.envelope
    if (!env || get().aiActionsThisTurn >= MAX_AI_ACTIONS_PER_TURN) {
      // safeguard against loops: force the phase to end if allowed (still through the same pipeline)
      env = nextEnvelope(m, controllerOf(m).playerId, { type: 'endPhase' })
      if (!validate(m.state, env.command).ok) return false
    }
    const ok = get().submit(env).ok
    if (ok && env.command.type !== 'endPhase' && p)
      set({ aiNotes: [...get().aiNotes, { id: Date.now() + Math.random(), text: p.decision.explanation }].slice(-30) })
    set({ aiActionsThisTurn: get().aiActionsThisTurn + 1, history: [] })
    return ok
  }
  return {
  game: null,
  shared: null,
  settings: loadSettings(),
  selectedUnitId: null,
  draft: {},
  groupDrag: true,
  measuring: false,
  measure: { a: null, b: null, range: 12 },
  message: null,
  match: null,
  history: [],
  aiNotes: [],
  aiActionsThisTurn: 0,
  aiThinking: false,
  tutorialDone: loadTutorialDone(),
  tutorialStart: { round: 1, activePlayer: 'marines', diceCount: 0 },
  deploying: null,
  deployHistory: [],
  aimTargetId: null,
  review: null,
  selectedTerrainId: null,
  layout: loadLayout(),
  shotOptions: { profiles: {}, usePistols: false, useAmmoRunts: false },
  moveOptions: { fly: false, swift: false },
  customTokens: loadTokens(),

  newGame: (patch = {}) => {
    if (get().shared) return // an online match is left through `leaveRoom`
    const settings = normalizeSettings({ ...get().settings, ...patch })
    persistSettings(settings)
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0
    const r = seededRoller(seed)
    const built = tryBuild(settings)
    if ('error' in built) return set({ settings, message: { text: built.error, kind: 'error' } })
    const game = startGame(built.game, r)
    const match = createMatch(game, soloAssignments(settings.human, settings.opponent), { gameId: newGameId(seed) })
    saveMatch(AUTOSAVE_KEY, match, settings.human)
    set({ game, match, settings, selectedUnitId: autoSelect(game, null, settings.human, null), draft: {}, history: [], aiNotes: [], message: null, deploying: null, deployHistory: [], review: null, aimTargetId: null, tutorialStart: tutorialStartOf(game), aiActionsThisTurn: 0, measure: { a: null, b: null, range: 12 } })
  },

  /** Guided setup: the human places their units, the AI army stands at the
   * scenario's default positions. Nothing is autosaved until the battle starts,
   * so an existing autosaved game is never replaced by a half-finished setup. */
  startDeployment: (patch = {}) => {
    if (get().shared) return // an online match is left through `leaveRoom`
    const settings = normalizeSettings({ ...get().settings, ...patch })
    persistSettings(settings)
    const built = tryBuild(settings)
    if ('error' in built) return set({ settings, message: { text: built.error, kind: 'error' } })
    const game = built.game
    const first = game.units.find((u) => u.owner === settings.human)?.id ?? null
    set({ game, match: null, settings, deploying: { placed: [] }, deployHistory: [], review: null, aimTargetId: null, selectedUnitId: first, draft: {}, history: [], aiNotes: [], message: null, groupDrag: true, measuring: false, aiActionsThisTurn: 0, measure: { a: null, b: null, range: 12 } })
  },

  placeUnit: (unitId) => {
    const { game, deploying, draft, deployHistory } = get()
    const unit = game?.units.find((u) => u.id === unitId)
    if (!game || !deploying || !unit || unit.owner !== get().settings.human) return false
    const why = deploymentProblem(game, unit, draft)
    if (why) {
      set({ message: { text: why, kind: 'error' } })
      return false
    }
    const next = structuredClone(game)
    for (const m of next.units.find((u) => u.id === unitId)!.models) if (draft[m.id]) m.pos = { ...draft[m.id] }
    const placed = [...new Set([...deploying.placed, unitId])]
    const nextUnplaced = next.units.find((u) => u.owner === get().settings.human && !placed.includes(u.id))
    set({ game: next, deploying: { placed }, deployHistory: [...deployHistory, { game, placed: deploying.placed }], draft: {}, message: null, selectedUnitId: nextUnplaced?.id ?? unitId })
    return true
  },

  autoDeploy: () => {
    const { game, deploying, settings } = get()
    if (!game || !deploying) return
    set({ draft: {} })
    for (const u of game.units) if (u.owner === settings.human && !deploying.placed.includes(u.id)) get().placeUnit(u.id)
  },

  deployPreset: (id) => {
    const { game, deploying, deployHistory, settings } = get()
    if (!game || !deploying) return
    const res = deployWithPreset(game, settings.human, id, true)
    const next = structuredClone(game)
    for (const u of next.units) if (u.owner === settings.human) for (const m of u.models) if (res.positions[m.id]) m.pos = { ...res.positions[m.id] }
    const placed = next.units.filter((u) => u.owner === settings.human).map((u) => u.id)
    set({
      game: next,
      deploying: { placed },
      deployHistory: [...deployHistory, { game, placed: deploying.placed }],
      draft: {},
      message: res.followed ? null : { text: 'Армия слишком плотная для этого построения: отряды стоят как можно теснее.', kind: 'info' },
    })
  },

  finishDeployment: () => {
    const { game, deploying, settings } = get()
    if (!game || !deploying) return false
    const issues = deploymentIssues(game, settings.human, deploying.placed)
    if (issues.length) {
      set({ message: { text: issues[0], kind: 'error' } })
      return false
    }
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0
    const started = startGame(game, seededRoller(seed))
    const match = createMatch(started, soloAssignments(settings.human, settings.opponent), { gameId: newGameId(seed) })
    saveMatch(AUTOSAVE_KEY, match, settings.human)
    set({ game: started, match, deploying: null, deployHistory: [], selectedTerrainId: null, draft: {}, history: [], message: null, selectedUnitId: autoSelect(started, null, settings.human, null), tutorialStart: tutorialStartOf(started) })
    return true
  },

  quit: () => set({ game: null, match: null, shared: null, settings: get().shared?.prevSettings ?? get().settings, selectedUnitId: null, draft: {}, history: [], deploying: null, deployHistory: [], review: null, aimTargetId: null }),

  submit: (env, opts) => {
    const { game, settings } = get()
    if (!game) return { ok: false, code: 'illegal', reason: 'Игра не начата.' }
    if (get().shared?.role === 'guest') return { ok: false, code: 'unauthorized', reason: 'Команды выполняет только хозяин комнаты.' }
    if (get().deploying) {
      const reason = 'Сначала завершите расстановку армии.'
      set({ message: { text: reason, kind: 'error' } })
      return { ok: false, code: 'illegal', reason }
    }
    const prev = matchOf(game, get().match, settings.human)
    const r = submitCommand(prev, env)
    if (!r.ok) {
      set(opts?.silent ? { match: prev } : { match: prev, message: { text: r.reason, kind: 'error' } })
      return r
    }
    get().commitAccepted(prev, r)
    return r
  },

  commitAccepted: (prev, r) => {
    const { settings, history } = get()
    const next = r.match.state
    // Undo policy lives in the match layer; here we only keep the snapshots.
    const undoable = isLocallyUndoable(r.action, r.match)
    const turnChanged = next.activePlayer !== prev.state.activePlayer
    const lastId = prev.state.diceLog.at(-1)?.id ?? 0
    const attacked = next.diceLog.some((d) => d.id > lastId && d.steps.some((x) => x.label === 'Попадание'))
    const review = attacked && settings.explain !== 'minimal' ? { afterId: lastId } : get().review
    const selectedUnitId = autoSelect(next, prev.state, settings.human, get().selectedUnitId)
    set({
      game: next,
      match: r.match,
      selectedUnitId,
      history: undoable ? [...history, prev].slice(-30) : [],
      draft: {},
      moveOptions: { fly: false, swift: false },
      message: null,
      aimTargetId: null,
      review,
      aiActionsThisTurn: turnChanged ? 0 : get().aiActionsThisTurn,
    })
    // single-player autosave, or (host only) the online match's own save; a guest saves nothing
    if (r.match.mode === 'shared') {
      if (get().shared?.role === 'host') saveMatch(MP_SAVE_KEY, r.match, settings.human)
    } else saveMatch(AUTOSAVE_KEY, r.match, settings.human)
  },

  startSharedHost: ({ scenarioId, hostSide, guestSide, hostArmy, guestArmy, assignments }) => {
    // each player's own list from the lobby (none = the training roster); own lists play on the Combat Patrol board
    const armies: Partial<Record<PlayerId, ArmyList>> = {}
    if (hostArmy) armies[hostSide] = hostArmy
    if (guestArmy) armies[guestSide] = guestArmy
    const settings = normalizeSettings({ ...get().settings, human: hostSide, opponent: guestSide, scenarioId, armies })
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0
    const game = startGame(buildScenario(settings), seededRoller(seed))
    const match = createMatch(game, assignments, { gameId: newGameId(seed), mode: 'shared' })
    get().installShared(match, 'host')
    saveMatch(MP_SAVE_KEY, match, hostSide)
    return match
  },

  installShared: (match, role, send = null) => {
    const prev = get().shared?.prevSettings ?? get().settings
    const me = localPlayerOf(match)
    const human = (Object.keys(match.assignments) as PlayerId[]).find((s) => match.assignments[s].playerId === me?.playerId) ?? sidesOf(match.state)[0]
    const settings: Settings = { ...prev, human, opponent: other(match.state, human), scenarioId: match.state.scenarioId, tutorial: false }
    const same = get().match?.gameId === match.gameId
    set({
      game: match.state, match, shared: { role, send, prevSettings: prev }, settings,
      selectedUnitId: same ? get().selectedUnitId : autoSelect(match.state, null, human, null),
      draft: {}, history: [], aiNotes: [], message: null, deploying: null, deployHistory: [], review: null, aimTargetId: null,
      tutorialStart: tutorialStartOf(match.state), aiActionsThisTurn: 0,
      ...(same ? {} : { measure: { a: null, b: null, range: 12 } }),
    })
  },

  dispatch: (cmd) => {
    const { game, settings } = get()
    if (!game) return false
    const m = matchOf(game, get().match, settings.human)
    const me = localPlayerOf(m)
    if (!me) return false
    const env = nextEnvelope(m, me.playerId, cmd)
    const shared = get().shared
    // a guest never applies anything: the host decides, the accepted action comes back
    if (shared?.role === 'guest') return !!shared.send && shared.send(env)
    return get().submit(env).ok
  },

  /** One AI decision; returns false when the deciding side is not AI-controlled. */
  aiStep: () => {
    const m = aiMatch()
    return m ? applyAiProposal(m, aiProposal(m, get().settings.aiLevel)) : false
  },

  aiStepAsync: async () => {
    if (get().aiThinking) return false
    const m = aiMatch()
    if (!m) return false
    const game = get().game
    set({ aiThinking: true })
    let decision: AiDecision | null
    try {
      decision = await decideAsync(m.state, get().settings.aiLevel)
    } finally {
      set({ aiThinking: false })
    }
    // the game moved on while the AI was thinking (undo, quit, a new battle): this answer is for an old state
    if (get().game !== game) return false
    const now = aiMatch()
    if (!now || now.state !== m.state) return false
    return applyAiProposal(now, decision && { envelope: nextEnvelope(now, controllerOf(now).playerId, decision.cmd), decision })
  },


  setAim: (aimTargetId) => set({ aimTargetId }),
  selectTerrain: (selectedTerrainId) => set({ selectedTerrainId }),
  toggleLayout: (key) => {
    const layout = { ...get().layout, [key]: !get().layout[key] }
    saveToStorage(LAYOUT_KEY, JSON.stringify(layout))
    set({ layout })
  },
  /** Setup only: replace the terrain layout (undoable) and remember it for this scenario. */
  editTerrain: (terrain) => {
    const { game, deploying, deployHistory } = get()
    if (!game || !deploying) return
    const next = { ...game, terrain }
    const ok = saveLayout(game.scenarioId, terrain)
    set({ game: next, deployHistory: [...deployHistory, { game, placed: deploying.placed }], message: ok ? null : { text: 'Не удалось запомнить раскладку: хранилище недоступно.', kind: 'error' } })
  },
  resetTerrain: () => {
    const g = get().game
    if (!g || !get().deploying) return
    saveLayout(g.scenarioId, null)
    get().editTerrain(scenarioById(g.scenarioId).build().terrain)
    saveLayout(g.scenarioId, null)
    set({ selectedTerrainId: null })
  },
  closeReview: () => set({ review: null }),
  select: (unitId) => set({ selectedUnitId: unitId, draft: {}, aimTargetId: null, shotOptions: { profiles: {}, usePistols: false, useAmmoRunts: false }, moveOptions: { fly: false, swift: false } }),
  setDraft: (positions) => set({ draft: { ...get().draft, ...positions } }),
  clearDraft: () => set({ draft: {} }),
  setGroupDrag: (v) => set({ groupDrag: v }),
  toggleMeasure: () => set({ measuring: !get().measuring, measure: { ...get().measure, a: null, b: null } }),
  setMeasurePoint: (p) => {
    const m = get().measure
    set({ measure: !m.a || m.b ? { ...m, a: p, b: null } : { ...m, b: p } })
  },
  setMeasureRange: (range) => set({ measure: { ...get().measure, range } }),
  clearMeasure: () => set({ measure: { ...get().measure, a: null, b: null } }),

  undo: () => {
    const dh = get().deployHistory
    if (get().deploying) {
      if (!dh.length) return
      const prev = dh[dh.length - 1]
      if (prev.game.terrain !== get().game?.terrain) saveLayout(prev.game.scenarioId, prev.game.terrain)
      set({ game: prev.game, deploying: { placed: prev.placed }, deployHistory: dh.slice(0, -1), draft: {}, message: { text: 'Расстановка отменена.', kind: 'info' } })
      return
    }
    const h = get().history
    if (!h.length) return
    const prev = h[h.length - 1]
    const cur = get().match
    if (cur && !undoTo(cur, prev)) {
      set({ message: { text: 'В общей партии принятые действия не отменяются.', kind: 'error' } })
      return
    }
    set({ game: prev.state, match: prev, history: h.slice(0, -1), draft: {}, message: { text: 'Действие отменено.', kind: 'info' } })
    saveMatch(AUTOSAVE_KEY, prev, get().settings.human)
  },

  save: () => {
    const g = get().game
    if (!g) return
    if (get().deploying) {
      set({ message: { text: 'Сохранение доступно после начала битвы.', kind: 'error' } })
      return
    }
    const shared = get().shared
    if (shared) {
      set({ message: shared.role === 'host' ? { text: 'Онлайн-партия сохраняется автоматически после каждого действия.', kind: 'info' } : { text: 'Партию сохраняет хозяин комнаты.', kind: 'info' } })
      return
    }
    const ok = saveMatch(MANUAL_KEY, matchOf(g, get().match, get().settings.human), get().settings.human)
    set({ message: ok ? { text: 'Игра сохранена.', kind: 'info' } : { text: 'Не удалось сохранить (хранилище недоступно).', kind: 'error' } })
  },

  load: (key = MANUAL_KEY) => {
    if (get().shared) {
      set({ message: { text: 'В онлайн-партии загрузка недоступна.', kind: 'error' } })
      return false
    }
    const r = deserialize(readStorage(key))
    if (!r.ok) {
      set({ message: { text: r.reason, kind: 'error' } })
      return false
    }
    const s = r.file.state
    const human = r.file.human && sidesOf(s).includes(r.file.human) ? r.file.human : get().settings.human
    const settings = sidesOf(s).includes(human) ? { ...get().settings, human, opponent: other(s, human) } : { ...get().settings, human: sidesOf(s)[0], opponent: sidesOf(s)[1] }
    set({ game: s, match: { ...r.file.match, state: s }, settings, selectedUnitId: autoSelect(s, null, settings.human, null), draft: {}, history: [], deploying: null, deployHistory: [], review: null, aimTargetId: null, aiActionsThisTurn: 0, message: { text: 'Игра загружена.', kind: 'info' } })
    return true
  },

  setSettings: (patch) => {
    const shared = get().shared
    if (shared) {
      // in an online match the sides and scenario are fixed; only preferences change, and the stored single-player setup is kept
      const { human: _h, opponent: _o, scenarioId: _s, ...rest } = patch
      const base = { ...shared.prevSettings, ...rest }
      persistSettings(base)
      set({ settings: { ...get().settings, ...rest }, shared: { ...shared, prevSettings: base } })
      return
    }
    const settings = normalizeSettings({ ...get().settings, ...patch })
    persistSettings(settings)
    set({ settings })
  },
  setMessage: (text, kind = 'info') => set({ message: text ? { text, kind } : null }),
  completeLesson: (id) => {
    const g = get().game
    const done = [...new Set([...get().tutorialDone, id])]
    saveToStorage(TUTORIAL_KEY, JSON.stringify(done))
    set({ tutorialDone: done, tutorialStart: g ? tutorialStartOf(g) : get().tutorialStart })
  },
  resetTutorial: () => {
    const g = get().game
    saveToStorage(TUTORIAL_KEY, '[]')
    set({ tutorialDone: [], tutorialStart: g ? tutorialStartOf(g) : get().tutorialStart })
  },
  setShotOptions: (o) => set({ shotOptions: { ...get().shotOptions, ...o } }),
  setMoveOptions: (o) => set({ moveOptions: { ...get().moveOptions, ...o }, draft: {} }),
  setCustomToken: (profileId, dataUrl) => {
    const next = { ...get().customTokens }
    if (dataUrl) next[profileId] = dataUrl
    else delete next[profileId]
    const ok = saveToStorage(TOKENS_KEY, JSON.stringify(next))
    set({ customTokens: next, message: ok ? null : { text: 'Не удалось сохранить фото: хранилище браузера заполнено.', kind: 'error' } })
    return ok
  },
}
})
