import { useEffect, useRef } from 'react'
import { findUnit } from '../game/gameState'
import { reactionAdvice } from '../game/reactionAdvice'
import { STRATAGEMS } from '../game/rules/stratagems'
import type { GameState, PlayerId, ReactionWindow } from '../game/types'
import { DECISION_TIMEOUT } from '../multiplayer/host'
import { useStore } from '../store'
import { useCountdown } from './useCountdown'
import { tr } from '../i18n/index'

const WINDOW_TEXT: Record<ReactionWindow, string | ((g: GameState) => string)> = {
  beforeShooting: tr('The opponent has finished moving. Their shooting begins now — you can answer with a Stratagem.'),
  afterCharges: tr('The opponent has finished their charges. Before the fight you can answer with a Stratagem.'),
  beforeShockTests: tr('Your Command phase is starting. Before the Battle-shock tests you can use “Insane Bravery” — the test will be passed without a roll.'),
  onTargeted: (g) => {
    const a = g.reaction?.attack
    const by = a && findUnit(g, a.unitId)
    const t = a && findUnit(g, a.targetId)
    return tr('“{name}” {value} at your unit “{name2}”. The dice have not been rolled yet — you can answer with a Stratagem.', { name: by?.name, value: a?.type === 'shoot' ? tr('shoots') : tr('strikes'), name2: t?.name })
  },
  afterAttacks: (g) => tr('Unit “{name}” lost models — reanimation can be started right now.', { name: findUnit(g, g.reaction?.unitId ?? '')?.name }),
}
const WINDOW_TITLE: Record<ReactionWindow, string> = {
  beforeShooting: tr('Opponent’s turn — your reaction?'),
  afterCharges: tr('Opponent’s turn — your reaction?'),
  beforeShockTests: tr('Battle-shock test'),
  onTargeted: tr('Your unit is under attack — respond?'),
  afterAttacks: tr('Losses — reanimation?'),
}

function windowText(g: GameState) {
  const t = WINDOW_TEXT[g.reaction!.window]
  return typeof t === 'function' ? t(g) : t
}

/** The pause in the opponent's turn: offers the reactions worth their CP, or passes on its own when none is. */
export function ReactionPrompt({ game, human }: { game: GameState; human: PlayerId }) {
  const dispatch = useStore((s) => s.dispatch)
  // online: the host passes for a player who does not answer in time
  const left = useCountdown(game, useStore((s) => !!s.shared) ? DECISION_TIMEOUT : 0)
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
        <p className="mt-1 text-sm text-stone-300">{tr('{windowText} You have {cp} CP.', { windowText: windowText(game), cp })}</p>
        <ul className="mt-3 space-y-2">
          {useful.map((o, i) => (
            <li key={o.title} className="rounded border border-stone-600 p-2">
              <div className="font-semibold">{o.title}</div>
              <div className="text-sm text-stone-300">{o.why}</div>
              <button ref={i === 0 ? primary : undefined} className="btn btn-primary mt-2 w-full" onClick={() => dispatch(o.cmd)}>{tr('Use ({cost} CP)', { cost: STRATAGEMS[o.cmd.id].cost })}</button>
            </li>
          ))}
        </ul>
        {rest.length > 0 && (
          <details className="mt-2 text-xs text-stone-400">
            <summary>{tr('More options that do not repay the CP ({length})', { length: rest.length })}</summary>
            <ul className="mt-1 space-y-1">
              {rest.map((o) => (
                <li key={o.title}>
                  <b>{o.title}</b> — {o.why} <button className="ml-1 text-sky-300 underline" onClick={() => dispatch(o.cmd)}>{tr('use anyway')}</button>
                </li>
              ))}
            </ul>
          </details>
        )}
        <button className="btn mt-3 w-full" onClick={() => { setMessage(null); dispatch({ type: 'passReaction' }) }}>{tr('Skip')}</button>
        {left !== null && <p className="mt-2 text-center text-xs text-amber-300" role="timer">{tr('⏱ {left} s — then the turn moves on without a reaction.', { left })}</p>}
      </div>
    </div>
  )
}
