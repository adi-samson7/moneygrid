import { lazy } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Chart components are loaded on demand. The charting library is large, so the page's cards and
 * lists appear first and the charts follow. Wrap usages in <Suspense fallback={<ChartFallback />}>.
 */
export const MonthlyExpenditureChart = lazy(() =>
  import('./MonthlyExpenditureChart').then((m) => ({ default: m.MonthlyExpenditureChart })),
)
export const CategorySpendingChart = lazy(() =>
  import('./CategorySpendingChart').then((m) => ({ default: m.CategorySpendingChart })),
)
export const PriceComparisonChart = lazy(() =>
  import('./PriceComparisonChart').then((m) => ({ default: m.PriceComparisonChart })),
)
export const HistoricalTrendChart = lazy(() =>
  import('./HistoricalTrendChart').then((m) => ({ default: m.HistoricalTrendChart })),
)
export const PolicyPremiumChart = lazy(() =>
  import('./PolicyPremiumChart').then((m) => ({ default: m.PolicyPremiumChart })),
)

export function ChartFallback() {
  return <Skeleton className="h-72 w-full" role="status" aria-label="Loading chart" />
}
