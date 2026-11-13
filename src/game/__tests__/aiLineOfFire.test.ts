import { describe, expect, it } from 'vitest'
import { HIDDEN_RISK, shootingRisk } from '../ai/ai'
import { composeUnit } from '../army/armyList'
import { shootPlan } from '../engine'
import { newUnit } from '../gameState'
import type { GameState, PlayerId, UnitState, Vec } from '../types'
import { battle, place } from './helpers'

// Battle of 13.11.2026: the AI kept its Redemptors and Predators behind ruins, where six lascannon platforms could not
// see them yet, and one Redemptor never fired. The enemy moves before it shoots, so a vehicle behind a ruin is only
// partly safe; infantry still counts cover as full safety.

function add(s: GameState, owner: PlayerId, datasheetId: string, at: Vec[], id: string): UnitState {
  const u = newUnit(id, datasheetId, owner, id, composeUnit(datasheetId, at.length).map((p, i) => [p, at[i]]))
  s.units.push(u)
  return u
}

const rect = (x: number, y: number, w: number, h: number): Vec[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]

/** Marines against Adeptus Mechanicus on an empty board with a ruin x 15–16, y 0–15 between them. */
function setup() {
  const s = battle('marines', 'adeptus_mechanicus', 'movement', 'marines')
  for (const u of s.units) place(s, u.id, [])
  s.terrain = [{ id: 'w', name: 'wall', kind: 'ruin', obscuring: true, poly: rect(15, 0, 1, 15) }]
  const onager = add(s, 'adeptus_mechanicus', 'onager', [{ x: 40, y: 7 }], 'lofOnager')
  return { s, onager }
}

describe('AI: a vehicle cannot hide from an enemy that will drive to a line of fire', () => {
  it('a Redemptor behind a ruin still counts half of the in-range Onager’s damage; in the open, all of it', () => {
    const { s, onager } = setup()
    const hidden = add(s, 'marines', 'redemptor', [{ x: 12, y: 12 }], 'lofHidden')
    const open = add(s, 'marines', 'redemptor', [{ x: 12, y: 24 }], 'lofOpen')
    expect(shootPlan(s, onager, hidden).problem).not.toBeNull()
    expect(shootPlan(s, onager, open).problem).toBeNull()
    const hiddenRisk = shootingRisk(s, onager, hidden)
    const openRisk = shootingRisk(s, onager, open)
    expect(hiddenRisk).toBeGreaterThan(0)
    expect(openRisk).toBeGreaterThan(hiddenRisk)
    // about the same distance, so the hidden spot weighs about HIDDEN_RISK of the open one
    expect(hiddenRisk).toBeCloseTo(openRisk * HIDDEN_RISK, 0)
  })

  it('infantry behind the same ruin is safe, as before', () => {
    const { s, onager } = setup()
    const squad = add(s, 'marines', 'intercessors', [{ x: 12, y: 10 }, { x: 12, y: 11.5 }, { x: 12, y: 13 }, { x: 10.5, y: 10 }, { x: 10.5, y: 11.5 }], 'lofSquad')
    expect(shootPlan(s, onager, squad).problem).not.toBeNull()
    expect(shootingRisk(s, onager, squad)).toBe(0)
  })

  it('a vehicle beyond the enemy’s range plus its move is safe', () => {
    const { s } = setup()
    const rangers = add(s, 'adeptus_mechanicus', 'rangers', Array.from({ length: 10 }, (_, i) => ({ x: 43, y: 1 + i * 1.2 })), 'lofRangers')
    const red = add(s, 'marines', 'redemptor', [{ x: 2, y: 28 }], 'lofFar')
    // galvanic rifles 30″ plus a 6″ move do not reach a target about 40″ away
    expect(shootingRisk(s, rangers, red)).toBe(0)
  })
})
