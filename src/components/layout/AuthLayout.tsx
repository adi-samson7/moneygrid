import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { PageLoader } from '@/components/common/PageLoader'

/** Centered shell shared by the login, registration and password pages. */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <p className="mb-6 text-lg font-semibold tracking-tight">Money Grid</p>
      <div className="w-full max-w-sm">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}
