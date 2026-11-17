import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NotificationPreferencesCard } from '@/components/settings/NotificationPreferencesCard'
import { Label } from '@/components/ui/label'
import { profileSchema, type ProfileInput } from '@/schemas/auth.schema'
import { useAuthStore } from '@/stores/auth.store'
import { CURRENCIES } from '@/utils/currency'

const selectClass =
  'h-9 w-full rounded-xl border border-input bg-(--field) shadow-[inset_0_1px_2px_oklch(0.3_0.04_265/0.07)] backdrop-blur-sm px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

export default function SettingsPage() {
  const profile = useAuthStore((s) => s.profile)
  const updateProfile = useAuthStore((s) => s.updateProfile)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: profile?.fullName ?? '',
      preferredCurrency: (profile?.preferredCurrency as ProfileInput['preferredCurrency']) ?? 'INR',
      timeZone: profile?.timeZone ?? '',
    },
  })

  if (!profile) return null

  const timeZones = Intl.supportedValuesOf('timeZone')
  if (profile.timeZone && !timeZones.includes(profile.timeZone)) timeZones.unshift(profile.timeZone)

  const onSubmit = async (values: ProfileInput) => {
    try {
      await updateProfile(values)
      toast.success('Profile updated')
    } catch (error) {
      console.error(error)
      toast.error('Could not save your profile. Please try again.')
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage your profile and preferences.</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Member since {format(new Date(profile.createdAt), 'd MMMM yyyy')}.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField label="Full name" error={errors.fullName?.message} {...register('fullName')} />

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <input id="email" value={profile.email} readOnly disabled className={selectClass} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preferredCurrency">Preferred currency</Label>
              <select id="preferredCurrency" className={selectClass} {...register('preferredCurrency')}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="timeZone">Time zone</Label>
              <select id="timeZone" className={selectClass} {...register('timeZone')}>
                {timeZones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
              {errors.timeZone && <p className="text-sm text-destructive">{errors.timeZone.message}</p>}
            </div>

            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <NotificationPreferencesCard />
    </div>
  )
}
