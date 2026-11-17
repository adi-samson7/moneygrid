import { useEffect, useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { SelectField } from '@/components/common/SelectField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { policyFormSchema, type PolicyFormValues } from '@/schemas/policy.schema'
import { useAuthStore } from '@/stores/auth.store'
import { usePoliciesStore } from '@/stores/policies.store'
import {
  POLICY_BILLING_CYCLES,
  POLICY_REMINDER_DAY_OPTIONS,
  POLICY_TYPES,
  POLICY_TYPE_LABELS,
  type Policy,
} from '@/types/policy'
import { BILLING_CYCLE_CONFIG } from '@/utils/billing'
import { CURRENCIES, DEFAULT_CURRENCY } from '@/utils/currency'
import { addDaysISO, isValidISODate, todayISO } from '@/utils/dates'
import { fromMinor, toMinor } from '@/utils/money'
import { nextPremiumWithinTerm } from '@/utils/policy-rules'

interface PolicyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omit to add a new policy. */
  policy?: Policy
}

function defaultValues(policy: Policy | undefined, currency: string): PolicyFormValues {
  if (policy) {
    return {
      provider: policy.provider,
      policyName: policy.policyName,
      policyType: policy.policyType,
      policyNumber: policy.policyNumber,
      premium: fromMinor(policy.premiumAmountMinor),
      currency: policy.currency as PolicyFormValues['currency'],
      coverage: policy.coverageAmountMinor ? fromMinor(policy.coverageAmountMinor) : '',
      billingCycle: policy.billingCycle as PolicyFormValues['billingCycle'],
      startDate: policy.startDate,
      expiryDate: policy.expiryDate,
      nextPremiumDate: policy.nextPremiumDate ?? '',
      status: policy.status,
      reminderDays: String(policy.reminderDays),
      notes: policy.notes,
    }
  }
  const today = todayISO()
  return {
    provider: '',
    policyName: '',
    policyType: 'health',
    policyNumber: '',
    premium: '',
    currency: (CURRENCIES as readonly string[]).includes(currency)
      ? (currency as PolicyFormValues['currency'])
      : DEFAULT_CURRENCY,
    coverage: '',
    billingCycle: 'yearly',
    startDate: today,
    expiryDate: addDaysISO(today, 364),
    nextPremiumDate: nextPremiumWithinTerm(today, 'yearly', addDaysISO(today, 364), today) ?? '',
    status: 'active',
    reminderDays: '30',
    notes: '',
  }
}

export function PolicyFormDialog({ open, onOpenChange, policy }: PolicyFormDialogProps) {
  const create = usePoliciesStore((s) => s.create)
  const update = usePoliciesStore((s) => s.update)
  const preferredCurrency = useAuthStore((s) => s.profile?.preferredCurrency ?? DEFAULT_CURRENCY)
  const isEdit = Boolean(policy)

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    defaultValues: defaultValues(policy, preferredCurrency),
  })

  // Start from fresh values each time the dialog opens.
  // When the date was typed in by hand it is left alone; otherwise it follows the billing cycle, start
  // and expiry dates. An existing policy keeps its saved date until the cycle is changed.
  const nextEdited = useRef(false)

  useEffect(() => {
    if (!open) return
    nextEdited.current = isEdit
    reset(defaultValues(policy, preferredCurrency))
  }, [open, policy, preferredCurrency, reset, isEdit])

  const cycle = useWatch({ control, name: 'billingCycle' })
  const startDate = useWatch({ control, name: 'startDate' })
  const expiryDate = useWatch({ control, name: 'expiryDate' })
  useEffect(() => {
    if (!open || nextEdited.current || !isValidISODate(startDate) || !isValidISODate(expiryDate)) return
    // Blank when no premium falls before the policy expires (e.g. a yearly premium already paid).
    setValue('nextPremiumDate', nextPremiumWithinTerm(startDate, cycle, expiryDate, todayISO()) ?? '', { shouldValidate: false })
  }, [open, cycle, startDate, expiryDate, setValue])

  const onSubmit = async (values: PolicyFormValues) => {
    const input = {
      provider: values.provider,
      policyName: values.policyName,
      policyType: values.policyType,
      policyNumber: values.policyNumber,
      premiumAmountMinor: toMinor(values.premium),
      currency: values.currency,
      coverageAmountMinor: toMinor(values.coverage),
      billingCycle: values.billingCycle,
      startDate: values.startDate,
      expiryDate: values.expiryDate,
      nextPremiumDate: values.nextPremiumDate,
      reminderDays: Number(values.reminderDays),
      notes: values.notes,
    }
    try {
      if (policy) {
        await update(policy.id, { ...input, status: values.status })
        toast.success('Policy updated')
      } else {
        await create(input)
        toast.success('Policy added')
      }
      onOpenChange(false)
    } catch (error) {
      console.error(error)
      toast.error('Could not save the policy. Please try again.')
    }
  }

  // Typing a date by hand stops it following the billing cycle; changing the cycle starts it following again.
  const cycleField = register('billingCycle')
  const nextField = register('nextPremiumDate')

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit policy' : 'Add policy'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the details of this policy.' : 'Track an insurance policy, its premiums and its expiry.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Policy name" placeholder="e.g. Family Health Plan" error={errors.policyName?.message} {...register('policyName')} />
            <FormField label="Insurance company" placeholder="e.g. HDFC Ergo" error={errors.provider?.message} {...register('provider')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Policy type"
              options={POLICY_TYPES.map((type) => ({ value: type, label: POLICY_TYPE_LABELS[type] }))}
              error={errors.policyType?.message}
              {...register('policyType')}
            />
            <FormField label="Policy number (optional)" error={errors.policyNumber?.message} {...register('policyNumber')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Premium" inputMode="decimal" placeholder="12000" error={errors.premium?.message} {...register('premium')} />
            <SelectField
              label="Billing cycle"
              options={POLICY_BILLING_CYCLES.map((cycle) => ({ value: cycle, label: BILLING_CYCLE_CONFIG[cycle].label }))}
              error={errors.billingCycle?.message}
              {...cycleField}
              onChange={(e) => {
                nextEdited.current = false
                void cycleField.onChange(e)
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Coverage amount (optional)" inputMode="decimal" placeholder="500000" error={errors.coverage?.message} {...register('coverage')} />
            <SelectField
              label="Currency"
              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
              error={errors.currency?.message}
              {...register('currency')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Start date" type="date" error={errors.startDate?.message} {...register('startDate')} />
            <FormField label="Expiry date" type="date" error={errors.expiryDate?.message} {...register('expiryDate')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FormField
                label="Next premium due (optional)"
                type="date"
                error={errors.nextPremiumDate?.message}
                {...nextField}
                onChange={(e) => {
                  nextEdited.current = true
                  void nextField.onChange(e)
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">Worked out from the start date and billing cycle. Blank if no premium falls before expiry.</p>
            </div>
            <SelectField
              label="Renewal reminder"
              options={POLICY_REMINDER_DAY_OPTIONS.map((days) => ({ value: String(days), label: `${days} days before expiry` }))}
              error={errors.reminderDays?.message}
              {...register('reminderDays')}
            />
          </div>

          {isEdit ? (
            <SelectField
              label="Status"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
              error={errors.status?.message}
              {...register('status')}
            />
          ) : (
            <input type="hidden" {...register('status')} />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" rows={3} {...register('notes')} />
            {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add policy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
