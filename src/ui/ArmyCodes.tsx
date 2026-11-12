import { useState } from 'react'
import { decodeArmy, encodeArmy, loadSavedLists, storeSavedLists, withSaved, withoutSaved, type SavedLists } from '../game/army/armyCode'
import { listPoints, type ArmyList } from '../game/army/armyList'
import { FACTION_NAME } from '../game/data/datasheets'
import type { PlayerId } from '../game/types'
import { tr } from '../i18n/index'

/** "My rosters" (named lists saved in this browser) and "Army code" (copy a list as text, paste a friend's). */
export function ArmyCodes({ faction, list, setList }: { faction: PlayerId; list: ArmyList | null; setList: (l: ArmyList) => void }) {
  const [saved, setSaved] = useState<SavedLists>(loadSavedLists)
  const [name, setName] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [paste, setPaste] = useState<string | null>(null)
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null)
  const mine = saved[faction] ?? []

  const keep = (next: SavedLists) => {
    setSaved(next)
    if (!storeSavedLists(next)) setNote({ text: tr('The browser would not save it (private mode or no space).'), bad: true })
  }
  const save = () => {
    if (!list || !name.trim()) return
    keep(withSaved(saved, faction, name.trim(), list))
    setNote({ text: tr('Roster “{trim}” saved in this browser.', { trim: name.trim() }) })
    setName('')
  }
  const copy = () => {
    if (!list) return
    const c = encodeArmy(faction, list)
    setCode(c)
    setPaste(null)
    const manual = () => setNote({ text: tr('Copy the code from the field manually.') })
    const copying = navigator.clipboard?.writeText(c)
    if (copying) copying.then(() => setNote({ text: tr('Code copied — send it to a friend.') }), manual)
    else manual()
  }
  const load = () => {
    const d = decodeArmy(paste ?? '')
    if (!d.ok) return setNote({ text: d.error, bad: true })
    if (d.faction !== faction) return setNote({ text: tr('This is the army code of “{item}”, but here you are choosing “{item2}”.', { item: FACTION_NAME[d.faction], item2: FACTION_NAME[faction] }), bad: true })
    setList(d.list)
    setPaste(null)
    setNote({ text: tr('Roster loaded from the code: {length} units, {listPoints} pts', { length: d.list.units.length, listPoints: listPoints(d.list) }) })
  }

  return (
    <div className="mt-2 rounded border border-stone-700 p-2 text-xs" aria-label={tr('My rosters and army code')}>
      <div className="flex flex-wrap items-center gap-1">
        <b className="mr-1">{tr('My rosters')}</b>
        {mine.length === 0 && <span className="text-stone-500">{tr('none yet')}</span>}
        {mine.map((x) => (
          <span key={x.name} className="inline-flex items-center rounded bg-stone-800">
            <button className="px-1.5 py-0.5 hover:text-amber-200" title={tr('{length} units, {listPoints} / {limit} pts', { length: x.list.units.length, listPoints: listPoints(x.list), limit: x.list.limit })} onClick={() => { setList(x.list); setNote({ text: tr('Roster “{name}” loaded.', { name: x.name }) }) }}>{x.name}</button>
            <button className="px-1 text-stone-500 hover:text-rose-300" aria-label={tr('Delete roster “{name}”', { name: x.name })} onClick={() => keep(withoutSaved(saved, faction, x.name))}>✕</button>
          </span>
        ))}
      </div>
      {list && (
        <div className="mt-1 flex gap-1">
          <input className="input min-w-0 flex-1 py-0.5 text-xs" placeholder={tr('Roster name')} aria-label={tr('Roster name')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button className="btn py-0.5 text-xs" disabled={!name.trim()} onClick={save}>{tr('💾 Save')}</button>
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-1">
        {list && <button className="btn py-0.5 text-xs" onClick={copy}>{tr('📋 Army code')}</button>}
        <button className={`btn py-0.5 text-xs ${paste !== null ? 'btn-primary' : ''}`} onClick={() => { setPaste(paste === null ? '' : null); setCode(null) }}>{tr('📥 Paste code')}</button>
      </div>
      {code && <input className="input mt-1 py-0.5 font-mono text-[10px]" readOnly aria-label={tr('Army code')} value={code} onFocus={(e) => e.target.select()} />}
      {paste !== null && (
        <div className="mt-1 flex gap-1">
          <input className="input min-w-0 flex-1 py-0.5 font-mono text-[10px]" placeholder="WH40K1.…" aria-label={tr('Paste the army code')} value={paste} onChange={(e) => setPaste(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
          <button className="btn py-0.5 text-xs" disabled={!paste.trim()} onClick={load}>{tr('Load')}</button>
        </div>
      )}
      {note && <p className={`mt-1 ${note.bad ? 'text-rose-300' : 'text-emerald-300'}`} role="status">{note.text}</p>}
    </div>
  )
}
