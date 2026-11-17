import type { Policy } from '@/types/policy'
import { todayISO } from './dates'
import type { CurrencyTotals } from './money'
import { annualPremium, getPolicyStatus, isInForce } from './policy-rules'

/** Policies in force: active or expiring soon. Expired and cancelled policies are excluded. */
export const policiesInForce = (policies: Policy[], today: string = todayISO()): Policy[] =>
  policies.filter((p) => isInForce(getPolicyStatus(p, today)))

function sumByCurrency(policies: Policy[], toValue: (p: Policy) => number): CurrencyTotals {
  const totals: CurrencyTotals = {}
  for (const policy of policies) totals[policy.currency] = (totals[policy.currency] ?? 0) + toValue(policy)
  return totals
}

/** Premiums per year, by currency. Coverage amounts are never included here. */
export const annualPremiumTotals = (policies: Policy[], today?: string): CurrencyTotals =>
  sumByCurrency(policiesInForce(policies, today), annualPremium)

/** Total insured coverage, by currency. Kept separate from any spending figure. */
export const coverageTotals = (policies: Policy[], today?: string): CurrencyTotals =>
  sumByCurrency(policiesInForce(policies, today), (p) => p.coverageAmountMinor)
