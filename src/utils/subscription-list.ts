import type { Subscription } from '@/types/subscription'
import { UPCOMING_WINDOW_DAYS } from './billing'
import { addDaysISO, todayISO } from './dates'

export type StatusFilter = 'all' | 'active' | 'upcoming' | 'paused' | 'cancelled' | 'expired'
export type SortKey = 'name' | 'amount' | 'nextPayment' | 'created'
export type SortDirection = 'asc' | 'desc'

export interface ListOptions {
  search: string
  status: StatusFilter
  sortKey: SortKey
  sortDirection: SortDirection
}

export function filterAndSortSubscriptions(
  subs: Subscription[],
  { search, status, sortKey, sortDirection }: ListOptions,
  today: string = todayISO(),
): Subscription[] {
  const query = search.trim().toLowerCase()
  const upcomingLimit = addDaysISO(today, UPCOMING_WINDOW_DAYS)

  const filtered = subs.filter((sub) => {
    if (status === 'upcoming') {
      if (sub.status !== 'active' || sub.nextPaymentDate > upcomingLimit) return false
    } else if (status !== 'all' && sub.status !== status) {
      return false
    }
    if (!query) return true
    return [sub.name, sub.provider, sub.category, sub.paymentMethod].some((field) =>
      field.toLowerCase().includes(query),
    )
  })

  const compare = (a: Subscription, b: Subscription): number => {
    switch (sortKey) {
      case 'name':
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      // Amounts in different currencies are compared by face value; no conversion is done.
      case 'amount':
        return a.amountMinor - b.amountMinor
      case 'nextPayment':
        return a.nextPaymentDate.localeCompare(b.nextPaymentDate)
      case 'created':
        return a.createdAt.localeCompare(b.createdAt)
    }
  }

  const direction = sortDirection === 'asc' ? 1 : -1
  return [...filtered].sort((a, b) => compare(a, b) * direction)
}

export function paginate<T>(items: T[], page: number, pageSize: number): { pageItems: T[]; pageCount: number; page: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(1, page), pageCount)
  return { pageItems: items.slice((safePage - 1) * pageSize, safePage * pageSize), pageCount, page: safePage }
}
