import { Suspense, useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { PageLoader } from '@/components/common/PageLoader'
import { Toaster } from '@/components/ui/sonner'
import { router } from '@/routes'
import { useAuthStore } from '@/stores/auth.store'

export default function App() {
  // Subscribe to auth state once for the whole app.
  useEffect(() => useAuthStore.getState().init(), [])

  return (
    <>
      <Suspense
        fallback={
          <div className="p-8">
            <PageLoader />
          </div>
        }
      >
        <RouterProvider router={router} />
      </Suspense>
      <Toaster richColors />
    </>
  )
}
