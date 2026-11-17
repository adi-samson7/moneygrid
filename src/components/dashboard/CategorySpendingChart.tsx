import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CATEGORY_COLORS } from '@/utils/chart-colors'
import type { CategorySlice } from '@/utils/dashboard-stats'
import { formatMoney } from '@/utils/money'

interface CategorySpendingChartProps {
  data: CategorySlice[]
  currency: string
  /** Active records left out because they are in another currency. */
  excluded: number
  title?: string
  description?: string
}

export function CategorySpendingChart({ data, currency, excluded, title, description }: CategorySpendingChartProps) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0)
  const money = (value: unknown) => formatMoney(Math.round(Number(value) * 100), currency)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title ?? 'Spending by category'}</CardTitle>
        <CardDescription>{description ?? `Monthly cost of active subscriptions and policy premiums, in ${currency}.`}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No active subscriptions or policies to chart yet.</p>
        ) : (
          <div className="grid items-center gap-4 sm:grid-cols-2">
            <div
              className="h-52"
              role="img"
              aria-label={`Pie chart of monthly spending by category. ${data.map((s) => `${s.name}: ${money(s.value)}`).join(', ')}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={2} stroke="none">
                    {data.map((slice, i) => (
                      <Cell key={`${slice.kind}-${slice.name}`} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => money(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2 text-sm">
              {data.map((slice, i) => (
                <li key={`${slice.kind}-${slice.name}`} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                    <span className="truncate">{slice.name}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {money(slice.value)} · {total > 0 ? Math.round((slice.value / total) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {excluded > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {excluded} active record{excluded === 1 ? '' : 's'} in other currencies {excluded === 1 ? 'is' : 'are'} not shown.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
