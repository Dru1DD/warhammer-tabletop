import { create } from 'zustand'
import { decide, type AiLevel } from './game/ai/ai'
import { seededRoller } from './game/dice/dice'
import { actor, apply, startGame, validate } from './game/engine'
import { deserialize, readStorage, saveToStorage, serialize } from './game/persistence'
import { scenarioById } from './game/scenarios/scenarios'
import type { Command, ExplainLevel, GameState, PlayerId, Vec } from './game/types'
import type { TutorialStart } from './ui/help'
import { actionableUnits, canActNow } from './ui/guidance'

export const AUTOSAVE_KEY = 'wh40k-training-autosave'
export const MANUAL_KEY = 'wh40k-training-save'
const SETTINGS_KEY = 'wh40k-training-settings'
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
  tutorialStep: number
  tutorialStart: TutorialStart
  shotOptions: { profiles: Record<string, number>; usePistols: boolean; useAmmoRunts: boolean }
  /** user photos per model profile (data URLs), kept only in this browser */
  customTokens: Record<string, string>

  newGame: (s?: Partial<Settings>) => void
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
  setTutorialStep: (n: number) => void
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
  tutorialStep: 0,
  tutorialStart: { round: 1, activePlayer: 'marines', diceCount: 0 },
  shotOptions: { profiles: {}, usePistols: false, useAmmoRunts: false },
  customTokens: loadTokens(),

  newGame: (patch = {}) => {
    const settings = { ...get().settings, ...patch }
    persistSettings(settings)
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0
    const r = seededRoller(seed)
    const game = startGame(scenarioById(settings.scenarioId).build(), r)
    saveToStorage(AUTOSAVE_KEY, serialize(game, settings.human))
    set({ game, settings, selectedUnitId: autoSelect(game, null, settings.human, null), draft: {}, history: [], aiNotes: [], message: null, tutorialStep: 0, tutorialStart: { round: game.round, activePlayer: game.activePlayer, diceCount: game.diceLog.length }, aiActionsThisTurn: 0, measure: { a: null, b: null, range: 12 } })
  },

  quit: () => set({ game: null, selectedUnitId: null, draft: {}, history: [] }),

  dispatch: (cmd) => {
    const { game, history } = get()
    if (!game) return false
    const v = validate(game, cmd)
    if (!v.ok) {
      set({ message: { text: v.reason, kind: 'error' } })
      return false
    }
    const next = apply(game, cmd, seededRoller(game.rng))
    // Undo is only safe for commands that rolled no dice and when control stays with the human.
    const undoable = next.rng === game.rng && actor(next) === get().settings.human && cmd.type !== 'endPhase'
    const turnChanged = next.activePlayer !== game.activePlayer
    const selectedUnitId = autoSelect(next, game, get().settings.human, get().selectedUnitId)
    set({
      game: next,
      selectedUnitId,
      history: undoable ? [...history, game].slice(-30) : [],
      draft: {},
      message: null,
      aiActionsThisTurn: turnChanged ? 0 : get().aiActionsThisTurn,
    })
    saveToStorage(AUTOSAVE_KEY, serialize(next, get().settings.human))
    return true
  },

  /** One AI decision; returns false when it is not the AI's turn. */
  aiStep: () => {
    const { game, settings, aiActionsThisTurn, aiNotes } = get()
    if (!game || game.winner || actor(game) === settings.human) return false
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

  select: (unitId) => set({ selectedUnitId: unitId, draft: {}, shotOptions: { profiles: {}, usePistols: false, useAmmoRunts: false } }),
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
    const h = get().history
    if (!h.length) return
    const prev = h[h.length - 1]
    set({ game: prev, history: h.slice(0, -1), draft: {}, message: { text: 'Действие отменено.', kind: 'info' } })
    saveToStorage(AUTOSAVE_KEY, serialize(prev, get().settings.human))
  },

  save: () => {
    const g = get().game
    if (!g) return
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
    set({ game: s, settings, selectedUnitId: autoSelect(s, null, settings.human, null), draft: {}, history: [], aiActionsThisTurn: 0, message: { text: 'Игра загружена.', kind: 'info' } })
    return true
  },

  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    persistSettings(settings)
    set({ settings })
  },
  setMessage: (text, kind = 'info') => set({ message: text ? { text, kind } : null }),
  setTutorialStep: (n) => {
    const g = get().game
    set({ tutorialStep: n, tutorialStart: g ? { round: g.round, activePlayer: g.activePlayer, diceCount: g.diceLog.length } : get().tutorialStart })
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
