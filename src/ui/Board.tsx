import type Konva from 'konva'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import { BOARD_STYLE, FACTION_STYLE, TERRAIN_STYLE, TOKENS, tokenImageFor } from '../assets/manifest'
import { actor, maxMove, moveModeFor, shootPlan, validate } from '../game/engine'
import { baseRadius, dist, edgeDistance, withinRange } from '../game/geometry/geometry'
import { alive, CHARGE_RANGE, findUnit, fmt, modelDistance, OBJECTIVE_MARKER_MM, OBJECTIVE_RANGE, profileOf, radiusOf, weaponsOf } from '../game/gameState'
import { scenarioById } from '../game/scenarios/scenarios'
import type { Command, GameState, ModelState, UnitState, Vec } from '../game/types'
import { useStore } from '../store'
import { clampToRadius, fitBoard, screenToWorld, worldToScreen, zoomAt, type Viewport } from '../view/transform'
import { canActNow, nextPhaseLabel, nextStepHint, targetCommand } from './guidance'

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
        <BoardLayers game={game} view={view} stageRef={stageRef} setHover={setHover} />
      </Stage>
      <GuideBanner />
      <div className="absolute right-2 top-14 flex flex-col gap-1">
        <button className="board-btn" onClick={() => zoomBy(1.25)} aria-label="Приблизить" title="Приблизить (колесо мыши)">+</button>
        <button className="board-btn" onClick={() => zoomBy(0.8)} aria-label="Отдалить" title="Отдалить">−</button>
        <button className="board-btn text-xs" onClick={() => setVp(null)} title="Вписать поле">⤢</button>
      </div>
      {hover && <ModelTooltip hover={hover} view={view} width={size.w} />}
      <ActionBar />
    </div>
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
      if (e.key === 'Enter' && sel && Object.keys(st.draft).length) {
        st.dispatch({ type: 'move', unitId: sel.id, mode: moveModeFor(g, sel), positions: st.draft })
      } else if (e.key === 'Escape') {
        if (st.measuring) st.toggleMeasure()
        else if (Object.keys(st.draft).length) st.clearDraft()
      } else if (e.key === 'r' || e.key === 'к') {
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
  const hint = nextStepHint(st.game!, st.settings.human, st)
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

function ActionBar() {
  const st = useStore()
  const game = st.game!
  const human = st.settings.human
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
  if (game.phase === 'movement' && mine && mine.move === 'none') {
    const mode = moveModeFor(game, mine)
    if (hasDraft) {
      buttons.push(<button key="reset" className="btn" onClick={() => st.clearDraft()} title="Esc">↺ Сброс</button>)
      btn('confirm', { type: 'move', unitId: mine.id, mode, positions: st.draft }, `✓ Подтвердить ${mode === 'advance' ? 'продвижение' : mode === 'fallBack' ? 'отступление' : 'движение'}`, true)
    } else if (mine.advanceRoll === null && mode === 'normal') {
      btn('advance', { type: 'declareAdvance', unitId: mine.id }, '⚡ Продвинуться (+D6″)')
    }
    if (mine.advanceRoll !== null && !mine.advanceRerolled && mine.datasheetId === 'boyz') btn('reroll', { type: 'rerollAdvance', unitId: mine.id }, '🎲 Перебросить (Waaagh!)')
    buttons.push(
      <label key="group" className="flex items-center gap-1 rounded bg-stone-800 px-2 text-xs" title="Двигать весь отряд одним перетаскиванием">
        <input type="checkbox" checked={st.groupDrag} onChange={(e) => st.setGroupDrag(e.target.checked)} /> отрядом
      </label>,
    )
  }
  if (game.phase === 'charge' && mine) {
    if (game.pendingCharge?.unitId === mine.id) btn('skip', { type: 'skipCharge', unitId: mine.id }, 'Отказаться от атаки')
    else if (canActNow(game, mine)) btn('charge', { type: 'declareCharge', unitId: mine.id }, '🎲 Объявить атаку (2D6)')
  }
  if (st.history.length) buttons.push(<button key="undo" className="btn" onClick={() => st.undo()} title="Отменить последнее действие без бросков">↶</button>)

  const endV = validate(game, { type: 'endPhase' })
  buttons.push(
    <button key="end" className={`btn ${hasDraft ? '' : 'btn-primary'}`} disabled={!endV.ok} title={endV.ok ? undefined : endV.reason} onClick={() => st.dispatch({ type: 'endPhase' })} data-testid="next-phase">
      {nextPhaseLabel(game)} ▶
    </button>,
  )
  return (
    <div className="absolute bottom-3 left-1/2 z-[1] flex max-w-[95%] -translate-x-1/2 flex-wrap items-stretch justify-center gap-1 rounded-xl bg-black/70 p-1.5 shadow-xl">
      {buttons}
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
    lines.push({ text: `До «${sel.name}»: ${fmt(d)}″ (от края подставки)` })
    const cmd = targetCommand(game, sel, u)
    if (cmd) {
      const v = validate(game, cmd.type === 'shoot' ? { ...cmd, ...st.shotOptions } : cmd)
      if (v.ok && cmd.type === 'shoot') {
        const plan = shootPlan(game, sel, u, st.shotOptions)
        lines.push({ text: `🎯 Клик — стрелять: ${plan.groups.reduce((a, g) => a + g.attacks, 0)} атак${plan.cover ? ', цель в укрытии (−1 BS)' : ''}`, cls: 'text-emerald-300' })
      } else if (v.ok) lines.push({ text: cmd.type === 'fight' ? '⚔ Клик — сражаться' : '⚔ Клик — атаковать (charge)', cls: 'text-emerald-300' })
      else lines.push({ text: `⛔ ${v.reason}`, cls: 'text-rose-300' })
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

function BoardLayers({ game, view, stageRef, setHover }: { game: GameState; view: Viewport; stageRef: React.RefObject<Konva.Stage | null>; setHover: (h: Hover | null) => void }) {
  const st = useStore()
  const human = st.settings.human
  const sel = game.units.find((u) => u.id === st.selectedUnitId) ?? null
  const mine = sel && sel.owner === human ? sel : null
  const myTurn = actor(game) === human && !game.winner
  const scenario = scenarioById(game.scenarioId)
  const profileIds = [...new Set(game.units.flatMap((u) => u.models.map((m) => m.profileId)))]
  const imageUrls = profileIds.map((id) => tokenImageFor(id, st.customTokens)).filter((x): x is string => !!x)
  const images = useImages(imageUrls)

  const canDrag = (u: UnitState) =>
    myTurn && !st.measuring && game.phase === 'movement' && u.owner === human && u.move === 'none' && sel?.id === u.id

  const draftValidity = useMemo(() => {
    if (!mine || Object.keys(st.draft).length === 0) return null
    return validate(game, { type: 'move', unitId: mine.id, mode: moveModeFor(game, mine), positions: st.draft })
  }, [game, mine, st.draft])

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
      if (t.ok) st.dispatch(t.cmd)
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

  const unitsRendered = game.units.map((u) => {
    const draggable = canDrag(u)
    const max = maxMove(u)
    const actionable = myTurn && u.owner === human && canActNow(game, u)
    const target = targets[u.id]
    return alive(u).map((m) => {
      const r = radiusOf(m)
      const pos = st.draft[m.id] ?? m.pos
      const tok = TOKENS[m.profileId]
      const p = profileOf(m)
      const selected = sel?.id === u.id
      const moved = dist(pos, m.pos) > 0.01
      const img = images[tokenImageFor(m.profileId, st.customTokens) ?? '']
      const ring = FACTION_STYLE[u.owner].primary
      return (
        <Group key={m.id}>
          {selected && draggable && (
            <Circle x={m.pos.x} y={m.pos.y} radius={max + r} stroke="#ffffff" strokeWidth={0.05} dash={[0.3, 0.2]} opacity={0.45} listening={false} />
          )}
          {moved && (
            <>
              <Circle x={m.pos.x} y={m.pos.y} radius={r} stroke="#ffffff" strokeWidth={0.05} dash={[0.15, 0.1]} opacity={0.6} listening={false} />
              <Line points={flat([m.pos, pos])} stroke="#ffffff" strokeWidth={0.05} dash={[0.2, 0.1]} listening={false} />
              <Text x={(m.pos.x + pos.x) / 2 + 0.2} y={(m.pos.y + pos.y) / 2 - 0.2} text={`${fmt(dist(m.pos, pos))}″`} fontSize={0.45} fill="#ffffff" listening={false} />
            </>
          )}
          <Group
            x={pos.x}
            y={pos.y}
            draggable={draggable}
            dragBoundFunc={(abs) => {
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
            <Circle radius={r} fill={tok.fill} shadowColor="black" shadowBlur={0.25} shadowOpacity={0.6} shadowOffsetY={0.05} />
            {img ? (
              <Group clipFunc={(ctx) => ctx.arc(0, 0, r - 0.05, 0, Math.PI * 2)} listening={false}>
                <KImage image={img} x={-r} y={-r} width={r * 2} height={r * 2} />
              </Group>
            ) : (
              <Text text={tok.label} fontSize={r * 0.75} fontStyle="bold" fill={tok.text} width={r * 2} height={r * 2} x={-r} y={-r} align="center" verticalAlign="middle" listening={false} />
            )}
            <Circle radius={r} stroke={ring} strokeWidth={0.1} listening={false} />
            <Circle radius={r - 0.06} stroke={tok.stroke} strokeWidth={0.03} listening={false} />
            {p.w > 1 && (
              <Group x={0} y={r - 0.05} listening={false}>
                <Rect x={-0.42} y={-0.2} width={0.84} height={0.36} fill={m.wounds < p.w ? '#b91c1c' : '#111827'} cornerRadius={0.1} opacity={0.9} />
                <Text text={`${m.wounds}/${p.w}`} fontSize={0.28} fill="#fff" x={-0.42} y={-0.15} width={0.84} align="center" />
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

  const grid: React.ReactNode[] = []
  for (let x = 1; x < game.board.width; x++)
    grid.push(<Line key={`gx${x}`} points={[x, 0, x, game.board.height]} stroke={BOARD_STYLE.grid} strokeWidth={x % 6 === 0 ? 0.05 : 0.02} listening={false} />)
  for (let y = 1; y < game.board.height; y++)
    grid.push(<Line key={`gy${y}`} points={[0, y, game.board.width, y]} stroke={BOARD_STYLE.grid} strokeWidth={y % 6 === 0 ? 0.05 : 0.02} listening={false} />)

  return (
    <>
      <Layer>
        <Rect x={-0.3} y={-0.3} width={game.board.width + 0.6} height={game.board.height + 0.6} fill={BOARD_STYLE.edge} cornerRadius={0.2} />
        <Rect x={0} y={0} width={game.board.width} height={game.board.height} fill={BOARD_STYLE.mat} onClick={onBackgroundClick} onTap={onBackgroundClick} />
        {(['marines', 'orks'] as const).map((p) => (
          <Line key={`dz-${p}`} points={flat(scenario.deployment[p])} closed fill={FACTION_STYLE[p].primary} opacity={0.12} listening={false} />
        ))}
        {grid}
        {game.terrain.map((t) => (
          <Group key={t.id} onClick={onBackgroundClick} onTap={onBackgroundClick}>
            <Line points={flat(t.poly)} closed fill={TERRAIN_STYLE[t.kind].fill} stroke={TERRAIN_STYLE[t.kind].stroke} strokeWidth={0.08} opacity={t.kind === 'crater' ? 0.65 : 0.95} />
            <Text x={t.poly[0].x + 0.15} y={t.poly[0].y + 0.1} text={t.name} fontSize={0.38} fill="#f5efe0" listening={false} />
          </Group>
        ))}
        {game.objectives.map((o, i) => {
          const r = baseRadius(OBJECTIVE_MARKER_MM)
          const col = o.controller ? FACTION_STYLE[o.controller].accent : BOARD_STYLE.objective
          return (
            <Group key={o.id} listening={false}>
              <Circle x={o.pos.x} y={o.pos.y} radius={OBJECTIVE_RANGE + r} stroke={col} strokeWidth={0.05} dash={[0.25, 0.2]} opacity={0.6} />
              <Circle x={o.pos.x} y={o.pos.y} radius={r} fill={col} stroke="#3b3320" strokeWidth={0.06} />
              <Text x={o.pos.x - r} y={o.pos.y - 0.2} width={r * 2} align="center" text={`${i + 1}`} fontSize={0.4} fontStyle="bold" fill="#3b3320" />
            </Group>
          )
        })}
        {overlays}
      </Layer>
      <Layer>
        {unitsRendered}
        {measureNode}
      </Layer>
    </>
  )
}
