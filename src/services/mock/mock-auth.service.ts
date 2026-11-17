import type { AuthService, PasswordResetRequest, RegisterParams } from '@/services/auth.types'
import { AuthError } from '@/services/auth.types'
import { readArray, readJson, readObject, removeKey, writeJson } from '@/utils/storage'
import type { AuthUser } from '@/types/user'

/**
 * Mock authentication backed by localStorage. For development only:
 * there is no server, so anyone with access to the browser can read this data.
 * Replaced by Firebase Authentication at the end of the project.
 */

const USERS_KEY = 'spm.mock.users'
const SESSION_KEY = 'spm.mock.session'
const RESET_KEY = 'spm.mock.resetTokens'
const RESET_TTL_MS = 60 * 60 * 1000

interface StoredUser extends AuthUser {
  provider: 'password' | 'google'
  salt?: string
  passwordHash?: string
}

interface StoredResetToken {
  uid: string
  expiresAt: number
}

const GOOGLE_DEMO_ACCOUNT = { email: 'demo.user@gmail.com', displayName: 'Demo Google User' }

const listeners = new Set<(user: AuthUser | null) => void>()

const normalizeEmail = (email: string) => email.trim().toLowerCase()
const readUsers = () => readArray<StoredUser>(USERS_KEY)
const readTokens = () => readObject<Record<string, StoredResetToken>>(RESET_KEY, {})

async function hashPassword(password: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + password))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function toAuthUser(user: StoredUser): AuthUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL }
}

function currentUser(): AuthUser | null {
  const uid = readJson<unknown>(SESSION_KEY, null)
  const user = typeof uid === 'string' ? readUsers().find((u) => u.uid === uid) : undefined
  return user ? toAuthUser(user) : null
}

function emit() {
  const user = currentUser()
  listeners.forEach((listener) => listener(user))
}

function startSession(user: StoredUser): AuthUser {
  writeJson(SESSION_KEY, user.uid)
  emit()
  return toAuthUser(user)
}

async function register({ fullName, email, password }: RegisterParams): Promise<AuthUser> {
  const normalized = normalizeEmail(email)
  const users = readUsers()
  if (users.some((u) => u.email === normalized)) throw new AuthError('auth/email-already-in-use')

  const salt = crypto.randomUUID()
  const user: StoredUser = {
    uid: crypto.randomUUID(),
    email: normalized,
    displayName: fullName.trim(),
    provider: 'password',
    salt,
    passwordHash: await hashPassword(password, salt),
  }
  writeJson(USERS_KEY, [...users, user])
  return startSession(user)
}

async function login(email: string, password: string): Promise<AuthUser> {
  const user = readUsers().find((u) => u.email === normalizeEmail(email))
  // Same error for unknown email and wrong password so accounts cannot be enumerated.
  if (!user?.salt || !user.passwordHash) throw new AuthError('auth/invalid-credential')
  if ((await hashPassword(password, user.salt)) !== user.passwordHash) {
    throw new AuthError('auth/invalid-credential')
  }
  return startSession(user)
}

async function signInWithGoogle(): Promise<AuthUser> {
  const users = readUsers()
  let user = users.find((u) => u.email === GOOGLE_DEMO_ACCOUNT.email)
  if (!user) {
    user = { uid: crypto.randomUUID(), ...GOOGLE_DEMO_ACCOUNT, provider: 'google' }
    writeJson(USERS_KEY, [...users, user])
  }
  return startSession(user)
}

async function logout(): Promise<void> {
  removeKey(SESSION_KEY)
  emit()
}

async function sendPasswordReset(email: string): Promise<PasswordResetRequest> {
  const user = readUsers().find((u) => u.email === normalizeEmail(email))
  // Do not reveal whether the account exists; only password accounts can be reset.
  if (!user || user.provider !== 'password') return {}

  const token = crypto.randomUUID()
  writeJson(RESET_KEY, { ...readTokens(), [token]: { uid: user.uid, expiresAt: Date.now() + RESET_TTL_MS } })
  // A real backend emails this link. The mock has no email, so it returns the token.
  return { mockResetToken: token }
}

async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  const tokens = readTokens()
  const entry = tokens[token]
  if (!entry || entry.expiresAt < Date.now()) throw new AuthError('auth/invalid-reset-token')

  const users = readUsers()
  const index = users.findIndex((u) => u.uid === entry.uid)
  if (index === -1) throw new AuthError('auth/invalid-reset-token')

  const salt = crypto.randomUUID()
  users[index] = { ...users[index], salt, passwordHash: await hashPassword(newPassword, salt) }
  writeJson(USERS_KEY, users)

  delete tokens[token] // single use
  writeJson(RESET_KEY, tokens)
}

function onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
  listeners.add(callback)
  // Mirror Firebase: report the initial state asynchronously.
  queueMicrotask(() => {
    if (listeners.has(callback)) callback(currentUser())
  })
  // Keep other tabs in sync when the session changes there.
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY || event.key === USERS_KEY) callback(currentUser())
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(callback)
    window.removeEventListener('storage', onStorage)
  }
}

export const mockAuthService: AuthService = {
  register,
  login,
  signInWithGoogle,
  logout,
  sendPasswordReset,
  confirmPasswordReset,
  onAuthStateChanged,
}
