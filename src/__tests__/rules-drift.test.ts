import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { POLICY_BILLING_CYCLES, POLICY_REMINDER_DAY_OPTIONS, POLICY_STORED_STATUSES, POLICY_TYPES } from '@/types/policy'
import { BILLING_CYCLES, REMINDER_DAY_OPTIONS, SUBSCRIPTION_CATEGORIES, SUBSCRIPTION_STATUSES } from '@/types/subscription'
import { PREMIUM_REMINDER_OPTIONS } from '@/types/notification'
import { COLLECTIONS } from '@/services/db/collections'
import { CURRENCIES } from '@/utils/currency'

/**
 * The Firestore rules repeat the allowed values from the app's types. This fails if the two drift
 * apart (e.g. a new category is added to the app but not to the rules, so saving it would be denied).
 */
const rules = readFileSync('firestore.rules', 'utf8')

/** The text of the first `[...]` list that follows `marker` in the rules. */
function listAfter(marker: string): string {
  const start = rules.indexOf(marker)
  expect(start, `"${marker}" not found in firestore.rules`).toBeGreaterThan(-1)
  const open = rules.indexOf('[', start)
  const close = rules.indexOf(']', open)
  return rules.slice(open, close + 1)
}

const quoted = (values: readonly (string | number)[]) => values.map((v) => (typeof v === 'string' ? `'${v}'` : String(v)))
const parse = (text: string) => text.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)

describe('firestore.rules stay in step with the app', () => {
  const cases: [string, string, readonly (string | number)[]][] = [
    ['subscription categories', 'd.category in', SUBSCRIPTION_CATEGORIES],
    ['subscription billing cycles', 'd.billingCycle in [\'weekly\'', BILLING_CYCLES],
    ['subscription statuses', 'd.status in [\'active\', \'paused\'', SUBSCRIPTION_STATUSES],
    ['subscription reminder days', 'd.reminderDays in [1,', REMINDER_DAY_OPTIONS],
    ['currencies', 'return v in [', CURRENCIES],
    ['policy types', 'd.policyType in', POLICY_TYPES],
    ['policy billing cycles', 'd.billingCycle in [\'monthly\', \'quarterly\'', POLICY_BILLING_CYCLES],
    ['policy stored statuses', 'd.status in [\'active\', \'cancelled\']', POLICY_STORED_STATUSES],
    ['policy reminder days', 'd.reminderDays in [7,', POLICY_REMINDER_DAY_OPTIONS],
    ['premium reminder days', 'd.premiumReminderDays in [', PREMIUM_REMINDER_OPTIONS],
  ]

  for (const [name, marker, values] of cases) {
    test(`${name} match`, () => {
      expect(parse(listAfter(marker)).sort()).toEqual(quoted(values).sort())
    })
  }

  test('every collection the app uses has a rule, and nothing else does', () => {
    const matched = [...rules.matchAll(/match \/(\w+)\/\{id\}/g)].map((m) => m[1]).sort()
    expect(matched).toEqual(Object.values(COLLECTIONS).sort())
  })

  test('the catch-all denies everything else', () => {
    expect(rules).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;/)
  })
})
