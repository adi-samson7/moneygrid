import { Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataStatus } from '@/components/common/DataStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { selectClassName } from '@/components/common/SelectField'
import { SummaryCard } from '@/components/common/SummaryCard'
import { AnnualSummaryCard } from '@/components/dashboard/AnnualSummaryCard'
import {
  CategorySpendingChart,
  ChartFallback,
  HistoricalTrendChart,
  PolicyPremiumChart,
  PriceComparisonChart,
} from '@/components/dashboard/lazy-charts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePolicyData } from '@/hooks/usePolicyData'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import { useAuthStore } from '@/stores/auth.store'
import {
  amountIn,
  availableCurrencies,
  expiringPolicies,
  policySummaryByType,
  priceComparison,
  upcomingPremiums,
} from '@/utils/analytics-stats'
import { annualSummary, categorySpending, monthlyExpenditure } from '@/utils/dashboard-stats'
import { formatDisplayDate, todayISO } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { annualPremiumTotals, coverageTotals, policiesInForce } from '@/utils/policy-stats'
import { activeSubscriptions, annualTotals, monthlyTotals } from '@/utils/subscription-stats'

const HISTORY_MONTHS = 12
const PREMIUM_WINDOW_DAYS = 30

export default function AnalyticsPage() {
  const subData = useSubscriptionData()
  const polData = usePolicyData()
  const preferred = useAuthStore((s) => s.profile?.preferredCurrency ?? 'INR')
  const [chosen, setChosen] = useState<string | null>(null)

  const { subscriptions, payments: subPayments } = subData
  const { policies, payments: policyPayments } = polData
  const ready = subData.status === 'ready' && polData.status === 'ready'

  const currencies = useMemo(() => availableCurrencies(subscriptions, policies), [subscriptions, policies])
  // Charts cannot mix currencies, so analytics shows one at a time.
  const currency =
    chosen && currencies.includes(chosen) ? chosen : currencies.includes(preferred) ? preferred : (currencies[0] ?? preferred)

  const view = useMemo(() => {
    const today = todayISO()
    const money = (minor: number) => formatMoney(minor, currency)
    const subsAnnual = amountIn(annualTotals(subscriptions), currency)
    const premiums = amountIn(annualPremiumTotals(policies, today), currency)
    const due = upcomingPremiums(policyPayments, policies, currency, PREMIUM_WINDOW_DAYS, today)
    return {
      money,
      activeSubscriptions: activeSubscriptions(subscriptions).filter((s) => s.currency === currency).length,
      monthlySpend: amountIn(monthlyTotals(subscriptions), currency),
      annualSpend: subsAnnual,
      activePolicies: policiesInForce(policies, today).filter((p) => p.currency === currency).length,
      annualPremiums: premiums,
      coverage: amountIn(coverageTotals(policies, today), currency),
      due,
      expiring: expiringPolicies(policies, today),
      totalRecurring: subsAnnual + premiums,
      categories: categorySpending(subscriptions, [], currency, today).data,
      prices: priceComparison(subscriptions, currency),
      policyRows: policySummaryByType(policies, currency, today),
      history: monthlyExpenditure(subPayments, policyPayments, currency, HISTORY_MONTHS, today).data,
      summary: (() => {
        const full = annualSummary(subscriptions, policies, today)
        const only = (totals: Record<string, number>) => (currency in totals ? { [currency]: totals[currency] } : {})
        return { subscriptions: only(full.subscriptions), policies: only(full.policies), combined: only(full.combined) }
      })(),
    }
  }, [subscriptions, subPayments, policies, policyPayments, currency])

  const reload = () => {
    subData.reload()
    polData.reload()
  }
  const { money } = view

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Understand your recurring spending.</p>
        </div>
        {ready && currencies.length > 1 && (
          <div className="space-y-1">
            <label htmlFor="analyticsCurrency" className="text-xs text-muted-foreground">
              Currency
            </label>
            <select id="analyticsCurrency" className={`${selectClassName} sm:w-32`} value={currency} onChange={(e) => setChosen(e.target.value)}>
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!ready ? (
        <DataStatus status={subData.status === 'error' || polData.status === 'error' ? 'error' : 'loading'} onRetry={reload} />
      ) : subscriptions.length === 0 && policies.length === 0 ? (
        <EmptyState message="Nothing to analyse yet. Add a subscription or a policy to see your spending.">
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <Link to="/subscriptions/all" className="text-primary underline-offset-4 hover:underline">
              Add a subscription
            </Link>
            <Link to="/policies/all" className="text-primary underline-offset-4 hover:underline">
              Add a policy
            </Link>
          </div>
        </EmptyState>
      ) : (
        <>
          {currencies.length > 1 && (
            <p className="text-sm text-muted-foreground">
              Figures are shown in {currency}. You also have records in {currencies.filter((c) => c !== currency).join(', ')}; use the currency
              selector to see them. Currencies are never added together.
            </p>
          )}

          <section aria-labelledby="overview-heading" className="space-y-4">
            <h2 id="overview-heading" className="text-lg font-semibold tracking-tight">
              Overview
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryCard title="Active subscriptions" value={String(view.activeSubscriptions)} />
              <SummaryCard title="Monthly subscription spending" value={money(view.monthlySpend)} hint="Averaged per month" />
              <SummaryCard title="Annual subscription spending" value={money(view.annualSpend)} />
              <SummaryCard title="Active policies" value={String(view.activePolicies)} />
              <SummaryCard title="Annual policy premiums" value={money(view.annualPremiums)} hint="Premiums only" />
              <SummaryCard title="Total coverage" value={money(view.coverage)} hint="Insured amount, not a cost" />
              <SummaryCard
                title={`Premiums due in ${PREMIUM_WINDOW_DAYS} days`}
                value={String(view.due.count)}
                hint={view.due.count > 0 ? money(view.due.totalMinor) : undefined}
              />
              <SummaryCard title="Policies expiring soon" value={String(view.expiring.length)} />
              <SummaryCard title="Total recurring per year" value={money(view.totalRecurring)} hint="Subscriptions plus premiums" />
            </div>
          </section>

          <section aria-labelledby="subs-heading" className="space-y-4">
            <h2 id="subs-heading" className="text-lg font-semibold tracking-tight">
              Subscriptions
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <Suspense fallback={<ChartFallback />}>
                <CategorySpendingChart
                  data={view.categories}
                  currency={currency}
                  excluded={0}
                  title="Spending by category"
                  description={`Monthly cost of active subscriptions by category, in ${currency}.`}
                />
              </Suspense>
              <Suspense fallback={<ChartFallback />}>
                <PriceComparisonChart data={view.prices} currency={currency} />
              </Suspense>
            </div>
          </section>

          <section aria-labelledby="policies-heading" className="space-y-4">
            <h2 id="policies-heading" className="text-lg font-semibold tracking-tight">
              Policies
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <Suspense fallback={<ChartFallback />}>
                <PolicyPremiumChart rows={view.policyRows} currency={currency} />
              </Suspense>
              <Card>
                <CardHeader>
                  <CardTitle>Coverage by type</CardTitle>
                  <CardDescription>Insured amounts, shown separately from what you spend.</CardDescription>
                </CardHeader>
                <CardContent>
                  {view.policyRows.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No active policies in {currency}.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Policies</TableHead>
                          <TableHead className="text-right">Coverage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {view.policyRows.map((row) => (
                          <TableRow key={row.type}>
                            <TableCell>{row.label}</TableCell>
                            <TableCell className="text-right">{row.count}</TableCell>
                            <TableCell className="text-right">{row.coverage > 0 ? money(Math.round(row.coverage * 100)) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {view.expiring.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Expiring soon</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y text-sm">
                    {view.expiring.map((policy) => (
                      <li key={policy.id} className="flex items-center justify-between gap-3 py-2">
                        <Link to={`/policies/${policy.id}`} className="font-medium hover:underline">
                          {policy.policyName}
                        </Link>
                        <span className="text-muted-foreground">Expires {formatDisplayDate(policy.expiryDate)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </section>

          <section aria-labelledby="combined-heading" className="space-y-4">
            <h2 id="combined-heading" className="text-lg font-semibold tracking-tight">
              Combined
            </h2>
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <Suspense fallback={<ChartFallback />}>
                  <HistoricalTrendChart data={view.history} currency={currency} />
                </Suspense>
              </div>
              <div className="lg:col-span-2">
                <AnnualSummaryCard summary={view.summary} currency={currency} />
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
