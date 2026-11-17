import { z } from 'zod'
import { POLICY_BILLING_CYCLES, POLICY_REMINDER_DAY_OPTIONS, POLICY_STORED_STATUSES, POLICY_TYPES } from '@/types/policy'
import { CURRENCIES } from '@/utils/currency'
import { isValidISODate } from '@/utils/dates'

const amountText = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 5000 or 5000.50')
/** Coverage is optional: blank is allowed and stored as 0. */
const optionalAmountText = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d+(\.\d{1,2})?$/.test(v), 'Enter an amount like 500000, or leave it blank')
const requiredDate = (message: string) => z.string().refine(isValidISODate, message)

/** Form values are all strings; the dialog converts amounts to minor units and reminderDays to a number. */
export const policyFormSchema = z
  .object({
    provider: z.string().trim().min(1, 'Enter the insurance company').max(80, 'Provider is too long'),
    policyName: z.string().trim().min(1, 'Enter a policy name').max(80, 'Name is too long'),
    policyType: z.enum(POLICY_TYPES),
    policyNumber: z.string().trim().max(60, 'Policy number is too long'),
    premium: amountText.refine((v) => Number(v) > 0, 'Premium must be greater than 0'),
    currency: z.enum(CURRENCIES),
    coverage: optionalAmountText,
    billingCycle: z.enum(POLICY_BILLING_CYCLES),
    startDate: requiredDate('Enter a valid start date'),
    expiryDate: requiredDate('Enter a valid expiry date'),
    nextPremiumDate: z.string().refine((v) => v === '' || isValidISODate(v), 'Enter a valid date'),
    status: z.enum(POLICY_STORED_STATUSES),
    reminderDays: z.enum(POLICY_REMINDER_DAY_OPTIONS.map(String) as [string, ...string[]]),
    notes: z.string().trim().max(1000, 'Notes are too long'),
  })
  .refine((d) => !isValidISODate(d.startDate) || !isValidISODate(d.expiryDate) || d.expiryDate > d.startDate, {
    message: 'Expiry must be after the start date',
    path: ['expiryDate'],
  })
  .refine((d) => d.nextPremiumDate === '' || (d.nextPremiumDate >= d.startDate && d.nextPremiumDate <= d.expiryDate), {
    message: 'Must be between the start and expiry dates',
    path: ['nextPremiumDate'],
  })

export type PolicyFormValues = z.infer<typeof policyFormSchema>

export const renewalFormSchema = z.object({
  newExpiryDate: requiredDate('Enter a valid expiry date'),
  premium: amountText.refine((v) => Number(v) > 0, 'Premium must be greater than 0'),
  coverage: optionalAmountText,
  notes: z.string().trim().max(1000, 'Notes are too long'),
})

export type RenewalFormValues = z.infer<typeof renewalFormSchema>
