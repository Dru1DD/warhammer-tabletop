import { DETACHMENT_RULE } from '../game/rules/detachments'
import { DETACHMENT, LATER_STRATAGEMS, stratagemAvailability } from '../game/rules/stratagems'
import type { PlayerId } from '../game/types'

/** On the army screen: which Stratagems this army will have, which it will not (and why), and which come later. */
export function ArmyStratagems({ faction, datasheetIds }: { faction: PlayerId; datasheetIds: string[] }) {
  const all = stratagemAvailability(faction, datasheetIds)
  const missing = all.filter((a) => !a.available)
  const later = LATER_STRATAGEMS.filter((x) => x.faction === faction)
  return (
    <details className="mt-2 text-xs" aria-label="Стратагемы армии">
      <summary className="cursor-pointer text-violet-200">
        📜 Стратагемы: {all.length - missing.length} из {all.length} доступны
        {missing.length > 0 && <span className="text-amber-300"> · {missing.length} недоступны с этим составом</span>}
      </summary>
      <p className="mt-1 text-[11px] text-stone-400">Детачмент: {DETACHMENT[faction]} (11-я редакция). Стратагемы стоят очки командования (CP): +1 каждому игроку в каждой фазе командования.</p>
      <p className="mt-1 text-[11px] text-stone-300" aria-label="Правило детачмента">
        <b>Правило детачмента — {DETACHMENT_RULE[faction].name}</b> ({DETACHMENT_RULE[faction].nameEn}): {DETACHMENT_RULE[faction].text}
        {DETACHMENT_RULE[faction].note && <span className="block text-stone-500">{DETACHMENT_RULE[faction].note}</span>}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {all.map(({ info, available, why }) => (
          <li key={info.id} className={available ? 'text-stone-200' : 'text-stone-500'}>
            <span className={available ? 'text-emerald-400' : 'text-amber-400'}>{available ? '✓' : '✗'}</span> {info.name}{' '}
            <span className="text-stone-500">({info.nameEn}, {info.cost} CP{info.faction ? '' : ', общая'})</span>
            {!available && <span className="block pl-4 text-amber-300">{why}</span>}
          </li>
        ))}
        {later.map((x) => (
          <li key={x.nameEn} className="text-stone-500">
            <span>⏳</span> {x.name} <span>({x.nameEn}, {x.cost} CP) — пока нет: {x.why}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
