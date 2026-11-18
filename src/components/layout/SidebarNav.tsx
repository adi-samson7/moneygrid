import { LogOut } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Logo } from '@/components/common/Logo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { navigation } from '@/routes/navigation'
import { useAuthStore } from '@/stores/auth.store'

interface SidebarNavProps {
  /** Called after a link is clicked (used to close the mobile drawer). */
  onNavigate?: () => void
}

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const profile = useAuthStore((s) => s.profile)
  const logout = useAuthStore((s) => s.logout)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6" aria-label="Main">
        {navigation.map(({ label, to, icon: Icon, children }) => (
          <div key={to}>
            {children ? (
              <div className="mt-4 flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground">
                <Icon className="size-4" />
                {label}
              </div>
            ) : (
              <NavLink to={to} end onClick={onNavigate} className={linkClass}>
                <Icon className="size-4" />
                {label}
              </NavLink>
            )}
            {children && (
              <div className="ml-4 space-y-1 border-l border-foreground/10 pl-3">
                {children.map((child) => (
                  <NavLink key={child.to} to={child.to} end onClick={onNavigate} className={linkClass}>
                    {child.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-foreground/10 p-3">
        <div className="min-w-0 flex-1 px-2">
          <p className="truncate text-sm font-medium">{profile?.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Log out" title="Log out" onClick={() => logout()}>
          <LogOut className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function linkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
    isActive
      ? 'bg-accent font-medium text-accent-foreground shadow-[inset_0_1px_0_var(--glass-shine)]'
      : 'text-muted-foreground hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10',
  )
}
