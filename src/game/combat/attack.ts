import { fmtRandom, rollDie, type Roller } from '../dice/dice'
import { addLog, alive, datasheetOf, isDestroyed, profileOf } from '../gameState'
import type { AttackStep, DieRoll, GameState, ModelState, UnitState, WeaponProfile } from '../types'

export interface AttackGroup {
  weaponName: string
  profile: WeaponProfile
  /** number of models firing / swinging this weapon */
  models: number
  /** fixed attacks after Rapid Fire / Blast / Cleave */
  attacks: number
  /** models whose weapon adds a random number of attacks (profile.randomA), rolled at resolution */
  randomAttacks?: number
  /** extra hits on a critical hit (Sustained Hits X from the weapon, or a conditional ability like Bladestorm) */
  sustainedHits?: number
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
  /** wound-roll modifier (e.g. Duty Eternal −1) */
  woundMod?: number
  woundModNote?: string
  /** damage modifier per attack, result never below 1 (e.g. Dread 'Ard −1) */
  damageMod?: number
  /** re-roll hit rolls: only 1s, or every failed hit (e.g. Swift Demise, Whirling Onslaught) */
  rerollHits?: 'ones' | 'all'
}

export function woundTarget(s: number, t: number): number {
  if (s >= 2 * t) return 2
  if (s > t) return 3
  if (s === t) return 4
  if (s * 2 <= t) return 6
  return 5
}

export const toughness = (u: UnitState) => Math.max(...alive(u).map((m) => profileOf(m).t))

/** Hit roll target after cover, and the hit modifier capped to ±1. */
export const hitRoll = (p: WeaponProfile, ctx: AttackContext) => ({
  skill: p.skill === null ? null : Math.min(6, Math.max(2, p.skill + ctx.skillWorsen)),
  mod: Math.max(-1, Math.min(1, ctx.hitMod)),
})

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

  // 0. Random number of attacks (e.g. D3+3): one roll per model with that weapon
  let attacks = group.attacks
  if (p.randomA && group.randomAttacks) {
    const rolls = Array.from({ length: group.randomAttacks }, () => rollDie(roller, p.randomA!))
    attacks += rolls.reduce((a, b) => a + b, 0)
    steps.push({ label: 'Атаки', target: fmtRandom(p.attacks, p.randomA), dice: rolls.map((v) => ({ value: v, success: true })), note: `Случайное число атак (${fmtRandom(p.attacks, p.randomA)}): итого ${attacks}.` })
  }

  // 1. Hit roll
  const sustained = group.sustainedHits ?? p.keywords.sustainedHits ?? 0
  let sustainedHitsGained = 0
  let rerolls = 0
  if (p.skill === null) {
    hits = attacks
    steps.push({ label: 'Попадание', target: 'авто', dice: [], note: `Torrent: все ${attacks} атак попадают автоматически.` })
  } else {
    // Psychic: modifiers to BS/WS and to the hit roll may be ignored (we ignore the penalties, keep bonuses)
    const psy = !!p.keywords.psychic
    const hr = hitRoll(p, ctx)
    const skill = psy ? Math.min(6, Math.max(2, p.skill)) : (hr.skill as number)
    const mod = psy ? Math.max(0, hr.mod) : hr.mod
    const passes = (x: number) => x !== 1 && (x === 6 || x + mod >= skill)
    const dice: DieRoll[] = []
    for (let i = 0; i < attacks; i++) {
      let v = roller.d6()
      let from: number | undefined
      if ((ctx.rerollHits === 'ones' && v === 1) || (ctx.rerollHits === 'all' && !passes(v))) {
        from = v
        v = roller.d6()
        rerolls++
      }
      const crit = v === 6
      const success = passes(v)
      if (success && crit && ctx.lethalHits) autoWounds++
      else if (success) hits++
      if (success && crit && sustained) { hits += sustained; sustainedHitsGained += sustained }
      dice.push({ value: v, success, critical: crit, ...(from !== undefined ? { rerolledFrom: from } : {}) })
    }
    const notes = [
      ctx.skillWorsen && !psy ? `укрытие: навык ${p.skill}+ → ${skill}+` : '',
      psy && ctx.skillWorsen ? 'Psychic: укрытие и штрафы к попаданию игнорируются' : '',
      mod ? `модификатор ${mod > 0 ? '+' : ''}${mod} (${ctx.hitModNotes.join(', ')})` : '',
      rerolls ? `переброс (${ctx.rerollHits === 'all' ? 'все промахи' : 'единицы'}): ${rerolls}` : '',
      ctx.lethalHits && autoWounds ? `Lethal Hits: ${autoWounds} крит. попадания ранят автоматически` : '',
      sustainedHitsGained ? `Sustained Hits: +${sustainedHitsGained} доп. попаданий` : '',
      'натуральная 1 — всегда промах, 6 — критическое попадание',
    ].filter(Boolean)
    steps.push({ label: 'Попадание', target: `${skill}+`, dice, note: notes.join('; ') })
  }

  // 2. Wound roll (Twin-linked re-rolls failures; Anti-X makes high unmodified rolls critical wounds)
  const t = toughness(target)
  const wt = woundTarget(p.s, t)
  const wmod = ctx.woundMod ?? 0
  const anti = p.keywords.anti && datasheetOf(target).keywords.includes(p.keywords.anti.keyword) ? p.keywords.anti.roll : 7
  let wounds = autoWounds
  let devWounds = 0
  let woundRerolls = 0
  const wdice: DieRoll[] = []
  const wins = (x: number) => x !== 1 && (x === 6 || x >= anti || x + wmod >= wt)
  for (let i = 0; i < hits; i++) {
    let v = roller.d6()
    let from: number | undefined
    if (!wins(v) && p.keywords.twinLinked) {
      from = v
      v = roller.d6()
      woundRerolls++
    }
    const crit = v === 6 || v >= anti
    const success = wins(v)
    if (success) {
      if (crit && p.keywords.devastatingWounds) devWounds++
      else wounds++
    }
    wdice.push({ value: v, success, critical: crit, ...(from !== undefined ? { rerolledFrom: from } : {}) })
  }
  steps.push({
    label: 'Ранение',
    target: `${wt}+`,
    dice: wdice,
    note: `Сила ${p.s} против Стойкости ${t}${wmod ? `; модификатор ${wmod} (${ctx.woundModNote})` : ''}${autoWounds ? `; +${autoWounds} авто-ран.` : ''}${woundRerolls ? `; Twin-linked: перебросов ${woundRerolls}` : ''}${anti < 7 ? `; Anti-${p.keywords.anti!.keyword} ${anti}+` : ''}${devWounds ? `; Devastating Wounds: ${devWounds} крит. ран = смертельные раны без спасброска` : ''}`,
  })

  // 3. Saves & 4. damage, one at a time (allocation can change between saves)
  let killed = 0
  let damage = 0
  const sdice: DieRoll[] = []
  const ddice: DieRoll[] = []
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
      let dmg = p.d
      if (p.randomD) {
        const v = rollDie(roller, p.randomD)
        ddice.push({ value: v, success: true })
        dmg += v
      }
      dmg = Math.max(1, dmg + (ctx.damageMod ?? 0))
      killed += applyDamage(target, dmg, m)
      damage += before - m.wounds
    }
  }
  steps.push({ label: 'Спасбросок', target: saveNote.split('→ ')[1] ?? '—', dice: sdice, note: saveNote || 'Нет ран — спасброски не нужны.' })

  // Devastating Wounds: each critical wound is a number of mortal wounds equal to D, after normal damage
  for (let i = 0; i < devWounds && !isDestroyed(target); i++) {
    let mw = p.d
    if (p.randomD) {
      const v = rollDie(roller, p.randomD)
      ddice.push({ value: v, success: true })
      mw += v
    }
    for (let k = 0; k < mw && !isDestroyed(target); k++) {
      const before = target.models.reduce((a, m) => a + m.wounds, 0)
      killed += applyDamage(target, 1)
      damage += before - target.models.reduce((a, m) => a + m.wounds, 0)
    }
  }

  const failed = sdice.filter((d) => !d.success).length
  const summary =
    `${attackerName} — ${group.weaponName}${p.name ? ` (${p.name})` : ''}: ${attacks} атак → ${hits + autoWounds} попаданий → ` +
    `${wounds} ран → ${failed} проваленных спасбросков → ${damage} урона (D${fmtRandom(p.d, p.randomD)}), уничтожено моделей: ${killed}.` +
    (devWounds ? ` Devastating Wounds: ${devWounds} крит. ран → смертельные раны.` : '')
  steps.push({
    label: 'Урон',
    target: `D${fmtRandom(p.d, p.randomD)}`,
    dice: ddice,
    note: `${ctx.damageMod ? `урон ${ctx.damageMod} (Dread 'Ard), не меньше 1; ` : ''}${damage} урона; уничтожено: ${killed}; в отряде осталось моделей: ${alive(target).length}`,
  })
  return { steps, summary, killed, damage }
}
