/** Money is stored as integer minor units (paise/cents). All supported currencies use 2 decimals. */

export const toMinor = (amount: string | number): number => Math.round(Number(amount) * 100)

export const fromMinor = (minor: number): string => (minor / 100).toFixed(2)

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100)
}

/** Coverage is optional, so a zero amount means "not entered" and is shown as a dash. */
export const formatCoverage = (minor: number, currency: string): string => (minor === 0 ? '—' : formatMoney(minor, currency))

/** Totals keyed by currency, in minor units. Currencies are never mixed or converted. */
export type CurrencyTotals = Record<string, number>

/** e.g. "₹1,499.00 · $15.49", or the fallback currency's zero when there is nothing. */
export function formatTotals(totals: CurrencyTotals, fallbackCurrency: string): string {
  const entries = Object.entries(totals).filter(([, minor]) => minor !== 0)
  if (entries.length === 0) return formatMoney(0, fallbackCurrency)
  return entries.map(([currency, minor]) => formatMoney(Math.round(minor), currency)).join(' · ')
}
