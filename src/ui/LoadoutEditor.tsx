import { composeUnit, type ListEntry } from '../game/army/armyList'
import { loadoutOf, loadoutProblems, WARGEAR, type Loadout } from '../game/army/wargear'
import { PROFILES, WEAPONS } from '../game/data/datasheets'
import { weaponAdvice, weaponReach } from '../game/weaponAdvice'

/** The weapons a model profile carries with their reach, and the first hint of the most notable one («🔨 Пробивает технику…»). */
function VariantWeapons({ profile }: { profile: string }) {
  const weapons = PROFILES[profile]?.weapons.map((id) => WEAPONS[id]).filter(Boolean) ?? []
  const ranged = weapons.filter((w) => w.profiles[0].range !== 'melee')
  const hint = ranged[0] ? weaponAdvice(ranged[0].profiles[0]).lines[0] : weapons[0] ? weaponAdvice(weapons[0].profiles[0]).lines[0] : ''
  return (
    <span className="block text-[10px] text-stone-400">
      {weapons.map((w) => `${w.name.replace(/ \(.*\)$/, '')} — ${weaponReach(w)}`).join(', ')}
      {hint && <span className="block text-emerald-300">{hint}</span>}
    </span>
  )
}

/** Wargear editor for one army list entry: the leader's weapons and how many models take each option, within the
 * datasheet's limits. Changes are saved into the entry's `loadout`; «Как в датащите по умолчанию» removes it. */
export function LoadoutEditor({ entry, onChange }: { entry: ListEntry; onChange: (loadout: Loadout | undefined) => void }) {
  const spec = WARGEAR[entry.datasheetId]
  if (!spec) return null
  const current = entry.loadout ?? loadoutOf(spec, composeUnit(entry.datasheetId, entry.size))
  const problems = loadoutProblems(entry.datasheetId, entry.size, current)
  const troopers = entry.size - (spec.leader ? 1 : 0)
  const taken = Object.values(current.counts).reduce((a, b) => a + b, 0)
  const set = (profile: string, n: number) => onChange({ ...current, counts: { ...current.counts, [profile]: Math.max(0, n) } })
  return (
    <div className="mt-1 rounded border border-stone-600 bg-stone-950/60 p-2 text-xs" aria-label={`Снаряжение «${entry.datasheetId}»`} data-testid="loadout-editor">
      {spec.leader && spec.leader.length > 1 && (
        <label className="block">
          {entry.size === 1 ? 'Оружие' : 'Командир отряда'}:{' '}
          <select className="input inline-block w-auto py-0.5 text-xs" value={current.leader ?? spec.leader[0].profile} onChange={(e) => onChange({ ...current, leader: e.target.value })}>
            {spec.leader.map((v) => <option key={v.profile} value={v.profile}>{v.label}</option>)}
          </select>
          <VariantWeapons profile={current.leader ?? spec.leader[0].profile} />
        </label>
      )}
      {spec.groups.map((g) => (
        <fieldset key={g.id} className="mt-1">
          <legend className="text-stone-300">{g.label}</legend>
          {g.variants.map((v) => {
            const n = current.counts[v.profile] ?? 0
            return (
              <div key={v.profile} className="flex items-start gap-2 py-0.5">
                <div className="flex items-center gap-1">
                  <button type="button" className="btn px-1.5 py-0 text-xs" aria-label={`Меньше: ${v.label}`} disabled={n === 0} onClick={() => set(v.profile, n - 1)}>−</button>
                  <span className="w-4 text-center" aria-label={`Сколько: ${v.label}`}>{n}</span>
                  <button type="button" className="btn px-1.5 py-0 text-xs" aria-label={`Больше: ${v.label}`} disabled={taken >= troopers} onClick={() => set(v.profile, n + 1)}>+</button>
                </div>
                <div className="min-w-0 flex-1">
                  {v.label}
                  <VariantWeapons profile={v.profile} />
                </div>
              </div>
            )
          })}
        </fieldset>
      ))}
      {spec.groups.length > 0 && (
        <div className="mt-1 text-stone-400">Остальные {Math.max(0, troopers - taken)}: {spec.base.label}.<VariantWeapons profile={spec.base.profile} /></div>
      )}
      {problems.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-rose-300">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      {entry.loadout && (
        <button type="button" className="btn mt-1 text-xs" onClick={() => onChange(undefined)}>Как в датащите по умолчанию</button>
      )}
    </div>
  )
}
