// Pure shape checks for ONE Finding, shared by every analyzer test suite (so each does not re-implement
// the fixture checks). No dice, no state, no I/O. Contract: types.ts.

import type { PlayerId } from '../types'
import { CONFIG } from './config'
import { BATTLE_WIDE_KINDS, IMPACT_SOURCE, METRIC_KEYS, REF_KEYS, REQUIRED_REFS } from './types'
import type { Finding, FindingKind, Severity } from './types'

/** `Finding.impact` evaluated from the kind's {@link IMPACT_SOURCE} entry and the given metrics (NaN when a key is missing). */
export function impactFromMetrics(kind: FindingKind, metrics: Record<string, number>, config = CONFIG): number {
  const src = IMPACT_SOURCE[kind]
  switch (src.from) {
    case 'metric': return metrics[src.key] ?? NaN
    case 'vp': return (metrics[src.key] ?? NaN) * config.REPORT.VP_TO_WOUNDS
    case 'absDiff': return Math.abs((metrics[src.a] ?? NaN) - (metrics[src.b] ?? NaN))
    case 'fixed': return src.value
  }
}

const bandsOf = (kind: FindingKind, config = CONFIG) =>
  kind.startsWith('shoot.') ? config.SHOOT
  : kind.startsWith('charge.') || kind.startsWith('fight.') ? config.CHARGE
  : kind.startsWith('missed.') ? config.MISSED
  : config.MOVE // move.*, loss.*, objective.*

/** The severity a finding must have (documented on `Severity`): impact bands, plus the per-kind exceptions. */
export function severityOf(f: Pick<Finding, 'kind' | 'impact' | 'confidence' | 'metrics'>, config = CONFIG): Severity {
  if (f.confidence === 'heuristic') return 'info'
  if (f.kind === 'luck.swing') return 'minor'
  if (f.kind === 'luck.summary') return Math.abs(f.metrics.luckIndex) >= config.LUCK.NOTABLE_BAND ? 'minor' : 'info'
  if (f.kind === 'result.summary' || f.kind === 'charge.failedByLuck' || f.kind.startsWith('good.')) return 'info'
  const b = bandsOf(f.kind, config)
  return f.impact >= b.CRITICAL_WOUNDS ? 'critical' : f.impact >= b.MAJOR_WOUNDS ? 'major' : f.impact >= b.MINOR_WOUNDS ? 'minor' : 'info'
}

/**
 * Everything wrong with one Finding against the contract; `[]` = fine. Checks: metric keys == METRIC_KEYS[kind];
 * refs subset of REF_KEYS[kind] and REQUIRED_REFS present; `frameIndex` null iff a battle-wide kind (else an
 * integer >= 0); `unitIds` empty iff battle-wide; impact finite, >= 0 and equal to `impactFromMetrics` (1e-9);
 * severity == `severityOf`; `actor === ctx.human` when ctx is given; id = `${kind}:r${round}:f${frameIndex ?? 'x'}`
 * + `:${unitIds.join('+')}` when any, optionally followed by `#N` (N >= 2).
 */
export function findingShapeErrors(f: Finding, ctx?: { human: PlayerId }): string[] {
  const e: string[] = []
  const wide = BATTLE_WIDE_KINDS.includes(f.kind)
  if (Object.keys(f.metrics).sort().join() !== [...METRIC_KEYS[f.kind]].sort().join()) e.push(`metric keys differ from METRIC_KEYS[${f.kind}]`)
  for (const [k, v] of Object.entries(f.metrics)) if (!Number.isFinite(v)) e.push(`metric ${k} is not finite`)
  for (const k of Object.keys(f.refs ?? {})) if (!REF_KEYS[f.kind].includes(k)) e.push(`ref ${k} not allowed for ${f.kind}`)
  for (const k of REQUIRED_REFS[f.kind] ?? []) if (!f.refs?.[k]) e.push(`ref ${k} is required for ${f.kind}`)
  if (wide !== (f.frameIndex === null)) e.push(wide ? 'battle-wide kind must have frameIndex null' : 'frameIndex null only for battle-wide kinds')
  if (f.frameIndex !== null && !(Number.isInteger(f.frameIndex) && f.frameIndex >= 0)) e.push('frameIndex must be an integer >= 0')
  if (wide !== (f.unitIds.length === 0)) e.push(wide ? 'battle-wide kind must have empty unitIds' : 'unitIds must be non-empty')
  if (!(Number.isFinite(f.impact) && f.impact >= 0)) e.push('impact must be finite and >= 0')
  else if (!(Math.abs(f.impact - impactFromMetrics(f.kind, f.metrics)) <= 1e-9)) e.push(`impact ${f.impact} != IMPACT_SOURCE value ${impactFromMetrics(f.kind, f.metrics)}`)
  if (f.severity !== severityOf(f)) e.push(`severity ${f.severity} != ${severityOf(f)} for impact ${f.impact}`)
  if (ctx && f.actor !== ctx.human) e.push(`actor ${f.actor} is not the human ${ctx.human}`)
  const base = `${f.kind}:r${f.round}:f${f.frameIndex ?? 'x'}${f.unitIds.length ? `:${f.unitIds.join('+')}` : ''}`
  const suffix = f.id.startsWith(base) ? f.id.slice(base.length) : null
  if (suffix === null || !(suffix === '' || (/^#\d+$/.test(suffix) && Number(suffix.slice(1)) >= 2))) e.push(`id ${f.id} does not follow ${base}[#N]`)
  return e
}
