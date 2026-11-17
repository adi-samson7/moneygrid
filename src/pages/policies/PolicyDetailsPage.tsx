import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { DataStatus } from '@/components/common/DataStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { PolicyActionButtons } from '@/components/policies/PolicyActionButtons'
import { PolicyFormDialog } from '@/components/policies/PolicyFormDialog'
import { PolicyPaymentsTable } from '@/components/policies/PolicyPaymentsTable'
import { PolicyStatusBadge } from '@/components/policies/PolicyStatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePolicyData } from '@/hooks/usePolicyData'
import { POLICY_TYPE_LABELS } from '@/types/policy'
import { BILLING_CYCLE_CONFIG } from '@/utils/billing'
import { formatDisplayDate } from '@/utils/dates'
import { formatCoverage, formatMoney } from '@/utils/money'
import { getPolicyStatus } from '@/utils/policy-rules'

export default function PolicyDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { status, policies, payments, reload } = usePolicyData()
  const [editOpen, setEditOpen] = useState(false)

  const policy = policies.find((p) => p.id === id)
  const premiums = useMemo(
    () => payments.filter((p) => p.policyId === id).sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [payments, id],
  )

  if (status !== 'ready') return <DataStatus status={status} onRetry={reload} />

  if (!policy) {
    return (
      <EmptyState message="This policy could not be found. It may have been deleted.">
        <Link to="/policies/all" className="text-sm text-primary underline-offset-4 hover:underline">
          Back to all policies
        </Link>
      </EmptyState>
    )
  }

  const details: [string, string][] = [
    ['Insurance company', policy.provider],
    ['Policy type', POLICY_TYPE_LABELS[policy.policyType]],
    ['Policy number', policy.policyNumber || '—'],
    ['Premium', `${formatMoney(policy.premiumAmountMinor, policy.currency)} / ${BILLING_CYCLE_CONFIG[policy.billingCycle].label.toLowerCase()}`],
    ['Coverage amount', formatCoverage(policy.coverageAmountMinor, policy.currency)],
    ['Start date', formatDisplayDate(policy.startDate)],
    ['Expiry date', formatDisplayDate(policy.expiryDate)],
    ['Next premium due', policy.nextPremiumDate ? formatDisplayDate(policy.nextPremiumDate) : '—'],
    ['Renewal reminder', `${policy.reminderDays} days before expiry`],
  ]

  return (
    <div className="space-y-6">
      <Link to="/policies/all" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All policies
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{policy.policyName}</h1>
          <PolicyStatusBadge status={getPolicyStatus(policy)} />
        </div>
        <PolicyActionButtons policy={policy} onEdit={() => setEditOpen(true)} onDeleted={() => navigate('/policies/all', { replace: true })} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {policy.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="mt-0.5 text-sm whitespace-pre-wrap">{policy.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Premium payments</h2>
        {premiums.length === 0 ? (
          <EmptyState message="No premiums are being tracked for this policy right now." />
        ) : (
          <PolicyPaymentsTable payments={premiums} policiesById={new Map([[policy.id, policy]])} showPolicy={false} />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Renewal history</h2>
        {policy.renewals.length === 0 ? (
          <EmptyState message="This policy has not been renewed yet." />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Renewed on</TableHead>
                  <TableHead>Previous expiry</TableHead>
                  <TableHead>New expiry</TableHead>
                  <TableHead>Premium</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...policy.renewals].reverse().map((renewal) => (
                  <TableRow key={renewal.id}>
                    <TableCell>{formatDisplayDate(renewal.renewedOn)}</TableCell>
                    <TableCell>{formatDisplayDate(renewal.previousExpiryDate)}</TableCell>
                    <TableCell>{formatDisplayDate(renewal.newExpiryDate)}</TableCell>
                    <TableCell>{formatMoney(renewal.premiumAmountMinor, policy.currency)}</TableCell>
                    <TableCell>{formatCoverage(renewal.coverageAmountMinor, policy.currency)}</TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground" title={renewal.notes}>
                      {renewal.notes || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <PolicyFormDialog open={editOpen} onOpenChange={setEditOpen} policy={policy} />
    </div>
  )
}
