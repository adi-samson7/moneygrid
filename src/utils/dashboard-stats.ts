import { addMonths, format, parseISO, startOfMonth } from 'date-fns'
import type { PaymentStatus } from '@/types/payment'
import { POLICY_TYPE_LABELS, type Policy, type PolicyPayment, type PolicyType } from '@/types/policy'
import type { Subscription, SubscriptionPayment } from '@/types/subscription'
import { monthlyEquivalent } from './billing'
import { addDaysISO, todayISO } from './dates'
import type { CurrencyTotals } from './money'
import { effectivePaymentStatus } from './payments'
import { annualPremiumTotals, policiesInForce } from './policy-stats'
import { monthlyPremium } from './policy-rules'
import { activeSubscriptions, annualTotals } from './subscription-stats'

export type RecordKind = 'subscription' | 'policy'

/** One upcoming subscription payment or policy premium, in a common shape for the dashboard. */
export interface UpcomingItem {
  id: string
  kind: RecordKind
  /** Id of the subscription or policy, for linking. */
  ownerId: string
  name: string
  category: string
  amountMinor: number
  currency: string
  dueDate: string
  status: PaymentStatus
}

/** Policy types shown as spending categories. "Other" is renamed so it cannot be confused with the subscription category. */
export const policyCategoryLabel = (type: PolicyType): string => (type === 'other' ? 'Other insurance' : POLICY_TYPE_LABELS[type])

/** Open (unpaid, unskipped) subscription payments and policy premiums, soonest first. Overdue ones come first. */
export function buildUpcomingItems(
  subs: Subscription[],
  subPayments: SubscriptionPayment[],
  policies: Policy[],
  policyPayments: PolicyPayment[],
  today: string = todayISO(),
): UpcomingItem[] {
  const subsById = new Map(subs.map((s) => [s.id, s]))
  const policiesById = new Map(policies.map((p) => [p.id, p]))
  const items: UpcomingItem[] = []

  for (const payment of subPayments) {
    const sub = subsById.get(payment.subscriptionId)
    if (payment.status !== 'upcoming' || !sub) continue
    items.push({
      id: payment.id,
      kind: 'subscription',
      ownerId: sub.id,
      name: sub.name,
      category: sub.category,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      dueDate: payment.dueDate,
      status: effectivePaymentStatus(payment, today),
    })
  }
  for (const payment of policyPayments) {
    const policy = policiesById.get(payment.policyId)
    if (payment.status !== 'upcoming' || !policy) continue
    items.push({
      id: payment.id,
      kind: 'policy',
      ownerId: policy.id,
      name: policy.policyName,
      category: policyCategoryLabel(policy.policyType),
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      dueDate: payment.dueDate,
      status: effectivePaymentStatus(payment, today),
    })
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

/** Items due from today through `days` days ahead. Overdue items are not included. */
export function dueWithin(items: UpcomingItem[], days: number, today: string = todayISO()): UpcomingItem[] {
  const limit = addDaysISO(today, days)
  return items.filter((i) => i.dueDate >= today && i.dueDate <= limit)
}

export interface MonthPoint {
  /** "YYYY-MM" */
  key: string
  label: string
  /** Amounts in major units (e.g. rupees), for charting. */
  subscriptions: number
  policies: number
}

/**
 * Money actually paid in each of the last `months` months (including this one), per module.
 * Only payments marked as paid count. Charts cannot mix currencies, so only `currency` is shown and
 * the number of paid payments in other currencies is returned as `excluded`.
 */
export function monthlyExpenditure(
  subPayments: SubscriptionPayment[],
  policyPayments: PolicyPayment[],
  currency: string,
  months = 6,
  today: string = todayISO(),
): { data: MonthPoint[]; excluded: number } {
  const first = startOfMonth(addMonths(parseISO(today), -(months - 1)))
  const data: MonthPoint[] = Array.from({ length: months }, (_, i) => {
    const date = addMonths(first, i)
    return { key: format(date, 'yyyy-MM'), label: format(date, 'MMM yy'), subscriptions: 0, policies: 0 }
  })
  const byKey = new Map(data.map((point) => [point.key, point]))
  let excluded = 0

  const add = (payment: { status: PaymentStatus; paymentDate: string | null; dueDate: string; currency: string; amountMinor: number }, field: 'subscriptions' | 'policies') => {
    if (payment.status !== 'paid') return
    const point = byKey.get((payment.paymentDate ?? payment.dueDate).slice(0, 7))
    if (!point) return
    if (payment.currency !== currency) {
      excluded += 1
      return
    }
    point[field] += payment.amountMinor / 100
  }
  subPayments.forEach((p) => add(p, 'subscriptions'))
  policyPayments.forEach((p) => add(p, 'policies'))
  return { data, excluded }
}

export interface CategorySlice {
  name: string
  kind: RecordKind
  /** Monthly cost in major units. */
  value: number
}

/**
 * Where recurring money goes each month: active subscriptions by category and in-force policy
 * premiums by type, normalized to a monthly amount, in one currency. Coverage is never included.
 */
export function categorySpending(
  subs: Subscription[],
  policies: Policy[],
  currency: string,
  today: string = todayISO(),
): { data: CategorySlice[]; excluded: number } {
  const slices = new Map<string, CategorySlice>()
  let excluded = 0
  const add = (name: string, kind: RecordKind, minor: number, itemCurrency: string) => {
    if (itemCurrency !== currency) {
      excluded += 1
      return
    }
    const key = `${kind}:${name}`
    const slice = slices.get(key) ?? { name, kind, value: 0 }
    slice.value += minor / 100
    slices.set(key, slice)
  }
  for (const sub of activeSubscriptions(subs)) {
    add(sub.category, 'subscription', monthlyEquivalent(sub.amountMinor, sub.billingCycle), sub.currency)
  }
  for (const policy of policiesInForce(policies, today)) {
    add(policyCategoryLabel(policy.policyType), 'policy', monthlyPremium(policy), policy.currency)
  }
  return { data: [...slices.values()].sort((a, b) => b.value - a.value), excluded }
}

export interface AnnualSummary {
  subscriptions: CurrencyTotals
  policies: CurrencyTotals
  /** Subscriptions plus policy premiums. Coverage amounts are not part of this. */
  combined: CurrencyTotals
}

export function annualSummary(subs: Subscription[], policies: Policy[], today: string = todayISO()): AnnualSummary {
  const subscriptionTotals = annualTotals(subs)
  const policyTotals = annualPremiumTotals(policies, today)
  const combined: CurrencyTotals = { ...subscriptionTotals }
  for (const [currency, minor] of Object.entries(policyTotals)) combined[currency] = (combined[currency] ?? 0) + minor
  return { subscriptions: subscriptionTotals, policies: policyTotals, combined }
}
