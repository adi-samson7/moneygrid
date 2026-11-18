import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'

/** Flips between light and dark. "Follow my device" is available under Settings. */
export function ThemeToggle() {
  const { resolved, setTheme } = useTheme()
  const toDark = resolved === 'light'
  const label = toDark ? 'Switch to dark mode' : 'Switch to light mode'

  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={() => setTheme(toDark ? 'dark' : 'light')}>
      {toDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  )
}
