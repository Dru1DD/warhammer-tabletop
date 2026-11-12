/// <reference types="vitest/config" />
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  // The AI worker is a module worker and loads its language catalog with a top-level await (src/i18n/index.ts).
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // the UI tests that play whole turns through the store take 0.3–0.9 s alone, but under a full parallel run on a
    // laptop some went over the default 5 s; 20 s keeps them stable without hiding a real hang
    testTimeout: 20_000,
  },
})
