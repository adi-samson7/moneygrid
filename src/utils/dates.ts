import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'

/**
 * Calendar dates are stored as "YYYY-MM-DD" strings. parseISO reads that format as a local date,
 * so there is no UTC shift (unlike new Date("YYYY-MM-DD") followed by toISOString()).
 */

export const toISODate = (date: Date): string => format(date, 'yyyy-MM-dd')

export const todayISO = (): string => toISODate(new Date())

export const addDaysISO = (iso: string, days: number): string => toISODate(addDays(parseISO(iso), days))

export const daysBetweenISO = (fromISO: string, toISO: string): number =>
  differenceInCalendarDays(parseISO(toISO), parseISO(fromISO))

export const isValidISODate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value))

export const formatDisplayDate = (iso: string): string => format(parseISO(iso), 'd MMM yyyy')
