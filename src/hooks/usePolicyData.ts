import { useCallback, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { usePoliciesStore } from '@/stores/policies.store'

/** Loads the signed-in user's policies and premium payments once, and exposes them with a load status. */
export function usePolicyData() {
  const uid = useAuthStore((s) => s.user?.uid ?? null)
  const storeUid = usePoliciesStore((s) => s.uid)
  const storeStatus = usePoliciesStore((s) => s.status)
  const policies = usePoliciesStore((s) => s.policies)
  const payments = usePoliciesStore((s) => s.payments)
  const load = usePoliciesStore((s) => s.load)

  useEffect(() => {
    if (uid && storeUid !== uid) void load(uid)
  }, [uid, storeUid, load])

  const reload = useCallback(() => {
    if (uid) void load(uid)
  }, [uid, load])

  // Until the store holds this user's data, report "loading" so nothing stale is shown.
  const status: 'loading' | 'ready' | 'error' =
    storeUid === uid && (storeStatus === 'ready' || storeStatus === 'error') ? storeStatus : 'loading'
  return { status, policies, payments, reload }
}
