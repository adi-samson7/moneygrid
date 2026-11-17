import type { Subscription } from '@/types/subscription'
import { annualEquivalent, monthlyEquivalent } from './billing'
import type { CurrencyTotals } from './money'

/** Only active subscriptions count as recurring spend; paused, cancelled and expired ones do not. */
export const activeSubscriptions = (subs: Subscription[]): Subscription[] =>
  subs.filter((s) => s.status === 'active')

function sumByCurrency(subs: Subscription[], toValue: (s: Subscription) => number): CurrencyTotals {
  const totals: CurrencyTotals = {}
  for (const sub of activeSubscriptions(subs)) {
    totals[sub.currency] = (totals[sub.currency] ?? 0) + toValue(sub)
  }
  return totals
}

/** Sum of payment amounts per currency (minor units). */
export function paymentTotals(payments: { amountMinor: number; currency: string }[]): CurrencyTotals {
  const totals: CurrencyTotals = {}
  for (const payment of payments) {
    totals[payment.currency] = (totals[payment.currency] ?? 0) + payment.amountMinor
  }
  return totals
}

export const monthlyTotals =(subs: Subscription[]): CurrencyTotals =>
  sumByCurrency(subs, (s) => monthlyEquivalent(s.amountMinor, s.billingCycle))

export const annualTotals = (subs: Subscription[]): CurrencyTotals =>
  sumByCurrency(subs, (s) => annualEquivalent(s.amountMinor, s.billingCycle))
