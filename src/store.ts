import { create } from 'zustand'
import { decide, type AiLevel } from './game/ai/ai'
import { seededRoller } from './game/dice/dice'
import { actor, apply, startGame, validate } from './game/engine'
import { deserialize, readStorage, saveToStorage, serialize } from './game/persistence'
import { scenarioById } from './game/scenarios/scenarios'
import { deploymentIssues, deploymentProblem } from './game/rules/deployment'
import { parseLayout } from './game/terrainLayout'
import type { Command, ExplainLevel, GameState, PlayerId, Terrain, Vec } from './game/types'
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
export const TOKENS_KEY = 'wh40k-training-tokens'
const MAX_AI_ACTIONS_PER_TURN = 150
export const AI_STEP_MS = 550

export interface Settings {
  human: PlayerId
  aiLevel: AiLevel
  explain: ExplainLevel
  tutorial: boolean
  scenarioId: string
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

interface Store {
  game: GameState | null
  settings: Settings
  selectedUnitId: string | null
  draft: Record<string, Vec>
  groupDrag: boolean
  measuring: boolean
  measure: { a: MeasurePoint | null; b: MeasurePoint | null; range: number }
  message: { text: string; kind: 'error' | 'info' } | null
  history: GameState[]
  aiNotes: AiNote[]
  aiActionsThisTurn: number
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
  /** user photos per model profile (data URLs), kept only in this browser */
  customTokens: Record<string, string>

  newGame: (s?: Partial<Settings>) => void
  startDeployment: (s?: Partial<Settings>) => void
  placeUnit: (unitId: string) => boolean
  autoDeploy: () => void
  finishDeployment: () => boolean
  quit: () => void
  dispatch: (cmd: Command) => boolean
  aiStep: () => boolean
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
  const def: Settings = { human: 'marines', aiLevel: 'standard', explain: 'beginner', tutorial: true, scenarioId: 'training-outpost' }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...def, ...JSON.parse(raw) } : def
  } catch {
    return def
  }
}

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

/** Scenario state with the player's saved terrain layout (if valid). */
function buildScenario(scenarioId: string): GameState {
  const g = scenarioById(scenarioId).build()
  const custom = parseLayout(savedLayouts()[g.scenarioId])
  if (custom) g.terrain = custom
  return g
}

function saveLayout(scenarioId: string, terrain: Terrain[] | null) {
  const all = savedLayouts()
  if (terrain) all[scenarioId] = terrain
  else delete all[scenarioId]
  return saveToStorage(TERRAIN_KEY, JSON.stringify(all))
}

const tutorialStartOf = (g: GameState): TutorialStart => ({ round: g.round, activePlayer: g.activePlayer, diceCount: g.diceLog.length })

export const useStore = create<Store>((set, get) => ({
  game: null,
  settings: loadSettings(),
  selectedUnitId: null,
  draft: {},
  groupDrag: true,
  measuring: false,
  measure: { a: null, b: null, range: 12 },
  message: null,
  history: [],
  aiNotes: [],
  aiActionsThisTurn: 0,
  tutorialDone: loadTutorialDone(),
  tutorialStart: { round: 1, activePlayer: 'marines', diceCount: 0 },
  deploying: null,
  deployHistory: [],
  aimTargetId: null,
  review: null,
  selectedTerrainId: null,
  layout: loadLayout(),
  shotOptions: { profiles: {}, usePistols: false, useAmmoRunts: false },
  customTokens: loadTokens(),

  newGame: (patch = {}) => {
    const settings = { ...get().settings, ...patch }
    persistSettings(settings)
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0
    const r = seededRoller(seed)
    const game = startGame(buildScenario(settings.scenarioId), r)
    saveToStorage(AUTOSAVE_KEY, serialize(game, settings.human))
    set({ game, settings, selectedUnitId: autoSelect(game, null, settings.human, null), draft: {}, history: [], aiNotes: [], message: null, deploying: null, deployHistory: [], review: null, aimTargetId: null, tutorialStart: tutorialStartOf(game), aiActionsThisTurn: 0, measure: { a: null, b: null, range: 12 } })
  },

  /** Guided setup: the human places their units, the AI army stands at the
   * scenario's default positions. Nothing is autosaved until the battle starts,
   * so an existing autosaved game is never replaced by a half-finished setup. */
  startDeployment: (patch = {}) => {
    const settings = { ...get().settings, ...patch }
    persistSettings(settings)
    const game = buildScenario(settings.scenarioId)
    const first = game.units.find((u) => u.owner === settings.human)?.id ?? null
    set({ game, settings, deploying: { placed: [] }, deployHistory: [], review: null, aimTargetId: null, selectedUnitId: first, draft: {}, history: [], aiNotes: [], message: null, groupDrag: true, measuring: false, aiActionsThisTurn: 0, measure: { a: null, b: null, range: 12 } })
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
    saveToStorage(AUTOSAVE_KEY, serialize(started, settings.human))
    set({ game: started, deploying: null, deployHistory: [], selectedTerrainId: null, draft: {}, history: [], message: null, selectedUnitId: autoSelect(started, null, settings.human, null), tutorialStart: tutorialStartOf(started) })
    return true
  },

  quit: () => set({ game: null, selectedUnitId: null, draft: {}, history: [], deploying: null, deployHistory: [], review: null, aimTargetId: null }),

  dispatch: (cmd) => {
    const { game, history } = get()
    if (!game) return false
    if (get().deploying) {
      set({ message: { text: 'Сначала завершите расстановку армии.', kind: 'error' } })
      return false
    }
    const v = validate(game, cmd)
    if (!v.ok) {
      set({ message: { text: v.reason, kind: 'error' } })
      return false
    }
    const next = apply(game, cmd, seededRoller(game.rng))
    // Undo is only safe for commands that rolled no dice and when control stays with the human.
    const undoable = next.rng === game.rng && actor(next) === get().settings.human && cmd.type !== 'endPhase'
    const turnChanged = next.activePlayer !== game.activePlayer
    const lastId = game.diceLog.at(-1)?.id ?? 0
    const attacked = next.diceLog.some((d) => d.id > lastId && d.steps.some((x) => x.label === 'Попадание'))
    const review = attacked && get().settings.explain !== 'minimal' ? { afterId: lastId } : get().review
    const selectedUnitId = autoSelect(next, game, get().settings.human, get().selectedUnitId)
    set({
      game: next,
      selectedUnitId,
      history: undoable ? [...history, game].slice(-30) : [],
      draft: {},
      message: null,
      aimTargetId: null,
      review,
      aiActionsThisTurn: turnChanged ? 0 : get().aiActionsThisTurn,
    })
    saveToStorage(AUTOSAVE_KEY, serialize(next, get().settings.human))
    return true
  },

  /** One AI decision; returns false when it is not the AI's turn. */
  aiStep: () => {
    const { game, settings, aiActionsThisTurn, aiNotes } = get()
    if (!game || get().deploying || get().review || game.winner || actor(game) === settings.human) return false
    let d = decide(game, settings.aiLevel)
    if (!d || aiActionsThisTurn >= MAX_AI_ACTIONS_PER_TURN) {
      // safeguard against loops: force the phase to end if allowed
      d = { cmd: { type: 'endPhase' }, explanation: 'ИИ: превышен лимит действий — фаза завершается.' }
      if (!validate(game, d.cmd).ok) return false
    }
    const ok = get().dispatch(d.cmd)
    if (ok && d.cmd.type !== 'endPhase')
      set({ aiNotes: [...aiNotes, { id: Date.now() + Math.random(), text: d.explanation }].slice(-30) })
    set({ aiActionsThisTurn: get().aiActionsThisTurn + 1, history: [] })
    return ok
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
  select: (unitId) => set({ selectedUnitId: unitId, draft: {}, aimTargetId: null, shotOptions: { profiles: {}, usePistols: false, useAmmoRunts: false } }),
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
    set({ game: prev, history: h.slice(0, -1), draft: {}, message: { text: 'Действие отменено.', kind: 'info' } })
    saveToStorage(AUTOSAVE_KEY, serialize(prev, get().settings.human))
  },

  save: () => {
    const g = get().game
    if (!g) return
    if (get().deploying) {
      set({ message: { text: 'Сохранение доступно после начала битвы.', kind: 'error' } })
      return
    }
    const ok = saveToStorage(MANUAL_KEY, serialize(g, get().settings.human))
    set({ message: ok ? { text: 'Игра сохранена.', kind: 'info' } : { text: 'Не удалось сохранить (хранилище недоступно).', kind: 'error' } })
  },

  load: (key = MANUAL_KEY) => {
    const r = deserialize(readStorage(key))
    if (!r.ok) {
      set({ message: { text: r.reason, kind: 'error' } })
      return false
    }
    const s = r.file.state
    const settings = r.file.human ? { ...get().settings, human: r.file.human } : get().settings
    set({ game: s, settings, selectedUnitId: autoSelect(s, null, settings.human, null), draft: {}, history: [], deploying: null, deployHistory: [], review: null, aimTargetId: null, aiActionsThisTurn: 0, message: { text: 'Игра загружена.', kind: 'info' } })
    return true
  },

  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
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
  setCustomToken: (profileId, dataUrl) => {
    const next = { ...get().customTokens }
    if (dataUrl) next[profileId] = dataUrl
    else delete next[profileId]
    const ok = saveToStorage(TOKENS_KEY, JSON.stringify(next))
    set({ customTokens: next, message: ok ? null : { text: 'Не удалось сохранить фото: хранилище браузера заполнено.', kind: 'error' } })
    return ok
  },
}))
