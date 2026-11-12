// Dev-only entry (npm run dev → /coach-preview.html). Not imported by the app and not part of `vite build`
// (index.html is the only build input). Renders the frozen fixture reports so the shell can be reviewed.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../index.css'
import { orksReportSample, partialReportSample, reportSample, shortGameReportSample } from '../../game/coach/__fixtures__/report.sample'
import { CoachReportView } from './CoachReportView'
import { tr } from '../../i18n/index'

const SAMPLES = { full: reportSample, partial: partialReportSample, short: shortGameReportSample, orks: orksReportSample } as const
const LABELS: Record<keyof typeof SAMPLES, string> = { full: tr('Full (Space Marines)'), partial: tr('Partial record'), short: tr('Short game'), orks: tr('Orks') }

export function Preview() {
  const [key, setKey] = useState<keyof typeof SAMPLES>('full')
  return (
    <div className="min-h-full bg-stone-900 text-stone-100">
      <label className="m-3 flex items-center gap-2 text-sm">
        {tr('Sample report')}
        <select className="input !mt-0 !w-auto" value={key} onChange={(e) => setKey(e.target.value as keyof typeof SAMPLES)}>
          {(Object.keys(SAMPLES) as (keyof typeof SAMPLES)[]).map((k) => <option key={k} value={k}>{LABELS[k]}</option>)}
        </select>
      </label>
      <CoachReportView key={key} headingLevel={1} report={SAMPLES[key]} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>)
