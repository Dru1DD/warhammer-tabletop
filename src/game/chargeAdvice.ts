import { meleePotential, p2d6AtLeast } from './ai/ai'
import { unitProfile } from './army/roles'
import { alive, CHARGE_RANGE, enemiesOf, fmt, unitDistance } from './gameState'
import type { GameState, UnitState } from './types'

// Charge forecast for beginners, before declaring a charge: for every enemy unit in reach, the chance that 2D6 covers
// the distance, the expected wounds and models killed by this unit (fighting first after the charge) and by the enemy
// in return (only its survivors strike back), and warnings for the usual mistakes. Pure; expected values only.

export interface ChargeForecast {
  targetId: string
  name: string
  /** distance to cover, inches (edge to edge) */
  distance: number
  /** chance that the 2D6 charge roll covers it (a roll of 2 always fails) */
  p: number
  /** expected wounds dealt by this unit (it fights first after charging) */
  dealt: number
  killsDealt: number
  enemyModels: number
  /** expected wounds the enemy deals back: the target's survivors plus the units next to it that join the fight */
  taken: number
  /** enemy units next to the target (within JOIN_RANGE) that will be in the fight too, with what each deals */
  joiners: { name: string; taken: number }[]
  killsTaken: number
  myModels: number
  verdict: 'good' | 'risky' | 'bad'
  warnings: string[]
}

const woundsLeft = (u: UnitState) => alive(u).reduce((a, m) => a + m.wounds, 0)

/** An enemy unit this close to the target ends up in engagement range of the chargers and fights them too
 * (only engaged units pile in, so farther ones usually stay out). */
export const JOIN_RANGE = 3

export function chargeForecast(s: GameState, unit: UnitState): ChargeForecast[] {
  const myModels = alive(unit).length
  const myWounds = woundsLeft(unit)
  const shooter = unitProfile(unit).role === 'shooter'
  // a CHARACTER: valuable alive (its abilities help the whole army), so a fight it barely wins or loses badly is flagged
  const character = unitProfile(unit).role === 'character'
  return enemiesOf(s, unit)
    .filter((e) => alive(e).length && unitDistance(unit, e) <= CHARGE_RANGE + 1e-9)
    .map((e): ChargeForecast => {
      const distance = unitDistance(unit, e)
      const p = p2d6AtLeast(Math.ceil(distance - 1e-9))
      const eModels = alive(e).length
      const eWounds = woundsLeft(e)
      const dealt = Math.min(eWounds, meleePotential(s, unit, e, true))
      const killsDealt = Math.min(eModels, dealt / (eWounds / eModels))
      // the enemy strikes back with the models it has left
      const survivors = Math.max(0, 1 - killsDealt / eModels)
      // the enemy units standing next to the target join the fight at full strength
      const joiners = enemiesOf(s, unit)
        .filter((x) => x.id !== e.id && alive(x).length && unitDistance(x, e) <= JOIN_RANGE + 1e-9)
        .map((x) => ({ name: x.name, taken: meleePotential(s, x, unit, false) }))
        .filter((x) => x.taken >= 0.5)
      const taken = Math.min(myWounds, meleePotential(s, e, unit, false) * survivors + joiners.reduce((a, x) => a + x.taken, 0))
      const killsTaken = Math.min(myModels, taken / (myWounds / myModels))
      const warnings: string[] = []
      if (joiners.length)
        warnings.push(`Рядом с целью ${joiners.map((x) => `«${x.name}»`).join(', ')}: ${joiners.length > 1 ? 'они окажутся в зоне контакта и тоже ударят' : 'он окажется в зоне контакта и тоже ударит'} — ещё ~${fmt(joiners.reduce((a, x) => a + x.taken, 0))} ран по вам.`)
      if (character && (dealt < 2 || taken >= myWounds / 2))
        warnings.push(`«${unit.name}» — персонаж: в этом бою он нанесёт ~${fmt(dealt)} ран, а получит ~${fmt(taken)} из ${myWounds}. С ним погибнут и его способности для армии — держите его рядом со своими отрядами.`)
      if (p < 0.3) warnings.push(`Мало шансов дойти: нужно ${Math.ceil(distance)}″ на 2D6 — ${Math.round(p * 100)}%.`)
      if (taken > dealt && taken >= myWounds / 3)
        warnings.push(`Невыгодный размен: вы нанесёте ~${fmt(dealt)} ран, а в ответ получите ~${fmt(taken)} (потеряете ~${Math.round(killsTaken)} из ${myModels} мод.).`)
      if (shooter) warnings.push('Это стрелки: связанный боем отряд в следующий ход почти не стреляет (только пистолеты), а в рукопашной он слабее.')
      const bad = taken > dealt * 1.5 && taken >= myWounds / 3
      const verdict: ChargeForecast['verdict'] = bad || p < 0.15 ? 'bad' : warnings.length ? 'risky' : 'good'
      return { targetId: e.id, name: e.name, distance, p, dealt, killsDealt, enemyModels: eModels, taken, joiners, killsTaken, myModels, verdict, warnings }
    })
    .sort((a, b) => b.p * (b.dealt - b.taken) - a.p * (a.dealt - a.taken))
}

/** One line: «нужно 7″ — 58% · вы: ~3 раны (~2 из 10) · в ответ: ~1 (~1 из 5)». */
export function forecastLine(f: ChargeForecast): string {
  const n = (x: number) => (x >= 1 ? String(Math.round(x)) : fmt(x))
  return `нужно ${Math.ceil(f.distance)}″ — ${Math.round(f.p * 100)}% · вы: ~${fmt(f.dealt)} ран (~${n(f.killsDealt)} из ${f.enemyModels}) · в ответ: ~${fmt(f.taken)} (~${n(f.killsTaken)} из ${f.myModels})`
}
