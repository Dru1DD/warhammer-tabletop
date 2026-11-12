import { useEffect, useRef } from 'react'
import { FACTION_NAME } from '../game/data/datasheets'
import type { GameState, PlayerId } from '../game/types'
import { scoreText } from './score'
import { tr } from '../i18n/index'

/** Where the demo coach report lives (dev-only page; not part of the production build). */
const COACH_PREVIEW_URL = `${import.meta.env.BASE_URL}coach-preview.html`

const STEPS = [
  tr('Open the battle log below and find turns where the dice result differed a lot from what was expected.'),
  tr('Compare your decisions with the phase hints: shooting targets, cover, taking objectives.'),
  tr('Play again with the same army and try to fix one mistake.'),
]

/** Pure: headline for the human player. */
function outcomeOf(winner: PlayerId | 'draw', human: PlayerId) {
  if (winner === 'draw') return { title: tr('Draw'), tone: 'border-yellow-500 bg-yellow-900/40' }
  return winner === human
    ? { title: tr('Victory!'), tone: 'border-emerald-500 bg-emerald-900/40' }
    : { title: tr('Defeat'), tone: 'border-rose-500 bg-rose-900/40' }
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
            {game.winner === 'draw' ? tr('No winner') : tr('Winner: {item}', { item: FACTION_NAME[game.winner] })}
          </div>
          <div className="mt-1 text-sm">{tr('VP score — {scoreText}', { scoreText: scoreText(game, 'full') })}</div>
        </div>
        <h3 className="mt-3 font-semibold">{tr('What to do next')}</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-stone-300">
          {STEPS.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <p className="mt-3 text-xs text-stone-400">
          {tr('Battle review —')} <a className="text-sky-300 underline" href={COACH_PREVIEW_URL} target="_blank" rel="noopener noreferrer">{tr('coach report sample')}</a>{tr('. This is demo data: a personal review of your game is still in development.')}
        </p>
        <div className="mt-3 flex gap-2">
          <button ref={primary} className="btn btn-primary flex-1" onClick={onNewBattle}>{tr('New battle')}</button>
          <button className="btn flex-1" onClick={onClose}>{tr('Close')}</button>
        </div>
      </div>
    </div>
  )
}
