import type { Roller } from '../dice/dice'
import { addLog, alive, isDestroyed, profileOf } from '../gameState'
import type { AttackStep, DieRoll, GameState, ModelState, UnitState, WeaponProfile } from '../types'

export interface AttackGroup {
  weaponName: string
  profile: WeaponProfile
  /** number of models firing / swinging this weapon */
  models: number
  /** total attacks after Rapid Fire / Blast / Cleave */
  attacks: number
  notes: string[]
}

export interface AttackContext {
  /** sum of hit-roll modifiers (capped to ±1 here) */
  hitMod: number
  hitModNotes: string[]
  /** worsen BS/WS by this much (cover) */
  skillWorsen: number
  lethalHits: boolean
  invulnOverride?: number
}

export function woundTarget(s: number, t: number): number {
  if (s >= 2 * t) return 2
  if (s > t) return 3
  if (s === t) return 4
  if (s * 2 <= t) return 6
  return 5
}

const toughness = (u: UnitState) => Math.max(...alive(u).map((m) => profileOf(m).t))

/** Allocation order: wounded non-characters first, then lowest-W non-characters, characters last. */
export function pickModelForDamage(u: UnitState): ModelState | undefined {
  const a = alive(u)
  const score = (m: ModelState) => {
    const p = profileOf(m)
    return (p.character ? 1000 : 0) + (m.wounds < p.w ? 0 : 100) + p.w
  }
  return [...a].sort((x, y) => score(x) - score(y))[0]
}

export function saveTarget(m: ModelState, ap: number, invuln?: number): { need: number; kind: string } {
  const p = profileOf(m)
  const armour = p.sv - ap
  const inv = [p.invuln, invuln].filter((x): x is number => x !== undefined)
  const bestInv = inv.length ? Math.min(...inv) : Infinity
  return bestInv < armour ? { need: bestInv, kind: 'непробиваемый (invulnerable)' } : { need: armour, kind: 'бронёй' }
}

/** Apply damage to a unit, returns number of models destroyed. */
export function applyDamage(u: UnitState, dmg: number, target?: ModelState): number {
  const m = target ?? pickModelForDamage(u)
  if (!m) return 0
  m.wounds = Math.max(0, m.wounds - dmg)
  if (m.wounds === 0) { m.destroyed = true; return 1 }
  return 0
}

export function applyMortalWounds(s: GameState, u: UnitState, n: number, why: string) {
  let killed = 0
  for (let i = 0; i < n && !isDestroyed(u); i++) killed += applyDamage(u, 1)
  addLog(s, `${u.name}: ${n} смертельн. ран (mortal wound) — ${why}.${killed ? ` Уничтожено моделей: ${killed}.` : ''}`, 'minimal')
}

export interface ResolveResult {
  steps: AttackStep[]
  summary: string
  killed: number
  damage: number
}

/**
 * Full attack sequence for one weapon group: hit → wound → save → damage.
 * Mutates `target` (wounds / destroyed). Every die is recorded.
 */
export function resolveGroup(
  roller: Roller,
  attackerName: string,
  group: AttackGroup,
  target: UnitState,
  ctx: AttackContext,
): ResolveResult {
  const p = group.profile
  const steps: AttackStep[] = []
  let hits = 0
  let autoWounds = 0

  // 1. Hit roll
  if (p.skill === null) {
    hits = group.attacks
    steps.push({ label: 'Попадание', target: 'авто', dice: [], note: `Torrent: все ${group.attacks} атак попадают автоматически.` })
  } else {
    const skill = Math.min(6, Math.max(2, p.skill + ctx.skillWorsen))
    const mod = Math.max(-1, Math.min(1, ctx.hitMod))
    const dice: DieRoll[] = []
    for (let i = 0; i < group.attacks; i++) {
      const v = roller.d6()
      const crit = v === 6
      const success = v !== 1 && (crit || v + mod >= skill)
      if (success && crit && ctx.lethalHits) autoWounds++
      else if (success) hits++
      dice.push({ value: v, success, critical: crit })
    }
    const notes = [
      ctx.skillWorsen ? `укрытие: навык ${p.skill}+ → ${skill}+` : '',
      mod ? `модификатор ${mod > 0 ? '+' : ''}${mod} (${ctx.hitModNotes.join(', ')})` : '',
      ctx.lethalHits && autoWounds ? `Lethal Hits: ${autoWounds} крит. попадания ранят автоматически` : '',
      'натуральная 1 — всегда промах, 6 — критическое попадание',
    ].filter(Boolean)
    steps.push({ label: 'Попадание', target: `${skill}+`, dice, note: notes.join('; ') })
  }

  // 2. Wound roll
  const t = toughness(target)
  const wt = woundTarget(p.s, t)
  let wounds = autoWounds
  const wdice: DieRoll[] = []
  for (let i = 0; i < hits; i++) {
    const v = roller.d6()
    const success = v !== 1 && (v === 6 || v >= wt)
    if (success) wounds++
    wdice.push({ value: v, success, critical: v === 6 })
  }
  steps.push({
    label: 'Ранение',
    target: `${wt}+`,
    dice: wdice,
    note: `Сила ${p.s} против Стойкости ${t}${autoWounds ? `; +${autoWounds} авто-ран.` : ''}`,
  })

  // 3. Saves & 4. damage, one at a time (allocation can change between saves)
  let killed = 0
  let damage = 0
  const sdice: DieRoll[] = []
  let saveNote = ''
  for (let i = 0; i < wounds && !isDestroyed(target); i++) {
    const m = pickModelForDamage(target)!
    const st = saveTarget(m, p.ap, ctx.invulnOverride)
    saveNote = `Спасбросок ${st.kind}: Sv ${profileOf(m).sv}+${p.ap ? `, AP ${p.ap}` : ''} → ${st.need}+`
    const v = roller.d6()
    const saved = v !== 1 && v >= st.need
    sdice.push({ value: v, success: saved })
    if (!saved) {
      const before = m.wounds
      killed += applyDamage(target, p.d, m)
      damage += before - m.wounds
    }
  }
  steps.push({ label: 'Спасбросок', target: saveNote.split('→ ')[1] ?? '—', dice: sdice, note: saveNote || 'Нет ран — спасброски не нужны.' })

  const failed = sdice.filter((d) => !d.success).length
  const summary =
    `${attackerName} — ${group.weaponName}${p.name ? ` (${p.name})` : ''}: ${group.attacks} атак → ${hits + autoWounds} попаданий → ` +
    `${wounds} ран → ${failed} проваленных спасбросков → ${damage} урона (D${p.d}), уничтожено моделей: ${killed}.`
  steps.push({ label: 'Урон', target: `D${p.d}`, dice: [], note: `${damage} урона; уничтожено: ${killed}; в отряде осталось моделей: ${alive(target).length}` })
  return { steps, summary, killed, damage }
}
