import { Card, CardContent } from '@/components/ui/card'

interface SummaryCardProps {
  title: string
  value: string
  hint?: string
}

export function SummaryCard({ title, value, hint }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
