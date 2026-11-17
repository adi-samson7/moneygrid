import { Link } from 'react-router-dom'
import { PaymentStatusBadge } from '@/components/subscriptions/StatusBadges'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { UpcomingItem } from '@/utils/dashboard-stats'
import { formatDisplayDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { ModuleBadge } from './ModuleBadge'

interface UpcomingPaymentsCardProps {
  items: UpcomingItem[]
}

export function UpcomingPaymentsCard({ items }: UpcomingPaymentsCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Upcoming payments</CardTitle>
        <div className="flex gap-3 text-sm">
          <Link to="/subscriptions/upcoming" className="text-primary underline-offset-4 hover:underline">
            Subscriptions
          </Link>
          <Link to="/policies/renewals" className="text-primary underline-offset-4 hover:underline">
            Premiums
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is due. Upcoming subscription payments and policy premiums appear here.</p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Link to={`/${item.kind === 'subscription' ? 'subscriptions' : 'policies'}/${item.ownerId}`} className="truncate font-medium hover:underline">
                      {item.name}
                    </Link>
                    <ModuleBadge kind={item.kind} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.category} · Due {formatDisplayDate(item.dueDate)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <PaymentStatusBadge status={item.status} />
                  <span className="font-medium">{formatMoney(item.amountMinor, item.currency)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
