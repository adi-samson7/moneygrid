import { useCallback, useMemo, useState } from 'react'
import dayGridPlugin from '@fullcalendar/daygrid'
import multiMonthPlugin from '@fullcalendar/multimonth'
import FullCalendar from '@fullcalendar/react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'
import { CalendarEventDialog } from '@/components/calendar/CalendarEventDialog'
import { CalendarLegend } from '@/components/calendar/CalendarLegend'
import { DataStatus } from '@/components/common/DataStatus'
import { Button } from '@/components/ui/button'
import { usePolicyData } from '@/hooks/usePolicyData'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import {
  buildCalendarEvents,
  CALENDAR_COLORS,
  filterByModule,
  type CalendarEventData,
  type ModuleFilter,
} from '@/utils/calendar-events'
import { toISODate } from '@/utils/dates'
import { downloadTextFile } from '@/utils/download'
import { buildIcs, EXPORT_HORIZON_DAYS } from '@/utils/ics'
import { useNotificationsStore } from '@/stores/notifications.store'

const FILTERS: { value: ModuleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'policies', label: 'Policies' },
]

interface VisibleRange {
  start: string
  end: string
}

export default function CalendarPage() {
  const subData = useSubscriptionData()
  const polData = usePolicyData()
  const [range, setRange] = useState<VisibleRange | null>(null)
  const [filter, setFilter] = useState<ModuleFilter>('all')
  const [selected, setSelected] = useState<CalendarEventData | null>(null)
  const premiumReminderDays = useNotificationsStore((s) => s.preferences.premiumReminderDays)
  const inAppNotifications = useNotificationsStore((s) => s.preferences.inAppNotifications)

  const { subscriptions, payments: subscriptionPayments } = subData
  const { policies, payments: policyPayments } = polData
  const ready = subData.status === 'ready' && polData.status === 'ready'

  // Events are built only for the dates currently on screen.
  const events = useMemo<EventInput[]>(() => {
    if (!ready || !range) return []
    const built = buildCalendarEvents({ subscriptions, subscriptionPayments, policies, policyPayments }, range.start, range.end)
    return filterByModule(built, filter).map((event) => ({
      id: event.id,
      title: event.title,
      start: event.date,
      allDay: true,
      backgroundColor: CALENDAR_COLORS[event.color],
      borderColor: CALENDAR_COLORS[event.color],
      textColor: '#ffffff',
      classNames: event.state === 'projected' ? ['event-projected'] : [],
      extendedProps: { data: event },
    }))
  }, [ready, range, subscriptions, subscriptionPayments, policies, policyPayments, filter])

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    const next = { start: toISODate(arg.start), end: toISODate(arg.end) }
    // FullCalendar calls this on every navigation; ignore repeats so state does not churn.
    setRange((prev) => (prev && prev.start === next.start && prev.end === next.end ? prev : next))
  }, [])

  const handleEventClick = useCallback((arg: EventClickArg) => {
    setSelected(arg.event.extendedProps.data as CalendarEventData)
  }, [])

  // Downloads the next year of expected payments, premiums and expiries as an .ics file.
  const exportToCalendar = () => {
    try {
      const { content, count } = buildIcs(
        { subscriptions, subscriptionPayments, policies, policyPayments },
        { inAppNotifications, premiumReminderDays },
      )
      if (count === 0) {
        toast.info('Nothing to export yet. Add a subscription or policy first.')
        return
      }
      downloadTextFile('subscription-policy-reminders.ics', content, 'text/calendar;charset=utf-8')
      toast.success(`Exported ${count} calendar event${count === 1 ? '' : 's'}`)
    } catch (error) {
      console.error(error)
      toast.error('Could not create the calendar file. Please try again.')
    }
  }

  const reload = () => {
    subData.reload()
    polData.reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Payments, premiums and policy expiries in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={!ready} onClick={exportToCalendar} title={`Download the next ${EXPORT_HORIZON_DAYS / 365} year of payments, premiums and expiries, with reminders, to add to Google, Apple or Outlook calendar`}>
            <Download /> Export (.ics)
          </Button>
        <div role="group" aria-label="Show" className="glass flex gap-1 rounded-xl p-1">
          {FILTERS.map(({ value, label }) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? 'default' : 'ghost'}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        </div>
      </div>

      {!ready ? (
        <DataStatus status={subData.status === 'error' || polData.status === 'error' ? 'error' : 'loading'} onRetry={reload} />
      ) : (
        <>
          <CalendarLegend />
          <p className="text-xs text-muted-foreground">
            Export (.ics) saves the next 12 months of expected payments, premiums and policy expiries, each with a reminder, so you can add them to Google, Apple or Outlook Calendar. Re-export to refresh; re-importing updates the same events.
          </p>
          {subscriptions.length === 0 && policies.length === 0 && (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              You haven&apos;t added any subscriptions or policies yet. Their dates will appear here once you do.
            </p>
          )}
          <div className="glass rounded-2xl p-2 sm:p-4">
            <FullCalendar
              plugins={[dayGridPlugin, multiMonthPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek,multiMonthYear' }}
              buttonText={{ today: 'Today', month: 'Month', week: 'Week', year: 'Year' }}
              views={{ multiMonthYear: { multiMonthMaxColumns: 3 } }}
              events={events}
              eventInteractive
              eventClick={handleEventClick}
              datesSet={handleDatesSet}
              dayMaxEvents={3}
              fixedWeekCount={false}
              height="auto"
            />
          </div>
        </>
      )}

      <CalendarEventDialog event={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
