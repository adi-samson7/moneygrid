import assert from 'node:assert/strict'
import { scenario } from '@/test/steps'

scenario("notifications and calendar export (.ics)", async (check) => {
  const R = await import('@/utils/notification-rules')
  const N = await import('@/services/notification.service')
  const prefsSvc = await import('@/services/preferences.service')
  const subs = await import('@/services/subscription.service')
  const paySvc = await import('@/services/payment.service')
  const pol = await import('@/services/policy.service')
  const polPay = await import('@/services/policy-payment.service')
  const ICS = await import('@/utils/ics')
  const { DEFAULT_NOTIFICATION_PREFERENCES: DEFAULTS } = await import('@/types/notification')
  const { todayISO, addDaysISO } = await import('@/utils/dates')
  const today = todayISO()
  const d = (n) => addDaysISO(today, n)
  const uid = 'u1'
  const prefs = DEFAULTS // inApp on, premium 7 days

  const sub = (o) => ({ name: 'S', provider: '', category: 'Entertainment', amountMinor: 49900, currency: 'INR', billingCycle: 'monthly', startDate: d(-40), nextPaymentDate: d(2), paymentMethod: '', reminderDays: 3, ...o })
  const pl = (o) => ({ provider: 'P', policyName: 'Pol', policyType: 'vehicle', policyNumber: '', premiumAmountMinor: 900000, currency: 'INR', coverageAmountMinor: 5000000, billingCycle: 'yearly', startDate: d(-100), expiryDate: d(264), nextPremiumDate: '', reminderDays: 30, notes: '', ...o })
  const load = async (u = uid) => ({
    subscriptions: await subs.listSubscriptions(u), subscriptionPayments: await paySvc.listPayments(u),
    policies: await pol.listPolicies(u), policyPayments: await polPay.listPolicyPayments(u),
  })

  const netflix = await subs.createSubscription(uid, sub({ name: 'Netflix', nextPaymentDate: d(2), reminderDays: 3 }))
  const spotify = await subs.createSubscription(uid, sub({ name: 'Spotify', nextPaymentDate: d(10), reminderDays: 3 }))
  const lateOne = await subs.createSubscription(uid, sub({ name: 'Gym', nextPaymentDate: d(1) }))
  const car = await pol.createPolicy(uid, pl({ policyName: 'Car', expiryDate: d(20), reminderDays: 30, nextPremiumDate: d(5), billingCycle: 'monthly' }))
  await pol.createPolicy(uid, pl({ policyName: 'Life', policyType: 'life', expiryDate: d(300), nextPremiumDate: d(20), billingCycle: 'monthly' }))
  const titles = (c) => c.map((x) => x.title).sort()

  await check('rules: within window only; right kinds, keys and wording', async () => {
    const c = R.computeNotifications(await load(), prefs, today)
    assert.deepEqual(titles(c), [
      'Policy expiring soon: Car',
      'Upcoming payment: Gym',
      'Upcoming payment: Netflix',
      'Upcoming premium: Car', // premium +5 within 7 days
    ])
    const n = c.find((x) => x.title === 'Upcoming payment: Netflix')
    assert.equal(n.kind, 'subscription_due')
    assert.equal(n.relatedType, 'subscription')
    assert.equal(n.relatedId, netflix.id)
    assert.ok(n.key.startsWith('pay-due:'))
    assert.match(n.description, /is due on/)
    assert.ok(c.every((x) => x.key && x.relatedId))
    assert.equal(new Set(c.map((x) => x.key)).size, c.length)
  })

  await check('rules: per-record reminder days and premium preference are honoured', async () => {
    const wide = R.computeNotifications(await load(), { ...prefs, premiumReminderDays: 30 }, today)
    assert.ok(titles(wide).includes('Upcoming premium: Life'), 'life premium +20 within 30')
    const narrow = R.computeNotifications(await load(), { ...prefs, premiumReminderDays: 1 }, today)
    assert.ok(!titles(narrow).includes('Upcoming premium: Car'))
    // Spotify has reminderDays 3, due +10 => none; raise the record's own setting
    const all = await load()
    all.subscriptions = all.subscriptions.map((s) => (s.id === spotify.id ? { ...s, reminderDays: 30 } : s))
    assert.ok(titles(R.computeNotifications(all, prefs, today)).includes('Upcoming payment: Spotify'))
  })

  await check('rules: overdue replaces upcoming; policy renewal key changes with expiry', async () => {
    const all = await load()
    all.subscriptionPayments = all.subscriptionPayments.map((p) => (p.subscriptionId === netflix.id ? { ...p, dueDate: d(-3) } : p))
    const c = R.computeNotifications(all, prefs, today)
    assert.ok(titles(c).includes('Overdue payment: Netflix'))
    assert.ok(!titles(c).includes('Upcoming payment: Netflix'))
    const o = c.find((x) => x.title === 'Overdue payment: Netflix')
    assert.ok(o.key.startsWith('overdue:') && o.kind === 'payment_overdue')
    assert.match(o.description, /was due on/)
    const k1 = R.notificationKeys.policyExpiring('p', '2026-12-01')
    const k2 = R.notificationKeys.policyExpiring('p', '2027-12-01')
    assert.notEqual(k1, k2)
  })

  await check('rules: nothing for paid/skipped payments, cancelled, or far-off items', async () => {
    const c = R.computeNotifications({ subscriptions: [], subscriptionPayments: [], policies: [], policyPayments: [] }, prefs, today)
    assert.deepEqual(c, [])
  })

  await check('sync: creates each reminder once, unread; repeating is a no-op', async () => {
    assert.equal(await N.syncNotifications(uid, await load(), prefs, today), true)
    const first = await N.listNotifications(uid)
    assert.equal(first.length, 4)
    assert.ok(first.every((n) => !n.read && n.readAt === null))
    for (let i = 0; i < 5; i++) assert.equal(await N.syncNotifications(uid, await load(), prefs, today), false)
    assert.equal((await N.listNotifications(uid)).length, 4)
  })

  await check('sync: concurrent runs never create duplicates', async () => {
    await Promise.all([1, 2, 3, 4].map(async () => N.syncNotifications(uid, await load(), prefs, today)))
    const list = await N.listNotifications(uid)
    assert.equal(list.length, 4)
    assert.equal(new Set(list.map((n) => n.id)).size, 4)
  })

  await check('read notifications stay read and are not recreated', async () => {
    const [first] = await N.listNotifications(uid)
    await N.markNotificationRead(uid, first.id)
    await N.syncNotifications(uid, await load(), prefs, today)
    const list = await N.listNotifications(uid)
    assert.equal(list.length, 4)
    assert.equal(list.find((n) => n.id === first.id).read, true)
    assert.ok(list.find((n) => n.id === first.id).readAt)
    assert.equal(list.filter((n) => !n.read).length, 3)
    await N.markNotificationRead(uid, first.id) // repeat is harmless
    await N.markNotificationRead(uid, 'does-not-exist')
  })

  await check('paying closes the reminder and adds a "marked as paid" notification (once)', async () => {
    const open = (await paySvc.listPayments(uid)).find((p) => p.subscriptionId === netflix.id && p.status === 'upcoming')
    await paySvc.resolvePayment(uid, open.id, { status: 'paid', paymentDate: today })
    let list = await N.listNotifications(uid)
    const paid = list.filter((n) => n.kind === 'payment_paid')
    assert.equal(paid.length, 1)
    assert.equal(paid[0].title, 'Payment marked as paid: Netflix')
    assert.match(paid[0].description, /paid on/)
    assert.equal(paid[0].relatedId, netflix.id)
    assert.equal(paid[0].id, `paid:${open.id}`)
    await N.syncNotifications(uid, await load(), prefs, today)
    list = await N.listNotifications(uid)
    const due = list.find((n) => n.title === 'Upcoming payment: Netflix')
    assert.equal(due.read, true, 'upcoming reminder auto-closed once paid')
    assert.equal(list.filter((n) => n.kind === 'payment_paid').length, 1)
    // Skipping does not create a "paid" notification
    const open2 = (await paySvc.listPayments(uid)).find((p) => p.subscriptionId === lateOne.id && p.status === 'upcoming')
    await paySvc.resolvePayment(uid, open2.id, { status: 'skipped' })
    assert.equal((await N.listNotifications(uid)).filter((n) => n.kind === 'payment_paid').length, 1)
  })

  await check('paying a premium creates a premium-paid notification', async () => {
    const open = (await polPay.listPolicyPayments(uid)).find((p) => p.policyId === car.id && p.status === 'upcoming')
    await polPay.resolvePolicyPayment(uid, open.id, { status: 'paid', paymentDate: today })
    const n = (await N.listNotifications(uid)).find((x) => x.id === `paid:${open.id}`)
    assert.equal(n.title, 'Premium marked as paid: Car')
    assert.equal(n.relatedType, 'policy')
  })

  await check('upcoming -> overdue: old reminder closed, overdue created', async () => {
    const all = await load()
    const open = all.subscriptionPayments.find((p) => p.subscriptionId === lateOne.id && p.status === 'upcoming')
    // Gym's next payment is a month away after skipping; make it overdue
    const overdueSrc = { ...all, subscriptionPayments: all.subscriptionPayments.map((p) => (p.id === open.id ? { ...p, dueDate: d(-2) } : p)) }
    await N.syncNotifications(uid, overdueSrc, prefs, today)
    const list = await N.listNotifications(uid)
    assert.ok(list.some((n) => n.title === 'Overdue payment: Gym' && !n.read))
    // Overdue created exactly once across repeated syncs
    await N.syncNotifications(uid, overdueSrc, prefs, today)
    assert.equal((await N.listNotifications(uid)).filter((n) => n.title === 'Overdue payment: Gym').length, 1)
    // When it is later resolved, the overdue notification is closed
    await N.syncNotifications(uid, all, prefs, today)
    assert.equal((await N.listNotifications(uid)).find((n) => n.title === 'Overdue payment: Gym').read, true)
  })

  await check('renewing a policy closes the expiring reminder and re-arms it for the new term', async () => {
    const before = (await N.listNotifications(uid)).find((n) => n.title === 'Policy expiring soon: Car')
    assert.equal(before.read, false)
    await pol.renewPolicy(uid, car.id, { newExpiryDate: d(20 + 365), premiumAmountMinor: 1, coverageAmountMinor: 1, notes: '' })
    await N.syncNotifications(uid, await load(), prefs, today)
    const after = (await N.listNotifications(uid)).find((n) => n.id === before.id)
    assert.equal(after.read, true, 'old expiring reminder closed')
    // A later date inside the new term's window creates a fresh one (different key)
    const future = d(20 + 365 - 10)
    await N.syncNotifications(uid, await load(), prefs, future)
    const created = (await N.listNotifications(uid)).filter((n) => n.title === 'Policy expiring soon: Car')
    assert.equal(created.length, 2)
    assert.notEqual(created[0].id, created[1].id)
  })

  await check('deleting a record removes the link from its notifications', async () => {
    await subs.deleteSubscription(uid, spotify.id)
    await subs.deleteSubscription(uid, netflix.id)
    await N.syncNotifications(uid, await load(), prefs, today)
    const list = await N.listNotifications(uid)
    for (const n of list.filter((x) => x.title.includes('Netflix'))) {
      assert.equal(n.relatedId, null, n.title)
    }
    assert.ok(list.filter((x) => x.relatedId).every((x) => x.relatedType))
  })

  await check('mark all as read', async () => {
    await N.syncNotifications(uid, await load(), prefs, d(30))
    await N.markAllNotificationsRead(uid)
    assert.equal((await N.listNotifications(uid)).filter((n) => !n.read).length, 0)
    await N.markAllNotificationsRead(uid) // no-op
  })

  await check('turned off: nothing is created, nothing changes, "paid" notices are skipped', async () => {
    const u2 = 'u2'
    await subs.createSubscription(u2, sub({ name: 'Hulu', nextPaymentDate: d(1) }))
    await prefsSvc.updatePreferences(u2, { inAppNotifications: false })
    const p2 = await prefsSvc.getPreferences(u2)
    assert.equal(p2.inAppNotifications, false)
    assert.equal(await N.syncNotifications(u2, await load(u2), p2, today), false)
    assert.deepEqual(await N.listNotifications(u2), [])
    const open = (await paySvc.listPayments(u2))[0]
    await paySvc.resolvePayment(u2, open.id, { status: 'paid' })
    assert.deepEqual(await N.listNotifications(u2), [])
    await subs.createSubscription(u2, sub({ name: 'Peacock', nextPaymentDate: d(1) }))
    assert.equal(await N.syncNotifications(u2, await load(u2), await prefsSvc.getPreferences(u2) /* still off */ .then((p) => ({ ...p, inAppNotifications: false })), today), false)
    await prefsSvc.updatePreferences(u2, { inAppNotifications: true })
    assert.equal(await N.syncNotifications(u2, await load(u2), await prefsSvc.getPreferences(u2), today), true)
    assert.ok((await N.listNotifications(u2)).length >= 1)
  })

  await check('preferences: defaults, partial updates, isolation', async () => {
    assert.deepEqual(await prefsSvc.getPreferences('fresh-user'), DEFAULTS)
    await prefsSvc.updatePreferences('pu', { premiumReminderDays: 15 })
    assert.deepEqual(await prefsSvc.getPreferences('pu'), { inAppNotifications: true, premiumReminderDays: 15 })
    assert.deepEqual(await prefsSvc.getPreferences('someone-else'), DEFAULTS)
  })

  await check('isolation: another user sees none of these notifications', async () => {
    assert.deepEqual(await N.listNotifications('stranger'), [])
  })

  await check('storage cap keeps at most 200, dropping only finished old ones', async () => {
    const u3 = 'u3'
    const key = `spm.mock.notifications.${u3}`
    const old = Array.from({ length: 210 }, (_, i) => ({
      id: `old-${i}`, kind: 'payment_paid', title: 't', description: 'd', relatedType: 'subscription', relatedId: null,
      createdAt: new Date(2020, 0, 1, 0, i).toISOString(), read: true, readAt: 'x',
    }))
    localStorage.setItem(key, JSON.stringify(old))
    await subs.createSubscription(u3, sub({ name: 'Cap', nextPaymentDate: d(1) }))
    assert.equal(await N.syncNotifications(u3, await load(u3), prefs, today), true)
    const list = JSON.parse(localStorage.getItem(key))
    assert.equal(list.length, 200)
    assert.ok(list.some((n) => n.title === 'Upcoming payment: Cap'), 'the new reminder survives')
    assert.ok(!list.some((n) => n.id === 'old-0'), 'oldest finished entries were dropped')
  })

  // ---------------- ICS export ----------------
  const fixedNow = new Date('2026-11-17T08:30:00Z')
  const parseEvents = (text) => text.split('BEGIN:VEVENT\r\n').slice(1).map((b) => b.split('END:VEVENT')[0])
  const unfold = (text) => text.replace(/\r\n /g, '')

  const u = 'ics-user'
  await subs.createSubscription(u, sub({ name: 'Gym, "Pro"; Club', nextPaymentDate: d(3), billingCycle: 'weekly', reminderDays: 1, amountMinor: 120000 }))
  const mus = await subs.createSubscription(u, sub({ name: 'Music', nextPaymentDate: d(10), reminderDays: 7 }))
  const old = await subs.createSubscription(u, sub({ name: 'Dropped', nextPaymentDate: d(4) }))
  await subs.setSubscriptionStatus(u, old.id, 'cancelled')
  await pol.createPolicy(u, pl({ policyName: 'Health', expiryDate: d(60), reminderDays: 30, nextPremiumDate: d(15), billingCycle: 'quarterly' }))
  await pol.createPolicy(u, pl({ policyName: 'Lapsed', startDate: d(-800), expiryDate: d(-10), nextPremiumDate: '' }))
  const paidOne = (await paySvc.listPayments(u)).find((p) => p.subscriptionId === mus.id)
  await paySvc.resolvePayment(u, paidOne.id, { status: 'paid', paymentDate: today })
  const icsSrc = await load(u)
  const ics = ICS.buildIcs(icsSrc, { inAppNotifications: true, premiumReminderDays: 7 }, today, fixedNow)

  await check('ics: valid calendar structure, CRLF line endings, balanced blocks', async () => {
    const c = ics.content
    assert.ok(c.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:'))
    assert.ok(c.endsWith('END:VCALENDAR\r\n'))
    assert.ok(!/[^\r]\n/.test(c), 'no bare LF line endings')
    const count = (s) => (c.match(new RegExp(s, 'g')) ?? []).length
    assert.equal(count('BEGIN:VEVENT'), count('END:VEVENT'))
    assert.equal(count('BEGIN:VALARM'), count('END:VALARM'))
    assert.equal(count('BEGIN:VEVENT'), ics.count)
    assert.equal(count('BEGIN:VALARM'), ics.count, 'one reminder per event')
    assert.ok(ics.count > 5)
  })

  await check('ics: no physical line over 75 octets (multi-byte safe), fold/unfold round-trips', async () => {
    for (const line of ics.content.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line)
    const long = 'SUMMARY:' + 'ab₹,'.repeat(60)
    const folded = ICS.foldLine(long)
    assert.ok(folded.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75))
    assert.equal(folded.replace(/\r\n /g, ''), long)
    assert.equal(ICS.foldLine('short'), 'short')
  })

  await check('ics: text is escaped (commas, semicolons, backslashes, newlines)', async () => {
    assert.equal(ICS.escapeIcsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne')
    assert.ok(unfold(ics.content).includes('SUMMARY:Payment due: Gym\\, "Pro"\\; Club ('))
  })

  await check('ics: only future items; paid, cancelled and lapsed are excluded', async () => {
    const text = unfold(ics.content)
    assert.ok(text.includes('Payment due: Music'), 'next cycle of paid subscription still exported')
    assert.ok(!text.includes('Dropped'), 'cancelled subscription excluded')
    assert.ok(text.includes('Premium due: Health'))
    assert.ok(text.includes('Policy expires: Health'))
    assert.ok(!text.includes('Lapsed'), 'expired policy excluded')
    // nothing dated before today
    for (const m of text.matchAll(/DTSTART;VALUE=DATE:(\d{8})/g)) assert.ok(m[1] >= today.replace(/-/g, ''), m[1])
  })

  await check('ics: all-day dates, exclusive end, stable unique UIDs, transparent', async () => {
    const evs = parseEvents(unfold(ics.content))
    const uids = evs.map((e) => e.match(/UID:(.+)\r\n/)[1])
    assert.equal(new Set(uids).size, uids.length)
    assert.ok(uids.every((x) => x.endsWith('@subscription-policy-manager.local')))
    for (const e of evs) {
      const s = e.match(/DTSTART;VALUE=DATE:(\d{8})/)[1]
      const en = e.match(/DTEND;VALUE=DATE:(\d{8})/)[1]
      const next = addDaysISO(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`, 1).replace(/-/g, '')
      assert.equal(en, next)
      assert.ok(e.includes('TRANSP:TRANSPARENT'))
      assert.match(e, /DTSTAMP:20261117T083000Z/)
    }
    // Stable across re-exports even after the data changes (same event => same UID)
    const again = ICS.buildIcs(await load(u), { inAppNotifications: true, premiumReminderDays: 7 }, today, new Date())
    const uids2 = parseEvents(unfold(again.content)).map((e) => e.match(/UID:(.+)\r\n/)[1])
    assert.deepEqual(uids2, uids)
  })

  await check('ics: reminders use each record\'s own days (09:00 local), premiums use the preference', async () => {
    assert.equal(ICS.reminderTrigger(1), '-PT15H')
    assert.equal(ICS.reminderTrigger(3), '-P2DT15H')
    assert.equal(ICS.reminderTrigger(30), '-P29DT15H')
    const evs = parseEvents(unfold(ics.content))
    const trig = (needle) => evs.find((e) => e.includes(needle)).match(/TRIGGER:(.+)\r\n/)[1]
    assert.equal(trig('Payment due: Gym'), '-PT15H') // reminderDays 1
    assert.equal(trig('Payment due: Music'), '-P6DT15H') // 7
    assert.equal(trig('Policy expires: Health'), '-P29DT15H') // 30
    assert.equal(trig('Premium due: Health'), '-P6DT15H') // premiumReminderDays 7
    const p30 = ICS.buildIcs(icsSrc, { inAppNotifications: true, premiumReminderDays: 30 }, today, fixedNow)
    const e30 = parseEvents(unfold(p30.content)).find((e) => e.includes('Premium due: Health'))
    assert.match(e30, /TRIGGER:-P29DT15H/)
  })

  await check('ics: weekly cycle expands to one event per week over the next year; horizon respected', async () => {
    const text = unfold(ics.content)
    const gym = parseEvents(text).filter((e) => e.includes('Payment due: Gym'))
    assert.ok(gym.length >= 51 && gym.length <= 53, String(gym.length))
    const last = [...text.matchAll(/DTSTART;VALUE=DATE:(\d{8})/g)].map((m) => m[1]).sort().pop()
    assert.ok(last < addDaysISO(today, 366).replace(/-/g, ''))
  })

  await check('ics: empty data gives zero events (UI shows a message instead of a file)', async () => {
    const empty = ICS.buildIcs({ subscriptions: [], subscriptionPayments: [], policies: [], policyPayments: [] }, prefs, today, fixedNow)
    assert.equal(empty.count, 0)
    assert.ok(!empty.content.includes('BEGIN:VEVENT'))
  })
})
