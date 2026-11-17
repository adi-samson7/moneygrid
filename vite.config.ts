/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // Tests must never read .env.local: it holds the real Firebase settings, and a test run would then
  // create accounts and data in the real project. Tests set what they need themselves.
  envDir: mode === 'test' ? false : undefined,
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Emulator tests need the Firebase emulators; run them with npm run test:emulator.
    exclude: ['**/node_modules/**', '**/*.emulator.test.{ts,tsx}'],
    // Browser-flow tests boot the whole app, so they get more time than unit tests.
    testTimeout: 60_000,
  },
}))
