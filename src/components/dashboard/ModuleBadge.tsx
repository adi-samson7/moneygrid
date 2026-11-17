import { Badge } from '@/components/ui/badge'
import type { RecordKind } from '@/utils/dashboard-stats'

const STYLES: Record<RecordKind, { label: string; className: string }> = {
  subscription: { label: 'Subscription', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  policy: { label: 'Policy', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
}

/** Marks a row as a subscription (blue) or a policy (green) so the two stay distinguishable. */
export function ModuleBadge({ kind }: { kind: RecordKind }) {
  const { label, className } = STYLES[kind]
  return <Badge className={className}>{label}</Badge>
}
