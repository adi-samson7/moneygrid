import type { NotificationPreferences } from '@/types/notification'
import { buildCalendarEvents, type CalendarEventData } from './calendar-events'
import { addDaysISO, todayISO } from './dates'
import { formatMoney } from './money'
import type { NotificationSource } from './notification-rules'

/**
 * iCalendar (.ics) export, RFC 5545. The file works in Google Calendar, Apple Calendar, Outlook and
 * similar apps and needs no server. It is a snapshot: re-export to refresh it.
 */

const PRODID = '-//MoneyGrid//EN'
const UID_DOMAIN = 'subscription-policy-manager.local'
/** How far ahead to export. */
export const EXPORT_HORIZON_DAYS = 365
/** Reminders fire at 09:00 local time on the reminder day. */
const REMINDER_HOUR = 9
const MAX_LINE_OCTETS = 75

const encoder = new TextEncoder()

/** Escapes text values: backslash, semicolon, comma and newlines. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/**
 * Folds a line so no physical line exceeds 75 octets. Continuation lines start with one space.
 * Splits between characters (never inside a multi-byte one such as the rupee sign).
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) return line
  const parts: string[] = []
  let current = ''
  let octets = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    // Continuation lines carry a leading space, so they have one octet less for content.
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1
    if (octets + size > limit) {
      parts.push(current)
      current = ''
      octets = 0
    }
    current += char
    octets += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const dateValue = (iso: string): string => iso.replace(/-/g, '')

/** "YYYYMMDDTHHMMSSZ" in UTC. */
function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/** Trigger that fires at 09:00 local time, `days` days before the all-day event starts at 00:00. */
export function reminderTrigger(days: number): string {
  const wholeDays = Math.max(0, days - 1)
  const hours = 24 - REMINDER_HOUR
  return wholeDays === 0 ? `-PT${hours}H` : `-P${wholeDays}DT${hours}H`
}

function summaryFor(event: CalendarEventData): string {
  const amount = event.amountMinor !== null && event.currency ? ` (${formatMoney(event.amountMinor, event.currency)})` : ''
  switch (event.kind) {
    case 'subscription_payment':
      return `Payment due: ${event.name}${amount}`
    case 'policy_premium':
      return `Premium due: ${event.name}${amount}`
    case 'policy_expiry':
      return `Policy expires: ${event.name}`
  }
}

function descriptionFor(event: CalendarEventData): string {
  switch (event.kind) {
    case 'subscription_payment':
      return 'Subscription payment. Mark it as paid in MoneyGrid once done.'
    case 'policy_premium':
      return 'Policy premium. Mark it as paid in MoneyGrid once done.'
    case 'policy_expiry':
      return 'Renew this policy before it expires so you stay covered.'
  }
}

/** Only things still to come: expected payments and premiums, and policy expiry dates. */
const EXPORTED_STATES = new Set(['upcoming', 'projected', 'expires'])

export interface IcsResult {
  content: string
  /** Number of events in the file. */
  count: number
}

export function buildIcs(
  source: NotificationSource,
  prefs: NotificationPreferences,
  today: string = todayISO(),
  now: Date = new Date(),
): IcsResult {
  const subsById = new Map(source.subscriptions.map((s) => [s.id, s]))
  const policiesById = new Map(source.policies.map((p) => [p.id, p]))

  const events = buildCalendarEvents(source, today, addDaysISO(today, EXPORT_HORIZON_DAYS), today).filter((e) =>
    EXPORTED_STATES.has(e.state),
  )

  const reminderDaysFor = (event: CalendarEventData): number => {
    if (event.kind === 'subscription_payment') return subsById.get(event.ownerId)?.reminderDays ?? 3
    if (event.kind === 'policy_premium') return prefs.premiumReminderDays
    return policiesById.get(event.ownerId)?.reminderDays ?? 30
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText('MoneyGrid')}`,
  ]
  const stamp = utcStamp(now)

  for (const event of events) {
    const summary = summaryFor(event)
    lines.push(
      'BEGIN:VEVENT',
      // Stable across exports (not tied to payment ids), so re-importing updates instead of duplicating.
      `UID:${event.kind}-${event.ownerId}-${event.date}@${UID_DOMAIN}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateValue(event.date)}`,
      `DTEND;VALUE=DATE:${dateValue(addDaysISO(event.date, 1))}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(descriptionFor(event))}`,
      `CATEGORIES:${event.ownerType === 'subscription' ? 'Subscription' : 'Policy'}`,
      // Free, not busy: these are reminders, not meetings.
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(summary)}`,
      `TRIGGER:${reminderTrigger(reminderDaysFor(event))}`,
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')

  return { content: lines.map(foldLine).join('\r\n') + '\r\n', count: events.length }
}
