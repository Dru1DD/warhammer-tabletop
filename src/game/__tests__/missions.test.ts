import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { seededRoller } from '../dice/dice'
import { apply, startGame, unitActions, validate } from '../engine'
import { hasKeyword, updateObjectiveControl } from '../gameState'
import { missionBattleEnd, missionCommandEnd, missionTurnEnd, missionTurnStart, PRIMARY_CAP, primaryTotal, ROUND_CAP } from '../rules/missions'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, PlayerId, PrimaryId } from '../types'
import { endPhase, moveUnitTo } from './helpers'

// hammerAnvil objectives, in order: home west (9,22), home east (51,22), central (30,22), expansions (30,8) and (30,36)
const HOME_W = 0, HOME_E = 1, CENTRAL = 2, EXP_N = 3, EXP_S = 4

function battle(primary: PrimaryId | 'training', phase: GameState['phase'] = 'shooting', round = 2): GameState {
  const s = scenarioById('strike-force').build(['marines', 'orks'], {}, undefined, { mapId: 'hammerAnvil', layoutId: 'A', primary })
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
const vp = (s: GameState, p: PlayerId = 'marines') => primaryTotal(s.mission!, p)
/** an infantry unit of the side, not a character */
const trooper = (s: GameState, p: PlayerId, n = 0) => s.units.filter((u) => u.owner === p && hasKeyword(u, 'INFANTRY') && !hasKeyword(u, 'CHARACTER'))[n]

describe('the 44″×60″ battle chooses a primary mission', () => {
  it('a random mission by default, the chosen one, or the training score', () => {
    const b = scenarioById('strike-force')
    expect(b.build(['marines', 'orks'], {}, undefined, { mapId: 'hammerAnvil', layoutId: 'A' }).mission).toBeDefined()
    expect(b.build(['marines', 'orks'], {}, undefined, { mapId: 'hammerAnvil', layoutId: 'A', primary: 'sabotage' }).mission!.primary).toBe('sabotage')
    expect(b.build(['marines', 'orks'], {}, undefined, { mapId: 'hammerAnvil', layoutId: 'A', primary: 'training' }).mission).toBeUndefined()
    // the 44″×30″ board keeps the training score
    expect(scenarioById('combat-patrol').build(['marines', 'orks']).mission).toBeUndefined()
  })
})

describe('primary scoring', () => {
  it('Battlefield Dominance: 3 per objective, +2 for each non-home one while the home is held', () => {
    const s = battle('dominance', 'command')
    own(s, [HOME_W, CENTRAL, EXP_N])
    missionCommandEnd(s)
    expect(vp(s)).toBe(9 + 4)
    expect(s.players.marines.vp).toBe(13)
  })

  it('15 VP per round at most, 45 per battle', () => {
    const s = battle('dominance', 'command')
    own(s, [HOME_W, CENTRAL, EXP_N, EXP_S, HOME_E])
    missionCommandEnd(s)
    expect(vp(s)).toBe(ROUND_CAP)
    for (const r of [3, 4]) { s.round = r; missionCommandEnd(s) }
    expect(vp(s)).toBe(PRIMARY_CAP)
    s.round = 5
    missionTurnEnd(s)
    expect(vp(s)).toBe(PRIMARY_CAP)
  })

  it('round 1 and the first Command phase score nothing on the Command-phase line', () => {
    const s = battle('meatgrinder', 'command', 1)
    own(s, [CENTRAL])
    missionCommandEnd(s)
    expect(vp(s)).toBe(0)
  })

  it('Outmanoeuvre: 10 for the enemy home at the end of the turn, plus 4 per objective in round 1', () => {
    const s = battle('outmanoeuvre', 'fight', 1)
    own(s, [HOME_E, HOME_W])
    missionTurnEnd(s)
    // the enemy home: 10, and it is a non-home objective for us: 4 (our own home does not count)
    expect(vp(s)).toBe(14)
    const t = battle('outmanoeuvre', 'fight', 1)
    own(t, [HOME_E, CENTRAL])
    missionTurnEnd(t)
    // 10 + 2 × 4, but only 15 in a round
    expect(vp(t)).toBe(ROUND_CAP)
  })

  it('Meatgrinder: 3 for a kill this turn, 5 when more died than were lost last turn', () => {
    const s = battle('meatgrinder', 'fight', 2)
    for (const m of trooper(s, 'orks').models) m.destroyed = true
    own(s, [])
    missionTurnEnd(s)
    expect(vp(s)).toBe(3 + 5)
    expect(s.mission!.lostLastTurn.orks).toBe(1)
  })

  it('Meatgrinder at the end of the battle: 5 for the enemy home (outside the round cap)', () => {
    const s = battle('meatgrinder', 'fight', 5)
    s.mission!.byRound.marines[5] = ROUND_CAP
    own(s, [HOME_E])
    missionBattleEnd(s)
    expect(s.mission!.endVp!.marines).toBe(5)
  })

  it('the training score still pays 5 per objective from round 2', () => {
    const r = seededRoller(3)
    let s = battle('training', 'command', 2)
    s.mission = undefined
    const u = trooper(s, 'marines')
    moveUnitTo(s, u.id, { x: 30, y: 8 })
    updateObjectiveControl(s)
    s.phase = 'fight'
    s = endPhase(s, r) // marines' turn ends; the orks' Command phase scores for the orks only
    expect(s.players.marines.vp).toBe(0)
  })
})

describe('mission actions', () => {
  it('Sabotage: started in the Shooting phase at an objective other than the home one; no shooting or charge after', () => {
    const r = seededRoller(1)
    let s = battle('sabotage')
    const u = trooper(s, 'marines')
    moveUnitTo(s, u.id, { x: 9, y: 22 })
    expect(validate(s, { type: 'startAction', unitId: u.id, objectiveId: s.objectives[HOME_W].id }).ok).toBe(false)
    moveUnitTo(s, u.id, { x: 30, y: 8 })
    const cmd = { type: 'startAction' as const, unitId: u.id, objectiveId: s.objectives[EXP_N].id }
    expect(validate(s, cmd)).toEqual({ ok: true })
    expect(unitActions(s, u.id).some((a) => a.id === `action:${s.objectives[EXP_N].id}` && a.ok)).toBe(true)
    s = apply(s, cmd, r)
    const e = s.units.find((x) => x.owner === 'orks')!
    expect(validate(s, { type: 'shoot', unitId: u.id, targetId: e.id }).ok).toBe(false)
    s.phase = 'charge'
    expect(validate(s, { type: 'declareCharge', unitId: u.id }).ok).toBe(false)
    // a second unit cannot start at the same objective
    const v = trooper(s, 'marines', 1)
    moveUnitTo(s, v.id, { x: 31, y: 10 })
    s.phase = 'shooting'
    expect(validate(s, { type: 'startAction', unitId: v.id, objectiveId: s.objectives[EXP_N].id }).ok).toBe(false)
  })

  it('Sabotage completes at the end of the turn when the objective is held: 3 VP', () => {
    const r = seededRoller(2)
    let s = battle('sabotage')
    const u = trooper(s, 'marines')
    moveUnitTo(s, u.id, { x: 30, y: 8 })
    s = apply(s, { type: 'startAction', unitId: u.id, objectiveId: s.objectives[EXP_N].id }, r)
    s.phase = 'fight'
    s.fight = null
    s = endPhase(s, r)
    expect(s.activePlayer).toBe('orks')
    expect(s.mission!.byRound.marines[2]).toBeGreaterThanOrEqual(3)
    expect(s.units.find((x) => x.id === u.id)!.action).toBeUndefined()
  })

  it('Sabotage in enemy territory is worth 2 more', () => {
    const s = battle('sabotage', 'fight')
    const u = trooper(s, 'marines')
    moveUnitTo(s, u.id, { x: 51, y: 22 })
    u.action = { id: 'sabotage', objectiveId: s.objectives[HOME_E].id }
    own(s, [HOME_E])
    missionTurnEnd(s)
    expect(vp(s)).toBe(5)
  })

  it('Extract Intelligence: from round 2, places an operation marker, 7 VP; not twice at the same objective', () => {
    const r = seededRoller(4)
    let s = battle('gatherIntel', 'shooting', 1)
    const u = trooper(s, 'marines')
    moveUnitTo(s, u.id, { x: 30, y: 8 })
    const cmd = { type: 'startAction' as const, unitId: u.id, objectiveId: s.objectives[EXP_N].id }
    expect(validate(s, cmd).ok).toBe(false)
    s.round = 2
    s = apply(s, cmd, r)
    s.phase = 'fight'
    s.fight = null
    s = endPhase(s, r)
    expect(s.mission!.markers).toEqual([{ owner: 'marines', objectiveId: s.objectives[EXP_N].id }])
    expect(s.mission!.byRound.marines[2]).toBeGreaterThanOrEqual(7)
    s.activePlayer = 'marines'
    s.phase = 'shooting'
    s.round = 3
    expect(validate(s, cmd).ok).toBe(false)
  })

  it('Gather Intel at the end of the battle: three markers, and one at the enemy home', () => {
    const s = battle('gatherIntel', 'fight', 5)
    s.mission!.markers = [EXP_N, EXP_S, HOME_E].map((i) => ({ owner: 'marines' as PlayerId, objectiveId: s.objectives[i].id }))
    missionBattleEnd(s)
    expect(s.mission!.endVp!.marines).toBe(10)
  })
})

describe('the AI plays the mission', () => {
  it('starts Sabotage with a unit on a held objective that has nothing to shoot', () => {
    const s = battle('sabotage')
    const u = trooper(s, 'marines')
    moveUnitTo(s, u.id, { x: 30, y: 8 })
    // every other marine has already acted; the orks are far away in their zone
    for (const x of s.units) if (x.owner === 'marines' && x.id !== u.id) x.shot = true
    for (const e of s.units.filter((x) => x.owner === 'orks')) for (const m of e.models) m.pos = { x: Math.max(m.pos.x, 58), y: m.pos.y }
    const d = decide(s, 'standard')
    expect(d?.cmd).toMatchObject({ type: 'startAction', unitId: u.id })
  })

  it('a whole AI-vs-AI battle with a mission ends with the primary VP within the cap', { timeout: 300_000 }, () => {
    const r = seededRoller(7)
    let s = startGame(scenarioById('strike-force').build(['adeptus_mechanicus', 'orks'], {}, undefined, { mapId: 'hammerAnvil', layoutId: 'B', primary: 'sabotage' }), r)
    let actions = 0
    for (let i = 0; i < 4000 && !s.winner; i++) {
      const d = decide(s, 'standard')!
      if (d.cmd.type === 'startAction') actions++
      s = apply(s, d.cmd, r)
    }
    expect(s.winner).toBeTruthy()
    for (const p of ['adeptus_mechanicus', 'orks'] as PlayerId[]) {
      expect(primaryTotal(s.mission!, p)).toBeLessThanOrEqual(PRIMARY_CAP)
      for (const v of s.mission!.byRound[p]) expect(v).toBeLessThanOrEqual(ROUND_CAP)
      // Tactical secondaries are on by default: drawn, scored within their caps
      const sec = s.secondary![p]
      expect(sec.byRound.reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(45)
      expect(sec.achieved.length + sec.active.length + sec.discarded.length).toBeGreaterThan(0)
    }
    expect(actions).toBeGreaterThan(0)
  })
})

