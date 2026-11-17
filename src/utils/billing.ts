import { addDays, addMonths, getDaysInMonth, parseISO, setDate, startOfMonth } from 'date-fns'
import type { BillingCycle } from '@/types/subscription'
import { toISODate } from './dates'

interface CycleConfig {
  label: string
  /** Number of months per cycle; 0 means a 7-day cycle. */
  months: number
  perYear: number
}

export const BILLING_CYCLE_CONFIG: Record<BillingCycle, CycleConfig> = {
  weekly: { label: 'Weekly', months: 0, perYear: 52 },
  monthly: { label: 'Monthly', months: 1, perYear: 12 },
  quarterly: { label: 'Quarterly', months: 3, perYear: 4 },
  'half-yearly': { label: 'Half-yearly', months: 6, perYear: 2 },
  yearly: { label: 'Yearly', months: 12, perYear: 1 },
}

/** Window (in days) used for "upcoming" payments. */
export const UPCOMING_WINDOW_DAYS = 30

/**
 * Month-based cycles are anchored to the start date's day of the month and clamped to the length
 * of the target month. A subscription starting on 31 Jan therefore pays on 28/29 Feb, then 31 Mar
 * (it does not drift to the 28th), and one starting on 29 Feb pays on 28 Feb in non-leap years.
 */
function monthlyStep(currentISO: string, months: number, anchorDay: number): string {
  const target = addMonths(startOfMonth(parseISO(currentISO)), months)
  return toISODate(setDate(target, Math.min(anchorDay, getDaysInMonth(target))))
}

/** The n-th payment date (n = 0 is the start date itself). */
export function nthOccurrence(startISO: string, cycle: BillingCycle, n: number): string {
  const { months } = BILLING_CYCLE_CONFIG[cycle]
  const start = parseISO(startISO)
  if (months === 0) return toISODate(addDays(start, 7 * n))
  return monthlyStep(startISO, months * n, start.getDate())
}

/** The first payment date on or after `fromISO` in the series that begins at `startISO`. */
export function firstOccurrenceOnOrAfter(startISO: string, cycle: BillingCycle, fromISO: string): string {
  let n = 0
  let date = nthOccurrence(startISO, cycle, n)
  // ISO dates compare correctly as strings. The cap guards against runaway loops on bad input.
  while (date < fromISO && n < 20000) {
    n += 1
    date = nthOccurrence(startISO, cycle, n)
  }
  return date
}

/**
 * The next payment to suggest for a subscription. A start date in the future is the first payment.
 * Otherwise the start date's own payment is taken as made, so a subscription starting today
 * (e.g. yearly) is next due one full cycle later, not today again.
 */
export function suggestNextPayment(startISO: string, cycle: BillingCycle, todayISO: string): string {
  if (startISO > todayISO) return startISO
  const next = firstOccurrenceOnOrAfter(startISO, cycle, todayISO)
  return next === startISO ? nthOccurrence(startISO, cycle, 1) : next
}

/** The payment date one cycle after `currentISO`, keeping the start date's day-of-month anchor. */
export function advanceOneCycle(currentISO: string, cycle: BillingCycle, startISO: string): string {
  const { months } = BILLING_CYCLE_CONFIG[cycle]
  if (months === 0) return toISODate(addDays(parseISO(currentISO), 7))
  return monthlyStep(currentISO, months, parseISO(startISO).getDate())
}

/** Amount per month, in minor units, for comparing cycles. */
export const monthlyEquivalent = (amountMinor: number, cycle: BillingCycle): number =>
  (amountMinor * BILLING_CYCLE_CONFIG[cycle].perYear) / 12

export const annualEquivalent = (amountMinor: number, cycle: BillingCycle): number =>
  amountMinor * BILLING_CYCLE_CONFIG[cycle].perYear
