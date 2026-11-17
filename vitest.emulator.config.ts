import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Tests that need the Firebase emulators (Firestore security rules, the Firestore data layer and
 * Firebase sign-in). Run them with `npm run test:emulator`, which starts the emulators first.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // Never read .env.local (the real Firebase settings): these tests talk to the emulators only.
  envDir: false,
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    // Run the app's own services against the emulators instead of localStorage.
    env: { VITE_BACKEND: 'firebase', VITE_USE_EMULATORS: 'true' },
    include: ['src/**/*.emulator.test.{ts,tsx}'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // The emulators hold shared state, so test files run one at a time.
    fileParallelism: false,
  },
})
