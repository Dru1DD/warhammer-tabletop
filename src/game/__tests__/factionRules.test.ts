import { describe, expect, it } from 'vitest'
import { scriptedRoller } from '../dice/dice'
import { apply, BATTLE_FOCUS_TOKENS, meleePlan, shootPlan, startGame, validate } from '../engine'
import { alive, inSynapseRange, modelInObjectiveRange, objectiveLevels, unitDistance } from '../gameState'
import { basesOverlap } from '../geometry/geometry'
import { checkCoherency, profileOf, radiusOf } from '../gameState'
import type { Command, GameState } from '../types'
import { battle, endPhase, moveUnitTo, shift, unit } from './helpers'

// Army rules and datasheet abilities of the Tyranids, Necrons and Aeldari, each against scripted dice.

const ok = (s: GameState, c: Command) => expect(validate(s, c)).toEqual({ ok: true })
const bad = (s: GameState, c: Command) => {
  const v = validate(s, c)
  expect(v.ok).toBe(false)
  return v.ok ? '' : v.reason
}
const pos = (s: GameState, id: string, i = 0) => unit(s, id).models[i].pos

describe('Tyranids: Synapse', () => {
  it('a TYRANIDS unit within 6″ of a SYNAPSE unit is in Synapse Range; out of range it is not', () => {
    const s = battle('marines', 'tyranids')
    moveUnitTo(s, 'termagants', { x: pos(s, 'tyrant').x - 4, y: pos(s, 'tyrant').y })
    expect(inSynapseRange(s, unit(s, 'termagants'))).toBe(true)
    expect(inSynapseRange(s, unit(s, 'tyrant'))).toBe(true) // SYNAPSE itself
    shift(s, 'termagants', -12, 0)
    expect(inSynapseRange(s, unit(s, 'termagants'))).toBe(false)
    expect(inSynapseRange(s, unit(s, 'int'))).toBe(false) // other armies never
  })

  it('adds +1 Strength to melee attacks in Synapse Range', () => {
    const s = battle('marines', 'tyranids', 'fight', 'tyranids')
    const horma = unit(s, 'hormagaunts')
    moveUnitTo(s, 'hormagaunts', { x: pos(s, 'tyrant').x - 4, y: pos(s, 'tyrant').y })
    moveUnitTo(s, 'int', { x: pos(s, 'hormagaunts').x - 2, y: pos(s, 'hormagaunts').y })
    const near = meleePlan(s, horma, unit(s, 'int'))[0]
    expect(near.profile.s).toBe(4) // 3 + 1
    expect(near.notes).toContain('Synapse +1 S')
    shift(s, 'hormagaunts', -14, 0)
    moveUnitTo(s, 'int', { x: pos(s, 'hormagaunts').x - 2, y: pos(s, 'hormagaunts').y })
    expect(meleePlan(s, horma, unit(s, 'int'))[0].profile.s).toBe(3)
  })

  // Command phase of the Tyranid player, entered by the opponent ending their turn.
  const toTyranidCommand = (s: GameState, rolls: number[]) => endPhase(s, scriptedRoller(rolls))
  it('battle-shock rolls use 3D6 in Synapse Range and 2D6 outside it', () => {
    const s = battle('marines', 'tyranids', 'fight', 'marines')
    s.fight = null
    moveUnitTo(s, 'termagants', { x: pos(s, 'tyrant').x - 4, y: pos(s, 'tyrant').y })
    unit(s, 'termagants').battleShocked = true
    const inRange = toTyranidCommand(s, [6, 6, 6])
    const e = inRange.diceLog.find((d) => d.title.startsWith('Боевой шок'))!
    expect(e.steps[0].label).toBe('3D6 (Synapse)')
    expect(e.steps[0].dice).toHaveLength(3)
    expect(unit(inRange, 'termagants').battleShocked).toBe(false) // 18 >= Ld 8

    shift(s, 'termagants', -14, 0)
    const out = toTyranidCommand(s, [6, 6])
    const e2 = out.diceLog.find((d) => d.title.startsWith('Боевой шок'))!
    expect(e2.steps[0].label).toBe('2D6')
    expect(e2.steps[0].dice).toHaveLength(2)
  })
})

describe('Tyranids: Shadow in the Warp', () => {
  const cmd: Command = { type: 'callShadow' }
  it('is a once-per-battle Command-phase ability of the Tyranid player', () => {
    const s = battle('marines', 'tyranids', 'command', 'tyranids')
    ok(s, cmd)
    expect(bad(battle('marines', 'tyranids', 'movement', 'tyranids'), cmd)).toContain('фазе командования')
    expect(bad(battle('marines', 'tyranids', 'command', 'marines'), cmd)).toContain('Тиранидов')
    expect(bad(battle('marines', 'orks', 'command', 'marines'), cmd)).toContain('Тиранидов')
  })
  it('every enemy unit tests battle-shock; within 6″ of a SYNAPSE unit with −1', () => {
    const s = battle('marines', 'tyranids', 'command', 'tyranids')
    moveUnitTo(s, 'lt', { x: pos(s, 'tyrant').x - 4, y: pos(s, 'tyrant').y }) // Lieutenant (Ld 6+) beside the Tyrant
    // enemy units in order: lt, int, int2, aint, red. 7 on 2D6 passes Ld 6; with -1 it is 6 -> still passes; use 6: 5 -> fail near Synapse
    const after = apply(s, cmd, scriptedRoller([2, 3, 6, 6, 6, 6, 6, 6, 6, 6]))
    expect(unit(after, 'lt').battleShocked).toBe(true) // 5 - 1 = 4 < 6
    expect(unit(after, 'int').battleShocked).toBe(false) // 12 >= 6
    expect(after.players.tyranids.shadowUsed).toBe(true)
    expect(validate(after, cmd).ok).toBe(false)
  })
})

describe('Tyranids: Hive Tyrant Onslaught aura', () => {
  it('gives units within 6″ Assault and Lethal Hits on ranged weapons', () => {
    const s = battle('marines', 'tyranids', 'shooting', 'tyranids')
    const w = unit(s, 'warriors')
    w.move = 'advance'
    moveUnitTo(s, 'int', { x: pos(s, 'warriors').x - 16, y: pos(s, 'warriors').y })
    const tgt = unit(s, 'int')
    moveUnitTo(s, 'warriors', { x: pos(s, 'tyrant').x + 4, y: pos(s, 'tyrant').y })
    moveUnitTo(s, 'int', { x: pos(s, 'warriors').x - 16, y: pos(s, 'warriors').y })
    const withAura = shootPlan(s, w, tgt)
    expect(withAura.problem).toBeNull() // no weapon has Assault; the aura grants it after an Advance
    expect(withAura.groups.every((g) => g.ctx.lethalHits)).toBe(true)
    shift(s, 'warriors', 0, -14) // out of the Tyrant's 6″ (tyrant stays)
    moveUnitTo(s, 'int', { x: pos(s, 'warriors').x - 16, y: pos(s, 'warriors').y })
    expect(shootPlan(s, w, tgt).problem).not.toBeNull()
  })
})

describe('Tyranids: movement abilities', () => {
  it('Hormagaunts may declare a charge after Advancing (Bounding Leap); Termagants may not', () => {
    const s = battle('marines', 'tyranids', 'charge', 'tyranids')
    moveUnitTo(s, 'int', { x: pos(s, 'hormagaunts').x - 8, y: pos(s, 'hormagaunts').y })
    moveUnitTo(s, 'lt', { x: pos(s, 'termagants').x - 8, y: pos(s, 'termagants').y })
    unit(s, 'hormagaunts').move = 'advance'
    unit(s, 'termagants').move = 'advance'
    ok(s, { type: 'declareCharge', unitId: 'hormagaunts' })
    expect(bad(s, { type: 'declareCharge', unitId: 'termagants' })).toContain('продвинулся')
  })
  it('Tyranid Warriors may shoot and charge after Falling Back (Adaptable Predators)', () => {
    const s = battle('marines', 'tyranids', 'shooting', 'tyranids')
    moveUnitTo(s, 'int', { x: pos(s, 'warriors').x - 10, y: pos(s, 'warriors').y })
    unit(s, 'warriors').move = 'fallBack'
    unit(s, 'termagants').move = 'fallBack'
    ok(s, { type: 'shoot', unitId: 'warriors', targetId: 'int' })
    expect(bad(s, { type: 'shoot', unitId: 'termagants', targetId: 'int' })).toContain('отступил')
    const c = { ...s, phase: 'charge' as const }
    moveUnitTo(c, 'int', { x: pos(c, 'warriors').x - 8, y: pos(c, 'warriors').y })
    ok(c, { type: 'declareCharge', unitId: 'warriors' })
  })
})

describe('Necrons: Reanimation Protocols', () => {
  const endCommand = (s: GameState, rolls: number[]) => apply(s, { type: 'endPhase' }, scriptedRoller(rolls))
  it('revives destroyed non-CHARACTER models (D3), in a legal position, with one wound', () => {
    const s = battle('marines', 'necrons', 'command', 'necrons')
    const w = unit(s, 'nwar')
    for (const m of w.models.slice(0, 4)) m.destroyed = true
    const after = endCommand(s, [5]) // d6 5 -> D3 = 3
    const u = unit(after, 'nwar')
    expect(alive(u)).toHaveLength(6 + 3)
    const revived = u.models.slice(0, 4).filter((m) => !m.destroyed)
    expect(revived).toHaveLength(3)
    expect(revived.every((m) => m.wounds === 1)).toBe(true)
    // legal: inside the board, no overlapping bases, unit coherency intact
    const everyone = after.units.flatMap(alive)
    for (const m of revived) {
      const r = radiusOf(m)
      expect(m.pos.x - r).toBeGreaterThanOrEqual(0)
      expect(everyone.filter((o) => o !== m && basesOverlap(m.pos, r, o.pos, radiusOf(o)))).toHaveLength(0)
    }
    expect(checkCoherency(alive(u).map((m) => ({ m, pos: m.pos })))).toBeNull()
    expect(after.diceLog.at(-1)!.title).toContain('Реанимация')
  })
  it('heals lost wounds first, then revives', () => {
    const s = battle('marines', 'necrons', 'command', 'necrons')
    const sk = unit(s, 'skorp')
    sk.models[0].wounds = 1 // 2 wounds lost
    sk.models[2].destroyed = true
    const after = endCommand(s, [3, 3, 3]) // skorp D3 = 2: heals 2 wounds, no revive left
    expect(unit(after, 'skorp').models[0].wounds).toBe(3)
    expect(unit(after, 'skorp').models[2].destroyed).toBe(true)
  })
  it('Their Number is Legion: a roll of 1 on the D3 may be re-rolled', () => {
    const s = battle('marines', 'necrons', 'command', 'necrons')
    for (const m of unit(s, 'nwar').models.slice(0, 5)) m.destroyed = true
    const after = endCommand(s, [1, 6]) // D3 1 -> re-roll -> 3
    expect(alive(unit(after, 'nwar'))).toHaveLength(5 + 3)
    const e = after.diceLog.at(-1)!.steps[0].dice
    expect(e[1].rerolledFrom).toBe(1)
  })
  it('never exceeds the starting strength and never revives a CHARACTER', () => {
    const s = battle('marines', 'necrons', 'command', 'necrons')
    unit(s, 'nwar').models[0].destroyed = true
    const after = endCommand(s, [6]) // D3 = 3 but only one model is missing
    expect(alive(unit(after, 'nwar'))).toHaveLength(10)
    const o = unit(s, 'overlord')
    o.models[0].wounds = 2
    const healed = endCommand(s, [6, 6]) // the Overlord rolls first, then the Warriors
    expect(unit(healed, 'overlord').models[0].wounds).toBe(5) // D3 = 3 wounds
  })
  it('only the active player reanimates', () => {
    const s = battle('marines', 'necrons', 'command', 'marines')
    unit(s, 'nwar').models[0].destroyed = true
    expect(alive(unit(endCommand(s, []), 'nwar'))).toHaveLength(9)
  })
})

describe('Necrons: Canoptek Scarab Swarms', () => {
  const setup = (targetId: string) => {
    const s = battle('marines', 'necrons', 'charge', 'necrons')
    moveUnitTo(s, targetId, { x: pos(s, 'scarabs').x - 2.5, y: pos(s, 'scarabs').y })
    return s
  }
  it('Self-destruction at the start of the Fight phase: one model dies, the enemy suffers D3 mortal wounds', () => {
    const s = setup('int')
    const before = alive(unit(s, 'int')).reduce((a, m) => a + m.wounds, 0)
    const after = apply(s, { type: 'endPhase' }, scriptedRoller([3, 4])) // d6 3 (2-5) -> D3: d6 4 -> 2
    expect(alive(unit(after, 'scarabs'))).toHaveLength(2)
    expect(before - alive(unit(after, 'int')).reduce((a, m) => a + m.wounds, 0)).toBe(2)
  })
  it('6+ deals 3 mortal wounds; against a VEHICLE the roll gets +1', () => {
    const six = apply(setup('int'), { type: 'endPhase' }, scriptedRoller([6]))
    expect(10 - alive(unit(six, 'int')).reduce((a, m) => a + m.wounds, 0)).toBe(3)
    const veh = apply(setup('red'), { type: 'endPhase' }, scriptedRoller([5])) // 5 + 1 = 6
    expect(12 - unit(veh, 'red').models[0].wounds).toBe(3)
    const one = apply(setup('int'), { type: 'endPhase' }, scriptedRoller([1]))
    expect(alive(unit(one, 'scarabs'))).toHaveLength(2) // the model is lost, nothing happens to the enemy
    expect(alive(unit(one, 'int')).reduce((a, m) => a + m.wounds, 0)).toBe(10)
  })
  it('does not trigger for a swarm that is not engaged', () => {
    const s = battle('marines', 'necrons', 'charge', 'necrons')
    const after = apply(s, { type: 'endPhase' }, scriptedRoller([]))
    expect(alive(unit(after, 'scarabs'))).toHaveLength(3)
  })
  it('Chittering Swarm lowers the OC of enemy models engaged with it (never below 1)', () => {
    const s = battle('marines', 'necrons', 'movement', 'marines')
    const obj = { id: 'o1', pos: { x: 20, y: 15 }, controller: null }
    s.objectives = [obj]
    moveUnitTo(s, 'int', { x: 20, y: 15 })
    const free = objectiveLevels(s, obj).marines
    moveUnitTo(s, 'scarabs', { x: 20, y: 15 + 1.6 })
    expect(unitDistance(unit(s, 'int'), unit(s, 'scarabs'))).toBeLessThanOrEqual(2)
    const onObjective = alive(unit(s, 'int')).filter((m) => modelInObjectiveRange(m, obj)).length
    expect(onObjective).toBeGreaterThan(0)
    expect(objectiveLevels(s, obj).marines).toBe(free - onObjective) // OC 2 -> 1 for every model on the objective
    shift(s, 'scarabs', 10, 0)
    expect(objectiveLevels(s, obj).marines).toBe(free)
  })
})

describe('Aeldari: Battle Focus', () => {
  const guardMove = (s: GameState, d: number) => Object.fromEntries(unit(s, 'guardians').models.map((m) => [m.id, { x: m.pos.x + d, y: m.pos.y }]))
  it('start with 2 tokens at the beginning of the battle', () => {
    expect(startGame(battle('aeldari', 'orks', 'command', 'aeldari'), scriptedRoller([6, 1])).players.aeldari.focus).toBe(BATTLE_FOCUS_TOKENS)
    expect(BATTLE_FOCUS_TOKENS).toBe(2)
  })
  it('Swift as the Wind spends a token for +2″ on the move', () => {
    const s = battle('aeldari', 'orks', 'movement', 'aeldari')
    s.players.aeldari.focus = 2
    const far: Command = { type: 'move', unitId: 'guardians', mode: 'normal', positions: guardMove(s, 8.5) }
    expect(bad(s, far)).toContain('больше допустимых') // M 7
    const swift = { ...far, swift: true } as Command
    ok(s, swift)
    const after = apply(s, swift, scriptedRoller([]))
    expect(after.players.aeldari.focus).toBe(1)
    expect(unit(after, 'guardians').move).toBe('normal')
  })
  it('needs a token, and is an Aeldari-only rule', () => {
    const s = battle('aeldari', 'orks', 'movement', 'aeldari')
    s.players.aeldari.focus = 0
    expect(bad(s, { type: 'move', unitId: 'guardians', mode: 'normal', positions: guardMove(s, 1), swift: true } as Command)).toContain('жетонов')
    const o = battle('marines', 'orks', 'movement', 'marines')
    expect(bad(o, { type: 'move', unitId: 'int', mode: 'normal', positions: {}, swift: true } as Command)).toContain('Аэльдари')
  })
  it('tokens are refreshed when a new battle round begins', () => {
    const s = battle('aeldari', 'orks', 'fight', 'orks') // Orks are the second player: ending their turn starts round 2
    s.fight = null
    s.players.aeldari.focus = 0
    const after = apply(s, { type: 'endPhase' }, scriptedRoller([]))
    expect(after.round).toBe(2)
    expect(after.players.aeldari.focus).toBe(BATTLE_FOCUS_TOKENS)
  })
})

describe('Aeldari: Guide', () => {
  const guide: Command = { type: 'guide', unitId: 'farseer', targetId: 'int' }
  it('marks a visible enemy unit within 18″ and gives friendly AELDARI +1 to hit against it', () => {
    const s = battle('aeldari', 'marines', 'movement', 'aeldari')
    moveUnitTo(s, 'int', { x: pos(s, 'farseer').x + 14, y: pos(s, 'farseer').y })
    ok(s, guide)
    const after = apply(s, guide, scriptedRoller([]))
    expect(after.players.aeldari.guide).toBe('int')
    expect(unit(after, 'farseer').guided).toBe(true)
    expect(validate(after, guide).ok).toBe(false) // once per turn
    moveUnitTo(after, 'avengers', { x: pos(after, 'int').x - 10, y: pos(after, 'int').y })
    const near = shootPlan({ ...after, phase: 'shooting' }, unit(after, 'avengers'), unit(after, 'int'))
    expect(near.problem).toBeNull()
    expect(near.groups[0].ctx.hitMod).toBe(1)
    expect(near.groups[0].ctx.hitModNotes).toContain('Guide +1')
  })
  it('is range- and phase-limited and needs the ability', () => {
    const s = battle('aeldari', 'marines', 'movement', 'aeldari')
    expect(bad(s, guide)).toContain('18')
    expect(bad({ ...s, phase: 'shooting' }, guide)).toContain('фазе движения')
    expect(bad(s, { type: 'guide', unitId: 'guardians', targetId: 'int' })).toContain('нет способности')
  })
  it('lasts until the Aeldari player’s next Command phase', () => {
    const s = battle('aeldari', 'marines', 'fight', 'marines') // Marines are second: ending their turn starts round 2 for Aeldari
    s.fight = null
    s.players.aeldari.guide = 'int'
    const after = apply(s, { type: 'endPhase' }, scriptedRoller([]))
    expect(after.players.aeldari.guide).toBeNull()
  })
})

describe('Aeldari: FLY and unit abilities', () => {
  it('Windriders can only cross dense terrain by taking to the skies (−2″)', () => {
    const s = battle('aeldari', 'orks', 'movement', 'aeldari')
    s.terrain = [{ id: 'w', name: 'Руины', kind: 'ruin', poly: [{ x: 20, y: 20 }, { x: 22, y: 20 }, { x: 22, y: 22 }, { x: 20, y: 22 }], obscuring: true }]
    moveUnitTo(s, 'riders', { x: 18, y: 21 })
    const r = unit(s, 'riders')
    const go = (dx: number) => Object.fromEntries(r.models.map((m) => [m.id, { x: m.pos.x + dx, y: m.pos.y }]))
    const walk: Command = { type: 'move', unitId: 'riders', mode: 'normal', positions: go(6) }
    expect(bad(s, walk)).toContain('плотный тиррейн')
    ok(s, { ...walk, fly: true } as Command)
    expect(bad(s, { type: 'move', unitId: 'riders', mode: 'normal', positions: go(12.5), fly: true } as Command)).toContain('больше допустимых') // 14 - 2 = 12
    expect(bad(s, { type: 'move', unitId: 'guardians', mode: 'normal', positions: {}, fly: true } as Command)).toContain('FLY')
  })
  it('Swift Demise: re-roll 1s, and any miss against the closest target', () => {
    const s = battle('aeldari', 'marines', 'shooting', 'aeldari')
    moveUnitTo(s, 'int', { x: pos(s, 'riders').x - 14, y: pos(s, 'riders').y })
    moveUnitTo(s, 'red', { x: pos(s, 'riders').x - 30, y: pos(s, 'riders').y + 6 })
    const closest = shootPlan(s, unit(s, 'riders'), unit(s, 'int'))
    expect(closest.groups[0].ctx.rerollHits).toBe('all')
    const farther = shootPlan(s, unit(s, 'riders'), unit(s, 'red'))
    expect(farther.groups[0].ctx.rerollHits).toBe('ones')
  })
  it('Bladestorm: Sustained Hits 1 only against a target within half range', () => {
    const s = battle('aeldari', 'marines', 'shooting', 'aeldari')
    moveUnitTo(s, 'int', { x: pos(s, 'avengers').x - 8, y: pos(s, 'avengers').y })
    const near = shootPlan(s, unit(s, 'avengers'), unit(s, 'int'))
    expect(near.groups.some((g) => g.sustainedHits === 1)).toBe(true)
    moveUnitTo(s, 'int', { x: pos(s, 'avengers').x - 15, y: pos(s, 'avengers').y })
    const far = shootPlan(s, unit(s, 'avengers'), unit(s, 'int'))
    expect(far.groups.every((g) => g.sustainedHits === undefined)).toBe(true)
  })
  it('Crewed Platform: the platform is destroyed with the last Guardian Defender', () => {
    const s = battle('aeldari', 'orks', 'movement', 'aeldari')
    const g = unit(s, 'guardians')
    for (const m of g.models) if (!profileOf(m).platform) m.destroyed = true
    expect(alive(g)).toHaveLength(1)
    const after = apply(s, { type: 'endPhase' }, scriptedRoller([]))
    expect(alive(unit(after, 'guardians'))).toHaveLength(0)
  })
  it('the Heavy Weapon Platform is a 2-wound, OC 0 crew model', () => {
    const p = unit(battle('aeldari', 'orks'), 'guardians').models.find((m) => profileOf(m).platform)!
    expect(profileOf(p)).toMatchObject({ w: 2, oc: 0, baseMm: 40 })
  })
})

describe('Necrons: Implacable Resilience', () => {
  it('−1 damage against attacks allocated to the Overlord', () => {
    const s = battle('marines', 'necrons', 'shooting', 'marines')
    moveUnitTo(s, 'overlord', { x: pos(s, 'lt').x + 10, y: pos(s, 'lt').y })
    const plan = shootPlan(s, unit(s, 'lt'), unit(s, 'overlord'))
    expect(plan.problem).toBeNull()
    expect(plan.groups.every((g) => g.ctx.damageMod === -1)).toBe(true)
  })
})
