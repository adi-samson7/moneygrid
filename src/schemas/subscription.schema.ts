import { z } from 'zod'
import {
  BILLING_CYCLES,
  REMINDER_DAY_OPTIONS,
  SUBSCRIPTION_CATEGORIES,
  SUBSCRIPTION_STATUSES,
} from '@/types/subscription'
import { CURRENCIES } from '@/utils/currency'
import { isValidISODate } from '@/utils/dates'

/** Form values are all strings; the dialog converts them (amount to minor units, reminder to a number). */
export const subscriptionFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(80, 'Name is too long'),
    provider: z.string().trim().max(80, 'Provider is too long'),
    category: z.enum(SUBSCRIPTION_CATEGORIES),
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 199 or 199.50')
      .refine((value) => Number(value) > 0, 'Amount must be greater than 0'),
    currency: z.enum(CURRENCIES),
    billingCycle: z.enum(BILLING_CYCLES),
    startDate: z.string().refine(isValidISODate, 'Enter a valid start date'),
    nextPaymentDate: z.string().refine((value) => value === '' || isValidISODate(value), 'Enter a valid date'),
    paymentMethod: z.string().trim().max(80, 'Payment method is too long'),
    status: z.enum(SUBSCRIPTION_STATUSES),
    reminderDays: z.enum(REMINDER_DAY_OPTIONS.map(String) as [string, ...string[]]),
  })
  .refine((data) => data.nextPaymentDate === '' || data.nextPaymentDate >= data.startDate, {
    message: 'Must be on or after the start date',
    path: ['nextPaymentDate'],
  })

export type SubscriptionFormValues = z.infer<typeof subscriptionFormSchema>

export const paymentActionSchema = z.object({
  paymentDate: z.string().refine(isValidISODate, 'Enter a valid date'),
  notes: z.string().trim().max(500, 'Notes are too long'),
})

export type PaymentActionValues = z.infer<typeof paymentActionSchema>
