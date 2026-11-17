import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch, type Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest'

/**
 * Firestore security rules, tested against the real emulator. Each test checks that something is
 * allowed or denied. Run with: npm run test:emulator
 */

let env: RulesTestEnvironment

const ISO = '2026-11-17T09:30:00.000Z'

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-spm',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  })
})
afterAll(async () => env?.cleanup())
beforeEach(async () => env.clearFirestore())

const as = (uid: string): Firestore => env.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore() as unknown as Firestore
const anon = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore
const ref = (db: Firestore, uid: string, ...path: string[]) => doc(db, 'users', uid, ...path)

// ---------- valid documents ----------

const subscription = (id = 's1', o: object = {}) => ({
  id, name: 'Netflix', provider: 'Netflix Inc', category: 'Entertainment', amountMinor: 49900, currency: 'INR',
  billingCycle: 'monthly', startDate: '2026-01-31', nextPaymentDate: '2026-12-01', paymentMethod: 'Visa', status: 'active',
  reminderDays: 3, createdAt: ISO, updatedAt: ISO, ...o,
})
const subPayment = (id = 'p1', o: object = {}) => ({
  id, subscriptionId: 's1', amountMinor: 49900, currency: 'INR', dueDate: '2026-12-01', paymentDate: null, status: 'upcoming',
  notes: '', createdAt: ISO, updatedAt: ISO, ...o,
})
const policy = (id = 'pol1', o: object = {}) => ({
  id, provider: 'HDFC Ergo', policyName: 'Family Health', policyType: 'health', policyNumber: 'FH-1', premiumAmountMinor: 1200000,
  currency: 'INR', coverageAmountMinor: 50000000, billingCycle: 'yearly', startDate: '2026-03-01', expiryDate: '2027-02-28',
  nextPremiumDate: null, status: 'active', reminderDays: 30, notes: '', renewals: [], createdAt: ISO, updatedAt: ISO, ...o,
})
const premium = (id = 'pp1', o: object = {}) => ({
  id, policyId: 'pol1', amountMinor: 1200000, currency: 'INR', dueDate: '2027-03-01', paymentDate: null, status: 'upcoming',
  notes: '', createdAt: ISO, updatedAt: ISO, ...o,
})
const notification = (id = 'pay-due:p1', o: object = {}) => ({
  id, kind: 'subscription_due', title: 'Upcoming payment: Netflix', description: '₹499.00 is due on 1 Dec 2026.',
  relatedType: 'subscription', relatedId: 's1', createdAt: ISO, read: false, readAt: null, ...o,
})
const activity = (id = 'a1', o: object = {}) => ({
  id, kind: 'subscription_added', message: 'Added subscription Netflix', relatedType: 'subscription', relatedId: 's1', createdAt: ISO, ...o,
})
const profile = (uid: string, o: object = {}) => ({
  id: 'details', uid, fullName: 'Asha Rao', email: `${uid}@example.com`, preferredCurrency: 'INR', timeZone: 'Asia/Kolkata', createdAt: ISO, ...o,
})
const prefs = (o: object = {}) => ({ id: 'preferences', inAppNotifications: true, premiumReminderDays: 7, ...o })

/** Seeds a document bypassing the rules, so update and delete rules can be tested. */
async function seed(uid: string, collectionName: string, id: string, data: object) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, 'users', uid, collectionName, id), data)
  })
}

/** Runs each mutation of a valid document and expects every one to be rejected. */
function rejectsAll(name: string, make: (o: object) => object, uid: string, col: string, id: string, bad: Record<string, object>) {
  test(`${name}: rejects invalid documents`, async () => {
    const db = as(uid)
    for (const [label, mutation] of Object.entries(bad)) {
      await assertFails(setDoc(ref(db, uid, col, id), { ...make({}), ...mutation }), ).catch((e) => {
        throw new Error(`"${label}" was accepted but should be rejected: ${e.message}`)
      })
    }
  })
}

describe('access control', () => {
  test('signed-out visitors can neither read nor write anything', async () => {
    await seed('alice', 'subscriptions', 's1', subscription())
    const db = anon()
    await assertFails(getDoc(ref(db, 'alice', 'subscriptions', 's1')))
    await assertFails(getDocs(collection(db, 'users', 'alice', 'subscriptions')))
    await assertFails(setDoc(ref(db, 'alice', 'subscriptions', 's2'), subscription('s2')))
    await assertFails(deleteDoc(ref(db, 'alice', 'subscriptions', 's1')))
  })

  test('a user can read, list, create, update and delete their own data', async () => {
    const db = as('alice')
    await assertSucceeds(setDoc(ref(db, 'alice', 'subscriptions', 's1'), subscription()))
    await assertSucceeds(getDoc(ref(db, 'alice', 'subscriptions', 's1')))
    await assertSucceeds(getDocs(collection(db, 'users', 'alice', 'subscriptions')))
    await assertSucceeds(setDoc(ref(db, 'alice', 'subscriptions', 's1'), subscription('s1', { name: 'Netflix 4K', updatedAt: '2026-11-18T10:00:00.000Z' })))
    await assertSucceeds(deleteDoc(ref(db, 'alice', 'subscriptions', 's1')))
  })

  test('a user cannot read, list, write or delete another user\'s data', async () => {
    await seed('alice', 'subscriptions', 's1', subscription())
    await seed('alice', 'policies', 'pol1', policy())
    const bob = as('bob')
    await assertFails(getDoc(ref(bob, 'alice', 'subscriptions', 's1')))
    await assertFails(getDocs(collection(bob, 'users', 'alice', 'subscriptions')))
    await assertFails(getDocs(collection(bob, 'users', 'alice', 'policies')))
    await assertFails(setDoc(ref(bob, 'alice', 'subscriptions', 's9'), subscription('s9')))
    await assertFails(setDoc(ref(bob, 'alice', 'subscriptions', 's1'), subscription('s1', { name: 'Hijacked' })))
    await assertFails(deleteDoc(ref(bob, 'alice', 'subscriptions', 's1')))
    await assertFails(setDoc(ref(bob, 'alice', 'activity', 'a1'), activity()))
  })

  test('every collection is private to its owner', async () => {
    await seed('alice', 'subscriptionPayments', 'p1', subPayment())
    await seed('alice', 'policyPayments', 'pp1', premium())
    await seed('alice', 'notifications', 'n1', notification('n1'))
    await seed('alice', 'activity', 'a1', activity())
    await seed('alice', 'profile', 'details', profile('alice'))
    await seed('alice', 'settings', 'preferences', prefs())
    const bob = as('bob')
    for (const [col, id] of [['subscriptionPayments', 'p1'], ['policyPayments', 'pp1'], ['notifications', 'n1'], ['activity', 'a1'], ['profile', 'details'], ['settings', 'preferences']]) {
      await assertFails(getDoc(ref(bob, 'alice', col, id)))
      await assertSucceeds(getDoc(ref(as('alice'), 'alice', col, id)))
    }
  })

  test('unknown collections and paths are denied, even for the owner', async () => {
    const db = as('alice')
    await assertFails(setDoc(ref(db, 'alice', 'secrets', 'x'), { a: 1 }))
    await assertFails(getDoc(ref(db, 'alice', 'secrets', 'x')))
    await assertFails(setDoc(doc(db, 'users', 'alice'), { name: 'x' }))
    await assertFails(setDoc(doc(db, 'admins', 'alice'), { admin: true }))
    await assertFails(getDoc(doc(db, 'config', 'app')))
    await assertFails(setDoc(doc(db, 'users', 'alice', 'subscriptions', 's1', 'extra', 'x'), { a: 1 }))
  })

  test('related writes in one batch succeed for the owner and fail across users', async () => {
    const batch = (db: Firestore, uid: string) => {
      const b = writeBatch(db)
      b.set(ref(db, uid, 'subscriptions', 's1'), subscription())
      b.set(ref(db, uid, 'subscriptionPayments', 'p1'), subPayment())
      b.set(ref(db, uid, 'activity', 'a1'), activity())
      return b.commit()
    }
    await assertSucceeds(batch(as('alice'), 'alice'))
    await assertFails(batch(as('bob'), 'alice'))
  })
})

describe('subscriptions', () => {
  rejectsAll('create', (o) => subscription('s1', o), 'alice', 'subscriptions', 's1', {
    'empty name': { name: '' },
    'name over 80 characters': { name: 'x'.repeat(81) },
    'unknown category': { category: 'Crypto' },
    'zero amount': { amountMinor: 0 },
    'negative amount': { amountMinor: -5 },
    'fractional amount': { amountMinor: 12.5 },
    'amount as text': { amountMinor: '499' },
    'huge amount': { amountMinor: 1e15 },
    'unknown currency': { currency: 'JPY' },
    'unknown billing cycle': { billingCycle: 'daily' },
    'bad start date (month 13)': { startDate: '2026-13-01' },
    'date without zero padding': { startDate: '2026-1-1' },
    'bad next payment date': { nextPaymentDate: 'tomorrow' },
    'unknown status': { status: 'deleted' },
    'unsupported reminder days': { reminderDays: 5 },
    'reminder days as text': { reminderDays: '3' },
    'bad createdAt': { createdAt: 'yesterday' },
    'id that does not match the document': { id: 'other' },
    'extra field': { isAdmin: true },
    'name as number': { name: 42 },
  })

  test('create: rejects a document with a missing field', async () => {
    const { provider, ...withoutProvider } = subscription()
    void provider
    await assertFails(setDoc(ref(as('alice'), 'alice', 'subscriptions', 's1'), withoutProvider))
  })

  test('update: createdAt cannot change; other valid changes can', async () => {
    await seed('alice', 'subscriptions', 's1', subscription())
    const db = as('alice')
    await assertFails(setDoc(ref(db, 'alice', 'subscriptions', 's1'), subscription('s1', { createdAt: '2020-01-01T00:00:00.000Z' })))
    await assertFails(setDoc(ref(db, 'alice', 'subscriptions', 's1'), subscription('s1', { amountMinor: -1 })))
    await assertSucceeds(setDoc(ref(db, 'alice', 'subscriptions', 's1'), subscription('s1', { status: 'paused', updatedAt: '2026-11-18T00:00:00.000Z' })))
  })
})

describe('payments and premiums', () => {
  test('an open payment can be created, edited and resolved', async () => {
    const db = as('alice')
    await assertSucceeds(setDoc(ref(db, 'alice', 'subscriptionPayments', 'p1'), subPayment()))
    await assertSucceeds(setDoc(ref(db, 'alice', 'subscriptionPayments', 'p1'), subPayment('p1', { amountMinor: 59900, dueDate: '2026-12-05' })))
    await assertSucceeds(setDoc(ref(db, 'alice', 'subscriptionPayments', 'p1'), subPayment('p1', { status: 'paid', paymentDate: '2026-12-01', notes: 'autopay' })))
  })

  test('skipping works and keeps the payment date empty', async () => {
    await seed('alice', 'subscriptionPayments', 'p1', subPayment())
    await assertSucceeds(setDoc(ref(as('alice'), 'alice', 'subscriptionPayments', 'p1'), subPayment('p1', { status: 'skipped' })))
  })

  test('payment history cannot be rewritten once paid or skipped', async () => {
    await seed('alice', 'subscriptionPayments', 'paid', subPayment('paid', { status: 'paid', paymentDate: '2026-11-01' }))
    await seed('alice', 'subscriptionPayments', 'skipped', subPayment('skipped', { status: 'skipped' }))
    const db = as('alice')
    await assertFails(setDoc(ref(db, 'alice', 'subscriptionPayments', 'paid'), subPayment('paid', { status: 'upcoming' })))
    await assertFails(setDoc(ref(db, 'alice', 'subscriptionPayments', 'paid'), subPayment('paid', { status: 'paid', paymentDate: '2026-11-02' })))
    await assertFails(setDoc(ref(db, 'alice', 'subscriptionPayments', 'paid'), subPayment('paid', { status: 'paid', paymentDate: '2026-11-01', notes: 'edited later' })))
    await assertFails(setDoc(ref(db, 'alice', 'subscriptionPayments', 'paid'), subPayment('paid', { status: 'paid', paymentDate: '2026-11-01', amountMinor: 1 })))
    await assertFails(setDoc(ref(db, 'alice', 'subscriptionPayments', 'skipped'), subPayment('skipped', { status: 'paid', paymentDate: '2026-11-01' })))
  })

  test('deleting a payment is allowed (a whole subscription is deleted with its history)', async () => {
    await seed('alice', 'subscriptionPayments', 'paid', subPayment('paid', { status: 'paid', paymentDate: '2026-11-01' }))
    await assertSucceeds(deleteDoc(ref(as('alice'), 'alice', 'subscriptionPayments', 'paid')))
  })

  test('a payment cannot be moved to a different subscription', async () => {
    await seed('alice', 'subscriptionPayments', 'p1', subPayment())
    await assertFails(setDoc(ref(as('alice'), 'alice', 'subscriptionPayments', 'p1'), subPayment('p1', { subscriptionId: 'other' })))
  })

  rejectsAll('subscription payment create', (o) => subPayment('p1', o), 'alice', 'subscriptionPayments', 'p1', {
    'overdue is never stored': { status: 'overdue' },
    'paid without a payment date': { status: 'paid', paymentDate: null },
    'upcoming with a payment date': { status: 'upcoming', paymentDate: '2026-12-01' },
    'zero amount': { amountMinor: 0 },
    'bad due date': { dueDate: '01/12/2026' },
    'notes over 500 characters': { notes: 'n'.repeat(501) },
    'unknown currency': { currency: 'XYZ' },
    'missing owner id': { subscriptionId: '' },
    'extra field': { approved: true },
  })

  test('policy premiums follow the same rules, with their own owner field', async () => {
    const db = as('alice')
    await assertSucceeds(setDoc(ref(db, 'alice', 'policyPayments', 'pp1'), premium()))
    await assertSucceeds(setDoc(ref(db, 'alice', 'policyPayments', 'pp1'), premium('pp1', { status: 'paid', paymentDate: '2027-03-01' })))
    await assertFails(setDoc(ref(db, 'alice', 'policyPayments', 'pp1'), premium('pp1', { status: 'upcoming' })))
    // A premium that points at no policy (wrong owner field) is rejected.
    const { policyId, ...withoutPolicy } = premium('pp2')
    void policyId
    await assertFails(setDoc(ref(db, 'alice', 'policyPayments', 'pp2'), { ...withoutPolicy, subscriptionId: 'x' }))
    await assertFails(setDoc(ref(db, 'alice', 'policyPayments', 'pp3'), premium('pp3', { status: 'overdue' })))
  })
})

describe('policies', () => {
  test('valid policies are accepted, including a zero coverage amount and renewals', async () => {
    const db = as('alice')
    await assertSucceeds(setDoc(ref(db, 'alice', 'policies', 'pol1'), policy()))
    await assertSucceeds(setDoc(ref(db, 'alice', 'policies', 'pol2'), policy('pol2', { coverageAmountMinor: 0, nextPremiumDate: '2026-12-15' })))
    await assertSucceeds(setDoc(ref(db, 'alice', 'policies', 'pol1'), policy('pol1', {
      expiryDate: '2028-02-29',
      renewals: [{ id: 'r1', previousExpiryDate: '2027-02-28', newExpiryDate: '2028-02-29', premiumAmountMinor: 1300000, coverageAmountMinor: 60000000, renewedOn: '2027-02-01', notes: '' }],
      updatedAt: '2027-02-01T00:00:00.000Z',
    })))
  })

  rejectsAll('create', (o) => policy('pol1', o), 'alice', 'policies', 'pol1', {
    'expiry before start': { startDate: '2026-03-01', expiryDate: '2026-02-01' },
    'expiry on the start date': { startDate: '2026-03-01', expiryDate: '2026-03-01' },
    'zero premium': { premiumAmountMinor: 0 },
    'negative coverage': { coverageAmountMinor: -1 },
    'weekly billing': { billingCycle: 'weekly' },
    'unknown policy type': { policyType: 'pet' },
    'status expired (derived, never stored)': { status: 'expired' },
    'status expiring_soon (derived, never stored)': { status: 'expiring_soon' },
    'unsupported reminder days': { reminderDays: 5 },
    'renewals not a list': { renewals: 'none' },
    'too many renewals': { renewals: Array.from({ length: 201 }, (_, i) => ({ id: String(i) })) },
    'bad next premium date': { nextPremiumDate: '2026-02-30x' },
    'notes over 1000 characters': { notes: 'n'.repeat(1001) },
    'empty provider': { provider: '' },
    'extra field': { owner: 'someone-else' },
  })

  test('update: createdAt is immutable', async () => {
    await seed('alice', 'policies', 'pol1', policy())
    await assertFails(setDoc(ref(as('alice'), 'alice', 'policies', 'pol1'), policy('pol1', { createdAt: '2020-01-01T00:00:00.000Z' })))
  })
})

describe('notifications and activity', () => {
  test('notifications: valid create, mark read, unlink a deleted record', async () => {
    const db = as('alice')
    await assertSucceeds(setDoc(ref(db, 'alice', 'notifications', 'pay-due:p1'), notification()))
    await assertSucceeds(setDoc(ref(db, 'alice', 'notifications', 'pay-due:p1'), notification('pay-due:p1', { read: true, readAt: ISO })))
    await assertSucceeds(setDoc(ref(db, 'alice', 'notifications', 'pay-due:p1'), notification('pay-due:p1', { read: true, readAt: ISO, relatedId: null })))
  })

  test('notifications: nothing but read state and the link can be edited', async () => {
    await seed('alice', 'notifications', 'n1', notification('n1'))
    const db = as('alice')
    await assertFails(setDoc(ref(db, 'alice', 'notifications', 'n1'), notification('n1', { title: 'Tampered' })))
    await assertFails(setDoc(ref(db, 'alice', 'notifications', 'n1'), notification('n1', { kind: 'payment_paid' })))
    await assertFails(setDoc(ref(db, 'alice', 'notifications', 'n1'), notification('n1', { createdAt: '2020-01-01T00:00:00.000Z' })))
  })

  rejectsAll('notification create', (o) => notification('n1', o), 'alice', 'notifications', 'n1', {
    'unknown kind': { kind: 'spam' },
    'empty title': { title: '' },
    'read as text': { read: 'no' },
    'bad readAt': { readAt: 'now' },
    'unknown related type': { relatedType: 'account' },
    'extra field': { priority: 1 },
  })

  test('activity is append-only', async () => {
    const db = as('alice')
    await assertSucceeds(setDoc(ref(db, 'alice', 'activity', 'a1'), activity()))
    await assertFails(setDoc(ref(db, 'alice', 'activity', 'a1'), activity('a1', { message: 'Rewritten history' })))
    await assertSucceeds(deleteDoc(ref(db, 'alice', 'activity', 'a1')))
    await assertFails(setDoc(ref(db, 'alice', 'activity', 'a2'), activity('a2', { kind: 'made_up' })))
    await assertFails(setDoc(ref(db, 'alice', 'activity', 'a3'), activity('a3', { message: '' })))
  })
})

describe('profile and preferences', () => {
  test('a profile can be created for yourself, with your own email', async () => {
    await assertSucceeds(setDoc(ref(as('alice'), 'alice', 'profile', 'details'), profile('alice')))
  })

  test('a profile cannot claim another uid, another email, or another document id', async () => {
    const db = as('alice')
    await assertFails(setDoc(ref(db, 'alice', 'profile', 'details'), profile('alice', { uid: 'bob' })))
    await assertFails(setDoc(ref(db, 'alice', 'profile', 'details'), profile('alice', { email: 'someone@else.com' })))
    await assertFails(setDoc(ref(db, 'alice', 'profile', 'other'), profile('alice', { id: 'other' })))
    await assertFails(setDoc(ref(db, 'alice', 'profile', 'details'), profile('alice', { preferredCurrency: 'JPY' })))
    await assertFails(setDoc(ref(db, 'alice', 'profile', 'details'), profile('alice', { fullName: '' })))
    await assertFails(setDoc(ref(db, 'alice', 'profile', 'details'), profile('alice', { role: 'admin' })))
  })

  test('profile updates: editable fields only; identity fields and createdAt are fixed; it cannot be deleted', async () => {
    await seed('alice', 'profile', 'details', profile('alice'))
    const db = as('alice')
    await assertSucceeds(setDoc(ref(db, 'alice', 'profile', 'details'), profile('alice', { fullName: 'Asha R', preferredCurrency: 'USD', timeZone: 'America/New_York' })))
    await assertFails(setDoc(ref(db, 'alice', 'profile', 'details'), profile('alice', { createdAt: '2020-01-01T00:00:00.000Z' })))
    await assertFails(deleteDoc(ref(db, 'alice', 'profile', 'details')))
  })

  test('a profile with an optional photo is accepted', async () => {
    await assertSucceeds(setDoc(ref(as('alice'), 'alice', 'profile', 'details'), profile('alice', { photoURL: 'https://example.com/me.png' })))
    await assertFails(setDoc(ref(as('bob'), 'bob', 'profile', 'details'), profile('bob', { photoURL: 123 })))
  })

  test('preferences: only the "preferences" document with valid values', async () => {
    const db = as('alice')
    await assertSucceeds(setDoc(ref(db, 'alice', 'settings', 'preferences'), prefs()))
    await assertSucceeds(setDoc(ref(db, 'alice', 'settings', 'preferences'), prefs({ inAppNotifications: false, premiumReminderDays: 30 })))
    await assertFails(setDoc(ref(db, 'alice', 'settings', 'preferences'), prefs({ premiumReminderDays: 2 })))
    await assertFails(setDoc(ref(db, 'alice', 'settings', 'preferences'), prefs({ inAppNotifications: 'yes' })))
    await assertFails(setDoc(ref(db, 'alice', 'settings', 'preferences'), prefs({ theme: 'dark' })))
    await assertFails(setDoc(ref(db, 'alice', 'settings', 'other'), prefs({ id: 'other' })))
  })
})
