import assert from 'node:assert/strict'
import { usePoliciesStore } from '@/stores/policies.store'
import { useSubscriptionsStore } from '@/stores/subscriptions.store'
import { startApp } from '@/test/app-harness'
import { scenario } from '@/test/steps'

const today = new Date()
const iso = (n: number) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

scenario(
  'flow: analytics page figures, charts and currency selection',
  async (check) => {
    const h = await startApp()
    const { nav, click, setValue, waitFor, has, body, path, findAll, q, registerUser, act } = h
    const S = () => useSubscriptionsStore.getState()
    const P = () => usePoliciesStore.getState()
    const chart = (prefix: string) => q(`[role="img"][aria-label^="${prefix}"]`)?.getAttribute('aria-label') ?? ''

    const sub = (o: object) => ({ name: 'x', provider: '', category: 'Entertainment', amountMinor: 49900, currency: 'INR', billingCycle: 'monthly', startDate: iso(-40), nextPaymentDate: iso(5), paymentMethod: '', reminderDays: 3, ...o }) as never
    const pol = (o: object) => ({ provider: 'Acme', policyName: 'x', policyType: 'health', policyNumber: '', premiumAmountMinor: 1200000, currency: 'INR', coverageAmountMinor: 50000000, billingCycle: 'yearly', startDate: iso(-100), expiryDate: iso(264), nextPremiumDate: '', reminderDays: 30, notes: '', ...o }) as never

    try {
      await registerUser('Ira Shah', 'ira@example.com')

      await check('empty state for a new user, with links to add records', async () => {
        await nav('/analytics')
        await waitFor(() => has('Nothing to analyse yet') && findAll('a', 'Add a subscription').length && findAll('a', 'Add a policy').length, 'empty state')
      })

      await act(async () => {
        await S().create(sub({ name: 'Netflix', amountMinor: 49900 }))
        await S().create(sub({ name: 'Prime', amountMinor: 149900, billingCycle: 'yearly', nextPaymentDate: iso(200) }))
        await S().create(sub({ name: 'Gym', amountMinor: 30000, billingCycle: 'weekly', nextPaymentDate: iso(3) }))
        await S().create(sub({ name: 'ChatGPT', currency: 'USD', amountMinor: 2000 }))
        await P().create(pol({ policyName: 'Family Health', policyType: 'health', premiumAmountMinor: 1200000, coverageAmountMinor: 50000000 }))
        await P().create(pol({ policyName: 'Car Cover', policyType: 'vehicle', premiumAmountMinor: 900000, coverageAmountMinor: 30000000, expiryDate: iso(20), nextPremiumDate: iso(4), billingCycle: 'monthly' }))
        await P().create(pol({ policyName: 'Trip', policyType: 'travel', currency: 'USD', premiumAmountMinor: 10000, coverageAmountMinor: 1000000 }))
      })

      await check('sections and summary cards show figures for the preferred currency', async () => {
        await nav('/analytics')
        await waitFor(() => has('Overview') && has('Premiums due in 30 days'), 'analytics page')
        for (const heading of ['Overview', 'Subscriptions', 'Policies', 'Combined']) {
          assert.ok(findAll('h2', heading).length, heading)
        }
        const t = body()
        assert.ok(/Active subscriptions\s*3/.test(t), 'INR subscriptions only (ChatGPT is USD)')
        assert.ok(/Monthly subscription spending\s*[^A-Za-z]*1,923\.92/.test(t), '499 + 1499/12 + 300*52/12 = 1,923.92')
        assert.ok(/Annual subscription spending\s*[^A-Za-z]*23,087\.00/.test(t), '23,087')
        assert.ok(/Active policies\s*2/.test(t))
        assert.ok(/Annual policy premiumss*[^A-Za-z]*120,000.00/.test(t), 'premiums 12,000 yearly + 9,000 x 12: ' + t.match(/Annual policy premiums[^]{0,40}/)?.[0])
        assert.ok(/Policies expiring soon\s*1/.test(t), 'Car Cover expires in 20 days')
        assert.ok(/Premiums due in 30 days\s*1/.test(t), 'Car premium due in 4 days')
      })

      await check('coverage is shown apart from spending and never added into it', async () => {
        const t = body()
        assert.ok(/Total coverage\s*[^A-Za-z]*(?:8,00,000\.00|800,000\.00)/.test(t), 'coverage 800,000')
        const totalRecurring = t.match(/Total recurring per year\s*([^A-Za-z]*[\d,]+\.\d\d)/)?.[1] ?? ''
        const digits = Number(totalRecurring.replace(/[^\d.]/g, ''))
        assert.ok(digits < 200000, 'total recurring is premiums + subscriptions, not coverage: ' + totalRecurring)
        await waitFor(() => chart('Bar chart of annual premiums'), 'premium chart')
        assert.ok(!/800,?000|8,00,000/.test(chart('Bar chart of annual premiums')), 'premium chart has no coverage')
        const coverageCard = findAll('[data-slot="card-title"]', 'Coverage by type')[0].closest('[data-slot="card"]')!.textContent!
        assert.ok(coverageCard.includes('Health Insurance') && coverageCard.includes('Vehicle Insurance') && !coverageCard.includes('Travel'), 'INR types only')
      })

      await check('price comparison ranks subscriptions by monthly cost with their billing cycle', async () => {
        const label = await waitFor(() => chart('Bar chart of monthly cost per subscription'), 'price chart')
        assert.ok(label.indexOf('Gym') < label.indexOf('Netflix') && label.indexOf('Netflix') < label.indexOf('Prime'), label)
        assert.ok(label.includes('billed weekly') && label.includes('billed yearly') && label.includes('billed monthly'))
        assert.ok(!label.includes('ChatGPT'), 'USD subscription is not mixed in')
      })

      await check('category chart covers subscriptions only', async () => {
        const label = await waitFor(() => chart('Pie chart of monthly spending'), 'category chart')
        assert.ok(label.includes('Entertainment'))
        assert.ok(!/Insurance/.test(label), 'no policy types in the subscription category chart')
      })

      await check('spending history is empty until a payment is marked paid', async () => {
        assert.ok(has('No paid payments in INR in this period'))
        const netflix = S().subscriptions.find((s) => s.name === 'Netflix')!
        const open = S().payments.find((p) => p.subscriptionId === netflix.id && p.status === 'upcoming')!
        await act(async () => { await S().resolvePayment(open.id, { status: 'paid', paymentDate: iso(0) }) })
        const label = await waitFor(() => chart('Line chart of money paid per month'), 'history chart')
        assert.ok(/499\.00/.test(label), label)
        assert.ok(!has('No paid payments in INR in this period'))
      })

      await check('currency selector switches every figure to that currency', async () => {
        assert.ok(has('You also have records in USD'))
        await setValue(q('#analyticsCurrency'), 'USD')
        await waitFor(() => /Active subscriptions\s*1/.test(body()), 'USD subscriptions')
        const t = body()
        assert.ok(/Monthly subscription spending\s*[^A-Za-z]*20\.00/.test(t))
        assert.ok(/Active policies\s*1/.test(t))
        assert.ok(/Total coverage\s*[^A-Za-z]*10,000\.00/.test(t))
        const label = await waitFor(() => chart('Bar chart of monthly cost per subscription'), 'chart')
        assert.ok(label.includes('ChatGPT') && !label.includes('Netflix'))
        assert.ok(has('Travel Insurance'))
      })

      await check('a currency with no records of one kind shows a clear empty message', async () => {
        await act(async () => {
          const chatgpt = S().subscriptions.find((s) => s.name === 'ChatGPT')!
          await S().setStatus(chatgpt.id, 'cancelled')
        })
        await waitFor(() => has('No active subscriptions in USD.'), 'empty price chart message')
        assert.ok(/Active subscriptions\s*0/.test(body()))
      })

      await check('numbers match the dashboard for the same data', async () => {
        await setValue(q('#analyticsCurrency'), 'INR')
        await waitFor(() => /Active subscriptions\s*3/.test(body()), 'INR again')
        await nav('/')
        await waitFor(() => has('Monthly spending') && has('Annual spending'), 'dashboard')
        assert.ok(/1,923\.92/.test(body()), 'dashboard monthly spend agrees')
        assert.ok(/23,087\.00/.test(body()), 'dashboard annual spend agrees')
      })

      await check('another user sees an empty analytics page', async () => {
        await click(q('button[aria-label="Log out"]'))
        await waitFor(() => path() === '/login', 'logged out')
        await registerUser('Other Person', 'other@example.com')
        await nav('/analytics')
        await waitFor(() => has('Nothing to analyse yet'), 'empty for the new user')
        assert.ok(!has('Netflix'))
      })
    } finally {
      await h.stop()
    }
  },
  120_000,
)
