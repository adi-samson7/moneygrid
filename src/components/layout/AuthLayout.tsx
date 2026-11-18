import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Logo } from '@/components/common/Logo'
import { PageLoader } from '@/components/common/PageLoader'

/** Centered shell shared by the login, registration and password pages. */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <Logo size="lg" stacked className="mb-6" />
      <div className="w-full max-w-sm">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}
