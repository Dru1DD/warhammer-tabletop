import { describe, expect, it } from 'vitest'
import { artFor, loadUnitArt, parseUnitArt } from './unitArt'

describe('unit pictures from the player\'s folder', () => {
  it('keeps plain image files only, under /unit-art/', () => {
    expect(parseUnitArt({ onagerNeutron: 'onager neutron.jpg', rangers: 'rangers.PNG', bad: '../x.png', url: 'https://x/y.png', svg: 'a.svg', n: 3 })).toEqual({
      onagerNeutron: '/unit-art/onager%20neutron.jpg',
      rangers: '/unit-art/rangers.PNG',
    })
    expect(parseUnitArt(['a.png'])).toEqual({})
    expect(parseUnitArt(null)).toEqual({})
  })

  it('a model takes its own loadout\'s picture, else its unit\'s', () => {
    const a = parseUnitArt({ onagerNeutron: 'n.jpg', onager: 'o.jpg' })
    expect(artFor(a, 'onagerNeutron', 'onager')).toBe('/unit-art/n.jpg')
    expect(artFor(a, 'onagerMissiles', 'onager')).toBe('/unit-art/o.jpg')
    expect(artFor(a, 'ranger', 'rangers')).toBeUndefined()
  })

  it('no index.json, or a broken one, means no pictures', async () => {
    const html = (async () => new Response('<!doctype html>', { status: 200 })) as unknown as typeof fetch
    expect(await loadUnitArt(html)).toEqual({})
    const missing = (async () => new Response('', { status: 404 })) as unknown as typeof fetch
    expect(await loadUnitArt(missing)).toEqual({})
    const ok = (async () => new Response(JSON.stringify({ rangers: 'r.webp' }), { status: 200 })) as unknown as typeof fetch
    expect(await loadUnitArt(ok)).toEqual({ rangers: '/unit-art/r.webp' })
  })
})
