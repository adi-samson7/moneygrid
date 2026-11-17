import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { DataStatus } from '@/components/common/DataStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { Pagination } from '@/components/common/Pagination'
import { selectClassName } from '@/components/common/SelectField'
import { SubscriptionActionButtons } from '@/components/subscriptions/SubscriptionActionButtons'
import { SubscriptionFormDialog } from '@/components/subscriptions/SubscriptionFormDialog'
import { SubscriptionStatusBadge } from '@/components/subscriptions/StatusBadges'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import type { Subscription } from '@/types/subscription'
import { annualEquivalent, BILLING_CYCLE_CONFIG } from '@/utils/billing'
import { formatDisplayDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import {
  filterAndSortSubscriptions,
  paginate,
  type SortDirection,
  type SortKey,
  type StatusFilter,
} from '@/utils/subscription-list'

const PAGE_SIZE = 10

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'upcoming', label: 'Upcoming (next 30 days)' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
]

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'nextPayment', label: 'Next payment date' },
  { value: 'name', label: 'Name' },
  { value: 'amount', label: 'Amount' },
  { value: 'created', label: 'Date added' },
]

export default function AllSubscriptionsPage() {
  const { status, subscriptions, reload } = useSubscriptionData()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('nextPayment')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Subscription | undefined>()

  const visible = useMemo(
    () => filterAndSortSubscriptions(subscriptions, { search, status: statusFilter, sortKey, sortDirection }),
    [subscriptions, search, statusFilter, sortKey, sortDirection],
  )
  const { pageItems, pageCount, page: currentPage } = paginate(visible, page, PAGE_SIZE)

  const openForm = (subscription?: Subscription) => {
    setEditing(subscription)
    setFormOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All Subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Search, filter and manage every subscription.</p>
        </div>
        <Button onClick={() => openForm()}>
          <Plus /> Add subscription
        </Button>
      </div>

      {status !== 'ready' ? (
        <DataStatus status={status} onRetry={reload} />
      ) : subscriptions.length === 0 ? (
        <EmptyState message="You haven't added any subscriptions yet.">
          <Button onClick={() => openForm()}>
            <Plus /> Add your first subscription
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_12rem_8rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search subscriptions"
                placeholder="Search by name, provider, category…"
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
                setStatusFilter(e.target.value as StatusFilter)
                setPage(1)
              }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort by"
              className={selectClassName}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Sort: {o.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort direction"
              className={selectClassName}
              value={sortDirection}
              onChange={(e) => setSortDirection(e.target.value as SortDirection)}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>

          {visible.length === 0 ? (
            <EmptyState message="No subscriptions match your search or filters." />
          ) : (
            <>
              <div className="glass overflow-hidden rounded-2xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Yearly amount</TableHead>
                      <TableHead>Next payment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell>
                          <Link to={`/subscriptions/${sub.id}`} className="font-medium hover:underline">
                            {sub.name}
                          </Link>
                          {sub.provider && <p className="text-xs text-muted-foreground">{sub.provider}</p>}
                        </TableCell>
                        <TableCell>{sub.category}</TableCell>
                        <TableCell>
                          {formatMoney(sub.amountMinor, sub.currency)}
                          <span className="text-xs text-muted-foreground"> / {BILLING_CYCLE_CONFIG[sub.billingCycle].label.toLowerCase()}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatMoney(annualEquivalent(sub.amountMinor, sub.billingCycle), sub.currency)}</TableCell>
                        <TableCell>{sub.status === 'active' ? formatDisplayDate(sub.nextPaymentDate) : '—'}</TableCell>
                        <TableCell>
                          <SubscriptionStatusBadge status={sub.status} />
                        </TableCell>
                        <TableCell>
                          <SubscriptionActionButtons subscription={sub} onEdit={() => openForm(sub)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
            </>
          )}
        </>
      )}

      <SubscriptionFormDialog open={formOpen} onOpenChange={setFormOpen} subscription={editing} />
    </div>
  )
}
