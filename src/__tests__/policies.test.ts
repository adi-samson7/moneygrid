import assert from 'node:assert/strict'
import { scenario } from '@/test/steps'

scenario("policies: status, premiums within the term, renewal, cancellation", async (check) => {
  const rules = await import('@/utils/policy-rules')
  const svc = await import('@/services/policy.service')
  const paySvc = await import('@/services/policy-payment.service')
  const stats = await import('@/utils/policy-stats')
  const list = await import('@/utils/policy-list')
  const { todayISO, addDaysISO } = await import('@/utils/dates')
  const { policyFormSchema, renewalFormSchema } = await import('@/schemas/policy.schema')
  const today = todayISO()
  const d = (n) => addDaysISO(today, n)

  await check('status derivation', async () => {
    const p = (o) => ({ status: 'active', reminderDays: 30, expiryDate: d(200), ...o })
    assert.equal(rules.getPolicyStatus(p({})), 'active')
    assert.equal(rules.getPolicyStatus(p({ expiryDate: d(30) })), 'expiring_soon')
    assert.equal(rules.getPolicyStatus(p({ expiryDate: d(31) })), 'active')
    assert.equal(rules.getPolicyStatus(p({ expiryDate: today })), 'expiring_soon')
    assert.equal(rules.getPolicyStatus(p({ expiryDate: d(-1) })), 'expired')
    assert.equal(rules.getPolicyStatus(p({ status: 'cancelled' })), 'cancelled')
    assert.equal(rules.getPolicyStatus(p({ status: 'cancelled', expiryDate: d(-5) })), 'cancelled')
    assert.equal(rules.getPolicyStatus(p({ reminderDays: 7, expiryDate: d(20) })), 'active')
  })

  await check('premium schedule stops at expiry', async () => {
    assert.equal(rules.nextPremiumWithinTerm('2026-03-01', 'yearly', '2027-02-28', '2026-11-17'), null)
    assert.equal(rules.nextPremiumWithinTerm('2026-01-15', 'monthly', '2027-01-14', '2026-11-17'), '2026-12-15')
    assert.equal(rules.advancePremiumWithinTerm('2026-12-15', 'monthly', '2026-01-15', '2027-01-14'), null)
    assert.equal(rules.advancePremiumWithinTerm('2026-11-15', 'monthly', '2026-01-15', '2027-01-14'), '2026-12-15')
  })

  const uid = 'user-a'
  const base = {
    provider: 'HDFC Ergo', policyName: 'Family Health', policyType: 'health', policyNumber: 'P-123',
    premiumAmountMinor: 50000, currency: 'INR', coverageAmountMinor: 50000000, billingCycle: 'monthly',
    startDate: d(-45), expiryDate: d(320), nextPremiumDate: '', reminderDays: 30, notes: '',
  }
  let policy
  await check('create: auto next premium within term + one open premium', async () => {
    policy = await svc.createPolicy(uid, base)
    assert.ok(policy.nextPremiumDate >= today && policy.nextPremiumDate <= policy.expiryDate)
    assert.equal(policy.status, 'active')
    assert.deepEqual(policy.renewals, [])
    const pays = await paySvc.listPolicyPayments(uid)
    assert.equal(pays.length, 1)
    assert.equal(pays[0].policyId, policy.id)
    assert.equal(pays[0].dueDate, policy.nextPremiumDate)
    assert.equal(pays[0].amountMinor, 50000)
  })

  await check('policy payments are stored separately from subscription payments', async () => {
    assert.equal(localStorage.getItem(`spm.mock.subscriptionPayments.${uid}`), null)
    assert.ok(localStorage.getItem(`spm.mock.policyPayments.${uid}`))
  })

  await check('mark premium paid: history kept, next premium opened', async () => {
    const [open] = await paySvc.listPolicyPayments(uid)
    await paySvc.resolvePolicyPayment(uid, open.id, { status: 'paid', paymentDate: today, notes: 'netbanking' })
    const pays = await paySvc.listPolicyPayments(uid)
    const [p] = await svc.listPolicies(uid)
    assert.equal(pays.find((x) => x.id === open.id).status, 'paid')
    assert.equal(pays.filter((x) => x.status === 'upcoming').length, 1)
    assert.equal(pays.find((x) => x.status === 'upcoming').dueDate, p.nextPremiumDate)
    assert.ok(p.nextPremiumDate > open.dueDate)
    await assert.rejects(paySvc.resolvePolicyPayment(uid, open.id, { status: 'paid' }), /already been recorded/)
  })

  await check('last premium of the term: no open payment after it', async () => {
    // Policy whose final premium is the one open now.
    const last = await svc.createPolicy(uid, { ...base, policyName: 'Short term', startDate: d(-20), expiryDate: d(15), billingCycle: 'monthly' })
    assert.ok(last.nextPremiumDate && last.nextPremiumDate <= last.expiryDate)
    const open = (await paySvc.listPolicyPayments(uid)).find((x) => x.policyId === last.id && x.status === 'upcoming')
    await paySvc.resolvePolicyPayment(uid, open.id, { status: 'skipped' })
    const after = (await svc.listPolicies(uid)).find((x) => x.id === last.id)
    assert.equal(after.nextPremiumDate, null)
    assert.equal((await paySvc.listPolicyPayments(uid)).filter((x) => x.policyId === last.id && x.status === 'upcoming').length, 0)
    await svc.deletePolicy(uid, last.id)
  })

  await check('renew: records history, extends term, keeps open premium', async () => {
    const before = (await svc.listPolicies(uid))[0]
    const newExpiry = addDaysISO(before.expiryDate, 365)
    const renewed = await svc.renewPolicy(uid, policy.id, { newExpiryDate: newExpiry, premiumAmountMinor: 55000, coverageAmountMinor: 60000000, notes: ' renewed online ' })
    assert.equal(renewed.expiryDate, newExpiry)
    assert.equal(renewed.premiumAmountMinor, 55000)
    assert.equal(renewed.renewals.length, 1)
    assert.equal(renewed.renewals[0].previousExpiryDate, before.expiryDate)
    assert.equal(renewed.renewals[0].notes, 'renewed online')
    assert.equal(renewed.renewals[0].renewedOn, today)
    assert.equal(renewed.nextPremiumDate, before.nextPremiumDate)
    const open = (await paySvc.listPolicyPayments(uid)).find((x) => x.policyId === policy.id && x.status === 'upcoming')
    assert.equal(open.amountMinor, 55000)
    const paid = (await paySvc.listPolicyPayments(uid)).find((x) => x.status === 'paid')
    assert.equal(paid.amountMinor, 50000, 'history amount unchanged')
  })

  await check('renew validation: earlier expiry rejected', async () => {
    const cur = (await svc.listPolicies(uid))[0]
    await assert.rejects(svc.renewPolicy(uid, policy.id, { newExpiryDate: cur.expiryDate, premiumAmountMinor: 1, coverageAmountMinor: 1, notes: '' }), /after the current/)
  })

  await check('renew a yearly policy whose term ended premiums: schedule restarts', async () => {
    const yearly = await svc.createPolicy(uid, { ...base, policyName: 'Car', policyType: 'vehicle', billingCycle: 'yearly', startDate: d(-100), expiryDate: d(264) })
    assert.equal(yearly.nextPremiumDate, null, 'annual premium already paid this term')
    assert.equal((await paySvc.listPolicyPayments(uid)).filter((x) => x.policyId === yearly.id).length, 0)
    const renewed = await svc.renewPolicy(uid, yearly.id, { newExpiryDate: d(264 + 365), premiumAmountMinor: 90000, coverageAmountMinor: 1, notes: '' })
    assert.ok(renewed.nextPremiumDate, 'next premium falls in the new term')
    assert.ok(renewed.nextPremiumDate > yearly.expiryDate)
    assert.ok(renewed.nextPremiumDate <= renewed.expiryDate)
    const open = (await paySvc.listPolicyPayments(uid)).filter((x) => x.policyId === yearly.id)
    assert.equal(open.length, 1)
    assert.equal(open[0].dueDate, renewed.nextPremiumDate)
  })

  await check('cancel: open premium removed, history kept, excluded from stats; cannot renew', async () => {
    await svc.setPolicyStatus(uid, policy.id, 'cancelled')
    const pays = await paySvc.listPolicyPayments(uid)
    assert.equal(pays.filter((x) => x.policyId === policy.id && x.status === 'upcoming').length, 0)
    assert.ok(pays.some((x) => x.policyId === policy.id && x.status === 'paid'))
    const policies = await svc.listPolicies(uid)
    assert.ok(!stats.policiesInForce(policies).some((p) => p.id === policy.id))
    await assert.rejects(svc.renewPolicy(uid, policy.id, { newExpiryDate: d(9999), premiumAmountMinor: 1, coverageAmountMinor: 1, notes: '' }), /cancelled/)
  })

  await check('reactivate: open premium recreated in term', async () => {
    const back = await svc.setPolicyStatus(uid, policy.id, 'active')
    assert.ok(back.nextPremiumDate >= today)
    assert.equal((await paySvc.listPolicyPayments(uid)).filter((x) => x.policyId === policy.id && x.status === 'upcoming').length, 1)
  })

  await check('stats: coverage kept separate from premiums; expired excluded', async () => {
    await svc.createPolicy(uid, { ...base, policyName: 'Old', startDate: d(-800), expiryDate: d(-10), coverageAmountMinor: 99999999 })
    const policies = await svc.listPolicies(uid)
    const annual = stats.annualPremiumTotals(policies)
    const coverage = stats.coverageTotals(policies)
    // Health (55000 monthly) + Car (90000 yearly), INR
    assert.equal(annual.INR, 55000 * 12 + 90000)
    assert.equal(coverage.INR, 60000000 + 1)
    assert.ok(annual.INR < coverage.INR)
  })

  await check('edit syncs open premium; blank next date recalculates', async () => {
    const cur = (await svc.listPolicies(uid)).find((p) => p.id === policy.id)
    const target = addDaysISO(today, 5)
    await svc.updatePolicy(uid, policy.id, { ...base, startDate: cur.startDate, expiryDate: cur.expiryDate, premiumAmountMinor: 60000, nextPremiumDate: target, status: 'active' })
    let open = (await paySvc.listPolicyPayments(uid)).find((x) => x.policyId === policy.id && x.status === 'upcoming')
    assert.equal(open.dueDate, target)
    assert.equal(open.amountMinor, 60000)
    await svc.updatePolicy(uid, policy.id, { ...base, startDate: cur.startDate, expiryDate: cur.expiryDate, nextPremiumDate: '', status: 'active' })
    open = (await paySvc.listPolicyPayments(uid)).find((x) => x.policyId === policy.id && x.status === 'upcoming')
    assert.ok(open.dueDate >= today)
  })

  await check('list: search, status/type filters, sort', async () => {
    const policies = await svc.listPolicies(uid)
    const opts = { search: '', status: 'all', type: 'all', sortKey: 'name', sortDirection: 'asc' }
    assert.deepEqual(list.filterAndSortPolicies(policies, opts).map((p) => p.policyName), ['Car', 'Family Health', 'Old'])
    assert.deepEqual(list.filterAndSortPolicies(policies, { ...opts, status: 'expired' }).map((p) => p.policyName), ['Old'])
    assert.deepEqual(list.filterAndSortPolicies(policies, { ...opts, type: 'vehicle' }).map((p) => p.policyName), ['Car'])
    assert.deepEqual(list.filterAndSortPolicies(policies, { ...opts, search: 'p-123' }).length, 3)
    assert.deepEqual(list.filterAndSortPolicies(policies, { ...opts, search: 'vehicle insurance' }).map((p) => p.policyName), ['Car'])
    assert.deepEqual(list.filterAndSortPolicies(policies, { ...opts, sortKey: 'expiry', sortDirection: 'asc' }).map((p) => p.policyName)[0], 'Old')
    assert.deepEqual(list.filterAndSortPolicies(policies, { ...opts, status: 'cancelled' }), [])
  })

  await check('delete removes policy and its premiums only; data isolation', async () => {
    await svc.deletePolicy(uid, policy.id)
    const left = await svc.listPolicies(uid)
    assert.ok(!left.some((p) => p.id === policy.id))
    assert.ok((await paySvc.listPolicyPayments(uid)).every((x) => x.policyId !== policy.id))
    assert.deepEqual(await svc.listPolicies('user-b'), [])
    assert.deepEqual(await paySvc.listPolicyPayments('user-b'), [])
  })

  await check('schemas', async () => {
    const ok = { provider: 'LIC', policyName: 'Term', policyType: 'life', policyNumber: '', premium: '1200.50', currency: 'INR', coverage: '0', billingCycle: 'yearly', startDate: '2026-01-01', expiryDate: '2027-01-01', nextPremiumDate: '', status: 'active', reminderDays: '30', notes: '' }
    assert.ok(policyFormSchema.safeParse(ok).success)
    for (const bad of [
      { provider: ' ' }, { policyName: '' }, { premium: '0' }, { premium: 'x' }, { coverage: '-1' }, { billingCycle: 'weekly' },
      { expiryDate: '2026-01-01' }, { expiryDate: '2025-12-31' }, { startDate: '2026-02-30' }, { nextPremiumDate: '2028-01-01' },
      { nextPremiumDate: '2025-01-01' }, { reminderDays: '5' }, { status: 'expired' },
    ]) assert.ok(!policyFormSchema.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad))
    assert.ok(renewalFormSchema.safeParse({ newExpiryDate: '2028-01-01', premium: '10', coverage: '0', notes: '' }).success)
    assert.ok(!renewalFormSchema.safeParse({ newExpiryDate: 'nope', premium: '10', coverage: '0', notes: '' }).success)
  })
})
