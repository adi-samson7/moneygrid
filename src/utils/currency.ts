export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const

export type CurrencyCode = (typeof CURRENCIES)[number]

export const DEFAULT_CURRENCY: CurrencyCode = 'INR'
