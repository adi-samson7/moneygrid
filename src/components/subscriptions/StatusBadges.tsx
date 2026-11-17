import { Badge } from '@/components/ui/badge'
import type { PaymentStatus, SubscriptionStatus } from '@/types/subscription'

const SUBSCRIPTION_STYLES: Record<SubscriptionStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  paused: { label: 'Paused', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
  expired: { label: 'Expired', className: 'bg-muted text-muted-foreground' },
}

const PAYMENT_STYLES: Record<PaymentStatus, { label: string; className: string }> = {
  upcoming: { label: 'Upcoming', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  paid: { label: 'Paid', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  skipped: { label: 'Skipped', className: 'bg-muted text-muted-foreground' },
}

export const SUBSCRIPTION_STATUS_LABELS = Object.fromEntries(
  Object.entries(SUBSCRIPTION_STYLES).map(([key, value]) => [key, value.label]),
) as Record<SubscriptionStatus, string>

export const PAYMENT_STATUS_LABELS = Object.fromEntries(
  Object.entries(PAYMENT_STYLES).map(([key, value]) => [key, value.label]),
) as Record<PaymentStatus, string>

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const { label, className } = SUBSCRIPTION_STYLES[status]
  return <Badge className={className}>{label}</Badge>
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { label, className } = PAYMENT_STYLES[status]
  return <Badge className={className}>{label}</Badge>
}
