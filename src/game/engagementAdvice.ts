import { meleePotential } from './ai/ai'
import { alive, CHARGE_RANGE, datasheetOf, engagedUnits, enemiesOf, fmt, profileOf, unitDistance, unitsOf, weaponsOf } from './gameState'
import type { GameState, UnitState } from './types'
import { profileVs, type Reference } from './weaponAdvice'
import { tr } from '../i18n/index'

// "Stay in combat or fall back?" for a unit locked in melee, in its own movement phase. Staying: what it deals and takes
// in the coming fights. Falling back: it cannot shoot this turn, but shoots again next turn; and the enemies it held are
// free to charge someone else. Pure; expected values only (no range, cover or line of sight for next turn's shooting).

export interface EngagementAdvice {
  /** the enemy units it is locked with */
  holding: string[]
  /** expected wounds per fight if it stays */
  stayDealt: number
  stayTaken: number
  /** expected wounds of its shooting next turn at the best target, if it falls back */
  shootNext: number
  shootTarget: string | null
  /** what the freed enemy could charge and how hard it hits, if it falls back */
  freed: { enemy: string; victim: string; dmg: number } | null
  verdict: 'stay' | 'leave'
  why: string
}

const woundsLeft = (u: UnitState) => alive(u).reduce((a, m) => a + m.wounds, 0)

/** The unit as a target for `profileVs`. */
function asReference(u: UnitState): Reference {
  const models = alive(u)
  const p = profileOf(models[0])
  return {
    label: u.name,
    t: Math.max(...models.map((m) => profileOf(m).t)),
    sv: p.sv,
    invuln: p.invuln,
    w: Math.max(1, Math.round(models.reduce((a, m) => a + profileOf(m).w, 0) / models.length)),
    models: models.length,
    keywords: datasheetOf(u).keywords,
  }
}

/** Expected wounds of one volley of every ranged weapon (best profile), capped at what the target has left. */
function volley(u: UnitState, target: UnitState): number {
  const ref = asReference(target)
  let total = 0
  for (const m of alive(u))
    for (const w of weaponsOf(m)) if (w.profiles[0].range !== 'melee') total += Math.max(...w.profiles.map((p) => profileVs(p, ref)))
  return Math.min(total, woundsLeft(target))
}

export function engagementAdvice(s: GameState, unit: UnitState): EngagementAdvice | null {
  const foes = engagedUnits(s, unit).filter((e) => alive(e).length)
  if (!foes.length) return null
  const stayDealt = Math.max(...foes.map((e) => Math.min(woundsLeft(e), meleePotential(s, unit, e, false))))
  const stayTaken = Math.min(woundsLeft(unit), foes.reduce((a, e) => a + meleePotential(s, e, unit, false), 0))
  const targets = enemiesOf(s, unit).filter((e) => alive(e).length).map((e) => ({ e, dmg: volley(unit, e) })).sort((a, b) => b.dmg - a.dmg)
  const shootNext = targets[0]?.dmg ?? 0
  const shootTarget = targets[0] && shootNext > 0.05 ? targets[0].e.name : null
  // the freed enemy's best charge on another friendly unit within reach
  let freed: EngagementAdvice['freed'] = null
  for (const e of foes)
    for (const v of unitsOf(s, unit.owner).filter((x) => x.id !== unit.id && alive(x).length && unitDistance(e, x) <= CHARGE_RANGE)) {
      const dmg = Math.min(woundsLeft(v), meleePotential(s, e, v, true))
      if (!freed || dmg > freed.dmg) freed = { enemy: e.name, victim: v.name, dmg }
    }
  const myWounds = woundsLeft(unit)
  // leave when staying is costly, or when the guns are worth much more than the fists and freeing the enemy costs less
  const costly = stayTaken >= myWounds / 3 && stayTaken > stayDealt
  const gunsWorthIt = shootNext >= Math.max(1.5, stayDealt * 2) && (!freed || freed.dmg < shootNext)
  const verdict: EngagementAdvice['verdict'] = costly || gunsWorthIt ? 'leave' : 'stay'
  const why = verdict === 'leave'
    ? costly
      ? tr('In combat the unit loses ~{fmt} wounds per fight and deals only ~{fmt2} — it is better to disengage.', { fmt: fmt(stayTaken), fmt2: fmt(stayDealt) })
      : tr('From next turn its shooting will deal ~{fmt} wounds vs ~{fmt2} in combat — it is better to disengage.', { fmt: fmt(shootNext), fmt2: fmt(stayDealt) })
    : freed && freed.dmg > stayTaken
      ? tr('The unit pins the enemy: if it leaves, “{enemy}” will be able to attack “{victim}” (~{fmt} wounds), while here it deals only ~{fmt2}.', { enemy: freed.enemy, victim: freed.victim, fmt: fmt(freed.dmg), fmt2: fmt(stayTaken) })
      : tr('Disengaging gains almost nothing: shooting ~{fmt} wounds from next turn vs ~{fmt2} in combat, and after falling back it cannot shoot this turn.', { fmt: fmt(shootNext), fmt2: fmt(stayDealt) })
  return { holding: foes.map((e) => e.name), stayDealt, stayTaken, shootNext, shootTarget, freed, verdict, why }
}
