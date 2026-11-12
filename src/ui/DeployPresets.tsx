import { useEffect, useMemo, useState } from 'react'
import { DEPLOY_PRESETS, deployWithPreset, presetFit, recommendedPreset, type DeployPresetId, type PresetResult } from '../game/army/deployPresets'
import { ROLE_ICON, ROLE_NAME, type UnitRole } from '../game/army/roles'
import { alive, other, radiusOf, sidesOf, unitsOf } from '../game/gameState'
import { deploymentZone } from '../game/rules/deployment'
import type { GameState, PlayerId } from '../game/types'
import { useStore } from '../store'
import { tr } from '../i18n/index'

// Deployment presets as cards: each shows where this army would stand in that doctrine on this board,
// against the enemy already set up, and how well the doctrine suits the army. A click sets everyone up.

const ROLE_COLOR: Record<UnitRole, string> = {
  assault: '#f97316',
  shooter: '#38bdf8',
  screen: '#a8a29e',
  character: '#facc15',
  infiltrator: '#c084fc',
}

/** The board in miniature: terrain, objectives, the enemy (grey) and the preset's positions coloured by role. */
function MiniBoard({ game, human, res }: { game: GameState; human: PlayerId; res: PresetResult | null }) {
  const { width: w, height: h } = game.board
  const zone = deploymentZone(game, human)
  const foes = unitsOf(game, other(game, human))
  const mine = unitsOf(game, human)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full rounded bg-slate-900" aria-hidden>
      <polygon points={zone.map((p) => `${p.x},${p.y}`).join(' ')} fill="#eab30822" stroke="#eab30866" strokeWidth={0.2} strokeDasharray="0.6 0.4" />
      {game.terrain.map((t) => (
        <polygon key={t.id} points={t.poly.map((p) => `${p.x},${p.y}`).join(' ')} fill={t.obscuring ? '#64748b' : '#334155'} />
      ))}
      {game.objectives.map((o) => (
        <circle key={o.id} cx={o.pos.x} cy={o.pos.y} r={0.9} fill="none" stroke="#fde68a" strokeWidth={0.3} />
      ))}
      {foes.flatMap((u) => alive(u).map((m) => <circle key={m.id} cx={m.pos.x} cy={m.pos.y} r={Math.max(0.35, radiusOf(m))} fill="#78716c" />))}
      {res &&
        mine.flatMap((u) =>
          alive(u).map((m) => {
            const p = res.positions[m.id] ?? m.pos
            return <circle key={m.id} cx={p.x} cy={p.y} r={Math.max(0.35, radiusOf(m))} fill={ROLE_COLOR[res.roles[u.id] ?? 'screen']} />
          }),
        )}
    </svg>
  )
}

/** Names of the units the preset puts nearest the front, for the card. */
function frontLine(game: GameState, human: PlayerId, res: PresetResult): string {
  const zone = deploymentZone(game, human)
  const xs = zone.map((p) => p.x)
  const front = sidesOf(game)[0] === human ? Math.max(...xs) : Math.min(...xs)
  const units = unitsOf(game, human)
    .filter((u) => res.roles[u.id] !== 'character')
    .map((u) => {
      const ps = alive(u).map((m) => res.positions[m.id] ?? m.pos)
      return { u, d: Math.min(...ps.map((p) => Math.abs(p.x - front))) }
    })
    .sort((a, b) => a.d - b.d)
  return units.slice(0, 2).map((x) => x.u.name).join(', ')
}

export function DeployPresetCards() {
  const game = useStore((s) => s.game!)
  const human = useStore((s) => s.settings.human)
  const deployPreset = useStore((s) => s.deployPreset)
  const [chosen, setChosen] = useState<DeployPresetId | null>(null)
  // the presets depend on the board and the enemy, not on where the player's own units stand now
  const key = useMemo(
    () => JSON.stringify([game.scenarioId, game.terrain, unitsOf(game, other(game, human)).map((u) => alive(u).map((m) => m.pos)), unitsOf(game, human).map((u) => u.id)]),
    [game, human],
  )
  const [results, setResults] = useState<{ key: string; byId: Partial<Record<DeployPresetId, PresetResult>> }>({ key: '', byId: {} })
  useEffect(() => {
    // one preset per tick, so the panel shows up at once and the cards fill in
    let cancelled = false
    const byId: Partial<Record<DeployPresetId, PresetResult>> = {}
    const ids = DEPLOY_PRESETS.map((p) => p.id)
    const step = (i: number) => {
      if (cancelled || i >= ids.length) return
      byId[ids[i]] = deployWithPreset(game, human, ids[i], true)
      setResults({ key, byId: { ...byId } })
      setTimeout(() => step(i + 1), 0)
    }
    const t = setTimeout(() => step(0), 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // `key` stands for the parts of `game` the presets read
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const byId = results.key === key ? results.byId : {}
  const best = recommendedPreset(game, human)
  const roles = Object.values(byId)[0]?.roles

  return (
    <div aria-label={tr('Quick deployment')}>
      <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">{tr('⚡ Quick deployment')}</h3>
      <p className="mb-1 text-[11px] text-stone-400">{tr('Choose a formation — the whole army will line up in it. Afterwards any unit can be moved.')}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {DEPLOY_PRESETS.map((p) => {
          const res = byId[p.id] ?? null
          const fit = presetFit(game, human, p.id)
          return (
            <button
              key={p.id}
              onClick={() => {
                setChosen(p.id)
                deployPreset(p.id)
              }}
              title={p.blurb}
              aria-pressed={chosen === p.id}
              className={`flex flex-col gap-1 rounded border p-1.5 text-left ${chosen === p.id ? 'border-yellow-400 bg-stone-700' : 'border-stone-600 bg-stone-800 hover:bg-stone-700'}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold">
                  {p.icon} {p.name}
                </span>
                {p.id === best && <span className="rounded bg-emerald-700 px-1 text-[10px] text-emerald-50">{tr('rec.')}</span>}
              </div>
              {res ? <MiniBoard game={game} human={human} res={res} /> : <div className="aspect-[3/2] w-full animate-pulse rounded bg-slate-900" />}
              <div className="h-1 w-full rounded bg-stone-700">
                <div className="h-1 rounded bg-emerald-400" style={{ width: `${Math.round(fit.fit * 100)}%` }} />
              </div>
              <div className="text-[10px] leading-tight text-stone-400">{fit.why}</div>
              {res && <div className="text-[10px] leading-tight text-stone-300">{tr('In front: {frontLine}', { frontLine: frontLine(game, human, res) })}</div>}
            </button>
          )
        })}
      </div>
      {roles && (
        <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-stone-400">
          {(Object.keys(ROLE_COLOR) as UnitRole[])
            .filter((r) => Object.values(roles).includes(r))
            .map((r) => (
              <span key={r}>
                <span style={{ color: ROLE_COLOR[r] }}>●</span> {ROLE_ICON[r]} {ROLE_NAME[r]}
              </span>
            ))}
          <span>
            <span style={{ color: '#78716c' }}>●</span> {tr('opponent')}
          </span>
        </div>
      )}
    </div>
  )
}
