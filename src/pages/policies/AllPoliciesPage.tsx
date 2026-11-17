import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { DataStatus } from '@/components/common/DataStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { Pagination } from '@/components/common/Pagination'
import { selectClassName } from '@/components/common/SelectField'
import { PolicyActionButtons } from '@/components/policies/PolicyActionButtons'
import { PolicyFormDialog } from '@/components/policies/PolicyFormDialog'
import { POLICY_STATUS_LABELS, PolicyStatusBadge } from '@/components/policies/PolicyStatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePolicyData } from '@/hooks/usePolicyData'
import { POLICY_TYPES, POLICY_TYPE_LABELS, type Policy } from '@/types/policy'
import { BILLING_CYCLE_CONFIG } from '@/utils/billing'
import { formatDisplayDate } from '@/utils/dates'
import { formatCoverage, formatMoney } from '@/utils/money'
import {
  filterAndSortPolicies,
  type PolicySortKey,
  type PolicyStatusFilter,
  type PolicyTypeFilter,
} from '@/utils/policy-list'
import { getPolicyStatus } from '@/utils/policy-rules'
import { paginate, type SortDirection } from '@/utils/subscription-list'

const PAGE_SIZE = 10

const SORT_OPTIONS: { value: PolicySortKey; label: string }[] = [
  { value: 'expiry', label: 'Expiry date' },
  { value: 'name', label: 'Name' },
  { value: 'premium', label: 'Premium' },
  { value: 'created', label: 'Date added' },
]

export default function AllPoliciesPage() {
  const { status, policies, reload } = usePolicyData()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PolicyStatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<PolicyTypeFilter>('all')
  const [sortKey, setSortKey] = useState<PolicySortKey>('expiry')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Policy | undefined>()

  const visible = useMemo(
    () => filterAndSortPolicies(policies, { search, status: statusFilter, type: typeFilter, sortKey, sortDirection }),
    [policies, search, statusFilter, typeFilter, sortKey, sortDirection],
  )
  const { pageItems, pageCount, page: currentPage } = paginate(visible, page, PAGE_SIZE)

  const openForm = (policy?: Policy) => {
    setEditing(policy)
    setFormOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All Policies</h1>
          <p className="mt-1 text-sm text-muted-foreground">Search, filter and manage every policy.</p>
        </div>
        <Button onClick={() => openForm()}>
          <Plus /> Add policy
        </Button>
      </div>

      {status !== 'ready' ? (
        <DataStatus status={status} onRetry={reload} />
      ) : policies.length === 0 ? (
        <EmptyState message="You haven't added any policies yet.">
          <Button onClick={() => openForm()}>
            <Plus /> Add your first policy
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_11rem_10rem_8rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search policies"
                placeholder="Search by name, company, number…"
                className="pl-8"
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
                setStatusFilter(e.target.value as PolicyStatusFilter)
                setPage(1)
              }}
            >
              <option value="all">All statuses</option>
              {(Object.keys(POLICY_STATUS_LABELS) as (keyof typeof POLICY_STATUS_LABELS)[]).map((s) => (
                <option key={s} value={s}>
                  {POLICY_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by type"
              className={selectClassName}
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as PolicyTypeFilter)
                setPage(1)
              }}
            >
              <option value="all">All types</option>
              {POLICY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {POLICY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <select aria-label="Sort by" className={selectClassName} value={sortKey} onChange={(e) => setSortKey(e.target.value as PolicySortKey)}>
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
            <EmptyState message="No policies match your search or filters." />
          ) : (
            <>
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Premium</TableHead>
                      <TableHead>Coverage</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.map((policy) => (
                      <TableRow key={policy.id}>
                        <TableCell>
                          <Link to={`/policies/${policy.id}`} className="font-medium hover:underline">
                            {policy.policyName}
                          </Link>
                          <p className="text-xs text-muted-foreground">{policy.provider}</p>
                        </TableCell>
                        <TableCell>{POLICY_TYPE_LABELS[policy.policyType]}</TableCell>
                        <TableCell>
                          {formatMoney(policy.premiumAmountMinor, policy.currency)}
                          <span className="text-xs text-muted-foreground"> / {BILLING_CYCLE_CONFIG[policy.billingCycle].label.toLowerCase()}</span>
                        </TableCell>
                        <TableCell>{formatCoverage(policy.coverageAmountMinor, policy.currency)}</TableCell>
                        <TableCell>{formatDisplayDate(policy.expiryDate)}</TableCell>
                        <TableCell>
                          <PolicyStatusBadge status={getPolicyStatus(policy)} />
                        </TableCell>
                        <TableCell>
                          <PolicyActionButtons policy={policy} onEdit={() => openForm(policy)} />
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

      <PolicyFormDialog open={formOpen} onOpenChange={setFormOpen} policy={editing} />
    </div>
  )
}
