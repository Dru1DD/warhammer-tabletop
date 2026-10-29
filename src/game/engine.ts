// Rules engine: the single source of truth for legality and outcomes.
// validate(state, cmd) never mutates; apply(state, cmd, roller) returns a new state.

import { FACTION_NAME } from './data/datasheets'
import { rollDie, rollMany, type Roller } from './dice/dice'
import { dist, withinRange, EPS, add, sub, scale, len } from './geometry/geometry'
import {
  addLog, alive, atHalfStrength, CHARGE_RANGE, checkCoherency, CONSOLIDATE, engagedUnits, ENGAGEMENT_RANGE,
  enemiesOf, findUnit, fmt, hasAbility, isDestroyed, isEngaged, isMV, modelDistance, modelEngagedWith,
  other, PILE_IN, profileOf, radiusOf, unitDistance, unitNearObjective, unitsOf,
  updateObjectiveControl, weaponsOf, OBJECTIVE_MARKER_MM,
} from './gameState'
import { applyMortalWounds, resolveGroup, type AttackContext, type AttackGroup } from './combat/attack'
import { moveProblem, planMove } from './rules/movement'
import { hasCover, visibleTargets } from './rules/visibility'
import { baseRadius } from './geometry/geometry'
import type { Command, DiceEntry, GameState, ModelState, Phase, PlayerId, UnitState, Validation, Vec, WeaponProfile } from './types'
import { PHASES } from './types'

export const PHASE_NAME: Record<Phase, string> = {
  command: 'Фаза командования (Command)',
  movement: 'Фаза движения (Movement)',
  shooting: 'Фаза стрельбы (Shooting)',
  charge: 'Фаза атаки (Charge)',
  fight: 'Фаза боя (Fight)',
}

export const VP_PER_OBJECTIVE = 5

const fail = (reason: string): Validation => ({ ok: false, reason })
const OK: Validation = { ok: true }

/** Player who must make the next decision. */
export function actor(s: GameState): PlayerId {
  if (s.phase === 'fight' && s.fight) return s.fight.selecting
  return s.activePlayer
}

const riled = (s: GameState, u: UnitState) => hasAbility(u, 'waaagh') && s.players[u.owner].riledTurns > 0

/** Lethal Hits marked "non-MONSTER/VEHICLE" (and Tactical Precision) don't work against M/V targets. */
const lethalVs = (p: WeaponProfile, attacker: UnitState, target: UnitState) => {
  const k = p.keywords.lethalHits
  const kw = k === true || (k === 'nonMV' && !isMV(target))
  return kw || (hasAbility(attacker, 'tacticalPrecision') && !isMV(target))
}

/** Defensive abilities of the target that modify the wound roll / damage. */
function defenceMods(p: WeaponProfile, target: UnitState) {
  const t = Math.max(...alive(target).map((m) => profileOf(m).t))
  const duty = hasAbility(target, 'dutyEternal') && p.s > t
  return {
    woundMod: duty ? -1 : 0,
    woundModNote: duty ? 'Duty Eternal: сила больше стойкости' : undefined,
    damageMod: hasAbility(target, 'dreadArd') ? -1 : 0,
  }
}

// ---------------------------------------------------------------- shooting

export interface ShootPlan {
  groups: (AttackGroup & { ctx: AttackContext })[]
  firingModels: ModelState[]
  hazardousModels: number
  skipped: string[]
  cover: boolean
  problem: string | null
}

export function shootPlan(
  s: GameState,
  unit: UnitState,
  target: UnitState,
  opts: { profiles?: Record<string, number>; usePistols?: boolean; useAmmoRunts?: boolean } = {},
): ShootPlan {
  const plan: ShootPlan = { groups: [], firingModels: [], hazardousModels: 0, skipped: [], cover: false, problem: null }
  const engaged = isEngaged(s, unit)
  const advanced = unit.move === 'advance'
  const assaultAll = riled(s, unit)
  const mv = isMV(unit)
  if (engaged && advanced) return { ...plan, problem: 'Отряд продвинулся (Advance) и находится в контакте — стрелять нельзя.' }
  if (engaged && !engagedUnits(s, unit).some((e) => e.id === target.id))
    return { ...plan, problem: mv
      ? 'Техника в контакте с врагом стреляет только по отряду, с которым она в контакте.'
      : 'Отряд в контакте с врагом: стрелять можно только из оружия ближнего боя (Close-quarters) и только по отряду, с которым он в контакте.' }

  const byKey = new Map<string, AttackGroup & { ctx: AttackContext }>()
  let anyVisible = false
  let closest = Infinity
  for (const m of alive(unit)) {
    const ranged = weaponsOf(m).filter((w) => w.profiles[0].range !== 'melee')
    const cq = ranged.filter((w) => w.profiles[0].keywords.closeQuarters)
    const main = ranged.filter((w) => !w.profiles[0].keywords.closeQuarters)
    // close-quarters shooting (10.06): MONSTER/VEHICLE may use any non-Blast ranged weapon
    let chosen = engaged && mv
      ? ranged.filter((w) => !w.profiles[Math.min(opts.profiles?.[w.id] ?? 0, w.profiles.length - 1)].keywords.blast)
      : engaged || opts.usePistols || main.length === 0 ? cq : main
    if (advanced && !engaged) {
      const before = chosen.length
      chosen = chosen.filter((w) => assaultAll || w.profiles[opts.profiles?.[w.id] ?? 0].keywords.assault)
      if (before > chosen.length) plan.skipped.push(`${profileOf(m).name}: после продвижения (Advance) стреляет только оружие Assault.`)
    }
    const vis = visibleTargets(s, m, target)
    if (vis.length === 0) {
      if (chosen.length) plan.skipped.push(`${profileOf(m).name}: нет линии видимости до цели.`)
      continue
    }
    anyVisible = true
    const d = Math.min(...vis.map((t) => modelDistance(m, t)))
    closest = Math.min(closest, d)
    let fired = false
    for (const w of chosen) {
      const idx = Math.min(opts.profiles?.[w.id] ?? 0, w.profiles.length - 1)
      const p = w.profiles[idx]
      const range = p.range as number
      if (!withinRange(d, range)) {
        plan.skipped.push(`${profileOf(m).name}: ${w.name} — цель на ${fmt(d)}", дальность ${range}".`)
        continue
      }
      fired = true
      if (p.keywords.hazardous) plan.hazardousModels++
      const key = `${w.id}:${idx}`
      let g = byKey.get(key)
      if (!g) {
        g = { weaponName: w.name, profile: p, models: 0, attacks: 0, randomAttacks: 0, notes: [], ctx: { hitMod: 0, hitModNotes: [], skillWorsen: 0, lethalHits: false } }
        byKey.set(key, g)
      }
      g.models++
      if (p.randomA) g.randomAttacks = (g.randomAttacks ?? 0) + 1
      let a = p.attacks
      if (p.keywords.rapidFire && withinRange(d, range / 2)) {
        a += p.keywords.rapidFire
        if (!g.notes.includes('Rapid Fire')) g.notes.push('Rapid Fire')
      }
      if (p.keywords.blast) {
        const extra = p.keywords.blast * Math.floor(alive(target).length / 5)
        a += extra
        if (extra && !g.notes.includes('Blast')) g.notes.push('Blast')
      }
      g.attacks += a
    }
    if (fired) plan.firingModels.push(m)
  }

  if (!anyVisible) return { ...plan, problem: 'Цель не видна: линию видимости (line of sight) перекрывает укрытие.' }
  if (byKey.size === 0)
    return { ...plan, problem: plan.skipped.length && closest < Infinity ? `Нет оружия, способного стрелять: ближайшая видимая модель цели на ${fmt(closest)}". ${plan.skipped[0]}` : 'Нет подходящего оружия.' }

  plan.cover = hasCover(s, plan.firingModels, target)
  const bolter = hasAbility(unit, 'boltDiscipline') && s.objectives.some((o) => unitNearObjective(unit, o) || unitNearObjective(target, o))
  const runts = !!opts.useAmmoRunts && hasAbility(unit, 'ammoRunts') && !unit.ammoRuntsUsed
  for (const g of byKey.values()) {
    const notes: string[] = []
    let hitMod = 0
    if (g.profile.keywords.heavy && !engaged && unit.movedDistance <= 3 + EPS) { notes.push('Heavy +1'); hitMod++ }
    if (bolter) { notes.push('Болтерная дисциплина +1'); hitMod++ }
    if (runts) { notes.push('Гроты-подносчики +1'); hitMod++ }
    if (engaged && mv && !g.profile.keywords.closeQuarters) { notes.push('техника в контакте −1'); hitMod-- }
    g.ctx = {
      hitMod,
      hitModNotes: notes,
      skillWorsen: plan.cover ? 1 : 0,
      lethalHits: lethalVs(g.profile, unit, target),
      invulnOverride: riled(s, target) ? 5 : undefined,
      ...defenceMods(g.profile, target),
    }
    plan.groups.push(g)
  }
  return plan
}

// ---------------------------------------------------------------- melee

export function meleePlan(s: GameState, unit: UnitState, target: UnitState) {
  const groups: (AttackGroup & { ctx: AttackContext })[] = []
  const byKey = new Map<string, AttackGroup & { ctx: AttackContext }>()
  for (const m of alive(unit)) {
    if (!modelEngagedWith(m, target)) continue
    const w = weaponsOf(m).find((x) => x.profiles[0].range === 'melee')
    if (!w) continue
    // Targeted Intercession: +1 S and +1 AP after charging
    const boost = hasAbility(unit, 'targetedIntercession') && unit.charged
    const p = boost ? { ...w.profiles[0], s: w.profiles[0].s + 1, ap: w.profiles[0].ap - 1 } : w.profiles[0]
    let g = byKey.get(w.id)
    if (!g) {
      g = {
        weaponName: w.name, profile: p, models: 0, attacks: 0, randomAttacks: 0, notes: boost ? ['Targeted Intercession +1 S/AP'] : [],
        ctx: {
          hitMod: 0, hitModNotes: [], skillWorsen: 0,
          lethalHits: lethalVs(p, unit, target) || (hasAbility(unit, 'tideOfMuscle') && unit.charged),
          invulnOverride: riled(s, target) ? 5 : undefined,
          ...defenceMods(p, target),
        },
      }
      byKey.set(w.id, g)
      groups.push(g)
    }
    g.models++
    if (p.randomA) g.randomAttacks = (g.randomAttacks ?? 0) + 1
    g.attacks += p.attacks + (p.keywords.cleave ? p.keywords.cleave * Math.floor(alive(target).length / 5) : 0)
  }
  return groups
}

// ---------------------------------------------------------------- charge

export function chargeTargetsFor(s: GameState, unit: UnitState, roll: number) {
  if (roll <= 2) return []
  return enemiesOf(s, unit).filter((e) => {
    const d = unitDistance(unit, e)
    return withinRange(d, CHARGE_RANGE) && withinRange(d, roll)
  })
}

function planCharge(s: GameState, unit: UnitState, targets: UnitState[], roll: number): Record<string, Vec> | null {
  const tModels = targets.flatMap(alive)
  const ids = targets.map((t) => t.id)
  const closest = (m: ModelState) => tModels.reduce((b, t) => (dist(m.pos, t.pos) < dist(m.pos, b.pos) ? t : b))
  const good = (pos: Record<string, Vec>) =>
    !moveProblem(s, unit, pos, roll, 'charge', ids) &&
    targets.every((t) => alive(unit).some((m) => modelEngagedWith(m, t, pos[m.id] ?? m.pos)))
  const p1 = planMove(s, unit, (m) => ({ pos: closest(m).pos, radius: radiusOf(closest(m)) }), roll, 'charge', ids)
  if (good(p1)) return p1
  // fallback: translate the whole unit toward the nearest target model
  const lead = [...alive(unit)].sort((a, b) => dist(a.pos, closest(a).pos) - dist(b.pos, closest(b).pos))[0]
  const tgt = closest(lead)
  const v = sub(tgt.pos, lead.pos)
  const need = Math.max(0, len(v) - radiusOf(lead) - radiusOf(tgt))
  for (const k of [1, 0.98, 0.95, 0.9, 0.85, 0.8]) {
    const step = Math.min(roll, need) * k
    const delta = scale(v, step / len(v))
    const pos: Record<string, Vec> = {}
    for (const m of alive(unit)) pos[m.id] = add(m.pos, delta)
    if (good(pos)) return pos
  }
  return null
}

// ---------------------------------------------------------------- validation

export function validate(s: GameState, cmd: Command): Validation {
  if (s.winner) return fail('Битва окончена.')
  const who = actor(s)
  if (s.pendingCharge && cmd.type !== 'chargeMove' && cmd.type !== 'skipCharge')
    return fail('Сначала завершите объявленную атаку (charge): выберите цели или откажитесь от перемещения.')

  if (cmd.type === 'endPhase') {
    if (s.phase === 'fight' && s.fight) return fail('В фазе боя ещё есть отряды, которые должны сражаться.')
    return OK
  }
  if (cmd.type === 'callWaaagh') {
    if (s.activePlayer !== 'orks') return fail('Waaagh! может объявить только игрок Орков в свой ход.')
    if (s.phase !== 'command') return fail('«Боевой клич» объявляется в фазе командования.')
    if (s.players.orks.waaaghUsed) return fail('Waaagh! уже был объявлен в этой битве (раз за битву).')
    return OK
  }

  const unit = findUnit(s, cmd.unitId)
  if (!unit || isDestroyed(unit)) return fail('Отряд не найден или уничтожен.')
  if (unit.owner !== who) return fail(`Сейчас решение принимает ${FACTION_NAME[who]}.`)

  switch (cmd.type) {
    case 'declareAdvance':
    case 'move': {
      if (s.phase !== 'movement') return fail('Двигаться можно только в фазе движения.')
      if (unit.move !== 'none') return fail('Отряд уже двигался в этой фазе.')
      const engaged = isEngaged(s, unit)
      if (cmd.type === 'declareAdvance') {
        if (engaged) return fail('Отряд в контакте с врагом: можно только отступить (Fall Back) или остаться на месте.')
        if (unit.advanceRoll !== null) return fail('Продвижение уже объявлено.')
        return OK
      }
      if (cmd.mode === 'fallBack' && !engaged) return fail('Отступление (Fall Back) возможно только для отряда в контакте с врагом.')
      if (cmd.mode !== 'fallBack' && engaged) return fail('Отряд в контакте с врагом: обычное движение невозможно, только отступление (Fall Back).')
      if (cmd.mode === 'advance' && unit.advanceRoll === null) return fail('Сначала объявите продвижение и бросьте D6.')
      if (cmd.mode !== 'advance' && unit.advanceRoll !== null) return fail('Продвижение уже объявлено — двигайтесь в режиме продвижения.')
      const m = Math.min(...alive(unit).map((x) => profileOf(x).m))
      const max = cmd.mode === 'advance' ? m + (unit.advanceRoll ?? 0) : m
      const p = moveProblem(s, unit, cmd.positions, max, cmd.mode)
      return p ? fail(p) : OK
    }
    case 'rerollAdvance':
      if (unit.advanceRoll === null || unit.move !== 'none') return fail('Нет броска продвижения для переброса.')
      if (!hasAbility(unit, 'waaagh')) return fail('Переброс продвижения даёт только правило Waaagh!.')
      if (unit.advanceRerolled) return fail('Кубик нельзя перебрасывать больше одного раза.')
      return OK
    case 'shoot': {
      if (s.phase !== 'shooting') return fail('Стрелять можно только в фазе стрельбы.')
      if (unit.shot) return fail('Отряд уже стрелял в этой фазе.')
      if (unit.move === 'fallBack') return fail('Отряд отступил (Fall Back) в этот ход и не может стрелять.')
      const target = findUnit(s, cmd.targetId)
      if (!target || isDestroyed(target) || target.owner === unit.owner) return fail('Недопустимая цель.')
      const plan = shootPlan(s, unit, target, cmd)
      return plan.problem ? fail(plan.problem) : OK
    }
    case 'declareCharge': {
      if (s.phase !== 'charge') return fail('Атаку (charge) объявляют в фазе атаки.')
      if (unit.chargeDeclared) return fail('Отряд уже объявлял атаку в этой фазе.')
      if (isEngaged(s, unit)) return fail('Отряд уже в контакте с врагом.')
      if (unit.move === 'fallBack') return fail('Отряд отступил (Fall Back) в этот ход и не может атаковать.')
      if (unit.move === 'advance' && !riled(s, unit)) return fail('Отряд продвинулся (Advance) в этот ход и не может атаковать.')
      const near = enemiesOf(s, unit).filter((e) => withinRange(unitDistance(unit, e), CHARGE_RANGE))
      if (near.length === 0) {
        const d = Math.min(...enemiesOf(s, unit).map((e) => unitDistance(unit, e)))
        return fail(`Нет врагов в пределах ${CHARGE_RANGE}" (ближайший — ${fmt(d)}").`)
      }
      return OK
    }
    case 'chargeMove':
    case 'skipCharge': {
      if (!s.pendingCharge || s.pendingCharge.unitId !== unit.id) return fail('Нет объявленной атаки для этого отряда.')
      if (cmd.type === 'skipCharge') return OK
      if (cmd.targetIds.length === 0) return fail('Выберите хотя бы одну цель атаки.')
      if (!cmd.targetIds.every((t) => s.pendingCharge!.targets.includes(t))) return fail('Цель недоступна при этом броске атаки.')
      const targets = cmd.targetIds.map((t) => findUnit(s, t)!)
      if (!planCharge(s, unit, targets, s.pendingCharge.roll))
        return fail('Не удалось построить допустимое перемещение атаки (подставки мешают или нарушается связность).')
      return OK
    }
    case 'fight': {
      if (s.phase !== 'fight' || !s.fight) return fail('Сейчас не фаза боя.')
      if (!fightCandidates(s, s.fight.selecting, s.fight.step).some((u) => u.id === unit.id))
        return fail(s.fight.step === 'first' ? 'Сначала сражаются отряды с правом «Бьёт первым» (Fights First) — например, совершившие атаку.' : 'Этот отряд не может сражаться (уже сражался или не в контакте).')
      const target = findUnit(s, cmd.targetId)
      if (!target || !engagedUnits(s, unit).some((e) => e.id === target.id)) return fail('Цель должна быть в зоне контакта с отрядом.')
      return OK
    }
  }
}

// ---------------------------------------------------------------- fight helpers

const fightEligible = (s: GameState, u: UnitState) => !isDestroyed(u) && !u.fought && (u.charged || isEngaged(s, u))

function fightCandidates(s: GameState, p: PlayerId, step: 'first' | 'rest') {
  return unitsOf(s, p).filter((u) => fightEligible(s, u) && (step === 'rest' || u.charged) && engagedUnits(s, u).length > 0)
}

function advanceFight(s: GameState) {
  if (!s.fight) return
  for (const u of s.units)
    if (fightEligible(s, u) && engagedUnits(s, u).length === 0) {
      u.fought = true
      addLog(s, `${u.name}: нет врагов в зоне контакта — сражаться не с кем.`, 'standard')
    }
  for (;;) {
    const f = s.fight
    const mine = fightCandidates(s, f.selecting, f.step)
    if (mine.length) return
    const theirs = fightCandidates(s, other(f.selecting), f.step)
    if (theirs.length) { f.selecting = other(f.selecting); return }
    if (f.step === 'first') { f.step = 'rest'; f.selecting = s.activePlayer; continue }
    s.fight = null
    consolidateAll(s)
    addLog(s, 'Все бои завершены. Можно завершить фазу.', 'beginner')
    return
  }
}

function pileInAll(s: GameState) {
  for (const p of [s.activePlayer, other(s.activePlayer)]) {
    for (const u of unitsOf(s, p)) {
      if (!(u.charged || isEngaged(s, u))) continue
      const near = enemiesOf(s, u).filter((e) => withinRange(unitDistance(u, e), 5))
      if (!near.length) continue
      const ids = near.map((e) => e.id)
      const em = near.flatMap(alive)
      const closest = (m: ModelState) => em.reduce((b, t) => (modelDistance(m, t) < modelDistance(m, b) ? t : b))
      const inContact = (m: ModelState) => em.some((e) => modelDistance(m, e) < 0.01)
      const pos = planMove(s, u, (m) => (inContact(m) ? { pos: m.pos, radius: 99 } : { pos: closest(m).pos, radius: radiusOf(closest(m)) }), PILE_IN, 'pileIn', ids)
      if (!moveProblem(s, u, pos, PILE_IN, 'pileIn', ids)) movedTo(u, pos)
      addLog(s, `${u.name}: подход (pile-in) до ${PILE_IN}" к ближайшему врагу.`, 'beginner')
    }
  }
}

function consolidateAll(s: GameState) {
  for (const p of [s.activePlayer, other(s.activePlayer)]) {
    for (const u of unitsOf(s, p)) {
      if (!u.fought) continue
      const near = enemiesOf(s, u).filter((e) => withinRange(unitDistance(u, e), CONSOLIDATE))
      let pos: Record<string, Vec> | null = null
      if (near.length) {
        const em = near.flatMap(alive)
        const ids = near.map((e) => e.id)
        const closest = (m: ModelState) => em.reduce((b, t) => (modelDistance(m, t) < modelDistance(m, b) ? t : b))
        pos = planMove(s, u, (m) => ({ pos: closest(m).pos, radius: radiusOf(closest(m)) }), CONSOLIDATE, 'consolidate', ids)
        if (moveProblem(s, u, pos, CONSOLIDATE, 'consolidate', ids)) pos = null
        else addLog(s, `${u.name}: закрепление (consolidate) к врагу.`, 'beginner')
      } else {
        const obj = s.objectives.find((o) => alive(u).some((m) => withinRange(dist(m.pos, o.pos) - radiusOf(m) - baseRadius(OBJECTIVE_MARKER_MM), CONSOLIDATE + 3)))
        if (obj && !unitNearObjective(u, obj)) {
          pos = planMove(s, u, () => ({ pos: obj.pos, radius: baseRadius(OBJECTIVE_MARKER_MM) }), CONSOLIDATE, 'consolidate')
          if (moveProblem(s, u, pos, CONSOLIDATE, 'consolidate')) pos = null
          else addLog(s, `${u.name}: закрепление (consolidate) к цели.`, 'beginner')
        }
      }
      if (pos) movedTo(u, pos)
    }
  }
}

function movedTo(u: UnitState, pos: Record<string, Vec>) {
  for (const m of alive(u)) {
    const p = pos[m.id]
    if (p) {
      u.movedDistance = Math.max(u.movedDistance, dist(m.pos, p))
      m.pos = { ...p }
    }
  }
}

// ---------------------------------------------------------------- turn flow

function resetTurnFlags(s: GameState) {
  for (const u of s.units) {
    u.move = 'none'
    u.movedDistance = 0
    u.advanceRoll = null
    u.advanceRerolled = false
    u.shot = false
    u.chargeDeclared = false
    u.charged = false
    u.fought = false
  }
}

function enterPhase(s: GameState, phase: Phase, r: Roller) {
  s.phase = phase
  addLog(s, `— ${PHASE_NAME[phase]}: ${FACTION_NAME[s.activePlayer]} —`, 'minimal')
  if (phase === 'command') commandPhase(s, r)
  if (phase === 'fight') {
    pileInAll(s)
    s.fight = { selecting: s.activePlayer, step: 'first' }
    advanceFight(s)
    if (!s.fight) addLog(s, 'Нет отрядов в контакте — фаза боя пропускается (можно завершить фазу).', 'beginner')
  }
  const hints: Partial<Record<Phase, string>> = {
    command: 'Оба игрока получают 1 CP; проверяется боевой шок (Battle-shock); затем подсчитываются очки за цели.',
    movement: 'Выберите отряд и переместите модели на расстояние до M. Нельзя заканчивать ход ближе 2" к врагу.',
    shooting: 'Выберите отряд и цель. Нужна линия видимости и дистанция оружия.',
    charge: `Отряд в пределах ${CHARGE_RANGE}" от врага может объявить атаку: бросок 2D6 определяет максимальную дистанцию.`,
    fight: 'Отряды в контакте сражаются. Сначала — те, кто атаковал (Fights First).',
  }
  if (hints[phase]) addLog(s, hints[phase]!, 'beginner')
}

function commandPhase(s: GameState, r: Roller) {
  s.players.marines.cp++
  s.players.orks.cp++
  addLog(s, 'Оба игрока получают 1 очко командования (CP).', 'beginner')
  for (const u of unitsOf(s, s.activePlayer)) {
    if (!u.battleShocked && !atHalfStrength(u)) continue
    const dice = rollMany(r, 2)
    const total = dice[0] + dice[1]
    const ld = profileOf(alive(u)[0]).ld
    const pass = total >= ld
    const was = u.battleShocked
    u.battleShocked = !pass
    pushDice(s, `Боевой шок: ${u.name}`, [{ label: '2D6', target: `${ld}+`, dice: dice.map((v) => ({ value: v, success: pass })), note: `Сумма ${total} против Ld ${ld}+` }],
      pass ? `${u.name}: проверка пройдена${was ? ' — боевой шок снят' : ''}.` : `${u.name}: провал — отряд в боевом шоке (OC = 0, отступление опасно).`)
    addLog(s, pass ? `${u.name} проходит проверку боевого шока (${total} ≥ ${ld}).` : `${u.name} проваливает проверку боевого шока (${total} < ${ld}) и получает Battle-shock.`, 'minimal')
  }
  updateObjectiveControl(s)
  if (s.round >= 2) {
    const held = s.objectives.filter((o) => o.controller === s.activePlayer).length
    if (held) {
      s.players[s.activePlayer].vp += held * VP_PER_OBJECTIVE
      addLog(s, `${FACTION_NAME[s.activePlayer]}: +${held * VP_PER_OBJECTIVE} ПО за удержание целей (${held}). [учебное правило]`, 'minimal')
    } else addLog(s, `${FACTION_NAME[s.activePlayer]} не контролирует ни одной цели — очков нет.`, 'standard')
  } else addLog(s, 'В первом раунде очки за цели не начисляются. [учебное правило]', 'beginner')
}

function endTurn(s: GameState, r: Roller) {
  for (const u of s.units) {
    if (isDestroyed(u)) continue
    let removed = 0
    while (alive(u).length > 1 && checkCoherency(alive(u).map((m) => ({ m, pos: m.pos })))) {
      const a = alive(u)
      const worst = a.reduce((b, m) => (sumDist(m, a) > sumDist(b, a) ? m : b))
      worst.destroyed = true
      removed++
    }
    if (removed) addLog(s, `${u.name}: ${removed} модель(и) убраны в конце хода из-за нарушения связности (coherency).`, 'minimal')
  }
  for (const p of ['marines', 'orks'] as PlayerId[]) if (s.players[p].riledTurns > 0) s.players[p].riledTurns--
  updateObjectiveControl(s)
  checkWinner(s)
  if (s.winner) return
  const second = other(s.firstPlayer)
  if (s.activePlayer === second) {
    if (s.round >= s.maxRounds) {
      const { marines, orks } = s.players
      s.winner = marines.vp > orks.vp ? 'marines' : orks.vp > marines.vp ? 'orks' : 'draw'
      addLog(s, `Битва окончена после ${s.maxRounds} раундов. ${s.winner === 'draw' ? 'Ничья!' : `Победа: ${FACTION_NAME[s.winner]}!`} (${marines.vp}:${orks.vp})`, 'minimal')
      return
    }
    s.round++
    addLog(s, `===== Раунд ${s.round} =====`, 'minimal')
  }
  s.activePlayer = other(s.activePlayer)
  resetTurnFlags(s)
  enterPhase(s, 'command', r)
}

const sumDist = (m: ModelState, all: ModelState[]) => all.reduce((acc, o) => acc + dist(m.pos, o.pos), 0)

function checkWinner(s: GameState) {
  if (s.winner) return
  const m = unitsOf(s, 'marines').length, o = unitsOf(s, 'orks').length
  if (m && o) return
  s.winner = m ? 'marines' : o ? 'orks' : 'draw'
  addLog(s, `Армия противника уничтожена. ${s.winner === 'draw' ? 'Ничья!' : `Победа: ${FACTION_NAME[s.winner]}!`}`, 'minimal')
}

function pushDice(s: GameState, title: string, steps: DiceEntry['steps'], summary: string) {
  s.diceLog.push({ id: s.nextId++, round: s.round, player: actor(s), title, steps, summary })
  if (s.diceLog.length > 200) s.diceLog.splice(0, s.diceLog.length - 200)
}

const aliveIds = (s: GameState) => new Set(s.units.flatMap((u) => alive(u).map((m) => m.id)))

/** Deadly Demise X (24.08): each model with it that was destroyed since `before` rolls a D6;
 * on a 6 every unit within 6″ of it suffers X mortal wounds. No chain reactions. */
function deadlyDemise(s: GameState, before: Set<string>, r: Roller) {
  for (const u of s.units) {
    const x = hasAbility(u, 'deadlyDemiseD3') ? 'D3' : hasAbility(u, 'deadlyDemise1') ? 1 : null
    if (!x) continue
    for (const m of u.models) {
      if (!m.destroyed || !before.has(m.id)) continue
      const v = r.d6()
      if (v !== 6) {
        pushDice(s, `Deadly Demise: ${u.name}`, [{ label: 'D6', target: '6', dice: [{ value: v, success: false }], note: 'Только на 6 подбитая техника взрывается.' }], `${u.name}: обломки не взорвались.`)
        continue
      }
      const n = x === 'D3' ? rollDie(r, 'D3') : x
      const victims = s.units.filter((o) => !isDestroyed(o) && alive(o).some((om) => withinRange(modelDistance(m, om), 6)))
      pushDice(s, `Deadly Demise: ${u.name}`, [{ label: 'D6', target: '6', dice: [{ value: v, success: true }], note: `Взрыв: ${n} смертельн. ран каждому отряду в 6″.` }], `${u.name} взрывается: ${victims.map((o) => o.name).join(', ') || 'рядом никого'}.`)
      for (const o of victims) applyMortalWounds(s, o, n, `взрыв ${u.name} (Deadly Demise)`)
    }
  }
}

function hazard(s: GameState, u: UnitState, n: number, r: Roller, why: string) {
  if (n <= 0) return
  const dice = rollMany(r, n)
  const failed = dice.filter((v) => v <= 2).length
  pushDice(s, `Опасность (Hazard): ${u.name}`, [{ label: 'Hazard', target: '3+', dice: dice.map((v) => ({ value: v, success: v > 2 })), note: `${why}: 1–2 = 1 смертельная рана` }],
    failed ? `${failed} провал(а) — смертельные раны.` : 'Все броски опасности пройдены.')
  if (failed) applyMortalWounds(s, u, failed, why)
}

// ---------------------------------------------------------------- apply

export function apply(state: GameState, cmd: Command, r: Roller): GameState {
  const v = validate(state, cmd)
  if (!v.ok) throw new Error(v.reason)
  const s: GameState = structuredClone(state)

  switch (cmd.type) {
    case 'endPhase': {
      updateObjectiveControl(s)
      if (s.phase === 'movement')
        for (const u of s.units) if (u.advanceRoll !== null && u.move === 'none') u.move = 'advance'
      const i = PHASES.indexOf(s.phase)
      if (i === PHASES.length - 1) endTurn(s, r)
      else enterPhase(s, PHASES[i + 1], r)
      break
    }
    case 'callWaaagh': {
      s.players.orks.waaaghUsed = true
      s.players.orks.riledTurns = 2
      addLog(s, 'WAAAGH! Боевой клич: до конца следующего хода Орки «разъярены» — 5+ непробиваемый спасбросок, всё оружие дальнего боя получает Assault, можно атаковать после продвижения.', 'minimal')
      break
    }
    case 'declareAdvance':
    case 'rerollAdvance': {
      const u = findUnit(s, cmd.unitId)!
      const prev = u.advanceRoll
      const v2 = r.d6()
      u.advanceRoll = v2
      if (cmd.type === 'rerollAdvance') u.advanceRerolled = true
      pushDice(s, `Продвижение: ${u.name}`, [{ label: 'D6', target: '—', dice: [{ value: v2, success: true, rerolledFrom: prev ?? undefined }], note: prev ? `Переброс (Waaagh!): было ${prev}` : undefined }],
        `${u.name}: продвижение (Advance) на M + ${v2}". После продвижения отряд не может атаковать (charge) и стреляет только оружием Assault.`)
      addLog(s, `${u.name} продвигается: бросок D6 = ${v2}.`, 'minimal')
      break
    }
    case 'move': {
      const u = findUnit(s, cmd.unitId)!
      movedTo(u, cmd.positions)
      u.move = cmd.mode
      const label = { normal: 'обычное движение (Normal Move)', advance: 'продвижение (Advance)', fallBack: 'отступление (Fall Back)' }[cmd.mode]
      addLog(s, `${u.name}: ${label}, до ${fmt(u.movedDistance)}".`, 'standard')
      if (cmd.mode === 'fallBack') {
        addLog(s, 'Отступивший отряд не может стрелять и атаковать в этот ход.', 'beginner')
        if (u.battleShocked) {
          hazard(s, u, alive(u).length, r, 'Отчаянный побег (Desperate Escape)')
          if (!isDestroyed(u)) {
            const dice = rollMany(r, 2)
            const ld = profileOf(alive(u)[0]).ld
            const pass = dice[0] + dice[1] >= ld
            u.battleShocked = !pass
            pushDice(s, `Боевой шок после побега: ${u.name}`, [{ label: '2D6', target: `${ld}+`, dice: dice.map((x) => ({ value: x, success: pass })) }], pass ? 'Пройдено.' : 'Провал — отряд остаётся в боевом шоке.')
          }
        }
      }
      break
    }
    case 'shoot': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      const before = aliveIds(s)
      const plan = shootPlan(s, u, t, cmd)
      u.shot = true
      if (cmd.useAmmoRunts && hasAbility(u, 'ammoRunts') && !u.ammoRuntsUsed) u.ammoRuntsUsed = true
      addLog(s, `${u.name} стреляет по отряду «${t.name}»${plan.cover ? ' (цель в укрытии: навык −1)' : ''}.`, 'minimal')
      for (const sk of plan.skipped) addLog(s, sk, 'beginner')
      for (const g of plan.groups) {
        if (isDestroyed(t)) break
        const res = resolveGroup(r, u.name, g, t, g.ctx)
        pushDice(s, `${u.name} → ${t.name}: ${g.weaponName}${g.notes.length ? ` [${g.notes.join(', ')}]` : ''}`, res.steps, res.summary)
        addLog(s, res.summary, 'standard')
      }
      hazard(s, u, plan.hazardousModels, r, 'Перегрузка плазмы (Hazardous)')
      deadlyDemise(s, before, r)
      if (isDestroyed(t)) addLog(s, `Отряд «${t.name}» уничтожен!`, 'minimal')
      checkWinner(s)
      break
    }
    case 'declareCharge': {
      const u = findUnit(s, cmd.unitId)!
      u.chargeDeclared = true
      const dice = rollMany(r, 2)
      const roll = dice[0] + dice[1]
      const targets = chargeTargetsFor(s, u, roll)
      pushDice(s, `Бросок атаки: ${u.name}`, [{ label: '2D6', target: '—', dice: dice.map((x) => ({ value: x, success: targets.length > 0 })), note: `Максимальная дистанция атаки ${roll}"` }],
        targets.length ? `Бросок ${roll}": доступные цели — ${targets.map((x) => x.name).join(', ')}.` : `Бросок ${roll}" — недостаточно, атака провалена.`)
      if (targets.length) s.pendingCharge = { unitId: u.id, roll, dice, targets: targets.map((x) => x.id) }
      else {
        const d = Math.min(...enemiesOf(s, u).map((e) => unitDistance(u, e)))
        addLog(s, `${u.name}: атака провалена — выпало ${roll}", а до ближайшего врага ${fmt(d)}"${roll === 2 ? ' (бросок 2 никогда не достаточен)' : ''}. Отряд остаётся на месте.`, 'minimal')
      }
      break
    }
    case 'skipCharge': {
      const u = findUnit(s, cmd.unitId)!
      s.pendingCharge = null
      addLog(s, `${u.name} отказывается от перемещения атаки.`, 'standard')
      break
    }
    case 'chargeMove': {
      const u = findUnit(s, cmd.unitId)!
      const targets = cmd.targetIds.map((id) => findUnit(s, id)!)
      const pos = planCharge(s, u, targets, s.pendingCharge!.roll)!
      movedTo(u, pos)
      u.charged = true
      s.pendingCharge = null
      addLog(s, `${u.name} атакует (charge) отряд «${targets.map((x) => x.name).join(', ')}» и получает «Бьёт первым» (Fights First).`, 'minimal')
      break
    }
    case 'fight': {
      const u = findUnit(s, cmd.unitId)!
      const t = findUnit(s, cmd.targetId)!
      const before = aliveIds(s)
      u.fought = true
      const groups = meleePlan(s, u, t)
      addLog(s, `${u.name} сражается с отрядом «${t.name}».`, 'minimal')
      for (const g of groups) {
        if (isDestroyed(t)) break
        const res = resolveGroup(r, u.name, g, t, g.ctx)
        pushDice(s, `Бой: ${u.name} → ${t.name}: ${g.weaponName}${g.notes.length ? ` [${g.notes.join(', ')}]` : ''}`, res.steps, res.summary)
        addLog(s, res.summary, 'standard')
      }
      if (!groups.length) addLog(s, `${u.name}: ни одна модель не в зоне контакта (${ENGAGEMENT_RANGE}").`, 'standard')
      deadlyDemise(s, before, r)
      if (isDestroyed(t)) addLog(s, `Отряд «${t.name}» уничтожен!`, 'minimal')
      checkWinner(s)
      s.fight!.selecting = other(s.fight!.selecting)
      advanceFight(s)
      break
    }
  }
  s.rng = r.state()
  return s
}

// ---------------------------------------------------------------- game setup

/** Roll off for first turn and start round 1. */
export function startGame(s0: GameState, r: Roller): GameState {
  const s = structuredClone(s0)
  let a = 0, b = 0
  const rolls: number[] = []
  while (a === b) { a = r.d6(); b = r.d6(); rolls.push(a, b) }
  s.firstPlayer = a > b ? 'marines' : 'orks'
  s.activePlayer = s.firstPlayer
  pushDice(s, 'Бросок за первый ход', [{ label: 'Космодесант / Орки', target: '—', dice: rolls.map((v) => ({ value: v, success: true })) }], `Первым ходит: ${FACTION_NAME[s.firstPlayer]}.`)
  addLog(s, `===== Раунд 1 ===== Первым ходит: ${FACTION_NAME[s.firstPlayer]}.`, 'minimal')
  enterPhase(s, 'command', r)
  s.rng = r.state()
  return s
}

// ---------------------------------------------------------------- UI helpers

export interface ActionInfo {
  id: string
  label: string
  ok: boolean
  reason?: string
  cmd?: Command
}

/** Actions available to a unit in the current phase, with reasons. */
export function unitActions(s: GameState, unitId: string): ActionInfo[] {
  const u = findUnit(s, unitId)
  if (!u || isDestroyed(u)) return []
  const out: ActionInfo[] = []
  const add = (id: string, label: string, cmd: Command) => {
    const v = validate(s, cmd)
    out.push({ id, label, ok: v.ok, reason: v.ok ? undefined : v.reason, cmd })
  }
  if (s.phase === 'movement') {
    add('advance', 'Объявить продвижение (Advance): M + D6', { type: 'declareAdvance', unitId })
    add('reroll', 'Перебросить продвижение (Waaagh!)', { type: 'rerollAdvance', unitId })
  }
  if (s.phase === 'shooting')
    for (const e of enemiesOf(s, u)) add(`shoot:${e.id}`, `Стрелять по «${e.name}»`, { type: 'shoot', unitId, targetId: e.id })
  if (s.phase === 'charge') {
    if (s.pendingCharge?.unitId === unitId) {
      for (const t of s.pendingCharge.targets) add(`charge:${t}`, `Атаковать «${findUnit(s, t)!.name}»`, { type: 'chargeMove', unitId, targetIds: [t] })
      add('skipCharge', 'Отказаться от перемещения', { type: 'skipCharge', unitId })
    } else add('declareCharge', 'Объявить атаку (Charge): бросок 2D6', { type: 'declareCharge', unitId })
  }
  if (s.phase === 'fight')
    for (const e of enemiesOf(s, u)) add(`fight:${e.id}`, `Сражаться с «${e.name}»`, { type: 'fight', unitId, targetId: e.id })
  return out.filter((a) => a.id !== 'reroll' || hasAbility(u, 'waaagh'))
}

export function maxMove(u: UnitState): number {
  const m = Math.min(...alive(u).map((x) => profileOf(x).m))
  return u.advanceRoll !== null ? m + u.advanceRoll : m
}

export function moveModeFor(s: GameState, u: UnitState): 'normal' | 'advance' | 'fallBack' {
  if (isEngaged(s, u)) return 'fallBack'
  return u.advanceRoll !== null ? 'advance' : 'normal'
}

