import { useSyncExternalStore } from 'react'

/** Light, dark, or follow the device setting. The choice is remembered in this browser; dark until chosen. */
export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'moneygrid-theme'
/** What a first-time visitor sees. "system" is a choice people make explicitly. */
const DEFAULT_THEME: ThemePreference = 'dark'

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME // storage can be blocked (private windows)
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return preference
}

let preference: ThemePreference = readPreference()
const listeners = new Set<() => void>()

function apply(): void {
  const dark = resolveTheme(preference) === 'dark'
  document.documentElement.classList.toggle('dark', dark)
}

function emit(): void {
  apply()
  listeners.forEach((listener) => listener())
}

/** Applies the saved theme and keeps "system" in step with the device. Call once before rendering. */
export function initTheme(): void {
  preference = readPreference()
  apply()
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (preference === 'system') emit()
    })
  }
}

export function setTheme(next: ThemePreference): void {
  preference = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // The choice still applies for this visit.
  }
  emit()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useTheme(): { preference: ThemePreference; resolved: ResolvedTheme; setTheme: typeof setTheme } {
  const current = useSyncExternalStore(subscribe, () => preference, () => DEFAULT_THEME)
  return { preference: current, resolved: resolveTheme(current), setTheme }
}
