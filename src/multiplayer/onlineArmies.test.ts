import { describe, expect, it } from 'vitest'
import { listPoints, presetList } from '../game/army/armyList'
import { useStore } from '../store'
import { armyLine, defaultLobby, normalizeLobby, startProblem } from './lobby'
import { encode, parseMessage } from './protocol'
import { sharedAssignments } from './sync'
import { GuestSession } from './guest'
import { guestPort, hostPort, testMatch } from './harness'
import { HostSession } from './host'
import { memoryPair } from './link'
import type { LobbyState } from './protocol'

const orks500 = () => presetList('orks', 500)

describe('own army lists in an online game', () => {
  it('the guest sends its list with the faction; a malformed list makes the message invalid', () => {
    const m = parseMessage(encode({ type: 'prefs', side: 'orks', army: orks500() }), true)
    expect(m).toEqual({ type: 'prefs', side: 'orks', ready: undefined, army: orks500() })
    expect(parseMessage(encode({ type: 'prefs', ready: true, army: null }), true)).toMatchObject({ army: null })
    expect(parseMessage(JSON.stringify({ type: 'prefs', side: 'orks', army: { limit: 500, units: [{ datasheetId: 'nope', size: 1 }] } }), true)).toBeNull()
    // the lobby carries both lists back to the guest
    const lobby = { ...defaultLobby(), guestConnected: true, hostArmy: presetList('marines', 500), guestArmy: orks500() }
    expect(parseMessage(encode({ type: 'lobby', lobby }), false)).toEqual({ type: 'lobby', lobby })
  })

  it('a list of the wrong faction is dropped; own lists move the game to the Combat Patrol board', () => {
    const l = normalizeLobby({ ...defaultLobby(), hostArmy: orks500(), guestArmy: orks500() })
    expect(l.hostArmy).toBeNull() // the host plays Marines
    expect(l.guestArmy).toEqual(orks500())
    expect(l.scenarioId).toBe('combat-patrol')
    expect(normalizeLobby(defaultLobby()).scenarioId).toBe('training-outpost')
  })

  it('a list that breaks the rules blocks the start, with the reason', () => {
    const over = orks500()
    over.units = [...over.units, ...over.units]
    const l = normalizeLobby({ ...defaultLobby(), scenarioId: 'combat-patrol', guestConnected: true, guestReady: true, guestArmy: over })
    expect(startProblem(l)).toContain('Состав гостя (Орки)')
    expect(startProblem({ ...l, guestArmy: orks500() })).toBeNull()
    expect(armyLine(orks500(), listPoints)).toBe(`Свой состав: ${listPoints(orks500())} / 500 очк., ${orks500().units.length} отр.`)
    expect(armyLine(null, listPoints)).toBe('Учебный состав')
  })

  it('the host builds the battle from both lists', () => {
    const marines = presetList('marines', 1000)
    const m = useStore.getState().startSharedHost({
      scenarioId: 'combat-patrol', hostSide: 'marines', guestSide: 'orks', hostArmy: marines, guestArmy: orks500(),
      assignments: sharedAssignments('marines', 'orks'),
    })
    const count = (side: string, id: string) => m.state.units.filter((u) => u.owner === side && u.datasheetId === id).length
    expect(count('orks', 'kommandos')).toBe(1)
    expect(count('orks', 'gretchin')).toBe(1)
    expect(count('marines', 'redemptor')).toBe(1)
    expect(m.state.units.filter((u) => u.owner === 'orks')).toHaveLength(orks500().units.length)
    useStore.getState().quit()
  })
})

describe('the list travels from the guest to the host', () => {
  it('prefs with a list update the lobby on both sides; a new list needs a new «ready»', () => {
    const hp = hostPort()
    let started: LobbyState | null = null
    const host = new HostSession({ port: hp.port, newToken: () => 'tok', startMatch: (l) => { started = l; const m = testMatch(l); hp.set(m); return m } })
    const gp = guestPort()
    const guest = new GuestSession({ port: gp.port, ping_ms: 5000 })
    const pair = memoryPair()
    host.accept(pair.a)
    guest.attach(pair.b)
    guest.setPrefs({ ready: true })
    expect(host.state.lobby.guestReady).toBe(true)
    guest.setPrefs({ side: 'orks', army: orks500() })
    expect(host.state.lobby.guestArmy).toEqual(orks500())
    expect(host.state.lobby.guestReady).toBe(false)
    expect(host.state.lobby.scenarioId).toBe('combat-patrol')
    expect(guest.state.lobby?.guestArmy).toEqual(orks500())
    guest.setPrefs({ ready: true, army: orks500() })
    expect(host.start()).toBeNull()
    expect(started!.guestArmy).toEqual(orks500())
    host.close()
    guest.leave()
  })
})
