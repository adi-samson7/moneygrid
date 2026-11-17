import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MODULE_COLORS } from '@/utils/chart-colors'
import type { PolicyTypeRow } from '@/utils/analytics-stats'
import { formatMoney } from '@/utils/money'

interface PolicyPremiumChartProps {
  rows: PolicyTypeRow[]
  currency: string
}

/** Yearly premiums per policy type. Coverage is shown in a table instead, never mixed into this chart. */
export function PolicyPremiumChart({ rows, currency }: PolicyPremiumChartProps) {
  const money = (value: unknown) => formatMoney(Math.round(Number(value) * 100), currency)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Annual premiums by type</CardTitle>
        <CardDescription>What your active policies cost per year in {currency}.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No active policies in {currency}.</p>
        ) : (
          <div
            className="h-64"
            role="img"
            aria-label={`Bar chart of annual premiums by policy type in ${currency}. ${rows.map((r) => `${r.label}: ${money(r.annualPremium)}`).join(', ')}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.15} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} interval={0} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} tickFormatter={(v) => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(Number(v))} />
                <Tooltip formatter={(value) => money(value)} cursor={{ fill: 'currentColor', fillOpacity: 0.08 }} />
                <Bar dataKey="annualPremium" name="Annual premium" fill={MODULE_COLORS.policy} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
