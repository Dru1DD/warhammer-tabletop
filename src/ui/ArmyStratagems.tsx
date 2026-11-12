import { DETACHMENT_RULE } from '../game/rules/detachments'
import { DETACHMENT, LATER_STRATAGEMS, showOfficialName, stratagemAvailability } from '../game/rules/stratagems'
import type { PlayerId } from '../game/types'
import { tr } from '../i18n/index'

/** On the army screen: which Stratagems this army will have, which it will not (and why), and which come later. */
export function ArmyStratagems({ faction, datasheetIds, noDetachment = false }: { faction: PlayerId; datasheetIds: string[]; noDetachment?: boolean }) {
  const all = stratagemAvailability(faction, datasheetIds, noDetachment)
  const missing = all.filter((a) => !a.available)
  const later = LATER_STRATAGEMS.filter((x) => x.faction === faction)
  return (
    <details className="mt-2 text-xs" aria-label={tr('Army Stratagems')}>
      <summary className="cursor-pointer text-violet-200">
        {tr('📜 Stratagems: {value} of {length} available', { value: all.length - missing.length, length: all.length })}
        {missing.length > 0 && <span className="text-amber-300"> {tr('· {length} unavailable with this roster', { length: missing.length })}</span>}
      </summary>
      <p className="mt-1 text-[11px] text-stone-400">{tr('Detachment: {item} (11th edition). Stratagems cost Command Points (CP): +1 for each player in every Command phase.', { item: DETACHMENT[faction] })}</p>
      <p className="mt-1 text-[11px] text-stone-300" aria-label={tr('Detachment rule')}>
        <b>{tr('Detachment rule — {name}', { name: DETACHMENT_RULE[faction].name })}</b>{showOfficialName ? ` (${DETACHMENT_RULE[faction].nameEn})` : ''}{noDetachment ? <span className="text-amber-300"> {tr('— off: the army is built without a detachment')}</span> : <>: {DETACHMENT_RULE[faction].text}</>}
        {DETACHMENT_RULE[faction].note && <span className="block text-stone-500">{DETACHMENT_RULE[faction].note}</span>}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {all.map(({ info, available, why }) => (
          <li key={info.id} className={available ? 'text-stone-200' : 'text-stone-500'}>
            <span className={available ? 'text-emerald-400' : 'text-amber-400'}>{available ? '✓' : '✗'}</span> {info.name}{' '}
            <span className="text-stone-500">({showOfficialName ? `${info.nameEn}, ` : ''}{info.cost} CP{info.faction ? '' : tr(', shared')})</span>
            {!available && <span className="block pl-4 text-amber-300">{why}</span>}
          </li>
        ))}
        {later.map((x) => (
          <li key={x.nameEn} className="text-stone-500">
            <span>⏳</span> {x.name} <span>{showOfficialName ? tr('({nameEn}, {cost} CP) — not yet: {why}', { nameEn: x.nameEn, cost: x.cost, why: x.why }) : tr('({cost} CP) — not yet: {why}', { cost: x.cost, why: x.why })}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
