import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { DataStatus } from '@/components/common/DataStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { Pagination } from '@/components/common/Pagination'
import { selectClassName } from '@/components/common/SelectField'
import { PAYMENT_STATUS_LABELS } from '@/components/subscriptions/StatusBadges'
import { SubscriptionPaymentsTable } from '@/components/subscriptions/SubscriptionPaymentsTable'
import { Input } from '@/components/ui/input'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import type { PaymentStatus } from '@/types/subscription'
import { effectivePaymentStatus } from '@/utils/payments'
import { paginate } from '@/utils/subscription-list'

const PAGE_SIZE = 10

export default function PaymentHistoryPage() {
  const { status, subscriptions, payments, reload } = useSubscriptionData()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all')
  const [page, setPage] = useState(1)

  const subscriptionsById = useMemo(() => new Map(subscriptions.map((s) => [s.id, s])), [subscriptions])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return payments
      .filter((p) => statusFilter === 'all' || effectivePaymentStatus(p) === statusFilter)
      .filter((p) => !query || (subscriptionsById.get(p.subscriptionId)?.name ?? '').toLowerCase().includes(query))
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  }, [payments, search, statusFilter, subscriptionsById])

  const { pageItems, pageCount, page: currentPage } = paginate(visible, page, PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payment History</h1>
        <p className="mt-1 text-sm text-muted-foreground">Past and open payments across all subscriptions.</p>
      </div>

      {status !== 'ready' ? (
        <DataStatus status={status} onRetry={reload} />
      ) : payments.length === 0 ? (
        <EmptyState message="No payments yet. They appear here once you add a subscription." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search by subscription"
                placeholder="Search by subscription name…"
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <select
              aria-label="Filter by status"
              className={selectClassName}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as PaymentStatus | 'all')
                setPage(1)
              }}
            >
              <option value="all">All statuses</option>
              {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {visible.length === 0 ? (
            <EmptyState message="No payments match your filters." />
          ) : (
            <>
              <SubscriptionPaymentsTable payments={pageItems} subscriptionsById={subscriptionsById} />
              <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
            </>
          )}
        </>
      )}
    </div>
  )
}
