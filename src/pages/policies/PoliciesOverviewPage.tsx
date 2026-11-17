import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { DataStatus } from '@/components/common/DataStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { SummaryCard } from '@/components/common/SummaryCard'
import { PolicyFormDialog } from '@/components/policies/PolicyFormDialog'
import { PolicyStatusBadge } from '@/components/policies/PolicyStatusBadge'
import { PaymentStatusBadge } from '@/components/subscriptions/StatusBadges'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePolicyData } from '@/hooks/usePolicyData'
import { useAuthStore } from '@/stores/auth.store'
import { UPCOMING_WINDOW_DAYS } from '@/utils/billing'
import { addDaysISO, formatDisplayDate, todayISO } from '@/utils/dates'
import { formatMoney, formatTotals } from '@/utils/money'
import { effectivePaymentStatus } from '@/utils/payments'
import { getPolicyStatus } from '@/utils/policy-rules'
import { annualPremiumTotals, coverageTotals, policiesInForce } from '@/utils/policy-stats'
import { paymentTotals } from '@/utils/subscription-stats'

export default function PoliciesOverviewPage() {
  const { status, policies, payments, reload } = usePolicyData()
  const currency = useAuthStore((s) => s.profile?.preferredCurrency ?? 'INR')
  const [formOpen, setFormOpen] = useState(false)

  const summary = useMemo(() => {
    const today = todayISO()
    const limit = addDaysISO(today, UPCOMING_WINDOW_DAYS)
    const open = payments.filter((p) => p.status === 'upcoming').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    const dueSoon = open.filter((p) => p.dueDate >= today && p.dueDate <= limit)
    const renewals = policies
      .filter((p) => ['expiring_soon', 'expired'].includes(getPolicyStatus(p, today)))
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
    return {
      inForce: policiesInForce(policies, today).length,
      annual: annualPremiumTotals(policies, today),
      coverage: coverageTotals(policies, today),
      expiringCount: policies.filter((p) => getPolicyStatus(p, today) === 'expiring_soon').length,
      overdue: open.filter((p) => p.dueDate < today).length,
      dueSoon,
      dueSoonTotals: paymentTotals(dueSoon),
      renewals: renewals.slice(0, 5),
      nextPremiums: open.slice(0, 5),
    }
  }, [policies, payments])

  const nameById = new Map(policies.map((p) => [p.id, p.policyName]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Policies Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Summary of your insurance policies.</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus /> Add policy
        </Button>
      </div>

      {status !== 'ready' ? (
        <DataStatus status={status} onRetry={reload} />
      ) : policies.length === 0 ? (
        <EmptyState message="You haven't added any policies yet.">
          <Button onClick={() => setFormOpen(true)}>
            <Plus /> Add your first policy
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard title="Active policies" value={String(summary.inForce)} />
            <SummaryCard title="Annual premiums" value={formatTotals(summary.annual, currency)} hint="Premiums only. Coverage is not included." />
            <SummaryCard title="Total coverage" value={formatTotals(summary.coverage, currency)} hint="Insured amount across active policies" />
            <SummaryCard title="Expiring soon" value={String(summary.expiringCount)} />
            <SummaryCard
              title={`Premiums due in ${UPCOMING_WINDOW_DAYS} days`}
              value={String(summary.dueSoon.length)}
              hint={summary.dueSoon.length > 0 ? formatTotals(summary.dueSoonTotals, currency) : undefined}
            />
            <SummaryCard title="Overdue premiums" value={String(summary.overdue)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Renewals due</CardTitle>
                <Link to="/policies/renewals" className="text-sm text-primary underline-offset-4 hover:underline">
                  View all
                </Link>
              </CardHeader>
              <CardContent>
                {summary.renewals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No policies are close to expiry.</p>
                ) : (
                  <ul className="divide-y">
                    {summary.renewals.map((policy) => (
                      <li key={policy.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                        <div className="min-w-0">
                          <Link to={`/policies/${policy.id}`} className="font-medium hover:underline">
                            {policy.policyName}
                          </Link>
                          <p className="text-xs text-muted-foreground">Expires {formatDisplayDate(policy.expiryDate)}</p>
                        </div>
                        <PolicyStatusBadge status={getPolicyStatus(policy)} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Next premiums</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.nextPremiums.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No premiums are due.</p>
                ) : (
                  <ul className="divide-y">
                    {summary.nextPremiums.map((payment) => (
                      <li key={payment.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                        <div className="min-w-0">
                          <Link to={`/policies/${payment.policyId}`} className="font-medium hover:underline">
                            {nameById.get(payment.policyId) ?? 'Unknown'}
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
          </div>
        </>
      )}

      <PolicyFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}
