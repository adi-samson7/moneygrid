import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Logo } from '@/components/common/Logo'
import { PageLoader } from '@/components/common/PageLoader'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useNotificationSync } from '@/hooks/useNotificationSync'
import { NotificationBell } from './NotificationBell'
import { ThemeToggle } from './ThemeToggle'
import { SidebarNav } from './SidebarNav'

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Generates reminders for the signed-in user while they are in the app.
  useNotificationSync()

  return (
    <div className="min-h-screen">
      {/* Persistent sidebar on desktop */}
      <aside className="glass fixed inset-y-3 left-3 hidden w-64 overflow-hidden rounded-3xl lg:block">
        <SidebarNav />
      </aside>

      {/* Drawer on mobile and tablet */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-72">
        <header className="glass sticky top-3 z-30 mx-3 mt-3 flex h-14 items-center gap-3 rounded-2xl px-4 md:mx-8 lg:ml-0 lg:mr-8">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <Logo size="sm" className="lg:hidden" />
          <div className="flex-1" />
          <ThemeToggle />
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
