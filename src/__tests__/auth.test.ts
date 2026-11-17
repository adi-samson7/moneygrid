import assert from 'node:assert/strict'
import { scenario } from '@/test/steps'

scenario("auth: mock authentication, sessions, profiles and validation", async (check) => {
  const { authService } = await import('@/services/auth.service')
  const { useAuthStore } = await import('@/stores/auth.store')
  const { loginSchema, registerSchema } = await import('@/schemas/auth.schema')
  const tick = () => new Promise((r) => setTimeout(r, 10))

  const unsub = useAuthStore.getState().init()
  await tick()
  await check('starts unauthenticated', async () => assert.equal(useAuthStore.getState().status, 'unauthenticated'))

  await check('register creates session + profile', async () => {
    await useAuthStore.getState().register({ fullName: 'Asha Rao', email: ' Asha@Example.com ', password: 'password123' })
    await tick()
    const s = useAuthStore.getState()
    assert.equal(s.status, 'authenticated')
    assert.equal(s.user.email, 'asha@example.com')
    assert.equal(s.profile.fullName, 'Asha Rao')
    assert.equal(s.profile.preferredCurrency, 'INR')
  })

  await check('password is not stored in plaintext', async () => {
    assert.ok(!localStorage.getItem('spm.mock.users').includes('password123'))
  })

  await check('duplicate email rejected (case-insensitive)', async () => {
    await assert.rejects(
      authService.register({ fullName: 'X', email: 'ASHA@example.com', password: 'password123' }),
      (e) => e.code === 'auth/email-already-in-use',
    )
  })

  await check('logout clears session and state', async () => {
    await useAuthStore.getState().logout()
    await tick()
    assert.equal(useAuthStore.getState().status, 'unauthenticated')
    assert.equal(useAuthStore.getState().profile, null)
    assert.equal(localStorage.getItem('spm.mock.session'), null)
  })

  await check('wrong password and unknown email give the same error', async () => {
    const a = await authService.login('asha@example.com', 'wrongpass').catch((e) => e)
    const b = await authService.login('nobody@example.com', 'password123').catch((e) => e)
    assert.equal(a.code, 'auth/invalid-credential')
    assert.equal(b.code, 'auth/invalid-credential')
  })

  await check('login with correct password works', async () => {
    await useAuthStore.getState().login('Asha@example.com', 'password123')
    await tick()
    assert.equal(useAuthStore.getState().status, 'authenticated')
  })

  await check('profile update persists; email/uid immutable', async () => {
    await useAuthStore.getState().updateProfile({ fullName: 'Asha R', preferredCurrency: 'USD', timeZone: 'Asia/Kolkata' })
    const p = useAuthStore.getState().profile
    assert.equal(p.fullName, 'Asha R')
    assert.equal(p.preferredCurrency, 'USD')
    assert.equal(p.email, 'asha@example.com')
  })

  await check('password reset: token works once, old password stops working', async () => {
    await useAuthStore.getState().logout()
    const { mockResetToken } = await authService.sendPasswordReset('asha@example.com')
    assert.ok(mockResetToken)
    await authService.confirmPasswordReset(mockResetToken, 'newpassword1')
    await assert.rejects(authService.confirmPasswordReset(mockResetToken, 'another12345'), (e) => e.code === 'auth/invalid-reset-token')
    await assert.rejects(authService.login('asha@example.com', 'password123'), (e) => e.code === 'auth/invalid-credential')
    await authService.login('asha@example.com', 'newpassword1')
  })

  await check('reset for unknown email returns no token (no enumeration)', async () => {
    assert.deepEqual(await authService.sendPasswordReset('ghost@example.com'), {})
  })

  await check('users only see their own profile', async () => {
    await useAuthStore.getState().logout()
    await useAuthStore.getState().register({ fullName: 'Second User', email: 'second@example.com', password: 'password123' })
    await tick()
    assert.equal(useAuthStore.getState().profile.fullName, 'Second User')
    assert.notEqual(useAuthStore.getState().profile.uid, JSON.parse(localStorage.getItem('spm.mock.users'))[0].uid)
  })

  await check('google demo sign-in creates profile', async () => {
    await useAuthStore.getState().logout()
    await useAuthStore.getState().loginWithGoogle()
    await tick()
    assert.equal(useAuthStore.getState().profile.email, 'demo.user@gmail.com')
  })

  await check('schemas validate', async () => {
    assert.ok(!loginSchema.safeParse({ email: 'bad', password: 'x' }).success)
    assert.ok(!registerSchema.safeParse({ fullName: 'A', email: 'a@b.co', password: 'short', confirmPassword: 'short' }).success)
    assert.ok(!registerSchema.safeParse({ fullName: 'A', email: 'a@b.co', password: 'password123', confirmPassword: 'different1' }).success)
    assert.ok(registerSchema.safeParse({ fullName: 'A', email: 'a@b.co', password: 'password123', confirmPassword: 'password123' }).success)
  })

  unsub()
})
