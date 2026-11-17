import assert from 'node:assert/strict'
import { startApp } from '@/test/app-harness'
import { scenario } from '@/test/steps'

scenario(
  "flow: dashboard figures and updates",
  async (check) => {
    const h = await startApp()
    const { nav, click, waitFor, has, path, findAll, q, submitDialog, registerUser, act } = h


    const today = new Date()
    const iso = (n) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const text = () => h.body()

    try {
        await registerUser('Dev Patel', 'dev@example.com')

        await check('dashboard: empty state for a new user, with links to add records', async () => {
          await nav('/')
          await waitFor(() => has('Nothing to show yet') && findAll('a', 'Add a subscription').length && findAll('a', 'Add a policy').length, 'empty state')
        })

        // Seed through the app's own stores (same code path the UI uses).
        const { useSubscriptionsStore } = await import('@/stores/subscriptions.store')
        const { usePoliciesStore } = await import('@/stores/policies.store')
        const S = () => useSubscriptionsStore.getState()
        const P = () => usePoliciesStore.getState()
        const sub = (o) => ({ name: 'x', provider: '', category: 'Entertainment', amountMinor: 49900, currency: 'INR', billingCycle: 'monthly', startDate: iso(-40), nextPaymentDate: iso(3), paymentMethod: '', reminderDays: 3, ...o })
        const pol = (o) => ({ provider: 'Acme', policyName: 'x', policyType: 'vehicle', policyNumber: '', premiumAmountMinor: 900000, currency: 'INR', coverageAmountMinor: 77777700, billingCycle: 'yearly', startDate: iso(-100), expiryDate: iso(264), nextPremiumDate: iso(10), reminderDays: 30, notes: '', ...o })
        await act(async () => {
          await S().create(sub({ name: 'Netflix', amountMinor: 49900, nextPaymentDate: iso(3) }))
          await S().create(sub({ name: 'Spotify', category: 'Music', amountMinor: 11900, nextPaymentDate: iso(20) }))
          await S().create(sub({ name: 'ChatGPT', category: 'Software', currency: 'USD', amountMinor: 2000, nextPaymentDate: iso(5) }))
          await P().create(pol({ policyName: 'Car Cover', policyType: 'vehicle' }))
          await P().create(pol({ policyName: 'Health Plan', policyType: 'health', billingCycle: 'monthly', premiumAmountMinor: 120000, coverageAmountMinor: 55555500, startDate: iso(-100), expiryDate: iso(10), nextPremiumDate: iso(6) }))
        })

        await check('dashboard: all six summary cards show figures derived from the records', async () => {
          await nav('/')
          await waitFor(() => has('Active subscriptions') && has('Upcoming renewals'), 'dashboard')
          const t = text()
          assert.ok(/Active subscriptions\s*3/.test(t), 'active subscriptions = 3')
          assert.ok(/Monthly spending\s*[^A-Z]*618\.00/.test(t), 'monthly INR 618.00 in: ' + t.slice(0, 400))
          assert.ok(/\$20\.00/.test(t), 'USD monthly shown separately')
          assert.ok(/Annual spending\s*[^A-Z]*7,416\.00|Annual spending\s*[^A-Z]*74,16\.00/.test(t) || /Annual spending[^]*7,?416/.test(t), 'annual spending')
          assert.ok(/Active policies\s*2/.test(t), 'active policies = 2')
          assert.ok(/3 in 7 days/.test(t) && /5 in 30 days/.test(t), 'upcoming 7/30: ' + t.match(/Upcoming payments[^]{0,80}/)?.[0])
          assert.ok(/Upcoming renewals\s*1/.test(t), 'one policy expiring soon')
        })

        await check('dashboard: upcoming payments mixes subscriptions and premiums, labelled by module', async () => {
          const t = text()
          for (const name of ['Netflix', 'Spotify', 'ChatGPT', 'Car Cover', 'Health Plan']) assert.ok(t.includes(name), name)
          assert.ok(findAll('li', 'Netflix').some((li) => li.textContent.includes('Subscription')), 'subscription badge')
          assert.ok(findAll('li', 'Health Plan').some((li) => li.textContent.includes('Policy')), 'policy badge')
          // soonest first
          const order = ['Netflix', 'ChatGPT', 'Health Plan', 'Car Cover', 'Spotify'].map((n) => t.indexOf(n, t.indexOf('Upcoming payments')))
          assert.deepEqual(order, [...order].sort((a, b) => a - b), 'sorted by due date')
        })

        await check('dashboard: renewals card lists the expiring policy only', async () => {
          const card = findAll('[data-slot="card-title"]', 'Upcoming policy renewals')[0].closest('[data-slot="card"]').textContent
          assert.ok(card.includes('Health Plan') && card.includes('Expiring soon'))
          assert.ok(!card.includes('Car Cover'))
        })

        await check('dashboard: coverage never leaks into spending figures', async () => {
          const t = text()
          assert.ok(!/777,?777|7,77,777/.test(t), 'car coverage not shown')
          assert.ok(!/555,?555|5,55,555/.test(t), 'health coverage not shown')
        })

        await check('dashboard: category chart separates modules and notes excluded currency', async () => {
          const t = text()
          assert.ok(t.includes('Spending by category') && t.includes('Entertainment') && t.includes('Music') && t.includes('Vehicle Insurance') && t.includes('Health Insurance'))
          const catCard = findAll('[data-slot="card-title"]', 'Spending by category')[0].closest('[data-slot="card"]')
          assert.ok(!catCard.textContent.includes('Software'), 'USD subscription not charted in INR')
          assert.ok(/2 active records in other currencies are not shown|1 active record in other currencies is not shown/.test(t), 'excluded note: ' + t.match(/\d+ active record[^.]*\./)?.[0])
        })

        await check('dashboard: annual summary keeps subscriptions, premiums and total apart', async () => {
          const card = findAll('div', 'Annual spending').filter((d) => d.textContent.includes('Total recurring')).pop().textContent
          assert.ok(card.includes('Subscriptions') && card.includes('Policy premiums') && card.includes('Total recurring'))
          // policies: 9,000 + 1,200*12 = 23,400 ; subscriptions INR: 618*12 = 7,416 ; total 30,816
          assert.ok(/23,400\.00/.test(card) && /7,416\.00/.test(card) && /30,816\.00/.test(card), card)
        })

        await check('dashboard: expenditure empty until something is paid; activity lists changes', async () => {
          assert.ok(has('No paid payments in this period yet'))
          assert.ok(has('Recent activity') && has('Added subscription Netflix') && has('Added policy Car Cover'))
        })

        await check('paying a subscription updates the dashboard (expenditure, upcoming, activity)', async () => {
          await nav('/subscriptions/upcoming')
          await waitFor(() => findAll('button', 'Mark paid').length, 'open payments')
          await click(findAll('button', 'Mark paid')[0]) // soonest: Netflix
          await waitFor(() => q('#paymentDate'), 'dialog')
          await submitDialog()
          await waitFor(() => !q('#paymentDate'), 'closed')
          await nav('/')
          await waitFor(() => has('Recent activity') && has('Marked as paid: Netflix payment'), 'activity shows payment')
          const chart = q('[role="img"][aria-label^="Bar chart"]')
          assert.ok(chart, 'bar chart rendered with a description')
          assert.ok(/499\.00/.test(chart.getAttribute('aria-label')), chart.getAttribute('aria-label'))
          assert.ok(!has('No paid payments in this period yet'))
          assert.ok(/2 in 7 days/.test(text()), 'Netflix next due is beyond 7 days now')
        })

        await check('paying a premium shows policy spending separately in the chart', async () => {
          await nav('/policies/renewals')
          await waitFor(() => findAll('button', 'Mark paid').length, 'premium rows')
          await click(findAll('button', 'Mark paid')[0]) // Health Plan premium (+6) is soonest
          await waitFor(() => q('#paymentDate'), 'dialog')
          await submitDialog()
          await waitFor(() => !q('#paymentDate'), 'closed')
          await nav('/')
          await waitFor(() => has('Marked as paid: Health Plan premium'), 'activity')
          const label = q('[role="img"][aria-label^="Bar chart"]').getAttribute('aria-label')
          assert.ok(/1,?200\.00/.test(label) || /1,?699\.00/.test(label), 'premium + subscription in current month: ' + label)
        })

        await check('cancelled subscriptions leave the recurring figures', async () => {
          const spotify = S().subscriptions.find((s) => s.name === 'Spotify')
          await act(async () => { await S().setStatus(spotify.id, 'cancelled') })
          await nav('/')
          await waitFor(() => has('Cancelled Spotify'), 'activity')
          const t = text()
          assert.ok(/Active subscriptions\s*2/.test(t))
          const catCard = findAll('[data-slot="card-title"]', 'Spending by category')[0].closest('[data-slot="card"]')
          assert.ok(!catCard.textContent.includes('Music'), 'Music category gone')
          assert.ok(!/Monthly spending\s*[^A-Z]*618\.00/.test(t), 'monthly spend dropped Spotify')
          assert.ok(/Monthly spending\s*[^A-Z]*499\.00/.test(t))
        })

        await check('overdue payments are flagged on the dashboard', async () => {
          const k = Object.keys(localStorage).find((x) => x.startsWith('spm.mock.subscriptionPayments.'))
          const pays = JSON.parse(localStorage.getItem(k))
          const open = pays.find((p) => p.status === 'upcoming')
          open.dueDate = iso(-3)
          localStorage.setItem(k, JSON.stringify(pays))
          await act(async () => { await S().load(S().uid) })
          await nav('/')
          await waitFor(() => /1 overdue/.test(text()) && has('Overdue'), 'overdue flagged')
        })

        await check('dashboard: another user sees none of this data', async () => {
          await click(q('button[aria-label="Log out"]'))
          await waitFor(() => path() === '/login', 'logged out')
          await registerUser('Second Person', 'second@example.com')
          await nav('/')
          await waitFor(() => has('Nothing to show yet'), 'empty for second user')
          assert.ok(!has('Netflix') && !has('Car Cover') && !has('Added subscription'))
        })
    } finally {
      await h.stop()
    }
  },
  120_000,
)
