// @vitest-environment jsdom
import assert from 'node:assert/strict'
import { useSubscriptionsStore } from '@/stores/subscriptions.store'
import { startApp } from '@/test/app-harness'
import { scenario } from '@/test/steps'

/**
 * The whole app driven through its screens against the Firebase Auth and Firestore emulators:
 * screen -> stores -> services -> Firestore (security rules enforced). Run with: npm run test:emulator
 */

const stamp = Date.now()

scenario(
  'flow (Firebase emulators): sign up, use the app, sign out and back in, second user isolated',
  async (check) => {
    const h = await startApp({ allowedErrors: [/Failed to get document/, /Firestore/i, /auth\/invalid-credential/] })
    const { nav, click, setValue, waitFor, has, path, findAll, q, submitDialog, flush } = h
    const email = `flow-${stamp}@example.com`
    const emailB = `flowb-${stamp}@example.com`

    const signOut = async () => {
      await click(q('button[aria-label="Log out"]'))
      await waitFor(() => path() === '/login', 'logged out')
    }
    const signIn = async (address: string, password: string) => {
      await nav('/login')
      await waitFor(() => q('#email'), 'login form')
      await setValue(q('#email'), address)
      await setValue(q('#password'), password)
      await click(findAll('button', 'Log in').find((b) => (b as HTMLButtonElement).type === 'submit'))
    }

    try {
      await check('a visitor is sent to the login page', async () => {
        await waitFor(() => path() === '/login' && has('Sign in to manage'), 'login page')
        assert.ok(has('Continue with Google') && !has('(demo)'), 'real Google sign-in label in Firebase mode')
      })

      await check('registering through the form creates the account, the profile and lands on the dashboard', async () => {
        await nav('/register')
        await waitFor(() => q('#fullName'), 'register form')
        await setValue(q('#fullName'), 'Flow Tester')
        await setValue(q('#email'), email)
        await setValue(q('#password'), 'password123')
        await setValue(q('#confirmPassword'), 'password123')
        await click(findAll('button', 'Create account').find((b) => (b as HTMLButtonElement).type === 'submit'))
        await waitFor(() => path() === '/' && has('Flow Tester') && has(email), 'dashboard with the new profile', 15000)
      })

      await check('a new user starts with nothing', async () => {
        await nav('/subscriptions/all')
        await waitFor(() => has("You haven't added any subscriptions yet."), 'empty state', 10000)
      })

      await check('adding a subscription saves it to Firestore', async () => {
        await click(findAll('button', 'Add your first subscription')[0])
        await waitFor(() => q('#name'), 'form')
        await setValue(q('#name'), 'Netflix')
        await setValue(q('#amount'), '499')
        await submitDialog()
        await waitFor(() => has('Netflix') && has('₹499.00') && !q('#name'), 'row saved', 15000)
      })

      await check('the data really is in the database: reloading it from there shows the same thing', async () => {
        const uid = useSubscriptionsStore.getState().uid!
        await h.act(async () => { await useSubscriptionsStore.getState().load(uid) })
        await waitFor(() => has('Netflix') && has('₹499.00'), 'reloaded from Firestore', 10000)
      })

      await check('marking the payment paid updates history, notifications and the dashboard', async () => {
        await nav('/subscriptions/upcoming')
        await waitFor(() => findAll('button', 'Mark paid').length, 'open payment', 10000)
        await click(findAll('button', 'Mark paid')[0])
        await waitFor(() => q('#paymentDate'), 'dialog')
        await setValue(q('#notes'), 'autopay')
        await submitDialog()
        await waitFor(() => !q('#paymentDate'), 'closed', 15000)
        await nav('/subscriptions/history')
        await waitFor(() => has('Paid') && has('autopay'), 'paid row in history', 10000)
        await waitFor(() => (q('a[href="/notifications"]')?.getAttribute('aria-label') ?? '').includes('unread'), 'bell shows the paid notification', 10000)
        await nav('/')
        await waitFor(() => has('Marked as paid: Netflix payment'), 'activity entry', 10000)
      })

      await check('profile changes are saved', async () => {
        await nav('/settings')
        await waitFor(() => q('#fullName'), 'settings')
        await setValue(q('#fullName'), 'Flow T. Tester')
        await setValue(q('#preferredCurrency'), 'USD')
        await click(findAll('button', 'Save changes')[0])
        await waitFor(() => has('Flow T. Tester'), 'name updated in the sidebar', 10000)
      })

      await check('signing out protects the pages; a wrong password is refused with a clear message', async () => {
        await signOut()
        await nav('/subscriptions/all')
        await waitFor(() => path() === '/login', 'redirected')
        await signIn(email, 'not-the-password')
        await waitFor(() => has('Incorrect email or password.'), 'error message', 10000)
        assert.equal(path(), '/login')
      })

      await check('signing back in restores everything, including the profile change', async () => {
        await signIn(email, 'password123')
        await waitFor(() => path() === '/' && has('Flow T. Tester'), 'signed in with the saved profile', 15000)
        await nav('/subscriptions/all')
        await waitFor(() => has('Netflix'), 'subscription is still there', 15000)
        await nav('/subscriptions/history')
        await waitFor(() => has('Paid') && has('autopay'), 'history is still there', 10000)
      })

      await check('a second user sees none of the first user\'s data and has their own space', async () => {
        await signOut()
        await nav('/register')
        await waitFor(() => q('#fullName'), 'register form')
        await setValue(q('#fullName'), 'Second Person')
        await setValue(q('#email'), emailB)
        await setValue(q('#password'), 'password123')
        await setValue(q('#confirmPassword'), 'password123')
        await click(findAll('button', 'Create account').find((b) => (b as HTMLButtonElement).type === 'submit'))
        await waitFor(() => path() === '/' && has('Second Person'), 'second user dashboard', 15000)
        await nav('/subscriptions/all')
        await waitFor(() => has("You haven't added any subscriptions yet."), 'empty for the second user', 10000)
        assert.ok(!has('Netflix'))
        await nav('/notifications')
        await waitFor(() => has('No notifications yet'), 'no notifications', 10000)
        await nav('/')
        await waitFor(() => has('Nothing to show yet') && !has('Marked as paid'), 'empty dashboard, no foreign activity', 10000)
      })

      await check('duplicate sign-up is refused with a clear message', async () => {
        await signOut()
        await nav('/register')
        await waitFor(() => q('#fullName'), 'register form')
        await setValue(q('#fullName'), 'Copycat')
        await setValue(q('#email'), email)
        await setValue(q('#password'), 'password123')
        await setValue(q('#confirmPassword'), 'password123')
        await click(findAll('button', 'Create account').find((b) => (b as HTMLButtonElement).type === 'submit'))
        await waitFor(() => has('An account with this email already exists'), 'duplicate message', 10000)
        await flush(50)
      })
    } finally {
      await h.stop()
    }
  },
  240_000,
)
