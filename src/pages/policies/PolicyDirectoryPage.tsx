import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { DataStatus } from '@/components/common/DataStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { PolicyStatusBadge } from '@/components/policies/PolicyStatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { usePolicyData } from '@/hooks/usePolicyData'
import { POLICY_TYPE_LABELS } from '@/types/policy'
import { BILLING_CYCLE_CONFIG } from '@/utils/billing'
import { formatDisplayDate } from '@/utils/dates'
import { formatCoverage, formatMoney } from '@/utils/money'
import { getPolicyStatus } from '@/utils/policy-rules'

/** Browse every policy as a card; each card opens that policy's full details. */
export default function PolicyDirectoryPage() {
  const { status, policies, reload } = usePolicyData()
  const sorted = useMemo(() => [...policies].sort((a, b) => a.policyName.localeCompare(b.policyName)), [policies])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Policy Details</h1>
        <p className="mt-1 text-sm text-muted-foreground">Coverage, premiums and renewal history for each policy.</p>
      </div>

      {status !== 'ready' ? (
        <DataStatus status={status} onRetry={reload} />
      ) : sorted.length === 0 ? (
        <EmptyState message="You haven't added any policies yet.">
          <Link to="/policies/all" className="text-sm text-primary underline-offset-4 hover:underline">
            Go to All Policies to add one
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((policy) => (
            <Link key={policy.id} to={`/policies/${policy.id}`} className="block">
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{policy.policyName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {policy.provider} · {POLICY_TYPE_LABELS[policy.policyType]}
                      </p>
                    </div>
                    <PolicyStatusBadge status={getPolicyStatus(policy)} />
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Coverage</dt>
                      <dd className="font-medium">{formatCoverage(policy.coverageAmountMinor, policy.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Premium</dt>
                      <dd className="font-medium">
                        {formatMoney(policy.premiumAmountMinor, policy.currency)}
                        <span className="text-xs font-normal text-muted-foreground"> / {BILLING_CYCLE_CONFIG[policy.billingCycle].label.toLowerCase()}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Expires</dt>
                      <dd className="font-medium">{formatDisplayDate(policy.expiryDate)}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
