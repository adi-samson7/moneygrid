import { authService } from '@/services/auth.service'
import { db } from '@/services/db'
import { defineDbContract } from '@/test/db-contract'

/**
 * The Firestore implementation of Db must behave exactly like the localStorage one (same contract).
 * It runs through the real SDK, signed in as a real emulator user, so the security rules apply too.
 */

const user = await authService.register({ fullName: 'Contract Tester', email: `contract-${Date.now()}@example.com`, password: 'password123' })

defineDbContract({ label: 'Cloud Firestore (emulator)', db, uid: user.uid })
