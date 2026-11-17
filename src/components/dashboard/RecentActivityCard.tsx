import { formatDistanceToNow } from 'date-fns'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ActivityEntry } from '@/types/activity'
import { ModuleBadge } from './ModuleBadge'

interface RecentActivityCardProps {
  entries: ActivityEntry[]
}

export function RecentActivityCard({ entries }: RecentActivityCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your recent additions, edits and payment updates will appear here.</p>
        ) : (
          <ul className="divide-y">
            {entries.map((entry) => {
              const path = entry.relatedType === 'subscription' ? 'subscriptions' : 'policies'
              return (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <ModuleBadge kind={entry.relatedType} />
                    {entry.relatedId ? (
                      <Link to={`/${path}/${entry.relatedId}`} className="truncate hover:underline">
                        {entry.message}
                      </Link>
                    ) : (
                      <span className="truncate">{entry.message}</span>
                    )}
                  </div>
                  <time dateTime={entry.createdAt} className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                  </time>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
