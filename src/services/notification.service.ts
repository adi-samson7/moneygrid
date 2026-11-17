import { COLLECTIONS, db, deleteOp, setOp, type WriteOp } from '@/services/db'
import type { AppNotification, NotificationPreferences } from '@/types/notification'
import { formatDisplayDate, todayISO } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import {
  STATE_BASED_KINDS,
  computeNotifications,
  notificationKeys,
  type NotificationSource,
} from '@/utils/notification-rules'

/** Upper bound on stored notifications; the oldest finished ones are dropped past this. */
const MAX_STORED = 200

/** Newest first. */
export async function listNotifications(uid: string): Promise<AppNotification[]> {
  const all = await db.list<AppNotification>(uid, COLLECTIONS.notifications)
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function markNotificationRead(uid: string, id: string): Promise<void> {
  const existing = await db.get<AppNotification>(uid, COLLECTIONS.notifications, id)
  if (!existing || existing.read) return
  await db.commit(uid, [setOp(COLLECTIONS.notifications, { ...existing, read: true, readAt: new Date().toISOString() })])
}

export async function markAllNotificationsRead(uid: string): Promise<void> {
  const unread = await db.where<AppNotification>(uid, COLLECTIONS.notifications, 'read', false)
  if (unread.length === 0) return
  const now = new Date().toISOString()
  await db.commit(uid, unread.map((n) => setOp(COLLECTIONS.notifications, { ...n, read: true, readAt: now })))
}

/**
 * Brings stored notifications in line with the user's records. Safe to run any number of times:
 *  - A reminder that applies today is created once. Its id is its key, so it is never duplicated,
 *    and one the user has read or that was auto-closed is not created again.
 *  - A state-based reminder that no longer applies (payment paid, policy renewed or cancelled,
 *    payment now overdue instead of upcoming) is marked read, so it stops showing as unread.
 *  - A notification whose subscription or policy was deleted loses its link to it.
 * Does nothing while in-app notifications are turned off. Returns whether anything changed.
 *
 * Pass the notifications you already have as `existing` to avoid reading them again. Without it they
 * are read from storage. Writing a notification twice with the same id is harmless, so concurrent
 * runs cannot create duplicates.
 */
export async function syncNotifications(
  uid: string,
  source: NotificationSource,
  prefs: NotificationPreferences,
  today: string = todayISO(),
  existing?: AppNotification[],
): Promise<boolean> {
  if (!prefs.inAppNotifications) return false

  const current = existing ?? (await db.list<AppNotification>(uid, COLLECTIONS.notifications))
  const now = new Date().toISOString()
  const candidates = computeNotifications(source, prefs, today)
  const activeKeys = new Set(candidates.map((c) => c.key))
  const knownIds = new Set(current.map((n) => n.id))
  const recordIds = new Set([...source.subscriptions.map((s) => s.id), ...source.policies.map((p) => p.id)])

  const ops: WriteOp[] = []
  const survivors: AppNotification[] = []

  for (const n of current) {
    let next = n
    // The record was deleted: stop linking to it.
    if (next.relatedId && !recordIds.has(next.relatedId)) next = { ...next, relatedId: null }
    // Close reminders that no longer apply.
    if (!next.read && STATE_BASED_KINDS.has(next.kind) && !activeKeys.has(next.id)) {
      next = { ...next, read: true, readAt: now }
    }
    if (next !== n) ops.push(setOp(COLLECTIONS.notifications, next))
    survivors.push(next)
  }

  // Create the ones that are new.
  for (const c of candidates) {
    if (knownIds.has(c.key)) continue
    const created: AppNotification = {
      id: c.key,
      kind: c.kind,
      title: c.title,
      description: c.description,
      relatedType: c.relatedType,
      relatedId: c.relatedId,
      createdAt: now,
      read: false,
      readAt: null,
    }
    ops.push(setOp(COLLECTIONS.notifications, created))
    survivors.push(created)
  }

  // Past the limit, drop the oldest notifications that are finished (read and no longer applicable).
  if (survivors.length > MAX_STORED) {
    const removable = survivors
      .filter((n) => n.read && !activeKeys.has(n.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, survivors.length - MAX_STORED)
    const drop = new Set(removable.map((n) => n.id))
    for (const id of drop) ops.push(deleteOp(COLLECTIONS.notifications, id))
    // A dropped notification needs no earlier write.
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i]
      if (op.type === 'set' && drop.has(op.id)) ops.splice(i, 1)
    }
  }

  if (ops.length === 0) return false
  await db.commit(uid, ops)
  return true
}

interface PaidNotificationInput {
  paymentId: string
  ownerType: 'subscription' | 'policy'
  ownerId: string | null
  ownerName: string
  amountMinor: number
  currency: string
  paymentDate: string
}

/**
 * The "marked as paid" confirmation, as a write to include in the commit that records the payment.
 * Keyed by the payment, so it can only exist once.
 */
export function paidNotificationOp(input: PaidNotificationInput): WriteOp {
  const isPolicy = input.ownerType === 'policy'
  const entry: AppNotification = {
    id: notificationKeys.paid(input.paymentId),
    kind: 'payment_paid',
    title: `${isPolicy ? 'Premium' : 'Payment'} marked as paid: ${input.ownerName}`,
    description: `${formatMoney(input.amountMinor, input.currency)} paid on ${formatDisplayDate(input.paymentDate)}.`,
    relatedType: input.ownerType,
    relatedId: input.ownerId,
    createdAt: new Date().toISOString(),
    read: false,
    readAt: null,
  }
  return setOp(COLLECTIONS.notifications, entry)
}
