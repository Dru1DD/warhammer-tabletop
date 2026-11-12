import { useState } from 'react'
import { decodeArmy, encodeArmy, loadSavedLists, storeSavedLists, withSaved, withoutSaved, type SavedLists } from '../game/army/armyCode'
import { listPoints, type ArmyList } from '../game/army/armyList'
import { FACTION_NAME } from '../game/data/datasheets'
import type { PlayerId } from '../game/types'

/** «Мои составы» (named lists saved in this browser) and «Код армии» (copy a list as text, paste a friend's). */
export function ArmyCodes({ faction, list, setList }: { faction: PlayerId; list: ArmyList | null; setList: (l: ArmyList) => void }) {
  const [saved, setSaved] = useState<SavedLists>(loadSavedLists)
  const [name, setName] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [paste, setPaste] = useState<string | null>(null)
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null)
  const mine = saved[faction] ?? []

  const keep = (next: SavedLists) => {
    setSaved(next)
    if (!storeSavedLists(next)) setNote({ text: 'Браузер не дал сохранить (приватный режим или нет места).', bad: true })
  }
  const save = () => {
    if (!list || !name.trim()) return
    keep(withSaved(saved, faction, name.trim(), list))
    setNote({ text: `Состав «${name.trim()}» сохранён в этом браузере.` })
    setName('')
  }
  const copy = () => {
    if (!list) return
    const c = encodeArmy(faction, list)
    setCode(c)
    setPaste(null)
    const manual = () => setNote({ text: 'Скопируйте код из поля вручную.' })
    const copying = navigator.clipboard?.writeText(c)
    if (copying) copying.then(() => setNote({ text: 'Код скопирован — отправьте его другу.' }), manual)
    else manual()
  }
  const load = () => {
    const d = decodeArmy(paste ?? '')
    if (!d.ok) return setNote({ text: d.error, bad: true })
    if (d.faction !== faction) return setNote({ text: `Это код армии «${FACTION_NAME[d.faction]}», а здесь выбирается «${FACTION_NAME[faction]}».`, bad: true })
    setList(d.list)
    setPaste(null)
    setNote({ text: `Состав из кода загружен: ${d.list.units.length} отр., ${listPoints(d.list)} очк.` })
  }

  return (
    <div className="mt-2 rounded border border-stone-700 p-2 text-xs" aria-label="Мои составы и код армии">
      <div className="flex flex-wrap items-center gap-1">
        <b className="mr-1">Мои составы</b>
        {mine.length === 0 && <span className="text-stone-500">пока нет</span>}
        {mine.map((x) => (
          <span key={x.name} className="inline-flex items-center rounded bg-stone-800">
            <button className="px-1.5 py-0.5 hover:text-amber-200" title={`${x.list.units.length} отр., ${listPoints(x.list)} / ${x.list.limit} очк.`} onClick={() => { setList(x.list); setNote({ text: `Загружен состав «${x.name}».` }) }}>{x.name}</button>
            <button className="px-1 text-stone-500 hover:text-rose-300" aria-label={`Удалить состав «${x.name}»`} onClick={() => keep(withoutSaved(saved, faction, x.name))}>✕</button>
          </span>
        ))}
      </div>
      {list && (
        <div className="mt-1 flex gap-1">
          <input className="input min-w-0 flex-1 py-0.5 text-xs" placeholder="Название состава" aria-label="Название состава" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button className="btn py-0.5 text-xs" disabled={!name.trim()} onClick={save}>💾 Сохранить</button>
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-1">
        {list && <button className="btn py-0.5 text-xs" onClick={copy}>📋 Код армии</button>}
        <button className={`btn py-0.5 text-xs ${paste !== null ? 'btn-primary' : ''}`} onClick={() => { setPaste(paste === null ? '' : null); setCode(null) }}>📥 Вставить код</button>
      </div>
      {code && <input className="input mt-1 py-0.5 font-mono text-[10px]" readOnly aria-label="Код армии" value={code} onFocus={(e) => e.target.select()} />}
      {paste !== null && (
        <div className="mt-1 flex gap-1">
          <input className="input min-w-0 flex-1 py-0.5 font-mono text-[10px]" placeholder="WH40K1.…" aria-label="Вставьте код армии" value={paste} onChange={(e) => setPaste(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
          <button className="btn py-0.5 text-xs" disabled={!paste.trim()} onClick={load}>Загрузить</button>
        </div>
      )}
      {note && <p className={`mt-1 ${note.bad ? 'text-rose-300' : 'text-emerald-300'}`} role="status">{note.text}</p>}
    </div>
  )
}
