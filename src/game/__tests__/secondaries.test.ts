import { describe, expect, it } from 'vitest'
import { seededRoller } from '../dice/dice'
import { apply, validate } from '../engine'
import { hasKeyword } from '../gameState'
import { missionTurnStart } from '../rules/missions'
import { FIXED_CARD_CAP, newSecondary, SECONDARY_IDS, SECONDARY_ROUND_CAP, secondaryCommandStart, secondaryTotal, secondaryTurnEnd } from '../rules/secondaries'
import { scenarioById } from '../scenarios/scenarios'
import type { GameState, PlayerId, SecondaryId } from '../types'
import { moveUnitTo } from './helpers'

// hammerAnvil: zones x < 18 (marines, west) and x > 42 (orks, east); objectives: home W, home E, centre, (30,8), (30,36)
function battle(round = 2, active: PlayerId = 'marines', phase: GameState['phase'] = 'fight'): GameState {
  const s = scenarioById('strike-force').build(['marines', 'orks'], {}, undefined, { mapId: 'hammerAnvil', layoutId: 'A', primary: 'training' })
  s.round = round
  s.activePlayer = active
  s.firstPlayer = 'marines'
  s.phase = phase
  missionTurnStart(s)
  return s
}
/** give `p` exactly these active Tactical cards */
const hand = (s: GameState, p: PlayerId, cards: SecondaryId[]) => {
  s.secondary![p].active = [...cards]
  s.secondary![p].deck = SECONDARY_IDS.filter((c) => !cards.includes(c))
}
const trooper = (s: GameState, p: PlayerId, n = 0) => s.units.filter((u) => u.owner === p && hasKeyword(u, 'INFANTRY') && !hasKeyword(u, 'CHARACTER'))[n]
const kill = (s: GameState, id: string) => { for (const m of s.units.find((u) => u.id === id)!.models) m.destroyed = true }

describe('secondary set-up', () => {
  it('Tactical for both by default, Fixed for one side on request, none at all', () => {
    const b = scenarioById('strike-force')
    const d = b.build(['marines', 'orks'], {}, undefined, { mapId: 'hammerAnvil', layoutId: 'A' })
    expect(d.secondary!.marines.mode).toBe('tactical')
    expect(d.secondary!.orks.deck).toHaveLength(16)
    const f = b.build(['marines', 'orks'], {}, undefined, { mapId: 'hammerAnvil', layoutId: 'A', secondaries: { marines: { mode: 'fixed', fixed: ['engageAllFronts', 'assassination'] } } })
    expect(f.secondary!.marines.active).toEqual(['engageAllFronts', 'assassination'])
    expect(f.secondary!.orks.mode).toBe('tactical')
    expect(b.build(['marines', 'orks'], {}, undefined, { mapId: 'hammerAnvil', layoutId: 'A', secondaries: 'none' }).secondary).toBeUndefined()
    // the Fixed side takes only Fixed cards
    expect(newSecondary('fixed', ['centreGround' as SecondaryId]).active).toHaveLength(2)
  })

  it('draws two cards at the start of the Command phase; cards it cannot score in round 1 are replaced', () => {
    const s = battle(1, 'marines', 'command')
    s.secondary!.marines.deck = ['defendStronghold', 'behindEnemyLines', 'centreGround', 'noPrisoners', ...SECONDARY_IDS.filter((c) => !['defendStronghold', 'behindEnemyLines', 'centreGround', 'noPrisoners'].includes(c))]
    secondaryCommandStart(s)
    expect(s.secondary!.marines.active).toEqual(['centreGround', 'noPrisoners'])
    // the two replaced cards went back to the bottom of the deck
    expect(s.secondary!.marines.deck.slice(-2)).toEqual(['defendStronghold', 'behindEnemyLines'])
  })
})

describe('secondary scoring', () => {
  it('No Prisoners: 2 per enemy unit this turn, up to 5; the Tactical card is then put away', () => {
    const s = battle()
    hand(s, 'marines', ['noPrisoners'])
    const orks = s.units.filter((u) => u.owner === 'orks')
    for (const u of orks.slice(0, 3)) kill(s, u.id)
    secondaryTurnEnd(s)
    expect(secondaryTotal(s.secondary!.marines)).toBe(5)
    expect(s.secondary!.marines.active).toEqual([])
    expect(s.secondary!.marines.achieved[0]).toMatchObject({ card: 'noPrisoners', vp: 5 })
    expect(s.players.marines.vp).toBe(5)
  })

  it('a kill card scores in the opponent\'s turn too', () => {
    const s = battle(2, 'orks')
    hand(s, 'marines', ['noPrisoners'])
    kill(s, trooper(s, 'orks').id)
    secondaryTurnEnd(s)
    expect(secondaryTotal(s.secondary!.marines)).toBe(2)
  })

  it('Behind Enemy Lines: 3 per unit wholly in the enemy zone, at the end of your turn', () => {
    const s = battle()
    hand(s, 'marines', ['behindEnemyLines'])
    const u = trooper(s, 'marines')
    moveUnitTo(s, u.id, { x: 50, y: 4 })
    for (const m of u.models) m.pos = { x: Math.max(m.pos.x, 44), y: m.pos.y }
    secondaryTurnEnd(s)
    expect(secondaryTotal(s.secondary!.marines)).toBe(3)
  })

  it('Centre Ground: 5 when no enemy is within 6″ of the centre', () => {
    const s = battle()
    hand(s, 'marines', ['centreGround'])
    moveUnitTo(s, trooper(s, 'marines').id, { x: 30, y: 22 })
    secondaryTurnEnd(s)
    expect(secondaryTotal(s.secondary!.marines)).toBe(5)
  })

  it('Defend Stronghold scores at the end of the opponent\'s turn, not your own', () => {
    const s = battle(2, 'marines')
    hand(s, 'marines', ['defendStronghold'])
    s.objectives[0].controller = 'marines'
    s.objectives[0].held = 'marines'
    secondaryTurnEnd(s)
    expect(secondaryTotal(s.secondary!.marines)).toBe(0)
    s.activePlayer = 'orks'
    secondaryTurnEnd(s)
    expect(secondaryTotal(s.secondary!.marines)).toBe(5)
  })

  it('a Fixed card stays and scores again, up to 20', () => {
    const s = battle()
    s.secondary!.marines = newSecondary('fixed', ['grievousBlow', 'assassination'])
    const big = s.units.filter((u) => u.owner === 'orks' && u.startingModels >= 13)
    expect(big.length).toBeGreaterThan(0)
    kill(s, big[0].id)
    secondaryTurnEnd(s)
    expect(s.secondary!.marines.cardVp.grievousBlow).toBe(4)
    expect(s.secondary!.marines.active).toContain('grievousBlow')
    s.secondary!.marines.cardVp.grievousBlow = 18
    s.round = 3
    missionTurnStart(s)
    kill(s, big[1]?.id ?? s.units.find((u) => u.owner === 'orks' && u.startingModels >= 13 && u.models.some((m) => !m.destroyed))?.id ?? big[0].id)
    secondaryTurnEnd(s)
    expect(s.secondary!.marines.cardVp.grievousBlow).toBeLessThanOrEqual(FIXED_CARD_CAP)
  })

  it('15 secondary VP per round at most', () => {
    const s = battle()
    hand(s, 'marines', ['noPrisoners', 'centreGround'])
    s.secondary!.marines.byRound[2] = 12
    for (const u of s.units.filter((x) => x.owner === 'orks').slice(0, 3)) kill(s, u.id)
    moveUnitTo(s, trooper(s, 'marines').id, { x: 30, y: 22 })
    secondaryTurnEnd(s)
    expect(s.secondary!.marines.byRound[2]).toBe(SECONDARY_ROUND_CAP)
  })
})

describe('the player\'s choices', () => {
  it('swap a card for 1 CP once per battle, in your Command phase', () => {
    const r = seededRoller(1)
    let s = battle(2, 'marines', 'command')
    hand(s, 'marines', ['centreGround', 'outflank'])
    s.players.marines.cp = 2
    const cmd = { type: 'secondary' as const, op: 'swap' as const, card: 'outflank' as SecondaryId }
    expect(validate(s, cmd).ok).toBe(true)
    s = apply(s, cmd, r)
    expect(s.players.marines.cp).toBe(1)
    expect(s.secondary!.marines.active).toHaveLength(2)
    expect(s.secondary!.marines.active).not.toContain('outflank')
    expect(validate(s, { ...cmd, card: s.secondary!.marines.active[1] }).ok).toBe(false)
  })

  it('a card marked for discarding goes at the end of the turn, after scoring, for 1 CP', () => {
    const r = seededRoller(2)
    let s = battle(2, 'marines', 'shooting')
    hand(s, 'marines', ['outflank', 'centreGround'])
    moveUnitTo(s, trooper(s, 'marines').id, { x: 30, y: 22 })
    s = apply(s, { type: 'secondary', op: 'discard', card: 'outflank' }, r)
    s = apply(s, { type: 'secondary', op: 'discard', card: 'centreGround' }, r)
    const cp = s.players.marines.cp
    secondaryTurnEnd(s)
    // Centre Ground was achieved, so it scores instead of being discarded
    expect(s.secondary!.marines.achieved.map((a) => a.card)).toEqual(['centreGround'])
    expect(s.secondary!.marines.discarded).toEqual(['outflank'])
    expect(s.players.marines.cp).toBe(cp + 1)
  })

  it('not in the opponent\'s turn, and never for Fixed cards', () => {
    const s = battle(2, 'orks', 'shooting')
    hand(s, 'marines', ['outflank'])
    expect(validate(s, { type: 'secondary', op: 'discard', card: 'outflank' }).ok).toBe(false)
    s.activePlayer = 'marines'
    s.secondary!.marines = newSecondary('fixed')
    expect(validate(s, { type: 'secondary', op: 'discard', card: 'assassination' }).ok).toBe(false)
  })
})
