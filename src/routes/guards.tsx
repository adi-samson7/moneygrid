import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { PageLoader } from '@/components/common/PageLoader'
import { useAuthStore } from '@/stores/auth.store'

interface LocationState {
  from?: string
}

/** Blocks signed-out visitors from private pages and remembers where they were going. */
export function ProtectedRoute() {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="p-8">
        <PageLoader />
      </div>
    )
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/** Keeps signed-in users away from login/registration pages. */
export function PublicOnlyRoute() {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="p-8">
        <PageLoader />
      </div>
    )
  }
  if (status === 'authenticated') {
    const from = (location.state as LocationState | null)?.from
    return <Navigate to={from ?? '/'} replace />
  }
  return <Outlet />
}
