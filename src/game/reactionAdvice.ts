import { expectedGroupDamage, meleePotential, p2d6AtLeast } from './ai/ai'
import { meleePlan, reactionCommands, shockFailChance, shootPlan } from './engine'
import { alive, findUnit, fmt, hasAbility, hasKeyword, ledUnitOf, profileOf, unitDistance, unitNearObjective } from './gameState'
import { LAST_STAND, STRATAGEMS } from './rules/stratagems'
import type { Command, GameState, PendingReroll, StratagemId, UnitState } from './types'

// Which reactions are worth their Command points right now, for the AI and for the pause dialog («only when useful»).
// Pure; expected values only.

export interface ReactionOption {
  cmd: Extract<Command, { type: 'stratagem' }>
  /** «Огонь на опережение: Рейнджеры → Бойз I» */
  title: string
  /** a comparable value (expected wounds dealt or saved) */
  value: number
  worth: boolean
  /** why, for the player */
  why: string
}

const woundsLeft = (u: UnitState) => alive(u).reduce((a, m) => a + m.wounds, 0)
const shotDamage = (s: GameState, shooter: UnitState, target: UnitState, snap = false) => {
  const plan = shootPlan(s, shooter, target, { snap })
  return plan.problem ? 0 : Math.min(woundsLeft(target), plan.groups.reduce((a, g) => a + expectedGroupDamage(g, target), 0))
}

/** Expected damage of a waiting attack (capped by the target's wounds). */
function attackDamage(s: GameState, cmd: PendingReroll['cmd']) {
  const a = findUnit(s, cmd.unitId)!
  const t = findUnit(s, cmd.targetId)!
  const groups = cmd.type === 'shoot' ? shootPlan(s, a, t, cmd).groups : meleePlan(s, a, t)
  return Math.min(woundsLeft(t), groups.reduce((x, g) => x + expectedGroupDamage(g, t), 0))
}

/** The same state with the Stratagem's effect already on the unit (no clone of the whole game). */
const withBuff = (s: GameState, unitId: string, id: StratagemId): GameState => ({
  ...s,
  units: s.units.map((u) => (u.id === unitId ? { ...u, phaseBuffs: [...(u.phaseBuffs ?? []), id] } : u)),
})

/** Worth the CP: at least this much expected damage saved (or dealt) per Command point. */
const PER_CP = 1.5

const DEFENCE_HOW: Partial<Record<StratagemId, string>> = {
  armourOfContempt: 'AP атак хуже на 1',
  rapidRegeneration: '«Не чувствует боли»',
  lightningFastReactions: '−1 к попаданию',
  balefulHalo: '−1 к ранению',
  bulwarkImperative: 'непробиваемый 4+',
}

export function reactionAdvice(s: GameState): ReactionOption[] {
  const out: ReactionOption[] = []
  for (const c of reactionCommands(s)) {
    if (c.type !== 'stratagem') continue
    const info = STRATAGEMS[c.id]
    const u = findUnit(s, c.unitId)!
    const t = c.targetId ? findUnit(s, c.targetId) : undefined
    const title = `${info.name}: ${u.name}${t ? ` → ${t.name}` : ''}`
    if (c.id === 'fireOverwatch' && t) {
      const dmg = shotDamage(s, u, t, true)
      out.push({ cmd: c, title, value: dmg, worth: dmg >= 1, why: `≈ ${fmt(dmg)} ран навскидку (попадание только на «6»)${dmg < 1 ? ' — меньше одной раны, жаль CP' : ''}.` })
    } else if (c.id === 'smokescreen') {
      // the hardest volley the enemy can put into this unit in its coming Shooting phase
      const threat = Math.max(0, ...s.units.filter((e) => e.owner !== u.owner && alive(e).length).map((e) => shotDamage(s, e, u)))
      out.push({ cmd: c, title, value: threat / 4, worth: threat >= 3, why: threat >= 3 ? `По отряду могут нанести ≈ ${fmt(threat)} ран — укрытие заметно снизит урон.` : `По отряду почти некому стрелять (≈ ${fmt(threat)} ран).` })
    } else if (c.id === 'heroicIntervention' && t) {
      const p = p2d6AtLeast(Math.ceil(unitDistance(u, t) - 1e-9))
      const dealt = Math.min(woundsLeft(t), meleePotential(s, u, t, false))
      const taken = Math.min(woundsLeft(u), meleePotential(s, t, u, false))
      const worth = p >= 0.5 && p * dealt >= 1.5 && dealt >= taken * 0.75
      out.push({ cmd: c, title, value: p * dealt, worth, why: `Шанс дойти ${Math.round(p * 100)}%, в бою ≈ ${fmt(dealt)} ран врагу и ≈ ${fmt(taken)} вам.` })
    } else if (c.id in DEFENCE_HOW && s.reaction?.attack) {
      // damage the waiting attack would do, without and with the effect
      const cmd = s.reaction.attack
      const base = attackDamage(s, cmd)
      const saved = Math.max(0, base - attackDamage(withBuff(s, u.id, c.id), cmd))
      const worth = saved >= PER_CP * info.cost
      out.push({ cmd: c, title, value: saved / info.cost, worth, why: `Атака «${findUnit(s, cmd.unitId)!.name}» нанесёт ≈ ${fmt(base)} ран; ${DEFENCE_HOW[c.id]} сбережёт ≈ ${fmt(saved)}${worth ? '' : ' — мало для ' + info.cost + ' CP'}.` })
    } else if (LAST_STAND.includes(c.id) && s.reaction?.attack) {
      // models the attack is expected to kill, the share that rolls 4+ (3+ for riled-up Orks), and what each one hits back for
      const cmd = s.reaction.attack
      const foe = findUnit(s, cmd.unitId)!
      const models = alive(u)
      const avgW = models.reduce((a, m) => a + profileOf(m).w, 0) / models.length
      const killed = Math.min(models.length, attackDamage(s, cmd) / avgW)
      const riled = c.id === 'orksNeverBeaten' && hasAbility(u, 'waaagh') && s.players[u.owner].riledTurns > 0
      const perModel = meleePotential(s, u, foe, false) / models.length
      const dealt = Math.min(woundsLeft(foe), killed * (riled ? 2 / 3 : 1 / 2) * perModel)
      out.push({ cmd: c, title, value: dealt, worth: dealt >= PER_CP * info.cost, why: `Враг убьёт ≈ ${fmt(killed)} модел.; ${riled ? 'на 3+' : 'на 4+'} они ударят перед смертью — ≈ ${fmt(dealt)} ран «${foe.name}».` })
    } else if (c.id === 'undyingLegions') {
      // each healed wound is a wound back or a model back on its feet (at 1 wound)
      const room = alive(u).reduce((a, m) => a + profileOf(m).w - m.wounds, 0) + u.models.filter((m) => m.destroyed && !profileOf(m).character).length
      const led = s.units.some((l) => l.owner === u.owner && hasKeyword(l, 'CHARACTER') && alive(l).length > 0 && ledUnitOf(s, l)?.id === u.id)
      const healed = Math.min(room, led ? 3 : 2)
      out.push({ cmd: c, title, value: healed, worth: healed >= PER_CP * info.cost, why: `Реанимация сейчас вернёт ≈ ${fmt(healed)} ран или моделей${led ? ' (D3+1: отряд ведёт персонаж)' : ''}, не дожидаясь вашей фазы командования.` })
    } else if (c.id === 'insaneBravery') {
      // once per battle: spend it where a failed test costs an objective, or on a big unit late in the game
      const fail = shockFailChance(s, u)
      const onObjective = s.objectives.some((o) => unitNearObjective(u, o))
      const worth = onObjective ? fail >= 0.25 : fail >= 0.5 && alive(u).length >= 5 && s.round >= 3
      const pct = Math.round(fail * 100)
      out.push({ cmd: c, title, value: fail * (onObjective ? 3 : 1), worth, why: `Шанс провалить проверку ${pct}%${onObjective ? ': отряд на цели, а в шоке его OC = 0 — цель уйдёт' : ''}. Раз за битву.` })
    }
  }
  return out.sort((a, b) => Number(b.worth) - Number(a.worth) || b.value - a.value)
}
