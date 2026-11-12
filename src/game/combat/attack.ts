import { avgDie, fmtRandom, rollDie, type Roller } from '../dice/dice'
import { addLog, alive, datasheetOf, isDestroyed, profileOf } from '../gameState'
import type { AttackStep, DieRoll, GameState, ModelState, UnitState, WeaponProfile } from '../types'
import { tr } from '../../i18n/index'

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
  /** re-roll wound rolls: only 1s, or every failed wound (e.g. Implacable Eradication) */
  rerollWounds?: 'ones' | 'all'
  /** Feel No Pain X+: each point of damage is ignored on a D6 of X or more (e.g. Lord of the Machine Cult) */
  fnp?: number
  /** Precision: wounds are allocated to a CHARACTER model of the target first */
  precision?: boolean
  /** why BS/WS is improved (skillWorsen < 0), for the dice log */
  skillNote?: string
  /** unmodified hit roll at or above this is a Critical Hit (default 6; Adrenal Surge, Blitzing Firepower: 5) */
  critHitOn?: number
  /** Snap Shooting (Fire Overwatch): a hit only on an unmodified 6, for every weapon, Psychic ones included */
  snap?: boolean
  /** Precision only for the wounds that come from Critical Hits (Hive Predators) */
  critPrecision?: boolean
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
export function pickModelForDamage(u: UnitState, precision = false): ModelState | undefined {
  const a = alive(u)
  const score = (m: ModelState) => {
    const p = profileOf(m)
    return (p.character ? (precision ? -1000 : 1000) : 0) + (m.wounds < p.w ? 0 : 100) + p.w
  }
  return [...a].sort((x, y) => score(x) - score(y))[0]
}

export function saveTarget(m: ModelState, ap: number, invuln?: number): { need: number; kind: string } {
  const p = profileOf(m)
  const armour = p.sv - ap
  const inv = [p.invuln, invuln].filter((x): x is number => x !== undefined)
  const bestInv = inv.length ? Math.min(...inv) : Infinity
  return bestInv < armour ? { need: bestInv, kind: tr('invulnerable') } : { need: armour, kind: tr('armour') }
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
  addLog(s, tr('{name}: {n} mortal wounds — {why}.{value}', { name: u.name, n, why, value: killed ? tr(' Models destroyed: {killed}.', { killed }) : '' }), 'minimal')
}

export interface ResolveResult {
  steps: AttackStep[]
  summary: string
  killed: number
  damage: number
  /** Repulsor Grid: unmodified 6s rolled on saves by the target against ranged attacks (mortal wounds for the shooter) */
  repulsed: number
}

/** A die a Command Re-roll could change, offered right after it was rolled (one die, never one already re-rolled). */
export type RerollKind = 'attacks' | 'hit' | 'wound' | 'save' | 'damage'
export interface RerollPoint {
  kind: RerollKind
  value: number
  /** who would re-roll it: the attacking side, or the target's side (a saving throw) */
  side: 'attacker' | 'defender'
  /** expected damage the re-roll adds (attacker) or prevents (defender) */
  gain: number
  weapon: string
}
/** Asked after each such die; true → re-roll it now. */
export type RerollHook = (pt: RerollPoint) => boolean

const chance = (ok: (x: number) => boolean) => [1, 2, 3, 4, 5, 6].filter(ok).length / 6
const REROLL_LABEL = tr('Command Re-roll')
/** The standing hit-roll note; the beginner explanation leaves it out (it explains 1 and 6 itself). */
export const NATURAL_ROLL_NOTE = tr('natural 1 always misses, 6 is a critical hit')

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
  reroll?: RerollHook,
): ResolveResult {
  const p = group.profile
  const steps: AttackStep[] = []
  let hits = 0
  let autoWounds = 0
  /** Critical Hits that still roll to wound (not Lethal); rolled first, so the first `critHits` wound dice are theirs */
  let critHits = 0
  const weapon = `${group.weaponName}${p.name ? ` (${p.name})` : ''}`
  const commandRerolls: string[] = []

  // the hit and wound tests, known up front so a re-roll can be priced (Psychic ignores the penalties, keeps bonuses)
  const psy = !!p.keywords.psychic
  const hr = hitRoll(p, ctx)
  const skill = ctx.snap ? 6 : psy ? Math.min(6, Math.max(2, p.skill ?? 2)) : (hr.skill as number)
  const mod = ctx.snap ? 0 : psy ? Math.max(0, hr.mod) : hr.mod
  const critOn = ctx.critHitOn ?? 6
  const passes = (x: number) => x !== 1 && (x >= critOn || x + mod >= skill)
  const t = toughness(target)
  const wt = woundTarget(p.s, t)
  const wmod = ctx.woundMod ?? 0
  const anti = p.keywords.anti && datasheetOf(target).keywords.includes(p.keywords.anti.keyword) ? p.keywords.anti.roll : 7
  const wins = (x: number) => x !== 1 && (x === 6 || x >= anti || x + wmod >= wt)
  /** expected damage of one more wound, one more hit, one more attack (against the model that would take it now) */
  const avgDmg = Math.max(1, p.d + avgDie(p.randomD) + (ctx.damageMod ?? 0))
  const saveChance = (m: ModelState) => chance((x) => x !== 1 && x >= saveTarget(m, p.ap, ctx.invulnOverride).need)
  const perWound = () => {
    const m = isDestroyed(target) ? undefined : pickModelForDamage(target, ctx.precision)
    return m ? (1 - saveChance(m)) * Math.min(avgDmg, m.wounds) : 0
  }
  const perHit = () => chance(wins) * perWound()
  const perAttack = () => (p.skill === null ? 1 : chance(passes)) * perHit()
  /** offer the die to the hook; returns the re-rolled value, or null when kept */
  const offer = (kind: RerollKind, value: number, side: RerollPoint['side'], gain: number, again: () => number): number | null => {
    if (!reroll || gain <= 0 || !reroll({ kind, value, side, gain, weapon })) return null
    const v = again()
    commandRerolls.push(`${REROLL_LABEL}: ${value} → ${v}`)
    return v
  }

  // 0. Random number of attacks (e.g. D3+3): one roll per model with that weapon
  let attacks = group.attacks
  if (p.randomA && group.randomAttacks) {
    const rolls: DieRoll[] = Array.from({ length: group.randomAttacks }, () => {
      const v = rollDie(roller, p.randomA!)
      const again = offer('attacks', v, 'attacker', (avgDie(p.randomA) - v) * perAttack(), () => rollDie(roller, p.randomA!))
      return again === null ? { value: v, success: true } : { value: again, success: true, rerolledFrom: v }
    })
    attacks += rolls.reduce((a, b) => a + b.value, 0)
    steps.push({ meta: { kind: 'attacks' }, label: tr('Attacks'), target: fmtRandom(p.attacks, p.randomA), dice: rolls, note: tr('Random number of attacks ({fmtRandom}): {attacks} in total.{value}', { fmtRandom: fmtRandom(p.attacks, p.randomA), attacks, value: commandRerolls.length ? ` ${commandRerolls.join('; ')}.` : '' }) })
  }

  // 1. Hit roll
  const sustained = group.sustainedHits ?? p.keywords.sustainedHits ?? 0
  let sustainedHitsGained = 0
  let rerolls = 0
  if (p.skill === null) {
    hits = attacks
    steps.push({ meta: { kind: 'hit', auto: true }, label: tr('Hit'), target: tr('auto'), dice: [], note: tr('Torrent: all {attacks} attacks hit automatically.', { attacks }) })
  } else {
    const dice: DieRoll[] = []
    const before = commandRerolls.length
    for (let i = 0; i < attacks; i++) {
      let v = roller.d6()
      let from: number | undefined
      if ((ctx.rerollHits === 'ones' && v === 1) || (ctx.rerollHits === 'all' && !passes(v))) {
        from = v
        v = roller.d6()
        rerolls++
      }
      if (from === undefined && !passes(v)) {
        const again = offer('hit', v, 'attacker', chance(passes) * perHit(), () => roller.d6())
        if (again !== null) { from = v; v = again }
      }
      const crit = v >= critOn
      const success = passes(v)
      if (success && crit && ctx.lethalHits) autoWounds++
      else if (success) {
        hits++
        if (crit) critHits++
      }
      if (success && crit && sustained) { hits += sustained; sustainedHitsGained += sustained }
      dice.push({ value: v, success, critical: crit, ...(from !== undefined ? { rerolledFrom: from } : {}) })
    }
    const notes = [
      ctx.snap ? tr('snap shooting: hits only on a “6”') : '',
      ctx.skillWorsen > 0 && !psy && !ctx.snap ? tr('cover: skill {skill}+ → {skill2}+', { skill: p.skill, skill2: skill }) : '',
      ctx.skillWorsen < 0 ? tr('{value}: skill {skill}+ → {skill2}+', { value: ctx.skillNote ?? tr('bonus'), skill: p.skill, skill2: skill }) : '',
      psy && ctx.skillWorsen > 0 && !ctx.snap ? tr('Psychic: cover and to-hit penalties are ignored') : '',
      mod ? tr('modifier {value}{mod} ({list})', { value: mod > 0 ? '+' : '', mod, list: ctx.hitModNotes.join(', ') }) : '',
      rerolls ? tr('re-roll ({value}): {rerolls}', { value: ctx.rerollHits === 'all' ? tr('all misses') : tr('1s'), rerolls }) : '',
      ...commandRerolls.slice(before),
      ctx.lethalHits && autoWounds ? tr('Lethal Hits: {autoWounds} critical hits wound automatically', { autoWounds }) : '',
      sustainedHitsGained ? tr('Sustained Hits: +{sustainedHitsGained} extra hits', { sustainedHitsGained }) : '',
      NATURAL_ROLL_NOTE,
    ].filter(Boolean)
    steps.push({ meta: { kind: 'hit' }, label: tr('Hit'), target: `${skill}+`, dice, note: notes.join('; ') })
  }

  // 2. Wound roll (Twin-linked re-rolls failures; Anti-X makes high unmodified rolls critical wounds)
  const woundRerollsBefore = commandRerolls.length
  let wounds = autoWounds
  /** wounds that came from Critical Hits: Lethal Hits first, then those of the first `critHits` wound dice */
  let critWounds = autoWounds
  let devWounds = 0
  let woundRerolls = 0
  const wdice: DieRoll[] = []
  for (let i = 0; i < hits; i++) {
    let v = roller.d6()
    let from: number | undefined
    if (!wins(v) && (p.keywords.twinLinked || ctx.rerollWounds === 'all' || (ctx.rerollWounds === 'ones' && v === 1))) {
      from = v
      v = roller.d6()
      woundRerolls++
    }
    if (from === undefined && !wins(v)) {
      const again = offer('wound', v, 'attacker', chance(wins) * perWound(), () => roller.d6())
      if (again !== null) { from = v; v = again }
    }
    const crit = v === 6 || v >= anti
    const success = wins(v)
    if (success) {
      if (crit && p.keywords.devastatingWounds) devWounds++
      else {
        wounds++
        if (i < critHits) critWounds++
      }
    }
    wdice.push({ value: v, success, critical: crit, ...(from !== undefined ? { rerolledFrom: from } : {}) })
  }
  steps.push({
    meta: { kind: 'wound', ...(autoWounds ? { auto: true } : {}) },
    label: tr('Wound'),
    target: `${wt}+`,
    dice: wdice,
    note: tr('Strength {s} vs Toughness {t}{value}{value2}{value3}{value4}{value5}{value6}', { s: p.s, t, value: wmod ? tr('; modifier {wmod} ({woundModNote})', { wmod, woundModNote: ctx.woundModNote }) : '', value2: autoWounds ? tr('; +{autoWounds} auto-wounds.', { autoWounds }) : '', value3: woundRerolls ? tr('; Twin-linked: re-rolls {woundRerolls}', { woundRerolls }) : '', value4: anti < 7 ? `; Anti-${p.keywords.anti!.keyword} ${anti}+` : '', value5: devWounds ? tr('; Devastating Wounds: {devWounds} critical wounds = mortal wounds with no save', { devWounds }) : '', value6: commandRerolls.length > woundRerollsBefore ? `; ${commandRerolls.slice(woundRerollsBefore).join('; ')}` : '' }),
  })

  // 3. Saves & 4. damage, one at a time (allocation can change between saves)
  let killed = 0
  let damage = 0
  const sdice: DieRoll[] = []
  const ddice: DieRoll[] = []
  const fdice: DieRoll[] = []
  let saveNote = ''
  let saveRerolled = false
  let repulsed = 0
  const grid = p.range !== 'melee' && datasheetOf(target).abilities.includes('repulsorGrid')
  /** Feel No Pain: roll for every point of damage, returns the damage that goes through */
  const throughFnp = (n: number) => {
    if (!ctx.fnp) return n
    let left = n
    for (let k = 0; k < n; k++) {
      const v = roller.d6()
      const ok = v >= ctx.fnp
      fdice.push({ value: v, success: ok })
      if (ok) left--
    }
    return left
  }
  for (let i = 0; i < wounds && !isDestroyed(target); i++) {
    const m = pickModelForDamage(target, ctx.precision || (!!ctx.critPrecision && i < critWounds))!
    const st = saveTarget(m, p.ap, ctx.invulnOverride)
    saveNote = tr('Save {kind}: Sv {sv}+{value} → {need}+', { kind: st.kind, sv: profileOf(m).sv, value: p.ap ? `, AP ${p.ap}` : '', need: st.need })
    let v = roller.d6()
    let from: number | undefined
    if (v === 1 || v < st.need) {
      const again = offer('save', v, 'defender', saveChance(m) * Math.min(avgDmg, m.wounds), () => roller.d6())
      if (again !== null) { from = v; v = again; saveRerolled = true }
    }
    const saved = v !== 1 && v >= st.need
    sdice.push({ value: v, success: saved, ...(from !== undefined ? { rerolledFrom: from } : {}) })
    if (grid && v === 6) repulsed++
    if (!saved) {
      const before = m.wounds
      let dmg = p.d
      if (p.randomD) {
        let v = rollDie(roller, p.randomD)
        const flat = p.d + (ctx.damageMod ?? 0)
        const dealt = (x: number) => Math.min(m.wounds, Math.max(1, flat + x))
        const faces = p.randomD === 'D3' ? [1, 1, 2, 2, 3, 3] : [1, 2, 3, 4, 5, 6]
        const gain = faces.reduce((a, x) => a + dealt(x), 0) / 6 - dealt(v)
        const again = offer('damage', v, 'attacker', gain, () => rollDie(roller, p.randomD!))
        ddice.push(again === null ? { value: v, success: true } : { value: again, success: true, rerolledFrom: v })
        if (again !== null) v = again
        dmg += v
      }
      dmg = throughFnp(Math.max(1, dmg + (ctx.damageMod ?? 0)))
      killed += dmg > 0 ? applyDamage(target, dmg, m) : 0
      damage += before - m.wounds
    }
  }
  steps.push({ meta: { kind: 'save' }, label: tr('Save|alt'), target: saveNote.split('→ ')[1] ?? '—', dice: sdice, note: (saveNote || tr('No wounds — no saves needed.')) + (saveRerolled ? tr('; defender’s {REROLL_LABEL}', { REROLL_LABEL }) : '') })

  // Devastating Wounds: each critical wound is a number of mortal wounds equal to D, after normal damage
  for (let i = 0; i < devWounds && !isDestroyed(target); i++) {
    let mw = p.d
    if (p.randomD) {
      const v = rollDie(roller, p.randomD)
      ddice.push({ value: v, success: true })
      mw += v
    }
    mw = throughFnp(mw)
    for (let k = 0; k < mw && !isDestroyed(target); k++) {
      const before = target.models.reduce((a, m) => a + m.wounds, 0)
      killed += applyDamage(target, 1)
      damage += before - target.models.reduce((a, m) => a + m.wounds, 0)
    }
  }

  const failed = sdice.filter((d) => !d.success).length
  const summary =
    tr('{attackerName} — {weaponName}{value}: {attacks} attacks → {value2} hits → ', { attackerName, weaponName: group.weaponName, value: p.name ? ` (${p.name})` : '', attacks, value2: hits + autoWounds }) +
    tr('{wounds} wounds → {failed} failed saves → {damage} damage (D{fmtRandom}), models destroyed: {killed}.', { wounds, failed, damage, fmtRandom: fmtRandom(p.d, p.randomD), killed }) +
    (devWounds ? tr(' Devastating Wounds: {devWounds} critical wounds → mortal wounds.', { devWounds }) : '')
  steps.push({
    meta: { kind: 'damage' },
    label: tr('Damage'),
    target: `D${fmtRandom(p.d, p.randomD)}`,
    dice: ddice,
    note: tr('{value}{damage} damage; destroyed: {killed}; models left in the unit: {length}', { value: ctx.damageMod ? tr('damage {damageMod} (Dread \'Ard), not less than 1; ', { damageMod: ctx.damageMod }) : '', damage, killed, length: alive(target).length }),
  })
  if (fdice.length) steps.push({ meta: { kind: 'fnp' }, label: 'Feel No Pain', target: `${ctx.fnp}+`, dice: fdice, note: tr('Each lost wound is cancelled on {fnp}+ (“Feel No Pain”): {length} of {length2} cancelled.', { fnp: ctx.fnp, length: fdice.filter((d) => d.success).length, length2: fdice.length }) })
  return { steps, summary, killed, damage, repulsed }
}
