import { useEffect, useRef } from 'react'
import { findUnit } from '../game/gameState'
import { useStore } from '../store'

/** «Точно атаковать?»: shown when the player declares a charge the forecast advises against (chargeAdvice.ts
 * chargeWarning). «Отмена» is the default, so Enter does not throw a unit away. */
export function ChargeConfirm() {
  const c = useStore((s) => s.chargeConfirm)
  const game = useStore((s) => s.game)
  const confirm = useStore((s) => s.confirmCharge)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => cancel.current?.focus(), [c])
  if (!c || !game) return null
  const unit = findUnit(game, c.unitId)
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-3" onKeyDown={(e) => e.key === 'Escape' && confirm(false)}>
      <div className="w-full max-w-md rounded-lg border border-rose-500 bg-stone-800 p-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="charge-confirm-title">
        <h2 id="charge-confirm-title" className="text-lg font-bold">Точно атаковать отрядом «{unit?.name}»?</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-200">
          {c.why.map((w) => <li key={w}>{w}</li>)}
        </ul>
        <p className="mt-2 text-xs text-stone-400">Прогноз — средние по всем броскам; подробности в «⚔ Прогноз атаки».</p>
        <div className="mt-3 flex gap-2">
          <button ref={cancel} className="btn btn-primary flex-1" onClick={() => confirm(false)}>Отмена</button>
          <button className="btn flex-1" onClick={() => confirm(true)}>Атаковать всё равно</button>
        </div>
      </div>
    </div>
  )
}
