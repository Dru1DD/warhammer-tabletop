import { useEffect, useState } from 'react'
import { OnlineBanner, OnlineHeader, OnlineScreen } from './multiplayer/OnlineScreen'
import { joinRoom, leaveRoom, openOnlineMenu, parseRoomCode, savedGuestRoom, useMp } from './multiplayer/session'
import { FACTION_EMBLEM, FACTION_STYLE, tokenImageFor } from './assets/manifest'
import { FACTION_NAME } from './game/data/datasheets'
import { armyPoints, copyIndex, fmtPoints, POINTS_SOURCE, unitPoints } from './game/data/points'
import { actor } from './game/engine'
import { deserialize, readStorage } from './game/persistence'
import { mapLine, SCENARIOS } from './game/scenarios/scenarios'
import { missionName, PRIMARY, PRIMARY_IDS } from './game/rules/missions'
import { FIXED_IDS, SECONDARY } from './game/rules/secondaries'
import type { SecondaryId } from './game/types'
import { FACTIONS, type ExplainLevel, type PlayerId, type UnitState } from './game/types'
import { AI_STEP_MS, AUTOSAVE_KEY, MANUAL_KEY, useStore, type Settings } from './store'
import { ArmyBuilder } from './ui/ArmyBuilder'
import { LAYOUT_IDS, LAYOUT_NAME, MAP_IDS, MAPS, PATROL_LAYOUT_NAME } from './game/scenarios/strikeForce'
import { armyUnits, battleListProblems } from './ui/armyUnits'
import { BattleOverDialog } from './ui/BattleOverDialog'
import { ReactionPrompt } from './ui/ReactionPrompt'
import { ChargeConfirm } from './ui/ChargeConfirm'
import { RerollPrompt } from './ui/RerollPrompt'
import { HyperAdaptationPrompt } from './ui/HyperAdaptationPrompt'
import { hyperPending } from './game/engine'
import { DOCTRINE_NAME, HYPER_NAME } from './game/rules/detachments'
import { Board } from './ui/Board'
import { ActionPanel, AttackReview, BottomPanel, DiceFaces, RosterPanel } from './ui/Panels'
import { PanelBoundary } from './ui/PanelBoundary'
import { LEARNING_STYLE, learningStyleOf, type LearningStyle } from './ui/help'
import { scoreText } from './ui/score'

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
  beginner: 'Новичок — объяснять всё',
  standard: 'Стандарт — решения и ограничения',
  minimal: 'Минимум — только результаты',
}

/** Lists the army of `faction`: unit, model count and cost (its army list, or the scenario's training roster). */
function ArmyList({ faction, army }: { faction: PlayerId; army: UnitState[] }) {
  const total = army.reduce((n, u) => n + u.models.length, 0)
  return (
    <ul className="mt-1 space-y-0.5 text-[11px] text-stone-300" aria-label={`Состав: ${FACTION_NAME[faction]}`}>
      {army.map((u) => {
        const cost = unitPoints(u.datasheetId, u.startingModels, copyIndex(army, u))
        return (
          <li key={u.id}>
            {u.name} <span className="text-stone-400">× {u.models.length}</span>{' '}
            <span className="text-stone-500" title={cost.exact ? undefined : 'Такого размера отряда нет в Munitorum Field Manual — стоимость пересчитана по модели'}>
              · {fmtPoints(cost)}
            </span>
          </li>
        )
      })}
      <li className="text-stone-400">Всего моделей: {total}</li>
      <li className="font-semibold text-amber-200">Стоимость армии: {fmtPoints(armyPoints(army))}</li>
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
    <p className={`mt-3 rounded p-2 text-xs ${lopsided ? 'bg-amber-950 text-amber-200' : 'bg-stone-900 text-stone-300'}`} aria-label="Баланс армий по очкам">
      {FACTION_NAME[human]}: <b>{fmtPoints(a)}</b> против {FACTION_NAME[opponent]}: <b>{fmtPoints(b)}</b>
      {lopsided && <> — перевес примерно в {ratio.toFixed(1)} раза, бой будет неравным.</>}
      <span className="block text-[10px] text-stone-500">
        Ориентировочно, по {POINTS_SOURCE.name} от {POINTS_SOURCE.updated}. «≈» — размер отряда не из справочника, стоимость пересчитана по модели.
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
        <h1 className="text-2xl font-bold">Тренировочный стол 40K</h1>
        <p className="mt-1 text-sm text-stone-400">
          Учебный симулятор по правилам Warhammer 40,000 (11-я редакция). Шесть армий: Космодесант, Орки, Тираниды, Некроны, Аэльдари, Адептус Механикус. Неофициальный любительский проект.
        </p>

        {auto.ok && !auto.file.state.winner && (
          <button className="btn btn-primary mt-4 w-full" onClick={() => st.load(AUTOSAVE_KEY)}>
            ▶ Продолжить битву (раунд {auto.file.state.round}, {new Date(auto.file.savedAt).toLocaleString('ru-RU')})
          </button>
        )}

        <h2 className="mt-5 font-semibold">Ваша армия</h2>
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
          <label className="text-sm">Противник (управляет компьютер)
            <select className="input" value={opponent} onChange={(e) => st.setSettings({ opponent: e.target.value as PlayerId })}>
              {FACTIONS.filter((f) => f !== human).map((f) => <option key={f} value={f}>{FACTION_NAME[f]} (ИИ)</option>)}
            </select>
          </label>
          <label className="text-sm">Сценарий
            <select className="input" value={scenarioId} onChange={(e) => st.setSettings({ scenarioId: e.target.value })}>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id} disabled={!playable(s)}>
                  {s.name}{!both(s) ? ' — нет армий для этой пары' : !playable(s) ? ' — свои составы только в «Боевом патруле»' : ''}
                </option>
              ))}
            </select>
          </label>
          {scenarioId === 'combat-patrol' && (
            <label className="text-sm">Раскладка укрытий
              <select className="input" value={st.settings.layoutId ?? 'A'} onChange={(e) => st.setSettings({ layoutId: e.target.value })}>
                {LAYOUT_IDS.map((id) => <option key={id} value={id}>{id} — {PATROL_LAYOUT_NAME[id]}</option>)}
                <option value="random">Случайная</option>
              </select>
            </label>
          )}
          {scenarioId === 'strike-force' && (
            <>
              <label className="text-sm">Карта расстановки
                <select className="input" value={st.settings.mapId ?? 'random'} onChange={(e) => st.setSettings({ mapId: e.target.value })}>
                  <option value="random">Случайная (как из колоды)</option>
                  {MAP_IDS.map((id) => <option key={id} value={id}>{MAPS[id].name} ({MAPS[id].nameEn})</option>)}
                </select>
              </label>
              <label className="text-sm">Раскладка укрытий
                <select className="input" value={st.settings.layoutId ?? 'random'} onChange={(e) => st.setSettings({ layoutId: e.target.value })}>
                  <option value="random">Случайная</option>
                  {LAYOUT_IDS.map((id) => <option key={id} value={id}>{id} — {LAYOUT_NAME[id]}</option>)}
                </select>
              </label>
              <label className="text-sm">Основная миссия (одна на обоих)
                <select className="input" value={st.settings.primary ?? 'random'} onChange={(e) => st.setSettings({ primary: e.target.value })}>
                  <option value="random">Случайная (бросок D6, как в Mirrored World)</option>
                  {PRIMARY_IDS.map((id) => <option key={id} value={id}>{PRIMARY[id].name} ({PRIMARY[id].nameEn})</option>)}
                  <option value="training">Учебный счёт — 5 ПО за цель со 2-го раунда</option>
                </select>
              </label>
              <label className="text-sm">Вторичные миссии (ваши; ИИ играет тактическими)
                <select className="input" value={st.settings.secondary ?? 'tactical'} onChange={(e) => st.setSettings({ secondary: e.target.value as never })}>
                  <option value="tactical">Тактические — две карты из колоды каждый ход</option>
                  <option value="fixed">Фиксированные — две карты на всю битву</option>
                  <option value="none">Без вторичных (у обоих)</option>
                </select>
              </label>
              {st.settings.secondary === 'fixed' && [0, 1].map((i) => {
                const cards = st.settings.fixedCards ?? ['assassination', 'bringItDown']
                return (
                  <label key={i} className="text-sm">Фиксированная карта {i + 1}
                    <select className="input" value={cards[i]} onChange={(e) => { const next = [...cards]; next[i] = e.target.value as SecondaryId; st.setSettings({ fixedCards: next }) }}>
                      {FIXED_IDS.filter((id) => id === cards[i] || id !== cards[1 - i]).map((id) => <option key={id} value={id}>{SECONDARY[id].name} ({SECONDARY[id].nameEn}) — {SECONDARY[id].fixedText}</option>)}
                    </select>
                  </label>
                )
              })}
            </>
          )}
          <label className="text-sm">Уровень ИИ
            <select className="input" value={st.settings.aiLevel} onChange={(e) => st.setSettings({ aiLevel: e.target.value as never })}>
              <option value="beginner">Новичок — простые приоритеты</option>
              <option value="standard">Стандарт — тактическая оценка</option>
            </select>
          </label>
        </div>
        <h2 className="mt-5 font-semibold">Состав армий</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <ArmyBuilder faction={human} role="Ваша армия" />
          <ArmyBuilder faction={opponent} role="Противник (ИИ)" />
        </div>
        <PointsMatchup settings={st.settings} />
        <LearningStylePicker />
        <p className="mt-3 rounded bg-stone-900 p-2 text-xs text-stone-300">
          {SCENARIOS.find((s) => s.id === scenarioId)?.description}
          <br />
          <span className="text-amber-300">{SCENARIOS.find((s) => s.id === scenarioId)?.victory}</span>
        </p>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary flex-1" disabled={listIssues.length > 0} title={listIssues[0] ?? ''} onClick={() => st.startDeployment()}>Начать новую битву</button>
          <button className="btn" disabled={!manual.ok} onClick={() => st.load(MANUAL_KEY)} title={manual.ok ? '' : manual.reason}>Загрузить сохранение</button>
        </div>
        <button className="btn mt-2 w-full" onClick={() => openOnlineMenu()}>🌐 Играть онлайн вдвоём</button>
        <p className="mt-2 text-xs text-stone-400">
          Сначала вы расставите армию в своей зоне, затем начнётся раунд 1.{' '}
          <button className="text-sky-300 underline disabled:text-stone-500 disabled:no-underline" disabled={listIssues.length > 0} onClick={() => st.newGame()}>Быстрый старт</button> — сразу в бой, отряды на стандартных позициях.
        </p>
        {listIssues.length > 0 && <p className="mt-2 text-sm text-rose-300">Исправьте состав армии, чтобы начать: {listIssues[0]}</p>}
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
      <legend className="text-sm">Стиль обучения</legend>
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
        <h1 className="mr-2 font-bold"><span className="hidden 2xl:inline">Тренировочный стол </span>40K</h1>
        {st.deploying ? (
          <span className="rounded bg-yellow-600 px-2 py-0.5 text-sm font-semibold text-black">Подготовка: расстановка армии</span>
        ) : (
          <>
            <span className="rounded bg-stone-800 px-2 py-0.5 text-sm">Раунд {game.round}/{game.maxRounds}</span>
            {missionName(game) && <span className="rounded bg-emerald-900 px-2 py-0.5 text-xs" title={`Основная миссия обеих сторон: ${missionName(game)}`}>🎯 {missionName(game)!.split(' (')[0]}</span>}
            {mapLine(game) && <span className="hidden rounded bg-stone-800 px-2 py-0.5 text-xs xl:inline" title={mapLine(game)!}>🗺 {mapLine(game)!.split(' (')[0]}</span>}
            <span className="rounded px-2 py-0.5 text-sm" style={{ background: FACTION_STYLE[game.activePlayer].primary }}>
              Ход: {FACTION_NAME[game.activePlayer]}
            </span>
          </>
        )}
        <OnlineHeader />
        <span className="text-sm text-stone-300">ПО: {scoreText(game)}</span>
        {game.players.orks?.riledTurns > 0 && <span className="rounded bg-red-800 px-2 py-0.5 text-xs">WAAAGH!</span>}
        {game.players.marines?.doctrine && <span className="rounded bg-sky-800 px-2 py-0.5 text-xs" title="Боевая доктрина Космодесанта до следующей фазы командования">Доктрина: {DOCTRINE_NAME[game.players.marines.doctrine]}</span>}
        {game.players.tyranids?.hyperAdaptation && <span className="rounded bg-purple-800 px-2 py-0.5 text-xs" title="Гиперадаптация Тиранидов на всю битву">{HYPER_NAME[game.players.tyranids.hyperAdaptation]}</span>}
        {game.players.adeptus_mechanicus?.imperative && <span className="rounded bg-amber-800 px-2 py-0.5 text-xs" title="Доктрина Империатива армии Адептус Механикус">{game.players.adeptus_mechanicus.imperative === 'protector' ? 'Протектор' : 'Завоеватель'}</span>}
        <div className="ml-auto flex flex-wrap gap-1">
          {/* icons only on laptop widths; labels from 1536px */}
          <button className={`btn ${st.measuring ? 'btn-primary' : ''}`} onClick={() => st.toggleMeasure()} aria-pressed={st.measuring} title="Линейка (R)" aria-label="Линейка">📏<span className="hidden 2xl:inline"> Линейка</span></button>
          <button className="btn" disabled={!!st.deploying} onClick={() => st.save()} title="Сохранить" aria-label="Сохранить">💾<span className="hidden 2xl:inline"> Сохранить</span></button>
          <button className="btn" disabled={!!st.shared} onClick={() => st.load()} title="Загрузить" aria-label="Загрузить">📂<span className="hidden 2xl:inline"> Загрузить</span></button>
          {game.winner && <button className="btn" onClick={() => setOverClosedFor(null)} title="Итоги боя" aria-label="Итоги">🏆<span className="hidden 2xl:inline"> Итоги</span></button>}
          <button className="btn" onClick={() => setSettingsOpen(true)} title="Настройки" aria-label="Настройки">⚙<span className="hidden 2xl:inline"> Настройки</span></button>
          <button className="btn" onClick={() => (st.shared ? window.confirm('Покинуть онлайн-партию? Соперник увидит, что вы отключились.') && leaveRoom() : st.quit())} title={st.shared ? 'Покинуть партию' : 'Главное меню'} aria-label="Меню">☰<span className="hidden 2xl:inline"> Меню</span></button>
        </div>
      </header>

      <main className={`grid min-h-0 grid-cols-1 overflow-y-auto md:grid-cols-2 lg:overflow-hidden ${st.layout.roster ? 'lg:grid-cols-[240px_1fr_270px] 2xl:grid-cols-[300px_1fr_320px]' : 'lg:grid-cols-[60px_1fr_280px] 2xl:grid-cols-[60px_1fr_320px]'}`}>
        <aside className="order-2 border-r border-stone-700 p-2 lg:order-1 lg:overflow-y-auto"><PanelBoundary name="Отряды" resetKey={st.selectedUnitId}><RosterPanel /></PanelBoundary></aside>
        <section className="relative order-1 h-[60vh] min-w-0 overflow-hidden md:col-span-2 lg:order-2 lg:col-span-1 lg:h-auto">
          <Board />
          <OnlineBanner />
          {st.measuring && <MeasureBar />}
          {lastDice && !st.review && <DiceToast key={lastDice.id} entryId={lastDice.id} />}
          <AttackReview />
          {st.message && (
            <div className={`absolute left-1/2 top-24 z-[2] max-w-md -translate-x-1/2 rounded px-3 py-2 text-sm shadow ${st.message.kind === 'error' ? 'bg-rose-900' : 'bg-stone-700'}`} role="status">
              {st.message.text} <button className="ml-2 text-stone-300" onClick={() => st.setMessage(null)} aria-label="Закрыть">✕</button>
            </div>
          )}
        </section>
        <aside className="order-3 border-l border-stone-700 p-2 lg:overflow-y-auto"><PanelBoundary name="Действия" resetKey={st.selectedUnitId}><ActionPanel /></PanelBoundary></aside>
      </main>

      <footer className={`${st.layout.log ? 'h-48' : ''} border-t border-stone-700 p-2`}><PanelBoundary name="Журнал"><BottomPanel /></PanelBoundary></footer>
      {game.winner && !st.deploying && overClosedFor !== game && (
        <BattleOverDialog game={{ ...game, winner: game.winner }} human={st.settings.human} onClose={() => setOverClosedFor(game)} onNewBattle={() => (st.shared ? leaveRoom() : st.startDeployment())} />
      )}
      {game.reaction?.player === st.settings.human && !game.winner && !st.review && <ReactionPrompt game={game} human={st.settings.human} />}
      <ChargeConfirm />
      {game.pendingReroll?.player === st.settings.human && !game.winner && !st.review && <RerollPrompt game={game} human={st.settings.human} />}
      {hyperPending(game) && st.settings.human === 'tyranids' && !st.review && <HyperAdaptationPrompt game={game} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function MeasureBar() {
  const st = useStore()
  return (
    <div className="absolute left-2 top-2 flex items-center gap-2 rounded bg-black/70 px-2 py-1 text-xs">
      <span>Линейка: щёлкните две точки или модели (от края подставки).</span>
      <label>Проверить дальность
        <input className="ml-1 w-12 rounded bg-stone-700 px-1" type="number" min={1} max={72} value={st.measure.range} onChange={(e) => st.setMeasureRange(Number(e.target.value) || 1)} />″
      </label>
      <button className="btn" onClick={() => st.clearMeasure()}>Сбросить</button>
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
    <div className="absolute bottom-16 left-2 z-[1] max-w-xs rounded bg-black/80 p-2 text-xs shadow-lg" onClick={() => setVisible(false)} title="Щёлкните, чтобы скрыть">
      <div className="mb-1 font-semibold">🎲 {entry.title}</div>
      <DiceFaces entry={entry} />
    </div>
  )
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const st = useStore()
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-80 rounded-lg bg-stone-800 p-4" role="dialog" aria-label="Настройки" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 font-semibold">Настройки</h2>
        <label className="block text-sm">Объяснения
          <select className="input" value={st.settings.explain} onChange={(e) => st.setSettings({ explain: e.target.value as ExplainLevel })}>
            {Object.entries(EXPLAIN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {!st.shared && (
          <label className="mt-2 block text-sm">Уровень ИИ
            <select className="input" value={st.settings.aiLevel} onChange={(e) => st.setSettings({ aiLevel: e.target.value as never })}>
              <option value="beginner">Новичок</option>
              <option value="standard">Стандарт</option>
            </select>
          </label>
        )}
        <LearningStylePicker />
        {st.tutorialDone.length > 0 && <button className="mt-1 text-xs text-sky-300 underline" onClick={() => st.resetTutorial()}>Пройти обучение заново</button>}
        <button className="btn btn-primary mt-3 w-full" onClick={onClose}>Готово</button>
      </div>
    </div>
  )
}
