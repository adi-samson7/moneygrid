import { useEffect } from 'react'
import { Link, useRouteError } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Shown by the router when a page fails to render or load (for example a script file could not be
 * fetched). Details go to the console for developers; users get a plain message and a way forward.
 */
export function RouteError() {
  const error = useRouteError()

  useEffect(() => {
    console.error('Page failed to render', error)
  }, [error])

  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This page could not be shown. Your data is safe. Try reloading, or go back to the dashboard.
      </p>
      <div className="flex gap-3">
        <button type="button" className={cn(buttonVariants())} onClick={() => window.location.reload()}>
          Reload page
        </button>
        <Link to="/" className={cn(buttonVariants({ variant: 'outline' }))}>
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
