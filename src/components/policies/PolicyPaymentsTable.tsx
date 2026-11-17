import { useMemo } from 'react'
import { PaymentsTable } from '@/components/common/PaymentsTable'
import { usePoliciesStore } from '@/stores/policies.store'
import type { Policy, PolicyPayment } from '@/types/policy'

interface PolicyPaymentsTableProps {
  payments: PolicyPayment[]
  policiesById: Map<string, Policy>
  /** Hide the policy column on a single policy's page. */
  showPolicy?: boolean
  showActions?: boolean
}

export function PolicyPaymentsTable({ payments, policiesById, showPolicy = true, showActions = true }: PolicyPaymentsTableProps) {
  const resolvePayment = usePoliciesStore((s) => s.resolvePayment)
  const ownerNames = useMemo(
    () => new Map([...policiesById].map(([id, policy]) => [id, policy.policyName])),
    [policiesById],
  )

  return (
    <PaymentsTable
      payments={payments}
      getOwnerId={(p) => p.policyId}
      ownerNames={ownerNames}
      ownerLabel="Policy"
      ownerPath="/policies"
      showOwner={showPolicy}
      showActions={showActions}
      onResolve={resolvePayment}
    />
  )
}
