import { unitProfile, ROLE_ICON, ROLE_NAME, type UnitRole } from './army/roles'
import { alive, datasheetOf, enemiesOf, isMV, profileOf, weaponsOf } from './gameState'
import type { GameState, UnitState } from './types'
import { profileVs, REFERENCE, type Reference, type TargetKind } from './weaponAdvice'
import { tr } from '../i18n/index'

// "How do I play this unit?" for beginners: the unit's battlefield role (read off its datasheet, see army/roles.ts),
// what that means on the table, what it hits hardest, what it should fear, and, in a battle, which enemy units it hurts
// most and which hurt it most. Pure; expected values only (averages, no cover, range or line of sight).

export interface UnitAdvice {
  role: UnitRole
  /** "🎯 Shooters" */
  title: string
  /** how to use it, 2–3 short lines */
  tips: string[]
  /** "shooting — against infantry hordes; melee — against armoured infantry" */
  strongVs: string
  /** the kind of attack it should fear */
  fears: string
  /** in a battle: the enemy units it hurts most / that hurt it most (names), best first */
  bestTargets: string[]
  worstThreats: string[]
}

const TIPS: Record<UnitRole, string[]> = {
  assault: [
    tr('Strength is in melee: bring the unit up under cover of ruins and charge those it cuts down best.'),
    tr('Do not stand in the open under fire: as many models as possible must reach the fight.'),
  ],
  shooter: [
    tr('It deals damage from afar: keep it at your weapons’ range and in cover.'),
    tr('Do not rush into melee: the unit is weaker there, and one locked in combat barely shoots.'),
  ],
  screen: [
    tr('Many cheap models: put them in front so the enemy does not reach the valuable units.'),
    tr('Holds objectives well (high OC) — send it to objectives and let the enemy waste shots on it.'),
  ],
  character: [
    tr('Character: keep it near the unit it gives a bonus to, and do not expose it alone.'),
    tr('Its death means losing abilities for the whole group: hide it from heavy weapons.'),
  ],
  infiltrator: [
    tr('Infiltrators: set up outside their own zone — take distant objectives and distract the enemy.'),
    tr('A small unit: hit and hide, it cannot handle a prolonged fight with a strong enemy.'),
  ],
}

const AGAINST: Record<TargetKind, string> = { horde: tr('infantry hordes'), elite: tr('armoured infantry'), heavy: tr('vehicles and monsters') }
/** a typical result per firing model against each kind (as in weaponAdvice.ts), to see what the unit leans towards */
const TYPICAL: Record<TargetKind, number> = { horde: 0.8, elite: 0.3, heavy: 0.8 }

/** The unit as a target: its toughness, save, invulnerable save, wounds per model and size. */
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

/** Expected wounds the whole unit deals to a reference in one shooting phase and in one fight (every model, best profile). */
function output(u: UnitState, ref: Reference): { ranged: number; melee: number } {
  let ranged = 0
  let melee = 0
  for (const m of alive(u)) {
    let bestMelee = 0
    let extra = 0
    for (const w of weaponsOf(m)) {
      const best = Math.max(...w.profiles.map((p) => profileVs(p, ref)))
      if (w.profiles[0].range !== 'melee') ranged += best
      else if (w.profiles[0].keywords.extraAttacks) extra += best
      else bestMelee = Math.max(bestMelee, best)
    }
    melee += bestMelee + extra
  }
  return { ranged, melee }
}

const leanOf = (u: UnitState, kind: 'ranged' | 'melee'): TargetKind | null => {
  const per = (k: TargetKind) => output(u, REFERENCE[k])[kind] / alive(u).length / (k === 'heavy' ? 1 : REFERENCE[k].w) / TYPICAL[k]
  const kinds: TargetKind[] = ['horde', 'elite', 'heavy']
  const best = kinds.reduce((a, b) => (per(b) > per(a) ? b : a))
  return per(best) > 0.05 ? best : null
}

function fearsOf(u: UnitState): string {
  const p = profileOf(alive(u)[0])
  const wPerModel = alive(u).reduce((a, m) => a + profileOf(m).w, 0) / alive(u).length
  if (isMV(u) || wPerModel >= 5) return tr('heavy weapons — Strength 8+, damage 3+ and Anti-VEHICLE/MONSTER (meltas, lascannons, gravitic weapons)')
  if (p.sv >= 5) return tr('mass fire — flamers, Blast and weapons with many shots: the defence is weak, every wound removes a model')
  return tr('armour-piercing weapons — AP −2 and better, damage 2+ (plasma, heavy bolters): ordinary rifles are weak against it')
}

export function unitAdvice(unit: UnitState, s?: GameState): UnitAdvice {
  // a destroyed unit is still described from its datasheet: every model as it started (the card stays open after it dies)
  const u = alive(unit).length ? unit : { ...unit, models: unit.models.map((m) => ({ ...m, destroyed: false, wounds: profileOf(m).w })) }
  const role = unitProfile(u).role
  const lean = { ranged: leanOf(u, 'ranged'), melee: leanOf(u, 'melee') }
  // a shooting unit's close combat weapons are not what it is for, so only its guns are rated
  const strong = [
    lean.ranged ? tr('shooting — against {item}', { item: AGAINST[lean.ranged] }) : '',
    lean.melee && role !== 'shooter' ? tr('melee — against {item}', { item: AGAINST[lean.melee] }) : '',
  ].filter(Boolean).join('; ')
  let bestTargets: string[] = []
  let worstThreats: string[] = []
  if (s && alive(unit).length) {
    const me = asReference(u)
    const foes = enemiesOf(s, u).filter((e) => alive(e).length)
    const dealt = (e: UnitState) => {
      const o = output(u, asReference(e))
      // wounds it can actually remove: capped at what the enemy unit has
      return Math.min(role === 'shooter' ? o.ranged : Math.max(o.ranged, o.melee), alive(e).reduce((a, m) => a + m.wounds, 0))
    }
    const taken = (e: UnitState) => {
      const o = output(e, me)
      return Math.max(o.ranged, o.melee)
    }
    bestTargets = [...foes].sort((a, b) => dealt(b) - dealt(a)).filter((e) => dealt(e) > 0.5).slice(0, 2).map((e) => e.name)
    worstThreats = [...foes].sort((a, b) => taken(b) - taken(a)).filter((e) => taken(e) > 0.5).slice(0, 2).map((e) => e.name)
  }
  return {
    role,
    title: `${ROLE_ICON[role]} ${ROLE_NAME[role][0].toUpperCase()}${ROLE_NAME[role].slice(1)}`,
    tips: TIPS[role],
    strongVs: strong || tr('it deals no noticeable damage — its job is different (objectives, cover, abilities)'),
    fears: fearsOf(u),
    bestTargets,
    worstThreats,
  }
}
