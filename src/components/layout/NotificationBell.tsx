import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useNotificationsStore } from '@/stores/notifications.store'

/** Bell with an unread count. Opens the notifications page. */
export function NotificationBell() {
  const unread = useNotificationsStore((s) => s.items.filter((n) => !n.read).length)
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'

  return (
    <Link
      to="/notifications"
      aria-label={label}
      title="Notifications"
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative')}
    >
      <Bell />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
}
