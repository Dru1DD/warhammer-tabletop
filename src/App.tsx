import { useEffect, useState } from 'react'
import { OnlineBanner, OnlineHeader, OnlineScreen } from './multiplayer/OnlineScreen'
import { joinRoom, leaveRoom, openOnlineMenu, parseRoomCode, savedGuestRoom, useMp } from './multiplayer/session'
import { FACTION_EMBLEM, FACTION_STYLE, tokenImageFor } from './assets/manifest'
import { FACTION_NAME } from './game/data/datasheets'
import { armyPoints, copyIndex, fmtPoints, POINTS_SOURCE, unitPoints } from './game/data/points'
import { actor } from './game/engine'
import { deserialize, readStorage } from './game/persistence'
import { SCENARIOS } from './game/scenarios/scenarios'
import { FACTIONS, type ExplainLevel, type PlayerId, type UnitState } from './game/types'
import { AI_STEP_MS, AUTOSAVE_KEY, MANUAL_KEY, useStore, type Settings } from './store'
import { ArmyBuilder } from './ui/ArmyBuilder'
import { armyUnits, battleListProblems } from './ui/armyUnits'
import { BattleOverDialog } from './ui/BattleOverDialog'
import { ReactionPrompt } from './ui/ReactionPrompt'
import { RerollPrompt } from './ui/RerollPrompt'
import { Board } from './ui/Board'
import { ActionPanel, AttackReview, BottomPanel, DiceFaces, RosterPanel } from './ui/Panels'
import { PanelBoundary } from './ui/PanelBoundary'
import { LEARNING_STYLE, learningStyleOf, type LearningStyle } from './ui/help'
import { scoreText } from './ui/score'
import { LOCALES, LOCALE_NAMES, locale, setLocale, tr, type Locale } from './i18n/index'

export default function App() {
  const game = useStore((s) => s.game)
  const onlineScreen = useMp((s) => s.screen)
  useAiLoop()
  useInviteLink()
  return game ? <GameScreen /> : onlineScreen !== 'none' ? <OnlineScreen /> : <StartScreen />
}

/** Opening `?room=CODE` (an invitation link) joins that room right away. */
function useInviteLink() {
  useEffect(() => {
    const raw = new URLSearchParams(location.search).get('room')
    if (!raw) return
    history.replaceState(null, '', location.pathname)
    const code = parseRoomCode(raw)
    const saved = savedGuestRoom()
    void joinRoom(raw, code && saved?.code === code ? saved.token : null)
  }, [])
}

/** Drives the AI one decision at a time so the player can follow along. Each decision is computed in a
 * Web Worker (`aiStepAsync`), so the page keeps responding while the AI thinks. */
function useAiLoop() {
  const game = useStore((s) => s.game)
  const human = useStore((s) => s.settings.human)
  const aiStep = useStore((s) => s.aiStepAsync)
  const paused = useStore((s) => !!s.deploying || !!s.review || !!s.shared)
  // slower AI for beginners so each enemy action can be followed
  const delay = useStore((s) => (s.settings.explain === 'beginner' ? AI_STEP_MS * 2 : AI_STEP_MS))
  useEffect(() => {
    if (!game || paused || game.winner || actor(game) === human) return
    const t = setTimeout(() => void aiStep(), delay)
    return () => clearTimeout(t)
  }, [game, human, aiStep, paused, delay])
}

const EXPLAIN: Record<ExplainLevel, string> = {
  beginner: tr('Beginner — explain everything'),
  standard: tr('Standard — decisions and restrictions'),
  minimal: tr('Minimum — results only'),
}

/** Lists the army of `faction`: unit, model count and cost (its army list, or the scenario's training roster). */
function ArmyList({ faction, army }: { faction: PlayerId; army: UnitState[] }) {
  const total = army.reduce((n, u) => n + u.models.length, 0)
  return (
    <ul className="mt-1 space-y-0.5 text-[11px] text-stone-300" aria-label={tr('Roster: {item}', { item: FACTION_NAME[faction] })}>
      {army.map((u) => {
        const cost = unitPoints(u.datasheetId, u.startingModels, copyIndex(army, u))
        return (
          <li key={u.id}>
            {u.name} <span className="text-stone-400">× {u.models.length}</span>{' '}
            <span className="text-stone-500" title={cost.exact ? undefined : tr('This unit size is not in the Munitorum Field Manual — the cost was recalculated per model')}>
              · {fmtPoints(cost)}
            </span>
          </li>
        )
      })}
      <li className="text-stone-400">{tr('Total models: {total}', { total })}</li>
      <li className="font-semibold text-amber-200">{tr('Army cost: {fmtPoints}', { fmtPoints: fmtPoints(armyPoints(army)) })}</li>
    </ul>
  )
}

/** Compares the two armies' points so a lopsided pairing is visible before the battle. */
function PointsMatchup({ settings }: { settings: Settings }) {
  const { human, opponent } = settings
  const mine = armyUnits(settings, human)
  const theirs = armyUnits(settings, opponent)
  const a = armyPoints(mine)
  const b = armyPoints(theirs)
  const ratio = Math.max(a.points, b.points) / Math.max(1, Math.min(a.points, b.points))
  const lopsided = ratio >= 1.25
  return (
    <p className={`mt-3 rounded p-2 text-xs ${lopsided ? 'bg-amber-950 text-amber-200' : 'bg-stone-900 text-stone-300'}`} aria-label={tr('Army points balance')}>
      {FACTION_NAME[human]}: <b>{fmtPoints(a)}</b> {tr('vs {item}:', { item: FACTION_NAME[opponent] })} <b>{fmtPoints(b)}</b>
      {lopsided && <> {tr('— about {toFixed}× advantage, the battle will be uneven.', { toFixed: ratio.toFixed(1) })}</>}
      <span className="block text-[10px] text-stone-500">
        {tr('Approximate, per {name} from {updated}. “≈” — the unit size is not from the handbook, the cost was recalculated per model.', { name: POINTS_SOURCE.name, updated: POINTS_SOURCE.updated })}
      </span>
    </p>
  )
}

function StartScreen() {
  const st = useStore()
  const { human, opponent, scenarioId } = st.settings
  const auto = deserialize(readStorage(AUTOSAVE_KEY))
  const manual = deserialize(readStorage(MANUAL_KEY))
  const both = (s: (typeof SCENARIOS)[number]) => s.factions.includes(human) && s.factions.includes(opponent)
  const lists = !!(st.settings.armies?.[human] || st.settings.armies?.[opponent])
  const playable = (s: (typeof SCENARIOS)[number]) => both(s) && (!lists || !!s.customArmies)
  const listIssues = battleListProblems(st.settings)
  return (
    <div className="min-h-full bg-stone-900 p-4 text-stone-100">
      <div className="mx-auto max-w-5xl rounded-lg border border-stone-700 bg-stone-800 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{tr('Tabletop Trainer 40K')}</h1>
          <label className="flex shrink-0 items-center gap-2 text-sm text-stone-400">
            {tr('Language')}
            <select className="input !mt-0 !w-auto" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-1 text-sm text-stone-400">
          {tr('A training simulator for the Warhammer 40,000 rules (11th edition). Six armies: Space Marines, Orks, Tyranids, Necrons, Aeldari, Adeptus Mechanicus. An unofficial hobby project.')}
        </p>

        {auto.ok && !auto.file.state.winner && (
          <button className="btn btn-primary mt-4 w-full" onClick={() => st.load(AUTOSAVE_KEY)}>
            {tr('▶ Continue the battle (round {round}, {toLocaleString})', { round: auto.file.state.round, toLocaleString: new Date(auto.file.savedAt).toLocaleString(locale) })}
          </button>
        )}

        <h2 className="mt-5 font-semibold">{tr('Your army')}</h2>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FACTIONS.map((p) => {
            const army = armyUnits(st.settings, p)
            const faces = [...new Set(army.flatMap((u) => u.models.map((m) => m.profileId)))].slice(0, 4)
            return (
              <button
                key={p}
                onClick={() => st.setSettings({ human: p })}
                aria-pressed={human === p}
                className={`flex flex-col items-start justify-start rounded-lg border-2 p-3 text-left ${human === p ? 'border-yellow-400' : 'border-stone-600'}`}
                style={{ background: FACTION_STYLE[p].primary + '55' }}
              >
                <div className="mb-2 flex items-center gap-3">
                  {FACTION_EMBLEM[p] && <img src={FACTION_EMBLEM[p]} alt="" className="h-12 w-12 shrink-0 rounded-full border-2 border-amber-500" />}
                  <div className="flex -space-x-3">
                    {faces.map((id) => (
                      <img key={id} src={tokenImageFor(id, st.customTokens)} alt="" className="h-10 w-10 rounded-full border-2 border-stone-900" />
                    ))}
                  </div>
                </div>
                <div className="font-semibold">{FACTION_NAME[p]}</div>
                <ArmyList faction={p} army={army} />
              </button>
            )
          })}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">{tr('Opponent (computer-controlled)')}
            <select className="input" value={opponent} onChange={(e) => st.setSettings({ opponent: e.target.value as PlayerId })}>
              {FACTIONS.filter((f) => f !== human).map((f) => <option key={f} value={f}>{tr('{item} (AI)', { item: FACTION_NAME[f] })}</option>)}
            </select>
          </label>
          <label className="text-sm">{tr('Scenario')}
            <select className="input" value={scenarioId} onChange={(e) => st.setSettings({ scenarioId: e.target.value })}>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id} disabled={!playable(s)}>
                  {s.name}{!both(s) ? tr(' — no armies for this pair') : !playable(s) ? tr(' — own rosters only in “Combat Patrol”') : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">{tr('AI level')}
            <select className="input" value={st.settings.aiLevel} onChange={(e) => st.setSettings({ aiLevel: e.target.value as never })}>
              <option value="beginner">{tr('Beginner — simple priorities')}</option>
              <option value="standard">{tr('Standard — tactical evaluation')}</option>
            </select>
          </label>
        </div>
        <h2 className="mt-5 font-semibold">{tr('Army rosters')}</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <ArmyBuilder faction={human} role={tr('Your army')} />
          <ArmyBuilder faction={opponent} role={tr('Opponent (AI)')} />
        </div>
        <PointsMatchup settings={st.settings} />
        <LearningStylePicker />
        <p className="mt-3 rounded bg-stone-900 p-2 text-xs text-stone-300">
          {SCENARIOS.find((s) => s.id === scenarioId)?.description}
          <br />
          <span className="text-amber-300">{SCENARIOS.find((s) => s.id === scenarioId)?.victory}</span>
        </p>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary flex-1" disabled={listIssues.length > 0} title={listIssues[0] ?? ''} onClick={() => st.startDeployment()}>{tr('Start a new battle')}</button>
          <button className="btn" disabled={!manual.ok} onClick={() => st.load(MANUAL_KEY)} title={manual.ok ? '' : manual.reason}>{tr('Load a save')}</button>
        </div>
        <button className="btn mt-2 w-full" onClick={() => openOnlineMenu()}>{tr('🌐 Play online together')}</button>
        <p className="mt-2 text-xs text-stone-400">
          {tr('First you will place your army in your zone, then round 1 begins. ')}
          <button className="text-sky-300 underline disabled:text-stone-500 disabled:no-underline" disabled={listIssues.length > 0} onClick={() => st.newGame()}>{tr('Quick start')}</button> {tr('— straight into battle, units at standard positions.')}
        </p>
        {listIssues.length > 0 && <p className="mt-2 text-sm text-rose-300">{tr('Fix the army roster to start: {item}', { item: listIssues[0] })}</p>}
        {st.message && <p className="mt-2 text-sm text-rose-300">{st.message.text}</p>}
      </div>
    </div>
  )
}

function LearningStylePicker() {
  const st = useStore()
  const cur = learningStyleOf(st.settings)
  return (
    <fieldset className="mt-3">
      <legend className="text-sm">{tr('Learning style')}</legend>
      <div className="mt-1 grid gap-1 sm:grid-cols-3">
        {(Object.keys(LEARNING_STYLE) as LearningStyle[]).map((k) => (
          <label key={k} className={`cursor-pointer rounded border p-2 text-xs ${cur === k ? 'border-yellow-400 bg-stone-700' : 'border-stone-600'}`}>
            <input type="radio" name="learning-style" className="mr-1" checked={cur === k} onChange={() => st.setSettings(LEARNING_STYLE[k].settings)} />
            <b>{LEARNING_STYLE[k].label}</b>
            <span className="block text-stone-400">{LEARNING_STYLE[k].hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function GameScreen() {
  const st = useStore()
  const game = st.game!
  const [settingsOpen, setSettingsOpen] = useState(false)
  // dialog dismissed for this exact finished game object; any new/loaded game re-arms it
  const [overClosedFor, setOverClosedFor] = useState<typeof game | null>(null)
  const lastDice = game.diceLog.at(-1)
  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] bg-stone-900 text-stone-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-stone-700 bg-stone-950 px-3 py-2">
        <h1 className="mr-2 font-bold"><span className="hidden 2xl:inline">{tr('Tabletop Trainer')} </span>40K</h1>
        {st.deploying ? (
          <span className="rounded bg-yellow-600 px-2 py-0.5 text-sm font-semibold text-black">{tr('Setup: army placement')}</span>
        ) : (
          <>
            <span className="rounded bg-stone-800 px-2 py-0.5 text-sm">{tr('Round {round}/{maxRounds}', { round: game.round, maxRounds: game.maxRounds })}</span>
            <span className="rounded px-2 py-0.5 text-sm" style={{ background: FACTION_STYLE[game.activePlayer].primary }}>
              {tr('Turn: {item}', { item: FACTION_NAME[game.activePlayer] })}
            </span>
          </>
        )}
        <OnlineHeader />
        <span className="text-sm text-stone-300">{tr('VP: {scoreText}', { scoreText: scoreText(game) })}</span>
        {game.players.orks?.riledTurns > 0 && <span className="rounded bg-red-800 px-2 py-0.5 text-xs">WAAAGH!</span>}
        {game.players.adeptus_mechanicus?.imperative && <span className="rounded bg-amber-800 px-2 py-0.5 text-xs" title={tr('Adeptus Mechanicus army Imperative doctrine')}>{game.players.adeptus_mechanicus.imperative === 'protector' ? tr('Protector') : tr('Conqueror')}</span>}
        <div className="ml-auto flex flex-wrap gap-1">
          {/* icons only on laptop widths; labels from 1536px */}
          <button className={`btn ${st.measuring ? 'btn-primary' : ''}`} onClick={() => st.toggleMeasure()} aria-pressed={st.measuring} title={tr('Ruler (R)')} aria-label={tr('Ruler')}>📏<span className="hidden 2xl:inline"> {tr('Ruler')}</span></button>
          <button className="btn" disabled={!!st.deploying} onClick={() => st.save()} title={tr('Save')} aria-label={tr('Save')}>💾<span className="hidden 2xl:inline"> {tr('Save')}</span></button>
          <button className="btn" disabled={!!st.shared} onClick={() => st.load()} title={tr('Load')} aria-label={tr('Load')}>📂<span className="hidden 2xl:inline"> {tr('Load')}</span></button>
          {game.winner && <button className="btn" onClick={() => setOverClosedFor(null)} title={tr('Battle results')} aria-label={tr('Results')}>🏆<span className="hidden 2xl:inline"> {tr('Results')}</span></button>}
          <button className="btn" onClick={() => setSettingsOpen(true)} title={tr('Settings')} aria-label={tr('Settings')}>⚙<span className="hidden 2xl:inline"> {tr('Settings')}</span></button>
          <button className="btn" onClick={() => (st.shared ? window.confirm(tr('Leave the online game? Your opponent will see that you disconnected.')) && leaveRoom() : st.quit())} title={st.shared ? tr('Leave the game') : tr('Main menu')} aria-label={tr('Menu')}>☰<span className="hidden 2xl:inline"> {tr('Menu')}</span></button>
        </div>
      </header>

      <main className={`grid min-h-0 grid-cols-1 overflow-y-auto md:grid-cols-2 lg:overflow-hidden ${st.layout.roster ? 'lg:grid-cols-[240px_1fr_270px] 2xl:grid-cols-[300px_1fr_320px]' : 'lg:grid-cols-[60px_1fr_280px] 2xl:grid-cols-[60px_1fr_320px]'}`}>
        <aside className="order-2 border-r border-stone-700 p-2 lg:order-1 lg:overflow-y-auto"><PanelBoundary name={tr('Units')} resetKey={st.selectedUnitId}><RosterPanel /></PanelBoundary></aside>
        <section className="relative order-1 h-[60vh] min-w-0 overflow-hidden md:col-span-2 lg:order-2 lg:col-span-1 lg:h-auto">
          <Board />
          <OnlineBanner />
          {st.measuring && <MeasureBar />}
          {lastDice && !st.review && <DiceToast key={lastDice.id} entryId={lastDice.id} />}
          <AttackReview />
          {st.message && (
            <div className={`absolute left-1/2 top-24 z-[2] max-w-md -translate-x-1/2 rounded px-3 py-2 text-sm shadow ${st.message.kind === 'error' ? 'bg-rose-900' : 'bg-stone-700'}`} role="status">
              {st.message.text} <button className="ml-2 text-stone-300" onClick={() => st.setMessage(null)} aria-label={tr('Close')}>✕</button>
            </div>
          )}
        </section>
        <aside className="order-3 border-l border-stone-700 p-2 lg:overflow-y-auto"><PanelBoundary name={tr('Actions')} resetKey={st.selectedUnitId}><ActionPanel /></PanelBoundary></aside>
      </main>

      <footer className={`${st.layout.log ? 'h-48' : ''} border-t border-stone-700 p-2`}><PanelBoundary name={tr('Log')}><BottomPanel /></PanelBoundary></footer>
      {game.winner && !st.deploying && overClosedFor !== game && (
        <BattleOverDialog game={{ ...game, winner: game.winner }} human={st.settings.human} onClose={() => setOverClosedFor(game)} onNewBattle={() => (st.shared ? leaveRoom() : st.startDeployment())} />
      )}
      {game.reaction?.player === st.settings.human && !game.winner && !st.review && <ReactionPrompt game={game} human={st.settings.human} />}
      {game.pendingReroll?.player === st.settings.human && !game.winner && !st.review && <RerollPrompt game={game} human={st.settings.human} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function MeasureBar() {
  const st = useStore()
  return (
    <div className="absolute left-2 top-2 flex items-center gap-2 rounded bg-black/70 px-2 py-1 text-xs">
      <span>{tr('Ruler: click two points or models (from the base edge).')}</span>
      <label>{tr('Check range')}
        <input className="ml-1 w-12 rounded bg-stone-700 px-1" type="number" min={1} max={72} value={st.measure.range} onChange={(e) => st.setMeasureRange(Number(e.target.value) || 1)} />″
      </label>
      <button className="btn" onClick={() => st.clearMeasure()}>{tr('Reset')}</button>
    </div>
  )
}

function DiceToast({ entryId }: { entryId: number }) {
  const entry = useStore((s) => s.game?.diceLog.find((d) => d.id === entryId))
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4500)
    return () => clearTimeout(t)
  }, [])
  if (!visible || !entry) return null
  return (
    <div className="absolute bottom-16 left-2 z-[1] max-w-xs rounded bg-black/80 p-2 text-xs shadow-lg" onClick={() => setVisible(false)} title={tr('Click to hide')}>
      <div className="mb-1 font-semibold">🎲 {entry.title}</div>
      <DiceFaces entry={entry} />
    </div>
  )
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const st = useStore()
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-80 rounded-lg bg-stone-800 p-4" role="dialog" aria-label={tr('Settings')} onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 font-semibold">{tr('Settings')}</h2>
        <label className="block text-sm">{tr('Explanations')}
          <select className="input" value={st.settings.explain} onChange={(e) => st.setSettings({ explain: e.target.value as ExplainLevel })}>
            {Object.entries(EXPLAIN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {!st.shared && (
          <label className="mt-2 block text-sm">{tr('AI level')}
            <select className="input" value={st.settings.aiLevel} onChange={(e) => st.setSettings({ aiLevel: e.target.value as never })}>
              <option value="beginner">{tr('Beginner')}</option>
              <option value="standard">{tr('Standard')}</option>
            </select>
          </label>
        )}
        <LearningStylePicker />
        {st.tutorialDone.length > 0 && <button className="mt-1 text-xs text-sky-300 underline" onClick={() => st.resetTutorial()}>{tr('Redo the tutorial')}</button>}
        <button className="btn btn-primary mt-3 w-full" onClick={onClose}>{tr('Done')}</button>
      </div>
    </div>
  )
}
