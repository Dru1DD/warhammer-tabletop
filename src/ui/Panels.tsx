import { useEffect, useState } from 'react'
import { FACTION_STYLE, TOKENS, tokenImageFor } from '../assets/manifest'
import { ABILITY_TEXT, FACTION_NAME, PROFILES } from '../game/data/datasheets'
import { copyIndex, fmtPoints, pointsPerModel, unitPoints } from '../game/data/points'
import { actor, moveAllowance, moveCommand, moveModeFor, PHASE_NAME, shootPlan, stratagemActions, unitActions, validate } from '../game/engine'
import { alive, datasheetOf, engagedUnits, fmt, hasAbility, hasKeyword, isDestroyed, isMV, other, profileOf, sidesOf, unitsOf, weaponsOf } from '../game/gameState'
import { hitRoll, invulnFor, saveTarget, toughness, woundTarget } from '../game/combat/attack'
import { fmtRandom } from '../game/dice/dice'
import { deploymentIssues, deploymentZone } from '../game/rules/deployment'
import { boxOf, fitBox, newPiece, TERRAIN_PRESETS, withBox, type TerrainPreset } from '../game/terrainLayout'
import { scenarioById } from '../game/scenarios/scenarios'
import type { Command, DiceEntry, GameState, UnitState, WeaponKeywords, WeaponProfile } from '../game/types'
import { PHASES } from '../game/types'
import { useStore } from '../store'
import { weaponAdvice } from '../game/weaponAdvice'
import { DETACHMENT, LATER_STRATAGEMS, showOfficialName, STRATAGEM_IDS, STRATAGEMS } from '../game/rules/stratagems'
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

/** "Rangers", "Dominus → O2", "Kataphrons → Boyz": what a Stratagem button acts on. */
function stratagemTarget(game: GameState, unit: UnitState, cmd: Extract<Command, { type: 'stratagem' }>) {
  if (!cmd.targetId) return quote(unit.name)
  const o = game.objectives.findIndex((x) => x.id === cmd.targetId)
  const t = game.units.find((x) => x.id === cmd.targetId)
  return `${quote(unit.name)} → ${o >= 0 ? tr('O{value}', { value: o + 1 }) : quote(t?.name ?? cmd.targetId)}`
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
import { turnPlan, type PlanKind } from '../game/missionAdvice'
import { quote, tr } from '../i18n/index'
import { MISSION_ACTION, PRIMARY, PRIMARY_CAP, primaryTotal, ROUND_CAP } from '../game/rules/missions'
import { unitsCovered, zonesOf, zonesOn } from '../game/rules/zones'
import { badgeText } from '../view/zones'
import { carryProblem, disembarkMode, disembarkSpot, disembarkWindow, embarkedOf, isTransport, passengersOf, placesOf, transportSpec } from '../game/rules/transports'
import { aiArrivalTarget, arrivalSpot, canDeepStrike, ingressWindow, INGRESS_EDGE, INGRESS_ENEMY, RAPID_INGRESS_CP, RESERVE_DEADLINE, RESERVE_FROM_ROUND, reserveBudget, reservesOf } from '../game/rules/reserves'
import { FIXED_CARD_CAP, SECONDARY, SECONDARY_CAP, SECONDARY_ROUND_CAP, secondaryTotal } from '../game/rules/secondaries'


/** Who plays the other side: the computer in single-player, a person online. */
const rivalName = () => (useStore.getState().shared ? tr('opponent|label') : tr('AI|alt'))

// ---------------------------------------------------------------- left: roster

export function RosterPanel() {
  const game = useStore((s) => s.game)!
  const selected = useStore((s) => s.selectedUnitId)
  const select = useStore((s) => s.select)
  const human = useStore((s) => s.settings.human)
  const rival = useStore((s) => (s.shared ? tr('opponent|label') : tr('AI|alt')))
  const open = useStore((s) => s.layout.roster)
  const toggle = useStore((s) => s.toggleLayout)
  const sel = game.units.find((u) => u.id === selected)
  if (!open) return (
    // collapsed rail: one avatar per unit, keeps selection one click away
    <nav className="flex flex-col items-center gap-2" aria-label={tr('Units (collapsed)')}>
      <button className="board-btn text-sm" onClick={() => toggle('roster')} title={tr('Show units and stats')} aria-label={tr('Show units')}>»</button>
      {game.units.map((u) => (
        <button
          key={u.id}
          onClick={() => select(u.id)}
          title={tr('{name} ({item}) · {length}/{startingModels} mod.', { name: u.name, item: FACTION_NAME[u.owner], length: alive(u).length, startingModels: u.startingModels })}
          aria-label={u.name}
          aria-pressed={u.id === selected}
          className={`relative rounded-full ${u.id === selected ? 'ring-2 ring-yellow-400' : ''} ${isDestroyed(u) ? 'opacity-40' : ''}`}
        >
          <Avatar profileId={u.models[0].profileId} size={38} />
          {u.owner === human && canActNow(game, u) && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-stone-900 bg-emerald-400" title={tr('can act')} />}
        </button>
      ))}
    </nav>
  )
  return (
    <div className="flex flex-col gap-3">
      <button className="self-end text-xs text-stone-400 hover:text-stone-100" onClick={() => toggle('roster')} title={tr('Collapse the units panel')}>{tr('« collapse')}</button>
      {sidesOf(game).map((p) => (
        <section key={p}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: FACTION_STYLE[p].secondary }}>
            {FACTION_NAME[p]} {p === human ? tr('(you)') : `(${rival})`} {tr('· CP {cp} · VP {vp}', { cp: game.players[p].cp, vp: game.players[p].vp })}
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
                    <span className="text-xs text-stone-400">{tr('{length}/{startingModels} mod.', { length: alive(u).length, startingModels: u.startingModels })}</span>
                  </div>
                  {canActNow(game, u) && u.owner === human && <div className="text-[11px] text-emerald-400">{tr('● can act')}</div>}
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
        {has ? tr('replace') : tr('own photo')}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          aria-label={tr('Upload photo: {name}', { name })}
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
      {has && <button className="text-stone-400 underline" onClick={() => st.setCustomToken(profileId, null)}>{tr('reset')}</button>}
    </div>
  )
}

function UnitStatus({ u }: { u: UnitState }) {
  const tags: string[] = []
  if (isDestroyed(u)) tags.push(tr('destroyed'))
  if (u.battleShocked) tags.push(tr('battle-shock'))
  if (u.move === 'normal') tags.push(tr('moved'))
  if (u.move === 'advance' || u.advanceRoll !== null) tags.push(tr('advance +{value}″', { value: u.advanceRoll ?? '?' }))
  if (u.move === 'fallBack') tags.push(tr('fell back'))
  if (u.shot) tags.push(tr('shot'))
  if (u.charged) tags.push(tr('charged'))
  if (u.fought) tags.push(tr('fought'))
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
    <section className="rounded border border-stone-600 bg-stone-900 p-2 text-xs" aria-label={tr('Unit card')}>
      <div className="flex items-center gap-2">
        <Avatar profileId={u.models[0].profileId} size={44} />
        <h3 className="text-sm font-semibold">{ds.name}</h3>
      </div>
      <p className="text-stone-400">{FACTION_NAME[u.owner]} · {ds.keywords.join(', ')}</p>
      {ds.description && <p className="mt-1 text-stone-200">{ds.description}</p>}
      <UnitRoleTips u={u} />
      <p className="mt-1 text-amber-200" aria-label={tr('Unit cost')}>
        {tr('Cost: {fmtPoints}', { fmtPoints: fmtPoints(unitPoints(u.datasheetId, u.startingModels, copy)) })}
        <span className="text-stone-400"> {tr('· {startingModels} models, ≈ {pointsPerModel} pts per model', { startingModels: u.startingModels, pointsPerModel: pointsPerModel(u.datasheetId, u.startingModels, copy) })}</span>
      </p>
      <table className="mt-1 w-full text-center">
        <thead className="text-stone-400"><tr><th className="text-left">{tr('Model')}</th>{['M', 'T', 'Sv', 'W', 'Ld', 'OC'].map((k) => <StatTh key={k} k={k} />)}</tr></thead>
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
        <thead className="text-stone-400"><tr><th className="text-left">{tr('Weapons')}</th>{[tr('Range'), 'A', 'BS/WS', 'S', 'AP', 'D'].map((k) => <StatTh key={k} k={k} />)}</tr></thead>
        <tbody>
          {weapons.flatMap((w) => w.profiles.map((p, i) => (
            <tr key={w.id + i} title={keywordText(p.keywords)}>
              <td className="text-left">
                {w.name}{p.name ? ` — ${p.name}` : ''}
                {keywordText(p.keywords) && <span className="block text-[10px] text-sky-300">{keywordText(p.keywords)}</span>}
                <WeaponHints p={p} />
              </td>
              <td>{p.range === 'melee' ? tr('melee') : `${p.range}″`}</td><td>{fmtRandom(p.attacks, p.randomA)}</td><td>{p.skill ? `${p.skill}+` : tr('auto')}</td><td>{p.s}</td><td>{p.ap}</td><td>{fmtRandom(p.d, p.randomD)}</td>
            </tr>
          )))}
        </tbody>
      </table>
      <StatGlossary />
      <ul className="mt-2 list-disc pl-4 text-stone-300">
        {ds.abilities.map((a) => <li key={a}>{ABILITY_TEXT[a]}</li>)}
      </ul>
      <ZoneLines u={u} />
      <details className="mt-2">
        <summary className="cursor-pointer text-stone-300">{tr('📷 Model photos')}</summary>
        <p className="my-1 text-[11px] text-stone-400">{tr('Photograph your miniatures from the set from above or the front — the photos replace the drawn tokens. Stored only in this browser.')}</p>
        {profiles.map((p) => <PhotoUpload key={p.id} profileId={p.id} name={p.name} />)}
      </details>
      {u.datasheetId === 'boyz' && u.startingModels < 10 && (
        <p className="mt-1 text-[11px] text-amber-400">{tr('Introductory Set training configuration: in the official Boyz datasheet the minimum is 10 models and 1 special weapon per 10 models.')}</p>
      )}
    </section>
  )
}

/** Auras and other zones: the ones the unit stands in, and whom its own zones cover now. */
function ZoneLines({ u }: { u: UnitState }) {
  const game = useStore((s) => s.game)
  if (!game) return null
  const unit = game.units.find((x) => x.id === u.id) ?? u
  const on = zonesOn(game, unit)
  const own = zonesOf(game, unit).filter((z) => z.kind !== 'explosion')
  if (!on.length && !own.length) return null
  return (
    <div className="mt-2 text-[11px]" aria-label={tr('Zones')}>
      {on.length > 0 && (
        <p className="text-teal-300">
          {tr('Affected by: {list}', { list: on.map((h) => tr('{zone} ({name}): {badge}', { zone: h.zone.name, name: h.source.name, badge: badgeText(h) })).join('; ') })}
        </p>
      )}
      {own.map((z) => {
        const list = unitsCovered(game, z, unit).filter((t) => t.id !== unit.id).map((t) => t.name)
        return (
          <p key={z.id} className="text-stone-300">
            {list.length ? tr('Zone {zone} {radius}″ covers: {list}', { zone: z.name, radius: z.radius, list: list.join(', ') }) : tr('Zone {zone} {radius}″ covers nobody now', { zone: z.name, radius: z.radius })}
          </p>
        )
      })}
    </div>
  )
}

/** What the weapon is good at, read off its profile ("Best against infantry hordes", "Almost useless against vehicles"). */
function WeaponHints({ p }: { p: WeaponProfile }) {
  return (
    <span className="block text-[10px] leading-tight" aria-label={tr('What this weapon is for')}>
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
      <summary className="cursor-pointer text-sky-300">{tr('What do these letters mean?')}</summary>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-stone-300">
        {STAT_HELP.map((h) => (
          <div key={h.key} className="contents">
            <dt className="font-semibold text-stone-100">{h.key}</dt>
            <dd><b className="font-medium">{h.name}</b> — {h.text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-[11px] text-stone-400">{tr('Example: “Sv 3+” — when wounded, the defender rolls a die and shrugs the wound off on a 3, 4, 5 or 6.')}</p>
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
          <div className="text-lg font-bold">{game.winner === 'draw' ? tr('Draw') : tr('Victory: {item}', { item: FACTION_NAME[game.winner] })}</div>
          <div>{tr('VP score — {scoreText}', { scoreText: scoreText(game, 'full') })}</div>
          <button className="btn mt-2" onClick={() => (st.shared ? leaveRoom() : st.startDeployment())}>{st.shared ? tr('Leave the room') : tr('New battle')}</button>
        </div>
      ) : (
        <PhaseTrack game={game} myTurn={myTurn} />
      )}
      {(game.mission || game.secondary || (game.reserves?.length ?? 0) > 0) && !game.winner && <TurnPlan game={game} me={human} />}
      {game.mission && <MissionCard game={game} />}
      {game.secondary && <SecondaryPanel game={game} me={human} />}
      {(game.reserves?.length ?? 0) > 0 && <ReservePanel game={game} me={human} />}
      {(game.embarked?.length ?? 0) > 0 && <TransportPanel game={game} me={human} />}
      {!game.winner && explain !== 'minimal' && (
        <details className="text-xs text-stone-300">
          <summary className="cursor-pointer text-sky-300">{tr('Phase rules')}</summary>
          <p className="mt-1">{explain === 'beginner' ? PHASE_HELP[game.phase].long : PHASE_HELP[game.phase].short}</p>
        </details>
      )}
      {st.settings.tutorial && <Tutorial />}
      {!game.winner && myTurn && game.phase === 'command' && human === 'orks' && (
        <ActionButton cmd={{ type: 'callWaaagh' }} label={tr('WAAAGH! (Battle Cry, once per battle)')} />
      )}
      {!game.winner && myTurn && game.phase === 'command' && game.players[human].shadowUsed === false && (
        <ActionButton cmd={{ type: 'callShadow' }} label={tr('Shadow in the Warp (once per battle)')} />
      )}
      {!game.winner && myTurn && game.phase === 'command' && game.players[human].imperative !== undefined && <ImperativePicker />}
      {!game.winner && myTurn && game.phase === 'command' && human === 'marines' && <DoctrinePicker />}
      {!game.winner && myTurn && lastRoundWarning(game, human) && (
        <p className="rounded border border-rose-500 bg-rose-950/60 p-2 text-xs text-rose-100" role="alert">{lastRoundWarning(game, human)}</p>
      )}
      {!game.winner && <StratagemsPanel />}
      {sel ? <UnitActions u={sel} /> : <p className="text-stone-400">{tr('Pick a unit on the field or in the list.')}</p>}
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
    <section className="rounded border border-violet-700/70 bg-violet-950/30 p-2 text-xs" aria-label={tr('Stratagems')}>
      <div className="flex items-center justify-between">
        <b className="text-violet-200">{tr('📜 Stratagems')}</b>
        <span className="rounded bg-violet-800 px-1.5 text-violet-50" title={tr('Command points (CP): +1 for each player in every Command phase')}>CP: {cp}</span>
      </div>
      {cpReminder(game, human) && (
        <p className="mt-1 rounded border border-amber-600 bg-amber-950/50 p-1 text-[11px] text-amber-100">{tr('💡 You have {cp} CP saved up — unspent points do nothing. See what you can use below.', { cp })}</p>
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
                  <ActionButton key={x.unit.id + (x.cmd.targetId ?? '')} cmd={x.cmd} label={tr('Use: {stratagemTarget}', { stratagemTarget: stratagemTarget(game, x.unit, x.cmd) })} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        myTurn && <p className="mt-1 text-stone-400">{cp === 0 ? tr('No Command Points — they are added in every Command phase.') : tr('Nothing to use right now.')}</p>
      )}
      <details className="mt-1" open={beginner && now.length > 0}>
        <summary className="cursor-pointer text-sky-300">{tr('What they do')}</summary>
        <ul className="mt-1 flex flex-col gap-1 text-[11px] text-stone-300">
          {STRATAGEM_IDS.filter((id) => !STRATAGEMS[id].faction || STRATAGEMS[id].faction === human).map((id) => {
            const x = STRATAGEMS[id]
            return (
              <li key={id}>
                <b className="text-stone-100">{x.name}</b> ({showOfficialName ? `${x.nameEn}, ` : ''}{x.cost} CP, {x.phases.map((p) => PHASE_SHORT[p]).join(' / ')}): {x.text}
                <span className="block text-emerald-300">{tr('When it pays off: {when}', { when: x.when })}</span>
              </li>
            )
          })}
        </ul>
        {later.length > 0 && (
          <p className="mt-1 text-[11px] text-stone-500">{tr('Also in the “{item}” detachment, not yet available: {list}.', { item: DETACHMENT[human], list: later.map((x) => `${x.name} (${x.why})`).join('; ') })}</p>
        )}
        <p className="mt-1 text-[10px] text-stone-500">{tr('Each Stratagem — once per phase, one per unit per phase; they cannot be used on a Battle-shocked unit. Buttons are shown for all your units a Stratagem can be used on right now. Stratagems on the opponent’s turn (fire overwatch, smokescreen, heroic intervention) are offered by the game itself — in a pause, and only when they pay off.')}</p>
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
  const verb: Partial<Record<string, string>> = { movement: tr('move'), shooting: tr('shoot'), charge: tr('charge'), fight: tr('fight') }
  return (
    <section className={`rounded border p-2 ${myTurn ? 'border-emerald-600 bg-emerald-950/40' : 'border-stone-600 bg-stone-800/60'}`} aria-label={tr('Current phase')}>
      <div className="mb-1 text-xs text-stone-400">{tr('Round {round}/{maxRounds} · turn:', { round: game.round, maxRounds: game.maxRounds })} <b style={{ color: FACTION_STYLE[game.activePlayer].secondary }}>{FACTION_NAME[game.activePlayer]}</b>{game.activePlayer === human ? tr(' (you)') : ` (${rivalName()})`}</div>
      <ol className="flex flex-wrap gap-1" aria-label={tr('Turn phases')}>
        {PHASES.map((p, i) => (
          <li key={p} aria-current={i === cur ? 'step' : undefined} className={`rounded px-1.5 py-0.5 text-[11px] ${i === cur ? 'bg-yellow-500 font-semibold text-black' : i < cur ? 'bg-stone-700 text-stone-400' : 'bg-stone-800 text-stone-300'}`}>
            {i < cur ? '✓ ' : i === cur ? '▶ ' : ''}{PHASE_SHORT[p]}
          </li>
        ))}
      </ol>
      <div className="mt-2 font-semibold">{game.pendingReroll ? (myTurn ? tr('Command Re-roll — your decision') : tr('{rivalName} is deciding whether to re-roll the die…', { rivalName: rivalName() })) : game.reaction?.window === 'beforeShockTests' ? (myTurn ? tr('Your turn — before the shock test') : tr('{rivalName} is deciding about “Insane Bravery”…', { rivalName: rivalName() })) : game.reaction?.window === 'onTargeted' ? (myTurn ? tr('Your unit is under attack — your reaction') : tr('{rivalName} is deciding whether to answer with a Stratagem…', { rivalName: rivalName() })) : game.reaction?.window === 'afterAttacks' ? (myTurn ? tr('Losses — reanimation?') : tr('{rivalName} is deciding about reanimation…', { rivalName: rivalName() })) : game.reaction ? (myTurn ? tr('Opponent’s turn — your reaction') : tr('{rivalName} is deciding whether to answer with a reaction…', { rivalName: rivalName() })) : myTurn ? tr('Your turn') : tr('{rivalName} ({item}) is playing…', { rivalName: rivalName(), item: FACTION_NAME[actor(game)] })} — {PHASE_NAME[game.phase].split(' (')[0]}</div>
      {!myTurn && thinking && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-sky-300" role="status" aria-label={tr('AI is thinking')}>
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-300" aria-hidden />
          {tr('AI is thinking about its move…')}
        </p>
      )}
      {explain !== 'minimal' && <p className="text-xs text-stone-300">{PHASE_GOAL[game.phase]}</p>}
      {myTurn && !game.reaction && !game.pendingReroll && !status.canEnd && status.reason && <p className="mt-1 text-xs text-amber-300">{tr('First: {reason}', { reason: status.reason })}</p>}
      {myTurn && status.canEnd && verb[game.phase] && (
        <p className="mt-1 text-xs">
          {ready.length
            ? <>{tr('Can {item}: ', { item: verb[game.phase] })}{ready.map((u) => <b key={u.id} className="text-emerald-300">{quote(u.name)} </b>)}<span className="text-stone-400">{tr('(optional)')}</span></>
            : <span className="text-stone-300">{tr('No one else can {item} — you can end the phase.', { item: verb[game.phase] })}</span>}
        </p>
      )}
      {myTurn && explain !== 'minimal' && <p className="mt-1 text-[11px] text-stone-400">{tr('After “{nextPhaseLabel} ▶”: {item}', { nextPhaseLabel: nextPhaseLabel(game), item: PHASE_NEXT[game.phase] })}</p>}
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
      <summary className="cursor-pointer text-xs font-semibold uppercase text-stone-400">{tr('0. Battlefield (optional)')}</summary>
      <p className="mt-1 text-[11px] text-stone-400">{tr('Drag a terrain piece onto the field to move it; click to resize. The layout is remembered for this scenario.')}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {(Object.keys(TERRAIN_PRESETS) as TerrainPreset[]).map((p) => (
          <button key={p} className="btn text-xs" onClick={() => add(p)}>+ {TERRAIN_PRESETS[p].name}</button>
        ))}
      </div>
      {sel && box && (
        <div className="mt-2 rounded bg-stone-900 p-2 text-xs" aria-label={tr('Selected terrain piece')}>
          <div className="font-semibold">{sel.name} <span className="font-normal text-stone-400">— {sel.obscuring ? tr('blocks line of sight, gives cover') : tr('gives cover to infantry, does not block line of sight')}</span></div>
          <div className="mt-1 flex items-center gap-2">
            <label>{tr('Width')} <input type="number" className="w-14 rounded bg-stone-700 px-1" min={0.5} max={12} step={0.5} value={box.w} onChange={(e) => update({ w: Number(e.target.value) })} />″</label>
            <label>{tr('Depth')} <input type="number" className="w-14 rounded bg-stone-700 px-1" min={0.5} max={12} step={0.5} value={box.h} onChange={(e) => update({ h: Number(e.target.value) })} />″</label>
          </div>
          <div className="mt-1 flex gap-1">
            <button className="btn text-xs" onClick={() => update({ w: box.h, h: box.w })}>{tr('⟳ Rotate')}</button>
            <button className="btn text-xs" onClick={() => { st.editTerrain(game.terrain.filter((t) => t.id !== sel.id)); st.selectTerrain(null) }}>{tr('🗑 Delete')}</button>
          </div>
        </div>
      )}
      <button className="mt-2 text-[11px] text-sky-300 underline" onClick={() => st.resetTerrain()}>{tr('Restore the terrain as in the scenario')}</button>
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
    <section className="flex flex-col gap-2" aria-label={tr('Army placement')}>
      <div className="rounded border border-emerald-600 bg-emerald-950/40 p-2">
        <div className="text-xs text-stone-400">{tr('Battle preparation')}</div>
        <div className="font-semibold">{tr('Army placement (Deployment)')}</div>
        {beginner && <p className="text-xs text-stone-300">{tr('Before the first round each player places their models in their deployment zone. Where you start decides who reaches the objectives first and who comes under fire.')}</p>}
      </div>

      <TerrainEditor />

      <DeployPresetCards />

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">{tr('1. Your army')}</h3>
        {mine.map((u) => {
          const done = placed.includes(u.id)
          return (
            <button key={u.id} onClick={() => st.select(u.id)} className={`mb-1 w-full rounded border px-2 py-1 text-left ${u.id === st.selectedUnitId ? 'border-yellow-400 bg-stone-700' : 'border-stone-600 bg-stone-800 hover:bg-stone-700'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{u.name}</span>
                <span className={`text-xs ${done ? 'text-emerald-300' : 'text-amber-300'}`}>{done ? tr('✓ placed') : tr('○ waiting')} {tr('· {length} models', { length: alive(u).length })}</span>
              </div>
              {beginner && <div className="text-[11px] text-stone-400">{UNIT_ROLE[u.datasheetId]}</div>}
            </button>
          )
        })}
        <p className="text-[11px] text-stone-500">{tr('Stats and weapons are in the unit card on the left (the “»” button if the panel is collapsed).')}</p>
      </div>

      {game.deployment && !st.shared && <ReserveSetup />}
      {!st.shared && game.units.some((u) => u.owner === human && isTransport(u)) && <TransportSetup />}

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">{tr('2. Where to place')}</h3>
        <ul className="list-disc pl-4 text-xs text-stone-300">
          <li>{tr('Each base —')} <b>{tr('entirely')}</b> {tr('in your zone: a {fmt}″ strip at the', { fmt: fmt(depth) })} {zone[0].x === 0 ? tr('left') : tr('right')} {tr('edge (highlighted, yellow dashes).')}</li>
          <li>{tr('The unit’s models stay together: each within 2″ of another model of the unit, all within 9″ (coherency).')}</li>
          <li>{tr('Bases must not overlap.')}</li>
          {unitsOf(game, human).some((u) => hasAbility(u, 'infiltrators')) && <li>{tr('Infiltrators (Infiltrators, Sicarians) can be placed anywhere more than 8″ from the zone and enemy models.')}</li>}
        </ul>
        {beginner && <p className="mt-1 text-[11px] text-stone-400">{tr('The opponent ({item}) already stands in its zone. A training simplification: in a real game the sides place units in turns.', { item: FACTION_NAME[other(game, human)] })}</p>}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">{tr('3. Place the models')}</h3>
        <p className="text-xs text-stone-300">{tr('Pick a unit, drag a model onto the field and press “✓ Place” under the field (or Enter). The “Whole unit / One model at a time” switch under the field decides what dragging moves. “↶” undoes the last placement.')}</p>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">{tr('4. Check')}</h3>
        <p className="text-xs">{tr('Units placed:')} <b>{mine.filter((u) => placed.includes(u.id)).length}/{mine.length}</b> {tr('· models:')} <b>{placedModels}/{models}</b></p>
        {issues.length > 0 && <ul className="mt-1 text-[11px] text-amber-300">{issues.map((t) => <li key={t}>○ {t}</li>)}</ul>}
        <button className="btn btn-primary mt-2 w-full" disabled={issues.length > 0} onClick={() => st.finishDeployment()} title={issues[0]}>{tr('Start the battle ▶')}</button>
        {issues.length > 0 && <button className="btn mt-1 w-full" onClick={() => st.autoDeploy()} title={tr('Put the unplaced units at the suggested places')}>{tr('Keep the rest at the suggested places')}</button>}
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
    return <p className="rounded border border-sky-700 bg-sky-950/40 p-2 text-xs text-sky-200">{tr('Combat Doctrine:')} <b>{DOCTRINE_NAME[p.doctrine]}</b> — {DOCTRINE_TEXT[p.doctrine]}{tr(', until your next Command phase.')}</p>
  return (
    <div className="flex flex-col gap-1 rounded border border-sky-700 bg-sky-950/40 p-2" aria-label={tr('Combat Doctrines')}>
      <b className="text-xs text-sky-200">{tr('Combat Doctrines: you can pick one — or hold back')}</b>
      {DOCTRINES.map((d) => (
        <ActionButton key={d} cmd={{ type: 'doctrine', doctrine: d }} label={`${DOCTRINE_NAME[d]}: ${DOCTRINE_TEXT[d]}${used.includes(d) ? tr(' (already used — a repeat by Codex Discipline)') : ''}`} />
      ))}
      <span className="text-[11px] text-stone-400">{tr('Each once per battle, and one of them once more. Chosen: {list}.', { list: used.length ? used.map((d) => DOCTRINE_NAME[d]).join(', ') : tr('none yet|chosen') })}</span>
    </div>
  )
}

/** Doctrina Imperatives (Adeptus Mechanicus army rule): one choice per turn, active until your next Command phase. */
function ImperativePicker() {
  const game = useStore((s) => s.game!)
  const human = useStore((s) => s.settings.human)
  const chosen = game.players[human].imperative
  if (chosen)
    return <p className="rounded border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-200">{tr('Imperative:')} <b>{chosen === 'protector' ? tr('Protector') : tr('Conqueror')}</b> {tr('— lasts until your next Command phase.')}</p>
  return (
    <div className="flex flex-col gap-1 rounded border border-amber-700 bg-amber-950/40 p-2" aria-label={tr('Doctrina Imperatives')}>
      <b className="text-xs text-amber-200">{tr('Doctrina Imperatives: pick one')}</b>
      <ActionButton cmd={{ type: 'imperative', imperative: 'protector' }} label={tr('🛡 Protector: Heavy, BS 1 better, −1 to hit against battleline units in melee')} />
      <ActionButton cmd={{ type: 'imperative', imperative: 'conqueror' }} label={tr('⚔ Conqueror: Assault, WS 1 better, AP +1 for battleline units')} />
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
  if (isDestroyed(u)) return <p className="text-stone-400">{tr('{name}: the unit is destroyed.', { name: u.name })}</p>
  if (u.owner !== human) {
    return (
      <div className="rounded border border-stone-600 p-2">
        <b>{u.name}</b> {tr('— an enemy unit.')} {st.settings.explain !== 'minimal' && tr('Pick your unit to act. The ruler can measure the distance to this unit.')}
      </div>
    )
  }
  if (actor(game) !== human) return <p className="text-stone-400">{tr('Wait for your turn.')}</p>

  const actions = unitActions(game, u.id)
  return (
    <div className="flex flex-col gap-2 rounded border border-stone-600 p-2">
      <b>{tr('{name}: actions', { name: u.name })}</b>
      {game.phase === 'command' && <p className="text-xs text-stone-300">{tr('In the Command phase the units have nothing to do — press “End phase”.')}</p>}
      {game.phase === 'movement' && <MoveControls u={u} />}
      {game.phase === 'shooting' && <ShootControls u={u} />}
      {game.phase === 'charge' && !u.chargeDeclared && !game.pendingCharge && <ChargeForecastView u={u} />}
      {actions.filter((a) => !a.id.startsWith('shoot:') && !a.id.startsWith('strat:')).map((a) => (
        <ActionButton key={a.id} cmd={a.cmd!} label={a.label} />
      ))}
      {game.phase === 'fight' && !game.fight && <p className="text-xs text-stone-300">{tr('The fights are finished — end the phase.')}</p>}
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
    const after = { none: '', normal: tr('Can shoot and charge as usual.'), advance: tr('After an Advance: only Assault weapons shoot, the unit cannot charge.'), fallBack: tr('After falling back: does not shoot or charge this turn.') }[u.move]
    return <p className="text-xs text-stone-300">{tr('✓ The unit has already moved in this phase. {after}', { after })} {st.history.length > 0 && tr('Changed your mind — “↶ Undo”.')}</p>
  }
  const engaged = engagedUnits(game, u).length > 0
  const advance = validate(game, { type: 'declareAdvance', unitId: u.id })
  const modes = [
    { id: 'normal', label: tr('Normal move'), text: tr('up to {m}″, then it can shoot and charge', { m: profileOf(alive(u)[0]).m }), ok: !engaged && u.advanceRoll === null, why: engaged ? tr('the unit is in engagement range of the enemy') : tr('an Advance has already been declared') },
    { id: 'advance', label: tr('Advance|mode'), text: tr('M + D6″, but then only Assault weapons and no charge'), ok: u.advanceRoll !== null || advance.ok, why: advance.ok ? '' : advance.reason },
    { id: 'fallBack', label: tr('Fall Back|mode'), text: tr('leave engagement range; then no shooting or charging'), ok: engaged, why: tr('only for a unit in engagement range of the enemy') },
  ] as const
  const used = hasDraft ? draftDistance(u, st.draft) : 0
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-stone-300">{tr('Mode:')} <b>{{ normal: tr('Normal move'), advance: tr('Advance (+{advanceRoll}″)', { advanceRoll: u.advanceRoll }), fallBack: tr('Fall Back|mode') }[mode]}</b>{tr(', up to {fmt}″.', { fmt: fmt(allow) })}</p>
      {st.settings.explain !== 'minimal' && (
        <ul className="text-[11px]">
          {modes.map((m) => (
            <li key={m.id} className={m.id === mode ? 'text-yellow-200' : m.ok ? 'text-stone-300' : 'text-stone-500'}>
              {m.id === mode ? '▶' : m.ok ? '○' : '⛔'} <b>{m.label}</b>: {m.text}{!m.ok && m.id !== mode && m.why ? tr(' — unavailable: {why}', { why: m.why }) : ''}
            </li>
          ))}
        </ul>
      )}
      {hasDraft && <p className="text-[11px]">{tr('Covered:')} <b>{fmt(used)}″</b> {tr('of {fmt}″ · {fmt2}″ left', { fmt: fmt(allow), fmt2: fmt(Math.max(0, allow - used)) })}</p>}
      {hasDraft && v && !v.ok && <p className="text-[11px] text-rose-300">{tr('⛔ {reason} Move the model or press “↺ Undo” (Esc).', { reason: v.reason })}</p>}
      {hasDraft && v?.ok && <p className="text-[11px] text-emerald-300">{tr('✓ The position is legal — “Confirm” under the field (or Enter).')}</p>}
      {!hasDraft && <p className="text-[11px] text-stone-400">{tr('Drag a model onto the field: the dashed circle is the limit, the shadow is the starting position. “One model at a time” mode (under the field) lets you move just one or two models — the rest stay in place, but the unit must stay coherent (each model within 2″ of another). You can also leave the unit unmoved.')}</p>}
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
        <input type="checkbox" checked={opts.usePistols} onChange={(e) => st.setShotOptions({ usePistols: e.target.checked })} /> {tr('Shoot pistols (Close-quarters)')}
      </label>
      {datasheetOf(u).abilities.includes('ammoRunts') && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" disabled={u.ammoRuntsUsed} checked={opts.useAmmoRunts && !u.ammoRuntsUsed} onChange={(e) => st.setShotOptions({ useAmmoRunts: e.target.checked })} /> {tr('Ammo Runts (+1 to hit, once per battle)')}{u.ammoRuntsUsed && tr(' — used')}
        </label>
      )}
      {enemies.map((e) => {
        const cmd = { type: 'shoot' as const, unitId: u.id, targetId: e.id, ...opts }
        const plan = shootPlan(game, u, e, opts)
        const a = advice.find((x) => x.targetId === e.id)
        return (
          <div key={e.id}>
            <ActionButton cmd={cmd} label={tr('{value}Shoot at “{name}”{value2}', { value: a?.best ? '★ ' : '', name: e.name, value2: plan.cover && !plan.problem ? tr(' (in cover)') : '' })} />
            {a && !a.problem && <TargetAdviceView a={a} all={advice} />}
            {!plan.problem && !u.shot && <AttackPreview plan={plan} attacker={u} target={e} />}
          </div>
        )
      })}
      {!u.shot && enemies.length > 0 && enemies.every((e) => shootPlan(game, u, e, opts).problem) && (
        <p className="text-[11px] text-stone-400">{tr('💡 Right now “{name}” cannot shoot at any target. Get closer or step out from behind cover in the next Movement phase, and for now pick another unit or end shooting.', { name: u.name })}</p>
      )}
    </div>
  )
}

/** Before a charge: for each enemy in reach, the chance to get there and how the fight is expected to go. */
function ChargeForecastView({ u }: { u: UnitState }) {
  const game = useStore((s) => s.game!)
  const list = chargeForecast(game, u)
  if (!list.length) return <p className="text-[11px] text-stone-400">{tr('No enemies within 12″ — nobody to charge.')}</p>
  const tone = { good: 'border-emerald-700', risky: 'border-amber-600', bad: 'border-rose-700' }
  const head = { good: '✅', risky: '⚠', bad: '⛔' }
  return (
    <div className="flex flex-col gap-1 text-[11px]" aria-label={tr('Charge forecast')} data-testid="charge-forecast">
      <b className="text-xs">{tr('⚔ Charge forecast')}</b>
      {list.map((f) => (
        <div key={f.targetId} className={`rounded border-l-4 bg-stone-900/70 px-2 py-1 ${tone[f.verdict]}`}>
          <div>{head[f.verdict]} <b>{quote(f.name)}</b>: {forecastLine(f)}</div>
          {f.warnings.map((w) => <div key={w} className="text-amber-300">{w}</div>)}
        </div>
      ))}
      <p className="text-[10px] text-stone-500">{tr('Averages over all rolls. After a charge your unit strikes first; the enemy answers with the survivors.')}</p>
    </div>
  )
}

/** Expected result of shooting this target, with a star for the best one and warnings for overkill or a poor pick. */
function TargetAdviceView({ a, all }: { a: TargetAdvice; all: TargetAdvice[] }) {
  const warn = adviceWarnings(a, all)
  return (
    <div className="mt-0.5 px-1 text-[11px] leading-snug" data-testid="target-advice">
      <span className={a.best ? 'text-emerald-300' : 'text-stone-300'}>{adviceLine(a)}{a.best ? tr(' · best target') : ''}</span>
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
        {tr('Breakdown: {reduce}', { reduce: plan.groups.reduce((a, g) => a + g.attacks, 0) })}{plan.groups.some((g) => g.randomAttacks) ? '+' : ''} {tr('attacks · {length} of {length2} models shoot', { length: plan.firingModels.length, length2: alive(attacker).length })}{plan.cover ? tr(' · target in cover (−1 to skill)') : ''}
      </summary>
      {plan.groups.map((g) => {
        const hr = hitRoll(g.profile, g.ctx)
        const needs = saves.map((m) => ({ need: saveTarget(m, g.profile.ap, invulnFor(g.ctx, m)).need, name: profileOf(m).name }))
        const save = new Set(needs.map((x) => x.need)).size === 1 ? `${needs[0].need}+` : needs.map((x) => `${x.need}+ (${x.name})`).join(', ')
        return (
          <div key={g.weaponName + g.profile.name} className="mt-1 border-t border-stone-700 pt-1">
            <b>{g.weaponName}{g.profile.name ? ` — ${g.profile.name}` : ''}</b> {tr('×{models} models: {attacks}', { models: g.models, attacks: g.attacks })}{g.randomAttacks ? ` + ${g.randomAttacks}×${g.profile.randomA}` : ''} {tr('attacks|short')}{g.notes.length ? ` (${g.notes.join(', ')})` : ''}
            {heavyTarget && weaponAdvice(g.profile).uselessVsArmour && <span className="block text-amber-300">{tr('⚠ This weapon barely wounds vehicles and monsters.')}</span>}
            <ol className="list-decimal pl-4 text-stone-300">
              <li>{tr('Hit:')} {hr.skill === null ? tr('automatically (Torrent)') : `${hr.skill}+${hr.mod ? tr(', modifier {value}{mod} ({list}) — effectively {min}+', { value: hr.mod > 0 ? '+' : '', mod: hr.mod, list: g.ctx.hitModNotes.join(', '), min: Math.min(6, Math.max(2, hr.skill - hr.mod)) }) : ''}`}{g.ctx.lethalHits ? tr('; a 6 wounds at once (Lethal Hits)') : ''}</li>
              <li>{tr('Wound: {woundTarget}+ (Strength {s} vs Toughness {t})', { woundTarget: woundTarget(g.profile.s, t), s: g.profile.s, t })}{g.ctx.woundMod ? tr(', modifier {woundMod} ({woundModNote})', { woundMod: g.ctx.woundMod, woundModNote: g.ctx.woundModNote }) : ''}</li>
              <li>{tr('Target’s save: {save} (AP {ap})', { save, ap: g.profile.ap })}</li>
              <li>{tr('Damage: {fmtRandom} per unsaved wound', { fmtRandom: fmtRandom(g.profile.d, g.profile.randomD) })}{g.ctx.damageMod ? tr(' ({damageMod}, Dread \'Ard; not less than 1)', { damageMod: g.ctx.damageMod }) : ''}</li>
            </ol>
          </div>
        )
      })}
      {plan.skipped.length > 0 && <p className="mt-1 text-amber-300">{tr('Not shooting: {list}', { list: plan.skipped.join(' ') })}</p>}
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
  const entries = game.diceLog.filter((d) => d.id > afterId && d.steps.some((x) => x.meta?.kind === 'hit'))
  const entry = entries[pos.e]
  if (!entry) return null
  const step = entry.steps[pos.i]
  const ex = explainStep(step)
  const lastStep = pos.i === entry.steps.length - 1
  const lastEntry = pos.e === entries.length - 1
  const next = () => (lastStep ? (lastEntry ? close() : setPos({ e: pos.e + 1, i: 0 })) : setPos({ e: pos.e, i: pos.i + 1 }))
  const prev = () => (pos.i > 0 ? setPos({ e: pos.e, i: pos.i - 1 }) : pos.e > 0 && setPos({ e: pos.e - 1, i: entries[pos.e - 1].steps.length - 1 }))
  return (
    <section className="absolute bottom-16 left-1/2 z-[3] w-[min(94%,560px)] -translate-x-1/2 rounded-lg border border-yellow-500 bg-stone-950/95 p-3 text-sm shadow-2xl" aria-label={tr('Attack review')} role="region">
      <div className="text-xs text-stone-400">
        {entry.player === human ? tr('Your attack') : tr('⚠ The opponent attacks your unit')}{entries.length > 1 ? tr(' · weapon {value} of {length}', { value: pos.e + 1, length: entries.length }) : ''}
      </div>
      <div className="font-semibold">{entry.title}</div>
      <ol className="mt-2 flex gap-1 text-[11px]" aria-label={tr('Attack steps')}>
        {entry.steps.map((x, i) => (
          <li key={i} aria-current={i === pos.i ? 'step' : undefined} className={`rounded px-1.5 py-0.5 ${i === pos.i ? 'bg-yellow-500 font-semibold text-black' : i < pos.i ? 'bg-stone-700 text-stone-300' : 'bg-stone-800 text-stone-500'}`}>
            {i < pos.i ? '✓ ' : ''}{i + 1}. {x.label}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-stone-200">{ex.text}</p>
      {step.dice.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label={tr('Dice')}>
          {step.dice.map((d, j) => <span key={j} title={d.success ? tr('success') : tr('failure')} className={`die die-anim ${d.success ? 'die-ok' : 'die-fail'} ${d.critical ? 'die-crit' : ''}`} style={{ animationDelay: `${j * 60}ms` }}>{d.value}</span>)}
        </div>
      )}
      {ex.result && <p className="mt-2 font-semibold text-yellow-200">{ex.result}</p>}
      {lastStep && <p className="mt-1 text-xs text-stone-300">{tr('Result: {summary}', { summary: entry.summary })}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button className="btn" disabled={pos.e === 0 && pos.i === 0} onClick={prev}>{tr('◀ Back')}</button>
        <button className="btn btn-primary" onClick={next} autoFocus>{lastStep ? (lastEntry ? tr('Done ✓') : tr('Next weapon ▶')) : tr('Next ▶')}</button>
        <button className="ml-auto text-xs text-stone-400 underline" onClick={close}>{tr('Skip the review')}</button>
      </div>
    </section>
  )
}

/** The most recent attack (all weapon groups of one shoot/fight), step by step. */
function LastAttack() {
  const game = useStore((s) => s.game)!
  const explain = useStore((s) => s.settings.explain)
  const attacks = game.diceLog.filter((d) => d.steps.some((x) => x.meta?.kind === 'hit'))
  const last = attacks.at(-1)
  if (!last) return null
  const key = (d: DiceEntry) => `${d.round}|${d.player}|${d.title.slice(0, d.title.lastIndexOf(':'))}`
  const group: DiceEntry[] = []
  for (let i = attacks.length - 1; i >= 0 && key(attacks[i]) === key(last); i--) group.unshift(attacks[i])
  const succ = (st: DiceEntry['steps'][number]) => st.dice.filter((d) => d.success).length
  return (
    <section aria-label={tr('Last attack')}>
      <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">{tr('Last attack')}</h3>
      {group.map((d) => (
        <div key={d.id} className="mb-1 rounded border border-stone-700 bg-stone-900/70 p-1.5 text-xs">
          <div className="font-medium"><span style={{ color: FACTION_STYLE[d.player].secondary }}>■</span> {d.title}</div>
          {d.steps.map((x, i) => (
            <details key={i} className="mt-0.5">
              <summary className="cursor-pointer">
                {i + 1}. {x.label}{x.target !== '—' ? ` (${x.target})` : ''}: {x.meta?.kind === 'attacks' || x.meta?.kind === 'damage' ? x.note : x.dice.length ? tr('{succ} of {length}{value}', { succ: succ(x), length: x.dice.length, value: x.meta?.kind === 'save' ? tr(' saved') : tr(' succeeded') }) : x.note}
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
      <h3 className="mb-1 text-xs font-semibold uppercase text-stone-400">{tr('AI decisions')}</h3>
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
      {tr('🎓 Tutorial finished.')} <button className="text-sky-300 underline" onClick={() => st.resetTutorial()}>{tr('Redo')}</button>
    </div>
  )
  const n = LESSONS.filter((x) => st.tutorialDone.includes(x.id)).length
  return (
    <div className="rounded border border-sky-600 bg-sky-950/60 p-2 text-xs" aria-label={tr('Tutorial')}>
      <div className="mb-1 font-semibold text-sky-200">🎓 {l.title} <span className="text-sky-400">({n + 1}/{LESSONS.length})</span></div>
      <p>{l.text(human)}</p>
      <div className="mt-1 flex gap-3">
        <button className="text-sky-300 underline" onClick={() => st.completeLesson(l.id)}>{tr('Skip step')}</button>
        <button className="text-stone-400 underline" onClick={() => st.setSettings({ tutorial: false })}>{tr('Hide the tutorial')}</button>
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
              title={d.rerolledFrom ? tr('re-rolled (was {rerolledFrom})', { rerolledFrom: d.rerolledFrom }) : undefined}
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
  const undoBtn = <button className="btn" disabled={!(st.deploying ? st.deployHistory : st.history).length} onClick={() => st.undo()} title={tr('Undo is available for actions without dice rolls')}>{tr('↶ Undo')}</button>
  const restartBtn = st.shared ? null : <button className="btn" onClick={() => { if (confirm(tr('Restart the scenario? The current progress (autosave) will be replaced.'))) st.newGame() }} title={tr('Restart the scenario')}>{tr('⟲ Restart')}</button>
  if (!st.layout.log) {
    const last = game.diceLog.at(-1)
    const openTab = (t: 'dice' | 'log') => { setTab(t); st.toggleLayout('log') }
    return (
      <div className="flex items-center gap-2 text-xs">
        <button className="tab" onClick={() => openTab('dice')}>{tr('▲ Dice ({length})', { length: game.diceLog.length })}</button>
        <button className="tab" onClick={() => openTab('log')}>{tr('▲ Log')}</button>
        <span className="min-w-0 flex-1 truncate text-stone-400">{last ? tr('R{round} · {summary}', { round: last.round, summary: last.summary }) : ''}</span>
        {undoBtn}
        {restartBtn}
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col gap-2 md:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1 flex gap-1">
          <button className={`tab ${tab === 'dice' ? 'tab-on' : ''}`} onClick={() => setTab('dice')}>{tr('Dice ({length})', { length: game.diceLog.length })}</button>
          <button className={`tab ${tab === 'log' ? 'tab-on' : ''}`} onClick={() => setTab('log')}>{tr('Log')}</button>
          <button className="tab ml-auto" onClick={() => st.toggleLayout('log')} title={tr('Collapse the log')}>{tr('▼ Collapse')}</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded bg-stone-900 p-2 text-xs" aria-live="polite">
          {tab === 'dice'
            ? [...game.diceLog].reverse().map((d, idx) => (
                <div key={d.id} className="mb-2 border-b border-stone-700 pb-1">
                  <button className="w-full text-left font-medium text-stone-100" onClick={() => setOpen(open === d.id ? null : d.id)}>
                    <span style={{ color: FACTION_STYLE[d.player].secondary }}>■</span> {tr('R{round} · {title}', { round: d.round, title: d.title })}
                  </button>
                  {idx === 0 || open === d.id ? <DiceFaces entry={d} compact={idx !== 0} /> : <div className="text-stone-400">{d.summary}</div>}
                </div>
              ))
            : [...log].reverse().map((l) => (
                <div key={l.id} className="border-b border-stone-800 py-0.5">
                  <span className="text-stone-500">{tr('R{round}', { round: l.round })}</span> <span style={{ color: FACTION_STYLE[l.player].secondary }}>■</span> {l.text}
                </div>
              ))}
        </div>
      </div>
      <div className="flex w-full flex-col gap-1 md:w-56">
        <p className="text-[11px] text-stone-400">{st.deploying ? tr('Army placement before the battle') : tr('{item} · turn: {item2}{value}', { item: PHASE_NAME[game.phase], item2: FACTION_NAME[game.activePlayer], value: actor(game) !== human ? ` (${rivalName()})` : '' })}</p>
        <p className="text-[11px] text-stone-500">{tr('Keys: Enter — confirm the move, Esc — cancel, R — ruler.')}</p>
        {undoBtn}
        {restartBtn}
        <p className="text-[11px] text-stone-500">{scenarioById(game.scenarioId).name}</p>
      </div>
    </div>
  )
}

/** The primary mission of a 44″×60″ battle: the card, the VP so far (by round, within the caps) and the actions going on. */
function MissionCard({ game }: { game: GameState }) {
  const m = game.mission!
  const card = PRIMARY[m.primary]
  const act = card.action ? MISSION_ACTION[card.action] : null
  const busy = game.units.filter((u) => u.action && !isDestroyed(u))
  const objName = (id: string) => tr('O{value}', { value: game.objectives.findIndex((o) => o.id === id) + 1 })
  return (
    <details className="rounded border border-emerald-700 bg-emerald-950/40 p-2 text-xs" open>
      <summary className="cursor-pointer font-semibold text-emerald-200">{tr('🎯 Mission: {name}', { name: card.name })} <span className="font-normal text-stone-400">({card.nameEn})</span></summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stone-200">
        {card.lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
      {act && <p className="mt-1 text-stone-300"><b>{tr('Action “{name}”', { name: act.name })}</b> ({act.nameEn}): {act.text} {tr('The button is among the unit’s actions in the Shooting phase.')}</p>}
      <table className="mt-2 w-full text-center">
        <thead><tr className="text-stone-400"><th className="text-left">{tr('Primary')}</th>{[1, 2, 3, 4, 5].map((r) => <th key={r} className={r === game.round ? 'text-emerald-300' : ''}>{tr('R{value}', { value: r })}</th>)}<th>{tr('End')}</th><th>{tr('Total')}</th></tr></thead>
        <tbody>
          {sidesOf(game).map((p) => (
            <tr key={p}>
              <td className="text-left">{FACTION_NAME[p]}</td>
              {[1, 2, 3, 4, 5].map((r) => <td key={r}>{m.byRound[p][r] || '·'}</td>)}
              <td>{m.endVp?.[p] || '·'}</td>
              <td className="font-semibold">{primaryTotal(m, p)}/{PRIMARY_CAP}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-stone-400">{tr('Limit: {round} VP per round, {battle} per battle (end-of-battle points are outside the round limit).', { round: ROUND_CAP, battle: PRIMARY_CAP })}</p>
      {busy.length > 0 && <p className="mt-1 text-amber-200">{tr('Performing an action: {list}.', { list: busy.map((u) => `${u.name} (${objName(u.action!.objectiveId)})`).join(', ') })}</p>}
      {m.markers.length > 0 && <p className="mt-1 text-stone-300">{tr('Operation markers: {list}.', { list: sidesOf(game).map((p) => `${FACTION_NAME[p]} — ${m.markers.filter((x) => x.owner === p).map((x) => objName(x.objectiveId)).join(', ') || tr('none|m')}`).join('; ') })}</p>}
    </details>
  )
}

/** Secondary missions: the player's active cards (with the swap / discard buttons), and both sides' VP. */
function SecondaryPanel({ game, me }: { game: GameState; me: PlayerId }) {
  const st = useStore()
  const sec = game.secondary!
  const mine = sec[me]
  const foe = other(game, me)
  const run = (cmd: Command) => st.dispatch(cmd)
  if (!mine) return null
  return (
    <details className="rounded border border-sky-700 bg-sky-950/40 p-2 text-xs" open>
      <summary className="cursor-pointer font-semibold text-sky-200">{tr('🃏 Secondaries: {mode} — {total}/{cap} VP', { mode: mine.mode === 'tactical' ? tr('tactical|mode') : tr('fixed|mode'), total: secondaryTotal(mine), cap: SECONDARY_CAP })}</summary>
      {mine.active.length === 0 && <p className="mt-1 text-stone-400">{mine.mode === 'tactical' ? tr('Cards are drawn at the start of your Command phase.') : tr('No cards.')}</p>}
      {mine.active.map((c) => {
        const card = SECONDARY[c]
        const swap: Command = { type: 'secondary', op: 'swap', card: c }
        const marked = mine.toDiscard.includes(c)
        return (
          <div key={c} className="mt-1 rounded bg-stone-900/60 p-1.5">
            <div className="font-semibold">{card.name} <span className="font-normal text-stone-400">({card.nameEn})</span>{mine.mode === 'fixed' && <span className="text-stone-400"> · {mine.cardVp[c] ?? 0}/{FIXED_CARD_CAP}</span>}</div>
            <div className="text-stone-300">{mine.mode === 'fixed' && card.fixedText ? card.fixedText : card.text}</div>
            {c === 'beacon' && mine.beacon && <div className="text-amber-200">{tr('Beacon: {name}', { name: game.units.find((u) => u.id === mine.beacon)?.name })}</div>}
            {c === 'temptingTarget' && mine.tempting && <div className="text-amber-200">{tr('Target: {obj}', { obj: tr('O{value}', { value: game.objectives.findIndex((o) => o.id === mine.tempting) + 1 }) })}</div>}
            {mine.mode === 'tactical' && game.activePlayer === me && !game.winner && (
              <div className="mt-1 flex flex-wrap gap-1">
                {validate(game, swap).ok && <button className="btn text-xs" onClick={() => run(swap)} title={tr('Once per battle, in your Command phase')}>{tr('🔄 Swap for 1 CP')}</button>}
                <button className={`btn text-xs ${marked ? 'btn-primary' : ''}`} onClick={() => run({ type: 'secondary', op: 'discard', card: c })} title={tr('The card leaves at the end of the turn, after scoring, if not achieved')}>{marked ? tr('✓ Discard at end of turn (+1 CP)') : tr('🗑 Discard at end of turn for +1 CP')}</button>
              </div>
            )}
          </div>
        )
      })}
      {mine.achieved.length > 0 && <p className="mt-1 text-emerald-300">{tr('Achieved: {list}.', { list: mine.achieved.map((a) => tr('{name} (+{vp}, R{round})', { name: SECONDARY[a.card].name, vp: a.vp, round: a.round })).join(', ') })}</p>}
      <table className="mt-2 w-full text-center">
        <thead><tr className="text-stone-400"><th className="text-left">{tr('Secondary')}</th>{[1, 2, 3, 4, 5].map((r) => <th key={r} className={r === game.round ? 'text-sky-300' : ''}>{tr('R{value}', { value: r })}</th>)}<th>{tr('Total')}</th></tr></thead>
        <tbody>
          {sidesOf(game).filter((p) => sec[p]).map((p) => (
            <tr key={p}>
              <td className="text-left">{FACTION_NAME[p]}</td>
              {[1, 2, 3, 4, 5].map((r) => <td key={r}>{sec[p].byRound[r] || '·'}</td>)}
              <td className="font-semibold">{secondaryTotal(sec[p])}/{SECONDARY_CAP}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sec[foe] && <p className="mt-1 text-stone-400">{tr('Opponent has ({mode}): {list}.', { mode: sec[foe].mode === 'tactical' ? tr('tactical|mode') : tr('fixed|mode'), list: sec[foe].active.map((c) => SECONDARY[c].name).join(', ') || tr('no active cards') })}</p>}
      <p className="mt-1 text-stone-400">{tr('Limit: {round} VP per round, {battle} per battle{perCard}. The “when drawn” choices (beacon, target, replacing an impossible card) are made by the game.', { round: SECONDARY_ROUND_CAP, battle: SECONDARY_CAP, perCard: mine.mode === 'fixed' ? tr(', {cap} per card', { cap: FIXED_CARD_CAP }) : '' })}</p>
    </details>
  )
}

/** Deployment: Strategic Reserves (44″×60″) — up to half the army's points wait off the board. */
function ReserveSetup() {
  const st = useStore()
  const game = st.game!
  const human = st.settings.human
  const sel = game.units.find((u) => u.id === st.selectedUnitId && u.owner === human)
  const mine = reservesOf(game, human)
  const { reserved, limit } = reserveBudget(game, human)
  return (
    <div className="rounded border border-violet-700 bg-violet-950/30 p-2 text-xs">
      <h3 className="mb-1 font-semibold uppercase text-violet-200">{tr('Strategic Reserves — {reserved}/{limit} pts', { reserved, limit })}</h3>
      <p className="text-stone-300">{tr('A unit in Reserves is not set up now: from round {from}, in your Movement phase, it arrives whole within {edge}″ of any board edge and more than {enemy}″ from enemies (until round {deadline} — not in the enemy deployment zone; with Deep Strike — anywhere). A unit that has not arrived by the end of round {deadline} is destroyed. At most half the army’s points can go into Reserves.', { from: RESERVE_FROM_ROUND, edge: INGRESS_EDGE, enemy: INGRESS_ENEMY, deadline: RESERVE_DEADLINE })}</p>
      {sel && <button className="btn mt-1 w-full" onClick={() => st.toggleReserve(sel.id)}>{canDeepStrike(sel) ? tr('⏬ {name} — into Reserves (Deep Strike)', { name: sel.name }) : tr('⏬ {name} — into Reserves', { name: sel.name })}</button>}
      {mine.map((u) => (
        <div key={u.id} className="mt-1 flex items-center justify-between gap-2 rounded bg-stone-900/60 px-2 py-1">
          <span>{u.name}{canDeepStrike(u) ? tr(' · Deep Strike') : ''}</span>
          <button className="btn text-xs" onClick={() => st.toggleReserve(u.id)}>{tr('⏫ Onto the board')}</button>
        </div>
      ))}
    </div>
  )
}

/** In battle: the units still in reserve, and for the player's own ones the way onto the board. */
function ReservePanel({ game, me }: { game: GameState; me: PlayerId }) {
  const st = useStore()
  const mine = reservesOf(game, me)
  const theirs = reservesOf(game, other(game, me))
  const closed = ingressWindow(game, me, false)
  const auto = (id: string) => {
    const u = game.reserves!.find((x) => x.id === id)!
    const positions = arrivalSpot(game, u, aiArrivalTarget(game, me))
    if (positions) st.dispatch({ type: 'arrive', unitId: id, positions })
    else st.setMessage(tr('No place to arrive found: at the edge (within 6″) everywhere is closer than 8″ to enemies.'), 'error')
  }
  return (
    <div className="rounded border border-violet-700 bg-violet-950/30 p-2 text-xs">
      <div className="font-semibold text-violet-200">{game.round <= RESERVE_DEADLINE ? tr('⏬ Reserves — arrive by the end of round {n}', { n: RESERVE_DEADLINE }) : tr('⏬ Reserves')}</div>
      {mine.map((u) => (
        <div key={u.id} className="mt-1 rounded bg-stone-900/60 p-1.5">
          <div>{u.name}{canDeepStrike(u) ? tr(' · Deep Strike') : ''} · {tr('{count} models|short', { count: alive(u).length })}</div>
          {!closed && !game.winner && (
            <div className="mt-1 flex flex-wrap gap-1">
              <button className={`btn text-xs ${st.arriving?.unitId === u.id ? 'btn-primary' : ''}`} onClick={() => st.startArrival(st.arriving?.unitId === u.id ? null : u.id)}>{tr('📍 Choose a spot on the board')}</button>
              <button className="btn text-xs" onClick={() => auto(u.id)}>{tr('🎯 Place at the objective')}</button>
            </div>
          )}
        </div>
      ))}
      {mine.length > 0 && closed && <p className="mt-1 text-stone-400">{tr('{reason} Rapid Ingress ({cp} CP) will be offered at the end of the opponent’s Movement phase.', { reason: closed, cp: RAPID_INGRESS_CP })}</p>}
      {st.arriving && <button className="btn mt-1 w-full text-xs" onClick={() => st.startArrival(null)}>{tr('✕ Cancel the spot choice')}</button>}
      {theirs.length > 0 && <p className="mt-1 text-stone-400">{tr('Opponent in Reserves: {list}.', { list: theirs.map((u) => u.name).join(', ') })}</p>}
    </div>
  )
}

const PLAN_STYLE: Record<PlanKind, string> = {
  score: 'text-emerald-200',
  chance: 'text-sky-200',
  keep: 'text-amber-200',
  action: 'text-violet-200',
  secondary: 'text-stone-200',
  reserve: 'text-violet-200',
  warn: 'text-rose-300',
}
const PLAN_ICON: Record<PlanKind, string> = { score: '🎯', chance: '➕', keep: '🛡', action: '🛰', secondary: '', reserve: '⏬', warn: '⚠' }

/** «План хода»: what the mission and the cards would score now, which objectives to take or keep, actions, reserves. */
function TurnPlan({ game, me }: { game: GameState; me: PlayerId }) {
  const lines = turnPlan(game, me)
  if (!lines.length) return null
  return (
    <details className="rounded border border-sky-600 bg-sky-950/30 p-2 text-xs" open>
      <summary className="cursor-pointer font-semibold text-sky-200">{game.activePlayer !== me ? tr('🧭 Turn plan (the opponent is moving now)') : tr('🧭 Turn plan')}</summary>
      <ul className="mt-1 space-y-1">
        {lines.map((l) => (
          <li key={l.text} className={PLAN_STYLE[l.kind]}>{PLAN_ICON[l.kind] && <span className="mr-1">{PLAN_ICON[l.kind]}</span>}{l.text}</li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-stone-400">{tr('Points are counted for the current board, with the limits of {round} per round and {battle} per battle. On the board by the objectives: “+N” is what taking the objective gives, “−N” is what you lose if you give it up.', { round: ROUND_CAP, battle: PRIMARY_CAP })}</p>
    </details>
  )
}

/** Deployment: which units start the battle inside a transport. */
function TransportSetup() {
  const st = useStore()
  const game = st.game!
  const human = st.settings.human
  const sel = game.units.find((u) => u.id === st.selectedUnitId && u.owner === human)
  const transports = game.units.filter((u) => u.owner === human && isTransport(u))
  return (
    <div className="rounded border border-amber-700 bg-amber-950/30 p-2 text-xs">
      <h3 className="mb-1 font-semibold uppercase text-amber-200">{tr('🚚 Transports')}</h3>
      <p className="text-stone-300">{tr('A unit can start the battle inside a transport: it is not set up now and gets out in your Movement phase, wholly within 3″ of the transport. A Dedicated Transport with nobody inside is removed before the battle.')}</p>
      {transports.map((t) => {
        const spec = transportSpec(t)!
        const inside = passengersOf(game, t.id)
        const used = inside.reduce((a, u) => a + placesOf(u, spec), 0)
        const canTake = sel && sel.id !== t.id && !carryProblem(game, sel, t)
        return (
          <div key={t.id} className="mt-1 rounded bg-stone-900/60 p-1.5">
            <div className="font-medium">{t.name} · {tr('{used}/{capacity} places · {kinds}', { used, capacity: spec.capacity, kinds: spec.label })}</div>
            {inside.length === 0 && hasKeyword(t, 'DEDICATED TRANSPORT') && <div className="text-rose-300">{tr('⚠ Empty: it will be removed before the battle.')}</div>}
            {inside.map((u) => (
              <div key={u.id} className="mt-1 flex items-center justify-between gap-2">
                <span>{u.name} · {tr('{count} models|short', { count: alive(u).length })}</span>
                <button className="btn text-xs" onClick={() => st.leaveTransport(u.id)}>{tr('⏫ Onto the board')}</button>
              </div>
            ))}
            {canTake && <button className="btn mt-1 w-full" onClick={() => st.embarkBeforeBattle(sel!.id, t.id)}>{tr('🚚 {name} — into {transport}', { name: sel!.name, transport: t.name })}</button>}
          </div>
        )
      })}
    </div>
  )
}

/** In battle: who is inside which transport, and for the player's own units the way out. */
function TransportPanel({ game, me }: { game: GameState; me: PlayerId }) {
  const st = useStore()
  const mine = embarkedOf(game, me)
  const theirs = embarkedOf(game, other(game, me))
  const auto = (id: string) => {
    const u = game.embarked!.find((x) => x.id === id)!
    const positions = disembarkSpot(game, u, aiArrivalTarget(game, me))
    if (positions) st.dispatch({ type: 'disembark', unitId: id, positions })
    else st.setMessage(tr('No room to get out: every model must be wholly within 3″ of the transport, not next to enemies.'), 'error')
  }
  return (
    <div className="rounded border border-amber-700 bg-amber-950/30 p-2 text-xs">
      <div className="font-semibold text-amber-200">{tr('🚚 In transports')}</div>
      {mine.map((u) => {
        const t = game.units.find((x) => x.id === u.embarkedIn)
        const closed = disembarkWindow(game, u)
        return (
          <div key={u.id} className="mt-1 rounded bg-stone-900/60 p-1.5">
            <div>{tr('{name} in {transport}', { name: u.name, transport: t?.name ?? '?' })} · {tr('{count} models|short', { count: alive(u).length })}</div>
            {!closed && !game.winner && t && (
              <>
                <div className="text-stone-400">{disembarkMode(t) === 'tactical' ? tr('Tactical disembark: the transport has not moved yet, so the unit can still move after getting out.') : tr('Rapid disembark: the transport has already moved, so the unit gets out but makes no move and no charge this turn.')}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <button className={`btn text-xs ${st.arriving?.unitId === u.id ? 'btn-primary' : ''}`} onClick={() => st.startDisembark(st.arriving?.unitId === u.id ? null : u.id)}>{tr('📍 Choose the side on the board')}</button>
                  <button className="btn text-xs" onClick={() => auto(u.id)}>{tr('🚚 Get out towards the objective')}</button>
                </div>
              </>
            )}
            {closed && <div className="text-stone-400">{closed}</div>}
          </div>
        )
      })}
      {st.arriving?.disembark && <button className="btn mt-1 w-full text-xs" onClick={() => st.startDisembark(null)}>{tr('✕ Cancel the spot choice')}</button>}
      {theirs.length > 0 && <p className="mt-1 text-stone-400">{tr('Inside enemy transports: {list}.', { list: theirs.map((u) => u.name).join(', ') })}</p>}
    </div>
  )
}
