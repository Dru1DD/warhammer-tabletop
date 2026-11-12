import { useEffect, useRef } from 'react'
import { chooseHyper } from '../game/ai/ai'
import { HYPER_ADAPTATIONS, HYPER_NAME, HYPER_TEXT } from '../game/rules/detachments'
import type { GameState } from '../game/types'
import { useStore } from '../store'
import { tr } from '../i18n/index'

/** Tyranids, the start of the battle: pick the Hyper-adaptation (Invasion Fleet detachment rule). The battle waits for it. */
export function HyperAdaptationPrompt({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch)
  const primary = useRef<HTMLButtonElement>(null)
  useEffect(() => primary.current?.focus(), [game])
  const advice = chooseHyper(game, 'tyranids')
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-3">
      <div className="w-full max-w-md rounded-lg border border-amber-500 bg-stone-800 p-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="hyper-title">
        <h2 id="hyper-title" className="text-lg font-bold">{tr('🧬 Hyper-adaptation for the whole battle')}</h2>
        <p className="mt-1 text-sm text-stone-300">{tr('Invasion Fleet detachment rule: choose one — it applies to all Tyranids until the end of the battle.')}</p>
        <div className="mt-3 flex flex-col gap-2">
          {HYPER_ADAPTATIONS.map((h) => (
            <button key={h} ref={h === advice.choice ? primary : undefined} className={`btn text-left ${h === advice.choice ? 'btn-primary' : ''}`} onClick={() => dispatch({ type: 'hyperAdaptation', choice: h })}>
              <b>{HYPER_NAME[h]}</b>: {HYPER_TEXT[h]}{h === advice.choice ? tr(' — advice: {why}', { why: advice.why }) : ''}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
