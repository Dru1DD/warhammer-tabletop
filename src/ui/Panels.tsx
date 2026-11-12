import { useEffect, useState } from 'react'
import { FACTION_STYLE, TOKENS, tokenImageFor } from '../assets/manifest'
import { ABILITY_TEXT, FACTION_NAME, PROFILES } from '../game/data/datasheets'
import { copyIndex, fmtPoints, pointsPerModel, unitPoints } from '../game/data/points'
import { actor, moveAllowance, moveCommand, moveModeFor, PHASE_NAME, shootPlan, stratagemActions, unitActions, validate } from '../game/engine'
import { alive, datasheetOf, engagedUnits, fmt, hasAbility, isDestroyed, isMV, other, profileOf, sidesOf, unitsOf, weaponsOf } from '../game/gameState'
import { hitRoll, saveTarget, toughness, woundTarget } from '../game/combat/attack'
import { fmtRandom } from '../game/dice/dice'
import { deploymentIssues, deploymentZone } from '../game/rules/deployment'
import { boxOf, fitBox, newPiece, TERRAIN_PRESETS, withBox, type TerrainPreset } from '../game/terrainLayout'
import { scenarioById } from '../game/scenarios/scenarios'
import type { Command, DiceEntry, GameState, UnitState, WeaponKeywords, WeaponProfile } from '../game/types'
import { PHASES } from '../game/types'
import { useStore } from '../store'
import { weaponAdvice } from '../game/weaponAdvice'
import { DETACHMENT, LATER_STRATAGEMS, STRATAGEM_IDS, STRATAGEMS } from '../game/rules/stratagems'
import { DOCTRINE_NAME, DOCTRINE_TEXT, DOCTRINES } from '../game/rules/detachments'
import type { PlayerId, StratagemId } from '../game/types'

/** Every Stratagem the player can use right now, grouped by Stratagem, with one button per unit (and target). */
function usableStratagems(game: GameState, human: PlayerId, selected?: string) {
  const groups = new Map<StratagemId, { unit: UnitState; cmd: Extract<Command, { type: 'stratagem' }> }[]>()
  for (const u of unitsOf(game, human)) {
    if (isDestroyed(u)) continue
    for (const a of stratagemActions(game, u.id)) {
      const cmd = a.cmd as Extract<Command, { type: 'stratagem' }>
      groups.set(cmd.id, [...(groups.get(cmd.id) ?? []), { unit: u, cmd }])
    }
  }
  // the selected unit's Stratagems first
  return [...groups].sort(([, a], [, b]) => Number(b.some((x) => x.unit.id === selected)) - Number(a.some((x) => x.unit.id === selected)))
}

/** «Рейнджеры», «Доминус → Ц2», «Катафроны → Бойз»: what a Stratagem button acts on. */
function stratagemTarget(game: GameState, unit: UnitState, cmd: Extract<Command, { type: 'stratagem' }>) {
  if (!cmd.targetId) return `«${unit.name}»`
  const o = game.objectives.findIndex((x) => x.id === cmd.targetId)
  const t = game.units.find((x) => x.id === cmd.targetId)
  return `«${unit.name}» → ${o >= 0 ? `Ц${o + 1}` : `«${t?.name ?? cmd.targetId}»`}`
}
import { adviceLine, adviceWarnings, shotAdvice, type TargetAdvice } from '../game/shotAdvice'
import { chargeForecast, forecastLine } from '../game/chargeAdvice'
import { DeployPresetCards } from './DeployPresets'
import { scoreText } from './score'
import { explainStep, LESSONS, PHASE_GOAL, PHASE_HELP, PHASE_NEXT, showAt, STAT_HELP, UNIT_ROLE } from './help'
import { canActNow, cpReminder, draftDistance, lastRoundWarning, nextPhaseLabel, PHASE_SHORT, phaseStatus } from './guidance'
import { fileToTokenDataUrl } from './imageUpload'
import { UnitRoleTips } from './UnitRoleTips'
import { leaveRoom } from '../multiplayer/session'


/** Who plays the other side: the computer in single-player, a person online. */
const rivalName = () => (useStore.getState().shared ? 'соперник' : 'ИИ')

// ---------------------------------------------------------------- left: roster

export function RosterPanel() {
  const game = useStore((s) => s.game)!
  const selected = useStore((s) => s.selectedUnitId)
  const select = useStore((s) => s.select)
  const human = useStore((s) => s.settings.human)
  const rival = useStore((s) => (s.shared ? 'соперник' : 'ИИ'))
  const open = useStore((s) => s.layout.roster)
  const toggle = useStore((s) => s.toggleLayout)
  const sel = game.units.find((u) => u.id === selected)
  if (!open) return (
    // collapsed rail: one avatar per unit, keeps selection one click away
    <nav className="flex flex-col items-center gap-2" aria-label="Отряды (свёрнуто)">
      <button className="board-btn text-sm" onClick={() => toggle('roster')} title="Показать отряды и характеристики" aria-label="Показать отряды">»</button>
      {game.units.map((u) => (
        <button
          key={u.id}
          onClick={() => select(u.id)}
          title={`${u.name} (${FACTION_NAME[u.owner]}) · ${alive(u).length}/${u.startingModels} мод.`}
          aria-label={u.name}
          aria-pressed={u.id === selected}
          className={`relative rounded-full ${u.id === selected ? 'ring-2 ring-yellow-400' : ''} ${isDestroyed(u) ? 'opacity-40' : ''}`}
        >
          <Avatar profileId={u.models[0].profileId} size={38} />
          {u.owner === human && canActNow(game, u) && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-stone-900 bg-emerald-400" title="может действовать" />}
        </button>
      ))}
    </nav>
  )
  return (
    <div className="flex flex-col gap-3">
      <button className="self-end text-xs text-stone-400 hover:text-stone-100" onClick={() => toggle('roster')} title="Свернуть панель отрядов">« свернуть</button>
      {sidesOf(game).map((p) => (
        <section key={p}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: FACTION_STYLE[p].secondary }}>
            {FACTION_NAME[p]} {p === human ? '(вы)' : `(${rival})`} · CP {game.players[p].cp} · ПО {game.players[p].vp}
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
  const units = useStore((s) => s.game?.units)
  const copy = copyIndex(units ?? [u], units?.find((x) => x.id === u.id) ?? u)
  const profiles = [...new Set(u.models.map((m) => m.profileId))].map((id) => PROFILES[id])
  const weapons = [...new Map(u.models.flatMap((m) => weaponsOf(m)).map((w) => [w.id, w])).values()]
  return (
    <section className="rounded border border-stone-600 bg-stone-900 p-2 text-xs" aria-label="Карточка отряда">
      <div className="flex items-center gap-2">
        <Avatar profileId={u.models[0].profileId} size={44} />
        <h3 className="text-sm font-semibold">{ds.name}</h3>
      </div>
      <p className="text-stone-400">{FACTION_NAME[u.owner]} · {ds.keywords.join(', ')}</p>
      {ds.description && <p className="mt-1 text-stone-200">{ds.description}</p>}
      <UnitRoleTips u={u} />
      <p className="mt-1 text-amber-200" aria-label="Стоимость отряда">
        Стоимость: {fmtPoints(unitPoints(u.datasheetId, u.startingModels, copy))}
        <span className="text-stone-400"> · {u.startingModels} мод., ≈ {pointsPerModel(u.datasheetId, u.startingModels, copy)} очк. за модель</span>
      </p>
      <table className="mt-1 w-full text-center">
        <thead className="text-stone-400"><tr><th className="text-left">Модель</th>{['M', 'T', 'Sv', 'W', 'Ld', 'OC'].map((k) => <StatTh key={k} k={k} />)}</tr></thead>
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
        <thead className="text-stone-400"><tr><th className="text-left">Оружие</th>{['Дист.', 'A', 'BS/WS', 'S', 'AP', 'D'].map((k) => <StatTh key={k} k={k} />)}</tr></thead>
        <tbody>
          {weapons.flatMap((w) => w.profiles.map((p, i) => (
            <tr key={w.id + i} title={keywordText(p.keywords)}>
              <td className="text-left">
                {w.name}{p.name ? ` — ${p.name}` : ''}
                {keywordText(p.keywords) && <span className="block text-[10px] text-sky-300">{keywordText(p.keywords)}</span>}
                <WeaponHints p={p} />
              </td>
              <td>{p.range === 'melee' ? 'ближ.' : `${p.range}″`}</td><td>{fmtRandom(p.attacks, p.randomA)}</td><td>{p.skill ? `${p.skill}+` : 'авто'}</td><td>{p.s}</td><td>{p.ap}</td><td>{fmtRandom(p.d, p.randomD)}</td>
            </tr>
          )))}
        </tbody>
      </table>
      <StatGlossary />
      <ul className="mt-2 list-disc pl-4 text-stone-300">
        {ds.abilities.map((a) => <li key={a}>{ABILITY_TEXT[a]}</li>)}
      </ul>
      <details className="mt-2">
        <summary className="cursor-pointer text-stone-300">📷 Фото моделей</summary>
        <p className="my-1 text-[11px] text-stone-400">Сфотографируйте свои миниатюры из набора сверху или спереди — фото заменят нарисованные фишки. Хранится только в этом браузере.</p>
        {profiles.map((p) => <PhotoUpload key={p.id} profileId={p.id} name={p.name} />)}
      </details>
      {u.datasheetId === 'boyz' && u.startingModels < 10 && (
        <p className="mt-1 text-[11px] text-amber-400">Учебная конфигурация Introductory Set: в официальном datasheet Бойз минимум 10 моделей и 1 спецоружие на 10 моделей.</p>
      )}
    </section>
  )
}

/** What the weapon is good at, read off its profile («Лучше всего против толп пехоты», «По технике почти бесполезно»). */
function WeaponHints({ p }: { p: WeaponProfile }) {
  return (
    <span className="block text-[10px] leading-tight" aria-label="Для чего это оружие">
      {weaponAdvice(p).lines.map((l) => (
        <span key={l} className={`block ${l.startsWith('⚠') ? 'text-amber-300' : 'text-emerald-300'}`}>{l}</span>
      ))}
    </span>
  )
}

const statHelp = (k: string) => STAT_HELP.find((x) => x.key === k)!

/** Column header with a hover/focus tooltip explaining the characteristic. */
function StatTh({ k }: { k: string }) {
  const h = statHelp(k)
  return (
    <th className="px-0.5">
      <abbr title={`${h.name}: ${h.text}`} tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2">{k}</abbr>
    </th>
  )
}

function StatGlossary() {
  const beginner = useStore((s) => s.settings.explain === 'beginner')
  return (
    <details className="mt-2" open={beginner}>
      <summary className="cursor-pointer text-sky-300">Что значат эти буквы?</summary>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-stone-300">
        {STAT_HELP.map((h) => (
          <div key={h.key} className="contents">
            <dt className="font-semibold text-stone-100">{h.key}</dt>
            <dd><b className="font-medium">{h.name}</b> — {h.text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-[11px] text-stone-400">Пример: «Sv 3+» — при ранении защитник бросает кубик и отражает рану на 3, 4, 5 или 6.</p>
    </details>
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
  if (k.twinLinked) parts.push('Twin-linked')
  if (k.extraAttacks) parts.push('Extra Attacks')
  if (k.devastatingWounds) parts.push('Devastating Wounds')
  if (k.sustainedHits) parts.push(`Sustained Hits ${k.sustainedHits}`)
  if (k.anti) parts.push(`Anti-${k.anti.keyword} ${k.anti.roll}+`)
  if (k.psychic) parts.push('Psychic')
  if (k.oneShot) parts.push('One Shot')
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
  if (st.deploying) return (
    <div className="flex flex-col gap-3 text-sm">
      {st.settings.tutorial && <Tutorial />}
      <DeploymentPanel />
    </div>
  )
  return (
    <div className="flex flex-col gap-3 text-sm">
      {game.winner ? (
        <div className="rounded border border-yellow-500 bg-yellow-900/40 p-3 text-center">
          <div className="text-lg font-bold">{game.winner === 'draw' ? 'Ничья' : `Победа: ${FACTION_NAME[game.winner]}`}</div>
          <div>Счёт ПО — {scoreText(game, 'full')}</div>
          <button className="btn mt-2" onClick={() => (st.shared ? leaveRoom() : st.startDeployment())}>{st.shared ? 'Покинуть комнату' : 'Новая битва'}</button>
        </div>
      ) : (
        <PhaseTrack game={game} myTurn={myTurn} />
      )}
      {!game.winner && explain !== 'minimal' && (
        <details className="text-xs text-stone-300">
          <summary className="cursor-pointer text-sky-300">Правила фазы</summary>
          <p className="mt-1">{explain === 'beginner' ? PHASE_HELP[game.phase].long : PHASE_HELP[game.phase].short}</p>
        </details>
      )}
      {st.settings.tutorial && <Tutorial />}
      {!game.winner && myTurn && game.phase === 'command' && human === 'orks' && (
        <ActionButton cmd={{ type: 'callWaaagh' }} label="WAAAGH! (Боевой клич, раз за битву)" />
      )}
      {!game.winner && myTurn && game.phase === 'command' && game.players[human].shadowUsed === false && (
        <ActionButton cmd={{ type: 'callShadow' }} label="Тень в Варпе (Shadow in the Warp, раз за битву)" />
      )}
      {!game.winner && myTurn && game.phase === 'command' && game.players[human].imperative !== undefined && <ImperativePicker />}
      {!game.winner && myTurn && game.phase === 'command' && human === 'marines' && <DoctrinePicker />}
      {!game.winner && myTurn && lastRoundWarning(game, human) && (
        <p className="rounded border border-rose-500 bg-rose-950/60 p-2 text-xs text-rose-100" role="alert">{lastRoundWarning(game, human)}</p>
      )}
      {!game.winner && <StratagemsPanel />}
      {sel ? <UnitActions u={sel} /> : <p className="text-stone-400">Выберите отряд на поле или в списке.</p>}
      <LastAttack />
      <AiNotes />
    </div>
  )
}

/** Command points, the Stratagems usable right now (for any of the player's units), and what each one does. */
function StratagemsPanel() {
  const st = useStore()
  const game = st.game!
  const human = st.settings.human
  const beginner = st.settings.explain === 'beginner'
  const myTurn = actor(game) === human
  const cp = game.players[human].cp
  // every Stratagem usable now, for any of the player's units (not only the selected one)
  const now = myTurn ? usableStratagems(game, human, st.selectedUnitId ?? undefined) : []
  const later = LATER_STRATAGEMS.filter((x) => x.faction === human)
  return (
    <section className="rounded border border-violet-700/70 bg-violet-950/30 p-2 text-xs" aria-label="Стратагемы">
      <div className="flex items-center justify-between">
        <b className="text-violet-200">📜 Стратагемы</b>
        <span className="rounded bg-violet-800 px-1.5 text-violet-50" title="Очки командования (Command points): +1 каждому игроку в каждой фазе командования">CP: {cp}</span>
      </div>
      {cpReminder(game, human) && (
        <p className="mt-1 rounded border border-amber-600 bg-amber-950/50 p-1 text-[11px] text-amber-100">💡 Накопилось {cp} CP — неистраченные очки ничего не дают. Посмотрите, что можно применить ниже.</p>
      )}
      {now.length > 0 ? (
        <div className="mt-1 flex flex-col gap-1.5">
          {now.map(([id, list]) => (
            <div key={id} className="rounded border border-violet-800/60 p-1">
              <div title={STRATAGEMS[id].text}>
                <b className="text-violet-100">{STRATAGEMS[id].name}</b> ({STRATAGEMS[id].cost} CP)
                {beginner && <span className="block text-[11px] text-emerald-300">{STRATAGEMS[id].when}</span>}
              </div>
              <div className="mt-1 flex flex-col gap-1">
                {list.map((x) => (
                  <ActionButton key={x.unit.id + (x.cmd.targetId ?? '')} cmd={x.cmd} label={`Применить: ${stratagemTarget(game, x.unit, x.cmd)}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        myTurn && <p className="mt-1 text-stone-400">{cp === 0 ? 'Нет очков командования — они прибавляются в каждой фазе командования.' : 'Сейчас применить нечего.'}</p>
      )}
      <details className="mt-1" open={beginner && now.length > 0}>
        <summary className="cursor-pointer text-sky-300">Что они делают</summary>
        <ul className="mt-1 flex flex-col gap-1 text-[11px] text-stone-300">
          {STRATAGEM_IDS.filter((id) => !STRATAGEMS[id].faction || STRATAGEMS[id].faction === human).map((id) => {
            const x = STRATAGEMS[id]
            return (
              <li key={id}>
                <b className="text-stone-100">{x.name}</b> ({x.nameEn}, {x.cost} CP, {x.phases.map((p) => PHASE_SHORT[p]).join(' / ')}): {x.text}
                <span className="block text-emerald-300">Когда выгодно: {x.when}</span>
              </li>
            )
          })}
        </ul>
        {later.length > 0 && (
          <p className="mt-1 text-[11px] text-stone-500">Ещё в детачменте «{DETACHMENT[human]}», пока нет: {later.map((x) => `${x.name} (${x.why})`).join('; ')}.</p>
        )}
        <p className="mt-1 text-[10px] text-stone-500">Каждая стратагема — раз за фазу, на отряд — одна за фазу; на отряд в боевом шоке их применять нельзя. Кнопки показаны для всех ваших отрядов, к которым стратагему можно применить прямо сейчас. Стратагемы в ход противника (огонь на опережение, дымовая завеса, героический перехват) игра предложит сама — в паузе, и только когда они выгодны.</p>
      </details>
    </section>
  )
}

function PhaseTrack({ game, myTurn }: { game: GameState; myTurn: boolean }) {
  const thinking = useStore((st) => st.aiThinking)
  const human = useStore((s) => s.settings.human)
  const explain = useStore((s) => s.settings.explain)
  const cur = PHASES.indexOf(game.phase)
  const status = phaseStatus(game, human)
  const ready = myTurn ? status.ready : []
  const verb: Partial<Record<string, string>> = { movement: 'двигаться', shooting: 'стрелять', charge: 'атаковать', fight: 'сражаться' }
  return (
    <section className={`rounded border p-2 ${myTurn ? 'border-emerald-600 bg-emerald-950/40' : 'border-stone-600 bg-stone-800/60'}`} aria-label="Текущая фаза">
      <div className="mb-1 text-xs text-stone-400">Раунд {game.round}/{game.maxRounds} · ход: <b style={{ color: FACTION_STYLE[game.activePlayer].secondary }}>{FACTION_NAME[game.activePlayer]}</b>{game.activePlayer === human ? ' (вы)' : ` (${rivalName()})`}</div>
      <ol className="flex flex-wrap gap-1" aria-label="Фазы хода">
        {PHASES.map((p, i) => (
          <li key={p} aria-current={i === cur ? 'step' : undefined} className={`rounded px-1.5 py-0.5 text-[11px] ${i === cur ? 'bg-yellow-500 font-semibold text-black' : i < cur ? 'bg-stone-700 text-stone-400' : 'bg-stone-800 text-stone-300'}`}>
            {i < cur ? '✓ ' : i === cur ? '▶ ' : ''}{PHASE_SHORT[p]}
          </li>
        ))}
      </ol>
      <div className="mt-2 font-semibold">{game.pendingReroll ? (myTurn ? 'Командный переброс — ваше решение' : `${rivalName()} решает, перебросить ли кубик…`) : game.reaction?.window === 'beforeShockTests' ? (myTurn ? 'Ваш ход — перед проверкой шока' : `${rivalName()} решает о «Безумной храбрости»…`) : game.reaction?.window === 'onTargeted' ? (myTurn ? 'Ваш отряд под атакой — ваша реакция' : `${rivalName()} решает, ответить ли стратагемой…`) : game.reaction?.window === 'afterAttacks' ? (myTurn ? 'Потери — реанимация?' : `${rivalName()} решает о реанимации…`) : game.reaction ? (myTurn ? 'Ход противника — ваша реакция' : `${rivalName()} решает, ответить ли реакцией…`) : myTurn ? 'Ваш ход' : `Ходит ${rivalName()} (${FACTION_NAME[actor(game)]})…`} — {PHASE_NAME[game.phase].split(' (')[0]}</div>
      {!myTurn && thinking && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-sky-300" role="status" aria-label="ИИ думает">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-300" aria-hidden />
          ИИ думает над ходом…
        </p>
      )}
      {explain !== 'minimal' && <p className="text-xs text-stone-300">{PHASE_GOAL[game.phase]}</p>}
      {myTurn && !game.reaction && !game.pendingReroll && !status.canEnd && status.reason && <p className="mt-1 text-xs text-amber-300">Сначала: {status.reason}</p>}
      {myTurn && status.canEnd && verb[game.phase] && (
        <p className="mt-1 text-xs">
          {ready.length
            ? <>Могут {verb[game.phase]}: {ready.map((u) => <b key={u.id} className="text-emerald-300">«{u.name}» </b>)}<span className="text-stone-400">(необязательно)</span></>
            : <span className="text-stone-300">Больше никто не может {verb[game.phase]} — фазу можно завершать.</span>}
        </p>
      )}
      {myTurn && explain !== 'minimal' && <p className="mt-1 text-[11px] text-stone-400">После «{nextPhaseLabel(game)} ▶»: {PHASE_NEXT[game.phase].replace(/^Далее — /, '')}</p>}
    </section>
  )
}

// ---------------------------------------------------------------- deployment

/** Optional battlefield setup before deployment: add, move, resize, rotate, delete terrain. */
function TerrainEditor() {
  const st = useStore()
  const game = st.game!
  const sel = game.terrain.find((t) => t.id === st.selectedTerrainId)
  const box = sel ? boxOf(sel) : null
  const update = (patch: Partial<NonNullable<typeof box>>) => {
    if (!sel || !box) return
    st.editTerrain(game.terrain.map((t) => (t.id === sel.id ? withBox(t, fitBox({ ...box, ...patch }, game.board)) : t)))
  }
  const add = (p: TerrainPreset) => {
    const piece = newPiece(game, p)
    st.editTerrain([...game.terrain, piece])
    st.selectTerrain(piece.id)
  }
  return (
    <details className="rounded border border-stone-600 p-2" open={!!sel}>
      <summary className="cursor-pointer text-xs font-semibold uppercase text-stone-400">0. Поле боя (необязательно)</summary>
      <p className="mt-1 text-[11px] text-stone-400">Перетащите элемент тиррейна на поле, чтобы сдвинуть; щёлкните, чтобы изменить размер. Раскладка запоминается для этого сценария.</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {(Object.keys(TERRAIN_PRESETS) as TerrainPreset[]).map((p) => (
          <button key={p} className="btn text-xs" onClick={() => add(p)}>+ {TERRAIN_PRESETS[p].name}</button>
        ))}
      </div>
      {sel && box && (
        <div className="mt-2 rounded bg-stone-900 p-2 text-xs" aria-label="Выбранный элемент тиррейна">
          <div className="font-semibold">{sel.name} <span className="font-normal text-stone-400">— {sel.obscuring ? 'закрывает обзор, даёт укрытие' : 'даёт укрытие пехоте, обзор не закрывает'}</span></div>
          <div className="mt-1 flex items-center gap-2">
            <label>Ширина <input type="number" className="w-14 rounded bg-stone-700 px-1" min={0.5} max={12} step={0.5} value={box.w} onChange={(e) => update({ w: Number(e.target.value) })} />″</label>
            <label>Глубина <input type="number" className="w-14 rounded bg-stone-700 px-1" min={0.5} max={12} step={0.5} value={box.h} onChange={(e) => update({ h: Number(e.target.value) })} />″</label>
          </div>
          <div className="mt-1 flex gap-1">
            <button className="btn text-xs" onClick={() => update({ w: box.h, h: box.w })}>⟳ Повернуть</button>
            <button className="btn text-xs" onClick={() => { st.editTerrain(game.terrain.filter((t) => t.id !== sel.id)); st.selectTerrain(null) }}>🗑 Удалить</button>
          </div>
        </div>
      )}
      <button className="mt-2 text-[11px] text-sky-300 underline" onClick={() => st.resetTerrain()}>Вернуть тиррейн как в сценарии</button>
    </details>
  )
}

function DeploymentPanel() {
  const st = useStore()
  const game = st.game!
  const human = st.settings.human
  const placed = st.deploying!.placed
  const mine = unitsOf(game, human)
  const issues = deploymentIssues(game, human, placed)
  const models = mine.reduce((a, u) => a + alive(u).length, 0)
  const placedModels = mine.filter((u) => placed.includes(u.id)).reduce((a, u) => a + alive(u).length, 0)
  const zone = deploymentZone(game, human)
  const depth = Math.max(...zone.map((p) => p.x)) - Math.min(...zone.map((p) => p.x))
  const beginner = st.settings.explain !== 'minimal'
  return (
    <section className="flex flex-col gap-2" aria-label="Расстановка армии">
      <div className="rounded border border-emerald-600 bg-emerald-950/40 p-2">
        <div className="text-xs text-stone-400">Подготовка к битве</div>
        <div className="font-semibold">Расстановка армии (Deployment)</div>
        {beginner && <p className="text-xs text-stone-300">Перед первым раундом каждый игрок ставит свои модели в свою зону развёртывания. Откуда вы начнёте — решает, кто первым дойдёт до целей и кто окажется под огнём.</p>}
      </div>

      <TerrainEditor />

      <DeployPresetCards />

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">1. Ваша армия</h3>
        {mine.map((u) => {
          const done = placed.includes(u.id)
          return (
            <button key={u.id} onClick={() => st.select(u.id)} className={`mb-1 w-full rounded border px-2 py-1 text-left ${u.id === st.selectedUnitId ? 'border-yellow-400 bg-stone-700' : 'border-stone-600 bg-stone-800 hover:bg-stone-700'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{u.name}</span>
                <span className={`text-xs ${done ? 'text-emerald-300' : 'text-amber-300'}`}>{done ? '✓ расставлен' : '○ ждёт'} · {alive(u).length} мод.</span>
              </div>
              {beginner && <div className="text-[11px] text-stone-400">{UNIT_ROLE[u.datasheetId]}</div>}
            </button>
          )
        })}
        <p className="text-[11px] text-stone-500">Характеристики и оружие — в карточке отряда слева (кнопка «»», если панель свёрнута).</p>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">2. Где ставить</h3>
        <ul className="list-disc pl-4 text-xs text-stone-300">
          <li>Каждая подставка — <b>целиком</b> в вашей зоне: полоса {fmt(depth)}″ у {zone[0].x === 0 ? 'левого' : 'правого'} края (подсвечена, жёлтый пунктир).</li>
          <li>Модели отряда держатся вместе: каждая в 2″ от другой модели отряда, все — в 9″ (связность).</li>
          <li>Подставки не должны пересекаться.</li>
          {unitsOf(game, human).some((u) => hasAbility(u, 'infiltrators')) && <li>Диверсанты (Infiltrators, Сикарии) можно ставить где угодно дальше 8″ от зоны и моделей противника.</li>}
        </ul>
        {beginner && <p className="mt-1 text-[11px] text-stone-400">Противник ({FACTION_NAME[other(game, human)]}) уже стоит в своей зоне. Учебное упрощение: в настоящей игре стороны ставят отряды по очереди.</p>}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">3. Расставьте модели</h3>
        <p className="text-xs text-stone-300">Выберите отряд, перетащите модель на поле и нажмите «✓ Поставить» под полем (или Enter). Переключатель «Весь отряд / По одной модели» под полем решает, что двигает перетаскивание. «↶» отменяет последнюю расстановку.</p>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">4. Проверка</h3>
        <p className="text-xs">Расставлено отрядов: <b>{mine.filter((u) => placed.includes(u.id)).length}/{mine.length}</b> · моделей: <b>{placedModels}/{models}</b></p>
        {issues.length > 0 && <ul className="mt-1 text-[11px] text-amber-300">{issues.map((t) => <li key={t}>○ {t}</li>)}</ul>}
        <button className="btn btn-primary mt-2 w-full" disabled={issues.length > 0} onClick={() => st.finishDeployment()} title={issues[0]}>Начать битву ▶</button>
        {issues.length > 0 && <button className="btn mt-1 w-full" onClick={() => st.autoDeploy()} title="Поставить нерасставленные отряды на предложенные места">Оставить остальных на предложенных местах</button>}
      </div>
    </section>
  )
}

/** Combat Doctrines (Space Marines army rule): at most one per Command phase, each once per battle, one of them twice
 * (Codex Discipline). Optional, so the phase can end without one. */
function DoctrinePicker() {
  const game = useStore((s) => s.game!)
  const p = game.players.marines
  const used = p.doctrinesUsed ?? []
  if (p.doctrine)
    return <p className="rounded border border-sky-700 bg-sky-950/40 p-2 text-xs text-sky-200">Боевая доктрина: <b>{DOCTRINE_NAME[p.doctrine]}</b> — {DOCTRINE_TEXT[p.doctrine]}, до вашей следующей фазы командования.</p>
  return (
    <div className="flex flex-col gap-1 rounded border border-sky-700 bg-sky-950/40 p-2" aria-label="Боевые доктрины">
      <b className="text-xs text-sky-200">Боевые доктрины (Combat Doctrines): можно выбрать одну — или сберечь</b>
      {DOCTRINES.map((d) => (
        <ActionButton key={d} cmd={{ type: 'doctrine', doctrine: d }} label={`${DOCTRINE_NAME[d]}: ${DOCTRINE_TEXT[d]}${used.includes(d) ? ' (уже была — повтор по Дисциплине Кодекса)' : ''}`} />
      ))}
      <span className="text-[11px] text-stone-400">Каждая — раз за битву, и одна из них — ещё раз. Выбрано: {used.length ? used.map((d) => DOCTRINE_NAME[d]).join(', ') : 'пока ни одной'}.</span>
    </div>
  )
}

/** Doctrina Imperatives (Adeptus Mechanicus army rule): one choice per turn, active until your next Command phase. */
function ImperativePicker() {
  const game = useStore((s) => s.game!)
  const human = useStore((s) => s.settings.human)
  const chosen = game.players[human].imperative
  if (chosen)
    return <p className="rounded border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-200">Империатив: <b>{chosen === 'protector' ? 'Протектор' : 'Завоеватель'}</b> — действует до вашей следующей фазы командования.</p>
  return (
    <div className="flex flex-col gap-1 rounded border border-amber-700 bg-amber-950/40 p-2" aria-label="Доктрины Империатива">
      <b className="text-xs text-amber-200">Доктрины Империатива (Doctrina Imperatives): выберите одну</b>
      <ActionButton cmd={{ type: 'imperative', imperative: 'protector' }} label="🛡 Протектор: Heavy, BS на 1 лучше, −1 к попаданию по линейным в ближнем бою" />
      <ActionButton cmd={{ type: 'imperative', imperative: 'conqueror' }} label="⚔ Завоеватель: Assault, WS на 1 лучше, AP +1 линейным" />
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
      {game.phase === 'charge' && !u.chargeDeclared && !game.pendingCharge && <ChargeForecastView u={u} />}
      {actions.filter((a) => !a.id.startsWith('shoot:') && !a.id.startsWith('strat:')).map((a) => (
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
  const cmd = moveCommand(game, u, st.draft, st.moveOptions)
  const allow = moveAllowance(game, u, st.moveOptions)
  const v = hasDraft ? validate(game, cmd) : null
  if (u.move !== 'none') {
    const after = { none: '', normal: 'Может стрелять и атаковать (charge) как обычно.', advance: 'После продвижения: стреляет только оружие Assault, атаковать (charge) нельзя.', fallBack: 'После отступления: не стреляет и не атакует в этот ход.' }[u.move]
    return <p className="text-xs text-stone-300">✓ Отряд уже двигался в этой фазе. {after} {st.history.length > 0 && 'Передумали — «↶ Отменить».'}</p>
  }
  const engaged = engagedUnits(game, u).length > 0
  const advance = validate(game, { type: 'declareAdvance', unitId: u.id })
  const modes = [
    { id: 'normal', label: 'Обычное движение', text: `до ${profileOf(alive(u)[0]).m}″, затем можно стрелять и атаковать`, ok: !engaged && u.advanceRoll === null, why: engaged ? 'отряд в контакте с врагом' : 'уже объявлено продвижение' },
    { id: 'advance', label: 'Продвижение (Advance)', text: 'M + D6″, но затем только оружие Assault и без атаки (charge)', ok: u.advanceRoll !== null || advance.ok, why: advance.ok ? '' : advance.reason },
    { id: 'fallBack', label: 'Отступление (Fall Back)', text: 'выйти из контакта; затем нельзя стрелять и атаковать', ok: engaged, why: 'только для отряда в контакте с врагом' },
  ] as const
  const used = hasDraft ? draftDistance(u, st.draft) : 0
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-stone-300">Режим: <b>{{ normal: 'Обычное движение', advance: `Продвижение (+${u.advanceRoll}″)`, fallBack: 'Отступление (Fall Back)' }[mode]}</b>, до {fmt(allow)}″.</p>
      {st.settings.explain !== 'minimal' && (
        <ul className="text-[11px]">
          {modes.map((m) => (
            <li key={m.id} className={m.id === mode ? 'text-yellow-200' : m.ok ? 'text-stone-300' : 'text-stone-500'}>
              {m.id === mode ? '▶' : m.ok ? '○' : '⛔'} <b>{m.label}</b>: {m.text}{!m.ok && m.id !== mode && m.why ? ` — недоступно: ${m.why}` : ''}
            </li>
          ))}
        </ul>
      )}
      {hasDraft && <p className="text-[11px]">Пройдено: <b>{fmt(used)}″</b> из {fmt(allow)}″ · осталось {fmt(Math.max(0, allow - used))}″</p>}
      {hasDraft && v && !v.ok && <p className="text-[11px] text-rose-300">⛔ {v.reason} Подвиньте модель или нажмите «↺ Вернуть» (Esc).</p>}
      {hasDraft && v?.ok && <p className="text-[11px] text-emerald-300">✓ Позиция допустима — «Подтвердить» под полем (или Enter).</p>}
      {!hasDraft && <p className="text-[11px] text-stone-400">Перетащите модель на поле: пунктирный круг — предел, тень — исходная позиция. Режим «По одной модели» (под полем) позволяет сдвинуть только одну-две модели — остальные останутся на месте, но отряд должен остаться связным (каждая модель в 2″ от другой). Не двигать отряд вовсе тоже можно.</p>}
    </div>
  )
}

function ShootControls({ u }: { u: UnitState }) {
  const st = useStore()
  const game = st.game!
  const multi = [...new Map(alive(u).flatMap((m) => weaponsOf(m)).filter((w) => w.profiles.length > 1 && w.profiles[0].range !== 'melee').map((w) => [w.id, w])).values()]
  const opts = st.shotOptions
  const enemies = game.units.filter((e) => e.owner !== u.owner && !isDestroyed(e))
  const advice = u.shot ? [] : shotAdvice(game, u, opts)
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
        const a = advice.find((x) => x.targetId === e.id)
        return (
          <div key={e.id}>
            <ActionButton cmd={cmd} label={`${a?.best ? '★ ' : ''}Стрелять по «${e.name}»${plan.cover && !plan.problem ? ' (в укрытии)' : ''}`} />
            {a && !a.problem && <TargetAdviceView a={a} all={advice} />}
            {!plan.problem && !u.shot && <AttackPreview plan={plan} attacker={u} target={e} />}
          </div>
        )
      })}
      {!u.shot && enemies.length > 0 && enemies.every((e) => shootPlan(game, u, e, opts).problem) && (
        <p className="text-[11px] text-stone-400">💡 Сейчас «{u.name}» не может стрелять ни по одной цели. Подойдите ближе или выйдите из-за укрытия в следующей фазе движения, а пока выберите другой отряд или завершите стрельбу.</p>
      )}
    </div>
  )
}

/** Before a charge: for each enemy in reach, the chance to get there and how the fight is expected to go. */
function ChargeForecastView({ u }: { u: UnitState }) {
  const game = useStore((s) => s.game!)
  const list = chargeForecast(game, u)
  if (!list.length) return <p className="text-[11px] text-stone-400">В пределах 12″ нет врагов — атаковать некого.</p>
  const tone = { good: 'border-emerald-700', risky: 'border-amber-600', bad: 'border-rose-700' }
  const head = { good: '✅', risky: '⚠', bad: '⛔' }
  return (
    <div className="flex flex-col gap-1 text-[11px]" aria-label="Прогноз атаки" data-testid="charge-forecast">
      <b className="text-xs">⚔ Прогноз атаки (charge)</b>
      {list.map((f) => (
        <div key={f.targetId} className={`rounded border-l-4 bg-stone-900/70 px-2 py-1 ${tone[f.verdict]}`}>
          <div>{head[f.verdict]} <b>«{f.name}»</b>: {forecastLine(f)}</div>
          {f.warnings.map((w) => <div key={w} className="text-amber-300">{w}</div>)}
        </div>
      ))}
      <p className="text-[10px] text-stone-500">Средние по всем броскам. После атаки ваш отряд бьёт первым; враг отвечает теми, кто выжил.</p>
    </div>
  )
}

/** Expected result of shooting this target, with a star for the best one and warnings for overkill or a poor pick. */
function TargetAdviceView({ a, all }: { a: TargetAdvice; all: TargetAdvice[] }) {
  const warn = adviceWarnings(a, all)
  return (
    <div className="mt-0.5 px-1 text-[11px] leading-snug" data-testid="target-advice">
      <span className={a.best ? 'text-emerald-300' : 'text-stone-300'}>{adviceLine(a)}{a.best ? ' · лучшая цель' : ''}</span>
      {warn.map((w) => <span key={w} className="block text-amber-300">⚠ {w}</span>)}
    </div>
  )
}

/** Compact explanation of an attack before it is made: who fires what, and the numbers each roll will need. */
function AttackPreview({ plan, attacker, target }: { plan: ReturnType<typeof shootPlan>; attacker: UnitState; target: UnitState }) {
  const beginner = useStore((s) => s.settings.explain === 'beginner')
  const aimed = useStore((s) => s.aimTargetId === target.id)
  const t = toughness(target)
  const saves = [...new Map(alive(target).map((m) => [m.profileId, m])).values()]
  const heavyTarget = isMV(target)
  return (
    <details className={`mt-0.5 rounded px-2 py-1 text-[11px] ${aimed ? 'border border-yellow-400 bg-stone-900' : 'bg-stone-900/70'}`} open={beginner || aimed}>
      <summary className="cursor-pointer text-stone-300">
        Разбор: {plan.groups.reduce((a, g) => a + g.attacks, 0)}{plan.groups.some((g) => g.randomAttacks) ? '+' : ''} атак · стреляют {plan.firingModels.length} из {alive(attacker).length} мод.{plan.cover ? ' · цель в укрытии (−1 к навыку)' : ''}
      </summary>
      {plan.groups.map((g) => {
        const hr = hitRoll(g.profile, g.ctx)
        const needs = saves.map((m) => ({ need: saveTarget(m, g.profile.ap, g.ctx.invulnOverride).need, name: profileOf(m).name }))
        const save = new Set(needs.map((x) => x.need)).size === 1 ? `${needs[0].need}+` : needs.map((x) => `${x.need}+ (${x.name})`).join(', ')
        return (
          <div key={g.weaponName + g.profile.name} className="mt-1 border-t border-stone-700 pt-1">
            <b>{g.weaponName}{g.profile.name ? ` — ${g.profile.name}` : ''}</b> ×{g.models} мод.: {g.attacks}{g.randomAttacks ? ` + ${g.randomAttacks}×${g.profile.randomA}` : ''} атак{g.notes.length ? ` (${g.notes.join(', ')})` : ''}
            {heavyTarget && weaponAdvice(g.profile).uselessVsArmour && <span className="block text-amber-300">⚠ Это оружие почти не ранит технику и монстров.</span>}
            <ol className="list-decimal pl-4 text-stone-300">
              <li>Попадание: {hr.skill === null ? 'автоматически (Torrent)' : `${hr.skill}+${hr.mod ? `, модификатор ${hr.mod > 0 ? '+' : ''}${hr.mod} (${g.ctx.hitModNotes.join(', ')}) — фактически ${Math.min(6, Math.max(2, hr.skill - hr.mod))}+` : ''}`}{g.ctx.lethalHits ? '; 6 — сразу рана (Lethal Hits)' : ''}</li>
              <li>Ранение: {woundTarget(g.profile.s, t)}+ (Сила {g.profile.s} против Стойкости {t}){g.ctx.woundMod ? `, модификатор ${g.ctx.woundMod} (${g.ctx.woundModNote})` : ''}</li>
              <li>Спасбросок цели: {save} (AP {g.profile.ap})</li>
              <li>Урон: {fmtRandom(g.profile.d, g.profile.randomD)} за каждую непрошедшую рану{g.ctx.damageMod ? ` (${g.ctx.damageMod}, Dread 'Ard; не меньше 1)` : ''}</li>
            </ol>
          </div>
        )
      })}
      {plan.skipped.length > 0 && <p className="mt-1 text-amber-300">Не стреляют: {plan.skipped.join(' ')}</p>}
    </details>
  )
}

/** Walks through a just-resolved attack one step at a time; the AI waits until it is closed. */
export function AttackReview() {
  const review = useStore((s) => s.review)
  return review ? <AttackReviewInner key={review.afterId} afterId={review.afterId} /> : null
}

function AttackReviewInner({ afterId }: { afterId: number }) {
  const game = useStore((s) => s.game)!
  const human = useStore((s) => s.settings.human)
  const close = useStore((s) => s.closeReview)
  const [pos, setPos] = useState({ e: 0, i: 0 })
  const entries = game.diceLog.filter((d) => d.id > afterId && d.steps.some((x) => x.label === 'Попадание'))
  const entry = entries[pos.e]
  if (!entry) return null
  const step = entry.steps[pos.i]
  const ex = explainStep(step)
  const lastStep = pos.i === entry.steps.length - 1
  const lastEntry = pos.e === entries.length - 1
  const next = () => (lastStep ? (lastEntry ? close() : setPos({ e: pos.e + 1, i: 0 })) : setPos({ e: pos.e, i: pos.i + 1 }))
  const prev = () => (pos.i > 0 ? setPos({ e: pos.e, i: pos.i - 1 }) : pos.e > 0 && setPos({ e: pos.e - 1, i: entries[pos.e - 1].steps.length - 1 }))
  return (
    <section className="absolute bottom-16 left-1/2 z-[3] w-[min(94%,560px)] -translate-x-1/2 rounded-lg border border-yellow-500 bg-stone-950/95 p-3 text-sm shadow-2xl" aria-label="Разбор атаки" role="region">
      <div className="text-xs text-stone-400">
        {entry.player === human ? 'Ваша атака' : '⚠ Противник атакует ваш отряд'}{entries.length > 1 ? ` · оружие ${pos.e + 1} из ${entries.length}` : ''}
      </div>
      <div className="font-semibold">{entry.title}</div>
      <ol className="mt-2 flex gap-1 text-[11px]" aria-label="Шаги атаки">
        {entry.steps.map((x, i) => (
          <li key={i} aria-current={i === pos.i ? 'step' : undefined} className={`rounded px-1.5 py-0.5 ${i === pos.i ? 'bg-yellow-500 font-semibold text-black' : i < pos.i ? 'bg-stone-700 text-stone-300' : 'bg-stone-800 text-stone-500'}`}>
            {i < pos.i ? '✓ ' : ''}{i + 1}. {x.label}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-stone-200">{ex.text}</p>
      {step.dice.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Кубики">
          {step.dice.map((d, j) => <span key={j} title={d.success ? 'успех' : 'неудача'} className={`die die-anim ${d.success ? 'die-ok' : 'die-fail'} ${d.critical ? 'die-crit' : ''}`} style={{ animationDelay: `${j * 60}ms` }}>{d.value}</span>)}
        </div>
      )}
      {ex.result && <p className="mt-2 font-semibold text-yellow-200">{ex.result}</p>}
      {lastStep && <p className="mt-1 text-xs text-stone-300">Итог: {entry.summary}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button className="btn" disabled={pos.e === 0 && pos.i === 0} onClick={prev}>◀ Назад</button>
        <button className="btn btn-primary" onClick={next} autoFocus>{lastStep ? (lastEntry ? 'Готово ✓' : 'Следующее оружие ▶') : 'Дальше ▶'}</button>
        <button className="ml-auto text-xs text-stone-400 underline" onClick={close}>Пропустить разбор</button>
      </div>
    </section>
  )
}

/** The most recent attack (all weapon groups of one shoot/fight), step by step. */
function LastAttack() {
  const game = useStore((s) => s.game)!
  const explain = useStore((s) => s.settings.explain)
  const attacks = game.diceLog.filter((d) => d.steps.some((x) => x.label === 'Попадание'))
  const last = attacks.at(-1)
  if (!last) return null
  const key = (d: DiceEntry) => `${d.round}|${d.player}|${d.title.slice(0, d.title.lastIndexOf(':'))}`
  const group: DiceEntry[] = []
  for (let i = attacks.length - 1; i >= 0 && key(attacks[i]) === key(last); i--) group.unshift(attacks[i])
  const succ = (st: DiceEntry['steps'][number]) => st.dice.filter((d) => d.success).length
  return (
    <section aria-label="Последняя атака">
      <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">Последняя атака</h3>
      {group.map((d) => (
        <div key={d.id} className="mb-1 rounded border border-stone-700 bg-stone-900/70 p-1.5 text-xs">
          <div className="font-medium"><span style={{ color: FACTION_STYLE[d.player].secondary }}>■</span> {d.title}</div>
          {d.steps.map((x, i) => (
            <details key={i} className="mt-0.5">
              <summary className="cursor-pointer">
                {i + 1}. {x.label}{x.target !== '—' ? ` (${x.target})` : ''}: {x.label === 'Атаки' || x.label === 'Урон' ? x.note : x.dice.length ? `${succ(x)} из ${x.dice.length}${x.label === 'Спасбросок' ? ' спасено' : ' успешно'}` : x.note}
              </summary>
              <div className="ml-3 mt-0.5 flex flex-wrap gap-1">
                {x.dice.map((die, j) => <span key={j} className={`die ${die.success ? 'die-ok' : 'die-fail'} ${die.critical ? 'die-crit' : ''}`}>{die.value}</span>)}
              </div>
              {x.note && explain !== 'minimal' && x.dice.length > 0 && <p className="ml-3 text-[11px] text-stone-400">{x.note}</p>}
            </details>
          ))}
          <p className="mt-0.5 text-stone-300">{d.summary}</p>
        </div>
      ))}
    </section>
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
  const l = LESSONS.find((x) => !st.tutorialDone.includes(x.id))
  const ui = { selectedUnitId: st.selectedUnitId, measure: st.measure, deploying: !!st.deploying }
  const done = !!l && l.done(game, ui, human, st.tutorialStart)
  const complete = st.completeLesson
  useEffect(() => {
    if (done && l) complete(l.id)
  }, [done, l, complete])
  if (!l) return (
    <div className="rounded border border-sky-700 bg-sky-950/50 p-2 text-xs">
      🎓 Обучение пройдено. <button className="text-sky-300 underline" onClick={() => st.resetTutorial()}>Пройти заново</button>
    </div>
  )
  const n = LESSONS.filter((x) => st.tutorialDone.includes(x.id)).length
  return (
    <div className="rounded border border-sky-600 bg-sky-950/60 p-2 text-xs" aria-label="Обучение">
      <div className="mb-1 font-semibold text-sky-200">🎓 {l.title} <span className="text-sky-400">({n + 1}/{LESSONS.length})</span></div>
      <p>{l.text(human)}</p>
      <div className="mt-1 flex gap-3">
        <button className="text-sky-300 underline" onClick={() => st.completeLesson(l.id)}>Пропустить шаг</button>
        <button className="text-stone-400 underline" onClick={() => st.setSettings({ tutorial: false })}>Скрыть обучение</button>
      </div>
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
  const undoBtn = <button className="btn" disabled={!(st.deploying ? st.deployHistory : st.history).length} onClick={() => st.undo()} title="Отмена доступна для действий без бросков кубиков">↶ Отменить</button>
  const restartBtn = st.shared ? null : <button className="btn" onClick={() => { if (confirm('Начать сценарий заново? Текущий прогресс (автосохранение) будет заменён.')) st.newGame() }} title="Начать сценарий заново">⟲ Заново</button>
  if (!st.layout.log) {
    const last = game.diceLog.at(-1)
    const openTab = (t: 'dice' | 'log') => { setTab(t); st.toggleLayout('log') }
    return (
      <div className="flex items-center gap-2 text-xs">
        <button className="tab" onClick={() => openTab('dice')}>▲ Кубики ({game.diceLog.length})</button>
        <button className="tab" onClick={() => openTab('log')}>▲ Журнал</button>
        <span className="min-w-0 flex-1 truncate text-stone-400">{last ? `Р${last.round} · ${last.summary}` : ''}</span>
        {undoBtn}
        {restartBtn}
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col gap-2 md:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1 flex gap-1">
          <button className={`tab ${tab === 'dice' ? 'tab-on' : ''}`} onClick={() => setTab('dice')}>Кубики ({game.diceLog.length})</button>
          <button className={`tab ${tab === 'log' ? 'tab-on' : ''}`} onClick={() => setTab('log')}>Журнал</button>
          <button className="tab ml-auto" onClick={() => st.toggleLayout('log')} title="Свернуть журнал">▼ Свернуть</button>
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
        <p className="text-[11px] text-stone-400">{st.deploying ? 'Расстановка армии перед битвой' : `${PHASE_NAME[game.phase]} · ход: ${FACTION_NAME[game.activePlayer]}${actor(game) !== human ? ` (${rivalName()})` : ''}`}</p>
        <p className="text-[11px] text-stone-500">Клавиши: Enter — подтвердить движение, Esc — отмена, R — линейка.</p>
        {undoBtn}
        {restartBtn}
        <p className="text-[11px] text-stone-500">{scenarioById(game.scenarioId).name}</p>
      </div>
    </div>
  )
}
