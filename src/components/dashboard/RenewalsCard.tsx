import { Link } from 'react-router-dom'
import { PolicyStatusBadge } from '@/components/policies/PolicyStatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { POLICY_TYPE_LABELS, type Policy } from '@/types/policy'
import { daysBetweenISO, formatDisplayDate, todayISO } from '@/utils/dates'
import { getPolicyStatus } from '@/utils/policy-rules'

interface RenewalsCardProps {
  /** Policies that are expiring soon or already expired, soonest expiry first. */
  policies: Policy[]
}

export function RenewalsCard({ policies }: RenewalsCardProps) {
  const today = todayISO()
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Upcoming policy renewals</CardTitle>
        <Link to="/policies/renewals" className="text-sm text-primary underline-offset-4 hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {policies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No policies are close to expiry.</p>
        ) : (
          <ul className="divide-y">
            {policies.map((policy) => {
              const days = daysBetweenISO(today, policy.expiryDate)
              return (
                <li key={policy.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <Link to={`/policies/${policy.id}`} className="truncate font-medium hover:underline">
                      {policy.policyName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {POLICY_TYPE_LABELS[policy.policyType]} · Expires {formatDisplayDate(policy.expiryDate)}
                      {days >= 0 ? ` (${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`})` : ''}
                    </p>
                  </div>
                  <PolicyStatusBadge status={getPolicyStatus(policy, today)} />
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
