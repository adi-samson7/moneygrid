import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { DataStatus } from '@/components/common/DataStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { SubscriptionPaymentsTable } from '@/components/subscriptions/SubscriptionPaymentsTable'
import { SubscriptionStatusBadge } from '@/components/subscriptions/StatusBadges'
import { SubscriptionActionButtons } from '@/components/subscriptions/SubscriptionActionButtons'
import { SubscriptionFormDialog } from '@/components/subscriptions/SubscriptionFormDialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import { BILLING_CYCLE_CONFIG, monthlyEquivalent } from '@/utils/billing'
import { formatDisplayDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

export default function SubscriptionDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { status, subscriptions, payments, reload } = useSubscriptionData()
  const [editOpen, setEditOpen] = useState(false)

  const subscription = subscriptions.find((s) => s.id === id)
  const history = useMemo(
    () => payments.filter((p) => p.subscriptionId === id).sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [payments, id],
  )

  if (status !== 'ready') return <DataStatus status={status} onRetry={reload} />

  if (!subscription) {
    return (
      <EmptyState message="This subscription could not be found. It may have been deleted.">
        <Link to="/subscriptions/all" className="text-sm text-primary underline-offset-4 hover:underline">
          Back to all subscriptions
        </Link>
      </EmptyState>
    )
  }

  const details: [string, string][] = [
    ['Provider', subscription.provider || '—'],
    ['Category', subscription.category],
    ['Amount', `${formatMoney(subscription.amountMinor, subscription.currency)} / ${BILLING_CYCLE_CONFIG[subscription.billingCycle].label.toLowerCase()}`],
    ['Monthly equivalent', formatMoney(Math.round(monthlyEquivalent(subscription.amountMinor, subscription.billingCycle)), subscription.currency)],
    ['Start date', formatDisplayDate(subscription.startDate)],
    ['Next payment', subscription.status === 'active' ? formatDisplayDate(subscription.nextPaymentDate) : '—'],
    ['Payment method', subscription.paymentMethod || '—'],
    ['Reminder', `${subscription.reminderDays} day${subscription.reminderDays === 1 ? '' : 's'} before`],
  ]

  return (
    <div className="space-y-6">
      <Link to="/subscriptions/all" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All subscriptions
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{subscription.name}</h1>
          <SubscriptionStatusBadge status={subscription.status} />
        </div>
        <SubscriptionActionButtons
          subscription={subscription}
          onEdit={() => setEditOpen(true)}
          onDeleted={() => navigate('/subscriptions/all', { replace: true })}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Payment history</h2>
        {history.length === 0 ? (
          <EmptyState message="No payments are being tracked for this subscription. Resume it to start tracking again." />
        ) : (
          <SubscriptionPaymentsTable payments={history} subscriptionsById={new Map([[subscription.id, subscription]])} showSubscription={false} />
        )}
      </div>

      <SubscriptionFormDialog open={editOpen} onOpenChange={setEditOpen} subscription={subscription} />
    </div>
  )
}
