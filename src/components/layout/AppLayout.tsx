import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { PageLoader } from '@/components/common/PageLoader'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useNotificationSync } from '@/hooks/useNotificationSync'
import { NotificationBell } from './NotificationBell'
import { SidebarNav } from './SidebarNav'

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Generates reminders for the signed-in user while they are in the app.
  useNotificationSync()

  return (
    <div className="min-h-screen bg-background">
      {/* Persistent sidebar on desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card lg:block">
        <SidebarNav />
      </aside>

      {/* Drawer on mobile and tablet */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <span className="font-semibold lg:hidden">Money Grid</span>
          <div className="flex-1" />
          <NotificationBell />
        </header>

        <main className="mx-auto max-w-6xl p-4 md:p-8">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
