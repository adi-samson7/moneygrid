import { activityOp } from '@/services/activity.service'
import { COLLECTIONS, PreconditionFailedError, db, deleteOp, setOp, type WriteOp } from '@/services/db'
import { paidNotificationOp } from '@/services/notification.service'
import { getPreferences } from '@/services/preferences.service'
import type { PaymentResolution, Subscription, SubscriptionPayment } from '@/types/subscription'
import { advanceOneCycle } from '@/utils/billing'
import { todayISO } from '@/utils/dates'

export async function listPayments(uid: string): Promise<SubscriptionPayment[]> {
  return db.list<SubscriptionPayment>(uid, COLLECTIONS.subscriptionPayments)
}

/** The open ("upcoming") payment of a subscription, if it has one. */
export async function findOpenPayment(uid: string, subscriptionId: string): Promise<SubscriptionPayment | null> {
  const payments = await db.where<SubscriptionPayment>(uid, COLLECTIONS.subscriptionPayments, 'subscriptionId', subscriptionId)
  return payments.find((p) => p.status === 'upcoming') ?? null
}

/**
 * Writes that keep exactly one open payment per active subscription, matching its next payment
 * date and amount. An inactive subscription has none. Paid and skipped payments are history and are
 * never touched.
 */
export function openPaymentOps(existingOpen: SubscriptionPayment | null, sub: Subscription): WriteOp[] {
  if (sub.status !== 'active') return existingOpen ? [deleteOp(COLLECTIONS.subscriptionPayments, existingOpen.id)] : []

  const now = new Date().toISOString()
  const open: SubscriptionPayment = existingOpen
    ? { ...existingOpen, amountMinor: sub.amountMinor, currency: sub.currency, dueDate: sub.nextPaymentDate, updatedAt: now }
    : {
        id: crypto.randomUUID(),
        subscriptionId: sub.id,
        amountMinor: sub.amountMinor,
        currency: sub.currency,
        dueDate: sub.nextPaymentDate,
        paymentDate: null,
        status: 'upcoming',
        notes: '',
        createdAt: now,
        updatedAt: now,
      }
  return [setOp(COLLECTIONS.subscriptionPayments, open)]
}

/**
 * Records a payment as paid or skipped, then moves the subscription to its next cycle and opens
 * the next payment. Only an open payment can be resolved: the commit re-checks that at write time,
 * so repeating the call (a double click, a second tab) cannot double-count.
 */
export async function resolvePayment(uid: string, paymentId: string, resolution: PaymentResolution): Promise<void> {
  const payment = await db.get<SubscriptionPayment>(uid, COLLECTIONS.subscriptionPayments, paymentId)
  if (!payment) throw new Error('Payment not found.')
  if (payment.status !== 'upcoming') throw new Error('This payment has already been recorded.')

  const sub = await db.get<Subscription>(uid, COLLECTIONS.subscriptions, payment.subscriptionId)
  const now = new Date().toISOString()
  const paymentDate = resolution.status === 'paid' ? (resolution.paymentDate ?? todayISO()) : null
  const resolved: SubscriptionPayment = {
    ...payment,
    status: resolution.status,
    paymentDate,
    notes: resolution.notes?.trim() ?? payment.notes,
    updatedAt: now,
  }

  const ops: WriteOp[] = [setOp(COLLECTIONS.subscriptionPayments, resolved)]
  if (sub && sub.status === 'active') {
    const advanced: Subscription = {
      ...sub,
      nextPaymentDate: advanceOneCycle(payment.dueDate, sub.billingCycle, sub.startDate),
      updatedAt: now,
    }
    ops.push(setOp(COLLECTIONS.subscriptions, advanced), ...openPaymentOps(null, advanced))
  }
  if (resolved.status === 'paid' && (await getPreferences(uid)).inAppNotifications) {
    ops.push(
      paidNotificationOp({
        paymentId,
        ownerType: 'subscription',
        ownerId: sub?.id ?? null,
        ownerName: sub?.name ?? 'subscription',
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paymentDate: paymentDate ?? todayISO(),
      }),
    )
  }
  ops.push(
    activityOp({
      kind: 'subscription_payment',
      message: `${resolution.status === 'paid' ? 'Marked as paid' : 'Skipped'}: ${sub?.name ?? 'subscription'} payment`,
      relatedType: 'subscription',
      relatedId: sub?.id ?? null,
    }),
  )

  try {
    await db.commit(uid, ops, [{ collection: COLLECTIONS.subscriptionPayments, id: paymentId, field: 'status', equals: 'upcoming' }])
  } catch (error) {
    if (error instanceof PreconditionFailedError) throw new Error('This payment has already been recorded.')
    throw error
  }
}
