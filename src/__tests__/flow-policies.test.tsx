import assert from 'node:assert/strict'
import { startApp } from '@/test/app-harness'
import { scenario } from '@/test/steps'

scenario(
  "flow: manage policies, premiums and renewals",
  async (check) => {
    const h = await startApp()
    const { nav, click, setValue, waitFor, has, path, findAll, q, submitDialog, registerUser } = h


    const today = new Date()
    const iso = (offsetDays) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const policyId = () => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('spm.mock.policies.'))
      return k ? (JSON.parse(localStorage.getItem(k))[0]?.id ?? 'none') : 'none'
    }

    try {
        await registerUser('Priya Nair', 'priya@example.com')

        await check('policies: empty state on overview, list and directory', async () => {
          await nav('/policies')
          await waitFor(() => has("You haven't added any policies yet."), 'overview empty')
          await nav('/policies/all')
          await waitFor(() => has("You haven't added any policies yet."), 'list empty')
          await nav('/policies/details')
          await waitFor(() => has("You haven't added any policies yet."), 'directory empty')
          await nav('/policies/renewals')
          await waitFor(() => has('No policies are close to expiry.') && has('No premiums are due in this period.'), 'renewals empty')
        })

        await check('policy form validation', async () => {
          await nav('/policies/all')
          await waitFor(() => findAll('button', 'Add your first policy')[0], 'add button')
          await click(findAll('button', 'Add your first policy')[0])
          await waitFor(() => q('#policyName'), 'form')
          await setValue(q('#expiryDate'), iso(-5))
          await submitDialog()
          await waitFor(() => has('Enter a policy name') && has('Enter the insurance company') && has('Expiry must be after the start date') && has('Enter an amount like'), 'errors')
        })

        await check('add policy (monthly, expiring in 20 days) -> shows in list as Expiring soon', async () => {
          await setValue(q('#policyName'), 'Family Health')
          await setValue(q('#provider'), 'HDFC Ergo')
          await setValue(q('#policyNumber'), 'FH-001')
          await setValue(q('#premium'), '1200')
          await setValue(q('#coverage'), '500000')
          await setValue(q('#billingCycle'), 'monthly')
          await setValue(q('#startDate'), iso(-100))
          await setValue(q('#expiryDate'), iso(28))
          await submitDialog()
          await waitFor(() => has('Family Health') && has('HDFC Ergo') && has('Expiring soon') && !q('#policyName'), 'row + dialog closed')
          assert.ok(has('Health Insurance'))
        })

        await check('add second policy (yearly, far expiry)', async () => {
          await click(findAll('button', 'Add policy')[0])
          await waitFor(() => q('#policyName'), 'form')
          await setValue(q('#policyName'), 'Car Cover')
          await setValue(q('#provider'), 'ICICI Lombard')
          await setValue(q('#policyType'), 'vehicle')
          await setValue(q('#premium'), '8000')
          await setValue(q('#coverage'), '300000')
          await setValue(q('#startDate'), iso(-30))
          await setValue(q('#expiryDate'), iso(334))
          await submitDialog()
          await waitFor(() => has('Car Cover') && has('Vehicle Insurance') && !q('#policyName'), 'second row')
        })

        await check('search, status and type filters', async () => {
          await setValue(q('input[aria-label="Search policies"]'), 'zzz')
          await waitFor(() => has('No policies match your search or filters.'), 'no match')
          await setValue(q('input[aria-label="Search policies"]'), 'hdfc')
          await waitFor(() => has('Family Health') && !has('Car Cover'), 'search narrows')
          await setValue(q('input[aria-label="Search policies"]'), '')
          await setValue(q('select[aria-label="Filter by type"]'), 'vehicle')
          await waitFor(() => has('Car Cover') && !has('Family Health'), 'type filter')
          await setValue(q('select[aria-label="Filter by type"]'), 'all')
          await setValue(q('select[aria-label="Filter by status"]'), 'expiring_soon')
          await waitFor(() => has('Family Health') && !has('Car Cover'), 'status filter')
          await setValue(q('select[aria-label="Filter by status"]'), 'all')
          await waitFor(() => has('Family Health') && has('Car Cover'), 'reset filters')
        })

        await check('overview: separate premium and coverage figures', async () => {
          await nav('/policies')
          await waitFor(() => has('Active policies') && has('Annual premiums') && has('Total coverage') && has('Renewals due') && has('Next premiums'), 'cards')
          // 1200*12 + 8000 = 22,400 premiums; coverage 800,000 (INR)
          assert.ok(/22,400\.00/.test(h.body()), 'annual premium total shown')
          assert.ok(/8,00,000\.00|800,000\.00/.test(h.body()), 'coverage total shown')
          assert.ok(/Active policies\s*2/.test(h.body()), 'two active policies')
        })

        await check('renewals page: expiring policy listed with Renew action; premiums listed', async () => {
          await nav('/policies/renewals')
          await waitFor(() => has('Policies to renew') && has('Family Health') && findAll('button', 'Renew').length && has('Premiums due'), 'renewals page')
          await waitFor(() => findAll('button', 'Mark paid').length, 'premium row')
        })

        await check('mark premium paid with notes -> shows in policy details history', async () => {
          await click(findAll('button', 'Mark paid')[0])
          await waitFor(() => q('#paymentDate'), 'dialog')
          await setValue(q('#notes'), 'paid by upi')
          await submitDialog()
          await waitFor(() => !q('#paymentDate'), 'closed')
          await nav(`/policies/${policyId()}`)
          await waitFor(() => has('Premium payments') && has('Renewal history') && has('paid by upi'), 'details history')
        })

        await check('renew from the renewals page: dialog, history, new expiry', async () => {
          await nav('/policies/renewals')
          await waitFor(() => findAll('button', 'Renew')[0], 'renew btn')
          await click(findAll('button', 'Renew').find((b) => b.textContent.trim() === 'Renew'))
          await waitFor(() => q('#newExpiryDate'), 'renew dialog')
          await setValue(q('#premium'), '1300')
          await setValue(q('#notes'), 'renewed online')
          await submitDialog()
          await waitFor(() => !q('#newExpiryDate'), 'closed')
          await waitFor(() => has('No policies are close to expiry.'), 'no longer due for renewal')
          await nav(`/policies/${policyId()}`)
          await waitFor(() => has('renewed online') && has('Renewed on'), 'renewal history row')
          assert.ok(has('Active'), 'now active')
        })

        await check('directory page lists policy cards that open details', async () => {
          await nav('/policies/details')
          await waitFor(() => has('Family Health') && has('Car Cover') && has('Coverage'), 'cards')
          await click(findAll('a', 'Car Cover')[0])
          await waitFor(() => /\/policies\/[0-9a-f-]{36}/.test(path()) && has('Car Cover') && has('Insurance company'), 'details page')
        })

        await check('edit policy via dialog is prefilled and saves', async () => {
          await click(q('button[aria-label="Edit Car Cover"]'))
          await waitFor(() => q('#policyName')?.value === 'Car Cover' && q('#premium')?.value === '8000.00', 'prefilled')
          await setValue(q('#premium'), '8500')
          await setValue(q('#notes'), 'IDV updated')
          await submitDialog()
          await waitFor(() => has('IDV updated') && has('8,500.00'), 'saved')
        })

        await check('cancel (confirm) keeps history and flips status; reactivate restores', async () => {
          await click(q('button[aria-label="Cancel Car Cover"]'))
          await waitFor(() => has('Cancel Car Cover?'), 'confirm')
          await click(findAll('button', 'Cancel policy')[0])
          await waitFor(() => has('Cancelled') && q('button[aria-label="Reactivate Car Cover"]'), 'cancelled')
          assert.ok(!q('button[aria-label="Renew Car Cover"]'), 'no renew while cancelled')
          await nav('/policies')
          await waitFor(() => /Active policies\s*1/.test(h.body()), 'cancelled excluded from active count')
          await nav('/policies/all')
          await waitFor(() => q('button[aria-label="Reactivate Car Cover"]'), 'list actions')
          await click(q('button[aria-label="Reactivate Car Cover"]'))
          await waitFor(() => !q('button[aria-label="Reactivate Car Cover"]') && q('button[aria-label="Cancel Car Cover"]'), 'reactivated')
        })

        await check('delete (confirm) removes the policy', async () => {
          await click(q('button[aria-label="Delete Car Cover"]'))
          await waitFor(() => has('Delete Car Cover?'), 'confirm')
          await click(h.findAll('button').find((b) => b.textContent.trim() === 'Delete'))
          await waitFor(() => findAll('a', 'Car Cover').length === 0 && findAll('a', 'Family Health').length === 1, 'deleted')
        })

        await check('policy data is separate from subscription data and per-user', async () => {
          await nav('/subscriptions/all')
          await waitFor(() => has("You haven't added any subscriptions yet."), 'subs untouched')
          const keys = Object.keys(localStorage)
          assert.ok(keys.some((k) => k.startsWith('spm.mock.policyPayments.')))
          assert.ok(!keys.some((k) => k.startsWith('spm.mock.subscriptionPayments.') && JSON.parse(localStorage.getItem(k)).length))
        })

        await check('unknown policy id shows not-found state', async () => {
          await nav('/policies/nope')
          await waitFor(() => has('could not be found'), 'not found')
        })
    } finally {
      await h.stop()
    }
  },
  120_000,
)
