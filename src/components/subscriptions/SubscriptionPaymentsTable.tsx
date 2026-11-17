import { useMemo } from 'react'
import { PaymentsTable } from '@/components/common/PaymentsTable'
import { useSubscriptionsStore } from '@/stores/subscriptions.store'
import type { Subscription, SubscriptionPayment } from '@/types/subscription'

interface SubscriptionPaymentsTableProps {
  payments: SubscriptionPayment[]
  subscriptionsById: Map<string, Subscription>
  /** Hide the subscription column on a single subscription's page. */
  showSubscription?: boolean
  showActions?: boolean
}

export function SubscriptionPaymentsTable({
  payments,
  subscriptionsById,
  showSubscription = true,
  showActions = true,
}: SubscriptionPaymentsTableProps) {
  const resolvePayment = useSubscriptionsStore((s) => s.resolvePayment)
  const ownerNames = useMemo(
    () => new Map([...subscriptionsById].map(([id, sub]) => [id, sub.name])),
    [subscriptionsById],
  )

  return (
    <PaymentsTable
      payments={payments}
      getOwnerId={(p) => p.subscriptionId}
      ownerNames={ownerNames}
      ownerLabel="Subscription"
      ownerPath="/subscriptions"
      showOwner={showSubscription}
      showActions={showActions}
      onResolve={resolvePayment}
    />
  )
}
