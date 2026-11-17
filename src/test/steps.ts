import { test } from 'vitest'

export type Step = (name: string, run: () => Promise<void> | void) => Promise<void>

/**
 * A scenario is one test made of named, ordered steps that build on each other's data (create a
 * record, edit it, cancel it, delete it). Every step runs even if an earlier one fails, and the test
 * fails at the end with each failing step's name and message, so one run shows everything that is wrong.
 */
export function scenario(name: string, define: (step: Step) => Promise<void>, timeout?: number): void {
  test(
    name,
    async () => {
      const failures: string[] = []
      let passed = 0
      const step: Step = async (stepName, run) => {
        try {
          await run()
          passed += 1
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push(`  ✗ ${stepName}\n      ${message.split('\n').join('\n      ')}`)
        }
      }
      await define(step)
      if (failures.length > 0) {
        throw new Error(`${failures.length} of ${passed + failures.length} steps failed in "${name}":\n${failures.join('\n')}`)
      }
    },
    timeout,
  )
}
