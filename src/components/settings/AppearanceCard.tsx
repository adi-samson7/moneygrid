import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { selectClassName } from '@/components/common/SelectField'
import { useTheme, type ThemePreference } from '@/lib/theme'

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match my device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Theme choice. It is remembered in this browser only. */
export function AppearanceCard() {
  const { preference, setTheme } = useTheme()
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose light or dark, or follow your device. You can also use the sun/moon button at the top.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          <Label htmlFor="theme">Theme</Label>
          <select id="theme" className={selectClassName} value={preference} onChange={(e) => setTheme(e.target.value as ThemePreference)}>
            {OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </CardContent>
    </Card>
  )
}
