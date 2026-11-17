import assert from 'node:assert/strict'
import { scenario } from '@/test/steps'
import type { Policy, PolicyPayment } from '@/types/policy'
import type { Subscription } from '@/types/subscription'
import { amountIn, availableCurrencies, expiringPolicies, policySummaryByType, priceComparison, upcomingPremiums } from '@/utils/analytics-stats'
import { addDaysISO, todayISO } from '@/utils/dates'
import { monthlyExpenditure } from '@/utils/dashboard-stats'
import { annualPremiumTotals, coverageTotals } from '@/utils/policy-stats'

const today = todayISO()
const d = (n: number) => addDaysISO(today, n)

let seq = 0
const sub = (o: Partial<Subscription>): Subscription => ({
  id: `s${++seq}`, name: 'S', provider: '', category: 'Entertainment', amountMinor: 10000, currency: 'INR',
  billingCycle: 'monthly', startDate: d(-60), nextPaymentDate: d(3), paymentMethod: '', status: 'active',
  reminderDays: 3, createdAt: '', updatedAt: '', ...o,
})
const pol = (o: Partial<Policy>): Policy => ({
  id: `p${++seq}`, provider: 'P', policyName: 'Pol', policyType: 'health', policyNumber: '', premiumAmountMinor: 120000,
  currency: 'INR', coverageAmountMinor: 50000000, billingCycle: 'yearly', startDate: d(-100), expiryDate: d(264),
  nextPremiumDate: null, status: 'active', reminderDays: 30, notes: '', renewals: [], createdAt: '', updatedAt: '', ...o,
})

scenario('analytics: currency choice, price comparison, policy breakdown', async (check) => {
  await check('available currencies: unique, sorted, from both modules', async () => {
    assert.deepEqual(availableCurrencies([sub({ currency: 'USD' }), sub({ currency: 'INR' })], [pol({ currency: 'EUR' }), pol({ currency: 'INR' })]), ['EUR', 'INR', 'USD'])
    assert.deepEqual(availableCurrencies([], []), [])
  })

  await check('amountIn: missing currency is zero', async () => {
    assert.equal(amountIn({ INR: 500 }, 'INR'), 500)
    assert.equal(amountIn({ INR: 500 }, 'USD'), 0)
  })

  await check('price comparison: active only, one currency, per-month, most expensive first', async () => {
    const subs = [
      sub({ id: 'a', name: 'Netflix', amountMinor: 49900 }),
      sub({ id: 'b', name: 'Prime', amountMinor: 149900, billingCycle: 'yearly' }), // 124.92/month
      sub({ id: 'c', name: 'Gym', amountMinor: 30000, billingCycle: 'weekly' }), // 300*52/12 = 1300/month
      sub({ id: 'd', name: 'Paused', status: 'paused' }),
      sub({ id: 'e', name: 'Cancelled', status: 'cancelled' }),
      sub({ id: 'f', name: 'ChatGPT', currency: 'USD', amountMinor: 2000 }),
    ]
    const bars = priceComparison(subs, 'INR')
    assert.deepEqual(bars.map((b) => b.name), ['Gym', 'Netflix', 'Prime'])
    assert.equal(bars[0].monthly, 1300)
    assert.equal(bars[1].monthly, 499)
    assert.ok(Math.abs(bars[2].monthly - 1499 / 12) < 1e-9)
    assert.deepEqual(priceComparison(subs, 'USD').map((b) => b.name), ['ChatGPT'])
    assert.deepEqual(priceComparison(subs, 'EUR'), [])
  })

  await check('price comparison ties are ordered by name', async () => {
    const bars = priceComparison([sub({ name: 'B' }), sub({ name: 'A' })], 'INR')
    assert.deepEqual(bars.map((b) => b.name), ['A', 'B'])
  })

  await check('policy breakdown: in force only, grouped by type, premium and coverage kept apart', async () => {
    const policies = [
      pol({ policyType: 'health', premiumAmountMinor: 120000, coverageAmountMinor: 50000000 }), // 1,200/yr; 500,000 cover
      pol({ policyType: 'health', premiumAmountMinor: 10000, billingCycle: 'monthly', coverageAmountMinor: 10000000 }), // 1,200/yr
      pol({ policyType: 'vehicle', premiumAmountMinor: 900000, coverageAmountMinor: 20000000 }),
      pol({ policyType: 'life', status: 'cancelled' }),
      pol({ policyType: 'home', expiryDate: d(-5) }), // expired
      pol({ policyType: 'travel', currency: 'USD' }),
    ]
    const rows = policySummaryByType(policies, 'INR', today)
    assert.deepEqual(rows.map((r) => r.type), ['health', 'vehicle'])
    const health = rows[0]
    assert.equal(health.label, 'Health Insurance')
    assert.equal(health.count, 2)
    assert.equal(health.annualPremium, 2400)
    assert.equal(health.coverage, 600000)
    assert.equal(rows[1].annualPremium, 9000)
    assert.equal(policySummaryByType(policies, 'USD', today)[0].type, 'travel')
    assert.deepEqual(policySummaryByType([], 'INR', today), [])
    // Agrees with the totals used elsewhere
    assert.equal(rows.reduce((s, r) => s + r.annualPremium * 100, 0), amountIn(annualPremiumTotals(policies, today), 'INR'))
    assert.equal(rows.reduce((s, r) => s + r.coverage * 100, 0), amountIn(coverageTotals(policies, today), 'INR'))
  })

  await check('upcoming premiums: window, currency and overdue handling', async () => {
    const policies = [pol({ id: 'p1' }), pol({ id: 'p2' })]
    const pay = (o: Partial<PolicyPayment>): PolicyPayment => ({
      id: `pp${++seq}`, policyId: 'p1', amountMinor: 1000, currency: 'INR', dueDate: d(5), paymentDate: null,
      status: 'upcoming', notes: '', createdAt: '', updatedAt: '', ...o,
    })
    const payments = [
      pay({ dueDate: d(5) }),
      pay({ policyId: 'p2', dueDate: d(30), amountMinor: 2500 }),
      pay({ dueDate: d(31) }), // outside the window
      pay({ dueDate: d(-2) }), // overdue, not "upcoming"
      pay({ status: 'paid', dueDate: d(2) }),
      pay({ currency: 'USD', dueDate: d(3) }),
      pay({ policyId: 'deleted', dueDate: d(3) }),
    ]
    assert.deepEqual(upcomingPremiums(payments, policies, 'INR', 30, today), { count: 2, totalMinor: 3500 })
    assert.deepEqual(upcomingPremiums(payments, policies, 'INR', 7, today), { count: 1, totalMinor: 1000 })
    assert.deepEqual(upcomingPremiums(payments, policies, 'USD', 30, today), { count: 1, totalMinor: 1000 })
    assert.deepEqual(upcomingPremiums([], policies, 'INR', 30, today), { count: 0, totalMinor: 0 })
  })

  await check('expiring policies: only expiring soon, soonest first', async () => {
    const policies = [
      pol({ policyName: 'Later', expiryDate: d(25) }),
      pol({ policyName: 'Soon', expiryDate: d(5) }),
      pol({ policyName: 'Far', expiryDate: d(200) }),
      pol({ policyName: 'Gone', expiryDate: d(-1) }),
      pol({ policyName: 'Cancelled', expiryDate: d(3), status: 'cancelled' }),
    ]
    assert.deepEqual(expiringPolicies(policies, today).map((p) => p.policyName), ['Soon', 'Later'])
  })

  await check('12-month history: spans a year, only paid, only the chosen currency', async () => {
    const paid = (o: object) => ({ id: `x${++seq}`, subscriptionId: 's', amountMinor: 10000, currency: 'INR', dueDate: today, paymentDate: today, status: 'paid', notes: '', createdAt: '', updatedAt: '', ...o })
    const { data, excluded } = monthlyExpenditure(
      [paid({}), paid({ status: 'skipped' }), paid({ currency: 'USD' }), paid({ paymentDate: addDaysISO(today, -400) })] as never,
      [],
      'INR',
      12,
      today,
    )
    assert.equal(data.length, 12)
    assert.equal(data[11].key, today.slice(0, 7))
    assert.equal(data[11].subscriptions, 100)
    assert.equal(excluded, 1)
    assert.equal(data.slice(0, 11).every((m) => m.subscriptions === 0), true, 'payment older than a year is outside the window')
  })
})
