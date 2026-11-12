// Post-Battle Tactical Coach: report shell (FE3). Pure view of a finished CoachReport: no store, no Konva,
// no dice. Text comes from ./text (FE5). Mounted only explicitly (see coach-preview.html / preview.tsx).

import { createContext, useContext, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { FINDING_CLASS } from '../../game/coach/types'
import type { CoachReport, Finding, FindingClass, RoundSummary } from '../../game/coach/types'
import type { PlayerId } from '../../game/types'
import {
  BADGE_PREFIX, CONFIDENCE_HINT, CONFIDENCE_LABEL, SECTION_TEXT, SEVERITY_LABEL,
  describeFinding, emptyText, headlineText, namesFor, noteText, planText, whenText,
} from './text'
import type { Names, SectionId } from './text'
import { tr } from '../../i18n/index'

export interface CoachReportViewProps {
  report: CoachReport
  /** Overrides the id → name lookup (default: names of `report.battle.scenarioId`). */
  names?: Names
  /** When given, findings with a frame get a "Show the moment" button (a later task wires it to the board). */
  onShowMoment?: (frameIndex: number, finding: Finding) => void
  /**
   * Level of the report's own title (sections are one level lower, cards two). Default 2: the report is embedded
   * in a page that already owns the h1. A standalone page (coach-preview) passes 1.
   */
  headingLevel?: 1 | 2 | 3 | 4
}

const HeadingLevel = createContext<number>(2)

/** Heading at `base + offset` (clamped to h6); the base comes from {@link CoachReportViewProps.headingLevel}. */
function H({ offset, id, className, children }: { offset: number; id?: string; className?: string; children: ReactNode }) {
  const level = Math.min(6, useContext(HeadingLevel) + offset)
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  return <Tag id={id} className={className}>{children}</Tag>
}

// ───────────────────────────── styling ─────────────────────────────

const CARD_TONE: Record<FindingClass, string> = {
  summary: 'border-stone-600 bg-stone-800/60',
  mistake: 'border-amber-700/70 bg-amber-950/20',
  missed: 'border-sky-700/70 bg-sky-950/20',
  luck: 'border-violet-700/60 bg-violet-950/20',
  explain: 'border-violet-700/60 bg-violet-950/20',
  positive: 'border-emerald-700/70 bg-emerald-950/20',
}

const SEVERITY_BADGE = {
  critical: 'bg-red-900/70 text-red-100',
  major: 'bg-amber-800/70 text-amber-100',
  minor: 'bg-yellow-900/60 text-yellow-100',
  info: 'bg-stone-700 text-stone-200',
} as const

const CONFIDENCE_BADGE = {
  exact: 'border-stone-500 text-stone-200',
  estimate: 'border-sky-600 text-sky-200',
  heuristic: 'border-stone-600 text-stone-300 border-dashed',
} as const

const HEADLINE_TONE = {
  win: 'border-emerald-600 bg-emerald-950/40',
  lose: 'border-stone-500 bg-stone-800/70',
  draw: 'border-yellow-500 bg-yellow-900/30',
  open: 'border-stone-600 bg-stone-800/60',
} as const

const badge = 'inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold'

// ───────────────────────────── pieces ─────────────────────────────

function Section({ id, count, defaultOpen = false, children }: { id: SectionId; count?: number; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const uid = useId()
  const { title, hint } = SECTION_TEXT[id]
  return (
    <section className="rounded-lg border border-stone-700 bg-stone-900/60" data-section={id}>
      <H offset={1} className="m-0 text-base font-semibold">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400"
          aria-expanded={open}
          aria-controls={`${uid}-body`}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true" className="w-4 text-stone-400">{open ? '▾' : '▸'}</span>
          <span className="flex-1">{title}</span>
          {count !== undefined && <span className="rounded-full bg-stone-700 px-2 text-xs text-stone-200">{count}</span>}
        </button>
      </H>
      <div id={`${uid}-body`} hidden={!open} className="px-3 pb-3">
        <p className="mb-2 text-xs text-stone-400">{hint}</p>
        {children}
      </div>
    </section>
  )
}

function FindingCard({ f, names, onShowMoment }: { f: Finding; names: Names; onShowMoment?: CoachReportViewProps['onShowMoment'] }) {
  const t = describeFinding(f, names)
  const cls = FINDING_CLASS[f.kind]
  // advice-only findings are never styled as alarming
  // an unknown kind (newer report than this UI) has no class: style it as a neutral summary card
  const tone = f.confidence === 'heuristic' ? 'border-stone-600 bg-stone-800/50' : (CARD_TONE[cls] ?? CARD_TONE.summary)
  const frame = f.frameIndex
  return (
    <article className={`rounded border p-3 ${tone}`} data-kind={f.kind} data-severity={f.severity} data-confidence={f.confidence}>
      <div className="flex flex-wrap items-center gap-1.5">
        <H offset={2} className="m-0 mr-1 text-sm font-semibold">{t.title}</H>
        {cls !== 'positive' && cls !== 'summary' && (
          <span className={`${badge} ${f.confidence === 'heuristic' ? SEVERITY_BADGE.info : SEVERITY_BADGE[f.severity]}`}>{SEVERITY_LABEL[f.severity]}</span>
        )}
        <span className={`${badge} border ${CONFIDENCE_BADGE[f.confidence]}`} title={CONFIDENCE_HINT[f.confidence]}>
          {CONFIDENCE_LABEL[f.confidence]}
          <span className="sr-only">. {CONFIDENCE_HINT[f.confidence]}</span>
        </span>
        {f.frameIndex !== null && <span className="text-[11px] text-stone-400">{whenText(f)}</span>}
      </div>
      <p className="mt-1.5 text-sm text-stone-200">{t.explanation}</p>
      <p className="mt-1 text-sm text-stone-300"><b className="text-stone-100">{BADGE_PREFIX.fix}:</b> {t.fix}</p>
      {onShowMoment && frame !== null && (
        <button type="button" className="btn mt-2 text-xs" onClick={() => onShowMoment(frame, f)} aria-label={`${BADGE_PREFIX.frame}: ${t.title}, ${whenText(f)}`}>
          {BADGE_PREFIX.frame}
        </button>
      )}
    </article>
  )
}

function FindingList({ empty, list, names, onShowMoment }: { empty: string; list: Finding[]; names: Names; onShowMoment?: CoachReportViewProps['onShowMoment'] }) {
  if (!list.length) return <p className="text-sm text-stone-400">{empty}</p>
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {list.map((f) => (
        <li key={f.id}><FindingCard f={f} names={names} onShowMoment={onShowMoment} /></li>
      ))}
    </ul>
  )
}

function PlanList({ report }: { report: CoachReport }) {
  const byId = useMemo(() => {
    const all = [...report.mistakes, ...report.missed, ...report.luck, ...report.shooting, ...report.movement, ...report.positives]
    return new Map(all.map((f) => [f.id, f]))
  }, [report])
  if (!report.plan.length) return <p className="text-sm text-stone-400">{SECTION_TEXT.plan.empty}</p>
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {report.plan.map((item, i) => {
        const t = planText(item.kind)
        const rounds = [...new Set(item.findingIds.map((id) => byId.get(id)?.round).filter((r): r is number => r !== undefined))].sort((a, b) => a - b)
        return (
          <li key={item.kind} className="flex gap-3 rounded border border-yellow-700/60 bg-yellow-950/20 p-3">
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-500 text-sm font-bold text-black">{i + 1}</span>
            <div className="min-w-0">
              <H offset={2} className="m-0 text-sm font-semibold">{t.title}</H>
              <p className="mt-0.5 text-sm text-stone-200">{t.advice}</p>
              {rounds.length > 0 && <p className="mt-1 text-xs text-stone-400">{BADGE_PREFIX.where}: {rounds.map((r) => `${BADGE_PREFIX.round.toLowerCase()} ${r}`).join(', ')}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Timeline({ rows, human }: { rows: RoundSummary[]; human: PlayerId }) {
  if (!rows.length) return <p className="text-sm text-stone-400">{SECTION_TEXT.timeline.empty}</p>
  const enemy: PlayerId = human === 'marines' ? 'orks' : 'marines'
  const head = [tr('Round'), tr('VP: you'), tr('VP: opponent'), tr('Dealt by you'), tr('Taken by you'), tr('Units lost: you'), tr('Units lost: opponent')]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
        <caption className="sr-only">{SECTION_TEXT.timeline.title}</caption>
        <thead className="text-stone-400">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-2 py-1 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.round} className="border-t border-stone-700">
              <th scope="row" className="px-2 py-1 font-semibold">{r.round}</th>
              <td className="px-2 py-1">{r.stats[human].vp}</td>
              <td className="px-2 py-1">{r.stats[enemy].vp}</td>
              <td className="px-2 py-1">{r.stats[human].damageDealt}</td>
              <td className="px-2 py-1">{r.stats[human].damageTaken}</td>
              <td className="px-2 py-1">{r.stats[human].unitsLost}</td>
              <td className="px-2 py-1">{r.stats[enemy].unitsLost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ───────────────────────────── root ─────────────────────────────

export function CoachReportView({ report, names, onShowMoment, headingLevel = 2 }: CoachReportViewProps) {
  const nm = useMemo(() => names ?? namesFor(report.battle.scenarioId), [names, report.battle.scenarioId])
  const titleId = `${useId()}-title`
  const head = headlineText(report)
  const list = (id: SectionId, items: Finding[]) => <FindingList empty={emptyText(id, report.notes)} list={items} names={nm} onShowMoment={onShowMoment} />
  return (
    <HeadingLevel.Provider value={headingLevel}>
      <article className="mx-auto flex max-w-3xl flex-col gap-3 p-3 text-sm text-stone-100" aria-labelledby={titleId} data-testid="coach-report">
        <header className={`rounded border p-3 ${HEADLINE_TONE[head.tone]}`}>
          <H offset={0} id={titleId} className="m-0 text-lg font-bold">{tr('Battle review: {verdict}', { verdict: head.verdict })}</H>
          <p className="mt-0.5 text-xs text-stone-400">{head.context}</p>
          <p className="mt-1 font-semibold">{head.score}</p>
          <p className="text-stone-300">{head.totals}</p>
        </header>

        {report.notes.map((note) => {
          const t = noteText(note)
          return (
            <aside key={note.kind} role="note" className="rounded border border-sky-700/70 bg-sky-950/30 p-3" data-note={note.kind}>
              <H offset={1} className="m-0 text-sm font-semibold text-sky-200">{t.title}</H>
              <p className="mt-0.5 text-sm text-stone-200">{t.text}</p>
            </aside>
          )
        })}

        <Section id="plan" count={report.plan.length} defaultOpen><PlanList report={report} /></Section>
        <Section id="mistakes" count={report.mistakes.length} defaultOpen>{list('mistakes', report.mistakes)}</Section>
        <Section id="missed" count={report.missed.length} defaultOpen>{list('missed', report.missed)}</Section>
        <Section id="luck" count={report.luck.length}>{list('luck', report.luck)}</Section>
        <Section id="shooting" count={report.shooting.length}>{list('shooting', report.shooting)}</Section>
        <Section id="movement" count={report.movement.length}>{list('movement', report.movement)}</Section>
        <Section id="positives" count={report.positives.length} defaultOpen>{list('positives', report.positives)}</Section>
        <Section id="timeline" count={report.timeline.length}><Timeline rows={report.timeline} human={report.battle.human} /></Section>
      </article>
    </HeadingLevel.Provider>
  )
}
