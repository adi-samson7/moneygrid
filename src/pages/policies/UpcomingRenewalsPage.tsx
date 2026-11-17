import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataStatus } from '@/components/common/DataStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { selectClassName } from '@/components/common/SelectField'
import { PolicyPaymentsTable } from '@/components/policies/PolicyPaymentsTable'
import { PolicyStatusBadge } from '@/components/policies/PolicyStatusBadge'
import { RenewPolicyDialog } from '@/components/policies/RenewPolicyDialog'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePolicyData } from '@/hooks/usePolicyData'
import { POLICY_TYPE_LABELS, type Policy } from '@/types/policy'
import { addDaysISO, daysBetweenISO, formatDisplayDate, todayISO } from '@/utils/dates'
import { getPolicyStatus } from '@/utils/policy-rules'

type Range = '7' | '30' | 'all'

function expiryText(policy: Policy, today: string): string {
  const days = daysBetweenISO(today, policy.expiryDate)
  if (days < 0) return `Expired ${-days} day${days === -1 ? '' : 's'} ago`
  if (days === 0) return 'Expires today'
  return `In ${days} day${days === 1 ? '' : 's'}`
}

export default function UpcomingRenewalsPage() {
  const { status, policies, payments, reload } = usePolicyData()
  const [range, setRange] = useState<Range>('30')
  const [renewing, setRenewing] = useState<Policy | null>(null)

  const policiesById = useMemo(() => new Map(policies.map((p) => [p.id, p])), [policies])
  const today = todayISO()

  // Policies close to or past expiry that are not cancelled.
  const renewals = useMemo(
    () =>
      policies
        .filter((p) => ['expiring_soon', 'expired'].includes(getPolicyStatus(p, today)))
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
    [policies, today],
  )

  // Overdue premiums are always listed: their due date is before the window's end.
  const premiums = useMemo(() => {
    const limit = range === 'all' ? null : addDaysISO(today, Number(range))
    return payments
      .filter((p) => p.status === 'upcoming' && (limit === null || p.dueDate <= limit))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [payments, range, today])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upcoming Renewals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Policies nearing expiry and premiums that are due.</p>
      </div>

      {status !== 'ready' ? (
        <DataStatus status={status} onRetry={reload} />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">Policies to renew</h2>
            {renewals.length === 0 ? (
              <EmptyState message="No policies are close to expiry." />
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renewals.map((policy) => (
                      <TableRow key={policy.id}>
                        <TableCell>
                          <Link to={`/policies/${policy.id}`} className="font-medium hover:underline">
                            {policy.policyName}
                          </Link>
                          <p className="text-xs text-muted-foreground">{policy.provider}</p>
                        </TableCell>
                        <TableCell>{POLICY_TYPE_LABELS[policy.policyType]}</TableCell>
                        <TableCell>
                          {formatDisplayDate(policy.expiryDate)}
                          <p className="text-xs text-muted-foreground">{expiryText(policy, today)}</p>
                        </TableCell>
                        <TableCell>
                          <PolicyStatusBadge status={getPolicyStatus(policy, today)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => setRenewing(policy)}>
                            Renew
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">Premiums due</h2>
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
            {premiums.length === 0 ? (
              <EmptyState message="No premiums are due in this period." />
            ) : (
              <PolicyPaymentsTable payments={premiums} policiesById={policiesById} />
            )}
          </section>
        </>
      )}

      <RenewPolicyDialog policy={renewing} onClose={() => setRenewing(null)} />
    </div>
  )
}
