import { meleePotential } from './ai/ai'
import { alive, CHARGE_RANGE, datasheetOf, engagedUnits, enemiesOf, fmt, profileOf, unitDistance, unitsOf, weaponsOf } from './gameState'
import type { GameState, UnitState } from './types'
import { profileVs, type Reference } from './weaponAdvice'

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
      ? `В бою отряд теряет ~${fmt(stayTaken)} ран за бой и наносит лишь ~${fmt(stayDealt)} — выгоднее выйти.`
      : `Со следующего хода его стрельба даст ~${fmt(shootNext)} ран против ~${fmt(stayDealt)} в бою — выгоднее выйти.`
    : freed && freed.dmg > stayTaken
      ? `Отряд держит врага на себе: если выйти, «${freed.enemy}» сможет атаковать «${freed.victim}» (~${fmt(freed.dmg)} ран), а здесь бьёт всего на ~${fmt(stayTaken)}.`
      : `Выход почти ничего не даст: стрельба ~${fmt(shootNext)} ран со следующего хода против ~${fmt(stayDealt)} в бою, а в этот ход после отступления стрелять нельзя.`
  return { holding: foes.map((e) => e.name), stayDealt, stayTaken, shootNext, shootTarget, freed, verdict, why }
}
