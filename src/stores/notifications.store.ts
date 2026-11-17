import { create } from 'zustand'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  syncNotifications,
} from '@/services/notification.service'
import { getPreferences, updatePreferences } from '@/services/preferences.service'
import { useAuthStore } from '@/stores/auth.store'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type AppNotification,
  type NotificationPreferences,
} from '@/types/notification'
import type { NotificationSource } from '@/utils/notification-rules'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface NotificationsState {
  /** The user these notifications belong to. Another user's are never exposed. */
  uid: string | null
  status: LoadStatus
  items: AppNotification[]
  preferences: NotificationPreferences
  load: (uid: string) => Promise<void>
  reset: () => void
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  /**
   * Creates any reminders that now apply and closes ones that no longer do. Pass `reread` when the
   * records changed, since other code (e.g. recording a payment) may have added notifications too.
   */
  sync: (source: NotificationSource, options?: { reread?: boolean }) => Promise<void>
  updatePreferences: (update: Partial<NotificationPreferences>) => Promise<void>
}

function requireUid(): string {
  const uid = useAuthStore.getState().user?.uid
  if (!uid) throw new Error('Not signed in')
  return uid
}

export const useNotificationsStore = create<NotificationsState>((set, get) => {
  const refresh = async (uid: string) => {
    set({ items: await listNotifications(uid) })
  }

  return {
    uid: null,
    status: 'idle',
    items: [],
    preferences: DEFAULT_NOTIFICATION_PREFERENCES,

    load: async (uid) => {
      set({ uid, status: 'loading', items: [], preferences: DEFAULT_NOTIFICATION_PREFERENCES })
      try {
        const [items, preferences] = await Promise.all([listNotifications(uid), getPreferences(uid)])
        set({ uid, status: 'ready', items, preferences })
      } catch (error) {
        console.error('Failed to load notifications', error)
        set({ status: 'error' })
      }
    },

    reset: () => set({ uid: null, status: 'idle', items: [], preferences: DEFAULT_NOTIFICATION_PREFERENCES }),

    markRead: async (id) => {
      const uid = requireUid()
      await markNotificationRead(uid, id)
      await refresh(uid)
    },

    markAllRead: async () => {
      const uid = requireUid()
      await markAllNotificationsRead(uid)
      await refresh(uid)
    },

    sync: async (source, options = {}) => {
      const uid = requireUid()
      if (get().uid !== uid) return
      // The notifications already loaded are passed in, so a quiet sync costs no reads.
      const changed = await syncNotifications(uid, source, get().preferences, undefined, get().items)
      if (changed || options.reread) await refresh(uid)
    },

    updatePreferences: async (update) => {
      const uid = requireUid()
      const preferences = await updatePreferences(uid, update)
      set({ preferences })
    },
  }
})

// Drop everything when the user signs out so the next user never sees stale notifications.
useAuthStore.subscribe((state) => {
  if (!state.user) useNotificationsStore.getState().reset()
})
