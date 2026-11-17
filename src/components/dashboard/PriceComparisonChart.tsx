import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BILLING_CYCLE_CONFIG } from '@/utils/billing'
import { CATEGORY_COLORS } from '@/utils/chart-colors'
import { formatMoney } from '@/utils/money'
import type { PriceBar } from '@/utils/analytics-stats'

interface PriceComparisonChartProps {
  data: PriceBar[]
  currency: string
}

/** Horizontal bars of what each active subscription costs per month, so different cycles compare fairly. */
export function PriceComparisonChart({ data, currency }: PriceComparisonChartProps) {
  const money = (value: unknown) => formatMoney(Math.round(Number(value) * 100), currency)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price comparison</CardTitle>
        <CardDescription>Monthly cost of each active subscription in {currency}. Yearly and weekly prices are converted to a monthly amount.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No active subscriptions in {currency}.</p>
        ) : (
          <div
            style={{ height: Math.max(160, data.length * 40 + 40) }}
            role="img"
            aria-label={`Bar chart of monthly cost per subscription in ${currency}. ${data
              .map((s) => `${s.name}: ${money(s.monthly)} per month (billed ${BILLING_CYCLE_CONFIG[s.cycle].label.toLowerCase()})`)
              .join(', ')}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" strokeOpacity={0.15} />
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(Number(v))} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} width={110} />
                <Tooltip formatter={(value) => money(value)} cursor={{ fill: 'currentColor', fillOpacity: 0.08 }} />
                <Bar dataKey="monthly" name="Per month" radius={[0, 4, 4, 0]}>
                  {data.map((bar, i) => (
                    <Cell key={bar.id} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
