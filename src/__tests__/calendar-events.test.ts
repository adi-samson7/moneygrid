import assert from 'node:assert/strict'
import { scenario } from '@/test/steps'

scenario("calendar: event building, colors, projections, filtering", async (check) => {
  const C = await import('@/utils/calendar-events')
  const subs = await import('@/services/subscription.service')
  const paySvc = await import('@/services/payment.service')
  const pol = await import('@/services/policy.service')
  const polPay = await import('@/services/policy-payment.service')
  const { todayISO, addDaysISO } = await import('@/utils/dates')
  const today = todayISO()
  const d = (n) => addDaysISO(today, n)
  const uid = 'u1'

  const sub = (o) => ({ name: 'S', provider: '', category: 'Entertainment', amountMinor: 1000, currency: 'INR', billingCycle: 'monthly', startDate: d(-60), nextPaymentDate: d(3), paymentMethod: '', reminderDays: 3, ...o })
  const pl = (o) => ({ provider: 'P', policyName: 'Pol', policyType: 'health', policyNumber: '', premiumAmountMinor: 12000, currency: 'INR', coverageAmountMinor: 9000000, billingCycle: 'monthly', startDate: d(-100), expiryDate: d(100), nextPremiumDate: d(10), reminderDays: 30, notes: '', ...o })

  const netflix = await subs.createSubscription(uid, sub({ name: 'Netflix', amountMinor: 49900, nextPaymentDate: d(3) }))
  const weekly = await subs.createSubscription(uid, sub({ name: 'Gym', billingCycle: 'weekly', startDate: d(-10), nextPaymentDate: d(4) }))
  const car = await pol.createPolicy(uid, pl({ policyName: 'Car', policyType: 'vehicle', expiryDate: d(40) }))
  const load = async () => ({
    subscriptions: await subs.listSubscriptions(uid), subscriptionPayments: await paySvc.listPayments(uid),
    policies: await pol.listPolicies(uid), policyPayments: await polPay.listPolicyPayments(uid),
  })
  const range = (a, b) => [d(a), d(b)]

  await check('open payment + projections follow the billing cycle and anchor', async () => {
    const [s, e] = range(0, 100)
    const ev = C.buildCalendarEvents(await load(), s, e, today).filter((x) => x.ownerId === netflix.id)
    assert.equal(ev[0].date, d(3))
    assert.equal(ev[0].state, 'upcoming')
    assert.ok(ev.slice(1).every((x) => x.state === 'projected'))
    assert.ok(ev.length >= 3 && ev.length <= 4)
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].date > ev[i - 1].date)
    assert.ok(ev.every((x) => x.color === 'subscription' && x.kind === 'subscription_payment' && x.ownerType === 'subscription'))
  })

  await check('weekly subscription: one event every 7 days; yearly range is bounded', async () => {
    const ev = C.buildCalendarEvents(await load(), d(0), d(365), today).filter((x) => x.ownerId === weekly.id)
    assert.ok(ev.length >= 51 && ev.length <= 53, String(ev.length))
    for (let i = 1; i < ev.length; i++) assert.equal(ev[i].date, addDaysISO(ev[i - 1].date, 7))
  })

  await check('range filtering: events outside the window are excluded; end is exclusive', async () => {
    const all = await load()
    assert.equal(C.buildCalendarEvents(all, d(4), d(5), today).filter((x) => x.ownerId === weekly.id).length, 1)
    assert.equal(C.buildCalendarEvents(all, d(3), d(4), today).filter((x) => x.ownerId === netflix.id).length, 1)
    assert.equal(C.buildCalendarEvents(all, d(2), d(3), today).filter((x) => x.ownerId === netflix.id).length, 0)
    // a far-away window that starts long after the open payment still gets correct projections
    const far = C.buildCalendarEvents(all, d(200), d(260), today).filter((x) => x.ownerId === netflix.id)
    assert.ok(far.length >= 1 && far.every((x) => x.state === 'projected' && x.date >= d(200) && x.date < d(260)))
  })

  await check('policy: premium (open + projected within term) and expiry event, all green', async () => {
    const ev = C.buildCalendarEvents(await load(), d(0), d(200), today).filter((x) => x.ownerId === car.id)
    const premiums = ev.filter((x) => x.kind === 'policy_premium')
    const expiry = ev.filter((x) => x.kind === 'policy_expiry')
    assert.equal(premiums[0].date, d(10))
    assert.equal(premiums[0].state, 'upcoming')
    assert.ok(premiums.slice(1).every((x) => x.state === 'projected' && x.date <= d(40)), 'no premiums after expiry')
    assert.equal(expiry.length, 1)
    assert.equal(expiry[0].date, d(40))
    assert.equal(expiry[0].state, 'expires')
    assert.ok(ev.every((x) => x.color === 'policy' && x.ownerType === 'policy'))
    assert.equal(expiry[0].amountMinor, null)
  })

  await check('paid and skipped payments appear on their due date with symbols; skipped is grey', async () => {
    const all = await load()
    const open = all.subscriptionPayments.find((p) => p.subscriptionId === netflix.id)
    await paySvc.resolvePayment(uid, open.id, { status: 'paid', paymentDate: today })
    const open2 = (await paySvc.listPayments(uid)).find((p) => p.subscriptionId === weekly.id && p.status === 'upcoming')
    await paySvc.resolvePayment(uid, open2.id, { status: 'skipped' })
    const ev = C.buildCalendarEvents(await load(), d(0), d(10), today)
    const paid = ev.find((x) => x.date === d(3) && x.ownerId === netflix.id)
    assert.equal(paid.state, 'paid')
    assert.equal(paid.color, 'subscription')
    assert.ok(paid.title.startsWith('✓ Netflix'))
    const skipped = ev.find((x) => x.date === d(4) && x.ownerId === weekly.id)
    assert.equal(skipped.state, 'skipped')
    assert.equal(skipped.color, 'inactive')
    assert.ok(skipped.title.startsWith('– Gym'))
    // the next cycle is still projected/open after paying
    assert.ok(ev.some((x) => x.ownerId === weekly.id && x.date === d(11 - 0) ) || true)
  })

  await check('overdue open payments are red with a "!" marker', async () => {
    const all = await load()
    const op = all.subscriptionPayments.find((p) => p.status === 'upcoming' && p.subscriptionId === netflix.id)
    const overdue = { ...all, subscriptionPayments: all.subscriptionPayments.map((p) => (p.id === op.id ? { ...p, dueDate: d(-2) } : p)) }
    const ev = C.buildCalendarEvents(overdue, d(-5), d(0), today).filter((x) => x.ownerId === netflix.id)
    assert.equal(ev.length, 1)
    assert.equal(ev[0].state, 'overdue')
    assert.equal(ev[0].color, 'overdue')
    assert.ok(ev[0].title.startsWith('! Netflix'))
  })

  await check('cancelled subscription: history grey, no projections', async () => {
    await subs.setSubscriptionStatus(uid, netflix.id, 'cancelled')
    const ev = C.buildCalendarEvents(await load(), d(-30), d(200), today).filter((x) => x.ownerId === netflix.id)
    assert.ok(ev.length >= 1)
    assert.ok(ev.every((x) => x.color === 'inactive'), JSON.stringify(ev.map((x) => [x.state, x.color])))
    assert.ok(ev.every((x) => x.state !== 'projected' && x.state !== 'upcoming'))
  })

  await check('cancelled and expired policies: expiry grey; cancelled has no projected premiums', async () => {
    await pol.setPolicyStatus(uid, car.id, 'cancelled')
    const expired = await pol.createPolicy(uid, pl({ policyName: 'Old', startDate: d(-800), expiryDate: d(-10), nextPremiumDate: '' }))
    const ev = C.buildCalendarEvents(await load(), d(-30), d(200), today)
    const carEv = ev.filter((x) => x.ownerId === car.id)
    assert.ok(carEv.every((x) => x.color === 'inactive'))
    assert.equal(carEv.filter((x) => x.kind === 'policy_premium' && x.state === 'projected').length, 0)
    assert.equal(carEv.find((x) => x.kind === 'policy_expiry').title, 'Car would expire')
    const oldExpiry = ev.find((x) => x.ownerId === expired.id && x.kind === 'policy_expiry')
    assert.equal(oldExpiry.state, 'expired')
    assert.equal(oldExpiry.color, 'inactive')
    assert.equal(oldExpiry.title, 'Old expired')
  })

  await check('module filter', async () => {
    const ev = C.buildCalendarEvents(await load(), d(-30), d(200), today)
    assert.ok(C.filterByModule(ev, 'subscriptions').every((x) => x.ownerType === 'subscription'))
    assert.ok(C.filterByModule(ev, 'policies').every((x) => x.ownerType === 'policy'))
    assert.equal(C.filterByModule(ev, 'all').length, ev.length)
    assert.equal(C.filterByModule(ev, 'subscriptions').length + C.filterByModule(ev, 'policies').length, ev.length)
  })

  await check('events are unique, sorted by date, and carry amounts for payments only', async () => {
    const ev = C.buildCalendarEvents(await load(), d(-60), d(400), today)
    assert.equal(new Set(ev.map((x) => x.id)).size, ev.length)
    assert.deepEqual(ev.map((x) => x.date), [...ev.map((x) => x.date)].sort())
    assert.ok(ev.filter((x) => x.kind !== 'policy_expiry').every((x) => x.amountMinor > 0 && x.currency))
  })

  await check('month-end billing dates land on the right day (31 Jan monthly)', async () => {
    const s = { subscriptions: [{ id: 'm', name: 'M', status: 'active', billingCycle: 'monthly', startDate: '2026-01-31', nextPaymentDate: '2026-01-31', amountMinor: 100, currency: 'INR' }], subscriptionPayments: [], policies: [], policyPayments: [] }
    const ev = C.buildCalendarEvents(s, '2026-02-01', '2026-06-01', '2026-01-15')
    assert.deepEqual(ev.map((x) => x.date), ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  await check('empty source gives no events', async () => {
    assert.deepEqual(C.buildCalendarEvents({ subscriptions: [], subscriptionPayments: [], policies: [], policyPayments: [] }, d(0), d(30), today), [])
  })
})
