import { unitAdvice } from '../game/unitAdvice'
import type { UnitState } from '../game/types'
import { useStore } from '../store'
import { tr } from '../i18n/index'

/** «How to play this unit»: its role, what to do with it, what it hits hardest and fears, and, in a battle, which
 * enemy units it hurts most and which hurt it most. */
export function UnitRoleTips({ u }: { u: UnitState }) {
  const game = useStore((s) => s.game)
  const beginner = useStore((s) => s.settings.explain === 'beginner')
  const human = useStore((s) => s.settings.human)
  const a = unitAdvice(u, game ?? undefined)
  const mine = u.owner === human
  return (
    <details className="mt-2 rounded border border-sky-800 bg-sky-950/30 p-1.5" open={beginner} aria-label={tr('How to play this unit')}>
      <summary className="cursor-pointer font-semibold text-sky-200">🧭 {mine ? tr('How to play') : tr('What to expect from it')}: {a.title}</summary>
      {mine && (
        <ul className="mt-1 list-disc pl-4 text-[11px] text-stone-200">
          {a.tips.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
      <p className="mt-1 text-[11px] text-stone-300"><b className="text-emerald-300">{tr('Strongest against:')}</b> {a.strongVs}.</p>
      <p className="text-[11px] text-stone-300"><b className="text-amber-300">{tr('Afraid of:')}</b> {a.fears}.</p>
      {a.bestTargets.length > 0 && (
        <p className="text-[11px] text-stone-300"><b className="text-emerald-300">{mine ? tr('Deals the most damage') : tr('Most dangerous to')}:</b> {a.bestTargets.join(', ')}.</p>
      )}
      {a.worstThreats.length > 0 && (
        <p className="text-[11px] text-stone-300"><b className="text-rose-300">{mine ? tr('Most dangerous to it') : tr('It is hit best by')}:</b> {a.worstThreats.join(', ')}.</p>
      )}
      <p className="mt-0.5 text-[10px] text-stone-500">{tr('Average damage not counting cover, range and line of sight.')}</p>
    </details>
  )
}
