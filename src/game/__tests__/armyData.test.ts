import { describe, expect, it } from 'vitest'
import { portraitFor } from '../../assets/tokenArt'
import { TOKENS } from '../../assets/manifest'
import { ABILITY_TEXT, DATASHEETS, PROFILES, WEAPONS } from '../data/datasheets'
import { alive, bodyguardModels, profileOf } from '../gameState'
import { basesOverlap } from '../geometry/geometry'
import { deploymentIssues } from '../rules/deployment'
import { armyOf, scenarioById, SCENARIOS } from '../scenarios/scenarios'
import { FACTIONS, type PlayerId } from '../types'
import { radiusOf } from '../gameState'

// 11th-edition datasheets as transcribed by Wahapedia (checked 2026-11-09), see docs/armies.md.

// profile: M, T, Sv, W, Ld, OC, invulnerable, base mm
const STATS: Record<string, [number, number, number, number, number, number, number | undefined, number]> = {
  hiveTyrant: [8, 10, 2, 10, 7, 3, 4, 60],
  termagant: [6, 3, 5, 1, 8, 2, undefined, 28.5],
  termagantShard: [6, 3, 5, 1, 8, 2, undefined, 28.5],
  termagantSpike: [6, 3, 5, 1, 8, 2, undefined, 28.5],
  termagantWeb: [6, 3, 5, 1, 8, 2, undefined, 28.5],
  hormagaunt: [10, 3, 5, 1, 8, 2, undefined, 28.5],
  tyranidPrime: [6, 5, 4, 3, 7, 2, undefined, 50],
  tyranidWarrior: [6, 5, 4, 3, 7, 2, undefined, 50],
  tyranidWarriorVenom: [6, 5, 4, 3, 7, 2, undefined, 50],
  tyranidWarriorStrangler: [6, 5, 4, 3, 7, 2, undefined, 50],
  overlord: [5, 5, 2, 6, 6, 1, 4, 40],
  necronWarrior: [5, 4, 4, 1, 7, 2, undefined, 32],
  skorpekh: [8, 6, 3, 3, 7, 2, undefined, 50],
  scarab: [10, 2, 6, 4, 8, 0, undefined, 40],
  farseer: [7, 3, 6, 4, 6, 1, 4, 25],
  guardian: [7, 3, 4, 1, 7, 2, undefined, 28.5],
  heavyPlatform: [7, 3, 4, 2, 7, 0, undefined, 40],
  direAvenger: [7, 3, 4, 1, 6, 1, undefined, 28.5],
  exarch: [7, 3, 4, 2, 6, 1, 5, 28.5],
  windrider: [14, 4, 4, 2, 7, 2, 6, 32],
  windriderLaser: [14, 4, 4, 2, 7, 2, 6, 32],
  windriderCannon: [14, 4, 4, 2, 7, 2, 6, 32],
}

// weapon: range, A (+random), skill, S, AP, D (+random), keywords
const rnd = (n: number, r?: string) => (r ? `${n ? n + '+' : ''}${r}` : `${n}`)
const WEAPON_STATS: Record<string, string> = {
  heavyVenomCannon: '36|D3|2|9|-2|3|blast1',
  stranglethornCannon: '36|1+D6|2|7|-1|2|blast1',
  boneswordLashWhip: 'melee|6|2|9|-2|3|twinLinked',
  scythingTalons: 'melee|4|2|7|-2|2|extraAttacks',
  fleshborer: '18|1|4|5|0|1|assault',
  termagantDevourer: '18|2|4|4|0|1|',
  termagantSpinefists: '12|2|4|3|0|1|assault,closeQuarters,twinLinked',
  shardlauncher: '18|D3|4|5|0|1|blast1,heavy',
  spikeRifle: '24|1|4|4|-1|1|heavy',
  strangleweb: '18|D6|-|2|0|1|assault,devastatingWounds,torrent',
  termagantClaws: 'melee|1|4|3|0|1|',
  hormagauntTalons: 'melee|3|4|3|-1|1|',
  warriorDevourer: '18|5|4|4|0|1|',
  deathspitter: '24|3|4|5|-1|1|',
  barbedStrangler: '36|1+D6|4|6|-1|1|blast1',
  venomCannon: '36|D3|4|9|-2|2|blast1',
  warriorSpinefists: '12|2|4|4|0|1|assault,closeQuarters,twinLinked',
  warriorClaws: 'melee|5|3|5|-1|1|',
  staffOfLight: '18|3|2|5|-2|1|',
  tachyonArrow: '72|1|2|16|-5|2+D6|oneShot',
  overlordsBlade: 'melee|4|2|8|-3|2|devastatingWounds',
  staffOfLightMelee: 'melee|4|2|5|-2|1|',
  voidscythe: 'melee|3|3|12|-3|3|devastatingWounds',
  gaussFlayer: '24|1|4|4|0|1|lethalHits,rapidFire1',
  gaussReaper: '12|2|4|4|-1|1|lethalHits',
  necronCCW: 'melee|1|4|4|0|1|',
  hyperphaseWeapons: 'melee|4|3|7|-2|2|',
  feederMandibles: 'melee|6|5|2|0|1|lethalHits',
  eldritchStorm: '24|D6|3|6|-2|D3|blast1,psychic',
  farseerPistol: '12|1|2|4|-1|1|assault,closeQuarters',
  witchblade: 'melee|2|2|3|0|2|anti,psychic',
  singingSpearRanged: '12|1|2|9|0|3|assault,psychic',
  singingSpearMelee: 'melee|2|2|3|0|3|psychic',
  shurikenCatapult: '18|2|3|4|-1|1|assault',
  shurikenCannon: '24|3|3|6|-1|2|lethalHits',
  brightLance: '36|1|3|12|-3|2+D6|',
  scatterLaser: '36|6|3|5|0|1|sustainedHits1',
  starcannon: '36|2|3|8|-3|2|',
  guardianCCW: 'melee|1|3|3|0|1|',
  avengerCatapult: '18|4|3|4|-1|1|assault',
  direPistol: '12|1|3|4|-1|1|assault,closeQuarters',
  direCCW: 'melee|2|3|3|0|1|',
  diresword: 'melee|4|3|4|-2|1|',
  powerGlaive: 'melee|3|3|5|-3|1|',
  twinShurikenCatapult: '18|2|3|4|-1|1|assault,twinLinked',
  windriderCCW: 'melee|3|3|3|0|1|',
}
const fmtWeapon = (id: string) =>
  WEAPONS[id].profiles
    .map((p) => {
      const kw = Object.entries(p.keywords)
        .map(([k, v]) => (v === true ? k : `${k}${typeof v === 'number' ? v : ''}`))
        .sort()
        .join(',')
      return `${p.range}|${rnd(p.attacks, p.randomA)}|${p.skill ?? '-'}|${p.s}|${p.ap}|${rnd(p.d, p.randomD)}|${kw}`
    })
    .join(' // ')

describe('datasheet data (11th edition, Wahapedia)', () => {
  it.each(Object.entries(STATS))('%s characteristics', (id, [m, t, sv, w, ld, oc, inv, base]) => {
    const p = PROFILES[id]
    expect([p.m, p.t, p.sv, p.w, p.ld, p.oc, p.invuln, p.baseMm]).toEqual([m, t, sv, w, ld, oc, inv, base])
  })
  it.each(Object.entries(WEAPON_STATS))('%s weapon profile', (id, expected) => {
    expect(fmtWeapon(id)).toBe(expected)
  })
  it('missile launcher has both profiles (starshot / sunburst)', () => {
    expect(fmtWeapon('missileLauncher')).toBe('48|1|3|10|-2|D6| // 48|D6|3|4|-1|1|blast1')
  })
  it('every model profile uses existing weapons; every datasheet ability has rules text', () => {
    for (const p of Object.values(PROFILES)) for (const w of p.weapons) expect(WEAPONS[w], `${p.id}:${w}`).toBeDefined()
    for (const d of Object.values(DATASHEETS)) for (const a of d.abilities) expect(ABILITY_TEXT[a], `${d.id}:${a}`).toBeTruthy()
  })
  it('every datasheet belongs to a known faction', () => {
    for (const d of Object.values(DATASHEETS)) expect(FACTIONS).toContain(d.faction)
  })
  it('every model profile has a token style and an original built-in portrait', () => {
    for (const id of Object.keys(PROFILES)) {
      expect(TOKENS[id], `token ${id}`).toBeDefined()
      expect(portraitFor(id), `portrait ${id}`).toMatch(/^data:image\/svg\+xml/)
    }
  })
})

describe('army compositions (docs/armies.md)', () => {
  const counts = (f: PlayerId) => Object.fromEntries(armyOf('combat-patrol', f)!.map((u) => [u.id, u.models.length]))
  it('Tyranids: 1 Hive Tyrant, 10 Termagants, 10 Hormagaunts, 3 Tyranid Warriors', () => {
    expect(counts('tyranids')).toEqual({ tyrant: 1, termagants: 10, hormagaunts: 10, warriors: 3 })
  })
  it('Necrons: 10 Necron Warriors led by 1 Overlord, 3 Skorpekh Destroyers, 3 Canoptek Scarab Swarms', () => {
    expect(counts('necrons')).toEqual({ nwar: 11, skorp: 3, scarabs: 3 })
    expect(armyOf('combat-patrol', 'necrons')!.find((u) => u.id === 'nwar')!.attached?.map((p) => p.datasheetId)).toEqual(['overlord'])
  })
  it('Aeldari: 10 Guardian Defenders (+ the datasheet platform) led by 1 Farseer, 5 Dire Avengers, 3 Windriders', () => {
    expect(counts('aeldari')).toEqual({ guardians: 12, avengers: 5, riders: 3 })
    const g = armyOf('combat-patrol', 'aeldari')!.find((u) => u.id === 'guardians')!
    expect(g.attached?.map((p) => p.datasheetId)).toEqual(['farseer'])
    expect(bodyguardModels(g).filter((m) => !profileOf(m).platform)).toHaveLength(10)
    expect(g.models.filter((m) => profileOf(m).platform)).toHaveLength(1)
  })
  it('loadouts respect the datasheet limits (special weapons per 10 / per 3 models)', () => {
    const army = armyOf('combat-patrol', 'tyranids')!
    const term = army.find((u) => u.id === 'termagants')!.models.map((m) => m.profileId)
    for (const special of ['termagantShard', 'termagantSpike', 'termagantWeb']) expect(term.filter((p) => p === special)).toHaveLength(1)
    const warriors = army.find((u) => u.id === 'warriors')!.models.map((m) => m.profileId)
    expect(warriors.filter((p) => p === 'tyranidWarriorVenom')).toHaveLength(1) // 1 venom cannon per 3 models
    expect(warriors.filter((p) => p === 'tyranidWarriorStrangler')).toHaveLength(1) // 1 barbed strangler per 3 models
    const dire = armyOf('combat-patrol', 'aeldari')!.find((u) => u.id === 'avengers')!.models.map((m) => m.profileId)
    expect(dire.filter((p) => p === 'exarch')).toHaveLength(1)
    const riders = armyOf('combat-patrol', 'aeldari')!.find((u) => u.id === 'riders')!.models.map((m) => m.profileId)
    expect(new Set(riders).size).toBe(3)
  })
  it('the classic armies are unchanged', () => {
    expect(armyOf('training-outpost', 'marines')!.map((u) => u.models.length)).toEqual([1, 5])
    expect(armyOf('training-outpost', 'orks')!.map((u) => u.models.length)).toEqual([6])
    expect(armyOf('training-outpost', 'tyranids')).toBeNull() // small boards only have the Introductory Set armies
  })
})

describe('deployment of every army on either side', () => {
  const pairs: [PlayerId, PlayerId][] = FACTIONS.flatMap((a) => FACTIONS.filter((b) => b !== a).map((b): [PlayerId, PlayerId] => [a, b]))
  it.each(pairs)('%s (west) vs %s (east): default positions are legal deployments', (a, b) => {
    const s = scenarioById('combat-patrol').build([a, b])
    for (const f of [a, b]) expect(deploymentIssues(s, f, s.units.filter((u) => u.owner === f).map((u) => u.id)), f).toEqual([])
    // no two bases overlap anywhere
    const all = s.units.flatMap(alive)
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) expect(basesOverlap(all[i].pos, radiusOf(all[i]), all[j].pos, radiusOf(all[j])), `${all[i].id}/${all[j].id}`).toBe(false)
  })
  it('refuses a pair the scenario has no armies for, and mirror matches', () => {
    expect(() => SCENARIOS[0].build(['tyranids', 'marines'])).toThrow()
    expect(() => scenarioById('combat-patrol').build(['necrons', 'necrons'])).toThrow()
  })
  it('every scenario lists the factions it can field and builds for every listed pair', { timeout: 60_000 }, () => {
    for (const sc of SCENARIOS)
      for (const a of sc.factions) for (const b of sc.factions) if (a !== b) expect(sc.build([a, b]).units.length).toBeGreaterThan(0)
  })
})
