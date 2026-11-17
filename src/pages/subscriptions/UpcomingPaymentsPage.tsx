import { useMemo, useState } from 'react'
import { DataStatus } from '@/components/common/DataStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { selectClassName } from '@/components/common/SelectField'
import { SubscriptionPaymentsTable } from '@/components/subscriptions/SubscriptionPaymentsTable'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import { addDaysISO, todayISO } from '@/utils/dates'

type Range = '7' | '30' | 'all'

export default function UpcomingPaymentsPage() {
  const { status, subscriptions, payments, reload } = useSubscriptionData()
  const [range, setRange] = useState<Range>('30')

  const subscriptionsById = useMemo(() => new Map(subscriptions.map((s) => [s.id, s])), [subscriptions])

  // Overdue payments are always listed: their due date is before the window's end.
  const open = useMemo(() => {
    const limit = range === 'all' ? null : addDaysISO(todayISO(), Number(range))
    return payments
      .filter((p) => p.status === 'upcoming' && (limit === null || p.dueDate <= limit))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [payments, range])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Upcoming Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mark each payment as paid or skipped. Nothing is assumed paid just because its date has passed.
          </p>
        </div>
        <select
          aria-label="Time range"
          className={`${selectClassName} sm:w-48`}
          value={range}
          onChange={(e) => setRange(e.target.value as Range)}
        >
          <option value="7">Next 7 days</option>
          <option value="30">Next 30 days</option>
          <option value="all">All upcoming</option>
        </select>
      </div>

      {status !== 'ready' ? (
        <DataStatus status={status} onRetry={reload} />
      ) : open.length === 0 ? (
        <EmptyState message="No payments are due in this period." />
      ) : (
        <SubscriptionPaymentsTable payments={open} subscriptionsById={subscriptionsById} />
      )}
    </div>
  )
}
