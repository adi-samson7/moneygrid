import type { Policy, PolicyStatus } from '@/types/policy'
import type { BillingCycle } from '@/types/subscription'
import { advanceOneCycle, annualEquivalent, firstOccurrenceOnOrAfter, monthlyEquivalent } from './billing'
import { addDaysISO, daysBetweenISO, todayISO } from './dates'

/** Derives the status shown to the user. "Cancelled" is stored; the rest follow from the expiry date. */
export function getPolicyStatus(
  policy: Pick<Policy, 'status' | 'expiryDate' | 'reminderDays'>,
  today: string = todayISO(),
): PolicyStatus {
  if (policy.status === 'cancelled') return 'cancelled'
  if (policy.expiryDate < today) return 'expired'
  if (daysBetweenISO(today, policy.expiryDate) <= policy.reminderDays) return 'expiring_soon'
  return 'active'
}

/** In force: counts toward active policies, premiums and coverage. */
export const isInForce = (status: PolicyStatus): boolean => status === 'active' || status === 'expiring_soon'

/**
 * The first premium date on or after `from`, following the cycle anchored on the start date.
 * Returns null when it falls after the expiry date, i.e. no premium remains in the term.
 */
export function nextPremiumWithinTerm(
  startDate: string,
  cycle: BillingCycle,
  expiryDate: string,
  from: string = todayISO(),
): string | null {
  const next = firstOccurrenceOnOrAfter(startDate, cycle, from)
  return next <= expiryDate ? next : null
}

/** The premium date after `dueDate`, or null when it would fall after the expiry date. */
export function advancePremiumWithinTerm(
  dueDate: string,
  cycle: BillingCycle,
  startDate: string,
  expiryDate: string,
): string | null {
  const next = advanceOneCycle(dueDate, cycle, startDate)
  return next <= expiryDate ? next : null
}

export const annualPremium = (policy: Pick<Policy, 'premiumAmountMinor' | 'billingCycle'>): number =>
  annualEquivalent(policy.premiumAmountMinor, policy.billingCycle)

export const monthlyPremium = (policy: Pick<Policy, 'premiumAmountMinor' | 'billingCycle'>): number =>
  monthlyEquivalent(policy.premiumAmountMinor, policy.billingCycle)

/** Suggested expiry for a renewal: one year after the current expiry. */
export const defaultRenewalExpiry = (currentExpiry: string): string => addDaysISO(currentExpiry, 365)
