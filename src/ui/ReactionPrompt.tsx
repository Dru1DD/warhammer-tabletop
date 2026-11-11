import { useEffect, useRef } from 'react'
import { findUnit } from '../game/gameState'
import { reactionAdvice } from '../game/reactionAdvice'
import { STRATAGEMS } from '../game/rules/stratagems'
import type { GameState, PlayerId, ReactionWindow } from '../game/types'
import { useStore } from '../store'

const WINDOW_TEXT: Record<ReactionWindow, string | ((g: GameState) => string)> = {
  beforeShooting: 'Противник закончил движение. Сейчас начнётся его стрельба — можно ответить стратагемой.',
  afterCharges: 'Противник закончил атаки. Перед боем можно ответить стратагемой.',
  beforeShockTests: 'Начинается ваша фаза командования. Перед проверками боевого шока можно применить «Безумную храбрость» — проверка будет пройдена без броска.',
  onTargeted: (g) => {
    const a = g.reaction?.attack
    const by = a && findUnit(g, a.unitId)
    const t = a && findUnit(g, a.targetId)
    return `«${by?.name}» ${a?.type === 'shoot' ? 'стреляет' : 'бьёт'} по вашему отряду «${t?.name}». Кубики ещё не брошены — можно ответить стратагемой.`
  },
  afterAttacks: (g) => `Отряд «${findUnit(g, g.reaction?.unitId ?? '')?.name}» потерял модели — реанимацию можно запустить прямо сейчас.`,
}
const WINDOW_TITLE: Record<ReactionWindow, string> = {
  beforeShooting: 'Ход противника — ваша реакция?',
  afterCharges: 'Ход противника — ваша реакция?',
  beforeShockTests: 'Проверка боевого шока',
  onTargeted: 'Ваш отряд под атакой — ответить?',
  afterAttacks: 'Потери — реанимация?',
}

function windowText(g: GameState) {
  const t = WINDOW_TEXT[g.reaction!.window]
  return typeof t === 'function' ? t(g) : t
}

/** The pause in the opponent's turn: offers the reactions worth their CP, or passes on its own when none is. */
export function ReactionPrompt({ game, human }: { game: GameState; human: PlayerId }) {
  const dispatch = useStore((s) => s.dispatch)
  const setMessage = useStore((s) => s.setMessage)
  const options = reactionAdvice(game)
  const useful = options.filter((o) => o.worth)
  const passed = useRef<GameState | null>(null)
  const primary = useRef<HTMLButtonElement>(null)

  // «only when useful»: nothing worth the CP → do not stop the game
  useEffect(() => {
    if (useful.length || passed.current === game) return
    passed.current = game
    dispatch({ type: 'passReaction' })
  }, [game, useful.length, dispatch])
  useEffect(() => primary.current?.focus(), [game])

  if (!useful.length || !game.reaction) return null
  const cp = game.players[human].cp
  const rest = options.filter((o) => !o.worth)
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-3">
      <div className="w-full max-w-md rounded-lg border border-amber-500 bg-stone-800 p-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="reaction-title">
        <h2 id="reaction-title" className="text-lg font-bold">{WINDOW_TITLE[game.reaction.window]}</h2>
        <p className="mt-1 text-sm text-stone-300">{windowText(game)} У вас {cp} CP.</p>
        <ul className="mt-3 space-y-2">
          {useful.map((o, i) => (
            <li key={o.title} className="rounded border border-stone-600 p-2">
              <div className="font-semibold">{o.title}</div>
              <div className="text-sm text-stone-300">{o.why}</div>
              <button ref={i === 0 ? primary : undefined} className="btn btn-primary mt-2 w-full" onClick={() => dispatch(o.cmd)}>Применить ({STRATAGEMS[o.cmd.id].cost} CP)</button>
            </li>
          ))}
        </ul>
        {rest.length > 0 && (
          <details className="mt-2 text-xs text-stone-400">
            <summary>Ещё варианты, которые не окупают CP ({rest.length})</summary>
            <ul className="mt-1 space-y-1">
              {rest.map((o) => (
                <li key={o.title}>
                  <b>{o.title}</b> — {o.why} <button className="ml-1 text-sky-300 underline" onClick={() => dispatch(o.cmd)}>всё равно применить</button>
                </li>
              ))}
            </ul>
          </details>
        )}
        <button className="btn mt-3 w-full" onClick={() => { setMessage(null); dispatch({ type: 'passReaction' }) }}>Пропустить</button>
      </div>
    </div>
  )
}
