export type NotificationKind =
  | 'subscription_due'
  | 'premium_due'
  | 'policy_expiring'
  | 'payment_overdue'
  | 'payment_paid'

/**
 * Stored at users/{uid}/notifications/{id}.
 * The id is a deterministic key (e.g. "pay-due:<paymentId>"), so the same reminder can never be
 * created twice, even if the generator runs many times.
 */
export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  description: string
  relatedType: 'subscription' | 'policy'
  /** Null when the related record no longer exists. */
  relatedId: string | null
  /** When the notification was created (ISO 8601). */
  createdAt: string
  read: boolean
  readAt: string | null
}

/** A notification the rules say should exist right now. Becomes an AppNotification when first created. */
export interface NotificationCandidate {
  key: string
  kind: NotificationKind
  title: string
  description: string
  relatedType: 'subscription' | 'policy'
  relatedId: string | null
}

/** Stored at users/{uid}/settings/preferences. */
export interface NotificationPreferences {
  /** Master switch for generating new in-app notifications. */
  inAppNotifications: boolean
  /**
   * Days before a policy premium is due to remind. Subscriptions and policy renewals use the
   * reminder days set on each record; premiums have no per-record setting, so this applies to all.
   */
  premiumReminderDays: number
}

export const PREMIUM_REMINDER_OPTIONS = [1, 3, 7, 15, 30] as const

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  inAppNotifications: true,
  premiumReminderDays: 7,
}
