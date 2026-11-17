import { useEffect, useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { SelectField } from '@/components/common/SelectField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { subscriptionFormSchema, type SubscriptionFormValues } from '@/schemas/subscription.schema'
import { useAuthStore } from '@/stores/auth.store'
import { useSubscriptionsStore } from '@/stores/subscriptions.store'
import {
  BILLING_CYCLES,
  REMINDER_DAY_OPTIONS,
  SUBSCRIPTION_CATEGORIES,
  SUBSCRIPTION_STATUSES,
  type Subscription,
} from '@/types/subscription'
import { BILLING_CYCLE_CONFIG, suggestNextPayment } from '@/utils/billing'
import { CURRENCIES, DEFAULT_CURRENCY } from '@/utils/currency'
import { isValidISODate, todayISO } from '@/utils/dates'
import { fromMinor, toMinor } from '@/utils/money'
import { SUBSCRIPTION_STATUS_LABELS } from './StatusBadges'

interface SubscriptionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omit to add a new subscription. */
  subscription?: Subscription
}

const asOptions = (values: readonly string[], labels?: Record<string, string>) =>
  values.map((value) => ({ value, label: labels?.[value] ?? value }))

function defaultValues(subscription: Subscription | undefined, currency: string): SubscriptionFormValues {
  if (subscription) {
    return {
      name: subscription.name,
      provider: subscription.provider,
      category: subscription.category,
      amount: fromMinor(subscription.amountMinor),
      currency: subscription.currency as SubscriptionFormValues['currency'],
      billingCycle: subscription.billingCycle,
      startDate: subscription.startDate,
      nextPaymentDate: subscription.nextPaymentDate,
      paymentMethod: subscription.paymentMethod,
      status: subscription.status,
      reminderDays: String(subscription.reminderDays),
    }
  }
  return {
    name: '',
    provider: '',
    category: 'Entertainment',
    amount: '',
    currency: (CURRENCIES as readonly string[]).includes(currency)
      ? (currency as SubscriptionFormValues['currency'])
      : DEFAULT_CURRENCY,
    billingCycle: 'monthly',
    startDate: todayISO(),
    nextPaymentDate: suggestNextPayment(todayISO(), 'monthly', todayISO()),
    paymentMethod: '',
    status: 'active',
    reminderDays: '3',
  }
}

export function SubscriptionFormDialog({ open, onOpenChange, subscription }: SubscriptionFormDialogProps) {
  const create = useSubscriptionsStore((s) => s.create)
  const update = useSubscriptionsStore((s) => s.update)
  const preferredCurrency = useAuthStore((s) => s.profile?.preferredCurrency ?? DEFAULT_CURRENCY)
  const isEdit = Boolean(subscription)

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SubscriptionFormValues>({
    resolver: zodResolver(subscriptionFormSchema),
    defaultValues: defaultValues(subscription, preferredCurrency),
  })

  // Start from fresh values each time the dialog opens.
  // When the date was typed in by hand it is left alone; otherwise it follows the billing cycle and
  // start date. An existing subscription keeps its saved date until the cycle is changed.
  const nextEdited = useRef(false)

  useEffect(() => {
    if (!open) return
    nextEdited.current = isEdit
    reset(defaultValues(subscription, preferredCurrency))
  }, [open, subscription, preferredCurrency, reset, isEdit])

  const cycle = useWatch({ control, name: 'billingCycle' })
  const startDate = useWatch({ control, name: 'startDate' })
  useEffect(() => {
    if (!open || nextEdited.current || !isValidISODate(startDate)) return
    setValue('nextPaymentDate', suggestNextPayment(startDate, cycle, todayISO()), { shouldValidate: false })
  }, [open, cycle, startDate, setValue])

  const onSubmit = async (values: SubscriptionFormValues) => {
    const input = {
      name: values.name,
      provider: values.provider,
      category: values.category,
      amountMinor: toMinor(values.amount),
      currency: values.currency,
      billingCycle: values.billingCycle,
      startDate: values.startDate,
      nextPaymentDate: values.nextPaymentDate,
      paymentMethod: values.paymentMethod,
      reminderDays: Number(values.reminderDays),
    }
    try {
      if (subscription) {
        await update(subscription.id, { ...input, status: values.status })
        toast.success('Subscription updated')
      } else {
        await create(input)
        toast.success('Subscription added')
      }
      onOpenChange(false)
    } catch (error) {
      console.error(error)
      toast.error('Could not save the subscription. Please try again.')
    }
  }

  // Typing a date by hand stops it following the billing cycle; changing the cycle starts it following again.
  const cycleField = register('billingCycle')
  const nextField = register('nextPaymentDate')

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit subscription' : 'Add subscription'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the details of this subscription.' : 'Track a recurring service and its payments.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" placeholder="e.g. Netflix" error={errors.name?.message} {...register('name')} />
            <FormField label="Provider (optional)" error={errors.provider?.message} {...register('provider')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Category"
              options={asOptions(SUBSCRIPTION_CATEGORIES)}
              error={errors.category?.message}
              {...register('category')}
            />
            <SelectField
              label="Billing cycle"
              options={BILLING_CYCLES.map((cycle) => ({ value: cycle, label: BILLING_CYCLE_CONFIG[cycle].label }))}
              error={errors.billingCycle?.message}
              {...cycleField}
              onChange={(e) => {
                nextEdited.current = false
                void cycleField.onChange(e)
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Amount"
              inputMode="decimal"
              placeholder="199.00"
              error={errors.amount?.message}
              {...register('amount')}
            />
            <SelectField
              label="Currency"
              options={asOptions(CURRENCIES)}
              error={errors.currency?.message}
              {...register('currency')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Start date" type="date" error={errors.startDate?.message} {...register('startDate')} />
            <div>
              <FormField
                label="Next payment (optional)"
                type="date"
                error={errors.nextPaymentDate?.message}
                {...nextField}
                onChange={(e) => {
                  nextEdited.current = true
                  void nextField.onChange(e)
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">Worked out from the start date and billing cycle. You can change it.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Payment method (optional)"
              placeholder="e.g. Visa •••• 4242"
              error={errors.paymentMethod?.message}
              {...register('paymentMethod')}
            />
            <SelectField
              label="Remind me"
              options={REMINDER_DAY_OPTIONS.map((days) => ({
                value: String(days),
                label: `${days} day${days === 1 ? '' : 's'} before`,
              }))}
              error={errors.reminderDays?.message}
              {...register('reminderDays')}
            />
          </div>

          {isEdit ? (
            <SelectField
              label="Status"
              options={asOptions(SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS_LABELS)}
              error={errors.status?.message}
              {...register('status')}
            />
          ) : (
            <input type="hidden" {...register('status')} />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add subscription'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
