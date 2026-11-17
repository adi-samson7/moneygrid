import { create } from 'zustand'
import { createPolicy, deletePolicy, listPolicies, renewPolicy, setPolicyStatus, updatePolicy } from '@/services/policy.service'
import { listPolicyPayments, resolvePolicyPayment } from '@/services/policy-payment.service'
import { useAuthStore } from '@/stores/auth.store'
import type { PaymentResolution } from '@/types/payment'
import type { Policy, PolicyInput, PolicyPayment, PolicyStoredStatus, PolicyUpdate, RenewalInput } from '@/types/policy'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PoliciesState {
  /** The user these records belong to. Data for any other user is never exposed. */
  uid: string | null
  status: LoadStatus
  policies: Policy[]
  payments: PolicyPayment[]
  load: (uid: string) => Promise<void>
  reset: () => void
  create: (input: PolicyInput) => Promise<void>
  update: (id: string, update: PolicyUpdate) => Promise<void>
  setStatus: (id: string, status: PolicyStoredStatus) => Promise<void>
  renew: (id: string, renewal: RenewalInput) => Promise<void>
  remove: (id: string) => Promise<void>
  resolvePayment: (paymentId: string, resolution: PaymentResolution) => Promise<void>
}

function requireUid(): string {
  const uid = useAuthStore.getState().user?.uid
  if (!uid) throw new Error('Not signed in')
  return uid
}

export const usePoliciesStore = create<PoliciesState>((set) => {
  const refresh = async (uid: string) => {
    const [policies, payments] = await Promise.all([listPolicies(uid), listPolicyPayments(uid)])
    set({ uid, status: 'ready', policies, payments })
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
    policies: [],
    payments: [],

    load: async (uid) => {
      set({ uid, status: 'loading', policies: [], payments: [] })
      try {
        await refresh(uid)
      } catch (error) {
        console.error('Failed to load policies', error)
        set({ status: 'error' })
      }
    },

    reset: () => set({ uid: null, status: 'idle', policies: [], payments: [] }),

    create: (input) => mutate((uid) => createPolicy(uid, input)),
    update: (id, update) => mutate((uid) => updatePolicy(uid, id, update)),
    setStatus: (id, status) => mutate((uid) => setPolicyStatus(uid, id, status)),
    renew: (id, renewal) => mutate((uid) => renewPolicy(uid, id, renewal)),
    remove: (id) => mutate((uid) => deletePolicy(uid, id)),
    resolvePayment: (paymentId, resolution) => mutate((uid) => resolvePolicyPayment(uid, paymentId, resolution)),
  }
})

// Drop everything when the user signs out so the next user never sees stale records.
useAuthStore.subscribe((state) => {
  if (!state.user) usePoliciesStore.getState().reset()
})
