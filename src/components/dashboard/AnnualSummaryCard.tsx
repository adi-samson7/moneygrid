import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnnualSummary } from '@/utils/dashboard-stats'
import { formatTotals } from '@/utils/money'

interface AnnualSummaryCardProps {
  summary: AnnualSummary
  currency: string
}

export function AnnualSummaryCard({ summary, currency }: AnnualSummaryCardProps) {
  const rows: [string, string, boolean][] = [
    ['Subscriptions', formatTotals(summary.subscriptions, currency), false],
    ['Policy premiums', formatTotals(summary.policies, currency), false],
    ['Total recurring', formatTotals(summary.combined, currency), true],
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Annual spending</CardTitle>
        <CardDescription>Estimated yearly cost of what is active. Insurance coverage is not counted.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3">
          {rows.map(([label, value, emphasis]) => (
            <div key={label} className={`flex items-baseline justify-between gap-4 ${emphasis ? 'border-t pt-3' : ''}`}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className={emphasis ? 'text-lg font-semibold' : 'text-sm font-medium'}>{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
