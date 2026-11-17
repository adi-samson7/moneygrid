import assert from 'node:assert/strict'
import { policyFormSchema, renewalFormSchema } from '@/schemas/policy.schema'
import { usePoliciesStore } from '@/stores/policies.store'
import { useSubscriptionsStore } from '@/stores/subscriptions.store'
import { startApp } from '@/test/app-harness'
import { scenario } from '@/test/steps'
import { suggestNextPayment } from '@/utils/billing'
import { addDaysISO, todayISO } from '@/utils/dates'
import { nextPremiumWithinTerm } from '@/utils/policy-rules'

const today = todayISO()
const d = (n: number) => addDaysISO(today, n)

scenario(
  'flow: the next payment/premium date follows the billing cycle; coverage is optional',
  async (check) => {
    const h = await startApp()
    const { nav, click, setValue, waitFor, has, findAll, q, submitDialog, registerUser, act } = h
    const input = (id: string) => q<HTMLInputElement | HTMLSelectElement>(id)!
    const value = (id: string) => input(id).value

    try {
      await registerUser('Form Tester', 'forms@example.com')

      // ---------------- subscriptions ----------------
      await nav('/subscriptions/all')
      await waitFor(() => findAll('button', 'Add your first subscription').length, 'add button')
      await click(findAll('button', 'Add your first subscription')[0])
      await waitFor(() => q('#name'), 'subscription form')

      await check('subscription: a new form already shows the next payment date', async () => {
        assert.equal(value('#startDate'), today)
        assert.equal(value('#nextPaymentDate'), suggestNextPayment(today, 'monthly', today))
        assert.ok(has('Worked out from the start date and billing cycle'))
      })

      await check('subscription: choosing monthly, weekly, quarterly and yearly recalculates it', async () => {
        await setValue(q('#startDate'), d(-45))
        for (const cycle of ['monthly', 'weekly', 'quarterly', 'half-yearly', 'yearly'] as const) {
          await setValue(q('#billingCycle'), cycle)
          await waitFor(() => value('#nextPaymentDate') === suggestNextPayment(d(-45), cycle, today), `${cycle} date`)
        }
        assert.ok(value('#nextPaymentDate') >= today, 'never in the past')
      })

      await check('subscription: changing the start date moves it too', async () => {
        await setValue(q('#billingCycle'), 'monthly')
        await setValue(q('#startDate'), d(10)) // starts in the future: first payment is the start date
        await waitFor(() => value('#nextPaymentDate') === d(10), 'future start date')
        await setValue(q('#startDate'), '2026-01-31')
        await waitFor(() => value('#nextPaymentDate') === suggestNextPayment('2026-01-31', 'monthly', today), 'month-end start')
      })

      await check('subscription: a date typed by hand is kept when the start date changes, but a new billing cycle recalculates', async () => {
        await setValue(q('#nextPaymentDate'), d(20))
        await setValue(q('#startDate'), d(-90))
        await h.flush(60)
        assert.equal(value('#nextPaymentDate'), d(20), 'manual date respected')
        await setValue(q('#billingCycle'), 'weekly')
        await waitFor(() => value('#nextPaymentDate') === suggestNextPayment(d(-90), 'weekly', today), 'recalculated after the cycle changed')
      })

      await check('subscription: the shown date is the one that gets saved', async () => {
        await setValue(q('#name'), 'Gym')
        await setValue(q('#amount'), '300')
        await setValue(q('#billingCycle'), 'monthly')
        await waitFor(() => value('#nextPaymentDate') === suggestNextPayment(d(-90), 'monthly', today), 'monthly again')
        const expected = value('#nextPaymentDate')
        await submitDialog()
        await waitFor(() => !q('#name') && has('Gym'), 'saved')
        const saved = useSubscriptionsStore.getState().subscriptions.find((s) => s.name === 'Gym')!
        assert.equal(saved.nextPaymentDate, expected)
        assert.equal(saved.billingCycle, 'monthly')
      })

      await check('subscription: editing keeps the saved date, and changing the cycle recalculates it', async () => {
        await click(q('button[aria-label="Edit Gym"]'))
        await waitFor(() => (q('#name') as HTMLInputElement | null)?.value === 'Gym', 'edit form')
        const saved = useSubscriptionsStore.getState().subscriptions.find((s) => s.name === 'Gym')!
        assert.equal(value('#nextPaymentDate'), saved.nextPaymentDate, 'saved date is shown untouched')
        await setValue(q('#billingCycle'), 'yearly')
        await waitFor(() => value('#nextPaymentDate') === suggestNextPayment(saved.startDate, 'yearly', today), 'recalculated for yearly')
        await click(findAll('button', 'Cancel')[0])
        await waitFor(() => !q('#name'), 'closed')
      })

      // ---------------- policies ----------------
      await nav('/policies/all')
      await waitFor(() => findAll('button', 'Add your first policy').length, 'add policy button')
      await click(findAll('button', 'Add your first policy')[0])
      await waitFor(() => q('#policyName'), 'policy form')

      await check('policy: a new form already shows the next premium date, and coverage is marked optional', async () => {
        assert.equal(value('#nextPremiumDate'), nextPremiumWithinTerm(today, 'yearly', d(364), today))
        assert.ok(has('Coverage amount (optional)'))
        assert.ok(has('Worked out from the start date and billing cycle'))
      })

      await check('policy: the premium date follows the cycle, start and expiry; blank when none falls before expiry', async () => {
        await setValue(q('#startDate'), d(-30))
        await setValue(q('#expiryDate'), d(334))
        await setValue(q('#billingCycle'), 'yearly')
        await waitFor(() => value('#nextPremiumDate') === '', 'yearly premium already paid this term -> blank')
        await setValue(q('#billingCycle'), 'monthly')
        await waitFor(() => value('#nextPremiumDate') === nextPremiumWithinTerm(d(-30), 'monthly', d(334), today), 'monthly date')
        assert.ok(value('#nextPremiumDate') >= today)
        await setValue(q('#billingCycle'), 'quarterly')
        await waitFor(() => value('#nextPremiumDate') === nextPremiumWithinTerm(d(-30), 'quarterly', d(334), today), 'quarterly date')
        await setValue(q('#expiryDate'), d(10))
        await waitFor(() => value('#nextPremiumDate') === (nextPremiumWithinTerm(d(-30), 'quarterly', d(10), today) ?? ''), 'shorter term')
      })

      await check('policy: a blank or invalid coverage amount is handled', async () => {
        await setValue(q('#policyName'), 'Scooter Insurance')
        await setValue(q('#provider'), 'Digit')
        await setValue(q('#policyType'), 'vehicle')
        await setValue(q('#premium'), '6000')
        await setValue(q('#billingCycle'), 'yearly')
        await setValue(q('#startDate'), today)
        await setValue(q('#expiryDate'), d(364))
        await setValue(q('#coverage'), 'abc')
        await submitDialog()
        await waitFor(() => has('Enter an amount like 500000, or leave it blank'), 'invalid coverage is rejected')
        assert.ok(q('#policyName'), 'dialog stays open')
        await setValue(q('#coverage'), '')
        await waitFor(() => !has('Enter an amount like 500000, or leave it blank'), 'error clears once the field is blank')
      })

      await check('policy: saves without coverage; shown as a dash everywhere', async () => {
        await submitDialog()
        await waitFor(() => !q('#policyName') && has('Scooter Insurance'), 'saved without coverage')
        const saved = usePoliciesStore.getState().policies.find((p) => p.policyName === 'Scooter Insurance')!
        assert.equal(saved.coverageAmountMinor, 0)
        assert.equal(saved.premiumAmountMinor, 600000)
        const row = findAll('tbody tr', 'Scooter Insurance')[0]
        assert.ok(row.textContent!.includes('—'), 'coverage column shows a dash: ' + row.textContent)
        await nav(`/policies/${saved.id}`)
        await waitFor(() => has('Coverage amount'), 'details page')
        const details = findAll('dt', 'Coverage amount')[0].parentElement!.textContent!
        assert.ok(details.includes('—') && !details.includes('0.00'), details)
        await nav('/policies/details')
        await waitFor(() => has('Scooter Insurance'), 'directory')
        const card = findAll('[data-slot="card"]', 'Scooter Insurance')[0].textContent!
        assert.ok(/Coverage\s*—/.test(card), card)
      })

      await check('policy: coverage can be added later and cleared again; renewal accepts blank coverage', async () => {
        await nav('/policies/all')
        await waitFor(() => q('button[aria-label="Edit Scooter Insurance"]'), 'edit button')
        await click(q('button[aria-label="Edit Scooter Insurance"]'))
        await waitFor(() => q('#policyName'), 'edit form')
        assert.equal(value('#coverage'), '', 'no coverage shows as an empty field, not 0.00')
        await setValue(q('#coverage'), '75000')
        await submitDialog()
        await waitFor(() => !q('#policyName') && has('75,000.00'), 'coverage saved')
        await click(q('button[aria-label="Renew Scooter Insurance"]'))
        await waitFor(() => q('#newExpiryDate'), 'renew dialog')
        assert.equal(value('#coverage'), '75000.00')
        await setValue(q('#coverage'), '')
        await submitDialog()
        await waitFor(() => !q('#newExpiryDate'), 'renewed with blank coverage')
        assert.equal(usePoliciesStore.getState().policies.find((p) => p.policyName === 'Scooter Insurance')!.coverageAmountMinor, 0)
      })

      await check('policy: editing keeps the saved premium date until the cycle changes', async () => {
        await act(async () => {
          const p = usePoliciesStore.getState().policies.find((x) => x.policyName === 'Scooter Insurance')!
          await usePoliciesStore.getState().update(p.id, { ...p, billingCycle: 'monthly', nextPremiumDate: d(6), status: 'active' } as never)
        })
        await waitFor(() => q('button[aria-label="Edit Scooter Insurance"]'), 'edit button')
        await click(q('button[aria-label="Edit Scooter Insurance"]'))
        await waitFor(() => q('#policyName'), 'edit form')
        assert.equal(value('#nextPremiumDate'), d(6), 'saved date untouched on open')
        await setValue(q('#billingCycle'), 'quarterly')
        const p = usePoliciesStore.getState().policies.find((x) => x.policyName === 'Scooter Insurance')!
        await waitFor(() => value('#nextPremiumDate') === (nextPremiumWithinTerm(p.startDate, 'quarterly', p.expiryDate, today) ?? ''), 'recalculated')
      })
    } finally {
      await h.stop()
    }
  },
  180_000,
)

// The schemas themselves.
import { describe, expect, test } from 'vitest'

describe('coverage is optional in the schemas', () => {
  const policy = {
    provider: 'LIC', policyName: 'Term', policyType: 'life', policyNumber: '', premium: '1200', currency: 'INR', coverage: '',
    billingCycle: 'yearly', startDate: '2026-01-01', expiryDate: '2027-01-01', nextPremiumDate: '', status: 'active', reminderDays: '30', notes: '',
  }
  test('blank, zero and normal amounts are accepted', () => {
    for (const coverage of ['', '  ', '0', '500000', '500000.50']) {
      expect(policyFormSchema.safeParse({ ...policy, coverage }).success, `"${coverage}"`).toBe(true)
    }
  })
  test('invalid amounts are still rejected with a helpful message', () => {
    for (const coverage of ['abc', '-1', '1.234', '1,000', '5 000']) {
      const result = policyFormSchema.safeParse({ ...policy, coverage })
      expect(result.success, coverage).toBe(false)
      expect(JSON.stringify(result.error?.issues)).toContain('or leave it blank')
    }
  })
  test('the renewal form accepts a blank coverage too', () => {
    expect(renewalFormSchema.safeParse({ newExpiryDate: '2028-01-01', premium: '10', coverage: '', notes: '' }).success).toBe(true)
    expect(renewalFormSchema.safeParse({ newExpiryDate: '2028-01-01', premium: '10', coverage: 'x', notes: '' }).success).toBe(false)
  })
})
