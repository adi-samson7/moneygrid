interface PlaceholderPageProps {
  title: string
  description: string
}

/** Temporary page body until the feature's phase is implemented. */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-8 glass rounded-2xl border border-dashed border-foreground/15 p-12 text-center text-sm text-muted-foreground">
        Coming soon
      </div>
    </div>
  )
}
