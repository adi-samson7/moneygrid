import assert from 'node:assert/strict'
import { startApp } from '@/test/app-harness'
import { scenario } from '@/test/steps'

scenario(
  "flow: notifications, settings and calendar export",
  async (check) => {
    const h = await startApp()
    const { nav, click, setValue, waitFor, has, path, findAll, q, submitDialog, registerUser, act, flush } = h
    const w = window


    const today = new Date()
    const iso = (n) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    // Capture file downloads: record the blob and the suggested filename instead of navigating.
    const downloads = []
    const realCreate = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob) => { downloads.push({ blob }); return realCreate(blob) }
    const realAnchorClick = w.HTMLAnchorElement.prototype.click
    w.HTMLAnchorElement.prototype.click = function () {
      // Only downloads are intercepted; ordinary links behave normally.
      if (this.hasAttribute('download')) downloads[downloads.length - 1].name = this.getAttribute('download')
      else realAnchorClick.call(this)
    }

    const bell = () => q('a[href="/notifications"]')
    const unreadFromBell = () => Number((bell()?.getAttribute('aria-label') ?? '').match(/(\d+) unread/)?.[1] ?? 0)
    const cards = () => [...document.querySelectorAll('ul > li [data-slot="card"]')]
    const titles = () => cards().map((c) => c.querySelector('p')?.textContent.trim())

    try {
        await registerUser('Kavya Rao', 'kavya@example.com')

        await check('bell is always in the header; no badge and an empty page for a new user', async () => {
          await waitFor(() => bell(), 'bell')
          assert.equal(bell().getAttribute('aria-label'), 'Notifications')
          await nav('/notifications')
          await waitFor(() => has('No notifications yet') && has('You are all caught up'), 'empty state')
        })

        const { useSubscriptionsStore } = await import('@/stores/subscriptions.store')
        const { usePoliciesStore } = await import('@/stores/policies.store')
        const S = () => useSubscriptionsStore.getState()
        const P = () => usePoliciesStore.getState()
        const sub = (o) => ({ name: 'x', provider: '', category: 'Entertainment', amountMinor: 49900, currency: 'INR', billingCycle: 'monthly', startDate: iso(-40), nextPaymentDate: iso(2), paymentMethod: '', reminderDays: 3, ...o })
        const pol = (o) => ({ provider: 'Acme', policyName: 'x', policyType: 'vehicle', policyNumber: '', premiumAmountMinor: 900000, currency: 'INR', coverageAmountMinor: 5000000, billingCycle: 'monthly', startDate: iso(-100), expiryDate: iso(20), nextPremiumDate: iso(3), reminderDays: 30, notes: '', ...o })
        await act(async () => {
          await S().create(sub({ name: 'Netflix', nextPaymentDate: iso(2), reminderDays: 3 }))
          await S().create(sub({ name: 'Spotify', nextPaymentDate: iso(30), reminderDays: 3 }))
          await P().create(pol({ policyName: 'Car Cover' }))
        })

        await check('reminders appear on their own as records are added (bell badge counts unread)', async () => {
          await waitFor(() => unreadFromBell() === 3, 'badge = 3, got ' + unreadFromBell())
          assert.ok(bell().textContent.includes('3'))
        })

        await check('notifications page lists the right reminders with details, newest first', async () => {
          await nav('/notifications')
          await waitFor(() => cards().length === 3, 'three cards')
          const t = titles()
          assert.deepEqual([...t].sort(), ['Policy expiring soon: Car Cover', 'Upcoming payment: Netflix', 'Upcoming premium: Car Cover'])
          assert.ok(has('is due on') && has('Renew it to stay covered') && has('premium is due on'))
          assert.ok(has('3 unread'))
          assert.equal(findAll('span', 'New').length, 3)
          assert.ok(!t.some((x) => x.includes('Spotify')), 'Spotify is outside its reminder window')
        })

        await check('mark one as read: badge, count and the "New" tag update', async () => {
          await click(findAll('button', 'Mark as read')[0])
          await waitFor(() => unreadFromBell() === 2 && has('2 unread') && findAll('span', 'New').length === 2, 'now 2 unread')
        })

        await check('unread filter shows only unread; All shows everything', async () => {
          await click(findAll('button', 'Unread').find((b) => b.getAttribute('aria-pressed') !== null))
          await waitFor(() => cards().length === 2, 'two unread')
          await click(findAll('button', 'All').find((b) => b.getAttribute('aria-pressed') !== null))
          await waitFor(() => cards().length === 3, 'all three')
        })

        await check('"View" opens the related record and marks the notification read', async () => {
          const card = cards().find((c) => c.textContent.includes('Upcoming payment: Netflix'))
          const wasUnread = card.textContent.includes('Mark as read')
          await click([...card.querySelectorAll('a')].find((a) => a.textContent.trim() === 'View'))
          await waitFor(() => /\/subscriptions\/[0-9a-f-]{36}/.test(path()) && has('Netflix') && has('Details'), 'navigated')
          await nav('/notifications')
          await waitFor(() => cards().length === 3, 'cards')
          const after = cards().find((c) => c.textContent.includes('Upcoming payment: Netflix'))
          assert.ok(!after.textContent.includes('Mark as read'), 'read now (was unread: ' + wasUnread + ')')
        })

        await check('mark all as read clears the badge and disables the button', async () => {
          await click(findAll('button', 'Mark all as read')[0])
          await waitFor(() => unreadFromBell() === 0 && bell().getAttribute('aria-label') === 'Notifications' && has('You are all caught up'), 'all read')
          assert.ok(findAll('button', 'Mark all as read')[0].disabled)
          await click(findAll('button', 'Unread').find((b) => b.getAttribute('aria-pressed') !== null))
          await waitFor(() => has('No unread notifications.'), 'unread filter empty message')
          await click(findAll('button', 'All').find((b) => b.getAttribute('aria-pressed') !== null))
        })

        await check('stored per user and not recreated by repeated syncing (e.g. navigating around)', async () => {
          for (const p of ['/', '/calendar', '/subscriptions/all', '/notifications']) await nav(p)
          await waitFor(() => cards().length === 3, 'still 3')
          const key = Object.keys(localStorage).find((k) => k.startsWith('spm.mock.notifications.'))
          assert.equal(JSON.parse(localStorage.getItem(key)).length, 3)
          assert.equal(unreadFromBell(), 0)
        })

        await check('marking a payment paid adds a "marked as paid" notification and closes the old reminder', async () => {
          await nav('/subscriptions/upcoming')
          await waitFor(() => findAll('button', 'Mark paid').length, 'open payment')
          await click(findAll('button', 'Mark paid')[0])
          await waitFor(() => q('#paymentDate'), 'dialog')
          await submitDialog()
          await waitFor(() => !q('#paymentDate'), 'closed')
          await waitFor(() => unreadFromBell() === 1, 'one new unread, got ' + unreadFromBell())
          await nav('/notifications')
          await waitFor(() => titles().includes('Payment marked as paid: Netflix'), 'paid notification')
          assert.ok(has('paid on'))
        })

        await check('a payment that becomes overdue raises an overdue notification', async () => {
          await nav('/notifications')
          const k = Object.keys(localStorage).find((x) => x.startsWith('spm.mock.subscriptionPayments.'))
          const pays = JSON.parse(localStorage.getItem(k))
          const open = pays.find((p) => p.status === 'upcoming' && p.dueDate > iso(5))
          open.dueDate = iso(-2)
          localStorage.setItem(k, JSON.stringify(pays))
          await act(async () => { await S().load(S().uid) })
          await waitFor(() => titles().some((x) => x.startsWith('Overdue payment:')), 'overdue notification appears')
          await waitFor(() => unreadFromBell() === 2, 'badge 2, got ' + unreadFromBell())
          assert.ok(has('was due on') && has('Mark it as paid or skipped'))
        })

        await check('settings: turning notifications off stops new reminders and says so', async () => {
          await nav('/settings')
          await waitFor(() => q('#inAppNotifications') && q('#premiumReminderDays'), 'settings card')
          assert.equal(q('#inAppNotifications').checked, true)
          await click(q('#inAppNotifications'))
          await waitFor(() => q('#inAppNotifications').checked === false && q('#premiumReminderDays').disabled, 'switched off')
          await act(async () => { await S().create(sub({ name: 'Hulu', nextPaymentDate: iso(1) })) })
          await flush(100)
          await nav('/notifications')
          await waitFor(() => has('In-app notifications are turned off'), 'banner')
          assert.ok(!titles().some((x) => x.includes('Hulu')), 'no reminder created while off')
          assert.ok(findAll('a', 'Turn them on in Settings').length)
        })

        await check('settings: turning back on creates the reminders that apply; premium days are saved', async () => {
          await nav('/settings')
          await waitFor(() => q('#inAppNotifications'), 'card')
          await click(q('#inAppNotifications'))
          await waitFor(() => q('#inAppNotifications').checked === true && !q('#premiumReminderDays').disabled, 'on')
          await setValue(q('#premiumReminderDays'), '15')
          await waitFor(() => q('#premiumReminderDays').value === '15', 'select updated')
          const key = Object.keys(localStorage).find((k) => k.startsWith('spm.mock.settings.'))
          await waitFor(() => JSON.parse(localStorage.getItem(key)).find((d) => d.id === 'preferences')?.premiumReminderDays === 15, 'persisted')
          await nav('/notifications')
          await waitFor(() => titles().includes('Upcoming payment: Hulu'), 'Hulu reminder created on re-enable')
          assert.ok(!has('In-app notifications are turned off'))
        })

        await check('calendar export: downloads a valid .ics with upcoming items and reminders', async () => {
          await nav('/calendar')
          await waitFor(() => findAll('button', 'Export (.ics)').length && !findAll('button', 'Export (.ics)')[0].disabled, 'export button ready')
          await click(findAll('button', 'Export (.ics)')[0])
          await waitFor(() => downloads.length === 1 && downloads[0].name, 'download started')
          assert.equal(downloads[0].name, 'subscription-policy-reminders.ics')
          assert.equal(downloads[0].blob.type, 'text/calendar;charset=utf-8')
          const text = await downloads[0].blob.text()
          assert.ok(text.startsWith('BEGIN:VCALENDAR\r\n') && text.endsWith('END:VCALENDAR\r\n'))
          const flat = text.replace(/\r\n /g, '')
          for (const needle of ['Payment due: Spotify', 'Payment due: Hulu', 'Premium due: Car Cover', 'Policy expires: Car Cover', 'BEGIN:VALARM', 'TRIGGER:-P']) {
            assert.ok(flat.includes(needle), needle)
          }
          await waitFor(() => /Exported \d+ calendar events/.test(h.body()), 'success toast')
        })

        await check('calendar export: nothing to export -> message instead of an empty file', async () => {
          await click(q('button[aria-label="Log out"]'))
          await waitFor(() => path() === '/login', 'logged out')
          await registerUser('Empty Person', 'empty@example.com')
          const before = downloads.length
          await nav('/calendar')
          await waitFor(() => findAll('button', 'Export (.ics)').length && !findAll('button', 'Export (.ics)')[0].disabled, 'export ready')
          await click(findAll('button', 'Export (.ics)')[0])
          await waitFor(() => has('Nothing to export yet'), 'toast')
          assert.equal(downloads.length, before, 'no file created')
        })

        await check('another user has no notifications or badge', async () => {
          assert.equal(unreadFromBell(), 0)
          await nav('/notifications')
          await waitFor(() => has('No notifications yet'), 'empty')
          assert.equal(cards().length, 0)
        })
    } finally {
      await h.stop()
    }
  },
  120_000,
)
