import { useCallback, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { useSubscriptionsStore } from '@/stores/subscriptions.store'

/** Loads the signed-in user's subscriptions and payments once, and exposes them with a load status. */
export function useSubscriptionData() {
  const uid = useAuthStore((s) => s.user?.uid ?? null)
  const storeUid = useSubscriptionsStore((s) => s.uid)
  const storeStatus = useSubscriptionsStore((s) => s.status)
  const subscriptions = useSubscriptionsStore((s) => s.subscriptions)
  const payments = useSubscriptionsStore((s) => s.payments)
  const load = useSubscriptionsStore((s) => s.load)

  useEffect(() => {
    if (uid && storeUid !== uid) void load(uid)
  }, [uid, storeUid, load])

  const reload = useCallback(() => {
    if (uid) void load(uid)
  }, [uid, load])

  // Until the store holds this user's data, report "loading" so nothing stale is shown.
  const status: 'loading' | 'ready' | 'error' =
    storeUid === uid && (storeStatus === 'ready' || storeStatus === 'error') ? storeStatus : 'loading'
  return { status, subscriptions, payments, reload }
}
