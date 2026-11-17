import type { PaymentRecord } from './payment'
import type { BillingCycle } from './subscription'

export const POLICY_TYPES = ['health', 'vehicle', 'life', 'home', 'travel', 'other'] as const
export type PolicyType = (typeof POLICY_TYPES)[number]

export const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  health: 'Health Insurance',
  vehicle: 'Vehicle Insurance',
  life: 'Life Insurance',
  home: 'Home Insurance',
  travel: 'Travel Insurance',
  other: 'Other',
}

/** Premium frequencies. Weekly premiums are not offered for policies. */
export const POLICY_BILLING_CYCLES = ['monthly', 'quarterly', 'half-yearly', 'yearly'] as const satisfies readonly BillingCycle[]

/** Stored statuses. "Expiring soon" and "expired" are derived from the expiry date. */
export const POLICY_STORED_STATUSES = ['active', 'cancelled'] as const
export type PolicyStoredStatus = (typeof POLICY_STORED_STATUSES)[number]

export type PolicyStatus = 'active' | 'expiring_soon' | 'expired' | 'cancelled'

/** Days before expiry at which a policy is flagged "expiring soon" (also the renewal reminder window). */
export const POLICY_REMINDER_DAY_OPTIONS = [7, 15, 30, 60, 90] as const

export interface PolicyRenewal {
  id: string
  previousExpiryDate: string
  newExpiryDate: string
  premiumAmountMinor: number
  coverageAmountMinor: number
  /** Date the renewal was recorded. */
  renewedOn: string
  notes: string
}

/**
 * Stored at users/{uid}/policies/{id}. Dates are "YYYY-MM-DD" strings; money is integer minor units.
 * Renewal history is kept inside the policy document.
 */
export interface Policy {
  id: string
  provider: string
  policyName: string
  policyType: PolicyType
  policyNumber: string
  premiumAmountMinor: number
  currency: string
  coverageAmountMinor: number
  billingCycle: BillingCycle
  startDate: string
  expiryDate: string
  /** Next premium due within the current term, or null when no premium remains before expiry. */
  nextPremiumDate: string | null
  status: PolicyStoredStatus
  reminderDays: number
  notes: string
  renewals: PolicyRenewal[]
  createdAt: string
  updatedAt: string
}

/** What the form collects. nextPremiumDate may be blank, in which case it is calculated. */
export interface PolicyInput {
  provider: string
  policyName: string
  policyType: PolicyType
  policyNumber: string
  premiumAmountMinor: number
  currency: string
  coverageAmountMinor: number
  billingCycle: BillingCycle
  startDate: string
  expiryDate: string
  nextPremiumDate: string
  reminderDays: number
  notes: string
}

export type PolicyUpdate = PolicyInput & { status: PolicyStoredStatus }

export interface RenewalInput {
  newExpiryDate: string
  premiumAmountMinor: number
  coverageAmountMinor: number
  notes: string
}

/** Stored at users/{uid}/policyPayments/{id}. Separate from subscription payments. */
export interface PolicyPayment extends PaymentRecord {
  policyId: string
}
