import { useId, useState } from 'react'
import { ChevronRight, LogOut } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { Logo } from '@/components/common/Logo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { navigation, type NavItem } from '@/routes/navigation'
import { useAuthStore } from '@/stores/auth.store'

interface SidebarNavProps {
  /** Called after a link is clicked (used to close the mobile drawer). */
  onNavigate?: () => void
}

const COLLAPSED_KEY = 'moneygrid-nav-collapsed'

/** Which groups the visitor collapsed, remembered in this browser. Everything starts expanded. */
function readCollapsed(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeCollapsed(labels: string[]): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(labels))
  } catch {
    // The menu still works for this visit.
  }
}

const isWithin = (pathname: string, to: string) => pathname === to || pathname.startsWith(to + '/')

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const profile = useAuthStore((s) => s.profile)
  const logout = useAuthStore((s) => s.logout)
  const { pathname } = useLocation()
  // A page inside a collapsed group always opens that group, so the current page is never hidden.
  // This applies on first load and whenever the address changes (a link elsewhere, the back button).
  // Collapsing by hand does not change the address, so it stays collapsed.
  const groupOf = (path: string) => navigation.find((item) => item.children && isWithin(path, item.to))?.label
  const [collapsed, setCollapsed] = useState<string[]>(() => readCollapsed().filter((label) => label !== groupOf(pathname)))
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    const group = groupOf(pathname)
    if (group && collapsed.includes(group)) setCollapsed(collapsed.filter((label) => label !== group))
  }

  const toggle = (label: string) =>
    setCollapsed((current) => {
      const next = current.includes(label) ? current.filter((l) => l !== label) : [...current, label]
      writeCollapsed(next)
      return next
    })

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6" aria-label="Main">
        {navigation.map((item) =>
          item.children ? (
            <NavGroup
              key={item.to}
              item={item}
              open={!collapsed.includes(item.label)}
              active={isWithin(pathname, item.to)}
              onToggle={() => toggle(item.label)}
              onNavigate={onNavigate}
            />
          ) : (
            <NavLink key={item.to} to={item.to} end onClick={onNavigate} className={linkClass}>
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ),
        )}
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

interface NavGroupProps {
  item: NavItem
  open: boolean
  /** The current page is inside this group. */
  active: boolean
  onToggle: () => void
  onNavigate?: () => void
}

/** A heading that opens and closes its list of pages. */
function NavGroup({ item, open, active, onToggle, onNavigate }: NavGroupProps) {
  const listId = useId()
  const Icon = item.icon

  return (
    <div className="pt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors outline-none',
          'hover:bg-white/50 focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-white/10',
          // When folded away, the heading itself shows that the current page is inside it.
          active && !open ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Icon className="size-4" />
        <span className="flex-1">{item.label}</span>
        <ChevronRight className={cn('size-4 transition-transform duration-200', open && 'rotate-90')} aria-hidden />
      </button>

      {/* The grid-rows trick animates height; `inert` keeps hidden links out of the tab order. */}
      <div
        id={listId}
        inert={!open}
        className={cn('grid transition-[grid-template-rows] duration-200 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="ml-4 space-y-1 border-l border-foreground/10 py-1 pl-3">
            {item.children?.map((child) => (
              <NavLink key={child.to} to={child.to} end onClick={onNavigate} className={linkClass}>
                {child.label}
              </NavLink>
            ))}
          </div>
        </div>
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
