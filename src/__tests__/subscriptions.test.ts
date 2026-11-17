import assert from 'node:assert/strict'
import { scenario } from '@/test/steps'

scenario("subscriptions: billing dates, payments, status changes, filtering", async (check) => {
  const b = await import('@/utils/billing')
  const subsSvc = await import('@/services/subscription.service')
  const paySvc = await import('@/services/payment.service')
  const list = await import('@/utils/subscription-list')
  const stats = await import('@/utils/subscription-stats')
  const money = await import('@/utils/money')
  const { effectivePaymentStatus } = await import('@/utils/payments')
  const { todayISO, addDaysISO } = await import('@/utils/dates')
  const { subscriptionFormSchema } = await import('@/schemas/subscription.schema')

  // ---- billing math ----
  await check('month-end: 31 Jan monthly -> 28 Feb -> 31 Mar (no drift)', async () => {
    assert.equal(b.nthOccurrence('2026-01-31', 'monthly', 1), '2026-02-28')
    assert.equal(b.nthOccurrence('2026-01-31', 'monthly', 2), '2026-03-31')
    assert.equal(b.advanceOneCycle('2026-02-28', 'monthly', '2026-01-31'), '2026-03-31')
    assert.equal(b.advanceOneCycle('2026-04-30', 'monthly', '2026-01-31'), '2026-05-31')
  })
  await check('leap year: 29 Feb yearly', async () => {
    assert.equal(b.nthOccurrence('2024-02-29', 'yearly', 1), '2025-02-28')
    assert.equal(b.nthOccurrence('2024-02-29', 'yearly', 4), '2028-02-29')
    assert.equal(b.advanceOneCycle('2025-02-28', 'yearly', '2024-02-29'), '2026-02-28')
    assert.equal(b.advanceOneCycle('2027-02-28', 'yearly', '2024-02-29'), '2028-02-29')
  })
  await check('weekly, quarterly, half-yearly, year rollover', async () => {
    assert.equal(b.advanceOneCycle('2026-12-28', 'weekly', '2026-01-01'), '2027-01-04')
    assert.equal(b.advanceOneCycle('2026-11-30', 'quarterly', '2026-08-30'), '2027-02-28')
    assert.equal(b.advanceOneCycle('2026-08-31', 'half-yearly', '2026-02-28'), '2027-02-28')
    assert.equal(b.nthOccurrence('2026-11-15', 'monthly', 3), '2027-02-15')
  })
  await check('first occurrence on/after a date', async () => {
    assert.equal(b.firstOccurrenceOnOrAfter('2026-01-31', 'monthly', '2026-02-01'), '2026-02-28')
    assert.equal(b.firstOccurrenceOnOrAfter('2026-01-31', 'monthly', '2026-01-31'), '2026-01-31')
    assert.equal(b.firstOccurrenceOnOrAfter('2030-01-01', 'monthly', '2026-01-01'), '2030-01-01')
  })
  await check('suggested next payment: starting today means one full cycle later', async () => {
    const t = '2026-11-18'
    assert.equal(b.suggestNextPayment(t, 'yearly', t), '2027-11-18')
    assert.equal(b.suggestNextPayment(t, 'monthly', t), '2026-12-18')
    assert.equal(b.suggestNextPayment(t, 'weekly', t), '2026-11-25')
    assert.equal(b.suggestNextPayment(t, 'quarterly', t), '2027-02-18')
    assert.equal(b.suggestNextPayment(t, 'half-yearly', t), '2027-05-18')
    assert.equal(b.suggestNextPayment('2026-11-25', 'yearly', t), '2026-11-25', 'a future start is the first payment')
    assert.equal(b.suggestNextPayment('2026-08-18', 'quarterly', t), '2026-11-18', 'due today stays today')
    assert.equal(b.suggestNextPayment('2026-01-31', 'monthly', t), '2026-11-30')
  })
  await check('monthly/annual equivalents', async () => {
    assert.equal(b.annualEquivalent(10000, 'monthly'), 120000)
    assert.equal(b.monthlyEquivalent(120000, 'yearly'), 10000)
    assert.equal(b.monthlyEquivalent(1200, 'weekly'), 5200)
  })
  await check('money conversion', async () => {
    assert.equal(money.toMinor('15.49'), 1549)
    assert.equal(money.toMinor('199'), 19900)
    assert.equal(money.toMinor('0.07'), 7)
    assert.equal(money.fromMinor(1549), '15.49')
  })

  // ---- services ----
  const uid = 'user-a'
  const today = todayISO()
  const base = {
    name: 'Netflix', provider: 'Netflix Inc', category: 'Entertainment', amountMinor: 1549, currency: 'USD',
    billingCycle: 'monthly', startDate: '2025-01-31', nextPaymentDate: '', paymentMethod: 'Visa', reminderDays: 3,
  }
  let sub
  await check('create: auto next date >= today + one open payment', async () => {
    sub = await subsSvc.createSubscription(uid, base)
    assert.ok(sub.nextPaymentDate >= today)
    assert.equal(sub.status, 'active')
    const pays = await paySvc.listPayments(uid)
    assert.equal(pays.length, 1)
    assert.equal(pays[0].status, 'upcoming')
    assert.equal(pays[0].dueDate, sub.nextPaymentDate)
  })

  await check('mark paid: history kept, next cycle opened, sub advanced', async () => {
    const [open] = await paySvc.listPayments(uid)
    const before = sub.nextPaymentDate
    await paySvc.resolvePayment(uid, open.id, { status: 'paid', paymentDate: today, notes: ' autopay ' })
    const pays = await paySvc.listPayments(uid)
    const [s] = await subsSvc.listSubscriptions(uid)
    assert.equal(pays.length, 2)
    const paid = pays.find((p) => p.id === open.id)
    assert.equal(paid.status, 'paid')
    assert.equal(paid.paymentDate, today)
    assert.equal(paid.notes, 'autopay')
    assert.equal(s.nextPaymentDate, b.advanceOneCycle(before, 'monthly', '2025-01-31'))
    assert.equal(pays.filter((p) => p.status === 'upcoming').length, 1)
    assert.equal(pays.find((p) => p.status === 'upcoming').dueDate, s.nextPaymentDate)
  })

  await check('resolving the same payment twice is rejected (no double count)', async () => {
    const paid = (await paySvc.listPayments(uid)).find((p) => p.status === 'paid')
    await assert.rejects(paySvc.resolvePayment(uid, paid.id, { status: 'paid' }), /already been recorded/)
    assert.equal((await paySvc.listPayments(uid)).length, 2)
  })

  await check('skip: recorded as skipped with no payment date, next opened', async () => {
    const open = (await paySvc.listPayments(uid)).find((p) => p.status === 'upcoming')
    await paySvc.resolvePayment(uid, open.id, { status: 'skipped' })
    const pays = await paySvc.listPayments(uid)
    const skipped = pays.find((p) => p.id === open.id)
    assert.equal(skipped.status, 'skipped')
    assert.equal(skipped.paymentDate, null)
    assert.equal(pays.filter((p) => p.status === 'upcoming').length, 1)
  })

  await check('overdue is derived, never stored', async () => {
    const open = (await paySvc.listPayments(uid)).find((p) => p.status === 'upcoming')
    assert.equal(effectivePaymentStatus(open, addDaysISO(open.dueDate, 1)), 'overdue')
    assert.equal(effectivePaymentStatus(open, open.dueDate), 'upcoming')
    assert.equal(open.status, 'upcoming')
  })

  await check('pause: open payment removed, history kept; excluded from spend', async () => {
    const histBefore = (await paySvc.listPayments(uid)).filter((p) => p.status !== 'upcoming').length
    await subsSvc.setSubscriptionStatus(uid, sub.id, 'paused')
    const pays = await paySvc.listPayments(uid)
    assert.equal(pays.filter((p) => p.status === 'upcoming').length, 0)
    assert.equal(pays.length, histBefore)
    const subs = await subsSvc.listSubscriptions(uid)
    assert.deepEqual(stats.monthlyTotals(subs), {})
    assert.deepEqual(stats.annualTotals(subs), {})
  })

  await check('resume: stale date rolled forward, open payment recreated', async () => {
    // simulate a long pause: push next date far into the past
    const subs = await subsSvc.listSubscriptions(uid)
    subs[0].nextPaymentDate = '2025-03-31'
    localStorage.setItem(`spm.mock.subscriptions.${uid}`, JSON.stringify(subs))
    const resumed = await subsSvc.setSubscriptionStatus(uid, sub.id, 'active')
    assert.ok(resumed.nextPaymentDate >= today)
    const open = (await paySvc.listPayments(uid)).filter((p) => p.status === 'upcoming')
    assert.equal(open.length, 1)
    assert.equal(open[0].dueDate, resumed.nextPaymentDate)
  })

  await check('cancel keeps history, drops open payment', async () => {
    await subsSvc.setSubscriptionStatus(uid, sub.id, 'cancelled')
    const pays = await paySvc.listPayments(uid)
    assert.equal(pays.filter((p) => p.status === 'upcoming').length, 0)
    assert.ok(pays.filter((p) => p.status === 'paid').length >= 1)
    const subs = await subsSvc.listSubscriptions(uid)
    assert.deepEqual(stats.monthlyTotals(subs), {})
  })

  await check('edit syncs open payment amount/date and resolves status change', async () => {
    await subsSvc.setSubscriptionStatus(uid, sub.id, 'active')
    const target = addDaysISO(today, 10)
    await subsSvc.updateSubscription(uid, sub.id, {
      ...base, amountMinor: 2000, currency: 'USD', nextPaymentDate: target, status: 'active',
    })
    const open = (await paySvc.listPayments(uid)).find((p) => p.status === 'upcoming')
    assert.equal(open.amountMinor, 2000)
    assert.equal(open.dueDate, target)
    // history amounts are not rewritten
    const paid = (await paySvc.listPayments(uid)).find((p) => p.status === 'paid')
    assert.equal(paid.amountMinor, 1549)
  })

  await check('spend: active only, grouped by currency, normalized', async () => {
    await subsSvc.createSubscription(uid, { ...base, name: 'Hotstar', provider: 'Disney', currency: 'INR', amountMinor: 149900, billingCycle: 'yearly' })
    const subs = await subsSvc.listSubscriptions(uid)
    const monthly = stats.monthlyTotals(subs)
    assert.equal(monthly.USD, 2000)
    assert.equal(Math.round(monthly.INR), Math.round(149900 / 12))
    assert.equal(stats.annualTotals(subs).INR, 149900)
  })

  await check('data isolation: another user sees nothing', async () => {
    assert.deepEqual(await subsSvc.listSubscriptions('user-b'), [])
    assert.deepEqual(await paySvc.listPayments('user-b'), [])
  })

  await check('list: search, status filter, upcoming window, sort', async () => {
    const subs = await subsSvc.listSubscriptions(uid)
    const opts = { search: '', status: 'all', sortKey: 'name', sortDirection: 'asc' }
    assert.deepEqual(list.filterAndSortSubscriptions(subs, opts).map((s) => s.name), ['Hotstar', 'Netflix'])
    assert.deepEqual(list.filterAndSortSubscriptions(subs, { ...opts, sortDirection: 'desc' }).map((s) => s.name), ['Netflix', 'Hotstar'])
    assert.deepEqual(list.filterAndSortSubscriptions(subs, { ...opts, search: 'visa inc' }).length, 0)
    assert.deepEqual(list.filterAndSortSubscriptions(subs, { ...opts, search: 'NETFLIX' }).map((s) => s.name), ['Netflix'])
    assert.equal(list.filterAndSortSubscriptions(subs, { ...opts, status: 'paused' }).length, 0)
    assert.deepEqual(list.filterAndSortSubscriptions(subs, { ...opts, status: 'upcoming' }).map((s) => s.name), ['Netflix'])
    assert.deepEqual(list.filterAndSortSubscriptions(subs, { ...opts, sortKey: 'amount', sortDirection: 'desc' }).map((s) => s.name), ['Hotstar', 'Netflix'])
    const pg = list.paginate([1, 2, 3, 4, 5], 9, 2)
    assert.deepEqual(pg, { pageItems: [5], pageCount: 3, page: 3 })
  })

  await check('delete removes subscription and its payments only', async () => {
    const subs = await subsSvc.listSubscriptions(uid)
    await subsSvc.deleteSubscription(uid, subs.find((s) => s.name === 'Netflix').id)
    const left = await subsSvc.listSubscriptions(uid)
    assert.deepEqual(left.map((s) => s.name), ['Hotstar'])
    const pays = await paySvc.listPayments(uid)
    assert.ok(pays.every((p) => p.subscriptionId === left[0].id))
    assert.equal(pays.length, 1)
  })

  await check('form schema', async () => {
    const ok = { name: 'A', provider: '', category: 'Other', amount: '199.50', currency: 'INR', billingCycle: 'monthly', startDate: '2026-02-28', nextPaymentDate: '', paymentMethod: '', status: 'active', reminderDays: '3' }
    assert.ok(subscriptionFormSchema.safeParse(ok).success)
    for (const bad of [
      { amount: '0' }, { amount: '-5' }, { amount: '1.999' }, { amount: 'abc' }, { name: '  ' },
      { startDate: '2026-02-30' }, { nextPaymentDate: '2026-02-01' }, { reminderDays: '5' }, { category: 'Nope' },
    ]) {
      assert.ok(!subscriptionFormSchema.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad))
    }
  })
})
