import { describe, expect, it } from 'vitest'
import { engagementAdvice } from '../engagementAdvice'
import { alive } from '../gameState'
import { movePreview } from '../movePreview'
import type { GameState, PlayerId, Vec } from '../types'
import { battle, column, place } from './helpers'

const byDatasheet = (s: GameState, id: string) => s.units.find((u) => u.datasheetId === id)!

function table(west: PlayerId, east: PlayerId, keep: string[]) {
  const s = battle(west, east, 'movement', west)
  for (const u of s.units) if (!keep.includes(u.datasheetId)) place(s, u.id, [])
  return s
}

describe('stay in combat or fall back', () => {
  it('Skitarii Rangers locked with a Hive Tyrant: get out, they only lose models there', () => {
    const s = table('adeptus_mechanicus', 'tyranids', ['rangers', 'hiveTyrant'])
    place(s, byDatasheet(s, 'rangers').id, column(10, 5, 10))
    place(s, byDatasheet(s, 'hiveTyrant').id, [{ x: 13, y: 10 }])
    const a = engagementAdvice(s, byDatasheet(s, 'rangers'))!
    expect(a.holding).toContain(byDatasheet(s, 'hiveTyrant').name)
    expect(a.stayTaken).toBeGreaterThan(a.stayDealt)
    expect(a.verdict).toBe('leave')
  })

  it('Rangers holding a Deff Dread next to the Kataphrons: stay, or the Dread charges the Kataphrons', () => {
    const s = table('adeptus_mechanicus', 'orks', ['rangers', 'deffDread', 'destroyers'])
    place(s, byDatasheet(s, 'rangers').id, column(10, 5, 10))
    place(s, byDatasheet(s, 'deffDread').id, [{ x: 13.5, y: 10 }])
    place(s, byDatasheet(s, 'destroyers').id, column(14, 18, 3, 2.5))
    const a = engagementAdvice(s, byDatasheet(s, 'rangers'))!
    expect(a.freed?.victim).toBe(byDatasheet(s, 'destroyers').name)
    expect(a.verdict).toBe('stay')
    expect(a.why).toContain('держит врага')
  })

  it('no advice for a unit that is not in combat', () => {
    const s = table('adeptus_mechanicus', 'orks', ['rangers', 'deffDread'])
    place(s, byDatasheet(s, 'rangers').id, column(10, 5, 10))
    place(s, byDatasheet(s, 'deffDread').id, [{ x: 30, y: 10 }])
    expect(engagementAdvice(s, byDatasheet(s, 'rangers'))).toBeNull()
  })
})

describe('move preview: charges from the planned spot', () => {
  it('moving the Kastelans up turns a long-shot charge on the Deff Dread into a near-certain one', () => {
    const s = table('adeptus_mechanicus', 'orks', ['kastelans', 'deffDread'])
    const kast = byDatasheet(s, 'kastelans')
    place(s, kast.id, [{ x: 10, y: 10 }, { x: 10, y: 13 }])
    place(s, byDatasheet(s, 'deffDread').id, [{ x: 25, y: 11.5 }])
    const here = movePreview(s, kast.id, {}, 'normal')!
    const near: Record<string, Vec> = Object.fromEntries(alive(kast).map((m) => [m.id, { x: m.pos.x + 6, y: m.pos.y }]))
    const there = movePreview(s, kast.id, near, 'normal')!
    const dread = (p: typeof here) => p.charges.find((c) => c.name === byDatasheet(s, 'deffDread').name)
    expect(dread(there)!.p).toBeGreaterThan(dread(here)?.p ?? 0)
    expect(dread(there)!.dealt).toBeGreaterThan(0)
  })

  it('no charge after an Advance; a unit in combat gets the stay-or-leave advice instead', () => {
    const s = table('adeptus_mechanicus', 'orks', ['rangers', 'deffDread'])
    place(s, byDatasheet(s, 'rangers').id, column(10, 5, 10))
    place(s, byDatasheet(s, 'deffDread').id, [{ x: 13.5, y: 10 }])
    const rangers = byDatasheet(s, 'rangers')
    expect(movePreview(s, rangers.id, {}, 'advance')!.charges).toEqual([])
    const fb = movePreview(s, rangers.id, {}, 'fallBack')!
    expect(fb.engagement).not.toBeNull()
  })
})
