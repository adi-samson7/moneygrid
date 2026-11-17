import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { renewalFormSchema, type RenewalFormValues } from '@/schemas/policy.schema'
import { usePoliciesStore } from '@/stores/policies.store'
import type { Policy } from '@/types/policy'
import { formatDisplayDate } from '@/utils/dates'
import { fromMinor, toMinor } from '@/utils/money'
import { defaultRenewalExpiry } from '@/utils/policy-rules'

interface RenewPolicyDialogProps {
  /** The policy to renew, or null when the dialog is closed. */
  policy: Policy | null
  onClose: () => void
}

const valuesFor = (policy: Policy): RenewalFormValues => ({
  newExpiryDate: defaultRenewalExpiry(policy.expiryDate),
  premium: fromMinor(policy.premiumAmountMinor),
  coverage: policy.coverageAmountMinor ? fromMinor(policy.coverageAmountMinor) : '',
  notes: '',
})

export function RenewPolicyDialog({ policy, onClose }: RenewPolicyDialogProps) {
  const renew = usePoliciesStore((s) => s.renew)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RenewalFormValues>({ resolver: zodResolver(renewalFormSchema) })

  useEffect(() => {
    if (policy) reset(valuesFor(policy))
  }, [policy, reset])

  const onSubmit = async (values: RenewalFormValues) => {
    if (!policy) return
    try {
      await renew(policy.id, {
        newExpiryDate: values.newExpiryDate,
        premiumAmountMinor: toMinor(values.premium),
        coverageAmountMinor: toMinor(values.coverage),
        notes: values.notes,
      })
      toast.success(`${policy.policyName} renewed`)
      onClose()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Could not renew the policy.')
    }
  }

  return (
    <Dialog open={policy !== null} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renew policy</DialogTitle>
          <DialogDescription>
            {policy && `${policy.policyName} currently expires on ${formatDisplayDate(policy.expiryDate)}.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField label="New expiry date" type="date" error={errors.newExpiryDate?.message} {...register('newExpiryDate')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Premium" inputMode="decimal" error={errors.premium?.message} {...register('premium')} />
            <FormField label="Coverage amount (optional)" inputMode="decimal" error={errors.coverage?.message} {...register('coverage')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" rows={3} {...register('notes')} />
            {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Renewing…' : 'Renew policy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
