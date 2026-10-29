import type Konva from 'konva'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Ellipse, Group, Image as KImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import { BOARD_STYLE, FACTION_LINE, FACTION_STYLE, TERRAIN_STYLE, TOKENS, tokenImageFor } from '../assets/manifest'
import { boxOf, fitBox, withBox, type Box } from '../game/terrainLayout'
import { actor, maxMove, moveModeFor, shootPlan, validate } from '../game/engine'
import { baseRadius, dist, edgeDistance, withinRange } from '../game/geometry/geometry'
import { alive, CHARGE_RANGE, findUnit, fmt, hasAbility, modelDistance, OBJECTIVE_MARKER_MM, OBJECTIVE_RANGE, profileOf, radiusOf, weaponsOf } from '../game/gameState'
import { scenarioById } from '../game/scenarios/scenarios'
import type { Command, GameState, ModelState, Terrain, UnitState, Vec } from '../game/types'
import { useStore } from '../store'
import { clampToRadius, fitBoard, screenToWorld, worldToScreen, zoomAt, type Viewport } from '../view/transform'
import { actedThisPhase, canActNow, deploymentHint, endPhaseWarning, nextPhaseLabel, nextStepHint, targetCommand } from './guidance'
import { deploymentProblem } from '../game/rules/deployment'

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
      <Legend />
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
      if (e.key === 'Enter' && st.deploying) {
        if (sel) st.placeUnit(sel.id)
      } else if (e.key === 'Enter' && sel && Object.keys(st.draft).length) {
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
  const hint = st.review
    ? { text: 'Разбор атаки: нажимайте «Дальше ▶», чтобы пройти броски по шагам. Игра ждёт вас.', tone: 'info' as const }
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
    ruin: 'закрывает обзор · технике не пройти', woods: 'закрывает обзор · технике не пройти', container: 'закрывает обзор · внутри не встать',
    barricade: 'закрывает обзор · укрытие', crater: 'укрытие',
  }
  const dims = `${fmt(b.w)}×${fmt(b.h)}″ · ${effect[t.kind] ?? (t.obscuring ? 'закрывает обзор' : 'укрытие')}`
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
    <details className="absolute left-2 top-14 z-[1] max-w-56 rounded bg-black/70 px-2 py-1 text-[11px] text-stone-200">
      <summary className="cursor-pointer">Обозначения</summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {row(ring('border-yellow-400'), 'выбранный отряд')}
        {row(ring('border-dashed border-green-400'), 'может действовать / ждёт расстановки')}
        {row(<span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-stone-600 text-[9px]">✓</span>, 'уже действовал в этой фазе')}
        {row(ring('border-green-400 border-[3px]'), 'законная цель (клик — атаковать)')}
        {row(ring('border-red-500'), 'недоступная цель / недопустимая позиция')}
        {row(ring('border-dashed border-white/70'), 'исходная позиция (черновик хода)')}
        {row(<span className="inline-block h-3 w-4 shrink-0 border-2 border-dashed border-yellow-400 bg-blue-800/50" />, 'зона развёртывания')}
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
  if (game.phase === 'movement' && mine && mine.move === 'none') {
    const mode = moveModeFor(game, mine)
    if (hasDraft) {
      buttons.push(<button key="reset" className="btn" onClick={() => st.clearDraft()} title="Вернуть модели на исходные места (Esc)">↺ Вернуть</button>)
      btn('confirm', { type: 'move', unitId: mine.id, mode, positions: st.draft }, `✓ Подтвердить ${mode === 'advance' ? 'продвижение' : mode === 'fallBack' ? 'отступление' : 'движение'}`, true)
    } else if (mine.advanceRoll === null && mode === 'normal') {
      btn('advance', { type: 'declareAdvance', unitId: mine.id }, '⚡ Продвинуться (+D6″)')
    }
    if (mine.advanceRoll !== null && !mine.advanceRerolled && hasAbility(mine, 'waaagh')) btn('reroll', { type: 'rerollAdvance', unitId: mine.id }, '🎲 Перебросить (Waaagh!)')
    buttons.push(<DragModeToggle key="group" />)
  }
  if (game.phase === 'shooting' && mine && st.aimTargetId) {
    const aim = findUnit(game, st.aimTargetId)
    if (aim) {
      buttons.push(<button key="unaim" className="btn" onClick={() => st.setAim(null)}>✕ Другая цель</button>)
      btn('fire', { type: 'shoot', unitId: mine.id, targetId: aim.id, ...st.shotOptions }, `🎯 Огонь по «${aim.name}»`, true)
    }
  }
  if (game.phase === 'charge' && mine) {
    if (game.pendingCharge?.unitId === mine.id) btn('skip', { type: 'skipCharge', unitId: mine.id }, 'Отказаться от атаки')
    else if (canActNow(game, mine)) btn('charge', { type: 'declareCharge', unitId: mine.id }, '🎲 Объявить атаку (2D6)')
  }
  if (st.history.length) buttons.push(<button key="undo" className="btn" onClick={() => st.undo()} title="Отменить последнее действие без бросков кубиков">↶ Отменить</button>)

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
      {armed === phaseKey && warn ? `Да, ${nextPhaseLabel(game).toLowerCase()}` : nextPhaseLabel(game)} ▶
    </button>,
  )
  return (
    <div className="absolute bottom-3 left-1/2 z-[1] flex max-w-[95%] -translate-x-1/2 flex-wrap items-stretch justify-center gap-1 rounded-xl bg-black/70 p-1.5 shadow-xl">
      {buttons}
    </div>
  )
}

/** Whole unit vs one model per drag. Moving only some models is legal: the rest stay put. */
export function DragModeToggle() {
  const group = useStore((s) => s.groupDrag)
  const set = useStore((s) => s.setGroupDrag)
  const opt = (v: boolean, label: string, title: string) => (
    <button type="button" aria-pressed={group === v} title={title} onClick={() => set(v)} className={`px-2 text-xs ${group === v ? 'bg-yellow-500 font-semibold text-black' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'}`}>
      {group === v ? '● ' : '○ '}{label}
    </button>
  )
  return (
    <div className="flex overflow-hidden rounded border border-stone-600" role="group" aria-label="Что двигает перетаскивание">
      {opt(true, 'Весь отряд', 'Перетаскивание одной модели сдвигает весь отряд')}
      {opt(false, 'По одной модели', 'Каждая модель двигается отдельно; можно сдвинуть одну, две или все, затем одно подтверждение')}
    </div>
  )
}

function DeployBar() {
  const st = useStore()
  const game = st.game!
  const sel = st.selectedUnitId ? findUnit(game, st.selectedUnitId) : undefined
  const mine = sel && sel.owner === st.settings.human ? sel : undefined
  const hasDraft = Object.keys(st.draft).length > 0
  const why = mine ? deploymentProblem(game, mine, st.draft) : 'Выберите свой отряд.'
  const placed = st.deploying!.placed
  const allPlaced = game.units.every((u) => u.owner !== st.settings.human || placed.includes(u.id))
  return (
    <div className="absolute bottom-3 left-1/2 z-[1] flex max-w-[95%] -translate-x-1/2 flex-wrap items-stretch justify-center gap-1 rounded-xl bg-black/70 p-1.5 shadow-xl">
      {hasDraft && <button className="btn" onClick={() => st.clearDraft()} title="Вернуть модели как было (Esc)">↺ Вернуть</button>}
      {mine && (
        <button className={`btn ${allPlaced && !hasDraft ? '' : 'btn-primary'}`} disabled={!!why} title={why ?? 'Enter'} onClick={() => st.placeUnit(mine.id)}>
          ✓ Поставить «{mine.name}»{placed.includes(mine.id) && !hasDraft ? ' (уже стоит)' : ''}
        </button>
      )}
      <DragModeToggle />
      {st.deployHistory.length > 0 && <button className="btn" onClick={() => st.undo()} title="Отменить последнюю расстановку">↶ Отменить</button>}
      <button className={`btn ${allPlaced && !hasDraft ? 'btn-primary' : ''}`} disabled={!allPlaced} title={allPlaced ? 'Бросок за первый ход и начало раунда 1' : 'Сначала расставьте все свои отряды'} onClick={() => st.finishDeployment()}>
        Начать битву ▶
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
  const deploying = st.deploying
  const myTurn = !deploying && actor(game) === human && !game.winner
  const scenario = scenarioById(game.scenarioId)
  const profileIds = [...new Set(game.units.flatMap((u) => u.models.map((m) => m.profileId)))]
  const imageUrls = profileIds.map((id) => tokenImageFor(id, st.customTokens)).filter((x): x is string => !!x)
  const images = useImages(imageUrls)

  const canDrag = (u: UnitState) =>
    !st.measuring && u.owner === human && sel?.id === u.id && (deploying ? true : myTurn && game.phase === 'movement' && u.move === 'none')

  const draftValidity = useMemo(() => {
    if (!mine || Object.keys(st.draft).length === 0) return null
    if (deploying) {
      const why = deploymentProblem(game, mine, st.draft)
      return why ? { ok: false as const, reason: why } : { ok: true as const }
    }
    return validate(game, { type: 'move', unitId: mine.id, mode: moveModeFor(game, mine), positions: st.draft })
  }, [game, mine, st.draft, deploying])

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
      // shooting for learners: first pick the target and read the breakdown, then «Огонь»
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

  const unitsRendered = game.units.map((u) => {
    const draggable = canDrag(u)
    const max = deploying ? Infinity : maxMove(u)
    const unplaced = !!deploying && u.owner === human && !deploying.placed.includes(u.id)
    const actionable = unplaced || (myTurn && u.owner === human && canActNow(game, u))
    const acted = myTurn && u.owner === human && actedThisPhase(game, u)
    const target = targets[u.id]
    return alive(u).map((m) => {
      const r = radiusOf(m)
      const pos = st.draft[m.id] ?? m.pos
      const tok = TOKENS[m.profileId]
      const p = profileOf(m)
      const selected = sel?.id === u.id
      const moved = dist(pos, m.pos) > 0.01
      const img = images[tokenImageFor(m.profileId, st.customTokens) ?? '']
      const ring = FACTION_LINE[u.owner]
      return (
        <Group key={m.id}>
          {selected && draggable && !deploying && (
            <Circle x={m.pos.x} y={m.pos.y} radius={max + r} stroke="#ffffff" strokeWidth={0.05} dash={[0.3, 0.2]} opacity={0.45} listening={false} />
          )}
          {moved && (
            <>
              <Circle x={m.pos.x} y={m.pos.y} radius={r} stroke="#ffffff" strokeWidth={0.05} dash={[0.15, 0.1]} opacity={0.6} listening={false} />
              <Line points={flat([m.pos, pos])} stroke="#ffffff" strokeWidth={0.05} dash={[0.2, 0.1]} listening={false} />
              {!deploying && <Text x={m.pos.x - 1} y={m.pos.y - r - 0.5} width={2} align="center" text={`${fmt(dist(m.pos, pos))}″ из ${fmt(max)}″`} fontSize={0.38} fill="#ffffff" shadowColor="black" shadowBlur={0.1} listening={false} />}
            </>
          )}
          <Group
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
            <Group opacity={unplaced && !moved ? 0.75 : 1}>
            <Circle radius={r} fill={tok.fill} shadowColor="black" shadowBlur={0.25} shadowOpacity={0.6} shadowOffsetY={0.05} />
            {img ? (
              <Group clipFunc={(ctx) => ctx.arc(0, 0, r - 0.05, 0, Math.PI * 2)} listening={false}>
                <KImage image={img} x={-r} y={-r} width={r * 2} height={r * 2} />
              </Group>
            ) : (
              <Text text={tok.label} fontSize={r * 0.75} fontStyle="bold" fill={tok.text} width={r * 2} height={r * 2} x={-r} y={-r} align="center" verticalAlign="middle" listening={false} />
            )}
            <Circle radius={r} stroke={ring} strokeWidth={0.06} listening={false} />
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
  grid.push(<Text key="dims" x={0} y={H + 0.2} width={W} align="center" text={`ПОЛЕ ${W}″ × ${H}″ · СЕТКА 1″`} fontSize={0.34} fill={BOARD_STYLE.ink} opacity={0.6} letterSpacing={0.05} listening={false} />)

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
        {(['marines', 'orks'] as const).map((p) => {
          const zone = scenario.deployment[p]
          const own = p === human
          return (
            <Group key={`dz-${p}`} listening={false}>
              <Line points={flat(zone)} closed fill={FACTION_LINE[p]} opacity={deploying ? (own ? 0.16 : 0.06) : 0.06} />
              <Line points={flat(zone)} closed stroke={FACTION_LINE[p]} strokeWidth={0.04} dash={[0.15, 0.15]} opacity={0.5} />
              {deploying && own && <Line points={flat(zone)} closed stroke="#facc15" strokeWidth={0.1} dash={[0.4, 0.2]} />}
              {deploying && (
                <Text x={zone[0].x + 0.2} y={game.board.height - 0.7} text={own ? 'ВАША ЗОНА' : 'зона противника'} fontSize={0.45} fontStyle="bold" fill={own ? '#facc15' : '#d6d3d1'} />
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
          const col = o.controller ? FACTION_LINE[o.controller] : BOARD_STYLE.objective
          return (
            <Group key={o.id} x={o.pos.x} y={o.pos.y} listening={false}>
              <Circle radius={OBJECTIVE_RANGE + r} stroke={col} strokeWidth={0.04} dash={[0.25, 0.2]} opacity={0.6} />
              <Circle radius={r} fill={col} opacity={0.15} />
              <Circle radius={r} stroke={col} strokeWidth={0.08} />
              <Circle radius={r * 0.45} stroke={col} strokeWidth={0.05} />
              <Line points={[-r - 0.35, 0, r + 0.35, 0]} stroke={col} strokeWidth={0.04} />
              <Line points={[0, -r - 0.35, 0, r + 0.35]} stroke={col} strokeWidth={0.04} />
              <Text x={r * 0.55} y={-r - 0.55} text={`Ц${i + 1}`} fontSize={0.4} fontStyle="bold" fill={col} />
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
