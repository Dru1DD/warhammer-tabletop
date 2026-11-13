import { useEffect, useRef } from 'react'
import { findUnit } from '../game/gameState'
import { tr } from '../i18n/index'
import { useStore } from '../store'

/** A question before an action that usually wastes a unit: “Really charge?” (chargeAdvice.ts chargeWarning),
 * “Really Advance?” (advanceAdvice.ts) or “Start with an empty transport?”. “Cancel” is the default, so Enter does not
 * throw a unit away. */
export function ChargeConfirm() {
  const c = useStore((s) => s.chargeConfirm)
  const game = useStore((s) => s.game)
  const confirm = useStore((s) => s.confirmCharge)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => cancel.current?.focus(), [c])
  if (!c || !game) return null
  const unit = findUnit(game, c.unitId)
  const text = {
    charge: {
      title: tr('Really charge with “{name}”?', { name: unit?.name }),
      note: tr('The forecast is the average over all rolls; details are in “⚔ Charge forecast”.'),
      cancel: tr('Cancel'),
      go: tr('Charge anyway'),
    },
    advance: {
      title: tr('Really Advance with “{name}”?', { name: unit?.name }),
      note: tr('Advance when the unit has nothing to shoot at anyway, or must reach an objective this turn.'),
      cancel: tr('Cancel'),
      go: tr('Advance anyway'),
    },
    start: {
      title: tr('Start the battle with an empty transport?'),
      note: tr('To put a unit inside: select the unit, then in “🚚 Transports” press the button with the transport’s name.'),
      cancel: tr('Back to deployment'),
      go: tr('Start without it'),
    },
  }[c.kind ?? 'charge']
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-3" onKeyDown={(e) => e.key === 'Escape' && confirm(false)}>
      <div className="w-full max-w-md rounded-lg border border-rose-500 bg-stone-800 p-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="charge-confirm-title">
        <h2 id="charge-confirm-title" className="text-lg font-bold">{text.title}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-200">
          {c.why.map((w) => <li key={w}>{w}</li>)}
        </ul>
        <p className="mt-2 text-xs text-stone-400">{text.note}</p>
        <div className="mt-3 flex gap-2">
          <button ref={cancel} className="btn btn-primary flex-1" onClick={() => confirm(false)}>{text.cancel}</button>
          <button className="btn flex-1" onClick={() => confirm(true)}>{text.go}</button>
        </div>
      </div>
    </div>
  )
}
