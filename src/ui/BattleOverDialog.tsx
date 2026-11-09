import { useEffect, useRef } from 'react'
import { FACTION_NAME } from '../game/data/datasheets'
import type { GameState, PlayerId } from '../game/types'
import { scoreText } from './score'

/** Where the demo coach report lives (dev-only page; not part of the production build). */
const COACH_PREVIEW_URL = `${import.meta.env.BASE_URL}coach-preview.html`

const STEPS = [
  'Откройте лог боя внизу и найдите ходы, где результат кубиков сильно отличался от ожидаемого.',
  'Сравните свои решения с подсказками фаз: цели стрельбы, укрытия, захват целей.',
  'Сыграйте ещё раз с той же армией и попробуйте исправить одну ошибку.',
]

/** Pure: headline for the human player. */
function outcomeOf(winner: PlayerId | 'draw', human: PlayerId) {
  if (winner === 'draw') return { title: 'Ничья', tone: 'border-yellow-500 bg-yellow-900/40' }
  return winner === human
    ? { title: 'Победа!', tone: 'border-emerald-500 bg-emerald-900/40' }
    : { title: 'Поражение', tone: 'border-rose-500 bg-rose-900/40' }
}

export function BattleOverDialog({ game, human, onClose, onNewBattle }: {
  game: GameState & { winner: PlayerId | 'draw' }
  human: PlayerId
  onClose: () => void
  onNewBattle: () => void
}) {
  const primary = useRef<HTMLButtonElement>(null)
  useEffect(() => primary.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const { title, tone } = outcomeOf(game.winner, human)
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-stone-800 p-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="battle-over-title" onClick={(e) => e.stopPropagation()}>
        <div className={`rounded border p-3 text-center ${tone}`}>
          <h2 id="battle-over-title" className="text-2xl font-bold">{title}</h2>
          <div className="text-sm">
            {game.winner === 'draw' ? 'Победителя нет' : `Победитель: ${FACTION_NAME[game.winner]}`}
          </div>
          <div className="mt-1 text-sm">Счёт ПО — {scoreText(game, 'full')}</div>
        </div>
        <h3 className="mt-3 font-semibold">Что делать дальше</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-stone-300">
          {STEPS.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <p className="mt-3 text-xs text-stone-400">
          Разбор боя — <a className="text-sky-300 underline" href={COACH_PREVIEW_URL} target="_blank" rel="noopener noreferrer">пример отчёта тренера</a>.
          Это демо-данные: личный разбор вашей партии ещё в разработке.
        </p>
        <div className="mt-3 flex gap-2">
          <button ref={primary} className="btn btn-primary flex-1" onClick={onNewBattle}>Новая битва</button>
          <button className="btn flex-1" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}
