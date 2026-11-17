import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { paymentActionSchema, type PaymentActionValues } from '@/schemas/subscription.schema'
import type { PaymentRecord, PaymentResolution } from '@/types/payment'
import { formatDisplayDate, todayISO } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

interface PaymentActionDialogProps {
  /** The open payment being recorded, or null when the dialog is closed. */
  payment: PaymentRecord | null
  /** Name of the subscription or policy the payment belongs to. */
  ownerName: string
  mode: 'paid' | 'skipped'
  onResolve: (paymentId: string, resolution: PaymentResolution) => Promise<void>
  onClose: () => void
}

/** Records a payment as paid (with date and notes) or skipped. Used for subscriptions and policy premiums. */
export function PaymentActionDialog({ payment, ownerName, mode, onResolve, onClose }: PaymentActionDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentActionValues>({
    resolver: zodResolver(paymentActionSchema),
    defaultValues: { paymentDate: todayISO(), notes: '' },
  })

  useEffect(() => {
    if (payment) reset({ paymentDate: todayISO(), notes: '' })
  }, [payment, reset])

  const onSubmit = async (values: PaymentActionValues) => {
    if (!payment) return
    try {
      await onResolve(payment.id, {
        status: mode,
        paymentDate: mode === 'paid' ? values.paymentDate : undefined,
        notes: values.notes,
      })
      toast.success(mode === 'paid' ? 'Payment marked as paid' : 'Payment skipped')
      onClose()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Could not record the payment.')
    }
  }

  const isPaid = mode === 'paid'

  return (
    <Dialog open={payment !== null} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isPaid ? 'Mark as paid' : 'Skip this payment'}</DialogTitle>
          <DialogDescription>
            {payment &&
              `${ownerName} · ${formatMoney(payment.amountMinor, payment.currency)} due ${formatDisplayDate(payment.dueDate)}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {isPaid && (
            <FormField label="Payment date" type="date" error={errors.paymentDate?.message} {...register('paymentDate')} />
          )}
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
              {isSubmitting ? 'Saving…' : isPaid ? 'Mark as paid' : 'Skip payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
