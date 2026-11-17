/**
 * Safe localStorage JSON helpers. Reads never throw and never return the wrong shape: localStorage
 * can be edited or damaged outside the app, so unexpected data is treated as missing.
 * Writes throw so callers can report failures (e.g. storage full).
 */

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A stored list. Anything that is not a list is read as empty, and non-object entries are dropped. */
export function readArray<T>(key: string): T[] {
  const value = readJson<unknown>(key, [])
  return Array.isArray(value) ? (value.filter(isRecord) as T[]) : []
}

/** A stored object (not a list, string or null), or the fallback. */
export function readObject<T extends object>(key: string, fallback: T): T {
  const value = readJson<unknown>(key, fallback)
  return isRecord(value) ? (value as T) : fallback
}

export function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function removeKey(key: string): void {
  localStorage.removeItem(key)
}
