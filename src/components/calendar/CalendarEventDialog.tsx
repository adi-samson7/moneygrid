import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  CALENDAR_COLORS,
  CALENDAR_STATE_LABELS,
  type CalendarEventData,
  type CalendarEventKind,
} from '@/utils/calendar-events'
import { formatDisplayDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

const KIND_LABELS: Record<CalendarEventKind, string> = {
  subscription_payment: 'Subscription payment',
  policy_premium: 'Policy premium',
  policy_expiry: 'Policy expiry',
}

interface CalendarEventDialogProps {
  /** The clicked event, or null when closed. */
  event: CalendarEventData | null
  onClose: () => void
}

export function CalendarEventDialog({ event, onClose }: CalendarEventDialogProps) {
  const navigate = useNavigate()

  const rows: [string, string][] = event
    ? [
        ['Type', KIND_LABELS[event.kind]],
        ['Date', formatDisplayDate(event.date)],
        ...(event.amountMinor !== null && event.currency
          ? ([['Amount', formatMoney(event.amountMinor, event.currency)]] as [string, string][])
          : []),
        ['Status', CALENDAR_STATE_LABELS[event.state]],
      ]
    : []

  const openRecord = () => {
    if (!event) return
    navigate(`/${event.ownerType === 'subscription' ? 'subscriptions' : 'policies'}/${event.ownerId}`)
    onClose()
  }

  return (
    <Dialog open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {event && <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: CALENDAR_COLORS[event.color] }} aria-hidden />}
            {event?.name}
          </DialogTitle>
          <DialogDescription>{event && KIND_LABELS[event.kind]}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={openRecord}>{event?.ownerType === 'subscription' ? 'Open subscription' : 'Open policy'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
