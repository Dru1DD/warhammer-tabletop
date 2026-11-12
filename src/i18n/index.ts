// Tiny i18n: English source strings are the keys; `ru`, `uk` and `pl` are catalogs keyed by the English text.
// The locale is resolved once, when this module loads (saved choice → system languages → English), so module-level
// `tr()` calls in the game data work. Switching language reloads the page (see `setLocale`).
// A missing key falls back to the English text, and `src/i18n/i18n.test.ts` checks that none are missing.

export const LOCALES = ['en', 'ru', 'uk', 'pl'] as const
export type Locale = (typeof LOCALES)[number]
export type Catalog = Readonly<Record<string, string>>

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', ru: 'Русский', uk: 'Українська', pl: 'Polski' }

const STORAGE_KEY = 'locale'
const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale)

declare global {
  // eslint-disable-next-line no-var
  var __LOCALE__: string | undefined
}

function detect(): Locale {
  // tests pin the locale; an AI Web Worker has no localStorage, so the page passes its locale as the worker name
  if (isLocale(globalThis.__LOCALE__)) return globalThis.__LOCALE__
  if (typeof document === 'undefined' && typeof self !== 'undefined' && isLocale(self.name)) return self.name
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    // storage blocked: fall through to the system language
  }
  const langs = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const l of langs) {
    const primary = l?.toLowerCase().split('-')[0]
    if (isLocale(primary)) return primary
  }
  return 'en'
}

export const locale: Locale = detect()

const loaders: Record<Exclude<Locale, 'en'>, () => Promise<{ default: Catalog }>> = {
  ru: () => import('./ru'),
  uk: () => import('./uk'),
  pl: () => import('./pl'),
}

const catalog: Catalog = locale === 'en' ? {} : (await loaders[locale]()).default

/** The decimal mark of the language: a point in English, a comma in the other three. */
export const DECIMAL_MARK = locale === 'en' ? '.' : ','

const QUOTE_MARKS = { en: ['“', '”'], ru: ['«', '»'], uk: ['«', '»'], pl: ['„', '”'] }[locale]

/** A name in the quote marks of the language. */
export const quote = (s: unknown): string => `${QUOTE_MARKS[0]}${s}${QUOTE_MARKS[1]}`

export type Params = Record<string, string | number | boolean | null | undefined>

/** A key may end in `|context` to tell apart two different texts that read the same in English; it is never shown. */
const CONTEXT = /\|\w+$/

/** Translate an English source string; `{name}` placeholders are filled from `params`. */
export function tr(text: string, params?: Params): string {
  const s = catalog[text] ?? text.replace(CONTEXT, '')
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s
}

/** Save the language and reload so every module-level string is rebuilt in it. */
export function setLocale(next: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // storage blocked: the choice only lasts until the reload
  }
  location.reload()
}

/** Apply the locale to the document (`<html lang>` and the title). */
export function applyDocumentLocale(): void {
  document.documentElement.lang = locale
  document.title = tr('Tabletop Trainer 40K')
}
