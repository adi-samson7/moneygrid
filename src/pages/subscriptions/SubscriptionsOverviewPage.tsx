import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { DataStatus } from '@/components/common/DataStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { SummaryCard } from '@/components/common/SummaryCard'
import { PaymentStatusBadge } from '@/components/subscriptions/StatusBadges'
import { SubscriptionFormDialog } from '@/components/subscriptions/SubscriptionFormDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import { useAuthStore } from '@/stores/auth.store'
import { UPCOMING_WINDOW_DAYS } from '@/utils/billing'
import { addDaysISO, formatDisplayDate, todayISO } from '@/utils/dates'
import { formatMoney, formatTotals } from '@/utils/money'
import { effectivePaymentStatus } from '@/utils/payments'
import { activeSubscriptions, annualTotals, monthlyTotals, paymentTotals } from '@/utils/subscription-stats'

export default function SubscriptionsOverviewPage() {
  const { status, subscriptions, payments, reload } = useSubscriptionData()
  const currency = useAuthStore((s) => s.profile?.preferredCurrency ?? 'INR')
  const [formOpen, setFormOpen] = useState(false)

  const summary = useMemo(() => {
    const today = todayISO()
    const limit = addDaysISO(today, UPCOMING_WINDOW_DAYS)
    const open = payments.filter((p) => p.status === 'upcoming').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    const overdue = open.filter((p) => p.dueDate < today)
    const dueSoon = open.filter((p) => p.dueDate >= today && p.dueDate <= limit)
    return {
      activeCount: activeSubscriptions(subscriptions).length,
      monthly: monthlyTotals(subscriptions),
      annual: annualTotals(subscriptions),
      overdue,
      dueSoon,
      dueSoonTotals: paymentTotals(dueSoon),
      next: open.slice(0, 5),
    }
  }, [subscriptions, payments])

  const nameById = new Map(subscriptions.map((s) => [s.id, s.name]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscriptions Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Summary of your recurring services.</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus /> Add subscription
        </Button>
      </div>

      {status !== 'ready' ? (
        <DataStatus status={status} onRetry={reload} />
      ) : subscriptions.length === 0 ? (
        <EmptyState message="You haven't added any subscriptions yet.">
          <Button onClick={() => setFormOpen(true)}>
            <Plus /> Add your first subscription
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard title="Active subscriptions" value={String(summary.activeCount)} />
            <SummaryCard title="Monthly spending" value={formatTotals(summary.monthly, currency)} hint="Yearly and other cycles are averaged per month" />
            <SummaryCard title="Annual spending" value={formatTotals(summary.annual, currency)} />
            <SummaryCard
              title={`Due in ${UPCOMING_WINDOW_DAYS} days`}
              value={String(summary.dueSoon.length)}
              hint={summary.dueSoon.length > 0 ? formatTotals(summary.dueSoonTotals, currency) : undefined}
            />
            <SummaryCard title="Overdue payments" value={String(summary.overdue.length)} hint={summary.overdue.length > 0 ? 'Mark them as paid or skipped' : undefined} />
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Next payments</CardTitle>
              <Link to="/subscriptions/upcoming" className="text-sm text-primary underline-offset-4 hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {summary.next.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments are due. Active subscriptions will appear here.</p>
              ) : (
                <ul className="divide-y">
                  {summary.next.map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <div className="min-w-0">
                        <Link to={`/subscriptions/${payment.subscriptionId}`} className="font-medium hover:underline">
                          {nameById.get(payment.subscriptionId) ?? 'Unknown'}
                        </Link>
                        <p className="text-xs text-muted-foreground">{formatDisplayDate(payment.dueDate)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <PaymentStatusBadge status={effectivePaymentStatus(payment)} />
                        <span className="font-medium">{formatMoney(payment.amountMinor, payment.currency)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <SubscriptionFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}
