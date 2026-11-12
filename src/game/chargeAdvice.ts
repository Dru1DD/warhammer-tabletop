import { meleePotential, p2d6AtLeast } from './ai/ai'
import { unitProfile } from './army/roles'
import { alive, CHARGE_RANGE, enemiesOf, fmt, unitDistance } from './gameState'
import type { GameState, UnitState } from './types'
import { quote, tr } from '../i18n/index'

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
      if (joiners.length) {
        const names = joiners.map((x) => quote(x.name)).join(', ')
        const extra = fmt(joiners.reduce((a, x) => a + x.taken, 0))
        warnings.push(joiners.length > 1
          ? tr('Near the target {names}: they will end up in engagement range and strike too — another ~{extra} wounds to you.', { names, extra })
          : tr('Near the target {names}: it will end up in engagement range and strike too — another ~{extra} wounds to you.', { names, extra }))
      }
      if (character && (dealt < 2 || taken >= myWounds / 2))
        warnings.push(tr('{name} is a character: in this fight it will deal ~{dealt} wounds and take ~{taken} of {myWounds}. Its abilities for the army die with it — keep it close to your units.', { name: quote(unit.name), dealt: fmt(dealt), taken: fmt(taken), myWounds }))
      if (p < 0.3) warnings.push(tr('Little chance to make it: needs {ceil}″ on 2D6 — {round}%.', { ceil: Math.ceil(distance), round: Math.round(p * 100) }))
      if (taken > dealt && taken >= myWounds / 3)
        warnings.push(tr('Bad trade: you will deal ~{fmt} wounds and take ~{fmt2} in return (losing ~{round} of {myModels} models).', { fmt: fmt(dealt), fmt2: fmt(taken), round: Math.round(killsTaken), myModels }))
      if (shooter) warnings.push(tr('These are shooters: a unit locked in combat will barely shoot next turn (pistols only), and it is weaker in melee.'))
      const bad = taken > dealt * 1.5 && taken >= myWounds / 3
      const verdict: ChargeForecast['verdict'] = bad || p < 0.15 ? 'bad' : warnings.length ? 'risky' : 'good'
      return { targetId: e.id, name: e.name, distance, p, dealt, killsDealt, enemyModels: eModels, taken, joiners, killsTaken, myModels, verdict, warnings }
    })
    .sort((a, b) => b.p * (b.dealt - b.taken) - a.p * (a.dealt - a.taken))
}

/** One line: "needs 7″ — 58% · you: ~3 wounds (~2 of 10) · in return: ~1 (~1 of 5)". */
export function forecastLine(f: ChargeForecast): string {
  const n = (x: number) => (x >= 1 ? String(Math.round(x)) : fmt(x))
  return tr('needs {ceil}″ — {round}% · you: ~{fmt} wounds (~{n} of {enemyModels}) · in return: ~{fmt2} (~{n2} of {myModels})', { ceil: Math.ceil(f.distance), round: Math.round(f.p * 100), fmt: fmt(f.dealt), n: n(f.killsDealt), enemyModels: f.enemyModels, fmt2: fmt(f.taken), n2: n(f.killsTaken), myModels: f.myModels })
}

/** Below this chance to get there, a charge is worth a second thought. */
export const LOW_CHARGE_CHANCE = 0.3

/**
 * Why to think twice before declaring this charge, or null when it looks fine. Asked when the player presses
 * “Declare a charge”: the forecast is on screen, but the battles showed it is easy to charge without reading it (from 11″
 * at 3%, a support Tech-Priest into a Captain, shooters into melee). Flags: every target out of reasonable reach, every
 * fight a bad trade, or a shooter or a character heading into a fight that is not a good one.
 */
export function chargeWarning(s: GameState, unit: UnitState): { why: string[]; best: ChargeForecast } | null {
  const list = chargeForecast(s, unit)
  if (!list.length) return null
  const top = list[0]
  const likeliest = list.reduce((a, b) => (b.p > a.p ? b : a))
  const role = unitProfile(unit).role
  const why: string[] = []
  if (likeliest.p < LOW_CHARGE_CHANCE)
    why.push(tr('Little chance to make it: even the nearest target {name} needs {ceil}″ on 2D6 — {round}%. If it falls short, the unit just stays where it is.', { name: quote(likeliest.name), ceil: Math.ceil(likeliest.distance), round: Math.round(likeliest.p * 100) }))
  const reasons = list.every((f) => f.verdict === 'bad') || ((role === 'shooter' || role === 'character') && top.verdict !== 'good')
  // the forecast's own "little chance" warning repeats the first reason, so it is left out
  const little = tr('Little chance to make it: needs {ceil}″ on 2D6 — {round}%.', { ceil: Math.ceil(top.distance), round: Math.round(top.p * 100) })
  if (reasons) for (const w of top.warnings) if (w !== little) why.push(tr('{name}: {warning}', { name: quote(top.name), warning: w }))
  return why.length ? { why, best: top } : null
}
