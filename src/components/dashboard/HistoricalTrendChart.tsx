import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MODULE_COLORS } from '@/utils/chart-colors'
import type { MonthPoint } from '@/utils/dashboard-stats'
import { formatMoney } from '@/utils/money'

interface HistoricalTrendChartProps {
  data: MonthPoint[]
  currency: string
}

/** Money actually paid each month over the past year. Subscriptions and policy premiums stay separate lines. */
export function HistoricalTrendChart({ data, currency }: HistoricalTrendChartProps) {
  const points = data.map((m) => ({ ...m, total: m.subscriptions + m.policies }))
  const grandTotal = points.reduce((sum, m) => sum + m.total, 0)
  const money = (value: unknown) => formatMoney(Math.round(Number(value) * 100), currency)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending history</CardTitle>
        <CardDescription>
          Payments marked as paid over the last {data.length} months, in {currency}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {grandTotal === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No paid payments in {currency} in this period. Mark payments as paid to build your history.
          </p>
        ) : (
          <div
            className="h-72"
            role="img"
            aria-label={`Line chart of money paid per month in ${currency}. ${points.map((m) => `${m.label}: ${money(m.total)}`).join(', ')}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.15} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} tickFormatter={(v) => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(Number(v))} />
                <Tooltip formatter={(value) => money(value)} />
                <Legend />
                <Line type="monotone" dataKey="subscriptions" name="Subscriptions" stroke={MODULE_COLORS.subscription} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="policies" name="Policy premiums" stroke={MODULE_COLORS.policy} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="total" name="Total" stroke="currentColor" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
