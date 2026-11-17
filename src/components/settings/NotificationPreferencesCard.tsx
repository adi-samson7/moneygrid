import { toast } from 'sonner'
import { selectClassName } from '@/components/common/SelectField'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useNotificationsStore } from '@/stores/notifications.store'
import { PREMIUM_REMINDER_OPTIONS, type NotificationPreferences } from '@/types/notification'

/** Notification preferences. Changes save immediately. */
export function NotificationPreferencesCard() {
  const preferences = useNotificationsStore((s) => s.preferences)
  const updatePreferences = useNotificationsStore((s) => s.updatePreferences)

  const save = async (update: Partial<NotificationPreferences>) => {
    try {
      await updatePreferences(update)
      toast.success('Notification settings saved')
    } catch (error) {
      console.error(error)
      toast.error('Could not save your settings. Please try again.')
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose which reminders appear in the app. Nothing is sent by email.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3">
          <input
            id="inAppNotifications"
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={preferences.inAppNotifications}
            onChange={(e) => save({ inAppNotifications: e.target.checked })}
          />
          <div>
            <Label htmlFor="inAppNotifications">Show in-app notifications</Label>
            <p className="text-sm text-muted-foreground">
              Upcoming payments and premiums, policies close to expiry, and overdue items. Turning this off stops new reminders from being created.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="premiumReminderDays">Remind me about policy premiums</Label>
          <select
            id="premiumReminderDays"
            className={selectClassName}
            disabled={!preferences.inAppNotifications}
            value={preferences.premiumReminderDays}
            onChange={(e) => save({ premiumReminderDays: Number(e.target.value) })}
          >
            {PREMIUM_REMINDER_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} day{days === 1 ? '' : 's'} before they are due
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Subscription reminders and policy renewal reminders use the reminder days set on each subscription or policy.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
