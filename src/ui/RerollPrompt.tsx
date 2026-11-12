import { useEffect, useRef } from 'react'
import type { RerollKind } from '../game/combat/attack'
import { findUnit, fmt } from '../game/gameState'
import type { GameState, PlayerId } from '../game/types'
import { DECISION_TIMEOUT } from '../multiplayer/host'
import { useStore } from '../store'
import { useCountdown } from './useCountdown'

const KIND_TEXT: Record<RerollKind, string> = {
  attacks: 'Бросок числа атак',
  hit: 'Бросок на попадание — промах',
  wound: 'Бросок на ранение — не ранил',
  save: 'Спасбросок провален',
  damage: 'Бросок урона',
}

/** The pause in the middle of an attack: one die is worth a Command Re-roll (the game only stops when it is). */
export function RerollPrompt({ game, human }: { game: GameState; human: PlayerId }) {
  const dispatch = useStore((s) => s.dispatch)
  // online: the host keeps the die for a player who does not answer in time
  const left = useCountdown(game, useStore((s) => !!s.shared) ? DECISION_TIMEOUT : 0)
  const primary = useRef<HTMLButtonElement>(null)
  useEffect(() => primary.current?.focus(), [game])
  const pr = game.pendingReroll
  if (!pr) return null
  const attacker = findUnit(game, pr.attackerId)
  const target = findUnit(game, pr.targetId)
  const mine = pr.player === human
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-3">
      <div className="w-full max-w-md rounded-lg border border-amber-500 bg-stone-800 p-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="reroll-title">
        <h2 id="reroll-title" className="text-lg font-bold">🎲 Командный переброс?</h2>
        <p className="mt-1 text-sm text-stone-300">
          {mine && pr.kind === 'save' ? 'По вашему отряду бьют' : 'Ваша атака'}: «{attacker?.name}» → «{target?.name}», {pr.weapon}.
        </p>
        <div className="mt-3 rounded border border-stone-600 p-2">
          <div className="font-semibold">{KIND_TEXT[pr.kind]}: выпало «{pr.value}»</div>
          <div className="text-sm text-stone-300">
            Переброс {pr.kind === 'save' ? 'спасёт' : 'добавит'} в среднем ≈ {fmt(pr.gain)} урона. Один кубик, раз за фазу; остальные кубики атаки ещё не брошены. У вас {game.players[human].cp} CP.
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button ref={primary} className="btn btn-primary flex-1" onClick={() => dispatch({ type: 'rerollChoice', reroll: true })}>Перебросить (1 CP)</button>
          <button className="btn flex-1" onClick={() => dispatch({ type: 'rerollChoice', reroll: false })}>Оставить</button>
        </div>
        {left !== null && <p className="mt-2 text-center text-xs text-amber-300" role="timer">⏱ {left} с — потом кубик останется как есть.</p>}
      </div>
    </div>
  )
}
