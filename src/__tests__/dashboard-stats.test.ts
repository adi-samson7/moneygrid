import assert from 'node:assert/strict'
import { vi } from 'vitest'
import { scenario } from '@/test/steps'

scenario("dashboard: upcoming items, spending figures, activity log", async (check) => {
  const D = await import('@/utils/dashboard-stats')
  const subs = await import('@/services/subscription.service')
  const paySvc = await import('@/services/payment.service')
  const pol = await import('@/services/policy.service')
  const polPay = await import('@/services/policy-payment.service')
  const act = await import('@/services/activity.service')
  const { todayISO, addDaysISO } = await import('@/utils/dates')
  const today = todayISO()
  const d = (n) => addDaysISO(today, n)
  const uid = 'u1'

  const sub = (o) => ({ name: 'S', provider: '', category: 'Entertainment', amountMinor: 1000, currency: 'INR', billingCycle: 'monthly', startDate: d(-40), nextPaymentDate: d(3), paymentMethod: '', reminderDays: 3, ...o })
  const pl = (o) => ({ provider: 'P', policyName: 'Pol', policyType: 'health', policyNumber: '', premiumAmountMinor: 12000, currency: 'INR', coverageAmountMinor: 9000000, billingCycle: 'yearly', startDate: d(-100), expiryDate: d(264), nextPremiumDate: d(10), reminderDays: 30, notes: '', ...o })

  const netflix = await subs.createSubscription(uid, sub({ name: 'Netflix', amountMinor: 49900, nextPaymentDate: d(3) }))
  const spotify = await subs.createSubscription(uid, sub({ name: 'Spotify', category: 'Music', amountMinor: 11900, nextPaymentDate: d(20) }))
  const usd = await subs.createSubscription(uid, sub({ name: 'ChatGPT', category: 'Software', currency: 'USD', amountMinor: 2000, nextPaymentDate: d(5) }))
  const car = await pol.createPolicy(uid, pl({ policyName: 'Car', policyType: 'vehicle', premiumAmountMinor: 900000, coverageAmountMinor: 50000000 }))
  const other = await pol.createPolicy(uid, pl({ policyName: 'Misc', policyType: 'other', premiumAmountMinor: 120000 }))

  const S = await subs.listSubscriptions(uid)
  const SP = await paySvc.listPayments(uid)
  const P = await pol.listPolicies(uid)
  const PP = await polPay.listPolicyPayments(uid)

  await check('upcoming items: merged, sorted, labelled by kind', async () => {
    const items = D.buildUpcomingItems(S, SP, P, PP, today)
    assert.equal(items.length, 5)
    assert.deepEqual(items.map((i) => i.dueDate), [...items.map((i) => i.dueDate)].sort())
    assert.deepEqual(new Set(items.map((i) => i.kind)), new Set(['subscription', 'policy']))
    const carItem = items.find((i) => i.name === 'Car')
    assert.equal(carItem.category, 'Vehicle Insurance')
    assert.equal(items.find((i) => i.name === 'Misc').category, 'Other insurance')
    assert.equal(items.find((i) => i.name === 'Netflix').category, 'Entertainment')
  })

  await check('dueWithin 7/30 excludes overdue and later items', async () => {
    const items = D.buildUpcomingItems(S, SP, P, PP, today)
    assert.equal(D.dueWithin(items, 7, today).length, 2 + 0) // Netflix(+3), ChatGPT(+5)
    assert.equal(D.dueWithin(items, 30, today).length, 5)
    assert.equal(D.dueWithin(items, 0, today).length, 0)
  })

  await check('overdue items are labelled and kept out of dueWithin', async () => {
    const SPm = SP.map((p) => (p.subscriptionId === netflix.id ? { ...p, dueDate: d(-2) } : p))
    const items = D.buildUpcomingItems(S, SPm, P, PP, today)
    assert.equal(items[0].name, 'Netflix')
    assert.equal(items[0].status, 'overdue')
    assert.ok(!D.dueWithin(items, 30, today).some((i) => i.name === 'Netflix'))
  })

  await check('paid/skipped payments are not upcoming', async () => {
    const open = SP.find((p) => p.subscriptionId === spotify.id)
    await paySvc.resolvePayment(uid, open.id, { status: 'paid', paymentDate: today })
    const items = D.buildUpcomingItems(await subs.listSubscriptions(uid), await paySvc.listPayments(uid), P, PP, today)
    assert.ok(!items.some((i) => i.id === open.id))
    // next cycle for Spotify is open again
    assert.equal(items.filter((i) => i.name === 'Spotify').length, 1)
  })

  await check('monthly expenditure: only paid, per module, only chosen currency', async () => {
    const polOpen = (await polPay.listPolicyPayments(uid)).find((p) => p.policyId === car.id)
    await polPay.resolvePolicyPayment(uid, polOpen.id, { status: 'paid', paymentDate: today })
    const usdOpen = (await paySvc.listPayments(uid)).find((p) => p.subscriptionId === usd.id)
    await paySvc.resolvePayment(uid, usdOpen.id, { status: 'paid', paymentDate: today })
    const skipOpen = (await paySvc.listPayments(uid)).find((p) => p.subscriptionId === netflix.id && p.status === 'upcoming')
    await paySvc.resolvePayment(uid, skipOpen.id, { status: 'skipped' })

    const r = D.monthlyExpenditure(await paySvc.listPayments(uid), await polPay.listPolicyPayments(uid), 'INR', 6, today)
    assert.equal(r.data.length, 6)
    const cur = r.data[5]
    assert.equal(cur.key, today.slice(0, 7))
    assert.equal(cur.subscriptions, 119) // Spotify 11900 paise; Netflix skipped, ChatGPT is USD
    assert.equal(cur.policies, 9000)
    assert.equal(r.excluded, 1, 'USD payment excluded')
    assert.ok(r.data.slice(0, 5).every((m) => m.subscriptions === 0 && m.policies === 0))
    const usdView = D.monthlyExpenditure(await paySvc.listPayments(uid), await polPay.listPolicyPayments(uid), 'USD', 6, today)
    assert.equal(usdView.data[5].subscriptions, 20)
  })

  await check('payment month uses payment date, not due date', async () => {
    const p = [{ status: 'paid', paymentDate: '2026-03-05', dueDate: '2026-02-27', currency: 'INR', amountMinor: 5000 }]
    const r = D.monthlyExpenditure(p, [], 'INR', 6, '2026-05-10')
    assert.equal(r.data.find((m) => m.key === '2026-03').subscriptions, 50)
    assert.equal(r.data.find((m) => m.key === '2026-02').subscriptions, 0)
    assert.deepEqual(r.data.map((m) => m.key), ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'])
  })

  await check('category spending: monthly-normalized, active only, policies by type, coverage excluded', async () => {
    const r = D.categorySpending(await subs.listSubscriptions(uid), await pol.listPolicies(uid), 'INR', today)
    const byName = Object.fromEntries(r.data.map((s) => [s.name, s]))
    assert.equal(byName.Entertainment.value, 499) // Netflix
    assert.equal(byName.Music.value, 119)
    assert.equal(byName['Vehicle Insurance'].value, 9000 / 12) // yearly premium / 12
    assert.equal(byName['Vehicle Insurance'].kind, 'policy')
    assert.equal(byName['Other insurance'].value, 1200 / 12)
    assert.equal(r.excluded, 1, 'USD subscription excluded')
    assert.ok(!('Software' in byName))
    assert.deepEqual(r.data.map((s) => s.value), [...r.data.map((s) => s.value)].sort((a, b) => b - a))
  })

  await check('category spending drops cancelled subscriptions and expired policies', async () => {
    await subs.setSubscriptionStatus(uid, netflix.id, 'cancelled')
    await pol.updatePolicy(uid, other.id, { ...pl({ policyName: 'Misc', policyType: 'other', startDate: d(-800), expiryDate: d(-10), premiumAmountMinor: 120000 }), nextPremiumDate: '', status: 'active' })
    const r = D.categorySpending(await subs.listSubscriptions(uid), await pol.listPolicies(uid), 'INR', today)
    const names = r.data.map((s) => s.name)
    assert.ok(!names.includes('Entertainment'))
    assert.ok(!names.includes('Other insurance'))
    assert.ok(names.includes('Music') && names.includes('Vehicle Insurance'))
  })

  await check('annual summary keeps subscriptions, premiums and combined apart; no coverage', async () => {
    const r = D.annualSummary(await subs.listSubscriptions(uid), await pol.listPolicies(uid), today)
    assert.equal(r.subscriptions.INR, 11900 * 12) // Spotify only (Netflix cancelled)
    assert.equal(r.subscriptions.USD, 2000 * 12)
    assert.equal(r.policies.INR, 900000) // Car yearly; Misc expired
    assert.equal(r.combined.INR, 11900 * 12 + 900000)
    assert.equal(r.combined.USD, 24000)
    assert.ok(r.combined.INR < 50000000, 'coverage not included')
  })

  await check('activity log: records changes, newest first, with names and related ids', async () => {
    const list = await act.listActivity(uid, 50)
    const msgs = list.map((a) => a.message)
    assert.ok(msgs.includes('Added subscription Netflix'))
    assert.ok(msgs.includes('Added policy Car'))
    assert.ok(msgs.includes('Cancelled Netflix'))
    assert.ok(msgs.includes('Marked as paid: Spotify payment'))
    assert.ok(msgs.includes('Skipped: Netflix payment'))
    assert.ok(msgs.includes('Marked as paid: Car premium'))
    assert.ok(msgs.includes('Updated policy Misc'))
    assert.deepEqual(list.map((a) => a.createdAt), [...list.map((a) => a.createdAt)].sort().reverse())
    assert.equal(list.find((a) => a.message === 'Added policy Car').relatedId, car.id)
    assert.equal(list.find((a) => a.message === 'Added policy Car').relatedType, 'policy')
  })

  await check('activity: deleted records have null relatedId; cap + limit + isolation', async () => {
    await subs.deleteSubscription(uid, usd.id)
    const top = (await act.listActivity(uid, 1))[0]
    assert.equal(top.message, 'Deleted subscription ChatGPT')
    assert.equal(top.relatedId, null)
    for (let i = 0; i < 70; i++) await act.logActivity(uid, { kind: 'subscription_updated', message: `m${i}`, relatedType: 'subscription', relatedId: null })
    assert.equal((await act.listActivity(uid, 500)).length, 50)
    assert.equal((await act.listActivity(uid, 5)).length, 5)
    assert.deepEqual(await act.listActivity('someone-else'), [])
  })

  await check('logActivity never throws', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try { await act.logActivity(uid, { kind: 'policy_added', message: 'x', relatedType: 'policy', relatedId: null }) } finally { setItem.mockRestore(); warn.mockRestore() }
  })
})
