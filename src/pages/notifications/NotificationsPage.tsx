import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CalendarClock, CheckCircle2, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { Pagination } from '@/components/common/Pagination'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useNotificationsStore } from '@/stores/notifications.store'
import type { NotificationKind } from '@/types/notification'
import { paginate } from '@/utils/subscription-list'

const PAGE_SIZE = 10

const KIND_ICONS: Record<NotificationKind, { icon: LucideIcon; className: string }> = {
  subscription_due: { icon: CalendarClock, className: 'text-blue-600 dark:text-blue-400' },
  premium_due: { icon: ShieldCheck, className: 'text-emerald-600 dark:text-emerald-400' },
  policy_expiring: { icon: ShieldAlert, className: 'text-amber-600 dark:text-amber-400' },
  payment_overdue: { icon: AlertTriangle, className: 'text-red-600 dark:text-red-400' },
  payment_paid: { icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400' },
}

export default function NotificationsPage() {
  const items = useNotificationsStore((s) => s.items)
  const status = useNotificationsStore((s) => s.status)
  const enabled = useNotificationsStore((s) => s.preferences.inAppNotifications)
  const markRead = useNotificationsStore((s) => s.markRead)
  const markAllRead = useNotificationsStore((s) => s.markAllRead)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(1)

  const unreadCount = items.filter((n) => !n.read).length
  const visible = useMemo(() => (unreadOnly ? items.filter((n) => !n.read) : items), [items, unreadOnly])
  const { pageItems, pageCount, page: currentPage } = paginate(visible, page, PAGE_SIZE)

  const run = async (action: () => Promise<void>) => {
    try {
      await action()
    } catch (error) {
      console.error(error)
      toast.error('Could not update the notification. Please try again.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upcoming payments, expiring policies and overdue items. {unreadCount > 0 ? `${unreadCount} unread.` : 'You are all caught up.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Show" className="glass flex gap-1 rounded-xl p-1">
            <Button size="sm" variant={unreadOnly ? 'ghost' : 'default'} aria-pressed={!unreadOnly} onClick={() => { setUnreadOnly(false); setPage(1) }}>
              All
            </Button>
            <Button size="sm" variant={unreadOnly ? 'default' : 'ghost'} aria-pressed={unreadOnly} onClick={() => { setUnreadOnly(true); setPage(1) }}>
              Unread
            </Button>
          </div>
          <Button variant="outline" size="sm" disabled={unreadCount === 0} onClick={() => run(markAllRead)}>
            Mark all as read
          </Button>
        </div>
      </div>

      {!enabled && (
        <p role="status" className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          In-app notifications are turned off, so no new reminders are created.{' '}
          <Link to="/settings" className="text-primary underline-offset-4 hover:underline">
            Turn them on in Settings
          </Link>
          .
        </p>
      )}

      {status === 'loading' || status === 'idle' ? null : visible.length === 0 ? (
        <EmptyState
          message={
            unreadOnly && items.length > 0
              ? 'No unread notifications.'
              : 'No notifications yet. Reminders for upcoming payments, expiring policies and overdue items appear here.'
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {pageItems.map((n) => {
              const { icon: Icon, className } = KIND_ICONS[n.kind]
              const path = n.relatedType === 'subscription' ? 'subscriptions' : 'policies'
              return (
                <li key={n.id}>
                  <Card className={cn(!n.read && 'border-primary/40 bg-accent/30')}>
                    <CardContent className="flex items-start gap-3">
                      <Icon className={cn('mt-0.5 size-5 shrink-0', className)} aria-hidden />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={cn('text-sm', n.read ? 'font-medium' : 'font-semibold')}>{n.title}</p>
                          {!n.read && (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">New</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{n.description}</p>
                        <p className="text-xs text-muted-foreground">
                          <time dateTime={n.createdAt}>{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</time>
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
                        {n.relatedId && (
                          <Link
                            to={`/${path}/${n.relatedId}`}
                            className="text-primary underline-offset-4 hover:underline"
                            onClick={() => !n.read && run(() => markRead(n.id))}
                          >
                            View
                          </Link>
                        )}
                        {!n.read && (
                          <Button variant="ghost" size="sm" onClick={() => run(() => markRead(n.id))}>
                            Mark as read
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
          <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
