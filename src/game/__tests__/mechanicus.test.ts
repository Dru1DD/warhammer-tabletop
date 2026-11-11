import { describe, expect, it } from 'vitest'
import { decide } from '../ai/ai'
import { pickModelForDamage } from '../combat/attack'
import { ABILITY_TEXT, DATASHEETS, PROFILES, WEAPONS } from '../data/datasheets'
import { scriptedRoller, seededRoller } from '../dice/dice'
import { apply, meleePlan, shootPlan, startGame, validate } from '../engine'
import { alive, feelNoPainOf, ledUnitOf, objectiveLevels, profileOf, unitDistance, unitsOf, updateObjectiveControl } from '../gameState'
import { rect } from '../geometry/geometry'
import { deploymentIssues, deploymentProblem } from '../rules/deployment'
import { deserialize, serialize } from '../persistence'
import { armyOf, scenarioById } from '../scenarios/scenarios'
import type { Command, GameState, Terrain } from '../types'
import { battle, endPhase, moveUnitTo, shift, unit } from './helpers'

// Adeptus Mechanicus (11th edition, Wahapedia, checked 2026-11-09): datasheets, army rule, abilities, AI. See docs/mechanicus.md.

const AM = 'adeptus_mechanicus' as const
const mech = (phase: Parameters<typeof battle>[2] = 'movement', active: 'adeptus_mechanicus' | 'marines' = AM, foe: 'marines' | 'orks' = 'marines') => battle(AM, foe, phase, active)
const ok = (s: GameState, c: Command) => expect(validate(s, c)).toEqual({ ok: true })
const bad = (s: GameState, c: Command) => {
  const v = validate(s, c)
  expect(v.ok).toBe(false)
  return v.ok ? '' : v.reason
}
const imp = (s: GameState, i: 'protector' | 'conqueror') => apply(s, { type: 'imperative', imperative: i }, scriptedRoller([]))
const at = (s: GameState, id: string, i = 0) => unit(s, id).models[i].pos
/** Both BATTLELINE units far from the western edge (no BATTLELINE support for anybody there). */
const parkBattleline = (s: GameState) => {
  moveUnitTo(s, 'rangers', { x: 22, y: 28.5 })
  moveUnitTo(s, 'vanguard', { x: 18, y: 28.5 })
}
/** Keep only the listed Mechanicus units (and all enemies): nothing else is in the way, nothing else is led. */
const only = (s: GameState, ...ids: string[]) => {
  s.units = s.units.filter((u) => u.owner !== AM || ids.includes(u.id))
}

// profile: M, T, Sv, W, Ld, OC, invulnerable, base mm
const STATS: Record<string, [number, number, number, number, number, number, number | undefined, number]> = {
  techDominus: [6, 4, 2, 4, 7, 1, 5, 50],
  techManipulus: [6, 4, 2, 4, 7, 1, 5, 50],
  ranger: [6, 3, 4, 1, 7, 2, 5, 25],
  rangerAlpha: [6, 3, 4, 1, 7, 2, 5, 25],
  rangerOmnispex: [6, 3, 4, 1, 7, 2, 5, 25],
  rangerArc: [6, 3, 4, 1, 7, 2, 5, 25],
  rangerCaliver: [6, 3, 4, 1, 7, 2, 5, 25],
  vanguard: [6, 3, 4, 1, 7, 2, 5, 25],
  vanguardAlpha: [6, 3, 4, 1, 7, 2, 5, 25],
  vanguardArc: [6, 3, 4, 1, 7, 2, 5, 25],
  vanguardCaliver: [6, 3, 4, 1, 7, 2, 5, 25],
  breacher: [5, 7, 3, 3, 7, 1, 6, 60],
  breacherTorsion: [5, 7, 3, 3, 7, 1, 6, 60],
  breacherHydraulic: [5, 7, 3, 3, 7, 1, 6, 60],
  destroyer: [5, 6, 3, 3, 7, 1, 6, 60],
  destroyerCulverin: [5, 6, 3, 3, 7, 1, 6, 60],
  sicarianPrinceps: [8, 4, 4, 2, 7, 1, 5, 40],
  sicarian: [8, 4, 4, 2, 7, 1, 5, 40],
  sicarianTaser: [8, 4, 4, 2, 7, 1, 5, 40],
  kastelan: [6, 9, 2, 7, 7, 2, 5, 60],
  kastelanGun: [6, 9, 2, 7, 7, 2, 5, 60],
}

// weapon: range | A (+random) | BS/WS | S | AP | D (+random) | keywords (sorted)
const WEAPON_STATS: Record<string, string> = {
  macrostubber: '12|5|3|4|0|1|closeQuarters',
  phosphorSerpenta: '18|1|3|5|-1|2|closeQuarters,ignoresCover',
  volkiteBlaster: '24|3|3|5|0|2|devastatingWounds',
  eradicationRay: '24|D3|3|6|-1|1| // 12|D3|3|6|-2|2|',
  omnissianAxe: 'melee|4|3|6|-2|2|',
  magnarailLance: '36|1|3|7|-2|3|heavy',
  transonicCannon: '12|D6|-|4|0|2|devastatingWounds,torrent',
  omnissianStaff: 'melee|4|3|6|-1|2|',
  galvanicRifle: '30|2|4|4|0|1|',
  radiumCarbine: '18|3|4|3|0|1|anti',
  arcRifle: '30|1|4|8|-1|D3|anti,devastatingWounds,rapidFire1',
  plasmaCaliver: '30|2|4|7|-2|1| // 30|2|4|8|-3|2|hazardous',
  mechanicusPistol: '12|1|4|6|-1|1|closeQuarters,devastatingWounds',
  alphaCombatWeapon: 'melee|2|4|5|-1|1|',
  skitariiCCW: 'melee|1|4|3|0|1|',
  heavyArcRifle: '30|2|4|8|-2|3|anti,rapidFire2',
  torsionCannon: '36|D3|4|6|-2|2|anti,blast1',
  arcClaw: 'melee|4|4|5|-1|1|anti',
  hydraulicClaw: 'melee|2|4|8|-2|3|',
  heavyGravCannon: '30|4|4|6|-1|2|anti',
  plasmaCulverin: '36|4|4|7|-2|1| // 36|4|4|8|-3|2|hazardous',
  phosphorBlaster: '24|1|4|5|0|1|ignoresCover,rapidFire1',
  cognisFlamer: '12|D6|-|4|0|1|ignoresCover,torrent',
  kataphronCCW: 'melee|2|4|5|0|1|',
  stubcarbine: '12|3|4|4|0|1|closeQuarters',
  flechetteBlaster: '12|5|4|3|0|1|closeQuarters',
  sicarianPowerWeapon: 'melee|4|4|4|-2|1|',
  taserGoad: 'melee|3|4|6|-1|1|sustainedHits2',
  incendineCombustor: '12|D6|-|6|-1|1|ignoresCover,torrent',
  heavyPhosphorBlaster: '36|3|4|6|-1|2|ignoresCover',
  kastelanPhosphorBlaster: '24|3|4|6|-1|1|ignoresCover',
  twinKastelanPhosphorBlaster: '24|3|4|6|-1|1|ignoresCover,twinLinked',
  kastelanCCW: 'melee|3|4|6|0|1|',
  kastelanFist: 'melee|4|4|12|-2|3|',
  twinKastelanFist: 'melee|4|4|12|-2|3|twinLinked',
}
const fmtWeapon = (id: string) =>
  WEAPONS[id].profiles
    .map((p) => {
      const kw = Object.entries(p.keywords)
        .map(([k, v]) => (v === true ? k : `${k}${typeof v === 'number' ? v : ''}`))
        .sort()
        .join(',')
      const rnd = (n: number, r?: string) => (r ? `${n ? n + '+' : ''}${r}` : `${n}`)
      return `${p.range}|${rnd(p.attacks, p.randomA)}|${p.skill ?? '-'}|${p.s}|${p.ap}|${rnd(p.d, p.randomD)}|${kw}`
    })
    .join(' // ')

describe('Adeptus Mechanicus datasheets', () => {
  it.each(Object.entries(STATS))('%s characteristics', (id, [m, t, sv, w, ld, oc, inv, base]) => {
    const p = PROFILES[id]
    expect([p.m, p.t, p.sv, p.w, p.ld, p.oc, p.invuln, p.baseMm]).toEqual([m, t, sv, w, ld, oc, inv, base])
  })
  it.each(Object.entries(WEAPON_STATS))('%s weapon profile', (id, expected) => expect(fmtWeapon(id)).toBe(expected))
  it('Anti-X keywords carry the right target keyword and roll', () => {
    const anti = (id: string) => WEAPONS[id].profiles[0].keywords.anti
    expect(anti('arcRifle')).toEqual({ keyword: 'VEHICLE', roll: 4 })
    expect(anti('heavyArcRifle')).toEqual({ keyword: 'VEHICLE', roll: 4 })
    expect(anti('arcClaw')).toEqual({ keyword: 'VEHICLE', roll: 4 })
    expect(anti('heavyGravCannon')).toEqual({ keyword: 'VEHICLE', roll: 2 })
    expect(anti('torsionCannon')).toEqual({ keyword: 'INFANTRY', roll: 2 })
    expect(anti('radiumCarbine')).toEqual({ keyword: 'INFANTRY', roll: 4 })
  })
  it('all eight datasheets exist for the faction, every ability has Russian rules text, every weapon exists', () => {
    const sheets = Object.values(DATASHEETS).filter((d) => d.faction === AM)
    expect(sheets.map((d) => d.id).sort()).toEqual(['breachers', 'destroyers', 'kastelans', 'rangers', 'sicarians', 'techDominus', 'techManipulus', 'vanguard'])
    for (const d of sheets) {
      expect(d.keywords).toContain('ADEPTUS MECHANICUS')
      expect(d.description, d.id).toBeTruthy()
      for (const a of d.abilities) expect(ABILITY_TEXT[a], `${d.id}:${a}`).toMatch(/[а-яА-Я]/)
    }
    for (const p of Object.values(PROFILES).filter((x) => Object.keys(STATS).includes(x.id))) for (const w of p.weapons) expect(WEAPONS[w], `${p.id}:${w}`).toBeDefined()
  })
  it('keywords: the leaders are CHARACTERs, only the Skitarii are BATTLELINE, Kastelans are VEHICLES', () => {
    expect(DATASHEETS.techDominus.keywords).toEqual(expect.arrayContaining(['INFANTRY', 'CHARACTER', 'TECH-PRIEST', 'DOMINUS']))
    expect(DATASHEETS.techManipulus.keywords).toContain('MANIPULUS')
    expect(Object.values(DATASHEETS).filter((d) => d.faction === AM && d.keywords.includes('BATTLELINE')).map((d) => d.id).sort()).toEqual(['rangers', 'vanguard'])
    expect(DATASHEETS.kastelans.keywords).toEqual(expect.arrayContaining(['VEHICLE', 'WALKER']))
    expect(DATASHEETS.breachers.keywords).toContain('KATAPHRON')
    expect(DATASHEETS.sicarians.keywords).toContain('INFILTRATORS')
  })
})

describe('Adeptus Mechanicus army (the requested training roster)', () => {
  const army = armyOf('combat-patrol', AM)!
  const comp = (id: string) => army.find((u) => u.id === id)!.models.map((m) => m.profileId)
  const count = (id: string, p: string) => comp(id).filter((x) => x === p).length

  it('has exactly the requested units and model counts (36 models)', () => {
    expect(Object.fromEntries(army.map((u) => [u.id, u.models.length]))).toEqual({
      dominus: 1, manipulus: 1, rangers: 10, vanguard: 10, breachers: 3, destroyers: 3, sicarians: 5, kastelans: 3,
    })
  })
  it('respects the datasheet unit sizes and loadout limits', () => {
    expect(comp('rangers')).toHaveLength(10) // fixed: 1 Alpha + 9
    expect(count('rangers', 'rangerAlpha')).toBe(1)
    for (const special of ['rangerArc', 'rangerCaliver', 'rangerOmnispex']) expect(count('rangers', special)).toBe(1)
    expect(comp('vanguard')).toHaveLength(10)
    expect(count('vanguard', 'vanguardAlpha')).toBe(1)
    for (const special of ['vanguardArc', 'vanguardCaliver']) expect(count('vanguard', special)).toBe(1) // 1 per unit each
    expect(comp('breachers').length).toBeGreaterThanOrEqual(3)
    expect(comp('breachers').length).toBeLessThanOrEqual(6)
    expect(comp('destroyers').length).toBeGreaterThanOrEqual(3)
    expect(comp('destroyers').length).toBeLessThanOrEqual(6)
    expect(comp('sicarians').length).toBeGreaterThanOrEqual(5) // 1 Princeps + 4–9
    expect(comp('sicarians').length).toBeLessThanOrEqual(10)
    expect(count('sicarians', 'sicarianPrinceps')).toBe(1)
    expect(comp('kastelans').length).toBeGreaterThanOrEqual(2)
    expect(comp('kastelans').length).toBeLessThanOrEqual(4)
    expect(comp('dominus')).toEqual(['techDominus'])
    expect(comp('manipulus')).toEqual(['techManipulus'])
  })
  it('every unit has its own role: different weapons, ranges and defences', () => {
    const maxRange = (id: string) => Math.max(...alive(unit(scenarioById('combat-patrol').build([AM, 'marines']), id)).flatMap((m) => profileOf(m).weapons.flatMap((w) => WEAPONS[w].profiles.map((p) => (p.range === 'melee' ? 0 : p.range)))))
    const s = scenarioById('combat-patrol').build([AM, 'marines'])
    const range = (id: string) => maxRange(id)
    expect(range('rangers')).toBe(30) // galvanic / arc rifles
    expect(range('vanguard')).toBe(30) // plasma caliver, but the baseline carbine is 18
    expect(WEAPONS.radiumCarbine.profiles[0].range).toBeLessThan(WEAPONS.galvanicRifle.profiles[0].range as number)
    expect(range('breachers')).toBe(36) // torsion cannon
    expect(range('destroyers')).toBe(36) // culverin
    expect(range('kastelans')).toBe(36)
    expect(Math.min(...alive(unit(s, 'sicarians')).map((m) => 8 - profileOf(m).m))).toBe(0) // fastest infantry on the list
    expect(profileOf(unit(s, 'breachers').models[0]).t).toBe(7)
    expect(profileOf(unit(s, 'kastelans').models[0]).w).toBe(7)
    // the weapon sets of the eight units are all different
    const kits = army.map((u) => [...new Set(u.models.flatMap((m) => profileOf(m).weapons))].sort().join())
    expect(new Set(kits).size).toBe(army.length)
  })
  it('the army deploys legally on either side against every opponent', () => {
    for (const foe of ['marines', 'orks', 'tyranids', 'necrons', 'aeldari'] as const)
      for (const sides of [[AM, foe], [foe, AM]] as const) {
        const s = scenarioById('combat-patrol').build([...sides])
        expect(deploymentIssues(s, AM, unitsOf(s, AM).map((u) => u.id)), `${sides}`).toEqual([])
      }
  })
  it('only the large board has the army; the small boards stay Marines vs Orks', () => {
    expect(armyOf('training-outpost', AM)).toBeNull()
    expect(scenarioById('combat-patrol').factions).toContain(AM)
    expect(() => scenarioById('training-outpost').build([AM, 'marines'])).toThrow()
  })
})

describe('Doctrina Imperatives', () => {
  it('is chosen once per turn in the Command phase by the Mechanicus player', () => {
    const s = mech('command')
    s.players[AM].imperative = null
    ok(s, { type: 'imperative', imperative: 'protector' })
    expect(bad(mech('movement'), { type: 'imperative', imperative: 'protector' })).toContain('фазе командования')
    expect(bad(battle('marines', 'orks', 'command', 'marines'), { type: 'imperative', imperative: 'protector' })).toContain('Адептус Механикус')
    const done = imp(s, 'conqueror')
    expect(done.players[AM].imperative).toBe('conqueror')
    expect(bad(done, { type: 'imperative', imperative: 'protector' })).toContain('уже выбран')
  })
  it('resets at the start of the owner’s next Command phase (it lasts through the enemy turn)', () => {
    let s = mech('command')
    s.players[AM].imperative = null
    s = imp(s, 'protector')
    for (let i = 0; i < 5; i++) s = apply(s, { type: 'endPhase' }, seededRoller(7)) // end of the Mechanicus turn
    expect(s.activePlayer).toBe('marines')
    expect(s.players[AM].imperative).toBe('protector') // still active during the enemy turn
    for (let i = 0; i < 5; i++) s = apply(s, { type: 'endPhase' }, seededRoller(7))
    expect(s.activePlayer).toBe(AM)
    expect(s.players[AM].imperative).toBeNull()
  })
  it('Protector: ranged weapons gain Heavy and BS improves by 1', () => {
    const s = mech('shooting')
    moveUnitTo(s, 'int', { x: at(s, 'rangers').x + 18, y: at(s, 'rangers').y })
    const plain = shootPlan(s, unit(s, 'rangers'), unit(s, 'int'))
    expect(plain.groups[0].ctx.skillWorsen).toBe(0)
    expect(plain.groups[0].ctx.hitMod).toBe(0)
    s.players[AM].imperative = 'protector'
    const g = shootPlan(s, unit(s, 'rangers'), unit(s, 'int')).groups[0]
    expect(g.ctx.skillWorsen).toBe(-1)
    expect(g.ctx.hitMod).toBe(1) // Heavy: the unit did not move
    expect(g.ctx.hitModNotes.join()).toContain('Protector')
    unit(s, 'rangers').movedDistance = 5
    expect(shootPlan(s, unit(s, 'rangers'), unit(s, 'int')).groups[0].ctx.hitMod).toBe(0) // moved: no Heavy bonus
  })
  it('Protector: melee attacks against a BATTLELINE unit get −1 to hit; not against a lone Kataphron unit', () => {
    const s = mech('fight', 'marines')
    s.players[AM].imperative = 'protector'
    moveUnitTo(s, 'int', { x: at(s, 'rangers').x + 2, y: at(s, 'rangers').y })
    const vs = (id: string) => meleePlan(s, unit(s, 'int'), unit(s, id))[0]?.ctx.hitMod
    expect(vs('rangers')).toBe(-1)
    moveUnitTo(s, 'int', { x: at(s, 'breachers').x + 2.5, y: at(s, 'breachers').y })
    parkBattleline(s) // out of the 6″ range of the Breachers
    expect(vs('breachers')).toBe(0)
    moveUnitTo(s, 'rangers', { x: at(s, 'breachers').x - 4, y: at(s, 'breachers').y })
    expect(vs('breachers')).toBe(-1) // within 6″ of friendly BATTLELINE
  })
  it('Conqueror: Assault lets the unit shoot after advancing, WS improves, AP improves for BATTLELINE only', () => {
    const s = mech('shooting')
    s.players[AM].imperative = 'conqueror'
    moveUnitTo(s, 'int', { x: at(s, 'rangers').x + 14, y: at(s, 'rangers').y })
    unit(s, 'rangers').move = 'advance'
    const plan = shootPlan(s, unit(s, 'rangers'), unit(s, 'int'))
    expect(plan.problem).toBeNull()
    expect(plan.groups[0].profile.ap).toBe(WEAPONS[plan.groups[0].weaponName.includes('Гальван') ? 'galvanicRifle' : 'arcRifle'].profiles[0].ap - 1)
    // Without the imperative advancing units cannot shoot a non-Assault weapon
    s.players[AM].imperative = null
    expect(shootPlan(s, unit(s, 'rangers'), unit(s, 'int')).groups).toHaveLength(0)
    // Kataphron far from any BATTLELINE: no AP bonus
    s.players[AM].imperative = 'conqueror'
    shift(s, 'rangers', 0, -25)
    shift(s, 'vanguard', 0, -25)
    moveUnitTo(s, 'int', { x: at(s, 'destroyers').x + 14, y: at(s, 'destroyers').y })
    const far = shootPlan(s, unit(s, 'destroyers'), unit(s, 'int')).groups[0]
    expect(far.profile.ap).toBe(WEAPONS.heavyGravCannon.profiles[0].ap)
  })
  it('Conqueror: melee WS improves by 1 and (BATTLELINE) AP improves by 1', () => {
    const s = mech('fight')
    s.players[AM].imperative = 'conqueror'
    moveUnitTo(s, 'int', { x: at(s, 'vanguard').x + 2, y: at(s, 'vanguard').y })
    const g = meleePlan(s, unit(s, 'vanguard'), unit(s, 'int'))[0]
    expect(g.ctx.skillWorsen).toBe(-1)
    expect(g.profile.ap).toBeLessThan(WEAPONS.skitariiCCW.profiles[0].ap)
    s.players[AM].imperative = 'protector'
    expect(meleePlan(s, unit(s, 'vanguard'), unit(s, 'int'))[0].ctx.skillWorsen).toBe(0)
  })
  it('units of other armies never get an imperative', () => {
    const s = battle('marines', 'orks')
    expect(s.players.marines.imperative).toBeUndefined()
    expect(bad(s, { type: 'imperative', imperative: 'protector' })).toBeTruthy()
  })
})

describe('Tech-Priests lead the nearest Skitarii/Kataphron unit within 3″ (training approximation of attached units)', () => {
  it('picks exactly one unit, deterministically, and none when out of reach', () => {
    const s = mech()
    expect(ledUnitOf(s, unit(s, 'dominus'))?.id).toBe('rangers') // default positions
    expect(ledUnitOf(s, unit(s, 'manipulus'))?.id).toBe('vanguard')
    moveUnitTo(s, 'dominus', { x: 20, y: 5 })
    expect(ledUnitOf(s, unit(s, 'dominus'))).toBeNull()
  })
  it('Lord of the Machine Cult: Feel No Pain 5+ for the led unit only', () => {
    const s = mech()
    expect(feelNoPainOf(s, unit(s, 'rangers'))).toBe(5)
    expect(feelNoPainOf(s, unit(s, 'dominus'))).toBe(5)
    expect(feelNoPainOf(s, unit(s, 'vanguard'))).toBeUndefined()
    expect(feelNoPainOf(s, unit(s, 'breachers'))).toBeUndefined()
  })
  it('Feel No Pain rolls are made per point of damage and shown in the dice log', () => {
    const run = (withDominus: boolean) => {
      const s = mech('shooting', 'marines')
      only(s, 'breachers', ...(withDominus ? ['dominus'] : []))
      // one Intercessor (bolt rifle, 1 attack beyond half range) fires at one Breacher: hit 6, wound 6, save 1 (fails), then the FNP roll
      unit(s, 'int').models.forEach((m, i) => (m.destroyed = i !== 1))
      unit(s, 'breachers').models.slice(1).forEach((m) => (m.destroyed = true))
      const b = at(s, 'breachers')
      unit(s, 'int').models[1].pos = { x: b.x + 15, y: b.y }
      if (withDominus) moveUnitTo(s, 'dominus', { x: b.x - 1.5, y: b.y + 3.5 })
      return apply(s, { type: 'shoot', unitId: 'int', targetId: 'breachers' }, scriptedRoller(withDominus ? [6, 6, 1, 5, 5] : [6, 6, 1]))
    }
    const protectedRun = run(true)
    expect(unit(protectedRun, 'breachers').models[0].wounds).toBe(3) // damage 2: both points ignored (5 and 5)
    const e = protectedRun.diceLog.find((d) => d.title.includes('Интерсессоры'))!
    expect(e.steps.some((st) => st.label === 'Feel No Pain' && st.dice.length === 2 && st.dice.every((d) => d.success))).toBe(true)
    expect(unit(run(false), 'breachers').models[0].wounds).toBe(1) // no leader: both points of damage go through
  })
  it('Galvanic Field (Manipulus): the led unit’s weapons have Lethal Hits', () => {
    const s = mech('shooting')
    moveUnitTo(s, 'int', { x: at(s, 'vanguard').x + 12, y: at(s, 'vanguard').y })
    expect(shootPlan(s, unit(s, 'vanguard'), unit(s, 'int')).groups.every((g) => g.ctx.lethalHits)).toBe(true)
    expect(shootPlan(s, unit(s, 'rangers'), unit(s, 'int')).groups.some((g) => g.ctx.lethalHits)).toBe(false) // led by the Dominus
    moveUnitTo(s, 'manipulus', { x: 20, y: 28 })
    expect(shootPlan(s, unit(s, 'vanguard'), unit(s, 'int')).groups.some((g) => g.ctx.lethalHits)).toBe(false)
  })
  it('Defend the Divine Work: once per battle, 4+ invulnerable save for the Manipulus and its unit through the enemy turn', () => {
    let s = mech('command')
    const cmd: Command = { type: 'divineWork', unitId: 'manipulus' }
    ok(s, cmd)
    expect(bad(s, { type: 'divineWork', unitId: 'dominus' })).toContain('нет способности')
    s = apply(s, cmd, scriptedRoller([]))
    expect(unit(s, 'manipulus').warded && unit(s, 'vanguard').warded).toBe(true)
    expect(unit(s, 'rangers').warded).toBeUndefined()
    expect(bad(s, cmd)).toContain('раз за битву')
    moveUnitTo(s, 'int', { x: at(s, 'vanguard').x + 12, y: at(s, 'vanguard').y })
    s.phase = 'shooting'
    for (let i = 0; i < 5; i++) s = endPhase(s, seededRoller(5))
    expect(s.activePlayer).toBe('marines')
    expect(unit(s, 'vanguard').warded).toBe(true) // lasts through the opponent's turn
    s.phase = 'shooting'
    moveUnitTo(s, 'int', { x: at(s, 'vanguard').x + 10, y: at(s, 'vanguard').y })
    const ward = shootPlan(s, unit(s, 'int'), unit(s, 'vanguard')).groups[0].ctx.invulnOverride
    expect(ward).toBe(4)
    s.phase = 'command'
    for (let i = 0; i < 5; i++) s = endPhase(s, seededRoller(5))
    expect(s.activePlayer).toBe(AM)
    expect(unit(s, 'vanguard').warded).toBeUndefined() // gone at the start of the owner's next turn
  })
})

describe('Objective Scouted and Rad-saturation', () => {
  const withObjective = (s: GameState) => {
    s.objectives = [{ id: 'o1', pos: { ...at(s, 'rangers', 4) }, controller: null }]
    return s
  }
  it('Rangers keep an objective after leaving it until the enemy level is higher', () => {
    const s = withObjective(mech('command'))
    s.objectives[0].pos = { ...at(s, 'rangers', 0) }
    updateObjectiveControl(s)
    expect(s.objectives[0].controller).toBe(AM)
    const after = apply(s, { type: 'endPhase' }, scriptedRoller([]))
    expect(after.objectives[0].held).toBe(AM)
    // Rangers leave, nobody else is near: control stays
    const gone = structuredClone(after)
    shift(gone, 'rangers', 0, 15)
    updateObjectiveControl(gone)
    expect(gone.objectives[0].controller).toBe(AM)
    // Marines arrive: their level (OC 2 per model) beats ours (0): control is lost
    moveUnitTo(gone, 'int', gone.objectives[0].pos)
    updateObjectiveControl(gone)
    expect(gone.objectives[0].controller).toBe('marines')
    expect(gone.objectives[0].held).toBeUndefined()
  })
  it('without the ability a unit loses the objective as soon as it leaves (original behaviour)', () => {
    const s = withObjective(mech('command'))
    s.objectives[0].pos = { ...at(s, 'vanguard', 0) }
    updateObjectiveControl(s)
    expect(s.objectives[0].controller).toBe(AM)
    const after = apply(s, { type: 'endPhase' }, scriptedRoller([]))
    expect(after.objectives[0].held).toBeUndefined()
  })
  it('Rad-saturation: enemy models (not VEHICLEs) within 3″ of the Vanguard have OC −1', () => {
    const s = mech('command')
    s.objectives = [{ id: 'o1', pos: { x: 22, y: 8 }, controller: null }]
    moveUnitTo(s, 'int', { x: 22, y: 8 })
    const before = objectiveLevels(s, s.objectives[0]).marines
    expect(before).toBeGreaterThan(0)
    moveUnitTo(s, 'vanguard', { x: 22, y: 8 + 3.4 })
    expect(unitDistance(unit(s, 'vanguard'), unit(s, 'int'))).toBeLessThanOrEqual(3)
    expect(objectiveLevels(s, s.objectives[0]).marines).toBe(before / 2) // every Intercessor: OC 2 -> 1
    // a VEHICLE is immune
    const v = mech('command')
    v.objectives = [{ id: 'o1', pos: { x: 22, y: 8 }, controller: null }]
    moveUnitTo(v, 'red', { x: 22, y: 8 })
    const clean = objectiveLevels(v, v.objectives[0]).marines
    moveUnitTo(v, 'vanguard', { x: 22, y: 8 + 3.4 })
    expect(clean).toBe(profileOf(unit(v, 'red').models[0]).oc)
    expect(objectiveLevels(v, v.objectives[0]).marines).toBe(clean)
  })
})

describe('Breaching Command, Stealth, cover and weapon keywords', () => {
  it('Breachers re-roll hit rolls of 1; any failed hit near friendly BATTLELINE', () => {
    const s = mech('shooting')
    moveUnitTo(s, 'int', { x: at(s, 'breachers').x + 12, y: at(s, 'breachers').y })
    parkBattleline(s)
    expect(shootPlan(s, unit(s, 'breachers'), unit(s, 'int')).groups[0].ctx.rerollHits).toBe('ones')
    moveUnitTo(s, 'rangers', { x: at(s, 'breachers').x - 4, y: at(s, 'breachers').y })
    expect(shootPlan(s, unit(s, 'breachers'), unit(s, 'int')).groups[0].ctx.rerollHits).toBe('all')
    moveUnitTo(s, 'int', { x: at(s, 'breachers').x + 2.5, y: at(s, 'breachers').y })
    expect(meleePlan(Object.assign(s, { phase: 'fight' as const }), unit(s, 'breachers'), unit(s, 'int'))[0].ctx.rerollHits).toBe('all')
  })
  const crater = (r: { x: number; y: number }): Terrain => ({ id: 'c', name: 'Воронка', kind: 'crater', poly: rect(r.x - 3, r.y - 3, 6, 14), obscuring: false })
  it('Ignores Cover (phosphor weapons) and the Omnispex cancel the target’s cover bonus', () => {
    const s = mech('shooting')
    moveUnitTo(s, 'int', { x: at(s, 'kastelans').x + 10, y: at(s, 'kastelans').y })
    s.terrain = [crater(at(s, 'int'))]
    const k = shootPlan(s, unit(s, 'kastelans'), unit(s, 'int'))
    expect(k.cover).toBe(true)
    const ignoring = k.groups.filter((g) => g.profile.keywords.ignoresCover)
    expect(ignoring.length).toBeGreaterThan(0)
    for (const g of ignoring) expect(g.ctx.skillWorsen).toBe(0)
    moveUnitTo(s, 'int', { x: at(s, 'rangers').x + 12, y: at(s, 'rangers').y })
    s.terrain = [crater(at(s, 'int'))]
    // the Rangers carry one Omnispex: the WHOLE unit ignores cover
    for (const g of shootPlan(s, unit(s, 'rangers'), unit(s, 'int')).groups) expect(g.ctx.skillWorsen, g.weaponName).toBe(0)
    // the Vanguard have none: their carbines suffer from cover
    moveUnitTo(s, 'int', { x: at(s, 'vanguard').x + 12, y: at(s, 'vanguard').y })
    s.terrain = [crater(at(s, 'int'))]
    expect(shootPlan(s, unit(s, 'vanguard'), unit(s, 'int')).groups.every((g) => g.ctx.skillWorsen === 1)).toBe(true)
  })
  it('Stealth: Sicarians always have the benefit of cover against ranged attacks', () => {
    const s = mech('shooting', 'marines')
    moveUnitTo(s, 'int', { x: at(s, 'sicarians').x + 10, y: at(s, 'sicarians').y })
    const g = shootPlan(s, unit(s, 'int'), unit(s, 'sicarians'))
    expect(g.cover).toBe(true)
    expect(g.groups.every((x) => x.ctx.skillWorsen === 1)).toBe(true)
    expect(shootPlan(s, unit(s, 'int'), unit(s, 'rangers')).cover).toBe(false)
  })
  it('Precision allocates wounds to a CHARACTER first (unit with a character model)', () => {
    const s = mech()
    const u = unit(s, 'int')
    u.models.push({ id: 'int-x', profileId: 'techDominus', pos: { x: 1, y: 1 }, wounds: 4, destroyed: false })
    expect(pickModelForDamage(u)!.profileId).not.toBe('techDominus')
    expect(pickModelForDamage(u, true)!.profileId).toBe('techDominus')
  })
})

describe('Sicarians: Voices in the Code and Neurostatic Interference', () => {
  /** Marine Command phase right after the Mechanicus turn: `rolls` are the battle-shock dice of the (half-strength) Intercessors. */
  const marineCommand = (setup: (s: GameState) => void, rolls: number[]) => {
    const s = mech('fight')
    s.fight = null
    unit(s, 'int').models.slice(2).forEach((m) => (m.destroyed = true)) // 2 of 5: half strength -> tests
    setup(s)
    return apply(s, { type: 'endPhase' }, scriptedRoller([...rolls, ...Array(40).fill(6)]))
  }
  const intTest = (s: GameState) => s.diceLog.find((d) => d.title === 'Боевой шок: Интерсессоры I')!
  it('Ld test total is reduced by 1 within 6″ of Sicarians, by 2 near a friendly BATTLELINE', () => {
    const base = marineCommand(() => {}, [3, 3])
    expect(unit(base, 'int').battleShocked).toBe(false) // 6 >= Ld 6
    const near = marineCommand((s) => moveUnitTo(s, 'sicarians', { x: at(s, 'int').x + 4, y: at(s, 'int').y }), [3, 3])
    expect(unit(near, 'int').battleShocked).toBe(true) // 6 − 1 = 5 < 6
    expect(intTest(near).steps[0].note).toContain('Сумма 5')
    const withLine = marineCommand((s) => {
      moveUnitTo(s, 'sicarians', { x: at(s, 'int').x + 4, y: at(s, 'int').y })
      moveUnitTo(s, 'rangers', { x: at(s, 'int').x + 8, y: at(s, 'int').y })
    }, [4, 3])
    expect(intTest(withLine).steps[0].note).toContain('Сумма 5') // 7 − 2
    const far = marineCommand((s) => moveUnitTo(s, 'sicarians', { x: at(s, 'int').x + 8, y: at(s, 'int').y }), [3, 3])
    expect(unit(far, 'int').battleShocked).toBe(false) // more than 6″ away
  })
  it('Voices in the Code: at the start of the Fight phase every engaged enemy unit takes a Battle-shock test', () => {
    const s = mech('charge')
    moveUnitTo(s, 'int', { x: at(s, 'sicarians').x + 3, y: at(s, 'sicarians').y })
    const run = (rolls: number[]) => apply(s, { type: 'endPhase' }, scriptedRoller([...rolls, ...Array(30).fill(6)]))
    const failed = run([1, 1])
    expect(unit(failed, 'int').battleShocked).toBe(true)
    expect(failed.diceLog.some((d) => d.title.startsWith('Голоса в коде'))).toBe(true)
    const passed = run([6, 6])
    expect(unit(passed, 'int').battleShocked).toBe(false)
    // units that are not engaged do not test
    expect(unit(failed, 'int2').battleShocked).toBe(false)
  })
})

/** Leaves one Intercessor (bolt rifle) of `int` standing 15″ east of `target`; returns its model index. */
const loneIntercessor = (s: GameState, target: { x: number; y: number }) => {
  const u = unit(s, 'int')
  u.models.forEach((m, i) => (m.destroyed = i !== 1))
  u.models[1].pos = { x: target.x + 15, y: target.y }
  return 1
}

describe('Kastelan Repulsor Grid and Dominus Data-spike', () => {
  it('every unmodified 6 on a Kastelan save costs the shooter a mortal wound, after it has shot', () => {
    const s = mech('shooting', 'marines')
    const shooter = loneIntercessor(s, at(s, 'kastelans'))
    // one Intercessor, 1 bolt-rifle attack beyond half range: hit 6, wound 6 (S6 vs T9 needs 5+), save 6 (saved, but the 6 counts)
    const after = apply(s, { type: 'shoot', unitId: 'int', targetId: 'kastelans' }, scriptedRoller([6, 6, 6]))
    expect(unit(after, 'int').models[shooter].wounds).toBe(profileOf(unit(after, 'int').models[shooter]).w - 1)
    expect(after.diceLog.some((d) => d.title.startsWith('Отталкивающая решётка'))).toBe(true)
    expect(unit(after, 'kastelans').models.every((m) => m.wounds === 7)).toBe(true) // the save held
    // a save of 5 does not trigger it
    const quiet = apply(s, { type: 'shoot', unitId: 'int', targetId: 'kastelans' }, scriptedRoller([6, 6, 5]))
    expect(unit(quiet, 'int').models[shooter].wounds).toBe(profileOf(unit(quiet, 'int').models[shooter]).w)
  })
  it('a shooter can die to Repulsor Grid mortal wounds (and the battle logic keeps working)', () => {
    const s = mech('shooting', 'marines')
    const shooter = loneIntercessor(s, at(s, 'kastelans'))
    unit(s, 'int').models[shooter].wounds = 1
    const after = apply(s, { type: 'shoot', unitId: 'int', targetId: 'kastelans' }, scriptedRoller([6, 6, 6]))
    expect(alive(unit(after, 'int'))).toHaveLength(0)
  })
  it('Data-spike: at the start of the Fight phase a Dominus engaged with a VEHICLE rolls 4+ for D6 mortal wounds and worsens its WS', () => {
    const s = mech('charge')
    moveUnitTo(s, 'red', { x: at(s, 'dominus').x + 2.5, y: at(s, 'dominus').y })
    const hit = apply(s, { type: 'endPhase' }, scriptedRoller([4, 3, ...Array(20).fill(6)]))
    expect(unit(hit, 'red').models[0].wounds).toBe(profileOf(unit(hit, 'red').models[0]).w - 3)
    expect(unit(hit, 'red').spiked).toBe(true)
    expect(hit.diceLog.some((d) => d.title.startsWith('Шип данных'))).toBe(true)
    // the Redemptor fights at WS +1 worse
    const fightS = structuredClone(hit)
    expect(meleePlan(fightS, unit(fightS, 'red'), unit(fightS, 'dominus'))[0].ctx.skillWorsen).toBe(1)
    const miss = apply(s, { type: 'endPhase' }, scriptedRoller([3, ...Array(20).fill(6)]))
    expect(unit(miss, 'red').models[0].wounds).toBe(profileOf(unit(miss, 'red').models[0]).w)
    expect(unit(miss, 'red').spiked).toBeUndefined()
    // not against infantry
    const inf = mech('charge')
    moveUnitTo(inf, 'int', { x: at(inf, 'dominus').x + 2.5, y: at(inf, 'dominus').y })
    const none = apply(inf, { type: 'endPhase' }, scriptedRoller(Array(30).fill(6)))
    expect(none.diceLog.some((d) => d.title.startsWith('Шип данных'))).toBe(false)
  })
})

describe('movement, shooting, fight and weapon choice of the new units', () => {
  const move = (s: GameState, id: string, dx: number): Command => ({
    type: 'move', unitId: id, mode: 'normal',
    positions: Object.fromEntries(unit(s, id).models.map((m) => [m.id, { x: m.pos.x + dx, y: m.pos.y }])),
  })
  it.each([['rangers', 6], ['sicarians', 8], ['breachers', 5], ['kastelans', 6], ['dominus', 6]] as const)('%s moves up to M″ and no further', (id, m) => {
    const s = mech('movement')
    s.units = s.units.filter((u) => u.id === id || u.owner === 'marines') // nothing else in the way
    ok(s, move(s, id, m))
    expect(bad(s, move(s, id, m + 0.6))).toContain('больше допустимых')
  })
  it('Kataphron Destroyers fire every ranged weapon of every model; Torrent weapons hit automatically', () => {
    const s = mech('shooting')
    moveUnitTo(s, 'int', { x: at(s, 'destroyers').x + 14, y: at(s, 'destroyers').y })
    const plan = shootPlan(s, unit(s, 'destroyers'), unit(s, 'int'))
    expect(plan.problem).toBeNull()
    const names = plan.groups.map((g) => g.weaponName)
    expect(names.some((n) => n.includes('Тяжёлая гравипушка'))).toBe(true)
    expect(names.some((n) => n.includes('кулеврина'))).toBe(true)
    expect(names.some((n) => n.includes('Когнис-огнемёт'))).toBe(false) // out of its 12″
    moveUnitTo(s, 'int', { x: at(s, 'destroyers').x + 6, y: at(s, 'destroyers').y })
    const near = apply(s, { type: 'shoot', unitId: 'destroyers', targetId: 'int' }, seededRoller(3))
    expect(near.diceLog.some((d) => d.steps.some((st) => st.label === 'Попадание' && st.target === 'авто'))).toBe(true)
  })
  it('plasma weapons offer two profiles and Supercharge is Hazardous', () => {
    const s = mech('shooting')
    moveUnitTo(s, 'int', { x: at(s, 'rangers').x + 15, y: at(s, 'rangers').y })
    const sc = shootPlan(s, unit(s, 'rangers'), unit(s, 'int'), { profiles: { plasmaCaliver: 1 } })
    expect(sc.hazardousModels).toBe(1)
    expect(shootPlan(s, unit(s, 'rangers'), unit(s, 'int')).hazardousModels).toBe(0)
  })
  it('Kastelan fists are twin-linked on the default robot; Sicarian taser goads have Sustained Hits 2', () => {
    const s = mech('fight')
    moveUnitTo(s, 'int', { x: at(s, 'kastelans').x + 3, y: at(s, 'kastelans').y })
    const k = meleePlan(s, unit(s, 'kastelans'), unit(s, 'int'))
    expect(k.map((g) => g.weaponName).join()).toContain('Сдвоенный кулак')
    expect(k.find((g) => g.profile.keywords.twinLinked)?.profile.s).toBe(12)
    moveUnitTo(s, 'int', { x: at(s, 'sicarians').x + 2.5, y: at(s, 'sicarians').y })
    const sic = meleePlan(s, unit(s, 'sicarians'), unit(s, 'int'))
    expect(sic.find((g) => g.profile.keywords.sustainedHits === 2)).toBeDefined()
  })
  it('a full fight resolves with dice and casualties (Hydraulic claw vs Marines)', () => {
    const s = mech('fight')
    s.fight = { selecting: AM, step: 'rest' }
    moveUnitTo(s, 'int', { x: at(s, 'breachers').x + 2.5, y: at(s, 'breachers').y })
    const after = apply(s, { type: 'fight', unitId: 'breachers', targetId: 'int' }, seededRoller(11))
    expect(after.diceLog.at(-1)!.title).toContain('Бой')
    expect(after.diceLog.at(-1)!.steps.map((x) => x.label)).toEqual(expect.arrayContaining(['Попадание', 'Ранение', 'Спасбросок', 'Урон']))
  })
})

describe('Infiltrators in deployment', () => {
  it('Sicarians may deploy anywhere more than 8″ from the enemy zone and models; other units still need their zone', () => {
    const s = mech('command')
    const far = Object.fromEntries(unit(s, 'sicarians').models.map((m) => [m.id, { x: m.pos.x + 14, y: m.pos.y }]))
    expect(deploymentProblem(s, unit(s, 'sicarians'), far)).toBeNull()
    const close = Object.fromEntries(unit(s, 'sicarians').models.map((m) => [m.id, { x: m.pos.x + 27, y: m.pos.y }]))
    expect(deploymentProblem(s, unit(s, 'sicarians'), close)).toContain('8″')
    const rangers = Object.fromEntries(unit(s, 'rangers').models.map((m) => [m.id, { x: m.pos.x + 14, y: m.pos.y }]))
    expect(deploymentProblem(s, unit(s, 'rangers'), rangers)).toContain('зоне развёртывания')
  })
})

describe('persistence', () => {
  it('a Mechanicus battle with every new state field survives a save and load', () => {
    let s = mech('command')
    s.objectives = [{ id: 'o1', pos: { ...at(s, 'rangers', 0) }, controller: null }]
    s = imp(s, 'conqueror')
    s = apply(s, { type: 'divineWork', unitId: 'manipulus' }, scriptedRoller([]))
    s = apply(s, { type: 'endPhase' }, scriptedRoller([]))
    expect(s.objectives[0].held).toBe(AM)
    const r = deserialize(serialize(s, AM))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.file.state).toEqual(s)
      expect(r.file.state.players[AM]).toMatchObject({ imperative: 'conqueror', divineUsed: true })
      expect(r.file.state.sides).toEqual([AM, 'marines'])
    }
  })
  it('classic saves are untouched: no Mechanicus fields appear in Marines/Orks states', () => {
    const s = battle('marines', 'orks')
    expect(s.players.marines).toEqual({ cp: 0, vp: 0, waaaghUsed: false, riledTurns: 0 })
    const r = deserialize(serialize(s, 'marines'))
    expect(r.ok && r.file.state).toEqual(s)
  })
})

describe('Adeptus Mechanicus AI', () => {
  it.each(['beginner', 'standard'] as const)('chooses an Imperative in the Command phase (%s) before ending it, with a Russian reason', (level) => {
    const s = mech('command')
    const d = decide(s, level)!
    expect(d.cmd.type).toBe('imperative')
    expect(validate(s, d.cmd).ok).toBe(true)
    expect(d.explanation).toMatch(/Империатив «(Протектор|Завоеватель)»/)
    const after = apply(s, d.cmd, scriptedRoller([]))
    expect(decide(after, level)!.cmd.type).toBe('endPhase')
  })
  it('prefers Conqueror when the enemy is already in charge range and Protector when it is far (beginner)', () => {
    const near = mech('command')
    moveUnitTo(near, 'int', { x: at(near, 'vanguard').x + 8, y: at(near, 'vanguard').y })
    expect((decide(near, 'beginner')!.cmd as { imperative: string }).imperative).toBe('conqueror')
    const far = mech('command')
    expect((decide(far, 'beginner')!.cmd as { imperative: string }).imperative).toBe('protector')
  })
  it('the tactical AI compares the expected results of both Imperatives and says so', () => {
    const d = decide(mech('command'), 'standard')!
    expect(d.explanation).toMatch(/ожидаемый результат [\d,]+ против [\d,]+/)
  })
  it('a Tech-Priest that has lost its unit moves back toward it', () => {
    const s = scenarioById('combat-patrol').build([AM, 'marines']) // real objectives: the AI scores positions against them
    s.phase = 'movement'
    moveUnitTo(s, 'dominus', { x: at(s, 'dominus').x + 9, y: at(s, 'dominus').y + 2 })
    expect(ledUnitOf(s, unit(s, 'dominus'))).toBeNull()
    const nearest = (st: GameState) => Math.min(...unitsOf(st, AM).filter((u) => u.id !== 'dominus' && DATASHEETS[u.datasheetId].abilities.includes('ledUnit')).map((u) => unitDistance(unit(st, 'dominus'), u)))
    let cur = s
    let moved = false
    for (let i = 0; i < 40 && !moved; i++) {
      const d = decide(cur, 'standard')!
      expect(d.cmd.type, 'the Dominus must move before the phase ends').not.toBe('endPhase')
      if (d.cmd.type === 'move' && d.cmd.unitId === 'dominus') {
        const before = nearest(cur)
        cur = apply(cur, d.cmd, seededRoller(1))
        expect(nearest(cur)).toBeLessThan(before)
        moved = true
      } else cur = apply(cur, d.cmd, seededRoller(1 + i))
    }
    expect(moved).toBe(true)
  })
  it('uses Defend the Divine Work when the Manipulus’s unit is in melee (once)', () => {
    const s = mech('movement')
    moveUnitTo(s, 'int', { x: at(s, 'vanguard').x + 2.5, y: at(s, 'vanguard').y })
    for (const u of unitsOf(s, AM)) u.move = 'normal' // everybody has moved: the Movement phase is about to end
    const d = decide(s, 'standard')!
    expect(d.cmd).toEqual({ type: 'divineWork', unitId: 'manipulus' })
    expect(d.explanation).toContain('Защиту божественного труда')
    const after = apply(s, d.cmd, scriptedRoller([]))
    expect(decide(after, 'standard')!.cmd.type).toBe('endPhase') // once per battle
    // not when nobody threatens the unit
    const calm = mech('movement')
    calm.units = calm.units.filter((u) => u.owner === AM) // nobody to fear
    for (const u of unitsOf(calm, AM)) u.move = 'normal'
    expect(decide(calm, 'standard')!.cmd.type).toBe('endPhase')
  })
  it('every command of a whole battle against two armies is legal (AI-vs-AI), the battle ends, and the faction abilities are used', () => {
    for (const foe of ['marines', 'orks'] as const) {
      let s = startGame(scenarioById('combat-patrol').build([AM, foe]), seededRoller(1))
      let n = 0
      const used = new Set<string>()
      while (!s.winner) {
        const d = decide(s, n % 2 ? 'standard' : 'beginner')!
        expect(validate(s, d.cmd), `${foe}: ${d.explanation}`).toEqual({ ok: true })
        used.add(d.cmd.type)
        s = apply(s, d.cmd, seededRoller(s.rng))
        expect(++n).toBeLessThan(3000)
      }
      expect(used.has('imperative')).toBe(true)
      expect(used.has('shoot')).toBe(true)
    }
  }, 300000)
})
