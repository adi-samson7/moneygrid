import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MODULE_COLORS } from '@/utils/chart-colors'
import type { MonthPoint } from '@/utils/dashboard-stats'
import { formatMoney } from '@/utils/money'

interface MonthlyExpenditureChartProps {
  data: MonthPoint[]
  currency: string
  /** Paid payments left out because they are in another currency. */
  excluded: number
}

export function MonthlyExpenditureChart({ data, currency, excluded }: MonthlyExpenditureChartProps) {
  const total = data.reduce((sum, m) => sum + m.subscriptions + m.policies, 0)
  const money = (value: unknown) => formatMoney(Math.round(Number(value) * 100), currency)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly expenditure</CardTitle>
        <CardDescription>
          Payments marked as paid over the last {data.length} months, in {currency}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No paid payments in this period yet. Mark payments as paid to see your spending here.
          </p>
        ) : (
          <div
            className="h-64"
            role="img"
            aria-label={`Bar chart of paid subscription and policy payments per month, in ${currency}. ${data
              .map((m) => `${m.label}: ${money(m.subscriptions + m.policies)}`)
              .join(', ')}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.15} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} tickFormatter={(v) => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(Number(v))} />
                <Tooltip formatter={(value) => money(value)} cursor={{ fill: 'currentColor', fillOpacity: 0.08 }} />
                <Legend />
                <Bar dataKey="subscriptions" name="Subscriptions" stackId="spend" fill={MODULE_COLORS.subscription} />
                <Bar dataKey="policies" name="Policy premiums" stackId="spend" fill={MODULE_COLORS.policy} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {excluded > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {excluded} paid payment{excluded === 1 ? '' : 's'} in other currencies {excluded === 1 ? 'is' : 'are'} not shown.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
