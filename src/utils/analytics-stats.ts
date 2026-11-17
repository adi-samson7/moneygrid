import { POLICY_TYPES, POLICY_TYPE_LABELS, type Policy, type PolicyPayment, type PolicyType } from '@/types/policy'
import type { BillingCycle, Subscription } from '@/types/subscription'
import { monthlyEquivalent } from './billing'
import { addDaysISO, todayISO } from './dates'
import type { CurrencyTotals } from './money'
import { annualPremium, getPolicyStatus } from './policy-rules'
import { policiesInForce } from './policy-stats'
import { activeSubscriptions } from './subscription-stats'

/** Currencies the user actually has records in, sorted. Analytics shows one currency at a time. */
export function availableCurrencies(subs: Subscription[], policies: Policy[]): string[] {
  return [...new Set([...subs.map((s) => s.currency), ...policies.map((p) => p.currency)])].sort()
}

/** The amount for one currency out of per-currency totals, in minor units. */
export const amountIn = (totals: CurrencyTotals, currency: string): number => totals[currency] ?? 0

export interface PriceBar {
  id: string
  name: string
  cycle: BillingCycle
  /** Cost per month in major units, so subscriptions with different cycles can be compared. */
  monthly: number
}

/** Active subscriptions in one currency, most expensive per month first. */
export function priceComparison(subs: Subscription[], currency: string): PriceBar[] {
  return activeSubscriptions(subs)
    .filter((s) => s.currency === currency)
    .map((s) => ({
      id: s.id,
      name: s.name,
      cycle: s.billingCycle,
      monthly: monthlyEquivalent(s.amountMinor, s.billingCycle) / 100,
    }))
    .sort((a, b) => b.monthly - a.monthly || a.name.localeCompare(b.name))
}

export interface PolicyTypeRow {
  type: PolicyType
  label: string
  count: number
  /** Premiums per year in major units. */
  annualPremium: number
  /** Insured amount in major units. Kept separate from spending. */
  coverage: number
}

/** In-force policies of one currency grouped by type. Types with no policies are left out. */
export function policySummaryByType(policies: Policy[], currency: string, today: string = todayISO()): PolicyTypeRow[] {
  const rows = new Map<PolicyType, PolicyTypeRow>()
  for (const policy of policiesInForce(policies, today)) {
    if (policy.currency !== currency) continue
    const row = rows.get(policy.policyType) ?? {
      type: policy.policyType,
      label: POLICY_TYPE_LABELS[policy.policyType],
      count: 0,
      annualPremium: 0,
      coverage: 0,
    }
    row.count += 1
    row.annualPremium += annualPremium(policy) / 100
    row.coverage += policy.coverageAmountMinor / 100
    rows.set(policy.policyType, row)
  }
  return POLICY_TYPES.flatMap((type) => rows.get(type) ?? [])
}

/** Premiums still to pay within the next `days` days (overdue ones are not included), in one currency. */
export function upcomingPremiums(
  policyPayments: PolicyPayment[],
  policies: Policy[],
  currency: string,
  days: number,
  today: string = todayISO(),
): { count: number; totalMinor: number } {
  const limit = addDaysISO(today, days)
  const policyIds = new Set(policies.map((p) => p.id))
  let count = 0
  let totalMinor = 0
  for (const payment of policyPayments) {
    if (payment.status !== 'upcoming' || payment.currency !== currency || !policyIds.has(payment.policyId)) continue
    if (payment.dueDate < today || payment.dueDate > limit) continue
    count += 1
    totalMinor += payment.amountMinor
  }
  return { count, totalMinor }
}

/** Policies close to expiry that have not been renewed, soonest first. */
export function expiringPolicies(policies: Policy[], today: string = todayISO()): Policy[] {
  return policies
    .filter((p) => getPolicyStatus(p, today) === 'expiring_soon')
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
}
