import type { Policy, PolicyStatus, PolicyType } from '@/types/policy'
import { POLICY_TYPE_LABELS } from '@/types/policy'
import { todayISO } from './dates'
import { getPolicyStatus } from './policy-rules'
import type { SortDirection } from './subscription-list'

export type PolicyStatusFilter = 'all' | PolicyStatus
export type PolicyTypeFilter = 'all' | PolicyType
export type PolicySortKey = 'name' | 'premium' | 'expiry' | 'created'

export interface PolicyListOptions {
  search: string
  status: PolicyStatusFilter
  type: PolicyTypeFilter
  sortKey: PolicySortKey
  sortDirection: SortDirection
}

export function filterAndSortPolicies(
  policies: Policy[],
  { search, status, type, sortKey, sortDirection }: PolicyListOptions,
  today: string = todayISO(),
): Policy[] {
  const query = search.trim().toLowerCase()

  const filtered = policies.filter((policy) => {
    if (status !== 'all' && getPolicyStatus(policy, today) !== status) return false
    if (type !== 'all' && policy.policyType !== type) return false
    if (!query) return true
    return [policy.policyName, policy.provider, policy.policyNumber, POLICY_TYPE_LABELS[policy.policyType]].some((field) =>
      field.toLowerCase().includes(query),
    )
  })

  const compare = (a: Policy, b: Policy): number => {
    switch (sortKey) {
      case 'name':
        return a.policyName.localeCompare(b.policyName, undefined, { sensitivity: 'base' })
      // Amounts in different currencies are compared by face value; no conversion is done.
      case 'premium':
        return a.premiumAmountMinor - b.premiumAmountMinor
      case 'expiry':
        return a.expiryDate.localeCompare(b.expiryDate)
      case 'created':
        return a.createdAt.localeCompare(b.createdAt)
    }
  }

  const direction = sortDirection === 'asc' ? 1 : -1
  return [...filtered].sort((a, b) => compare(a, b) * direction)
}
