import type { ComponentProps } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export const selectClassName =
  'h-9 w-full rounded-xl border border-input bg-(--field) shadow-[inset_0_1px_2px_oklch(0.3_0.04_265/0.07)] backdrop-blur-sm px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30'

interface SelectFieldProps extends ComponentProps<'select'> {
  label: string
  error?: string
  options: ReadonlyArray<{ value: string; label: string }>
}

/** A labelled native select with an inline validation message. Spread register() onto it. */
export function SelectField({ label, error, options, id, className, ...selectProps }: SelectFieldProps) {
  const fieldId = id ?? selectProps.name
  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(selectClassName, className)}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
