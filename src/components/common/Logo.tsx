import { cn } from '@/lib/utils'

const SIZES = {
  sm: { mark: 'size-7', text: 'text-base', gap: 'gap-2' },
  md: { mark: 'size-9', text: 'text-lg', gap: 'gap-2.5' },
  lg: { mark: 'size-16', text: 'text-3xl', gap: 'gap-3' },
} as const

interface LogoProps {
  size?: keyof typeof SIZES
  /** Stack the mark above the name (used on the sign-in pages). */
  stacked?: boolean
  className?: string
}

/** The Money Grid mark and name. The image is decorative because the name sits right next to it. */
export function Logo({ size = 'md', stacked = false, className }: LogoProps) {
  const s = SIZES[size]
  return (
    <span className={cn('inline-flex items-center font-semibold tracking-tight', s.gap, stacked && 'flex-col', className)}>
      <img
        src="/logo-mark.png"
        alt=""
        width={256}
        height={256}
        className={cn('shrink-0 rounded-[22%] shadow-[0_6px_18px_-6px_oklch(0.4_0.2_280/0.55)]', s.mark)}
      />
      <span className={s.text}>
        Money<span className="bg-gradient-to-r from-violet-500 to-blue-500 bg-clip-text text-transparent">Grid</span>
      </span>
    </span>
  )
}
