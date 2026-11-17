import type { NotificationCandidate, NotificationPreferences } from '@/types/notification'
import type { Policy, PolicyPayment } from '@/types/policy'
import type { Subscription, SubscriptionPayment } from '@/types/subscription'
import { daysBetweenISO, formatDisplayDate, todayISO } from './dates'
import { formatMoney } from './money'
import { getPolicyStatus } from './policy-rules'

export interface NotificationSource {
  subscriptions: Subscription[]
  subscriptionPayments: SubscriptionPayment[]
  policies: Policy[]
  policyPayments: PolicyPayment[]
}

/** Notification keys. Each identifies one reminder for one thing, so it is only ever created once. */
export const notificationKeys = {
  subscriptionDue: (paymentId: string) => `pay-due:${paymentId}`,
  premiumDue: (paymentId: string) => `prem-due:${paymentId}`,
  // Includes the expiry date so a renewed policy can be reminded again for its new term.
  policyExpiring: (policyId: string, expiryDate: string) => `pol-exp:${policyId}:${expiryDate}`,
  overdue: (paymentId: string) => `overdue:${paymentId}`,
  paid: (paymentId: string) => `paid:${paymentId}`,
}

/**
 * Every reminder that applies today, derived from the user's records. This is the full set of
 * "state-based" notifications: upcoming payments and premiums, expiring policies and overdue
 * payments. ("Marked as paid" is event-based and is created when the payment is recorded.)
 *
 * An unpaid payment is either upcoming (within its reminder window) or overdue (past due), never both.
 */
export function computeNotifications(
  source: NotificationSource,
  prefs: NotificationPreferences,
  today: string = todayISO(),
): NotificationCandidate[] {
  const out: NotificationCandidate[] = []
  const subsById = new Map(source.subscriptions.map((s) => [s.id, s]))
  const policiesById = new Map(source.policies.map((p) => [p.id, p]))

  for (const payment of source.subscriptionPayments) {
    const sub = subsById.get(payment.subscriptionId)
    if (payment.status !== 'upcoming' || !sub) continue
    const money = formatMoney(payment.amountMinor, payment.currency)
    const date = formatDisplayDate(payment.dueDate)
    if (payment.dueDate < today) {
      out.push({
        key: notificationKeys.overdue(payment.id),
        kind: 'payment_overdue',
        title: `Overdue payment: ${sub.name}`,
        description: `${money} was due on ${date}. Mark it as paid or skipped.`,
        relatedType: 'subscription',
        relatedId: sub.id,
      })
    } else if (daysBetweenISO(today, payment.dueDate) <= sub.reminderDays) {
      out.push({
        key: notificationKeys.subscriptionDue(payment.id),
        kind: 'subscription_due',
        title: `Upcoming payment: ${sub.name}`,
        description: `${money} is due on ${date}.`,
        relatedType: 'subscription',
        relatedId: sub.id,
      })
    }
  }

  for (const payment of source.policyPayments) {
    const policy = policiesById.get(payment.policyId)
    if (payment.status !== 'upcoming' || !policy) continue
    const money = formatMoney(payment.amountMinor, payment.currency)
    const date = formatDisplayDate(payment.dueDate)
    if (payment.dueDate < today) {
      out.push({
        key: notificationKeys.overdue(payment.id),
        kind: 'payment_overdue',
        title: `Overdue premium: ${policy.policyName}`,
        description: `${money} was due on ${date}. Mark it as paid or skipped.`,
        relatedType: 'policy',
        relatedId: policy.id,
      })
    } else if (daysBetweenISO(today, payment.dueDate) <= prefs.premiumReminderDays) {
      out.push({
        key: notificationKeys.premiumDue(payment.id),
        kind: 'premium_due',
        title: `Upcoming premium: ${policy.policyName}`,
        description: `${money} premium is due on ${date}.`,
        relatedType: 'policy',
        relatedId: policy.id,
      })
    }
  }

  for (const policy of source.policies) {
    if (getPolicyStatus(policy, today) !== 'expiring_soon') continue
    out.push({
      key: notificationKeys.policyExpiring(policy.id, policy.expiryDate),
      kind: 'policy_expiring',
      title: `Policy expiring soon: ${policy.policyName}`,
      description: `Expires on ${formatDisplayDate(policy.expiryDate)}. Renew it to stay covered.`,
      relatedType: 'policy',
      relatedId: policy.id,
    })
  }

  return out
}

/** Kinds whose notifications are derived from current state (and so can become outdated). */
export const STATE_BASED_KINDS = new Set(['subscription_due', 'premium_due', 'policy_expiring', 'payment_overdue'])
