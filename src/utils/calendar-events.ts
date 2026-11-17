import type { Policy, PolicyPayment } from '@/types/policy'
import type { Subscription, SubscriptionPayment } from '@/types/subscription'
import { advanceOneCycle } from './billing'
import { todayISO } from './dates'
import { formatMoney } from './money'
import { effectivePaymentStatus } from './payments'
import { advancePremiumWithinTerm, getPolicyStatus, isInForce } from './policy-rules'

export type CalendarEventKind = 'subscription_payment' | 'policy_premium' | 'policy_expiry'
export type CalendarOwnerType = 'subscription' | 'policy'

/** Blue: subscription payments. Green: policy premiums and renewals. Red: overdue. Grey: cancelled or inactive. */
export type CalendarColor = 'subscription' | 'policy' | 'overdue' | 'inactive'

/** What the event represents. "projected" is a future occurrence that has no payment record yet. */
export type CalendarEventState =
  | 'upcoming'
  | 'overdue'
  | 'paid'
  | 'skipped'
  | 'projected'
  | 'expires'
  | 'expired'
  | 'inactive'

export interface CalendarEventData {
  id: string
  kind: CalendarEventKind
  ownerType: CalendarOwnerType
  ownerId: string
  /** Subscription or policy name. */
  name: string
  /** Short text for the calendar cell. Starts with a symbol so state is not conveyed by color alone. */
  title: string
  /** "YYYY-MM-DD" */
  date: string
  amountMinor: number | null
  currency: string | null
  state: CalendarEventState
  color: CalendarColor
}

export interface CalendarSource {
  subscriptions: Subscription[]
  subscriptionPayments: SubscriptionPayment[]
  policies: Policy[]
  policyPayments: PolicyPayment[]
}

export type ModuleFilter = 'all' | 'subscriptions' | 'policies'

/** Safety limit on projected occurrences per record (a weekly subscription over several years). */
const MAX_PROJECTIONS = 400

const STATE_PREFIX: Record<CalendarEventState, string> = {
  upcoming: '',
  overdue: '! ',
  paid: '✓ ',
  skipped: '– ',
  projected: '',
  expires: '',
  expired: '',
  inactive: '',
}

/** Overdue is always red so it cannot be missed; skipped payments and inactive records are grey. */
function paymentColor(state: CalendarEventState, recordActive: boolean, module: 'subscription' | 'policy'): CalendarColor {
  if (state === 'overdue') return 'overdue'
  if (state === 'skipped' || !recordActive) return 'inactive'
  return module
}

function paymentTitle(name: string, amountMinor: number, currency: string, state: CalendarEventState): string {
  return `${STATE_PREFIX[state]}${name} · ${formatMoney(amountMinor, currency)}`
}

/**
 * Everything that belongs on the calendar between `rangeStart` (inclusive) and `rangeEnd` (exclusive,
 * as FullCalendar reports it): recorded payments, projected future payments of active records, and
 * policy expiry dates.
 */
export function buildCalendarEvents(
  source: CalendarSource,
  rangeStart: string,
  rangeEnd: string,
  today: string = todayISO(),
): CalendarEventData[] {
  const events: CalendarEventData[] = []
  const inRange = (date: string) => date >= rangeStart && date < rangeEnd

  // ---- Subscriptions ----
  const subsById = new Map(source.subscriptions.map((s) => [s.id, s]))
  for (const payment of source.subscriptionPayments) {
    const sub = subsById.get(payment.subscriptionId)
    if (!sub || !inRange(payment.dueDate)) continue
    const state: CalendarEventState = effectivePaymentStatus(payment, today)
    events.push({
      id: `sp-${payment.id}`,
      kind: 'subscription_payment',
      ownerType: 'subscription',
      ownerId: sub.id,
      name: sub.name,
      title: paymentTitle(sub.name, payment.amountMinor, payment.currency, state),
      date: payment.dueDate,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      state,
      color: paymentColor(state, sub.status === 'active', 'subscription'),
    })
  }
  for (const sub of source.subscriptions) {
    if (sub.status !== 'active') continue
    // Future payments after the open one. Start at the next payment date so the day-of-month anchor holds.
    let date = advanceOneCycle(sub.nextPaymentDate, sub.billingCycle, sub.startDate)
    for (let i = 0; i < MAX_PROJECTIONS && date < rangeEnd; i++) {
      if (date >= rangeStart) {
        events.push({
          id: `sj-${sub.id}-${date}`,
          kind: 'subscription_payment',
          ownerType: 'subscription',
          ownerId: sub.id,
          name: sub.name,
          title: paymentTitle(sub.name, sub.amountMinor, sub.currency, 'projected'),
          date,
          amountMinor: sub.amountMinor,
          currency: sub.currency,
          state: 'projected',
          color: 'subscription',
        })
      }
      date = advanceOneCycle(date, sub.billingCycle, sub.startDate)
    }
  }

  // ---- Policies ----
  const policiesById = new Map(source.policies.map((p) => [p.id, p]))
  for (const payment of source.policyPayments) {
    const policy = policiesById.get(payment.policyId)
    if (!policy || !inRange(payment.dueDate)) continue
    const state: CalendarEventState = effectivePaymentStatus(payment, today)
    events.push({
      id: `pp-${payment.id}`,
      kind: 'policy_premium',
      ownerType: 'policy',
      ownerId: policy.id,
      name: policy.policyName,
      title: paymentTitle(policy.policyName, payment.amountMinor, payment.currency, state),
      date: payment.dueDate,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      state,
      color: paymentColor(state, isInForce(getPolicyStatus(policy, today)), 'policy'),
    })
  }
  for (const policy of source.policies) {
    if (policy.status !== 'active' || policy.nextPremiumDate === null) continue
    let date = advancePremiumWithinTerm(policy.nextPremiumDate, policy.billingCycle, policy.startDate, policy.expiryDate)
    for (let i = 0; i < MAX_PROJECTIONS && date !== null && date < rangeEnd; i++) {
      if (date >= rangeStart) {
        events.push({
          id: `pj-${policy.id}-${date}`,
          kind: 'policy_premium',
          ownerType: 'policy',
          ownerId: policy.id,
          name: policy.policyName,
          title: paymentTitle(policy.policyName, policy.premiumAmountMinor, policy.currency, 'projected'),
          date,
          amountMinor: policy.premiumAmountMinor,
          currency: policy.currency,
          state: 'projected',
          color: 'policy',
        })
      }
      date = advancePremiumWithinTerm(date, policy.billingCycle, policy.startDate, policy.expiryDate)
    }
  }
  for (const policy of source.policies) {
    if (!inRange(policy.expiryDate)) continue
    const status = getPolicyStatus(policy, today)
    const live = isInForce(status)
    events.push({
      id: `pe-${policy.id}`,
      kind: 'policy_expiry',
      ownerType: 'policy',
      ownerId: policy.id,
      name: policy.policyName,
      title: `${policy.policyName} ${live ? 'expires' : status === 'cancelled' ? 'would expire' : 'expired'}`,
      date: policy.expiryDate,
      amountMinor: null,
      currency: null,
      state: live ? 'expires' : status === 'cancelled' ? 'inactive' : 'expired',
      color: live ? 'policy' : 'inactive',
    })
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

export function filterByModule(events: CalendarEventData[], filter: ModuleFilter): CalendarEventData[] {
  if (filter === 'all') return events
  const type: CalendarOwnerType = filter === 'subscriptions' ? 'subscription' : 'policy'
  return events.filter((e) => e.ownerType === type)
}

/** Hex colors with enough contrast for white text. */
export const CALENDAR_COLORS: Record<CalendarColor, string> = {
  subscription: '#2563eb',
  policy: '#047857',
  overdue: '#dc2626',
  inactive: '#6b7280',
}

export const CALENDAR_STATE_LABELS: Record<CalendarEventState, string> = {
  upcoming: 'Upcoming',
  overdue: 'Overdue',
  paid: 'Paid',
  skipped: 'Skipped',
  projected: 'Expected (not yet due)',
  expires: 'Policy expires',
  expired: 'Policy expired',
  inactive: 'Inactive',
}
