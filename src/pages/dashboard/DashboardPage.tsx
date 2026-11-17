import { Suspense, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { DataStatus } from '@/components/common/DataStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { SummaryCard } from '@/components/common/SummaryCard'
import { AnnualSummaryCard } from '@/components/dashboard/AnnualSummaryCard'
import { CategorySpendingChart, ChartFallback, MonthlyExpenditureChart } from '@/components/dashboard/lazy-charts'
import { RecentActivityCard } from '@/components/dashboard/RecentActivityCard'
import { RenewalsCard } from '@/components/dashboard/RenewalsCard'
import { UpcomingPaymentsCard } from '@/components/dashboard/UpcomingPaymentsCard'
import { useActivity } from '@/hooks/useActivity'
import { usePolicyData } from '@/hooks/usePolicyData'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import { useAuthStore } from '@/stores/auth.store'
import {
  annualSummary,
  buildUpcomingItems,
  categorySpending,
  dueWithin,
  monthlyExpenditure,
} from '@/utils/dashboard-stats'
import { todayISO } from '@/utils/dates'
import { formatTotals } from '@/utils/money'
import { getPolicyStatus } from '@/utils/policy-rules'
import { policiesInForce } from '@/utils/policy-stats'
import { activeSubscriptions, annualTotals, monthlyTotals, paymentTotals } from '@/utils/subscription-stats'

const UPCOMING_LIST_SIZE = 8

export default function DashboardPage() {
  const subData = useSubscriptionData()
  const polData = usePolicyData()
  const activity = useActivity(8)
  const currency = useAuthStore((s) => s.profile?.preferredCurrency ?? 'INR')

  const { subscriptions, payments: subPayments } = subData
  const { policies, payments: policyPayments } = polData
  const ready = subData.status === 'ready' && polData.status === 'ready'

  // Everything below is derived from the signed-in user's own records, so it updates when they change.
  const view = useMemo(() => {
    const today = todayISO()
    const items = buildUpcomingItems(subscriptions, subPayments, policies, policyPayments, today)
    const week = dueWithin(items, 7, today)
    const month = dueWithin(items, 30, today)
    const renewals = policies
      .filter((p) => ['expiring_soon', 'expired'].includes(getPolicyStatus(p, today)))
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
    return {
      activeSubscriptions: activeSubscriptions(subscriptions).length,
      monthly: monthlyTotals(subscriptions),
      annual: annualTotals(subscriptions),
      activePolicies: policiesInForce(policies, today).length,
      weekCount: week.length,
      monthCount: month.length,
      monthTotals: paymentTotals(month),
      overdueCount: items.filter((i) => i.status === 'overdue').length,
      upcoming: items.slice(0, UPCOMING_LIST_SIZE),
      expiringCount: renewals.filter((p) => getPolicyStatus(p, today) === 'expiring_soon').length,
      expiredCount: renewals.filter((p) => getPolicyStatus(p, today) === 'expired').length,
      renewals: renewals.slice(0, 5),
      expenditure: monthlyExpenditure(subPayments, policyPayments, currency, 6, today),
      categories: categorySpending(subscriptions, policies, currency, today),
      annualSummary: annualSummary(subscriptions, policies, today),
    }
  }, [subscriptions, subPayments, policies, policyPayments, currency])

  const reload = () => {
    subData.reload()
    polData.reload()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Overview of your subscriptions, policies and upcoming obligations.</p>
      </div>

      {!ready ? (
        <DataStatus status={subData.status === 'error' || polData.status === 'error' ? 'error' : 'loading'} onRetry={reload} />
      ) : subscriptions.length === 0 && policies.length === 0 ? (
        <EmptyState message="Nothing to show yet. Add a subscription or a policy to get started.">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard title="Active subscriptions" value={String(view.activeSubscriptions)} />
            <SummaryCard title="Monthly spending" value={formatTotals(view.monthly, currency)} hint="Subscriptions, averaged per month" />
            <SummaryCard title="Annual spending" value={formatTotals(view.annual, currency)} hint="Subscriptions only" />
            <SummaryCard title="Active policies" value={String(view.activePolicies)} />
            <SummaryCard
              title="Upcoming payments"
              value={`${view.weekCount} in 7 days`}
              hint={`${view.monthCount} in 30 days${view.monthCount > 0 ? ` · ${formatTotals(view.monthTotals, currency)}` : ''}${
                view.overdueCount > 0 ? ` · ${view.overdueCount} overdue` : ''
              }`}
            />
            <SummaryCard
              title="Upcoming renewals"
              value={String(view.expiringCount)}
              hint={view.expiredCount > 0 ? `${view.expiredCount} already expired` : 'Policies nearing expiry'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <UpcomingPaymentsCard items={view.upcoming} />
            <RenewalsCard policies={view.renewals} />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Suspense fallback={<ChartFallback />}>
                <MonthlyExpenditureChart data={view.expenditure.data} currency={currency} excluded={view.expenditure.excluded} />
              </Suspense>
            </div>
            <div className="lg:col-span-2">
              <AnnualSummaryCard summary={view.annualSummary} currency={currency} />
            </div>
          </div>

          <Suspense fallback={<ChartFallback />}>
            <CategorySpendingChart data={view.categories.data} currency={currency} excluded={view.categories.excluded} />
          </Suspense>

          <RecentActivityCard entries={activity} />
        </>
      )}
    </div>
  )
}
