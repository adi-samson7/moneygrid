import assert from 'node:assert/strict'
import { vi } from 'vitest'
import { useSubscriptionsStore } from '@/stores/subscriptions.store'
import { startApp } from '@/test/app-harness'
import { scenario } from '@/test/steps'

// Make one page crash while rendering, to prove the app recovers instead of showing a blank screen.
vi.mock('@/pages/analytics/AnalyticsPage', () => ({
  default: () => {
    throw new Error('boom: simulated render failure')
  },
}))

scenario(
  'flow: error handling (404, crashed page, failed saves, corrupt storage)',
  async (check) => {
    const h = await startApp({ allowedErrors: [/simulated render failure/, /Page failed to render/, /QuotaExceededError/, /The above error occurred/, /Could not (record|create)/] })
    const { nav, click, setValue, waitFor, has, path, findAll, q, submitDialog, registerUser, act } = h

    try {
      await check('unknown address shows a 404 page with a way back (signed out)', async () => {
        await nav('/this/does/not/exist')
        await waitFor(() => has('Page not found') && findAll('a', 'Go to dashboard').length, '404 page')
        await click(findAll('a', 'Go to dashboard')[0])
        await waitFor(() => path() === '/login', 'signed-out visitors land on login')
      })

      await registerUser('Neha Gupta', 'neha@example.com')

      await check('unknown address while signed in also shows 404, and the link returns to the dashboard', async () => {
        await nav('/subscriptions/all/extra/segments')
        await waitFor(() => has('Page not found'), '404 page')
        await click(findAll('a', 'Go to dashboard')[0])
        await waitFor(() => path() === '/' && has('Dashboard'), 'back on the dashboard')
      })

      await check('a page that crashes shows a friendly error with recovery options', async () => {
        await nav('/analytics')
        await waitFor(() => has('Something went wrong'), 'error screen')
        assert.ok(has('Your data is safe'))
        assert.ok(findAll('button', 'Reload page').length === 1)
        assert.ok(!has('boom'), 'internal error details are not shown to the user')
        await click(findAll('a', 'Go to dashboard')[0])
        await waitFor(() => path() === '/' && has('Dashboard') && !has('Something went wrong'), 'recovered')
      })

      await check('other pages keep working after a crash elsewhere', async () => {
        await nav('/subscriptions/all')
        await waitFor(() => has("You haven't added any subscriptions yet."), 'subscriptions page')
      })

      await check('a failed save keeps the form open, tells the user, and nothing is stored', async () => {
        await click(findAll('button', 'Add your first subscription')[0])
        await waitFor(() => q('#name'), 'form')
        await setValue(q('#name'), 'Netflix')
        await setValue(q('#amount'), '499')
        const realSetItem = Storage.prototype.setItem
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
          if (key.includes('subscriptions')) throw new DOMException('quota', 'QuotaExceededError')
          return realSetItem.call(this, key, value)
        })
        await submitDialog()
        await waitFor(() => has('Could not save the subscription'), 'error toast')
        assert.ok(q('#name'), 'dialog stays open so the input is not lost')
        assert.equal(q<HTMLInputElement>('#name')!.value, 'Netflix')
        assert.equal(findAll('tbody tr').length, 0, 'no row was added')
        spy.mockRestore()
      })

      await check('retrying after the problem is fixed works', async () => {
        await submitDialog()
        await waitFor(() => has('Netflix') && has('₹499.00') && !q('#name'), 'saved on retry')
      })

      await check('corrupt stored data does not crash the app; it is treated as empty', async () => {
        const uid = Object.keys(localStorage).find((k) => k.startsWith('spm.mock.subscriptions.'))!.split('.').pop()!
        localStorage.setItem(`spm.mock.subscriptions.${uid}`, '{not valid json')
        localStorage.setItem(`spm.mock.subscriptionPayments.${uid}`, 'null')
        localStorage.setItem(`spm.mock.notifications.${uid}`, '[[[')
        localStorage.setItem(`spm.mock.settings.${uid}`, '"oops"')
        await act(async () => { await useSubscriptionsStore.getState().load(uid) })
        await nav('/subscriptions/all')
        await waitFor(() => has("You haven't added any subscriptions yet."), 'treated as empty')
        await nav('/')
        await waitFor(() => has('Dashboard'), 'dashboard renders')
        await nav('/notifications')
        await waitFor(() => has('Notifications'), 'notifications page renders')
      })

      await check('the app can be used normally again after corrupt data is replaced', async () => {
        await nav('/subscriptions/all')
        await click(findAll('button', 'Add your first subscription')[0])
        await waitFor(() => q('#name'), 'form')
        await setValue(q('#name'), 'Spotify')
        await setValue(q('#amount'), '119')
        await submitDialog()
        await waitFor(() => has('Spotify') && !q('#name'), 'new data saved over the corrupt value')
      })
    } finally {
      await h.stop()
    }
  },
  120_000,
)
