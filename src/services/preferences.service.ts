import { COLLECTIONS, db, setOp } from '@/services/db'
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '@/types/notification'

/** Stored at users/{uid}/settings/preferences. Missing, partial or wrongly typed fields fall back to the defaults. */
const DOC_ID = 'preferences'

export async function getPreferences(uid: string): Promise<NotificationPreferences> {
  const stored = await db.get<Record<string, unknown>>(uid, COLLECTIONS.settings, DOC_ID)
  return {
    inAppNotifications:
      typeof stored?.inAppNotifications === 'boolean' ? stored.inAppNotifications : DEFAULT_NOTIFICATION_PREFERENCES.inAppNotifications,
    premiumReminderDays:
      typeof stored?.premiumReminderDays === 'number' ? stored.premiumReminderDays : DEFAULT_NOTIFICATION_PREFERENCES.premiumReminderDays,
  }
}

export async function updatePreferences(
  uid: string,
  update: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const next = { ...(await getPreferences(uid)), ...update }
  await db.commit(uid, [setOp(COLLECTIONS.settings, { id: DOC_ID, ...next })])
  return next
}
