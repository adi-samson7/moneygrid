import { create } from 'zustand'
import { authService } from '@/services/auth.service'
import type { RegisterParams } from '@/services/auth.types'
import * as profileService from '@/services/profile.service'
import type { AuthUser, ProfileUpdate, UserProfile } from '@/types/user'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  profile: UserProfile | null
  /** Start listening to auth changes. Returns the unsubscribe function. */
  init: () => () => void
  register: (params: RegisterParams) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  updateProfile: (update: ProfileUpdate) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  profile: null,

  init: () =>
    authService.onAuthStateChanged(async (user) => {
      if (!user) {
        set({ status: 'unauthenticated', user: null, profile: null })
        return
      }
      try {
        // Create the profile on first sign-in (after registration or first Google login).
        const profile =
          (await profileService.getProfile(user.uid)) ?? (await profileService.createProfile(user))
        set({ status: 'authenticated', user, profile })
      } catch (error) {
        console.error('Failed to load profile', error)
        set({ status: 'unauthenticated', user: null, profile: null })
      }
    }),

  // The auth listener updates state after each of these succeeds.
  register: async (params) => {
    await authService.register(params)
  },
  login: async (email, password) => {
    await authService.login(email, password)
  },
  loginWithGoogle: async () => {
    await authService.signInWithGoogle()
  },
  logout: async () => {
    await authService.logout()
  },

  updateProfile: async (update) => {
    const { user } = get()
    if (!user) throw new Error('Not signed in')
    const profile = await profileService.updateProfile(user.uid, update)
    set({ profile })
  },
}))
