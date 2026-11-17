import { Badge } from '@/components/ui/badge'
import type { PolicyStatus } from '@/types/policy'

const STYLES: Record<PolicyStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  expiring_soon: { label: 'Expiring soon', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  expired: { label: 'Expired', className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
}

export const POLICY_STATUS_LABELS = Object.fromEntries(
  Object.entries(STYLES).map(([key, value]) => [key, value.label]),
) as Record<PolicyStatus, string>

export function PolicyStatusBadge({ status }: { status: PolicyStatus }) {
  const { label, className } = STYLES[status]
  return <Badge className={className}>{label}</Badge>
}
