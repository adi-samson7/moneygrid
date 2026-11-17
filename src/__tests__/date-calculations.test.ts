import { afterAll, describe, expect, test } from 'vitest'
import { BILLING_CYCLES, type BillingCycle } from '@/types/subscription'
import {
  BILLING_CYCLE_CONFIG,
  advanceOneCycle,
  annualEquivalent,
  firstOccurrenceOnOrAfter,
  monthlyEquivalent,
  nthOccurrence,
} from '@/utils/billing'
import { addDaysISO, daysBetweenISO, isValidISODate, toISODate } from '@/utils/dates'
import { fromMinor, toMinor } from '@/utils/money'
import { effectivePaymentStatus } from '@/utils/payments'

// ---- helpers independent of the code under test (plain UTC arithmetic) ----
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const parts = (s: string) => s.split('-').map(Number) as [number, number, number]
const refAddDays = (s: string, n: number) => {
  const [y, m, d] = parts(s)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
/** Reference answer for a month-based cycle: same day-of-month as the start, clamped to the month's length. */
const refMonthly = (start: string, months: number, n: number) => {
  const [y, m, d] = parts(start)
  const total = m - 1 + months * n
  const year = y + Math.floor(total / 12)
  const month = (total % 12) + 1
  return iso(year, month, Math.min(d, daysInMonth(year, month)))
}
const MONTHS: Record<BillingCycle, number> = { weekly: 0, monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12 }

// Every calendar day of a leap year and of the year after it, plus a 2100 (non-leap century) sample.
const startDates: string[] = []
for (const year of [2024, 2025]) {
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= daysInMonth(year, m); d++) startDates.push(iso(year, m, d))
}
startDates.push('2100-02-28', '2100-01-31', '2000-02-29')

describe('billing dates', () => {
  for (const cycle of BILLING_CYCLES) {
    test(`${cycle}: nthOccurrence matches an independent calculation for every start day`, () => {
      const count = cycle === 'weekly' ? 70 : 30
      for (const start of startDates) {
        for (let n = 0; n <= count; n++) {
          const expected = cycle === 'weekly' ? refAddDays(start, 7 * n) : refMonthly(start, MONTHS[cycle], n)
          expect(nthOccurrence(start, cycle, n), `${cycle} from ${start}, n=${n}`).toBe(expected)
        }
      }
    })

    test(`${cycle}: stepping one cycle at a time lands on the same dates (no drift, e.g. 31 Jan -> 28 Feb -> 31 Mar)`, () => {
      const count = cycle === 'weekly' ? 70 : 30
      for (const start of startDates) {
        let current = start
        for (let n = 1; n <= count; n++) {
          current = advanceOneCycle(current, cycle, start)
          expect(current, `${cycle} from ${start}, step ${n}`).toBe(nthOccurrence(start, cycle, n))
        }
      }
    })

    test(`${cycle}: dates only move forward and keep the right spacing`, () => {
      for (const start of startDates) {
        let prev = start
        for (let n = 1; n <= 24; n++) {
          const next = nthOccurrence(start, cycle, n)
          expect(next > prev, `${cycle} from ${start}: ${prev} -> ${next}`).toBe(true)
          const gap = daysBetweenISO(prev, next)
          if (cycle === 'weekly') expect(gap).toBe(7)
          else expect(gap).toBeGreaterThanOrEqual(MONTHS[cycle] * 28 - 3)
          prev = next
        }
      }
    })

    test(`${cycle}: firstOccurrenceOnOrAfter is the earliest payment date that is not before the given day`, () => {
      const starts = ['2024-01-31', '2024-02-29', '2025-03-15', '2023-12-01']
      const froms = ['2024-01-01', '2024-02-29', '2024-03-01', '2025-01-31', '2025-06-30', '2026-02-28', '2026-11-17']
      for (const start of starts) {
        for (const from of froms) {
          const found = firstOccurrenceOnOrAfter(start, cycle, from)
          expect(found >= from && found >= start, `${cycle} ${start} from ${from} -> ${found}`).toBe(true)
          // minimal: the occurrence just before it (if any) is earlier than `from`
          let n = 0
          while (nthOccurrence(start, cycle, n) !== found) n++
          if (n > 0) expect(nthOccurrence(start, cycle, n - 1) < from, `${cycle} ${start} from ${from}`).toBe(true)
        }
      }
    })
  }

  test('known month-end and leap-year cases', () => {
    expect(nthOccurrence('2024-01-31', 'monthly', 1)).toBe('2024-02-29') // leap February
    expect(nthOccurrence('2025-01-31', 'monthly', 1)).toBe('2025-02-28')
    expect(nthOccurrence('2025-01-31', 'monthly', 2)).toBe('2025-03-31') // back to the 31st
    expect(nthOccurrence('2025-01-30', 'monthly', 1)).toBe('2025-02-28')
    expect(nthOccurrence('2025-01-30', 'monthly', 2)).toBe('2025-03-30')
    expect(nthOccurrence('2024-02-29', 'yearly', 1)).toBe('2025-02-28')
    expect(nthOccurrence('2024-02-29', 'yearly', 4)).toBe('2028-02-29')
    expect(nthOccurrence('2100-02-28', 'yearly', 1)).toBe('2101-02-28')
    expect(nthOccurrence('2024-08-31', 'quarterly', 1)).toBe('2024-11-30')
    expect(nthOccurrence('2024-08-31', 'half-yearly', 1)).toBe('2025-02-28')
    expect(nthOccurrence('2026-12-31', 'monthly', 2)).toBe('2027-02-28') // across a year end
  })

  test('cycle configuration is consistent', () => {
    for (const cycle of BILLING_CYCLES) {
      const { months, perYear } = BILLING_CYCLE_CONFIG[cycle]
      expect(months).toBe(MONTHS[cycle])
      if (months > 0) expect(perYear * months).toBe(12)
      expect(annualEquivalent(12345, cycle)).toBe(12345 * perYear)
      expect(monthlyEquivalent(annualEquivalent(12345, cycle) / 12, 'monthly')).toBeCloseTo(monthlyEquivalent(12345, cycle), 6)
    }
  })
})

describe('calendar dates across time zones and daylight saving', () => {
  const originalTz = process.env.TZ
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  // Zones with daylight-saving changes in the dates below, plus fixed offsets and an unusual +13/+14 zone.
  const zones = ['UTC', 'America/New_York', 'America/Sao_Paulo', 'Europe/London', 'Asia/Kolkata', 'Australia/Lord_Howe', 'Pacific/Auckland', 'Pacific/Kiritimati']
  const nearTransitions = ['2025-03-08', '2025-03-09', '2025-03-29', '2025-03-30', '2025-04-05', '2025-04-06', '2025-09-27', '2025-09-28', '2025-10-04', '2025-10-05', '2025-10-25', '2025-10-26', '2025-11-01', '2025-11-02', '2024-03-09', '2024-03-10']

  for (const zone of zones) {
    test(`${zone}: day arithmetic never skips or repeats a day`, () => {
      process.env.TZ = zone
      for (const start of nearTransitions) {
        for (const n of [-31, -7, -1, 1, 2, 7, 30, 31, 365]) {
          expect(addDaysISO(start, n), `${zone}: ${start} + ${n}`).toBe(refAddDays(start, n))
        }
        expect(daysBetweenISO(start, addDaysISO(start, 1))).toBe(1)
        expect(daysBetweenISO(start, addDaysISO(start, 30))).toBe(30)
        expect(daysBetweenISO(addDaysISO(start, 30), start)).toBe(-30)
      }
    })

    test(`${zone}: billing dates and "overdue" are unaffected`, () => {
      process.env.TZ = zone
      for (const cycle of BILLING_CYCLES) {
        for (const start of ['2025-01-31', '2025-03-08', '2025-10-26', '2024-02-29']) {
          for (let n = 0; n <= 14; n++) {
            const expected = cycle === 'weekly' ? refAddDays(start, 7 * n) : refMonthly(start, MONTHS[cycle], n)
            expect(nthOccurrence(start, cycle, n), `${zone} ${cycle} ${start} n=${n}`).toBe(expected)
          }
        }
      }
      const open = { status: 'upcoming' as const, dueDate: '2025-03-09' }
      expect(effectivePaymentStatus(open, '2025-03-09')).toBe('upcoming') // due today
      expect(effectivePaymentStatus(open, '2025-03-10')).toBe('overdue') // due yesterday
      expect(effectivePaymentStatus(open, '2025-03-08')).toBe('upcoming')
      expect(effectivePaymentStatus({ status: 'paid', dueDate: '2000-01-01' }, '2025-03-10')).toBe('paid')
      expect(effectivePaymentStatus({ status: 'skipped', dueDate: '2000-01-01' }, '2025-03-10')).toBe('skipped')
    })

    test(`${zone}: formatting a date in local time keeps the same calendar day`, () => {
      process.env.TZ = zone
      for (const day of ['2025-03-09', '2025-10-26', '2025-12-31', '2024-02-29']) {
        const [y, m, d] = parts(day)
        expect(toISODate(new Date(y, m - 1, d, 0, 0, 0))).toBe(day)
        expect(toISODate(new Date(y, m - 1, d, 23, 59, 59))).toBe(day)
      }
    })
  }

  test('date validation accepts real dates only', () => {
    for (const ok of ['2024-02-29', '2000-02-29', '2025-12-31', '2025-01-01']) expect(isValidISODate(ok), ok).toBe(true)
    for (const bad of ['2025-02-29', '2100-02-29', '2025-13-01', '2025-00-10', '2025-04-31', '2025-1-1', '25-01-01', '2025/01/01', '', 'abc', '2025-01-01T00:00:00']) {
      expect(isValidISODate(bad), bad).toBe(false)
    }
  })
})

describe('money amounts', () => {
  test('every amount in cents survives text -> minor units -> text', () => {
    for (let cents = 0; cents <= 250_000; cents++) {
      const text = (cents / 100).toFixed(2)
      expect(toMinor(text), text).toBe(cents)
      expect(fromMinor(cents), String(cents)).toBe(text)
    }
  })

  test('typical inputs', () => {
    expect(toMinor('199')).toBe(19900)
    expect(toMinor('15.49')).toBe(1549)
    expect(toMinor('0.07')).toBe(7)
    expect(toMinor('1.15')).toBe(115)
    expect(toMinor('1234567.89')).toBe(123456789)
  })
})
