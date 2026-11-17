import { PageLoader } from '@/components/common/PageLoader'
import { Button } from '@/components/ui/button'

interface DataStatusProps {
  status: 'loading' | 'error'
  onRetry: () => void
}

/** Shown in place of a page's content while data loads or after loading fails. */
export function DataStatus({ status, onRetry }: DataStatusProps) {
  if (status === 'loading') return <PageLoader />
  return (
    <div role="alert" className="flex flex-col items-center gap-4 rounded-xl border border-destructive/30 p-12 text-center">
      <p className="text-sm text-destructive">We could not load your data.</p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
