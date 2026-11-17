import type { ReactNode } from 'react'

interface EmptyStateProps {
  message: string
  /** Optional call to action, e.g. an "Add" button. */
  children?: ReactNode
}

export function EmptyState({ message, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 glass rounded-2xl border border-dashed border-foreground/15 p-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {children}
    </div>
  )
}
