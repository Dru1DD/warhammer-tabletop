import { describe, expect, it } from 'vitest'
import { presetList } from '../army/armyList'
import { applyPreset, DEPLOY_PRESETS, deployWithPreset, presetFit, recommendedPreset } from '../army/deployPresets'
import { unitProfile } from '../army/roles'
import { listUnits } from '../army/placement'
import { alive, sidesOf, unitsOf } from '../gameState'
import { deploymentProblem, deploymentZone } from '../rules/deployment'
import { scenarioById } from '../scenarios/scenarios'
import { FACTIONS, type GameState, type PlayerId } from '../types'

const battle = (a: PlayerId, b: PlayerId, limit: 500 | 1000 = 1000) =>
  scenarioById('combat-patrol').build([a, b], { [a]: presetList(a, limit), [b]: presetList(b, limit) })

/** 0 = own board edge, 1 = front line of the zone, for the centre of unit `id`. */
function forwardness(s: GameState, p: PlayerId, positions: Record<string, { x: number }>, ids: string[]) {
  const xs = deploymentZone(s, p).map((q) => q.x)
  const [min, max] = [Math.min(...xs), Math.max(...xs)]
  const west = sidesOf(s)[0] === p
  const vals = ids.map((id) => {
    const u = s.units.find((x) => x.id === id)!
    const cx = alive(u).reduce((a, m) => a + positions[m.id].x, 0) / alive(u).length
    return west ? (cx - min) / (max - min) : (max - cx) / (max - min)
  })
  return vals.reduce((a, v) => a + v, 0) / vals.length
}

describe('unit roles', () => {
  it('come from the datasheets', () => {
    const s = battle('orks', 'adeptus_mechanicus')
    const role = (prefix: string) => unitProfile(s.units.find((u) => u.id.startsWith(prefix))!).role
    expect(role('boyz')).toBe('assault')
    expect(role('nobz')).toBe('assault')
    expect(role('gretchin')).toBe('screen')
    // the Warboss leads the biggest Boyz mob, which stays an assault unit; a character on its own is a character
    expect(s.units.some((u) => u.id.startsWith('warboss'))).toBe(false)
    expect(unitProfile(listUnits('orks', { limit: 1000, units: [{ datasheetId: 'warboss', size: 1, attachTo: null }] })[0]).role).toBe('character')
    expect(role('rangers')).toBe('shooter')
    expect(role('sicarians')).toBe('infiltrator')
  })
})

describe('deployment presets', () => {
  it('set up every army legally in every preset (500 and 1000 points, both sides of the table)', () => {
    for (const limit of [500, 1000] as const)
      for (const f of FACTIONS) {
        const foe: PlayerId = f === 'marines' ? 'orks' : 'marines'
        for (const [a, b] of [[f, foe], [foe, f]] as const)
          for (const p of DEPLOY_PRESETS) {
            const s = battle(a, b, limit)
            const res = applyPreset(s, f, p.id)
            expect(res.followed, `${limit} ${a} vs ${b} ${p.id}`).toBe(true)
            for (const u of unitsOf(s, f)) expect(deploymentProblem(s, u, {}), `${limit} ${a} vs ${b} ${p.id} ${u.id}`).toBeNull()
          }
      }
  }, 120_000)

  it('do not change the game state they are computed from', () => {
    const s = battle('orks', 'adeptus_mechanicus')
    const before = JSON.stringify(s)
    deployWithPreset(s, 'orks', 'assault')
    expect(JSON.stringify(s)).toBe(before)
  })

  it('put the assault units forward in Assault and back in Defence', () => {
    // 500 points: at 1000 the Orks fill the whole zone and stand where they fit
    const s = battle('orks', 'adeptus_mechanicus', 500)
    const ids = unitsOf(s, 'orks').filter((u) => unitProfile(u).role === 'assault').map((u) => u.id)
    const fwd = (p: 'assault' | 'defensive') => forwardness(s, 'orks', deployWithPreset(s, 'orks', p).positions, ids)
    expect(fwd('assault')).toBeGreaterThan(fwd('defensive') + 0.25)
  })

  it('spread the shooters along the zone in the Gun line', () => {
    const s = battle('adeptus_mechanicus', 'tyranids')
    const res = deployWithPreset(s, 'adeptus_mechanicus', 'gunline')
    const ys = unitsOf(s, 'adeptus_mechanicus')
      .filter((u) => res.roles[u.id] === 'shooter')
      .map((u) => alive(u).reduce((a, m) => a + res.positions[m.id].y, 0) / alive(u).length)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(s.board.height * 0.5)
  })

  it('recommend the doctrine that suits the army', () => {
    const s = battle('orks', 'adeptus_mechanicus')
    expect(recommendedPreset(s, 'orks')).toBe('assault')
    expect(recommendedPreset(s, 'adeptus_mechanicus')).toBe('gunline')
    expect(presetFit(s, 'adeptus_mechanicus', 'assault').fit).toBeLessThan(presetFit(s, 'adeptus_mechanicus', 'gunline').fit)
  })
})
