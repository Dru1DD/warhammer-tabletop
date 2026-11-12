import '@testing-library/jest-dom/vitest'

// Tests assert the Russian text by default; run `TEST_LOCALE=en npm test` to check the logic is language-independent.
globalThis.__LOCALE__ = process.env.TEST_LOCALE ?? 'ru'
