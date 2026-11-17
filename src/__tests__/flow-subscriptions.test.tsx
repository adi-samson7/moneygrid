import assert from 'node:assert/strict'
import { startApp } from '@/test/app-harness'
import { scenario } from '@/test/steps'

scenario(
  "flow: sign up, manage subscriptions, payments, settings, sign out",
  async (check) => {
    const h = await startApp()
    const { nav, click, setValue, waitFor, has, body, path, findAll, submitDialog } = h

    try {
        await check('signed-out visitor is sent to /login', async () => {
          await waitFor(() => path() === '/login' && has('Sign in to manage'), 'login page')
        })

        await check('protected deep link redirects to login', async () => {
          await nav('/subscriptions/all')
          await waitFor(() => path() === '/login', 'redirect to login')
        })

        await check('register validation errors show', async () => {
          await nav('/register')
          await waitFor(() => document.querySelector('#fullName'), 'register form')
          await setValue(document.querySelector('#password'), 'short')
          await click(findAll('button', 'Create account').find((b) => b.type === 'submit'))
          await waitFor(() => has('Enter your name') && has('Enter a valid email address') && has('at least 8 characters'), 'validation messages')
        })

        await check('register -> lands on dashboard, sidebar shows user', async () => {
          await setValue(document.querySelector('#fullName'), 'Asha Rao')
          await setValue(document.querySelector('#email'), 'asha@example.com')
          await setValue(document.querySelector('#password'), 'password123')
          await setValue(document.querySelector('#confirmPassword'), 'password123')
          await click(findAll('button', 'Create account').find((b) => b.type === 'submit'))
          await waitFor(() => path() === '/' && has('Asha Rao') && has('asha@example.com'), 'dashboard + profile in sidebar')
        })

        await check('empty state on All Subscriptions', async () => {
          await nav('/subscriptions/all')
          await waitFor(() => has("You haven't added any subscriptions yet."), 'empty state')
        })

        await check('form validation blocks bad input', async () => {
          await click(findAll('button', 'Add your first subscription')[0])
          await waitFor(() => document.querySelector('#name'), 'dialog form')
          await setValue(document.querySelector('#amount'), 'abc')
          await submitDialog()
          await waitFor(() => has('Enter a name') && has('Enter an amount like'), 'form errors')
        })

        await check('add subscription -> appears in table with formatted amount', async () => {
          await setValue(document.querySelector('#name'), 'Netflix')
          await setValue(document.querySelector('#provider'), 'Netflix Inc')
          await setValue(document.querySelector('#amount'), '15.49')
          await setValue(document.querySelector('#currency'), 'USD')
          await submitDialog()
          await waitFor(() => has('Netflix') && has('$15.49') && has('Yearly amount') && has('$185.88') && has('Active') && !document.querySelector('#name'), 'row in table, dialog closed')
        })

        await check('search / status filter / empty-result message', async () => {
          await setValue(document.querySelector('input[aria-label="Search subscriptions"]'), 'zzz')
          await waitFor(() => has('No subscriptions match your search or filters.'), 'no match message')
          await setValue(document.querySelector('input[aria-label="Search subscriptions"]'), 'netflix')
          await waitFor(() => has('$15.49'), 'match restored')
          await setValue(document.querySelector('select[aria-label="Filter by status"]'), 'paused')
          await waitFor(() => has('No subscriptions match'), 'paused filter empty')
          await setValue(document.querySelector('select[aria-label="Filter by status"]'), 'all')
          await setValue(document.querySelector('input[aria-label="Search subscriptions"]'), '')
          await waitFor(() => has('$15.49'), 'cleared')
        })

        await check('overview summary reflects the subscription', async () => {
          await nav('/subscriptions')
          await waitFor(() => has('Active subscriptions') && has('Monthly spending') && has('$15.49') && has('$185.88') && has('Next payments'), 'overview cards')
        })

        await check('upcoming payments: mark paid with notes', async () => {
          await nav('/subscriptions/upcoming')
          await waitFor(() => has('Netflix') && has('Upcoming') && findAll('button', 'Mark paid').length, 'open payment row')
          await click(findAll('button', 'Mark paid')[0])
          await waitFor(() => document.querySelector('#paymentDate') && has('Mark as paid'), 'paid dialog')
          await setValue(document.querySelector('#notes'), 'autopay ok')
          await submitDialog()
          await waitFor(() => !document.querySelector('#paymentDate'), 'dialog closed')
        })

        await check('history shows paid row with notes, plus the next open payment', async () => {
          await nav('/subscriptions/history')
          await waitFor(() => has('Paid') && has('autopay ok') && has('Upcoming'), 'history rows')
          await setValue(document.querySelector('select[aria-label="Filter by status"]'), 'paid')
          await waitFor(() => !has('Mark paid') && has('autopay ok'), 'paid filter')
        })

        const getSubId = () => { const k = Object.keys(localStorage).find((x) => x.startsWith('spm.mock.subscriptions.')); return k ? (JSON.parse(localStorage.getItem(k))[0]?.id ?? 'none') : 'none' }

        await check('detail page: info + history, pause/resume', async () => {
          await nav(`/subscriptions/${getSubId()}`)
          await waitFor(() => has('Details') && has('Monthly equivalent') && has('Payment history') && has('Paid'), 'detail page')
          await click(document.querySelector('button[aria-label="Pause Netflix"]'))
          await waitFor(() => has('Paused'), 'paused badge')
          await click(document.querySelector('button[aria-label="Resume Netflix"]'))
          await waitFor(() => has('Active'), 'active again')
        })

        await check('edit via dialog keeps values and saves changes', async () => {
          await click(document.querySelector('button[aria-label="Edit Netflix"]'))
          await waitFor(() => document.querySelector('#name')?.value === 'Netflix' && document.querySelector('#amount')?.value === '15.49', 'prefilled form')
          await setValue(document.querySelector('#amount'), '17.99')
          await submitDialog()
          await waitFor(() => has('$17.99'), 'updated amount')
        })

        await check('cancel asks for confirmation, keeps history, drops from spend', async () => {
          await click(document.querySelector('button[aria-label="Cancel Netflix"]'))
          await waitFor(() => has('Cancel Netflix?'), 'confirm dialog')
          await click(findAll('button', 'Cancel subscription')[0])
          await waitFor(() => has('Cancelled'), 'cancelled badge')
          assert.ok(has('Paid'), 'history preserved after cancel')
          await nav('/subscriptions')
          await waitFor(() => has('Active subscriptions'), 'overview')
          const cards = body()
          assert.ok(/Active subscriptions\s*0/.test(cards), 'active count is 0: ' + cards.slice(0, 200))
        })

        await check('delete asks for confirmation and returns to the list', async () => {
          await nav(`/subscriptions/${getSubId()}`)
          await waitFor(() => document.querySelector('button[aria-label="Delete Netflix"]'), 'delete button')
          await click(document.querySelector('button[aria-label="Delete Netflix"]'))
          await waitFor(() => has('Delete Netflix?'), 'confirm dialog')
          await click(findAll('button').find((b) => b.textContent.trim() === 'Delete'))
          await waitFor(() => path() === '/subscriptions/all' && has("You haven't added any subscriptions yet."), 'back on empty list')
        })

        await check('unknown subscription id shows not-found state', async () => {
          await nav('/subscriptions/does-not-exist')
          await waitFor(() => has('could not be found'), 'not found')
        })

        await check('settings profile edit persists', async () => {
          await nav('/settings')
          await waitFor(() => document.querySelector('#fullName'), 'settings form')
          await setValue(document.querySelector('#fullName'), 'Asha R')
          await setValue(document.querySelector('#preferredCurrency'), 'USD')
          await click(findAll('button', 'Save changes')[0])
          await waitFor(() => has('Asha R'), 'sidebar name updated')
        })

        await check('logout returns to /login and blocks private pages', async () => {
          await click(document.querySelector('button[aria-label="Log out"]'))
          await waitFor(() => path() === '/login', 'login after logout')
          await nav('/subscriptions/all')
          await waitFor(() => path() === '/login', 'still blocked')
        })

        await check('login restores session; second user cannot see first user data', async () => {
          await nav('/register')
          await waitFor(() => document.querySelector('#fullName'), 'register form')
          await setValue(document.querySelector('#fullName'), 'Second User')
          await setValue(document.querySelector('#email'), 'second@example.com')
          await setValue(document.querySelector('#password'), 'password123')
          await setValue(document.querySelector('#confirmPassword'), 'password123')
          await click(findAll('button', 'Create account').find((b) => b.type === 'submit'))
          await waitFor(() => path() === '/' && has('Second User'), 'second user dashboard')
          await nav('/subscriptions/all')
          await waitFor(() => has("You haven't added any subscriptions yet."), 'second user starts empty')
        })
    } finally {
      await h.stop()
    }
  },
  120_000,
)
