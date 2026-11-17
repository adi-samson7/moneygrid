import { useEffect, useRef, useState } from 'react'
import { usePolicyData } from '@/hooks/usePolicyData'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import { useAuthStore } from '@/stores/auth.store'
import { useNotificationsStore } from '@/stores/notifications.store'

/**
 * Keeps notifications up to date while the signed-in user is in the app. Mounted once in the app
 * layout. Reminders are worked out here, in the browser, when data loads, when records change,
 * when preferences change and when the tab becomes visible again (e.g. the next morning).
 * Safe to run repeatedly: notifications are keyed, so none is created twice.
 */
export function useNotificationSync() {
  const uid = useAuthStore((s) => s.user?.uid ?? null)
  const subData = useSubscriptionData()
  const polData = usePolicyData()
  const storeUid = useNotificationsStore((s) => s.uid)
  const storeStatus = useNotificationsStore((s) => s.status)
  const preferences = useNotificationsStore((s) => s.preferences)
  const load = useNotificationsStore((s) => s.load)
  const sync = useNotificationsStore((s) => s.sync)
  const [visibilityTick, setVisibilityTick] = useState(0)
  const lastData = useRef<unknown[] | null>(null)

  useEffect(() => {
    if (uid && storeUid !== uid) void load(uid)
  }, [uid, storeUid, load])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setVisibilityTick((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const ready =
    Boolean(uid) &&
    storeUid === uid &&
    storeStatus === 'ready' &&
    subData.status === 'ready' &&
    polData.status === 'ready'

  useEffect(() => {
    if (!ready) return
    const data = [subData.subscriptions, subData.payments, polData.policies, polData.payments, preferences]
    // A change to the records can add notifications elsewhere (e.g. "marked as paid"), so re-read then.
    // Returning to the tab alone changes nothing, so it re-reads nothing.
    const reread = lastData.current !== null && data.some((value, i) => value !== lastData.current![i])
    lastData.current = data
    sync(
      {
        subscriptions: subData.subscriptions,
        subscriptionPayments: subData.payments,
        policies: polData.policies,
        policyPayments: polData.payments,
      },
      { reread },
    ).catch((error) => console.error('Failed to update notifications', error))
  }, [ready, subData.subscriptions, subData.payments, polData.policies, polData.payments, preferences, visibilityTick, sync])
}
