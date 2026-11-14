import {
  attachments, datasheetsOf, entryCosts, listPoints, listProblems, maxCopies, POINTS_LIMITS, presetList, shortName, withoutEntry, type ArmyList, type PointsLimit,
} from '../game/army/armyList'
import { attachKind, canLead, isCharacterDatasheet } from '../game/rules/attached'
import { FACTION_NAME } from '../game/data/datasheets'
import { legalSizes, listedCost } from '../game/data/points'
import type { PlayerId } from '../game/types'
import { useStore } from '../store'
import { useState } from 'react'
import { WARGEAR } from '../game/army/wargear'
import { LoadoutEditor } from './LoadoutEditor'
import { armyOf } from '../game/scenarios/scenarios'
import { ArmyStratagems } from './ArmyStratagems'
import { DETACHMENT } from '../game/rules/stratagems'
import { ArmyCodes } from './ArmyCodes'
import { tr } from '../i18n/index'

/** Lists above this limit need the 44″×60″ board (the Combat Patrol board takes up to 1000 points). */
const BIG_LIST = 1000

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
  const joins = list ? attachments(list) : []
  const costs = list ? entryCosts(list) : []
  const problems = list ? listProblems(faction, list) : []
  const copies = (id: string) => list?.units.filter((e) => e.datasheetId === id).length ?? 0
  const mode = !list ? 'default' : POINTS_LIMITS.find((l) => samePreset(faction, list, l)) ?? 'custom'

  return (
    <section className="rounded border border-stone-600 bg-stone-900 p-3 text-sm" aria-label={tr('Army roster: {item}', { item: FACTION_NAME[faction] })}>
      <h3 className="font-semibold">{role}: {FACTION_NAME[faction]}</h3>
      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={tr('Ready-made roster')}>
        <button className={`btn text-xs ${mode === 'default' ? 'btn-primary' : ''}`} aria-pressed={mode === 'default'} onClick={() => setList(null)}>
          {tr('Training roster')}
        </button>
        {POINTS_LIMITS.map((l) => (
          <button key={l} className={`btn text-xs ${mode === l ? 'btn-primary' : ''}`} aria-pressed={mode === l} onClick={() => setList(presetList(faction, l))}>
            {tr('Preset {l}', { l })}
          </button>
        ))}
        {mode === 'custom' && <span className="self-center rounded bg-stone-700 px-2 py-1 text-xs">{tr('Own list')}</span>}
      </div>

      {!list && <p className="mt-2 text-xs text-stone-400">{tr('The scenario roster without a points limit. Pick a preset to build an army for 500 to 2500 points.')}</p>}

      <ArmyCodes faction={faction} list={list} setList={(l) => { setOpen(null); setList(l) }} />

      {list && (
        <label className="mt-2 flex items-start gap-2 text-xs" title={tr('Without the detachment: no its rule and no its Stratagems, the common Stratagems and army rules remain')}>
          <input type="checkbox" checked={!list.noDetachment} onChange={(e) => {
            const { noDetachment: _off, ...rest } = list
            setList(e.target.checked ? rest : { ...rest, noDetachment: true })
          }} />
          <span>{tr('Rules of the “{item}” detachment (the detachment rule and Stratagems). Untick to play a pure custom: only the common Stratagems and army rules.', { item: DETACHMENT[faction] })}</span>
        </label>
      )}

      <ArmyStratagems faction={faction} noDetachment={!!list?.noDetachment} datasheetIds={list ? list.units.map((e) => e.datasheetId) : (armyOf(settings.scenarioId, faction) ?? []).map((u) => u.datasheetId)} />

      {list && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs">{tr('Limit ')}
              <select className="input inline-block w-auto py-0.5 text-xs" value={list.limit} onChange={(e) => setList({ ...list, limit: Number(e.target.value) as PointsLimit })}>
                {POINTS_LIMITS.map((l) => <option key={l} value={l}>{tr('{l} points', { l })}</option>)}
              </select>
            </label>
            <span className={`ml-auto font-semibold ${pts > list.limit ? 'text-rose-300' : 'text-amber-200'}`} aria-label={tr('Army points')}>{pts} / {list.limit}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-stone-700" aria-hidden>
            <div className={`h-full ${pts > list.limit ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, (pts / list.limit) * 100)}%` }} />
          </div>
          {list.limit > BIG_LIST && (
            <p className="mt-1 text-xs text-stone-400">{tr('Over {points} points the battle is played on the 44″×60″ board, and the AI takes longer over each turn.', { points: BIG_LIST })}</p>
          )}

          <ul className="mt-2 space-y-1" aria-label={tr('Army units')}>
            {list.units.map((e, i) => (
              <li key={i} className="text-xs">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate" title={shortName(e.datasheetId)}><span className="text-stone-500">{i + 1}.</span> {shortName(e.datasheetId)}{e.loadout ? ' ⚙' : ''}</span>
                {WARGEAR[e.datasheetId] && (
                  <button type="button" className={`btn px-1.5 py-0 text-xs ${open === i ? 'btn-primary' : ''}`} aria-expanded={open === i} title={tr('Unit wargear')} aria-label={tr('Wargear of “{shortName}”', { shortName: shortName(e.datasheetId) })} onClick={() => setOpen(open === i ? null : i)}>
                    ⚙
                  </button>
                )}
                {legalSizes(e.datasheetId).length > 1 ? (
                  <select
                    className="input w-auto py-0.5 text-xs"
                    aria-label={tr('Size of unit “{shortName}”', { shortName: shortName(e.datasheetId) })}
                    value={e.size}
                    onChange={(ev) => edit(list.units.map((x, j) => (j === i ? { ...x, size: Number(ev.target.value) } : x)))}
                  >
                    {legalSizes(e.datasheetId).map((n) => <option key={n} value={n}>× {n}</option>)}
                  </select>
                ) : (
                  <span className="text-stone-400">× {e.size}</span>
                )}
                <span className="w-14 text-right text-stone-300">{tr('{item} pts', { item: costs[i] })}</span>
                <button className="text-stone-400 hover:text-rose-300" aria-label={tr('Remove “{shortName}”', { shortName: shortName(e.datasheetId) })} onClick={() => { setOpen(null); setList(withoutEntry(list, i)) }}>✕</button>
              </div>
              {isCharacterDatasheet(e.datasheetId) && (
                <label className="mt-0.5 flex items-center gap-1 pl-3 text-[11px] text-stone-400">
                  {attachKind(e.datasheetId) === 'support' ? tr('Support, joins:') : tr('Leader, joins:')}
                  <select
                    className="input w-auto py-0 text-[11px]"
                    aria-label={tr('Unit “{shortName}” joins', { shortName: shortName(e.datasheetId) })}
                    value={joins[i] ?? 'none'}
                    onChange={(ev) => edit(list.units.map((x, j) => (j === i ? { ...x, attachTo: ev.target.value === 'none' ? null : Number(ev.target.value) } : x)))}
                  >
                    {attachKind(e.datasheetId) === 'leader' && <option value="none">{tr('nobody: on its own')}</option>}
                    {joins[i] === null && attachKind(e.datasheetId) === 'support' && <option value="none">{tr('— choose a unit —')}</option>}
                    {list.units.map((b, j) => (canLead(e.datasheetId, b.datasheetId) ? <option key={j} value={j}>{tr('{shortName} (no. {n})', { shortName: shortName(b.datasheetId), n: j + 1 })}</option> : null))}
                  </select>
                </label>
              )}
              {open === i && (
                <LoadoutEditor
                  entry={e}
                  onChange={(loadout) => edit(list.units.map((x, j) => (j === i ? (loadout ? { ...x, loadout } : (({ loadout: _l, ...rest }) => rest)(x)) : x)))}
                />
              )}
              </li>
            ))}
          </ul>

          <select
            className="input mt-2 text-xs"
            aria-label={tr('Add a unit')}
            value=""
            onChange={(e) => {
              const id = e.target.value
              if (id) edit([...list.units, { datasheetId: id, size: legalSizes(id)[0] }])
            }}
          >
            <option value="">{tr('+ Add a unit…')}</option>
            {datasheetsOf(faction).map((d) => {
              const n = legalSizes(d.id)[0]
              const full = copies(d.id) >= maxCopies(d.id)
              return (
                <option key={d.id} value={d.id} disabled={full}>
                  {tr('{shortName} × {n} — {listedCost} pts', { shortName: shortName(d.id), n, listedCost: listedCost(d.id, n, copies(d.id) + 1) })}{full ? tr(' (already {maxCopies})', { maxCopies: maxCopies(d.id) }) : ''}
                </option>
              )
            })}
          </select>

          {problems.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-xs text-rose-300" aria-label={tr('Roster errors')}>
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
