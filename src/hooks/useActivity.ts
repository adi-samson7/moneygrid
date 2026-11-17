import { useEffect, useState } from 'react'
import { listActivity } from '@/services/activity.service'
import { usePoliciesStore } from '@/stores/policies.store'
import { useAuthStore } from '@/stores/auth.store'
import { useSubscriptionsStore } from '@/stores/subscriptions.store'
import type { ActivityEntry } from '@/types/activity'

/**
 * The signed-in user's most recent changes. Re-read whenever their subscriptions or policies
 * change, since every change is recorded in the log.
 */
export function useActivity(limit = 8) {
  const uid = useAuthStore((s) => s.user?.uid ?? null)
  const subscriptions = useSubscriptionsStore((s) => s.subscriptions)
  const subscriptionPayments = useSubscriptionsStore((s) => s.payments)
  const policies = usePoliciesStore((s) => s.policies)
  const policyPayments = usePoliciesStore((s) => s.payments)
  const [entries, setEntries] = useState<{ uid: string; items: ActivityEntry[] } | null>(null)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    listActivity(uid, limit)
      .then((items) => !cancelled && setEntries({ uid, items }))
      .catch((error) => console.error('Failed to load activity', error))
    return () => {
      cancelled = true
    }
  }, [uid, limit, subscriptions, subscriptionPayments, policies, policyPayments])

  // Never show another user's entries while this user's are loading.
  return entries && entries.uid === uid ? entries.items : []
}
