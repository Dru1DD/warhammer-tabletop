import { fireEvent, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { orksReportSample, partialReportSample, reportSample, shortGameReportSample } from '../../game/coach/__fixtures__/report.sample'
import type { CoachReport, Finding, FindingKind, ReportNote } from '../../game/coach/types'
import { CoachReportView } from './CoachReportView'
import { planText } from './text'

const REPORTS: Record<string, CoachReport> = { reportSample, partialReportSample, shortGameReportSample, orksReportSample }
const BAD = /undefined|NaN|\[object/

describe('<CoachReportView />', () => {
  it.each(Object.entries(REPORTS))('%s renders (server + client) without junk text', (_name, report) => {
    const html = renderToString(<CoachReportView report={report} />)
    expect(html.length).toBeGreaterThan(500)
    const { container } = render(<CoachReportView report={report} />)
    // `hidden` (collapsed) sections stay in the DOM, so textContent covers every list
    expect(container.textContent).not.toMatch(BAD)
    expect(container.textContent).toContain('План на следующий бой')
    // embedded by default: the host page owns the h1
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: /^Разбор битвы: / })).toBeInTheDocument()
  })

  it('headingLevel shifts the whole outline (preview uses 1): title, sections, cards', () => {
    const { container } = render(<CoachReportView report={reportSample} headingLevel={1} />)
    expect(screen.getByRole('heading', { level: 1, name: /^Разбор битвы: Поражение — победили Орки$/ })).toBeInTheDocument()
    expect(container.querySelector('[data-section="mistakes"] h2')).not.toBeNull()
    expect(container.querySelector('[data-kind] h3')).not.toBeNull()
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    const embedded = render(<CoachReportView report={reportSample} />).container
    expect(embedded.querySelector('h1')).toBeNull()
    expect(embedded.querySelector('[data-section="mistakes"] h3')).not.toBeNull()
    expect(embedded.querySelector('[data-kind] h4')).not.toBeNull()
  })

  it('the title id comes from useId: two reports on a page do not clash', () => {
    const { container } = render(<><CoachReportView report={reportSample} /><CoachReportView report={orksReportSample} /></>)
    const arts = [...container.querySelectorAll('[data-testid="coach-report"]')]
    const ids = arts.map((a) => a.getAttribute('aria-labelledby')!)
    expect(new Set(ids).size).toBe(2)
    for (const [i, a] of arts.entries()) expect(a.querySelector(`[id="${CSS.escape(ids[i])}"]`)).toHaveTextContent(/^Разбор битвы/)
    expect(container.querySelector('#coach-title')).toBeNull()
  })

  it('shows every finding of every list, one card per finding', () => {
    const { container } = render(<CoachReportView report={reportSample} />)
    const n = [reportSample.mistakes, reportSample.missed, reportSample.luck, reportSample.shooting, reportSample.movement, reportSample.positives].reduce((a, l) => a + l.length, 0)
    expect(container.querySelectorAll('article[data-kind]').length).toBe(n)
    expect(reportSample.plan).toHaveLength(3)
    expect(container.querySelectorAll('[data-section="plan"] li').length).toBe(3)
  })

  it.each(Object.entries(REPORTS))('%s: plan section renders exactly report.plan, in order', (_name, report) => {
    const { container } = render(<CoachReportView report={report} />)
    const items = [...container.querySelectorAll('[data-section="plan"] li')]
    expect(items).toHaveLength(report.plan.length)
    expect(items.map((li) => li.querySelector('h3, h4')?.textContent)).toEqual(report.plan.map((p) => planText(p.kind).title))
  })

  it('shows the partial / low-data notes and no note when there is none', () => {
    render(<CoachReportView report={partialReportSample} />)
    expect(screen.getByRole('note')).toHaveTextContent('Запись неполная')
    expect(screen.getByRole('note')).toHaveTextContent('раунда 3')
  })

  it('short game: low-data banner, empty sections explain themselves', () => {
    const { container } = render(<CoachReportView report={shortGameReportSample} />)
    expect(screen.getByRole('note')).toHaveTextContent('Данных мало')
    expect(container.textContent).toContain('оценка удачи не показывается')
    expect(container.textContent).toContain('хорошие моменты не выделены — данных слишком мало')
    expect(container.textContent).toContain('Заметных ошибок не найдено.')
    expect(container.textContent).toContain('Битва не закончена')
  })

  it('full and Orks reports have no notes; Orks report shows Orks-only kinds', () => {
    const { container, rerender } = render(<CoachReportView report={reportSample} />)
    expect(screen.queryByRole('note')).toBeNull()
    rerender(<CoachReportView report={orksReportSample} />)
    expect(container.querySelector('[data-kind="missed.waaagh"]')).not.toBeNull()
    expect(container.querySelector('[data-kind="missed.ammoRunts"]')).not.toBeNull()
    expect(container.textContent).toContain('Поражение — победил Космодесант')
  })

  it('sections collapse and expand by button with aria-expanded; keyboard-activatable native buttons', () => {
    render(<CoachReportView report={reportSample} />)
    const btn = screen.getByRole('button', { name: /Удача на кубиках/ })
    const body = document.getElementById(btn.getAttribute('aria-controls')!)!
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(body).toHaveAttribute('hidden')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(body).not.toHaveAttribute('hidden')
    expect(btn.tagName).toBe('BUTTON')
    expect(within(btn.closest('h3')!).getByRole('button')).toBe(btn)
  })

  it('empty positives of a normal-sized report do not claim «данных мало»', () => {
    const { container } = render(<CoachReportView report={{ ...reportSample, positives: [] }} />)
    expect(container.querySelector('[data-section="positives"]')).toHaveTextContent('Пока нет удачных решений, которые можно отметить.')
    expect(container.querySelector('[data-section="positives"]')).not.toHaveTextContent('данных слишком мало')
  })

  it('the confidence hint is real text for assistive tech, not only a title tooltip', () => {
    const { container } = render(<CoachReportView report={orksReportSample} />)
    const w = container.querySelector('[data-kind="missed.waaagh"]')!
    expect(w).toHaveTextContent('Совет. Совет: общее соображение о стиле игры, а не ошибка.')
    expect(w.querySelector('.sr-only')).not.toBeNull()
  })

  it('an unknown finding / note kind does not crash the view', () => {
    const odd: Finding = { ...reportSample.mistakes[0], id: 'odd:1', kind: 'totally.new' as FindingKind }
    const report: CoachReport = { ...reportSample, mistakes: [odd, ...reportSample.mistakes], notes: [{ kind: 'brandNew' } as unknown as ReportNote] }
    const { container } = render(<CoachReportView report={report} />)
    expect(container.querySelector('[data-kind="totally.new"]')).toHaveTextContent('Наблюдение тренера')
    expect(container.querySelector('[data-note="brandNew"]')).toHaveTextContent('Наблюдение тренера')
    expect(container.textContent).not.toMatch(BAD)
  })

  it('heuristic findings are labelled «Совет» and not styled by severity', () => {
    const { container } = render(<CoachReportView report={orksReportSample} />)
    const w = container.querySelector('[data-kind="missed.waaagh"]')!
    expect(w).toHaveTextContent('Совет')
    expect(w).toHaveTextContent('Возможно')
    expect(w).not.toHaveTextContent('Критично')
  })

  it('«Показать момент» only appears when a handler is passed, and reports the frame', () => {
    const { container, rerender } = render(<CoachReportView report={reportSample} />)
    expect(screen.queryAllByRole('button', { name: /Показать момент/ })).toHaveLength(0)
    const spy = vi.fn()
    rerender(<CoachReportView report={reportSample} onShowMoment={spy} />)
    const first = container.querySelector('[data-section="mistakes"] article button') as HTMLButtonElement
    fireEvent.click(first)
    expect(spy).toHaveBeenCalledWith(reportSample.mistakes[0].frameIndex, reportSample.mistakes[0])
    // battle-wide findings (frameIndex null) never get the button
    expect(container.querySelector('[data-kind="luck.summary"] button')).toBeNull()
  })
})
