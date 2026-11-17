import { COLLECTIONS, db, setOp } from '@/services/db'
import type { AuthUser, ProfileUpdate, UserProfile } from '@/types/user'
import { DEFAULT_CURRENCY } from '@/utils/currency'

/**
 * User profile, stored at users/{uid}/profile/details. Because it lives under the user's own uid,
 * one user can never read or change another's.
 */
const DOC_ID = 'details'

type StoredProfile = UserProfile & { id: string }

/** The stored document also carries its own id, which is not part of the profile. */
function toProfile(stored: StoredProfile): UserProfile {
  const { id, ...profile } = stored
  void id
  return profile
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const stored = await db.get<StoredProfile>(uid, COLLECTIONS.profile, DOC_ID)
  return stored && typeof stored.uid === 'string' ? toProfile(stored) : null
}

export async function createProfile(user: AuthUser): Promise<UserProfile> {
  const profile: UserProfile = {
    uid: user.uid,
    fullName: user.displayName,
    email: user.email,
    ...(user.photoURL ? { photoURL: user.photoURL } : {}),
    preferredCurrency: DEFAULT_CURRENCY,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    createdAt: new Date().toISOString(),
  }
  await db.commit(user.uid, [setOp(COLLECTIONS.profile, { ...profile, id: DOC_ID })])
  return profile
}

export async function updateProfile(uid: string, update: ProfileUpdate): Promise<UserProfile> {
  const existing = await getProfile(uid)
  if (!existing) throw new Error('Profile not found')

  // Only the editable fields are applied; uid, email and createdAt cannot be changed here.
  const updated: UserProfile = {
    ...existing,
    fullName: update.fullName,
    preferredCurrency: update.preferredCurrency,
    timeZone: update.timeZone,
  }
  await db.commit(uid, [setOp(COLLECTIONS.profile, { ...updated, id: DOC_ID })])
  return updated
}
