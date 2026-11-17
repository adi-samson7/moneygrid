import { create } from 'zustand'
import { listPayments, resolvePayment } from '@/services/payment.service'
import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  setSubscriptionStatus,
  updateSubscription,
} from '@/services/subscription.service'
import { useAuthStore } from '@/stores/auth.store'
import type {
  PaymentResolution,
  Subscription,
  SubscriptionInput,
  SubscriptionPayment,
  SubscriptionStatus,
  SubscriptionUpdate,
} from '@/types/subscription'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SubscriptionsState {
  /** The user these records belong to. Data for any other user is never exposed. */
  uid: string | null
  status: LoadStatus
  subscriptions: Subscription[]
  payments: SubscriptionPayment[]
  load: (uid: string) => Promise<void>
  reset: () => void
  create: (input: SubscriptionInput) => Promise<void>
  update: (id: string, update: SubscriptionUpdate) => Promise<void>
  setStatus: (id: string, status: SubscriptionStatus) => Promise<void>
  remove: (id: string) => Promise<void>
  resolvePayment: (paymentId: string, resolution: PaymentResolution) => Promise<void>
}

function requireUid(): string {
  const uid = useAuthStore.getState().user?.uid
  if (!uid) throw new Error('Not signed in')
  return uid
}

export const useSubscriptionsStore = create<SubscriptionsState>((set) => {
  const refresh = async (uid: string) => {
    const [subscriptions, payments] = await Promise.all([listSubscriptions(uid), listPayments(uid)])
    set({ uid, status: 'ready', subscriptions, payments })
  }

  // Every mutation writes through the service, then re-reads so the UI reflects stored state.
  const mutate = async (action: (uid: string) => Promise<unknown>) => {
    const uid = requireUid()
    await action(uid)
    await refresh(uid)
  }

  return {
    uid: null,
    status: 'idle',
    subscriptions: [],
    payments: [],

    load: async (uid) => {
      set({ uid, status: 'loading', subscriptions: [], payments: [] })
      try {
        await refresh(uid)
      } catch (error) {
        console.error('Failed to load subscriptions', error)
        set({ status: 'error' })
      }
    },

    reset: () => set({ uid: null, status: 'idle', subscriptions: [], payments: [] }),

    create: (input) => mutate((uid) => createSubscription(uid, input)),
    update: (id, update) => mutate((uid) => updateSubscription(uid, id, update)),
    setStatus: (id, status) => mutate((uid) => setSubscriptionStatus(uid, id, status)),
    remove: (id) => mutate((uid) => deleteSubscription(uid, id)),
    resolvePayment: (paymentId, resolution) => mutate((uid) => resolvePayment(uid, paymentId, resolution)),
  }
})

// Drop everything when the user signs out so the next user never sees stale records.
useAuthStore.subscribe((state) => {
  if (!state.user) useSubscriptionsStore.getState().reset()
})
