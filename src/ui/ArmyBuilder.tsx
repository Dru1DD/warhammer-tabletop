import {
  datasheetsOf, entryCosts, listPoints, listProblems, maxCopies, POINTS_LIMITS, presetList, shortName, type ArmyList, type PointsLimit,
} from '../game/army/armyList'
import { FACTION_NAME } from '../game/data/datasheets'
import { legalSizes, listedCost } from '../game/data/points'
import type { PlayerId } from '../game/types'
import { useStore } from '../store'
import { useState } from 'react'
import { WARGEAR } from '../game/army/wargear'
import { LoadoutEditor } from './LoadoutEditor'
import { armyOf } from '../game/scenarios/scenarios'
import { ArmyStratagems } from './ArmyStratagems'
import { ArmyCodes } from './ArmyCodes'

const samePreset = (faction: PlayerId, list: ArmyList, limit: PointsLimit) =>
  list.limit === limit && JSON.stringify(list.units) === JSON.stringify(presetList(faction, limit).units)

/** Army list editor for one side: training roster, a preset, or the player's own list within a points limit. */
export function ArmyBuilder({ faction, role }: { faction: PlayerId; role: string }) {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const list = settings.armies?.[faction] ?? null
  const setList = (next: ArmyList | null) => {
    const armies = { ...settings.armies }
    if (next) armies[faction] = next
    else delete armies[faction]
    setSettings({ armies })
  }
  const edit = (units: ArmyList['units']) => list && setList({ ...list, units })
  // which entry's wargear editor is open (by index)
  const [open, setOpen] = useState<number | null>(null)

  const pts = list ? listPoints(list) : 0
  const costs = list ? entryCosts(list) : []
  const problems = list ? listProblems(faction, list) : []
  const copies = (id: string) => list?.units.filter((e) => e.datasheetId === id).length ?? 0
  const mode = !list ? 'default' : POINTS_LIMITS.find((l) => samePreset(faction, list, l)) ?? 'custom'

  return (
    <section className="rounded border border-stone-600 bg-stone-900 p-3 text-sm" aria-label={`Состав армии: ${FACTION_NAME[faction]}`}>
      <h3 className="font-semibold">{role}: {FACTION_NAME[faction]}</h3>
      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Готовый состав">
        <button className={`btn text-xs ${mode === 'default' ? 'btn-primary' : ''}`} aria-pressed={mode === 'default'} onClick={() => setList(null)}>
          Учебный состав
        </button>
        {POINTS_LIMITS.map((l) => (
          <button key={l} className={`btn text-xs ${mode === l ? 'btn-primary' : ''}`} aria-pressed={mode === l} onClick={() => setList(presetList(faction, l))}>
            Пресет {l}
          </button>
        ))}
        {mode === 'custom' && <span className="self-center rounded bg-stone-700 px-2 py-1 text-xs">Свой список</span>}
      </div>

      {!list && <p className="mt-2 text-xs text-stone-400">Состав сценария без лимита очков. Выберите пресет, чтобы собрать армию под 500 или 1000 очков.</p>}

      <ArmyCodes faction={faction} list={list} setList={(l) => { setOpen(null); setList(l) }} />

      <ArmyStratagems faction={faction} datasheetIds={list ? list.units.map((e) => e.datasheetId) : (armyOf(settings.scenarioId, faction) ?? []).map((u) => u.datasheetId)} />

      {list && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs">Лимит{' '}
              <select className="input inline-block w-auto py-0.5 text-xs" value={list.limit} onChange={(e) => setList({ ...list, limit: Number(e.target.value) as PointsLimit })}>
                {POINTS_LIMITS.map((l) => <option key={l} value={l}>{l} очков</option>)}
              </select>
            </label>
            <span className={`ml-auto font-semibold ${pts > list.limit ? 'text-rose-300' : 'text-amber-200'}`} aria-label="Очки армии">{pts} / {list.limit}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-stone-700" aria-hidden>
            <div className={`h-full ${pts > list.limit ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, (pts / list.limit) * 100)}%` }} />
          </div>

          <ul className="mt-2 space-y-1" aria-label="Отряды армии">
            {list.units.map((e, i) => (
              <li key={i} className="text-xs">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate" title={shortName(e.datasheetId)}>{shortName(e.datasheetId)}{e.loadout ? ' ⚙' : ''}</span>
                {WARGEAR[e.datasheetId] && (
                  <button type="button" className={`btn px-1.5 py-0 text-xs ${open === i ? 'btn-primary' : ''}`} aria-expanded={open === i} title="Снаряжение отряда" aria-label={`Снаряжение «${shortName(e.datasheetId)}»`} onClick={() => setOpen(open === i ? null : i)}>
                    ⚙
                  </button>
                )}
                {legalSizes(e.datasheetId).length > 1 ? (
                  <select
                    className="input w-auto py-0.5 text-xs"
                    aria-label={`Размер отряда «${shortName(e.datasheetId)}»`}
                    value={e.size}
                    onChange={(ev) => edit(list.units.map((x, j) => (j === i ? { ...x, size: Number(ev.target.value) } : x)))}
                  >
                    {legalSizes(e.datasheetId).map((n) => <option key={n} value={n}>× {n}</option>)}
                  </select>
                ) : (
                  <span className="text-stone-400">× {e.size}</span>
                )}
                <span className="w-14 text-right text-stone-300">{costs[i]} очк.</span>
                <button className="text-stone-400 hover:text-rose-300" aria-label={`Убрать «${shortName(e.datasheetId)}»`} onClick={() => { setOpen(null); edit(list.units.filter((_, j) => j !== i)) }}>✕</button>
              </div>
              {open === i && (
                <LoadoutEditor
                  entry={e}
                  onChange={(loadout) => edit(list.units.map((x, j) => (j === i ? (loadout ? { ...x, loadout } : { datasheetId: x.datasheetId, size: x.size }) : x)))}
                />
              )}
              </li>
            ))}
          </ul>

          <select
            className="input mt-2 text-xs"
            aria-label="Добавить отряд"
            value=""
            onChange={(e) => {
              const id = e.target.value
              if (id) edit([...list.units, { datasheetId: id, size: legalSizes(id)[0] }])
            }}
          >
            <option value="">+ Добавить отряд…</option>
            {datasheetsOf(faction).map((d) => {
              const n = legalSizes(d.id)[0]
              const full = copies(d.id) >= maxCopies(d.id)
              return (
                <option key={d.id} value={d.id} disabled={full}>
                  {shortName(d.id)} × {n} — {listedCost(d.id, n, copies(d.id) + 1)} очк.{full ? ` (уже ${maxCopies(d.id)})` : ''}
                </option>
              )
            })}
          </select>

          {problems.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-xs text-rose-300" aria-label="Ошибки состава">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
