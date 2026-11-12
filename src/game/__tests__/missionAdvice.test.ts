import { describe, expect, it } from 'vitest'
import { hasKeyword } from '../gameState'
import { objectiveStakes, turnPlan } from '../missionAdvice'
import { missionCommandEnd, missionTurnEnd, missionTurnStart, primaryTotal } from '../rules/missions'
import { toReserve } from '../rules/reserves'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, PlayerId, PrimaryId, SecondaryId } from '../types'
import { moveUnitTo } from './helpers'

// hammerAnvil objectives: home west (9,22), home east (51,22), central (30,22), expansions (30,8) and (30,36)
const HOME_W = 0, HOME_E = 1, CENTRAL = 2, EXP_N = 3

function battle(primary: PrimaryId, phase: GameState['phase'] = 'movement', round = 2): GameState {
  const s = scenarioById('strike-force').build(['marines', 'orks'], {}, undefined, { mapId: 'hammerAnvil', layoutId: 'A', primary, secondaries: 'none' })
  s.phase = phase
  s.round = round
  s.activePlayer = 'marines'
  s.firstPlayer = 'marines'
  missionTurnStart(s)
  return s
}
const own = (s: GameState, ids: number[], p: PlayerId = 'marines') => {
  s.objectives.forEach((o) => (o.controller = null))
  for (const i of ids) s.objectives[i].controller = p
}
const trooper = (s: GameState, p: PlayerId) => s.units.find((u) => u.owner === p && hasKeyword(u, 'INFANTRY') && !hasKeyword(u, 'CHARACTER'))!

describe('the turn plan predicts what the mission scores', () => {
  it('the Command-phase line matches the VP actually scored', () => {
    const s = battle('dominance', 'command')
    own(s, [HOME_W, CENTRAL, EXP_N])
    const line = turnPlan(s, 'marines').find((l) => l.kind === 'score')!
    expect(line.text).toMatch(/этой фазы командования/)
    missionCommandEnd(s)
    expect(line.vp).toBe(primaryTotal(s.mission!, 'marines'))
    expect(line.vp).toBe(13)
  })

  it('the end-of-turn line matches the VP actually scored', () => {
    const s = battle('outmanoeuvre', 'fight', 1)
    own(s, [HOME_E, CENTRAL])
    const line = turnPlan(s, 'marines').find((l) => l.kind === 'score' && /закончить ход/.test(l.text))!
    missionTurnEnd(s)
    expect(line.vp).toBe(primaryTotal(s.mission!, 'marines'))
  })

  it('objectives worth taking and keeping, with the VP at stake', () => {
    const s = battle('outmanoeuvre', 'movement', 2)
    own(s, [EXP_N])
    const stakes = objectiveStakes(s, 'marines')
    // the enemy home: 10 at the end of this turn, and 5 more in the next Command phase (round 3)
    expect(stakes[s.objectives[HOME_E].id].gain).toBe(15)
    // the own home scores nothing on Outmanoeuvre
    expect(stakes[s.objectives[HOME_W].id]).toBeUndefined()
    // a held expansion is worth 5 in the next Command phase
    expect(stakes[s.objectives[EXP_N].id].loss).toBe(5)
    const plan = turnPlan(s, 'marines')
    expect(plan.find((l) => l.kind === 'chance')!.text).toMatch(/Ц2 дом/)
    expect(plan.some((l) => l.kind === 'keep' && /Ц4/.test(l.text))).toBe(true)
  })

  it('in the opponent\'s turn it shows what your next Command phase would give', () => {
    const s = battle('meatgrinder', 'shooting', 2)
    s.activePlayer = 'orks'
    own(s, [CENTRAL])
    const lines = turnPlan(s, 'marines')
    expect(lines.some((l) => /закончить ход/.test(l.text))).toBe(false)
    expect(lines.find((l) => l.kind === 'score')!.text).toMatch(/раунд 3.*\+4/)
  })
})

describe('actions, secondaries and reserves in the plan', () => {
  it('lists the units that can start the mission action in the Shooting phase', () => {
    const s = battle('sabotage', 'shooting', 2)
    const u = trooper(s, 'marines')
    moveUnitTo(s, u.id, { x: 30, y: 8 })
    expect(turnPlan(s, 'marines').some((l) => l.kind === 'action' && l.text.includes(u.name) && /Ц4/.test(l.text))).toBe(true)
  })

  it('says whether each secondary card is met and what it needs', () => {
    const s = scenarioById('strike-force').build(['marines', 'orks'], {}, undefined, { mapId: 'hammerAnvil', layoutId: 'A', primary: 'training' })
    s.round = 2
    s.phase = 'movement'
    s.activePlayer = 'marines'
    s.firstPlayer = 'marines'
    s.secondary!.marines.active = ['centreGround', 'assassination'] as SecondaryId[]
    moveUnitTo(s, trooper(s, 'marines').id, { x: 30, y: 22 })
    const lines = turnPlan(s, 'marines').filter((l) => l.kind === 'secondary')
    expect(lines[0].text).toMatch(/Центр поля.*выполняется: \+5/)
    expect(lines[1].text).toMatch(/Убийство.*убейте вражеского персонажа: «/)
  })

  it('warns in round 3 that reserves must arrive or be destroyed', () => {
    const s = battle('dominance', 'movement', 3)
    toReserve(s, trooper(s, 'marines').id)
    expect(turnPlan(s, 'marines').some((l) => l.kind === 'warn' && /резерве.*уничтожены/.test(l.text))).toBe(true)
  })

  it('nothing on the training boards', () => {
    const s = scenarioById('combat-patrol').build(['marines', 'orks'])
    expect(turnPlan(s, 'marines')).toEqual([])
  })
})
