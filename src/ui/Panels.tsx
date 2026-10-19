import { useEffect, useState } from 'react'
import { FACTION_STYLE, TOKENS, tokenImageFor } from '../assets/manifest'
import { ABILITY_TEXT, FACTION_NAME, PROFILES } from '../game/data/datasheets'
import { actor, maxMove, moveModeFor, PHASE_NAME, shootPlan, unitActions, validate } from '../game/engine'
import { alive, datasheetOf, engagedUnits, fmt, isDestroyed, profileOf, weaponsOf } from '../game/gameState'
import { scenarioById } from '../game/scenarios/scenarios'
import type { Command, DiceEntry, GameState, UnitState, WeaponKeywords } from '../game/types'
import { PHASES } from '../game/types'
import { useStore } from '../store'
import { LESSONS, PHASE_HELP, showAt } from './help'
import { canActNow } from './guidance'
import { fileToTokenDataUrl } from './imageUpload'


// ---------------------------------------------------------------- left: roster

export function RosterPanel() {
  const game = useStore((s) => s.game)!
  const selected = useStore((s) => s.selectedUnitId)
  const select = useStore((s) => s.select)
  const human = useStore((s) => s.settings.human)
  const sel = game.units.find((u) => u.id === selected)
  return (
    <div className="flex flex-col gap-3">
      {(['marines', 'orks'] as const).map((p) => (
        <section key={p}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: FACTION_STYLE[p].secondary }}>
            {FACTION_NAME[p]} {p === human ? '(вы)' : '(ИИ)'} · CP {game.players[p].cp} · ПО {game.players[p].vp}
          </h3>
          {game.units.filter((u) => u.owner === p).map((u) => (
            <button
              key={u.id}
              onClick={() => select(u.id)}
              className={`mb-1 w-full rounded border px-2 py-1 text-left text-sm ${u.id === selected ? 'border-yellow-400 bg-stone-700' : 'border-stone-600 bg-stone-800 hover:bg-stone-700'} ${isDestroyed(u) ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-2">
                <Avatar profileId={u.models[0].profileId} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{u.name}</span>
                    <span className="text-xs text-stone-400">{alive(u).length}/{u.startingModels} мод.</span>
                  </div>
                  {canActNow(game, u) && u.owner === human && <div className="text-[11px] text-emerald-400">● может действовать</div>}
                  <UnitStatus u={u} />
                </div>
              </div>
            </button>
          ))}
        </section>
      ))}
      {sel && <UnitDetails u={sel} />}
    </div>
  )
}

function Avatar({ profileId, size }: { profileId: string; size: number }) {
  const custom = useStore((s) => s.customTokens)
  const src = tokenImageFor(profileId, custom)
  return src ? (
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full border-2" style={{ borderColor: TOKENS[profileId]?.stroke }} />
  ) : null
}

function PhotoUpload({ profileId, name }: { profileId: string; name: string }) {
  const st = useStore()
  const has = !!st.customTokens[profileId]
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Avatar profileId={profileId} size={30} />
      <span className="flex-1">{name}</span>
      <label className="cursor-pointer text-sky-300 underline">
        {has ? 'заменить' : 'своё фото'}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          aria-label={`Загрузить фото: ${name}`}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              st.setCustomToken(profileId, await fileToTokenDataUrl(f))
            } catch (err) {
              st.setMessage((err as Error).message, 'error')
            }
          }}
        />
      </label>
      {has && <button className="text-stone-400 underline" onClick={() => st.setCustomToken(profileId, null)}>сбросить</button>}
    </div>
  )
}

function UnitStatus({ u }: { u: UnitState }) {
  const tags: string[] = []
  if (isDestroyed(u)) tags.push('уничтожен')
  if (u.battleShocked) tags.push('боевой шок')
  if (u.move === 'normal') tags.push('двигался')
  if (u.move === 'advance' || u.advanceRoll !== null) tags.push(`продвижение +${u.advanceRoll ?? '?'}″`)
  if (u.move === 'fallBack') tags.push('отступил')
  if (u.shot) tags.push('стрелял')
  if (u.charged) tags.push('атаковал')
  if (u.fought) tags.push('сражался')
  if (!tags.length) return null
  return <div className="text-[11px] text-amber-300">{tags.join(' · ')}</div>
}

function UnitDetails({ u }: { u: UnitState }) {
  const ds = datasheetOf(u)
  const profiles = [...new Set(u.models.map((m) => m.profileId))].map((id) => PROFILES[id])
  const weapons = [...new Map(u.models.flatMap((m) => weaponsOf(m)).map((w) => [w.id, w])).values()]
  return (
    <section className="rounded border border-stone-600 bg-stone-900 p-2 text-xs" aria-label="Карточка отряда">
      <div className="flex items-center gap-2">
        <Avatar profileId={u.models[0].profileId} size={44} />
        <h3 className="text-sm font-semibold">{ds.name}</h3>
      </div>
      <p className="text-stone-400">{FACTION_NAME[u.owner]} · {ds.keywords.join(', ')}</p>
      <table className="mt-1 w-full text-center">
        <thead className="text-stone-400"><tr><th className="text-left">Модель</th><th>M</th><th>T</th><th>Sv</th><th>W</th><th>Ld</th><th>OC</th></tr></thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id}><td className="text-left">{p.name}</td><td>{p.m}″</td><td>{p.t}</td><td>{p.sv}+</td><td>{p.w}</td><td>{p.ld}+</td><td>{p.oc}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1">
        {alive(u).map((m) => (
          <span key={m.id} className="mr-1 inline-block rounded px-1" style={{ background: TOKENS[m.profileId].fill }}>
            {TOKENS[m.profileId].label} {m.wounds}/{profileOf(m).w}
          </span>
        ))}
      </div>
      <table className="mt-2 w-full text-center">
        <thead className="text-stone-400"><tr><th className="text-left">Оружие</th><th>Дист.</th><th>A</th><th>BS/WS</th><th>S</th><th>AP</th><th>D</th></tr></thead>
        <tbody>
          {weapons.flatMap((w) => w.profiles.map((p, i) => (
            <tr key={w.id + i} title={keywordText(p.keywords)}>
              <td className="text-left">{w.name}{p.name ? ` — ${p.name}` : ''}{keywordText(p.keywords) && <span className="block text-[10px] text-sky-300">{keywordText(p.keywords)}</span>}</td>
              <td>{p.range === 'melee' ? 'ближ.' : `${p.range}″`}</td><td>{p.attacks}</td><td>{p.skill ? `${p.skill}+` : 'авто'}</td><td>{p.s}</td><td>{p.ap}</td><td>{p.d}</td>
            </tr>
          )))}
        </tbody>
      </table>
      <ul className="mt-2 list-disc pl-4 text-stone-300">
        {ds.abilities.map((a) => <li key={a}>{ABILITY_TEXT[a]}</li>)}
      </ul>
      <details className="mt-2">
        <summary className="cursor-pointer text-stone-300">📷 Фото моделей</summary>
        <p className="my-1 text-[11px] text-stone-400">Сфотографируйте свои миниатюры из набора сверху или спереди — фото заменят нарисованные фишки. Хранится только в этом браузере.</p>
        {profiles.map((p) => <PhotoUpload key={p.id} profileId={p.id} name={p.name} />)}
      </details>
      {(u.datasheetId === 'boyz') && (
        <p className="mt-1 text-[11px] text-amber-400">Учебная конфигурация Introductory Set: в официальном datasheet Бойз минимум 10 моделей и 1 спецоружие на 10 моделей.</p>
      )}
    </section>
  )
}

function keywordText(k: WeaponKeywords) {
  const parts: string[] = []
  if (k.rapidFire) parts.push(`Rapid Fire ${k.rapidFire}`)
  if (k.heavy) parts.push('Heavy')
  if (k.assault) parts.push('Assault')
  if (k.closeQuarters) parts.push('Close-quarters')
  if (k.blast) parts.push(`Blast ${k.blast}`)
  if (k.torrent) parts.push('Torrent')
  if (k.lethalHits) parts.push('Lethal Hits')
  if (k.hazardous) parts.push('Hazardous')
  if (k.cleave) parts.push(`Cleave ${k.cleave}*`)
  return parts.join(', ')
}

// ---------------------------------------------------------------- right: actions

export function ActionPanel() {
  const st = useStore()
  const game = st.game!
  const human = st.settings.human
  const explain = st.settings.explain
  const sel = game.units.find((u) => u.id === st.selectedUnitId) ?? null
  const myTurn = actor(game) === human
  return (
    <div className="flex flex-col gap-3 text-sm">
      <PhaseTrack game={game} />
      {game.winner ? (
        <div className="rounded border border-yellow-500 bg-yellow-900/40 p-3 text-center">
          <div className="text-lg font-bold">{game.winner === 'draw' ? 'Ничья' : `Победа: ${FACTION_NAME[game.winner]}`}</div>
          <div>Счёт ПО — Космодесант {game.players.marines.vp} : {game.players.orks.vp} Орки</div>
          <button className="btn mt-2" onClick={() => st.newGame()}>Новая битва</button>
        </div>
      ) : (
        <div className={`rounded p-2 ${myTurn ? 'bg-emerald-900/40' : 'bg-stone-700/60'}`}>
          {myTurn ? 'Ваше решение.' : `Ходит ИИ (${FACTION_NAME[actor(game)]})…`}
          {explain !== 'minimal' && <p className="mt-1 text-xs text-stone-300">{PHASE_HELP[game.phase].short}</p>}
          {explain === 'beginner' && (
            <details className="mt-1 text-xs text-stone-300">
              <summary className="cursor-pointer text-sky-300">Правила фазы подробнее</summary>
              <p className="mt-1">{PHASE_HELP[game.phase].long}</p>
            </details>
          )}
        </div>
      )}
      {st.settings.tutorial && <Tutorial />}
      {!game.winner && myTurn && game.phase === 'command' && human === 'orks' && (
        <ActionButton cmd={{ type: 'callWaaagh' }} label="WAAAGH! (Боевой клич, раз за битву)" />
      )}
      {sel ? <UnitActions u={sel} /> : <p className="text-stone-400">Выберите отряд на поле или в списке.</p>}
      <AiNotes />
    </div>
  )
}

function PhaseTrack({ game }: { game: GameState }) {
  return (
    <div>
      <div className="mb-1 text-xs text-stone-400">Раунд {game.round}/{game.maxRounds} · ход: <b style={{ color: FACTION_STYLE[game.activePlayer].secondary }}>{FACTION_NAME[game.activePlayer]}</b></div>
      <ol className="flex flex-wrap gap-1">
        {PHASES.map((p) => (
          <li key={p} className={`rounded px-1.5 py-0.5 text-[11px] ${p === game.phase ? 'bg-yellow-500 font-semibold text-black' : 'bg-stone-700 text-stone-300'}`}>
            {PHASE_NAME[p].split(' (')[0].replace('Фаза ', '')}
          </li>
        ))}
      </ol>
    </div>
  )
}

function ActionButton({ cmd, label, reason }: { cmd: Command; label: string; reason?: string }) {
  const st = useStore()
  const v = validate(st.game!, cmd)
  const why = reason ?? (v.ok ? undefined : v.reason)
  return (
    <div>
      <button className="btn w-full text-left" disabled={!v.ok} onClick={() => st.dispatch(cmd)}>{label}</button>
      {why && <p className="mt-0.5 text-[11px] text-rose-300">⛔ {why}</p>}
    </div>
  )
}

function UnitActions({ u }: { u: UnitState }) {
  const st = useStore()
  const game = st.game!
  const human = st.settings.human
  if (isDestroyed(u)) return <p className="text-stone-400">{u.name}: отряд уничтожен.</p>
  if (u.owner !== human) {
    return (
      <div className="rounded border border-stone-600 p-2">
        <b>{u.name}</b> — отряд противника. {st.settings.explain !== 'minimal' && 'Выберите свой отряд, чтобы действовать. Линейкой можно измерить расстояние до этого отряда.'}
      </div>
    )
  }
  if (actor(game) !== human) return <p className="text-stone-400">Дождитесь своего хода.</p>

  const actions = unitActions(game, u.id)
  return (
    <div className="flex flex-col gap-2 rounded border border-stone-600 p-2">
      <b>{u.name}: действия</b>
      {game.phase === 'command' && <p className="text-xs text-stone-300">В фазе командования отрядам нечего делать — нажмите «Завершить фазу».</p>}
      {game.phase === 'movement' && <MoveControls u={u} />}
      {game.phase === 'shooting' && <ShootControls u={u} />}
      {actions.filter((a) => !a.id.startsWith('shoot:')).map((a) => (
        <ActionButton key={a.id} cmd={a.cmd!} label={a.label} />
      ))}
      {game.phase === 'fight' && !game.fight && <p className="text-xs text-stone-300">Бои завершены — завершите фазу.</p>}
    </div>
  )
}

function MoveControls({ u }: { u: UnitState }) {
  const st = useStore()
  const game = st.game!
  const mode = moveModeFor(game, u)
  const hasDraft = Object.keys(st.draft).length > 0
  const cmd = { type: 'move' as const, unitId: u.id, mode, positions: st.draft }
  const v = hasDraft ? validate(game, cmd) : null
  if (u.move !== 'none') return <p className="text-xs text-stone-300">Отряд уже двигался в этой фазе.</p>
  const label = { normal: 'Обычное движение', advance: 'Продвижение', fallBack: 'Отступление (Fall Back)' }[mode]
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-stone-300">
        Режим: <b>{label}</b>, до {fmt(maxMove(u))}″. {engagedUnits(game, u).length > 0 && 'Отряд в контакте с врагом — можно только отступить или остаться.'}
      </p>
      {hasDraft && v && !v.ok && <p className="text-[11px] text-rose-300">⛔ {v.reason}</p>}
      {hasDraft && v?.ok && <p className="text-[11px] text-emerald-300">✓ Позиция допустима — «Подтвердить» на панели под полем (или Enter).</p>}
      {!hasDraft && <p className="text-[11px] text-stone-400">Перетащите модель на поле. Если отряд не двигается — он остаётся на месте (Remain Stationary).</p>}
    </div>
  )
}

function ShootControls({ u }: { u: UnitState }) {
  const st = useStore()
  const game = st.game!
  const multi = [...new Map(alive(u).flatMap((m) => weaponsOf(m)).filter((w) => w.profiles.length > 1 && w.profiles[0].range !== 'melee').map((w) => [w.id, w])).values()]
  const opts = st.shotOptions
  const enemies = game.units.filter((e) => e.owner !== u.owner && !isDestroyed(e))
  return (
    <div className="flex flex-col gap-1">
      {multi.map((w) => (
        <label key={w.id} className="text-xs">
          {w.name}:{' '}
          <select className="rounded bg-stone-700 px-1" value={opts.profiles[w.id] ?? 0} onChange={(e) => st.setShotOptions({ profiles: { ...opts.profiles, [w.id]: Number(e.target.value) } })}>
            {w.profiles.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
          </select>
        </label>
      ))}
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={opts.usePistols} onChange={(e) => st.setShotOptions({ usePistols: e.target.checked })} /> Стрелять из пистолетов (Close-quarters)
      </label>
      {datasheetOf(u).abilities.includes('ammoRunts') && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" disabled={u.ammoRuntsUsed} checked={opts.useAmmoRunts && !u.ammoRuntsUsed} onChange={(e) => st.setShotOptions({ useAmmoRunts: e.target.checked })} /> Гроты-подносчики (+1 к попаданию, раз за битву){u.ammoRuntsUsed && ' — использовано'}
        </label>
      )}
      {enemies.map((e) => {
        const cmd = { type: 'shoot' as const, unitId: u.id, targetId: e.id, ...opts }
        const plan = shootPlan(game, u, e, opts)
        return (
          <div key={e.id}>
            <ActionButton cmd={cmd} label={`Стрелять по «${e.name}»${plan.cover && !plan.problem ? ' (в укрытии)' : ''}`} />
            {!plan.problem && st.settings.explain === 'beginner' && (
              <p className="text-[11px] text-stone-400">
                {plan.groups.map((g) => `${g.weaponName.split(' (')[0]}: ${g.attacks} атак${g.notes.length ? ` (${g.notes.join(', ')})` : ''}`).join('; ')}
                {plan.skipped.length > 0 && ` · не стреляют: ${plan.skipped.length}`}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function AiNotes() {
  const notes = useStore((s) => s.aiNotes)
  if (!notes.length) return null
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">Решения ИИ</h3>
      <ul className="flex max-h-48 flex-col-reverse gap-1 overflow-y-auto text-xs">
        {[...notes].reverse().map((n) => <li key={n.id} className="rounded bg-stone-700/60 px-2 py-1">🤖 {n.text}</li>)}
      </ul>
    </section>
  )
}

function Tutorial() {
  const st = useStore()
  const game = st.game!
  const human = st.settings.human
  const i = st.tutorialStep
  const done = i < LESSONS.length && LESSONS[i].done(game, st, human, st.tutorialStart)
  const advance = st.setTutorialStep
  useEffect(() => {
    if (done) advance(i + 1)
  }, [done, advance, i])
  if (i >= LESSONS.length) return (
    <div className="rounded border border-sky-700 bg-sky-950/50 p-2 text-xs">🎓 Обучение пройдено. Отключить подсказки можно в настройках.</div>
  )
  const l = LESSONS[i]
  return (
    <div className="rounded border border-sky-600 bg-sky-950/60 p-2 text-xs" aria-label="Обучение">
      <div className="mb-1 font-semibold text-sky-200">🎓 {l.title} <span className="text-sky-400">({i + 1}/{LESSONS.length})</span></div>
      <p>{l.text(human)}</p>
      <button className="mt-1 text-sky-300 underline" onClick={() => st.setTutorialStep(i + 1)}>Пропустить шаг</button>
    </div>
  )
}

// ---------------------------------------------------------------- bottom: logs

export function DiceFaces({ entry, compact = false }: { entry: DiceEntry; compact?: boolean }) {
  const explain = useStore((s) => s.settings.explain)
  return (
    <div className="flex flex-col gap-1">
      {entry.steps.map((s, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1">
          <span className="w-24 shrink-0 text-[11px] text-stone-400">{s.label} {s.target !== '—' && s.target}</span>
          {s.dice.map((d, j) => (
            <span
              key={j}
              title={d.rerolledFrom ? `переброшено (было ${d.rerolledFrom})` : undefined}
              className={`die ${d.success ? 'die-ok' : 'die-fail'} ${d.critical ? 'die-crit' : ''} ${compact ? '' : 'die-anim'}`}
              style={{ animationDelay: `${j * 25}ms` }}
            >
              {d.value}
            </span>
          ))}
          {s.note && explain !== 'minimal' && <span className="text-[11px] text-stone-300">{s.note}</span>}
        </div>
      ))}
      <div className="text-xs text-stone-200">{entry.summary}</div>
    </div>
  )
}

export function BottomPanel() {
  const st = useStore()
  const game = st.game!
  const [tab, setTab] = useState<'dice' | 'log'>('dice')
  const [open, setOpen] = useState<number | null>(null)
  const human = st.settings.human
  const log = game.log.filter((l) => showAt(l.level, st.settings.explain))
  return (
    <div className="flex h-full flex-col gap-2 md:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1 flex gap-1">
          <button className={`tab ${tab === 'dice' ? 'tab-on' : ''}`} onClick={() => setTab('dice')}>Кубики ({game.diceLog.length})</button>
          <button className={`tab ${tab === 'log' ? 'tab-on' : ''}`} onClick={() => setTab('log')}>Журнал</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded bg-stone-900 p-2 text-xs" aria-live="polite">
          {tab === 'dice'
            ? [...game.diceLog].reverse().map((d, idx) => (
                <div key={d.id} className="mb-2 border-b border-stone-700 pb-1">
                  <button className="w-full text-left font-medium text-stone-100" onClick={() => setOpen(open === d.id ? null : d.id)}>
                    <span style={{ color: FACTION_STYLE[d.player].secondary }}>■</span> Р{d.round} · {d.title}
                  </button>
                  {idx === 0 || open === d.id ? <DiceFaces entry={d} compact={idx !== 0} /> : <div className="text-stone-400">{d.summary}</div>}
                </div>
              ))
            : [...log].reverse().map((l) => (
                <div key={l.id} className="border-b border-stone-800 py-0.5">
                  <span className="text-stone-500">Р{l.round}</span> <span style={{ color: FACTION_STYLE[l.player].secondary }}>■</span> {l.text}
                </div>
              ))}
        </div>
      </div>
      <div className="flex w-full flex-col gap-1 md:w-56">
        <p className="text-[11px] text-stone-400">{PHASE_NAME[game.phase]} · ход: {FACTION_NAME[game.activePlayer]}{actor(game) !== human ? ' (ИИ)' : ''}</p>
        <p className="text-[11px] text-stone-500">Клавиши: Enter — подтвердить движение, Esc — отмена, R — линейка.</p>
        <button className="btn" disabled={!st.history.length} onClick={() => st.undo()} title="Отмена доступна для действий без бросков кубиков">↶ Отменить</button>
        <button className="btn" onClick={() => { if (confirm('Начать сценарий заново? Текущий прогресс (автосохранение) будет заменён.')) st.newGame() }}>⟲ Заново</button>
        <p className="text-[11px] text-stone-500">{scenarioById(game.scenarioId).name}</p>
      </div>
    </div>
  )
}
