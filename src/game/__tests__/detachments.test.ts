import { describe, expect, it } from 'vitest'
import { chooseHyper, decide } from '../ai/ai'
import { resolveGroup, type AttackContext } from '../combat/attack'
import { scriptedRoller, seededRoller } from '../dice/dice'
import { actor, apply, hyperPending, meleePlan, shootPlan, startGame, swiftBonusOf, validate } from '../engine'
import { decodeArmy, encodeArmy } from '../army/armyCode'
import { parseArmyList, presetList } from '../army/armyList'
import { stratagemAvailability } from '../rules/stratagems'
import { scenarioById } from '../scenarios/scenarios'
import { alive, profileOf } from '../gameState'
import { doctrineLeft } from '../rules/detachments'
import type { Command, GameState, WeaponProfile } from '../types'
import { battle, column, place, unit } from './helpers'

const only = (s: GameState, keep: string[]) => { for (const u of s.units) if (!keep.includes(u.id)) place(s, u.id, []) }

describe('Get Stuck In (Orks, War Horde)', () => {
  it("the Orks' melee attacks have Sustained Hits 1; other armies' do not", () => {
    const s = battle('marines', 'orks', 'fight', 'orks')
    only(s, ['boyz', 'int'])
    place(s, 'int', column(10, 10, 5, 1.2))
    place(s, 'boyz', column(11.2, 10, 10, 1.2))
    const orks = meleePlan(s, unit(s, 'boyz'), unit(s, 'int'))
    expect(orks.every((g) => (g.profile.keywords.sustainedHits ?? 0) >= 1)).toBe(true)
    expect(orks[0].notes.join(' ')).toContain('Ввяжись в драку')
    expect(meleePlan(s, unit(s, 'int'), unit(s, 'boyz')).every((g) => !g.notes.join(' ').includes('Ввяжись'))).toBe(true)
  })
})

describe('Command Protocols (Necrons, Awakened Dynasty)', () => {
  it('+1 to hit while a Necrons CHARACTER leads the unit', () => {
    const s = battle('marines', 'necrons', 'shooting', 'necrons')
    only(s, ['nwar', 'overlord', 'int'])
    place(s, 'nwar', column(30, 8, 10, 1.2))
    place(s, 'int', column(14, 10, 5, 1.2))
    place(s, 'overlord', [{ x: 31.5, y: 9 }])
    const led = shootPlan(s, unit(s, 'nwar'), unit(s, 'int')).groups[0].ctx
    expect(led.hitModNotes).toContain('Командные протоколы +1')
    place(s, 'overlord', [{ x: 40, y: 28 }])
    expect(shootPlan(s, unit(s, 'nwar'), unit(s, 'int')).groups[0].ctx.hitModNotes).not.toContain('Командные протоколы +1')
  })
})

describe('Hyper-adaptations (Tyranids, Invasion Fleet)', () => {
  it('the battle waits for the choice: the Tyranids decide first, nothing else is accepted', () => {
    const s = startGame(battle('marines', 'tyranids', 'command', 'marines'), seededRoller(3))
    expect(hyperPending(s)).toBe(true)
    expect(actor(s)).toBe('tyranids')
    expect(validate(s, { type: 'endPhase' }).ok).toBe(false)
    const after = apply(s, { type: 'hyperAdaptation', choice: 'aggression' }, seededRoller(3))
    expect(hyperPending(after)).toBe(false)
    expect(after.players.tyranids.hyperAdaptation).toBe('aggression')
    expect(validate(after, { type: 'hyperAdaptation', choice: 'swarming' }).ok).toBe(false)
  })

  it('each choice changes the attacks on its kind of target', () => {
    const s = battle('marines', 'tyranids', 'shooting', 'tyranids')
    only(s, ['termagants', 'int', 'red', 'lt'])
    place(s, 'termagants', column(20, 8, 10, 1.2))
    place(s, 'int', column(30, 6, 5, 1.2))
    place(s, 'red', [{ x: 30, y: 16 }])
    place(s, 'lt', [{ x: 30, y: 22 }])
    const ctx = (target: string) => shootPlan(s, unit(s, 'termagants'), unit(s, target)).groups
    s.players.tyranids.hyperAdaptation = 'swarming'
    expect(ctx('int').every((g) => (g.sustainedHits ?? g.profile.keywords.sustainedHits ?? 0) >= 1)).toBe(true)
    s.players.tyranids.hyperAdaptation = 'aggression'
    expect(ctx('red').every((g) => g.ctx.lethalHits)).toBe(true)
    expect(ctx('int').some((g) => g.ctx.lethalHits && !g.profile.keywords.lethalHits)).toBe(false)
    s.players.tyranids.hyperAdaptation = 'predators'
    expect(ctx('lt').every((g) => g.ctx.critPrecision)).toBe(true)
  })

  it('Precision only for critical hits: a crit wound goes to the CHARACTER, a normal one does not', () => {
    const target = () => {
      const s = battle('marines', 'tyranids')
      const u = unit(s, 'int')
      u.models[0].profileId = 'lieutenant' // a character model in the unit, at full wounds
      u.models[0].wounds = profileOf(u.models[0]).w
      return u
    }
    const p = { name: '', range: 24, attacks: 1, skill: 3, s: 10, ap: -3, d: 1, keywords: {} } as WeaponProfile
    const ctx: AttackContext = { hitMod: 0, hitModNotes: [], skillWorsen: 0, lethalHits: false, critPrecision: true }
    const hit = (die: number) => {
      const t = target()
      resolveGroup(scriptedRoller([die, 6, 1]), 'A', { weaponName: 'W', profile: p, models: 1, attacks: 1, notes: [] }, t, ctx)
      return t.models.find((m) => m.wounds < profileOf(m).w || m.destroyed)
    }
    expect(profileOf(hit(6)!).character).toBe(true)
    expect(profileOf(hit(4)!).character).toBeFalsy()
  })

  it('the AI picks Hyper-aggression against vehicles and monsters, Swarming Instincts against infantry', () => {
    const vsOrks = battle('orks', 'tyranids')
    expect(chooseHyper(vsOrks, 'tyranids').choice).toBe('swarming')
    const vsDread = battle('orks', 'tyranids')
    only(vsDread, ['dread', 'tyrant'])
    expect(chooseHyper(vsDread, 'tyranids').choice).toBe('aggression')
    const s = startGame(battle('marines', 'tyranids', 'command', 'marines'), seededRoller(3))
    expect(decide(s, 'standard')!.cmd.type).toBe('hyperAdaptation')
  })
})

describe('Combat Doctrines and Codex Discipline (Space Marines, Gladius Task Force)', () => {
  const pick = (d: 'assault' | 'devastator' | 'tactical'): Command => ({ type: 'doctrine', doctrine: d })

  it('one per Command phase; each once per battle, one of them twice', () => {
    expect(doctrineLeft([], 'assault')).toBe(true)
    expect(doctrineLeft(['assault'], 'assault')).toBe(true) // the Codex Discipline repeat
    expect(doctrineLeft(['assault', 'assault'], 'assault')).toBe(false)
    expect(doctrineLeft(['assault', 'assault'], 'tactical')).toBe(true)
    expect(doctrineLeft(['assault', 'assault', 'tactical'], 'tactical')).toBe(false)
    const s = battle('marines', 'orks', 'command', 'marines')
    const once = apply(s, pick('devastator'), scriptedRoller([]))
    expect(once.players.marines.doctrine).toBe('devastator')
    expect(validate(once, pick('assault')).ok).toBe(false) // one per phase
    expect(validate(battle('marines', 'orks', 'movement', 'marines'), pick('assault')).ok).toBe(false)
    expect(validate(battle('orks', 'marines', 'command', 'orks'), pick('assault')).ok).toBe(false)
  })

  it('Assault: charge after an advance; Tactical: shoot after falling back; Devastator: every gun after an advance', () => {
    const s = battle('marines', 'orks', 'charge', 'marines')
    only(s, ['aint', 'boyz'])
    place(s, 'aint', column(10, 10, 5, 1.2))
    place(s, 'boyz', column(18, 10, 10, 1.2))
    unit(s, 'aint').move = 'advance'
    const charge: Command = { type: 'declareCharge', unitId: 'aint' }
    expect(validate(s, charge).ok).toBe(false)
    s.players.marines.doctrine = 'assault'
    expect(validate(s, charge).ok).toBe(true)

    const t = battle('marines', 'orks', 'shooting', 'marines')
    only(t, ['int', 'boyz'])
    place(t, 'int', column(10, 10, 5, 1.2))
    place(t, 'boyz', column(20, 10, 10, 1.2))
    unit(t, 'int').move = 'fallBack'
    const shoot: Command = { type: 'shoot', unitId: 'int', targetId: 'boyz' }
    expect(validate(t, shoot).ok).toBe(false)
    t.players.marines.doctrine = 'tactical'
    expect(validate(t, shoot).ok).toBe(true)

    unit(t, 'int').move = 'advance'
    t.players.marines.doctrine = null
    const before = shootPlan(t, unit(t, 'int'), unit(t, 'boyz')).groups.length
    t.players.marines.doctrine = 'devastator'
    expect(shootPlan(t, unit(t, 'int'), unit(t, 'boyz')).groups.length).toBeGreaterThan(before)
  })

  it('the doctrine ends at the start of the Marines\' next Command phase', () => {
    const s = battle('marines', 'orks', 'fight', 'orks') // the Orks end their turn: round 2, Marines' Command phase
    s.fight = null
    s.players.marines.doctrine = 'tactical'
    const after = apply(s, { type: 'endPhase' }, seededRoller(1))
    expect(after.activePlayer).toBe('marines')
    expect(after.players.marines.doctrine ?? null).toBeNull()
  })
})

describe('Rad-bombardment (Adeptus Mechanicus, Rad-Zone Corps)', () => {
  it('at the start of the battle every enemy unit in its deployment zone is bombarded; a fragile one takes cover', () => {
    const s = startGame(battle('adeptus_mechanicus', 'orks', 'command', 'adeptus_mechanicus'), seededRoller(4))
    const hits = s.diceLog.filter((d) => d.title.startsWith('Радиационная бомбардировка'))
    expect(hits.length).toBeGreaterThan(0)
    const boyz = s.diceLog.find((d) => d.title.includes('Бойз'))
    expect(boyz?.steps[0].target).toBe('3+') // a big mob stands firm
  })

  it('a unit with 3 wounds or fewer takes cover: battle-shocked, mortal wounds only on 5+', () => {
    const s = battle('adeptus_mechanicus', 'orks', 'command', 'adeptus_mechanicus')
    only(s, ['boyz', 'dominus'])
    const boyz = unit(s, 'boyz')
    boyz.models.slice(2).forEach((m) => { m.destroyed = true })
    // roll-off 6:1 (the Mechanicus first), then the bombardment D6 = 4: under the 5+ of a unit in cover
    const started = startGame(s, scriptedRoller([6, 1, 4]))
    const b = unit(started, 'boyz')
    const entry = started.diceLog.find((d) => d.title === `Радиационная бомбардировка: ${b.name}`)!
    expect(entry.steps[0].target).toBe('5+')
    expect(b.battleShocked).toBe(true)
    expect(alive(b)).toHaveLength(2)
  })

  it('Fallout in the Mechanicus Command phase from round 2: 3+ — 1 mortal wound and a Battle-shock test', () => {
    const s = battle('adeptus_mechanicus', 'orks', 'fight', 'orks')
    s.fight = null
    const after = apply(s, { type: 'endPhase' }, seededRoller(2))
    expect(after.round).toBe(2)
    expect(after.diceLog.some((d) => d.title.startsWith('Радиоактивные осадки'))).toBe(true)
  })
})

describe('a pure custom army (no detachment)', () => {
  const custom = <F extends 'orks' | 'marines' | 'tyranids' | 'adeptus_mechanicus' | 'aeldari'>(f: F) => ({ ...presetList(f, 500), noDetachment: true as const })

  it('the flag survives storage and the army code, and the scenario marks the side', () => {
    const list = custom('orks')
    expect(parseArmyList(JSON.parse(JSON.stringify(list)))).toEqual(list)
    expect(decodeArmy(encodeArmy('orks', list))).toMatchObject({ ok: true, list: { noDetachment: true } })
    const s = scenarioById('combat-patrol').build(['marines', 'orks'], { orks: list })
    expect(s.players.orks.noDetachment).toBe(true)
    expect(s.players.marines.noDetachment).toBeFalsy()
  })

  it('no detachment rule: no Get Stuck In, no Hyper-adaptation, no Rad-bombardment, no Martial Grace, no Codex Discipline repeat', () => {
    const o = scenarioById('combat-patrol').build(['marines', 'orks'], { orks: custom('orks') })
    o.phase = 'fight'
    const boyz = o.units.find((u) => u.owner === 'orks' && u.datasheetId === 'boyz')!
    const foe = o.units.find((u) => u.owner === 'marines')!
    expect(meleePlan(o, boyz, foe).some((g) => g.notes.join(' ').includes('Ввяжись'))).toBe(false)

    const t = startGame(scenarioById('combat-patrol').build(['marines', 'tyranids'], { tyranids: custom('tyranids') }), seededRoller(3))
    expect(hyperPending(t)).toBe(false)

    const m = startGame(scenarioById('combat-patrol').build(['adeptus_mechanicus', 'orks'], { adeptus_mechanicus: custom('adeptus_mechanicus') }), seededRoller(4))
    expect(m.diceLog.some((d) => d.title.startsWith('Радиационная бомбардировка'))).toBe(false)

    const a = startGame(scenarioById('combat-patrol').build(['aeldari', 'orks'], { aeldari: custom('aeldari') }), seededRoller(5))
    expect(a.players.aeldari.focus).toBe(2)
    expect(swiftBonusOf(a, 'aeldari')).toBe(2)

    const sm = scenarioById('combat-patrol').build(['marines', 'orks'], { marines: custom('marines') })
    sm.phase = 'command'
    sm.activePlayer = 'marines'
    sm.players.marines.doctrinesUsed = ['assault']
    expect(validate(sm, { type: 'doctrine', doctrine: 'assault' }).ok).toBe(false) // no Codex Discipline repeat
    expect(validate(sm, { type: 'doctrine', doctrine: 'tactical' }).ok).toBe(true) // the army rule stays
  })

  it('only the core Stratagems: detachment ones are refused, and the army screen says why', () => {
    const s = scenarioById('combat-patrol').build(['marines', 'orks'], { orks: custom('orks') })
    s.phase = 'shooting'
    s.activePlayer = 'orks'
    const boyz = s.units.find((u) => u.owner === 'orks' && u.datasheetId === 'boyz')!
    const v = validate(s, { type: 'stratagem', id: 'closeRangeDakka', unitId: boyz.id })
    expect(v.ok).toBe(false)
    expect(!v.ok && v.reason).toContain('без детачмента')
    const avail = stratagemAvailability('orks', ['boyz'], true)
    expect(avail.filter((a) => a.info.faction).every((a) => !a.available)).toBe(true)
    expect(avail.some((a) => !a.info.faction && a.available)).toBe(true)
  })
})
