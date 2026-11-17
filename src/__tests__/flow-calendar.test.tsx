import assert from 'node:assert/strict'
import { startApp } from '@/test/app-harness'
import { scenario } from '@/test/steps'

scenario(
  "flow: calendar views, events and filters",
  async (check) => {
    const h = await startApp()
    const { nav, click, waitFor, has, path, findAll, q, registerUser, act, flush } = h


    const today = new Date()
    const iso = (n) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const events = () => [...document.querySelectorAll('.fc-event')]
    const eventTitles = () => events().map((e) => e.textContent.replace(/\s+/g, ' ').trim())
    const hasEvent = (text) => eventTitles().some((t) => t.includes(text))
    const toolbarTitle = () => q('.fc-toolbar-title')?.textContent

    try {
        await registerUser('Meera Iyer', 'meera@example.com')

        await check('calendar: empty state hint, calendar still renders', async () => {
          await nav('/calendar')
          await waitFor(() => has("You haven't added any subscriptions or policies yet") && q('.fc') && q('.fc-toolbar-title'), 'calendar + hint')
          assert.equal(events().length, 0)
        })

        const { useSubscriptionsStore } = await import('@/stores/subscriptions.store')
        const { usePoliciesStore } = await import('@/stores/policies.store')
        const S = () => useSubscriptionsStore.getState()
        const P = () => usePoliciesStore.getState()
        const sub = (o) => ({ name: 'x', provider: '', category: 'Entertainment', amountMinor: 49900, currency: 'INR', billingCycle: 'monthly', startDate: iso(-40), nextPaymentDate: iso(0), paymentMethod: '', reminderDays: 3, ...o })
        const pol = (o) => ({ provider: 'Acme', policyName: 'x', policyType: 'vehicle', policyNumber: '', premiumAmountMinor: 900000, currency: 'INR', coverageAmountMinor: 5000000, billingCycle: 'yearly', startDate: iso(-100), expiryDate: iso(0), nextPremiumDate: '', reminderDays: 30, notes: '', ...o })
        await act(async () => {
          await S().create(sub({ name: 'Netflix', nextPaymentDate: iso(0) }))
          await S().create(sub({ name: 'Hotstar', currency: 'USD', amountMinor: 1549, nextPaymentDate: iso(0) }))
          await P().create(pol({ policyName: 'Car Cover', expiryDate: iso(0) }))
        })

        await check('calendar: shows payment and expiry events with amounts, on the right day', async () => {
          await nav('/calendar')
          await waitFor(() => hasEvent('Netflix') && hasEvent('Hotstar') && hasEvent('Car Cover'), 'events')
          assert.ok(eventTitles().some((t) => /Netflix · .*499\.00/.test(t)), eventTitles().join(' | '))
          assert.ok(eventTitles().some((t) => /Hotstar · .*15\.49/.test(t)))
          assert.ok(eventTitles().some((t) => t.includes('Car Cover expires')))
          // Today's cell holds today's events
          const todayCell = q('.fc-day-today')
          assert.ok(todayCell, 'today cell highlighted')
          assert.ok(todayCell.textContent.includes('Netflix'), 'Netflix is in today\'s cell')
        })

        await check('calendar: colors follow the legend (blue subscriptions, green policies)', async () => {
          const style = (text) => events().find((e) => e.textContent.includes(text)).getAttribute('style') ?? ''
          assert.ok(/#2563eb|rgb\(37,\s*99,\s*235\)/i.test(style('Netflix')), 'subscription blue: ' + style('Netflix'))
          assert.ok(/#047857|rgb\(4,\s*120,\s*87\)/i.test(style('Car Cover')), 'policy green: ' + style('Car Cover'))
          assert.ok(has('Subscription payments') && has('Policy premiums and renewals') && has('Overdue') && has('Cancelled, expired or skipped'), 'legend')
        })

        await check('calendar: clicking an event opens its details, then opens the record', async () => {
          await click(events().find((e) => e.textContent.includes('Netflix')))
          await waitFor(() => has('Subscription payment') && has('Open subscription') && has('Upcoming'), 'details dialog')
          assert.ok(/Amount.*499\.00/.test(h.body()))
          await click(findAll('button', 'Open subscription')[0])
          await waitFor(() => /\/subscriptions\/[0-9a-f-]{36}/.test(path()) && has('Netflix') && has('Details'), 'navigated to subscription')
        })

        await check('calendar: policy event details link to the policy', async () => {
          await nav('/calendar')
          await waitFor(() => hasEvent('Car Cover'), 'events')
          await click(events().find((e) => e.textContent.includes('Car Cover')))
          await waitFor(() => has('Policy expiry') && has('Policy expires') && has('Open policy'), 'dialog')
          assert.ok(!/Amount/.test(h.body()), 'expiry events have no amount row')
          await click(findAll('button', 'Close')[0])
          await waitFor(() => !has('Open policy'), 'closed')
        })

        await check('calendar: module filter shows only subscriptions or only policies', async () => {
          await click(findAll('button', 'Policies').find((b) => b.getAttribute('aria-pressed') !== null))
          await waitFor(() => hasEvent('Car Cover') && !hasEvent('Netflix') && !hasEvent('Hotstar'), 'policies only')
          await click(findAll('button', 'Subscriptions').find((b) => b.getAttribute('aria-pressed') !== null))
          await waitFor(() => hasEvent('Netflix') && !hasEvent('Car Cover'), 'subscriptions only')
          await click(findAll('button', 'All').find((b) => b.getAttribute('aria-pressed') !== null))
          await waitFor(() => hasEvent('Netflix') && hasEvent('Car Cover'), 'all')
        })

        await check('calendar: week, year and month views all show the events', async () => {
          const monthTitle = toolbarTitle()
          await click(q('.fc-dayGridWeek-button'))
          await waitFor(() => q('.fc-dayGridWeek-view, .fc-daygrid') && hasEvent('Netflix'), 'week view with events')
          assert.notEqual(toolbarTitle(), monthTitle, 'toolbar title changes for a week range')
          await click(q('.fc-multiMonthYear-button'))
          await waitFor(() => q('.fc-multimonth') && toolbarTitle() === String(today.getFullYear()), 'year view')
          await waitFor(() => events().length > 0, 'year events present')
          await click(q('.fc-dayGridMonth-button'))
          await waitFor(() => toolbarTitle() === monthTitle && hasEvent('Netflix'), 'back to month')
        })

        await check('calendar: next/previous/today navigate months; future months show expected payments (dashed)', async () => {
          const start = toolbarTitle()
          await click(q('.fc-next-button'))
          await waitFor(() => toolbarTitle() !== start, 'moved forward')
          await waitFor(() => hasEvent('Netflix'), 'monthly subscription projected into next month')
          const projected = events().find((e) => e.textContent.includes('Netflix'))
          assert.ok(projected.classList.contains('event-projected'), 'projected events are marked')
          assert.ok(!hasEvent('Car Cover expires'), 'policy expiry is not repeated')
          await click(q('.fc-prev-button'))
          await waitFor(() => toolbarTitle() === start, 'back')
          await click(q('.fc-next-button'))
          await click(q('.fc-today-button'))
          await waitFor(() => toolbarTitle() === start && hasEvent('Car Cover expires'), 'today button returns')
        })

        await check('calendar: marking a payment paid is reflected with a check mark', async () => {
          await nav('/subscriptions/upcoming')
          await waitFor(() => findAll('button', 'Mark paid').length, 'open payments')
          await click(findAll('button', 'Mark paid')[0])
          await waitFor(() => q('#paymentDate'), 'dialog')
          await h.submitDialog()
          await waitFor(() => !q('#paymentDate'), 'closed')
          await nav('/calendar')
          await waitFor(() => events().some((e) => e.textContent.trim().startsWith('✓')), 'paid event with check mark')
        })

        await check('calendar: cancelled subscriptions turn grey and stop projecting', async () => {
          const hotstar = S().subscriptions.find((s) => s.name === 'Hotstar')
          const netflix = S().subscriptions.find((s) => s.name === 'Netflix')
          await act(async () => {
            await S().setStatus(hotstar.id, 'cancelled')
            await S().setStatus(netflix.id, 'cancelled')
          })
          await nav('/calendar')
          await waitFor(() => q('.fc-toolbar-title'), 'calendar')
          // Hotstar had only an open payment, which is removed on cancel; nothing remains for it.
          assert.ok(!hasEvent('Hotstar'), 'no Hotstar events after cancel with no history')
          // Netflix keeps its paid history, now shown grey.
          const paid = events().find((e) => e.textContent.includes('Netflix'))
          assert.ok(paid, 'paid history stays on the calendar')
          assert.ok(/#6b7280|rgb\(107,\s*114,\s*128\)/i.test(paid.getAttribute('style') ?? ''), 'grey: ' + paid.getAttribute('style'))
          await click(q('.fc-next-button'))
          await flush(50)
          assert.ok(!hasEvent('Netflix') && !hasEvent('Hotstar'), 'no projections for cancelled subscriptions')
          await click(q('.fc-today-button'))
        })

        await check('calendar: another user sees an empty calendar', async () => {
          await click(q('button[aria-label="Log out"]'))
          await waitFor(() => path() === '/login', 'logged out')
          await registerUser('Other Person', 'other@example.com')
          await nav('/calendar')
          await waitFor(() => has("You haven't added any subscriptions or policies yet") && q('.fc'), 'empty calendar')
          assert.equal(events().length, 0)
        })
    } finally {
      await h.stop()
    }
  },
  120_000,
)
