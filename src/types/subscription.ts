import type { PaymentRecord } from './payment'
export type { PaymentRecord, PaymentResolution, PaymentStatus } from './payment'

export const SUBSCRIPTION_CATEGORIES = [
  'Entertainment',
  'Music',
  'Productivity',
  'Software',
  'Education',
  'Shopping',
  'Fitness',
  'Cloud Services',
  'Gaming',
  'Other',
] as const
export type SubscriptionCategory = (typeof SUBSCRIPTION_CATEGORIES)[number]

export const BILLING_CYCLES = ['weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly'] as const
export type BillingCycle = (typeof BILLING_CYCLES)[number]

export const SUBSCRIPTION_STATUSES = ['active', 'paused', 'cancelled', 'expired'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/** Days before a payment to remind the user. */
export const REMINDER_DAY_OPTIONS = [1, 3, 7, 30] as const

/**
 * Stored at users/{uid}/subscriptions/{id}.
 * Dates are "YYYY-MM-DD" strings (calendar dates, no time zone). Money is integer minor units (paise/cents).
 * Timestamps are ISO 8601 strings.
 */
export interface Subscription {
  id: string
  name: string
  provider: string
  category: SubscriptionCategory
  amountMinor: number
  currency: string
  billingCycle: BillingCycle
  startDate: string
  nextPaymentDate: string
  paymentMethod: string
  status: SubscriptionStatus
  reminderDays: number
  createdAt: string
  updatedAt: string
}

/** What the form collects. nextPaymentDate may be blank, in which case it is calculated. */
export interface SubscriptionInput {
  name: string
  provider: string
  category: SubscriptionCategory
  amountMinor: number
  currency: string
  billingCycle: BillingCycle
  startDate: string
  nextPaymentDate: string
  paymentMethod: string
  reminderDays: number
}

export type SubscriptionUpdate = SubscriptionInput & { status: SubscriptionStatus }

/** Stored at users/{uid}/subscriptionPayments/{id}. */
export interface SubscriptionPayment extends PaymentRecord {
  subscriptionId: string
}
