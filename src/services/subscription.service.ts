import { activityOp } from '@/services/activity.service'
import { COLLECTIONS, db, deleteOp, setOp, type WriteOp } from '@/services/db'
import { findOpenPayment, openPaymentOps } from '@/services/payment.service'
import type {
  Subscription,
  SubscriptionInput,
  SubscriptionPayment,
  SubscriptionStatus,
  SubscriptionUpdate,
} from '@/types/subscription'
import { firstOccurrenceOnOrAfter, suggestNextPayment } from '@/utils/billing'
import { todayISO } from '@/utils/dates'

const STATUS_VERBS: Record<SubscriptionStatus, string> = {
  active: 'Resumed',
  paused: 'Paused',
  cancelled: 'Cancelled',
  expired: 'Marked as expired:',
}

function resolveNextPaymentDate(input: SubscriptionInput): string {
  return input.nextPaymentDate || suggestNextPayment(input.startDate, input.billingCycle, todayISO())
}

/** When a subscription becomes active again, skip any dates missed while it was inactive. */
function rollForwardIfStale(sub: Subscription): Subscription {
  if (sub.nextPaymentDate >= todayISO()) return sub
  return { ...sub, nextPaymentDate: firstOccurrenceOnOrAfter(sub.startDate, sub.billingCycle, todayISO()) }
}

async function requireSubscription(uid: string, id: string): Promise<Subscription> {
  const sub = await db.get<Subscription>(uid, COLLECTIONS.subscriptions, id)
  if (!sub) throw new Error('Subscription not found.')
  return sub
}

export async function listSubscriptions(uid: string): Promise<Subscription[]> {
  return db.list<Subscription>(uid, COLLECTIONS.subscriptions)
}

export async function createSubscription(uid: string, input: SubscriptionInput): Promise<Subscription> {
  const now = new Date().toISOString()
  const sub: Subscription = {
    ...input,
    id: crypto.randomUUID(),
    nextPaymentDate: resolveNextPaymentDate(input),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  // The subscription, its open payment and the activity entry are saved together or not at all.
  await db.commit(uid, [
    setOp(COLLECTIONS.subscriptions, sub),
    ...openPaymentOps(null, sub),
    activityOp({ kind: 'subscription_added', message: `Added subscription ${sub.name}`, relatedType: 'subscription', relatedId: sub.id }),
  ])
  return sub
}

export async function updateSubscription(uid: string, id: string, update: SubscriptionUpdate): Promise<Subscription> {
  const existing = await requireSubscription(uid, id)

  let updated: Subscription = {
    ...existing,
    ...update,
    nextPaymentDate: resolveNextPaymentDate(update),
    updatedAt: new Date().toISOString(),
  }
  if (updated.status === 'active' && existing.status !== 'active' && !update.nextPaymentDate) {
    updated = rollForwardIfStale(updated)
  }
  await db.commit(uid, [
    setOp(COLLECTIONS.subscriptions, updated),
    ...openPaymentOps(await findOpenPayment(uid, id), updated),
    activityOp({ kind: 'subscription_updated', message: `Updated subscription ${updated.name}`, relatedType: 'subscription', relatedId: id }),
  ])
  return updated
}

/** Pause, resume, cancel or expire. History is kept; only the open payment is added or removed. */
export async function setSubscriptionStatus(uid: string, id: string, status: SubscriptionStatus): Promise<Subscription> {
  const existing = await requireSubscription(uid, id)

  let updated: Subscription = { ...existing, status, updatedAt: new Date().toISOString() }
  if (status === 'active' && existing.status !== 'active') updated = rollForwardIfStale(updated)

  const ops = [setOp(COLLECTIONS.subscriptions, updated), ...openPaymentOps(await findOpenPayment(uid, id), updated)]
  if (status !== existing.status) {
    ops.push(activityOp({ kind: 'subscription_status', message: `${STATUS_VERBS[status]} ${updated.name}`, relatedType: 'subscription', relatedId: id }))
  }
  await db.commit(uid, ops)
  return updated
}

/** Deleting removes the subscription and its payment history. Cancelling keeps the history instead. */
export async function deleteSubscription(uid: string, id: string): Promise<void> {
  const existing = await db.get<Subscription>(uid, COLLECTIONS.subscriptions, id)
  const payments = await db.where<SubscriptionPayment>(uid, COLLECTIONS.subscriptionPayments, 'subscriptionId', id)
  const ops: WriteOp[] = [...payments.map((p) => deleteOp(COLLECTIONS.subscriptionPayments, p.id)), deleteOp(COLLECTIONS.subscriptions, id)]
  if (existing) {
    ops.push(activityOp({ kind: 'subscription_deleted', message: `Deleted subscription ${existing.name}`, relatedType: 'subscription', relatedId: null }))
  }
  await db.commit(uid, ops)
}
