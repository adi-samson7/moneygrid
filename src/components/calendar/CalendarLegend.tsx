import { CALENDAR_COLORS, type CalendarColor } from '@/utils/calendar-events'

const ITEMS: { color: CalendarColor; label: string }[] = [
  { color: 'subscription', label: 'Subscription payments' },
  { color: 'policy', label: 'Policy premiums and renewals' },
  { color: 'overdue', label: 'Overdue' },
  { color: 'inactive', label: 'Cancelled, expired or skipped' },
]

export function CalendarLegend() {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Color legend">
        {ITEMS.map(({ color, label }) => (
          <li key={color} className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ backgroundColor: CALENDAR_COLORS[color] }} aria-hidden />
            {label}
          </li>
        ))}
      </ul>
      <p>
        <span aria-hidden>✓</span> paid · <span aria-hidden>!</span> overdue · <span aria-hidden>–</span> skipped · dashed outline = expected, not yet due
      </p>
    </div>
  )
}
