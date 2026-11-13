import Konva from 'konva'
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Circle, Ellipse, Group, Image as KImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import { BOARD_STYLE, FACTION_LINE, FACTION_STYLE, TERRAIN_STYLE, TOKENS, tokenImageFor } from '../assets/manifest'
import { boxOf, fitBox, withBox, type Box } from '../game/terrainLayout'
import { actor, moveAllowance, moveCommand, moveModeFor, shootPlan, validate } from '../game/engine'
import { baseRadius, dist, edgeDistance, withinRange } from '../game/geometry/geometry'
import { alive, CHARGE_RANGE, findUnit, fmt, hasAbility, isFlyer, modelDistance, OBJECTIVE_MARKER_MM, OBJECTIVE_RANGE, profileOf, radiusOf, sidesOf, weaponsOf } from '../game/gameState'
import type { Command, GameState, ModelState, Terrain, UnitState, Vec } from '../game/types'
import { useStore } from '../store'
import { movePath } from '../game/rules/movement'
import { objectiveStakes } from '../game/missionAdvice'
import { passengersOf } from '../game/rules/transports'
import { clampToRadius, fitBoard, screenToWorld, worldToScreen, zoomAt, type Viewport } from '../view/transform'
import { actedThisPhase, canActNow, deploymentHint, endPhaseWarning, nextPhaseLabel, nextStepHint, targetCommand } from './guidance'
import { deploymentProblem, deploymentZone } from '../game/rules/deployment'
import { movePreview, type MovePreview } from '../game/movePreview'
import { adviceLine, adviceWarnings, shotAdvice } from '../game/shotAdvice'
import { chargeForecast, forecastLine } from '../game/chargeAdvice'
import { tr } from '../i18n/index'
import { casualties, moveSeconds, reducedMotion, type Casualty } from '../view/animation'

const flat = (pts: Vec[]) => pts.flatMap((p) => [p.x, p.y])

/** Load one HTMLImageElement per URL, shared across all tokens. */
function useImages(urls: string[]) {
  const [imgs, setImgs] = useState<Record<string, HTMLImageElement>>({})
  const key = urls.join('|')
  useEffect(() => {
    let alive = true
    for (const u of new Set(key.split('|').filter(Boolean))) {
      const i = new window.Image()
      i.onload = () => alive && setImgs((m) => ({ ...m, [u]: i }))
      i.src = u
    }
    return () => { alive = false }
  }, [key])
  return imgs
}

function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 800, h: 600 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [ref])
  return size
}

interface Hover {
  unitId: string
  modelId: string
}

export function Board() {
  const game = useStore((s) => s.game)!
  const ref = useRef<HTMLDivElement>(null)
  const size = useSize(ref)
  const [vp, setVp] = useState<Viewport | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const view = vp ?? fitBoard(game.board, size.w, size.h, 32)
  const stageRef = useRef<Konva.Stage>(null)
  useKeyboard()

  const zoomBy = (f: number) => setVp(zoomAt(view, { x: size.w / 2, y: size.h / 2 }, f))
  const sight = useSightPreview()

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden bg-stone-800" data-testid="board">
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable
        onDragEnd={(e) => {
          if (e.target === stageRef.current) setVp({ ...view, x: e.target.x(), y: e.target.y() })
        }}
        onWheel={(e) => {
          e.evt.preventDefault()
          const p = stageRef.current?.getPointerPosition()
          if (p) setVp(zoomAt(view, p, e.evt.deltaY < 0 ? 1.12 : 1 / 1.12))
        }}
      >
        <BoardLayers game={game} view={view} stageRef={stageRef} setHover={setHover} sight={sight} />
      </Stage>
      <GuideBanner />
      {sight && <SightPanel sight={sight} />}
      <div className="absolute right-2 top-14 flex flex-col gap-1">
        <button className="board-btn" onClick={() => zoomBy(1.25)} aria-label={tr('Zoom in')} title={tr('Zoom in (mouse wheel)')}>+</button>
        <button className="board-btn" onClick={() => zoomBy(0.8)} aria-label={tr('Zoom out')} title={tr('Zoom out')}>−</button>
        <button className="board-btn text-xs" onClick={() => setVp(null)} title={tr('Fit the field')}>⤢</button>
      </div>
      <Legend />
      {hover && <ModelTooltip hover={hover} view={view} width={size.w} />}
      <ActionBar />
    </div>
  )
}

// ---------------------------------------------------------------- line of sight preview (movement phase)

type Sight = MovePreview & { planned: boolean }

/** Movement phase: for the selected own unit that has not moved yet, who it would see and who could hit it, from the
 * planned spot (the draft) or from where it stands. The draft is deferred so dragging stays smooth. */
function useSightPreview(): Sight | null {
  const game = useStore((s) => s.game)!
  const human = useStore((s) => s.settings.human)
  const selectedId = useStore((s) => s.selectedUnitId)
  const deploying = useStore((s) => !!s.deploying)
  const draft = useDeferredValue(useStore((s) => s.draft))
  return useMemo(() => {
    if (deploying || game.winner || game.phase !== 'movement' || actor(game) !== human) return null
    const u = selectedId ? findUnit(game, selectedId) : undefined
    if (!u || u.owner !== human || u.move !== 'none') return null
    const p = movePreview(game, u.id, draft, moveModeFor(game, u))
    return p && { ...p, planned: Object.keys(draft).length > 0 }
  }, [game, human, selectedId, draft, deploying])
}

function SightPanel({ sight }: { sight: Sight }) {
  const list = (rows: { name: string; extra?: string }[]) =>
    rows.length ? rows.map((r) => (r.extra ? `${r.name} (${r.extra})` : r.name)).join(', ') : tr('nobody')
  const pct = (p: number) => `${Math.round(p * 100)}%`
  return (
    <details open className="absolute left-2 top-[5.5rem] z-[1] w-[min(19rem,calc(100%-4rem))] rounded-lg border border-sky-700 bg-stone-950/90 px-2 py-1.5 text-[11px] leading-snug text-stone-200 shadow-lg" data-testid="sight-panel">
      <summary className="cursor-pointer font-semibold text-sky-300">👁 {sight.planned ? tr('If you stand here') : tr('From the current position')}</summary>
      <ul className="mt-1 flex flex-col gap-1">
        <li><span className="text-emerald-300">{tr('🎯 You will be able to shoot:')}</span> {list(sight.canShoot.map((r) => ({ name: r.name, extra: r.firing !== undefined && r.models !== undefined && r.firing < r.models ? tr('~{fmt} wounds, {firing} of {models} fire', { fmt: fmt(r.dmg), firing: r.firing, models: r.models }) : tr('~{fmt} wounds', { fmt: fmt(r.dmg) }) })))}</li>
        {sight.partial && <li className="rounded border border-amber-600 px-1 py-0.5 text-amber-200">{tr('⚠ Only {firing} of {models} models will fire at “{name}”: cover blocks the rest or they lack range. Move the unit so that it all sees the target.', { name: sight.partial.name, firing: sight.partial.firing, models: sight.partial.models })}</li>}
        {sight.seenOutOfRange.length > 0 && <li><span className="text-amber-300">{tr('👁 Visible but out of reach:')}</span> {list(sight.seenOutOfRange)}</li>}
        <li><span className="text-rose-300">{tr('⚠ They will be able to shoot you:')}</span> {list(sight.shotBy.map((r) => ({ name: r.name, extra: tr('~{fmt} wounds', { fmt: fmt(r.dmg) }) })))}</li>
        <li><span className="text-orange-300">{tr('⚔ They can charge:')}</span> {list(sight.chargedBy.map((r) => ({ name: r.name, extra: pct(r.p) })))}</li>
        {sight.charges.length > 0 && (
          <li>
            <span className="text-emerald-300">{tr('🗡 You will be able to charge:')}</span>{' '}
            {sight.charges.slice(0, 3).map((c, i) => (
              <span key={c.targetId} className={c.verdict === 'bad' ? 'text-rose-300' : c.verdict === 'good' ? 'text-emerald-200' : 'text-amber-200'}>
                {i > 0 ? ', ' : ''}{tr('{name} ({ceil}″ — {pct}, ~{fmt} wounds', { name: c.name, ceil: Math.ceil(c.distance), pct: pct(c.p), fmt: fmt(c.dealt) })}{c.killsDealt >= c.enemyModels - 1e-9 ? tr(', will finish it off') : ''})
              </span>
            ))}
          </li>
        )}
        {sight.engagement && (
          <li className={`rounded border px-1 py-0.5 ${sight.engagement.verdict === 'leave' ? 'border-amber-600' : 'border-emerald-700'}`}>
            <b>{sight.engagement.verdict === 'leave' ? tr('↩ Better to disengage (Fall Back)') : tr('🛡 Better to stay in the fight')}</b>
            <span className="block">{sight.engagement.why}</span>
            <span className="block text-stone-400">
              {tr('Stay: ~{fmt} wounds to the enemy, ~{fmt2} to you per fight. Disengage: no shooting this turn, from the next ~{fmt3}', { fmt: fmt(sight.engagement.stayDealt), fmt2: fmt(sight.engagement.stayTaken), fmt3: fmt(sight.engagement.shootNext) })}{sight.engagement.shootTarget ? tr(' at “{shootTarget}”', { shootTarget: sight.engagement.shootTarget }) : ''}.
            </span>
          </li>
        )}
        {sight.note && <li className="text-stone-400">{sight.note}</li>}
      </ul>
      <p className="mt-1 text-[10px] text-stone-500">{tr('Wounds are averages. Threats — if the enemy stays in place; for a charge — after its move, not counting ruins in the way.')}</p>
    </details>
  )
}

// ---------------------------------------------------------------- keyboard

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const st = useStore.getState()
      const g = st.game
      if (!g) return
      const sel = st.selectedUnitId ? findUnit(g, st.selectedUnitId) : undefined
      if (e.key === 'Enter' && st.deploying) {
        if (sel) st.placeUnit(sel.id)
      } else if (e.key === 'Enter' && sel && Object.keys(st.draft).length) {
        st.dispatch(moveCommand(g, sel, st.draft, st.moveOptions))
      } else if (e.key === 'Escape') {
        if (st.measuring) st.toggleMeasure()
        else if (Object.keys(st.draft).length) st.clearDraft()
      } else if (e.key === 'r' || e.key === '\u043a' /* the R key on a Russian layout */) {
        st.toggleMeasure()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

// ---------------------------------------------------------------- overlays (DOM)

function GuideBanner() {
  const st = useStore()
  const hint = st.review
    ? { text: tr('Attack review: press “Next ▶” to go through the rolls step by step. The game is waiting for you.'), tone: 'info' as const }
    : st.deploying
    ? deploymentHint(st.game!, st.settings.human, { selectedUnitId: st.selectedUnitId, draft: st.draft, placed: st.deploying.placed })
    : nextStepHint(st.game!, st.settings.human, { ...st, aimFirst: st.settings.explain !== 'minimal' })
  const tone = {
    info: 'bg-stone-900/85 border-stone-500',
    action: 'bg-emerald-950/90 border-emerald-500',
    warn: 'bg-rose-950/90 border-rose-500',
    wait: 'bg-stone-900/85 border-sky-600',
  }[hint.tone]
  return (
    <div className={`pointer-events-none absolute left-1/2 top-2 z-[1] w-[min(92%,640px)] -translate-x-1/2 rounded-lg border px-3 py-2 text-center text-sm shadow-lg ${tone}`} role="status" data-testid="guide">
      {hint.tone === 'wait' && <span className="mr-1 inline-block animate-spin">⏳</span>}
      {hint.text}
    </div>
  )
}

/** Terrain as an architectural plan: ruins = hatched walls with pillars, craters = contour lines. */
function TerrainShape({ t, editable, selected, onClick, onMove }: { t: Terrain; editable: boolean; selected: boolean; onClick: () => void; onMove: (b: Box, node: Konva.Node) => void }) {
  const b = boxOf(t)
  const style = TERRAIN_STYLE[t.kind]
  const ink = style.stroke
  const thin = Math.min(b.w, b.h) < 1.2
  const hatch: number[][] = []
  for (let k = -b.h; k < b.w; k += 0.4) hatch.push([k, 0, k + b.h, b.h])
  const effect: Record<Terrain['kind'], string> = {
    ruin: tr('blocks line of sight · vehicles cannot pass'), woods: tr('blocks line of sight · vehicles cannot pass'), container: tr('blocks line of sight · you cannot stand inside'),
    barricade: tr('blocks line of sight · cover'), crater: tr('cover'),
  }
  const dims = `${fmt(b.w)}×${fmt(b.h)}″ · ${effect[t.kind] ?? (t.obscuring ? tr('blocks line of sight') : tr('cover'))}`
  return (
    <Group
      x={b.x}
      y={b.y}
      draggable={editable}
      onClick={(e) => { e.cancelBubble = true; onClick() }}
      onTap={(e) => { e.cancelBubble = true; onClick() }}
      onDragStart={onClick}
      onDragEnd={(e) => onMove({ ...b, x: e.target.x(), y: e.target.y() }, e.target)}
      onMouseEnter={(e) => { const el = e.target.getStage()?.container(); if (el && editable) el.style.cursor = 'move' }}
      onMouseLeave={(e) => { const el = e.target.getStage()?.container(); if (el) el.style.cursor = 'default' }}
    >
      <Rect width={b.w} height={b.h} fill={style.fill} />
      {t.kind === 'ruin' ? (
        <>
          <Group clipFunc={(ctx) => ctx.rect(0, 0, b.w, b.h)} listening={false}>
            {hatch.map((p, i) => <Line key={i} points={p} stroke={ink} strokeWidth={0.025} opacity={0.45} />)}
          </Group>
          <Rect width={b.w} height={b.h} stroke={ink} strokeWidth={0.12} listening={false} />
          {!thin && <Rect x={0.22} y={0.22} width={b.w - 0.44} height={b.h - 0.44} stroke={ink} strokeWidth={0.035} listening={false} />}
          {!thin && [[0, 0], [b.w, 0], [0, b.h], [b.w, b.h]].map(([x, y], i) => (
            <Rect key={i} x={x - 0.2} y={y - 0.2} width={0.4} height={0.4} fill={ink} listening={false} />
          ))}
        </>
      ) : t.kind === 'woods' ? (
        <>
          <Rect width={b.w} height={b.h} stroke={ink} strokeWidth={0.05} dash={[0.25, 0.12]} cornerRadius={0.4} listening={false} />
          {Array.from({ length: Math.max(1, Math.floor(b.w / 1.2)) * Math.max(1, Math.floor(b.h / 1.2)) }, (_, i) => {
            const cols = Math.max(1, Math.floor(b.w / 1.2))
            const x = ((i % cols) + 0.5) * (b.w / cols) + (Math.floor(i / cols) % 2 ? 0.25 : -0.25)
            const y = (Math.floor(i / cols) + 0.5) * (b.h / Math.max(1, Math.floor(b.h / 1.2)))
            return (
              <Group key={i} x={x} y={y} listening={false}>
                <Circle radius={0.45} stroke={ink} strokeWidth={0.04} fill={ink} opacity={0.5} />
                <Circle radius={0.08} fill={ink} />
              </Group>
            )
          })}
        </>
      ) : t.kind === 'barricade' ? (
        <>
          <Rect width={b.w} height={b.h} stroke={ink} strokeWidth={0.06} listening={false} />
          <Line
            points={b.w >= b.h
              ? Array.from({ length: Math.floor(b.w / 0.4) + 1 }, (_, i) => [i * 0.4, i % 2 ? b.h : 0]).flat()
              : Array.from({ length: Math.floor(b.h / 0.4) + 1 }, (_, i) => [i % 2 ? b.w : 0, i * 0.4]).flat()}
            stroke={ink} strokeWidth={0.04} listening={false}
          />
        </>
      ) : t.kind === 'container' ? (
        <>
          <Rect width={b.w} height={b.h} stroke={ink} strokeWidth={0.14} listening={false} />
          {Array.from({ length: Math.floor((b.w >= b.h ? b.w : b.h) / 0.3) }, (_, i) => (
            <Line key={i} points={b.w >= b.h ? [(i + 1) * 0.3, 0.1, (i + 1) * 0.3, b.h - 0.1] : [0.1, (i + 1) * 0.3, b.w - 0.1, (i + 1) * 0.3]} stroke={ink} strokeWidth={0.02} opacity={0.5} listening={false} />
          ))}
          <Line points={[0, 0, b.w, b.h]} stroke={ink} strokeWidth={0.03} listening={false} />
          <Line points={[b.w, 0, 0, b.h]} stroke={ink} strokeWidth={0.03} listening={false} />
        </>
      ) : (
        <>
          <Rect width={b.w} height={b.h} stroke={ink} strokeWidth={0.03} dash={[0.12, 0.12]} opacity={0.6} listening={false} />
          {[0.95, 0.7, 0.45].map((k) => (
            <Ellipse key={k} x={b.w / 2} y={b.h / 2} radiusX={(b.w / 2) * k} radiusY={(b.h / 2) * k} stroke={ink} strokeWidth={0.04} dash={k === 0.95 ? undefined : [0.18, 0.1]} listening={false} />
          ))}
          <Line points={[b.w / 2 - 0.25, b.h / 2, b.w / 2 + 0.25, b.h / 2]} stroke={ink} strokeWidth={0.04} listening={false} />
          <Line points={[b.w / 2, b.h / 2 - 0.25, b.w / 2, b.h / 2 + 0.25]} stroke={ink} strokeWidth={0.04} listening={false} />
        </>
      )}
      <Group x={0.15} y={thin ? -0.95 : 0.3} listening={false}>
        <Rect width={Math.max(t.name.length * 0.21, dims.length * 0.155) + 0.2} height={0.8} fill={BOARD_STYLE.mat} opacity={0.85} cornerRadius={0.05} />
        <Text x={0.1} y={0.06} text={t.name.toUpperCase()} fontSize={0.3} fontStyle="bold" fill={ink} letterSpacing={0.02} />
        <Text x={0.1} y={0.42} text={dims} fontSize={0.26} fill={ink} opacity={0.8} />
      </Group>
      {selected && <Rect x={-0.15} y={-0.15} width={b.w + 0.3} height={b.h + 0.3} stroke="#facc15" strokeWidth={0.08} dash={[0.3, 0.15]} listening={false} />}
    </Group>
  )
}

function Legend() {
  const row = (mark: React.ReactNode, text: string) => <li className="flex items-center gap-2">{mark}<span>{text}</span></li>
  const ring = (cls: string) => <span className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 ${cls}`} />
  return (
    <details className="absolute left-2 top-14 z-[2] max-w-56 rounded bg-black/70 px-2 py-1 text-[11px] text-stone-200">
      <summary className="cursor-pointer">{tr('Legend')}</summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {row(ring('border-yellow-400'), tr('selected unit'))}
        {row(ring('border-dashed border-green-400'), tr('can act / waiting to be placed'))}
        {row(<span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-stone-600 text-[9px]">✓</span>, tr('has already acted in this phase'))}
        {row(ring('border-green-400 border-[3px]'), tr('legal target (click to attack)'))}
        {row(ring('border-red-500'), tr('unavailable target / illegal position'))}
        {row(ring('border-dashed border-white/70'), tr('starting position (draft of the move)'))}
        {row(ring('border-dashed border-green-400'), tr('Movement phase: from here you can shoot at it'))}
        {row(ring('border-dotted border-amber-400'), tr('Movement phase: visible, but the weapon does not reach'))}
        {row(ring('border-dotted border-rose-500'), tr('Movement phase: dangerous to you (shooting or a charge)'))}
        {row(<span className="inline-block h-3 w-4 shrink-0 border-2 border-dashed border-yellow-400 bg-blue-800/50" />, tr('deployment zone'))}
      </ul>
    </details>
  )
}

function ActionBar() {
  const st = useStore()
  const game = st.game!
  const human = st.settings.human
  // two-step "end phase" when units could still act (reminder, never a block)
  const [armed, setArmed] = useState<string | null>(null)
  const phaseKey = `${game.round}|${game.activePlayer}|${game.phase}`
  if (st.deploying) return <DeployBar />
  if (game.winner || actor(game) !== human) return null
  const sel = st.selectedUnitId ? findUnit(game, st.selectedUnitId) : undefined
  const mine = sel && sel.owner === human ? sel : undefined
  const hasDraft = Object.keys(st.draft).length > 0
  const buttons: React.ReactNode[] = []
  const btn = (key: string, cmd: Command, label: string, primary = false) => {
    const v = validate(game, cmd)
    buttons.push(
      <button key={key} className={`btn ${primary ? 'btn-primary' : ''}`} disabled={!v.ok} title={v.ok ? undefined : v.reason} onClick={() => st.dispatch(cmd)}>
        {label}
      </button>,
    )
  }

  if (game.phase === 'command' && human === 'orks' && !game.players.orks.waaaghUsed) btn('waaagh', { type: 'callWaaagh' }, '📣 WAAAGH!')
  if (game.phase === 'command' && game.players[human].shadowUsed === false) btn('shadow', { type: 'callShadow' }, tr('🌑 Shadow in the Warp'))
  if (game.phase === 'command' && game.players[human].imperative === null) {
    btn('protector', { type: 'imperative', imperative: 'protector' }, tr('🛡 Protector'))
    btn('conqueror', { type: 'imperative', imperative: 'conqueror' }, tr('⚔ Conqueror'))
  }
  if (mine && hasAbility(mine, 'defendDivineWork') && !game.players[human].divineUsed) btn('divine', { type: 'divineWork', unitId: mine.id }, tr('⚙ Defend the Divine Work'))
  if (game.phase === 'movement' && mine && mine.move === 'none') {
    const mode = moveModeFor(game, mine)
    if (hasDraft) {
      buttons.push(<button key="reset" className="btn" onClick={() => st.clearDraft()} title={tr('Return the models to their starting places (Esc)')}>{tr('↺ Undo')}</button>)
      btn('confirm', moveCommand(game, mine, st.draft, st.moveOptions), tr('✓ Confirm {value}', { value: mode === 'advance' ? tr('advance') : mode === 'fallBack' ? tr('fall back') : tr('movement') }), true)
    } else if (mine.advanceRoll === null && mode === 'normal') {
      btn('advance', { type: 'declareAdvance', unitId: mine.id }, tr('⚡ Advance (+D6″)'))
    }
    if (mine.advanceRoll !== null && !mine.advanceRerolled && (hasAbility(mine, 'waaagh') || hasAbility(mine, 'superlativeStrategist')))
      btn('reroll', { type: 'rerollAdvance', unitId: mine.id }, hasAbility(mine, 'waaagh') ? tr('🎲 Re-roll (Waaagh!)') : tr('🎲 Re-roll (Superlative Strategist)'))
    if (isFlyer(mine)) buttons.push(<button key="fly" className={`btn ${st.moveOptions.fly ? 'btn-primary' : ''}`} aria-pressed={st.moveOptions.fly} onClick={() => st.setMoveOptions({ fly: !st.moveOptions.fly })} title={tr('FLY: −2″ to movement, but the models fly over models and terrain')}>{tr('🕊 Take off (−2″)')}</button>)
    if (hasAbility(mine, 'battleFocus') && (game.players[human].focus ?? 0) > 0) buttons.push(<button key="swift" className={`btn ${st.moveOptions.swift ? 'btn-primary' : ''}`} aria-pressed={st.moveOptions.swift} onClick={() => st.setMoveOptions({ swift: !st.moveOptions.swift })} title={tr('Battle Focus: a token gives +2″ to movement')}>{tr('✦ Swift as the Wind (+2″) · tokens {focus}', { focus: game.players[human].focus })}</button>)
    buttons.push(<DragModeToggle key="group" stuck={hasDraft && !validate(game, moveCommand(game, mine, st.draft, st.moveOptions)).ok} />)
  }
  if (game.phase === 'shooting' && mine && st.aimTargetId) {
    const aim = findUnit(game, st.aimTargetId)
    if (aim) {
      buttons.push(<button key="unaim" className="btn" onClick={() => st.setAim(null)}>{tr('✕ Another target')}</button>)
      btn('fire', { type: 'shoot', unitId: mine.id, targetId: aim.id, ...st.shotOptions }, tr('🎯 Fire at “{name}”', { name: aim.name }), true)
    }
  }
  if (game.phase === 'charge' && mine) {
    // right after the charge roll (even a failed one): Command Re-roll, 1 CP
    const reroll: Command = { type: 'stratagem', id: 'commandReroll', unitId: mine.id }
    if (game.lastCharge?.unitId === mine.id && validate(game, reroll).ok) btn('cmdReroll', reroll, tr('🎲 Re-roll the charge (1 CP)'))
    if (game.pendingCharge?.unitId === mine.id) btn('skip', { type: 'skipCharge', unitId: mine.id }, tr('Give up the charge'))
    else if (canActNow(game, mine)) btn('charge', { type: 'declareCharge', unitId: mine.id }, tr('🎲 Declare a charge (2D6)'))
  }
  if (st.history.length) buttons.push(<button key="undo" className="btn" onClick={() => st.undo()} title={tr('Undo the last action without dice rolls')}>{tr('↶ Undo')}</button>)

  const endV = validate(game, { type: 'endPhase' })
  const warn = st.settings.explain !== 'minimal' ? endPhaseWarning(game, human) : null
  const onEnd = () => {
    if (warn && armed !== phaseKey) {
      setArmed(phaseKey)
      st.setMessage(warn, 'info')
      return
    }
    setArmed(null)
    st.dispatch({ type: 'endPhase' })
  }
  buttons.push(
    <button key="end" className={`btn ${hasDraft || (warn && armed !== phaseKey) ? '' : 'btn-primary'}`} disabled={!endV.ok} title={endV.ok ? warn ?? undefined : endV.reason} onClick={onEnd} data-testid="next-phase">
      {armed === phaseKey && warn ? tr('Yes, {toLowerCase}', { toLowerCase: nextPhaseLabel(game).toLowerCase() }) : nextPhaseLabel(game)} ▶
    </button>,
  )
  return (
    <div className="absolute bottom-3 left-1/2 z-[1] flex max-w-[95%] -translate-x-1/2 flex-wrap items-stretch justify-center gap-1 rounded-xl bg-black/70 p-1.5 shadow-xl">
      {buttons}
    </div>
  )
}

/** Whole unit vs one model per drag. Moving only some models is legal: the rest stay put. `stuck`: the planned
 * positions are not legal, so in «Whole unit» mode the player is told how to fix a single model. */
export function DragModeToggle({ stuck = false }: { stuck?: boolean }) {
  const group = useStore((s) => s.groupDrag)
  const set = useStore((s) => s.setGroupDrag)
  const opt = (v: boolean, label: string, title: string) => (
    <button type="button" aria-pressed={group === v} title={title} onClick={() => set(v)} className={`px-2 text-xs ${group === v ? 'bg-yellow-500 font-semibold text-black' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'}`}>
      {group === v ? '● ' : '○ '}{label}
    </button>
  )
  return (
    <>
      <div className="flex overflow-hidden rounded border border-stone-600" role="group" aria-label={tr('What dragging moves')}>
        {opt(true, tr('Whole unit'), tr('Dragging one model moves the whole unit'))}
        {opt(false, tr('One model at a time'), tr('Each model moves separately; you can move one, two or all, then one confirmation'))}
      </div>
      {stuck && group && <span className="self-center px-1 text-xs text-amber-300" role="status">{tr('To fix just one model, switch to “One model at a time” and drag it.')}</span>}
    </>
  )
}

function DeployBar() {
  const st = useStore()
  const game = st.game!
  const sel = st.selectedUnitId ? findUnit(game, st.selectedUnitId) : undefined
  const mine = sel && sel.owner === st.settings.human ? sel : undefined
  const hasDraft = Object.keys(st.draft).length > 0
  const why = mine ? deploymentProblem(game, mine, st.draft) : tr('Pick your unit.')
  const placed = st.deploying!.placed
  const allPlaced = game.units.every((u) => u.owner !== st.settings.human || placed.includes(u.id))
  return (
    <div className="absolute bottom-3 left-1/2 z-[1] flex max-w-[95%] -translate-x-1/2 flex-wrap items-stretch justify-center gap-1 rounded-xl bg-black/70 p-1.5 shadow-xl">
      {hasDraft && <button className="btn" onClick={() => st.clearDraft()} title={tr('Return the models as they were (Esc)')}>{tr('↺ Undo')}</button>}
      {mine && (
        <button className={`btn ${allPlaced && !hasDraft ? '' : 'btn-primary'}`} disabled={!!why} title={why ?? 'Enter'} onClick={() => st.placeUnit(mine.id)}>
          {tr('✓ Place “{name}”', { name: mine.name })}{placed.includes(mine.id) && !hasDraft ? tr(' (already placed)') : ''}
        </button>
      )}
      <DragModeToggle stuck={hasDraft && !!why} />
      {st.deployHistory.length > 0 && <button className="btn" onClick={() => st.undo()} title={tr('Undo the last placement')}>{tr('↶ Undo')}</button>}
      <button className={`btn ${allPlaced && !hasDraft ? 'btn-primary' : ''}`} disabled={!allPlaced} title={allPlaced ? tr('Roll for the first turn and the start of round 1') : tr('First place all your units')} onClick={() => st.finishDeployment()}>
        {tr('Start the battle ▶')}
      </button>
    </div>
  )
}

function ModelTooltip({ hover, view, width }: { hover: Hover; view: Viewport; width: number }) {
  const st = useStore()
  const game = st.game!
  const u = findUnit(game, hover.unitId)
  const m = u?.models.find((x) => x.id === hover.modelId)
  if (!u || !m || m.destroyed) return null
  const p = profileOf(m)
  const pos = worldToScreen(view, st.draft[m.id] ?? m.pos)
  const r = radiusOf(m) * view.scale
  const sel = st.selectedUnitId ? findUnit(game, st.selectedUnitId) : undefined
  const human = st.settings.human
  const lines: { text: string; cls?: string }[] = []
  if (sel && sel.owner === human && u.owner !== human && actor(game) === human) {
    const d = Math.min(...alive(sel).map((a) => modelDistance(a, m)))
    lines.push({ text: tr('To “{name}”: {fmt}″ (from the base edge)', { name: sel.name, fmt: fmt(d) }) })
    const cmd = targetCommand(game, sel, u)
    if (cmd) {
      const v = validate(game, cmd.type === 'shoot' ? { ...cmd, ...st.shotOptions } : cmd)
      if (v.ok && cmd.type === 'shoot') {
        const plan = shootPlan(game, sel, u, st.shotOptions)
        lines.push({ text: tr('🎯 Click to shoot: {reduce} attacks{value}', { reduce: plan.groups.reduce((a, g) => a + g.attacks, 0), value: plan.cover ? tr(', target in cover (−1 BS)') : '' }), cls: 'text-emerald-300' })
        const all = shotAdvice(game, sel, st.shotOptions)
        const a = all.find((x) => x.targetId === u.id)
        if (a) {
          lines.push({ text: `${adviceLine(a)}${a.best ? tr(' · best target') : ''}`, cls: a.best ? 'text-emerald-300' : undefined })
          for (const w of adviceWarnings(a, all)) lines.push({ text: `⚠ ${w}`, cls: 'text-amber-300' })
        }
      } else if (v.ok) lines.push({ text: cmd.type === 'fight' ? tr('⚔ Click to fight') : tr('⚔ Click to charge'), cls: 'text-emerald-300' })
      else lines.push({ text: `⛔ ${v.reason}`, cls: 'text-rose-300' })
    }
    // charge forecast for this enemy unit
    if (game.phase === 'charge' && !sel.chargeDeclared && !game.pendingCharge) {
      const f = chargeForecast(game, sel).find((x) => x.targetId === u.id)
      if (f) {
        lines.push({ text: forecastLine(f), cls: f.verdict === 'good' ? 'text-emerald-300' : f.verdict === 'bad' ? 'text-rose-300' : 'text-amber-300' })
        for (const w of f.warnings) lines.push({ text: `⚠ ${w}`, cls: 'text-amber-300' })
      }
    }
  }
  return (
    <div className="pointer-events-none absolute z-[2] w-60 rounded-lg border border-stone-600 bg-stone-950/95 p-2 text-xs shadow-xl" style={pos.x + r + 256 > width ? { left: Math.max(4, pos.x - r - 248), top: Math.max(pos.y - r, 4) } : { left: pos.x + r + 8, top: Math.max(pos.y - r, 4) }}>
      <div className="font-semibold" style={{ color: FACTION_STYLE[u.owner].secondary }}>{p.name}</div>
      <div className="text-stone-400">{u.name}</div>
      <div className="mt-1">❤ {m.wounds}/{p.w} · M {p.m}″ · T {p.t} · Sv {p.sv}+{p.invuln ? ` · ${p.invuln}++` : ''} · OC {p.oc}</div>
      {lines.map((l, i) => <div key={i} className={`mt-1 ${l.cls ?? ''}`}>{l.text}</div>)}
    </div>
  )
}

// ---------------------------------------------------------------- canvas

/** The round token of a model (base, art or label, faction ring); shared by live models and casualty ghosts. */
function TokenFace({ m, owner, flip, img }: { m: ModelState; owner: UnitState['owner']; flip: boolean; img?: HTMLImageElement }) {
  const r = radiusOf(m)
  const tok = TOKENS[m.profileId]
  return (
    <>
      <Circle radius={r} fill={tok.fill} shadowColor="black" shadowBlur={0.25} shadowOpacity={0.6} shadowOffsetY={0.05} />
      {img ? (
        <Group clipFunc={(ctx) => ctx.arc(0, 0, r - 0.05, 0, Math.PI * 2)} listening={false}>
          <KImage image={img} x={flip ? r : -r} y={-r} width={r * 2} height={r * 2} scaleX={flip ? -1 : 1} />
        </Group>
      ) : (
        <Text text={tok.label} fontSize={r * 0.75} fontStyle="bold" fill={tok.text} width={r * 2} height={r * 2} x={-r} y={-r} align="center" verticalAlign="middle" listening={false} />
      )}
      <Circle radius={r} stroke={FACTION_LINE[owner]} strokeWidth={0.06} listening={false} />
    </>
  )
}

/** A model that has just been destroyed: it stays on the table until its turn, then flashes and shrinks away. */
function CasualtyGhost({ c, flip, img, setGhosts }: { c: Casualty; flip: boolean; img?: HTMLImageElement; setGhosts: React.Dispatch<React.SetStateAction<Casualty[]>> }) {
  const group = useRef<Konva.Group>(null)
  const ring = useRef<Konva.Circle>(null)
  useEffect(() => {
    const tweens: Konva.Tween[] = []
    const t = setTimeout(() => {
      const node = group.current
      if (!node) return
      ring.current?.opacity(1)
      const pop = new Konva.Tween({
        node, duration: 0.1, scaleX: 1.2, scaleY: 1.2,
        onFinish: () => {
          const gone = new Konva.Tween({ node, duration: 0.28, scaleX: 0.3, scaleY: 0.3, opacity: 0, easing: Konva.Easings.EaseIn, onFinish: () => setGhosts((g) => g.filter((x) => x !== c)) })
          tweens.push(gone)
          gone.play()
        },
      })
      tweens.push(pop)
      pop.play()
    }, c.delay)
    return () => { clearTimeout(t); tweens.forEach((x) => x.destroy()) }
  }, [c, setGhosts])
  return (
    <Group ref={group} x={c.pos.x} y={c.pos.y} listening={false}>
      <TokenFace m={c.model} owner={c.owner} flip={flip} img={img} />
      <Circle ref={ring} radius={radiusOf(c.model) + 0.12} stroke="#ef4444" strokeWidth={0.14} opacity={0} />
    </Group>
  )
}

function BoardLayers({ game, view, stageRef, setHover, sight }: { game: GameState; view: Viewport; stageRef: React.RefObject<Konva.Stage | null>; setHover: (h: Hover | null) => void; sight: Sight | null }) {
  const st = useStore()
  // turn plan: primary VP at stake on each objective, for the human
  const stakes = useMemo(() => (game.mission && !st.deploying && !game.winner ? objectiveStakes(game, st.settings.human) : {}), [game, st.deploying, st.settings.human])
  const sightOf = useMemo(() => {
    const m = new Map<string, { shoot: boolean; far: boolean; threat: boolean }>()
    if (!sight) return m
    const get = (id: string) => m.get(id) ?? m.set(id, { shoot: false, far: false, threat: false }).get(id)!
    for (const r of sight.canShoot) get(r.unitId).shoot = true
    for (const r of sight.seenOutOfRange) get(r.unitId).far = true
    for (const r of sight.shotBy) get(r.unitId).threat = true
    for (const r of sight.chargedBy) if (r.p >= 0.3) get(r.unitId).threat = true
    return m
  }, [sight])
  const human = st.settings.human
  const sel = game.units.find((u) => u.id === st.selectedUnitId) ?? null
  const mine = sel && sel.owner === human ? sel : null
  const deploying = st.deploying
  const myTurn = !deploying && actor(game) === human && !game.winner
  const profileIds = [...new Set(game.units.flatMap((u) => u.models.map((m) => m.profileId)))]
  const imageUrls = profileIds.map((id) => tokenImageFor(id, st.customTokens)).filter((x): x is string => !!x)
  const images = useImages(imageUrls)

  // casualties stay on the table as ghosts and fall one after another (see CasualtyGhost)
  const [seen, setSeen] = useState(game)
  const [ghosts, setGhosts] = useState<Casualty[]>([])
  if (seen !== game) {
    setSeen(game)
    const dead = reducedMotion() ? [] : casualties(seen, game)
    if (dead.length) setGhosts((g) => [...g, ...dead])
  }

  // models slide to their new place instead of jumping: the node is put back where it was seen last and tweened
  const nodes = useRef(new Map<string, Konva.Group>())
  const motion = useRef({ gid: undefined as string | undefined, last: new Map<string, Vec>(), shown: new Map<string, Vec>(), tweens: new Map<string, Konva.Tween>() })
  const gameId = st.match?.gameId
  useLayoutEffect(() => {
    const mo = motion.current
    if (mo.gid !== gameId) { mo.gid = gameId; mo.last.clear(); mo.shown.clear() }
    const still = !!deploying || reducedMotion()
    for (const u of game.units)
      for (const m of alive(u)) {
        const to = st.draft[m.id] ?? m.pos
        const prev = mo.last.get(m.id)
        mo.last.set(m.id, to)
        if (prev && prev.x === to.x && prev.y === to.y) continue
        mo.tweens.get(m.id)?.destroy()
        mo.tweens.delete(m.id)
        const from = mo.shown.get(m.id) ?? prev
        mo.shown.set(m.id, to)
        const node = nodes.current.get(m.id)
        // dragging (a draft) moves the node itself; arrivals have nowhere to slide from
        if (!node || !from || still || st.draft[m.id]) continue
        const d = dist(from, to)
        if (d < 0.01) continue
        node.position(from)
        mo.tweens.set(m.id, new Konva.Tween({
          node, x: to.x, y: to.y, duration: moveSeconds(d), easing: Konva.Easings.EaseInOut,
          onUpdate: () => mo.shown.set(m.id, node.position()),
          onFinish: () => { mo.tweens.delete(m.id); mo.shown.set(m.id, to) },
        }))
        mo.tweens.get(m.id)!.play()
      }
  })
  useEffect(() => () => motion.current.tweens.forEach((t) => t.destroy()), [])

  const canDrag = (u: UnitState) =>
    !st.measuring && u.owner === human && sel?.id === u.id && (deploying ? true : myTurn && game.phase === 'movement' && u.move === 'none')

  const draftValidity = useMemo(() => {
    if (!mine || Object.keys(st.draft).length === 0) return null
    if (deploying) {
      const why = deploymentProblem(game, mine, st.draft)
      return why ? { ok: false as const, reason: why } : { ok: true as const }
    }
    return validate(game, moveCommand(game, mine, st.draft, st.moveOptions))
  }, [game, mine, st.draft, st.moveOptions, deploying])

  // per enemy unit: the command a click would issue and whether it's legal
  const targets = useMemo(() => {
    const out: Record<string, { cmd: Command; ok: boolean }> = {}
    if (!myTurn || !mine) return out
    for (const e of game.units) {
      if (e.owner === human) continue
      const cmd = targetCommand(game, mine, e)
      if (!cmd) continue
      const full = cmd.type === 'shoot' ? { ...cmd, ...st.shotOptions } : cmd
      out[e.id] = { cmd: full, ok: validate(game, full).ok }
    }
    return out
  }, [game, mine, myTurn, human, st.shotOptions])

  const pointerWorld = () => {
    const p = stageRef.current?.getPointerPosition()
    return p ? screenToWorld(view, p) : null
  }

  const onBackgroundClick = () => {
    if (st.arriving) {
      const p = pointerWorld()
      if (p) st.arriveAt(p)
      return
    }
    if (!st.measuring) return
    const p = pointerWorld()
    if (p) st.setMeasurePoint({ p, r: 0 })
  }

  const onModelClick = (u: UnitState, m: ModelState) => {
    if (st.measuring) {
      st.setMeasurePoint({ p: st.draft[m.id] ?? m.pos, r: radiusOf(m), label: profileOf(m).name })
      return
    }
    const t = targets[u.id]
    if (t) {
      // shooting for learners: first pick the target and read the breakdown, then "Fire"
      if (t.ok && t.cmd.type === 'shoot' && st.settings.explain !== 'minimal') st.setAim(u.id)
      else if (t.ok) st.dispatch(t.cmd)
      else {
        const v = validate(game, t.cmd)
        if (!v.ok) st.setMessage(v.reason, 'error')
      }
      return
    }
    if (st.selectedUnitId !== u.id) st.select(u.id)
  }

  const onDragMove = (u: UnitState, m: ModelState, node: Konva.Node) => {
    const p = { x: node.x(), y: node.y() }
    if (st.groupDrag) {
      const dx = p.x - m.pos.x, dy = p.y - m.pos.y
      const all: Record<string, Vec> = {}
      for (const o of alive(u)) all[o.id] = { x: o.pos.x + dx, y: o.pos.y + dy }
      st.setDraft(all)
    } else st.setDraft({ [m.id]: p })
  }

  const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, c: string) => {
    const el = e.target.getStage()?.container()
    if (el) el.style.cursor = c
  }

  // the selected unit is drawn last, on top: a model dragged onto another unit's model stays grabbable (a click would
  // otherwise hit the model above it, select that unit and drop the planned move)
  const drawOrder = sel ? [...game.units.filter((u) => u.id !== sel.id), ...game.units.filter((u) => u.id === sel.id)] : game.units
  const unitsRendered = drawOrder.map((u) => {
    const draggable = canDrag(u)
    const max = deploying ? Infinity : moveAllowance(game, u, u.id === st.selectedUnitId ? st.moveOptions : { fly: false, swift: false })
    const unplaced = !!deploying && u.owner === human && !deploying.placed.includes(u.id)
    const actionable = unplaced || (myTurn && u.owner === human && canActNow(game, u))
    const acted = myTurn && u.owner === human && actedThisPhase(game, u)
    const target = targets[u.id]
    return alive(u).map((m) => {
      const r = radiusOf(m)
      const pos = st.draft[m.id] ?? m.pos
      const p = profileOf(m)
      const selected = sel?.id === u.id
      const moved = dist(pos, m.pos) > 0.01
      // the way the model goes: straight, or around dense terrain it may not cross (its move is the detour's length)
      const way = moved && !deploying ? movePath(game, u, r, m.pos, pos, st.moveOptions.fly) ?? { points: [m.pos, pos], length: dist(m.pos, pos) } : { points: [m.pos, pos], length: dist(m.pos, pos) }
      const img = images[tokenImageFor(m.profileId, st.customTokens) ?? '']
      // built-in art faces east (+x); the army on the east side is flipped so both armies face each other (user photos are never flipped)
      const flip = sidesOf(game)[1] === u.owner && !st.customTokens[m.profileId]
      return (
        <Group key={m.id}>
          {selected && draggable && !deploying && (
            <Circle x={m.pos.x} y={m.pos.y} radius={max + r} stroke="#ffffff" strokeWidth={0.05} dash={[0.3, 0.2]} opacity={0.45} listening={false} />
          )}
          {moved && (
            <>
              <Circle x={m.pos.x} y={m.pos.y} radius={r} stroke="#ffffff" strokeWidth={0.05} dash={[0.15, 0.1]} opacity={0.6} listening={false} />
              <Line points={flat(way.points)} stroke="#ffffff" strokeWidth={0.05} dash={[0.2, 0.1]} listening={false} />
              {!deploying && <Text x={m.pos.x - 1} y={m.pos.y - r - 0.5} width={2} align="center" text={tr('{fmt}″ of {fmt2}″', { fmt: fmt(way.length), fmt2: fmt(max) })} fontSize={0.38} fill="#ffffff" shadowColor="black" shadowBlur={0.1} listening={false} />}
            </>
          )}
          <Group
            ref={(n) => { if (n) nodes.current.set(m.id, n); else nodes.current.delete(m.id) }}
            x={pos.x}
            y={pos.y}
            draggable={draggable}
            dragBoundFunc={(abs) => {
              // deployment: board edges only; movement: also the move allowance
              const w = screenToWorld(view, abs)
              const c = clampToRadius(m.pos, w, max)
              c.x = Math.min(game.board.width - r, Math.max(r, c.x))
              c.y = Math.min(game.board.height - r, Math.max(r, c.y))
              return worldToScreen(view, c)
            }}
            onDragStart={() => setHover(null)}
            onDragMove={(e) => onDragMove(u, m, e.target)}
            onDragEnd={(e) => onDragMove(u, m, e.target)}
            onClick={(e) => { e.cancelBubble = true; onModelClick(u, m) }}
            onTap={(e) => { e.cancelBubble = true; onModelClick(u, m) }}
            onMouseEnter={(e) => { setCursor(e, draggable ? 'grab' : target ? (target.ok ? 'crosshair' : 'not-allowed') : 'pointer'); setHover({ unitId: u.id, modelId: m.id }) }}
            onMouseLeave={(e) => { setCursor(e, 'default'); setHover(null) }}
          >
            {actionable && !selected && <Circle radius={r + 0.2} stroke="#4ade80" strokeWidth={0.09} dash={[0.25, 0.12]} listening={false} />}
            {selected && <Circle radius={r + 0.2} stroke={draftValidity && !draftValidity.ok && moved ? '#ef4444' : '#facc15'} strokeWidth={0.12} listening={false} />}
            {target && <Circle radius={r + 0.22} stroke={target.ok ? '#4ade80' : '#ef4444'} strokeWidth={target.ok ? 0.14 : 0.07} opacity={target.ok ? 1 : 0.6} listening={false} />}
            {st.aimTargetId === u.id && <Circle radius={r + 0.45} stroke="#facc15" strokeWidth={0.12} dash={[0.3, 0.15]} listening={false} />}
            {sightOf.get(u.id)?.shoot && <Circle radius={r + 0.22} stroke="#4ade80" strokeWidth={0.1} dash={[0.25, 0.12]} listening={false} />}
            {sightOf.get(u.id)?.far && <Circle radius={r + 0.22} stroke="#fbbf24" strokeWidth={0.07} dash={[0.12, 0.12]} listening={false} />}
            {sightOf.get(u.id)?.threat && <Circle radius={r + 0.42} stroke="#f43f5e" strokeWidth={0.06} dash={[0.08, 0.1]} listening={false} />}
            <Group opacity={unplaced && !moved ? 0.75 : 1}>
            <TokenFace m={m} owner={u.owner} flip={flip} img={img} />
            {p.w > 1 && (
              <Group x={0} y={r + 0.12} listening={false}>
                <Rect x={-0.42} y={-0.2} width={0.84} height={0.36} fill={m.wounds < p.w ? '#b91c1c' : '#111827'} cornerRadius={0.1} opacity={0.9} />
                <Text text={`${m.wounds}/${p.w}`} fontSize={0.28} fill="#fff" x={-0.42} y={-0.15} width={0.84} align="center" />
              </Group>
            )}
            </Group>
            {acted && (
              <Group x={-r * 0.75} y={-r * 0.75} listening={false}>
                <Circle radius={0.22} fill="#57534e" stroke="#fff" strokeWidth={0.04} />
                <Text text="✓" fontSize={0.3} fill="#fff" x={-0.2} y={-0.15} width={0.4} align="center" />
              </Group>
            )}
            {/* a transport shows how many models ride inside */}
            {(game.embarked?.length ?? 0) > 0 && passengersOf(game, u.id).length > 0 && (
              <Group x={-r * 0.75} y={r * 0.75} listening={false}>
                <Rect x={-0.45} y={-0.2} width={0.9} height={0.38} fill="#92400e" cornerRadius={0.1} opacity={0.95} />
                <Text text={`🚚${passengersOf(game, u.id).reduce((a, x) => a + alive(x).length, 0)}`} fontSize={0.28} fill="#fff" x={-0.45} y={-0.15} width={0.9} align="center" />
              </Group>
            )}
            {u.battleShocked && (
              <Group x={r * 0.75} y={-r * 0.75} listening={false}>
                <Circle radius={0.22} fill="#dc2626" stroke="#fff" strokeWidth={0.04} />
                <Text text="!" fontSize={0.32} fill="#fff" x={-0.2} y={-0.15} width={0.4} align="center" fontStyle="bold" />
              </Group>
            )}
          </Group>
        </Group>
      )
    })
  })

  // range overlays for the selected own unit
  const overlays: React.ReactNode[] = []
  if (mine && !game.winner) {
    if (game.phase === 'shooting') {
      for (const m of alive(mine)) {
        const ranges = weaponsOf(m).flatMap((w) => w.profiles.map((p) => p.range)).filter((x): x is number => x !== 'melee')
        if (!ranges.length) continue
        overlays.push(<Circle key={`rng-${m.id}`} x={m.pos.x} y={m.pos.y} radius={Math.max(...ranges) + radiusOf(m)} stroke={FACTION_STYLE[mine.owner].secondary} strokeWidth={0.05} opacity={0.25} listening={false} />)
      }
    }
    if (game.phase === 'charge')
      for (const m of alive(mine))
        overlays.push(<Circle key={`chg-${m.id}`} x={m.pos.x} y={m.pos.y} radius={CHARGE_RANGE + radiusOf(m)} stroke="#f97316" strokeWidth={0.05} opacity={0.3} listening={false} />)
  }

  const meas = st.measure
  const measureNode = meas.a && (
    <Group listening={false}>
      <Circle x={meas.a.p.x} y={meas.a.p.y} radius={0.15} fill="#fde047" />
      {meas.b && (() => {
        const d = edgeDistance(meas.a!.p, meas.a!.r, meas.b.p, meas.b.r)
        const inR = withinRange(d, meas.range)
        return (
          <>
            <Line points={flat([meas.a!.p, meas.b.p])} stroke={inR ? '#4ade80' : '#f87171'} strokeWidth={0.08} dash={[0.3, 0.15]} />
            <Circle x={meas.b.p.x} y={meas.b.p.y} radius={0.15} fill="#fde047" />
            <Rect x={(meas.a!.p.x + meas.b.p.x) / 2 - 1.6} y={(meas.a!.p.y + meas.b.p.y) / 2 - 0.9} width={3.2} height={0.7} fill="rgba(0,0,0,0.75)" cornerRadius={0.1} />
            <Text x={(meas.a!.p.x + meas.b.p.x) / 2 - 1.6} y={(meas.a!.p.y + meas.b.p.y) / 2 - 0.78} width={3.2} align="center" text={`${fmt(d)}″ ${inR ? '≤' : '>'} ${meas.range}″`} fontSize={0.45} fill={inR ? '#4ade80' : '#f87171'} />
          </>
        )
      })()}
    </Group>
  )

  // blueprint grid: 1″ minor, 6″ major lines with inch rulers on the edges
  const grid: React.ReactNode[] = []
  const { width: W, height: H } = game.board
  for (let x = 1; x < W; x++) {
    const major = x % 6 === 0
    grid.push(<Line key={`gx${x}`} points={[x, 0, x, H]} stroke={major ? BOARD_STYLE.gridMajor : BOARD_STYLE.grid} strokeWidth={major ? 0.04 : 0.015} listening={false} />)
    if (major) grid.push(<Text key={`rx${x}`} x={x - 1} y={-0.6} width={2} align="center" text={`${x}″`} fontSize={0.34} fill={BOARD_STYLE.ink} opacity={0.7} listening={false} />)
  }
  for (let y = 1; y < H; y++) {
    const major = y % 6 === 0
    grid.push(<Line key={`gy${y}`} points={[0, y, W, y]} stroke={major ? BOARD_STYLE.gridMajor : BOARD_STYLE.grid} strokeWidth={major ? 0.04 : 0.015} listening={false} />)
    if (major) grid.push(<Text key={`ry${y}`} x={-1.1} y={y - 0.17} width={0.95} align="right" text={`${y}″`} fontSize={0.34} fill={BOARD_STYLE.ink} opacity={0.7} listening={false} />)
  }
  grid.push(<Text key="dims" x={0} y={H + 0.2} width={W} align="center" text={tr('FIELD {W}″ × {H}″ · GRID 1″', { W, H })} fontSize={0.34} fill={BOARD_STYLE.ink} opacity={0.6} letterSpacing={0.05} listening={false} />)

  const onTerrainMove = (t: Terrain, b: Box, node: Konva.Node) => {
    const fitted = fitBox(b, game.board)
    node.position({ x: fitted.x, y: fitted.y })
    st.editTerrain(game.terrain.map((x) => (x.id === t.id ? withBox(x, fitted) : x)))
  }

  return (
    <>
      <Layer>
        <Rect x={-0.3} y={-0.3} width={game.board.width + 0.6} height={game.board.height + 0.6} fill={BOARD_STYLE.edge} cornerRadius={0.2} />
        <Rect x={0} y={0} width={game.board.width} height={game.board.height} fill={BOARD_STYLE.mat} stroke={BOARD_STYLE.ink} strokeWidth={0.06} onClick={() => { onBackgroundClick(); if (deploying) st.selectTerrain(null) }} onTap={onBackgroundClick} />
        {sidesOf(game).map((p, i) => {
          const zone = deploymentZone(game, sidesOf(game)[i])
          const own = p === human
          return (
            <Group key={`dz-${p}`} listening={false}>
              <Line points={flat(zone)} closed fill={FACTION_LINE[p]} opacity={deploying ? (own ? 0.16 : 0.06) : 0.06} />
              <Line points={flat(zone)} closed stroke={FACTION_LINE[p]} strokeWidth={0.04} dash={[0.15, 0.15]} opacity={0.5} />
              {deploying && own && <Line points={flat(zone)} closed stroke="#facc15" strokeWidth={0.1} dash={[0.4, 0.2]} />}
              {deploying && (
                <Text x={zone[0].x + 0.2} y={game.board.height - 0.7} text={own ? tr('YOUR ZONE') : tr('enemy zone')} fontSize={0.45} fontStyle="bold" fill={own ? '#facc15' : '#d6d3d1'} />
              )}
            </Group>
          )
        })}
        {grid}
        {game.terrain.map((t) => (
          <TerrainShape
            key={t.id}
            t={t}
            editable={!!deploying && !st.measuring}
            selected={!!deploying && st.selectedTerrainId === t.id}
            onClick={() => { onBackgroundClick(); if (deploying) st.selectTerrain(t.id) }}
            onMove={(b, node) => onTerrainMove(t, b, node)}
          />
        ))}
        {game.objectives.map((o, i) => {
          const r = baseRadius(OBJECTIVE_MARKER_MM)
          const stake = stakes[o.id]
          const col = o.controller ? FACTION_LINE[o.controller] : BOARD_STYLE.objective
          return (
            <Group key={o.id} x={o.pos.x} y={o.pos.y} listening={false}>
              <Circle radius={OBJECTIVE_RANGE + r} stroke={col} strokeWidth={0.04} dash={[0.25, 0.2]} opacity={0.6} />
              <Circle radius={r} fill={col} opacity={0.15} />
              <Circle radius={r} stroke={col} strokeWidth={0.08} />
              <Circle radius={r * 0.45} stroke={col} strokeWidth={0.05} />
              <Line points={[-r - 0.35, 0, r + 0.35, 0]} stroke={col} strokeWidth={0.04} />
              <Line points={[0, -r - 0.35, 0, r + 0.35]} stroke={col} strokeWidth={0.04} />
              <Text x={r * 0.55} y={-r - 0.55} text={o.role === 'home' ? tr('O{value} home', { value: i + 1 }) : o.role === 'central' ? tr('O{value} center', { value: i + 1 }) : o.role === 'expansion' ? tr('O{value} flank', { value: i + 1 }) : tr('O{value}', { value: i + 1 })} fontSize={0.4} fontStyle="bold" fill={col} />
              {/* turn plan: primary VP for taking (+N) or losing (−N) this objective */}
              {stake?.gain ? <Text x={-r - 1.2} y={r + 0.15} text={`+${stake.gain}`} fontSize={0.55} fontStyle="bold" fill="#7dd3fc" />
                : stake?.loss ? <Text x={-r - 1.2} y={r + 0.15} text={`−${stake.loss}`} fontSize={0.55} fontStyle="bold" fill="#fcd34d" /> : null}
              {/* Gather Intel: operation markers placed at this objective, one small diamond per player */}
              {(game.mission?.markers ?? []).filter((x) => x.objectiveId === o.id).map((x, k) => (
                <Rect key={x.owner} x={-r - 0.9 + k * 0.7} y={r + 0.3} width={0.45} height={0.45} rotation={45} fill={FACTION_LINE[x.owner]} stroke="#000" strokeWidth={0.03} />
              ))}
            </Group>
          )
        })}
        {overlays}
      </Layer>
      <Layer>
        {unitsRendered}
        {ghosts.map((c) => <CasualtyGhost key={c.model.id} c={c} flip={sidesOf(game)[1] === c.owner && !st.customTokens[c.model.profileId]} img={images[tokenImageFor(c.model.profileId, st.customTokens) ?? '']} setGhosts={setGhosts} />)}
        {measureNode}
      </Layer>
    </>
  )
}
