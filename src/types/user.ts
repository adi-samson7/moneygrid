/** The signed-in identity, as returned by the auth service. */
export interface AuthUser {
  uid: string
  email: string
  displayName: string
  photoURL?: string
}

/** Stored at users/{uid}/profile/details (PRD 4.1). */
export interface UserProfile {
  uid: string
  fullName: string
  email: string
  photoURL?: string
  preferredCurrency: string
  timeZone: string
  /** ISO 8601 timestamp */
  createdAt: string
}

export type ProfileUpdate = Pick<UserProfile, 'fullName' | 'preferredCurrency' | 'timeZone'>
