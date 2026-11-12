import { meleePotential, p2d6AtLeast } from './ai/ai'
import { unitProfile } from './army/roles'
import { alive, CHARGE_RANGE, enemiesOf, fmt, unitDistance } from './gameState'
import type { GameState, UnitState } from './types'
import { tr } from '../i18n/index'

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
  /** expected wounds the enemy deals back with what survives */
  taken: number
  killsTaken: number
  myModels: number
  verdict: 'good' | 'risky' | 'bad'
  warnings: string[]
}

const woundsLeft = (u: UnitState) => alive(u).reduce((a, m) => a + m.wounds, 0)

export function chargeForecast(s: GameState, unit: UnitState): ChargeForecast[] {
  const myModels = alive(unit).length
  const myWounds = woundsLeft(unit)
  const shooter = unitProfile(unit).role === 'shooter'
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
      const taken = Math.min(myWounds, meleePotential(s, e, unit, false) * survivors)
      const killsTaken = Math.min(myModels, taken / (myWounds / myModels))
      const warnings: string[] = []
      if (p < 0.3) warnings.push(tr('Little chance to make it: needs {ceil}″ on 2D6 — {round}%.', { ceil: Math.ceil(distance), round: Math.round(p * 100) }))
      if (taken > dealt && taken >= myWounds / 3)
        warnings.push(tr('Bad trade: you will deal ~{fmt} wounds and take ~{fmt2} in return (losing ~{round} of {myModels} models).', { fmt: fmt(dealt), fmt2: fmt(taken), round: Math.round(killsTaken), myModels }))
      if (shooter) warnings.push(tr('These are shooters: a unit locked in combat will barely shoot next turn (pistols only), and it is weaker in melee.'))
      const bad = taken > dealt * 1.5 && taken >= myWounds / 3
      const verdict: ChargeForecast['verdict'] = bad || p < 0.15 ? 'bad' : warnings.length ? 'risky' : 'good'
      return { targetId: e.id, name: e.name, distance, p, dealt, killsDealt, enemyModels: eModels, taken, killsTaken, myModels, verdict, warnings }
    })
    .sort((a, b) => b.p * (b.dealt - b.taken) - a.p * (a.dealt - a.taken))
}

/** One line: "needs 7″ — 58% · you: ~3 wounds (~2 of 10) · in return: ~1 (~1 of 5)". */
export function forecastLine(f: ChargeForecast): string {
  const n = (x: number) => (x >= 1 ? String(Math.round(x)) : fmt(x))
  return tr('needs {ceil}″ — {round}% · you: ~{fmt} wounds (~{n} of {enemyModels}) · in return: ~{fmt2} (~{n2} of {myModels})', { ceil: Math.ceil(f.distance), round: Math.round(f.p * 100), fmt: fmt(f.dealt), n: n(f.killsDealt), enemyModels: f.enemyModels, fmt2: fmt(f.taken), n2: n(f.killsTaken), myModels: f.myModels })
}
