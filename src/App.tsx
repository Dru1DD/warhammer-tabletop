import { useEffect, useState } from 'react'
import { FACTION_STYLE, tokenImageFor } from './assets/manifest'
import { FACTION_NAME } from './game/data/datasheets'
import { actor } from './game/engine'
import { deserialize, readStorage } from './game/persistence'
import { SCENARIOS } from './game/scenarios/scenarios'
import type { ExplainLevel, PlayerId } from './game/types'
import { AI_STEP_MS, AUTOSAVE_KEY, MANUAL_KEY, useStore } from './store'
import { Board } from './ui/Board'
import { ActionPanel, BottomPanel, DiceFaces, RosterPanel } from './ui/Panels'

export default function App() {
  const game = useStore((s) => s.game)
  useAiLoop()
  return game ? <GameScreen /> : <StartScreen />
}

/** Drives the AI one decision at a time so the player can follow along. */
function useAiLoop() {
  const game = useStore((s) => s.game)
  const human = useStore((s) => s.settings.human)
  const aiStep = useStore((s) => s.aiStep)
  useEffect(() => {
    if (!game || game.winner || actor(game) === human) return
    const t = setTimeout(() => aiStep(), AI_STEP_MS)
    return () => clearTimeout(t)
  }, [game, human, aiStep])
}

const EXPLAIN: Record<ExplainLevel, string> = {
  beginner: 'Новичок — объяснять всё',
  standard: 'Стандарт — решения и ограничения',
  minimal: 'Минимум — только результаты',
}

function StartScreen() {
  const st = useStore()
  const [human, setHuman] = useState<PlayerId>(st.settings.human)
  const auto = deserialize(readStorage(AUTOSAVE_KEY))
  const manual = deserialize(readStorage(MANUAL_KEY))
  return (
    <div className="min-h-full bg-stone-900 p-4 text-stone-100">
      <div className="mx-auto max-w-2xl rounded-lg border border-stone-700 bg-stone-800 p-6 shadow-xl">
        <h1 className="text-2xl font-bold">Тренировочный стол 40K</h1>
        <p className="mt-1 text-sm text-stone-400">
          Учебный симулятор по правилам Warhammer 40,000 (11-я редакция) для армий из Introductory Set. Неофициальный любительский проект.
        </p>

        {auto.ok && !auto.file.state.winner && (
          <button className="btn btn-primary mt-4 w-full" onClick={() => st.load(AUTOSAVE_KEY)}>
            ▶ Продолжить битву (раунд {auto.file.state.round}, {new Date(auto.file.savedAt).toLocaleString('ru-RU')})
          </button>
        )}

        <h2 className="mt-5 font-semibold">Ваша армия</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(['marines', 'orks'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setHuman(p)}
              className={`rounded-lg border-2 p-3 text-left ${human === p ? 'border-yellow-400' : 'border-stone-600'}`}
              style={{ background: FACTION_STYLE[p].primary + '55' }}
            >
              <div className="mb-2 flex -space-x-3">
                {(p === 'marines' ? ['lieutenant', 'intercessorSergeant', 'intercessor', 'intercessorGL'] : ['nob', 'boy', 'boyBigShoota', 'boyRokkit']).map((id) => (
                  <img key={id} src={tokenImageFor(id, st.customTokens)} alt="" className="h-12 w-12 rounded-full border-2 border-stone-900" />
                ))}
              </div>
              <div className="font-semibold">{FACTION_NAME[p]}</div>
              <div className="text-xs text-stone-300">{p === 'marines' ? 'Лейтенант + 5 интерсессоров' : 'Ноб + 5 боев'}</div>
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-stone-400">Противником управляет компьютер.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Сценарий
            <select className="input" value={st.settings.scenarioId} onChange={(e) => st.setSettings({ scenarioId: e.target.value })}>
              {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Уровень ИИ
            <select className="input" value={st.settings.aiLevel} onChange={(e) => st.setSettings({ aiLevel: e.target.value as never })}>
              <option value="beginner">Новичок — простые приоритеты</option>
              <option value="standard">Стандарт — тактическая оценка</option>
            </select>
          </label>
          <label className="text-sm">Объяснения
            <select className="input" value={st.settings.explain} onChange={(e) => st.setSettings({ explain: e.target.value as ExplainLevel })}>
              {Object.entries(EXPLAIN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="mt-5 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={st.settings.tutorial} onChange={(e) => st.setSettings({ tutorial: e.target.checked })} /> Пошаговое обучение
          </label>
        </div>
        <p className="mt-3 rounded bg-stone-900 p-2 text-xs text-stone-300">
          {SCENARIOS.find((s) => s.id === st.settings.scenarioId)?.description}
          <br />
          <span className="text-amber-300">{SCENARIOS.find((s) => s.id === st.settings.scenarioId)?.victory}</span>
        </p>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary flex-1" onClick={() => st.newGame({ human })}>Начать новую битву</button>
          <button className="btn" disabled={!manual.ok} onClick={() => st.load(MANUAL_KEY)} title={manual.ok ? '' : manual.reason}>Загрузить сохранение</button>
        </div>
        {st.message && <p className="mt-2 text-sm text-rose-300">{st.message.text}</p>}
      </div>
    </div>
  )
}

function GameScreen() {
  const st = useStore()
  const game = st.game!
  const [settingsOpen, setSettingsOpen] = useState(false)
  const lastDice = game.diceLog.at(-1)
  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] bg-stone-900 text-stone-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-stone-700 bg-stone-950 px-3 py-2">
        <h1 className="mr-2 font-bold">Тренировочный стол 40K</h1>
        <span className="rounded bg-stone-800 px-2 py-0.5 text-sm">Раунд {game.round}/{game.maxRounds}</span>
        <span className="rounded px-2 py-0.5 text-sm" style={{ background: FACTION_STYLE[game.activePlayer].primary }}>
          Ход: {FACTION_NAME[game.activePlayer]}
        </span>
        <span className="text-sm text-stone-300">ПО: КД {game.players.marines.vp} : {game.players.orks.vp} Орки</span>
        {game.players.orks.riledTurns > 0 && <span className="rounded bg-red-800 px-2 py-0.5 text-xs">WAAAGH!</span>}
        <div className="ml-auto flex flex-wrap gap-1">
          <button className={`btn ${st.measuring ? 'btn-primary' : ''}`} onClick={() => st.toggleMeasure()} aria-pressed={st.measuring}>📏 Линейка</button>
          <button className="btn" onClick={() => st.save()}>💾 Сохранить</button>
          <button className="btn" onClick={() => st.load()}>📂 Загрузить</button>
          <button className="btn" onClick={() => setSettingsOpen(true)}>⚙ Настройки</button>
          <button className="btn" onClick={() => st.quit()}>☰ Меню</button>
        </div>
      </header>

      <main className="grid min-h-0 grid-cols-1 overflow-y-auto md:grid-cols-2 lg:grid-cols-[230px_1fr_250px] xl:grid-cols-[300px_1fr_300px] lg:overflow-hidden">
        <aside className="order-2 border-r border-stone-700 p-2 lg:order-1 lg:overflow-y-auto"><RosterPanel /></aside>
        <section className="relative order-1 h-[60vh] min-w-0 overflow-hidden md:col-span-2 lg:order-2 lg:col-span-1 lg:h-auto">
          <Board />
          {st.measuring && <MeasureBar />}
          {lastDice && <DiceToast key={lastDice.id} entryId={lastDice.id} />}
          {st.message && (
            <div className={`absolute left-1/2 top-2 max-w-md -translate-x-1/2 rounded px-3 py-2 text-sm shadow ${st.message.kind === 'error' ? 'bg-rose-900' : 'bg-stone-700'}`} role="status">
              {st.message.text} <button className="ml-2 text-stone-300" onClick={() => st.setMessage(null)} aria-label="Закрыть">✕</button>
            </div>
          )}
        </section>
        <aside className="order-3 border-l border-stone-700 p-2 lg:overflow-y-auto"><ActionPanel /></aside>
      </main>

      <footer className="h-56 border-t border-stone-700 p-2"><BottomPanel /></footer>
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
        <label className="mt-2 block text-sm">Уровень ИИ
          <select className="input" value={st.settings.aiLevel} onChange={(e) => st.setSettings({ aiLevel: e.target.value as never })}>
            <option value="beginner">Новичок</option>
            <option value="standard">Стандарт</option>
          </select>
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={st.settings.tutorial} onChange={(e) => st.setSettings({ tutorial: e.target.checked })} /> Обучение
        </label>
        <button className="btn btn-primary mt-3 w-full" onClick={onClose}>Готово</button>
      </div>
    </div>
  )
}
