import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { locale, tr } from './index'
import pl from './pl'
import ru from './ru'
import uk from './uk'

const catalogs = { ru, uk, pl }
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

/** Every `tr('…')` call in the app's source: the English keys the app asks for. */
function usedKeys(): Set<string> {
  const keys = new Set<string>()
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        if (name !== '__tests__' && name !== '__fixtures__') walk(path)
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !path.includes(join('src', 'i18n'))) {
        for (const m of readFileSync(path, 'utf8').matchAll(/\btr\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\(['\\])/g, '$1').replace(/\\n/g, '\n'))
      }
    }
  }
  walk(join(process.cwd(), 'src'))
  return keys
}

describe('translations', () => {
  const english = Object.keys(ru).sort()

  it('every language has exactly the same keys', () => {
    expect(Object.keys(uk).sort()).toEqual(english)
    expect(Object.keys(pl).sort()).toEqual(english)
  })

  it('every translation keeps the placeholders of its key', () => {
    for (const [name, catalog] of Object.entries(catalogs))
      for (const [key, text] of Object.entries(catalog)) expect(placeholders(text), `${name}: ${key}`).toEqual(placeholders(key))
  })

  it('has a translation for every tr() call in the source, and no unused ones', () => {
    const used = usedKeys()
    expect([...used].filter((k) => !(k in ru)), 'missing').toEqual([])
    expect(english.filter((k) => !used.has(k)), 'unused').toEqual([])
  })

  it('keeps each script where it belongs', () => {
    const cyrillic = /[А-Яа-яЁёІіЇїЄєҐґ]/
    for (const key of english) expect(key, 'English key').not.toMatch(cyrillic)
    for (const [key, text] of Object.entries(pl)) expect(text, `pl: ${key}`).not.toMatch(cyrillic)
    for (const [key, text] of Object.entries(uk)) expect(text, `uk: ${key}`).not.toMatch(/[ыэъЫЭЪ]/)
  })
})

describe('tr', () => {
  it('translates, fills placeholders and hides the |context suffix', () => {
    expect(locale).toBe(process.env.TEST_LOCALE ?? 'ru')
    expect(tr('Not translated|context')).toBe('Not translated')
    expect(tr('Round {round}/{maxRounds}', { round: 2, maxRounds: 5 })).toMatch(/2.*5/)
    expect(tr('Not in any catalog {x}', { x: 1 })).toBe('Not in any catalog 1')
  })
})
