import assert from 'node:assert/strict'
import { usePoliciesStore } from '@/stores/policies.store'
import { useSubscriptionsStore } from '@/stores/subscriptions.store'
import { startApp } from '@/test/app-harness'
import { scenario } from '@/test/steps'

const today = new Date()
const iso = (n: number) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** What a screen reader would announce for an element. */
function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label')?.trim()
  if (aria) return aria
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim()
    if (text) return text
  }
  const id = el.getAttribute('id')
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (label?.textContent?.trim()) return label.textContent.trim()
  }
  const wrapping = el.closest('label')
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim()
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (text) return text
  return el.getAttribute('title')?.trim() ?? el.getAttribute('placeholder')?.trim() ?? ''
}

function audit(where: string): string[] {
  const problems: string[] = []
  const describe = (el: Element) => `<${el.tagName.toLowerCase()}${el.id ? ` id="${el.id}"` : ''}${el.className && typeof el.className === 'string' ? ` class="${el.className.slice(0, 40)}"` : ''}>`

  for (const el of document.querySelectorAll('button, [role="button"]')) {
    if (!accessibleName(el)) problems.push(`${where}: button without a name ${describe(el)}`)
  }
  for (const el of document.querySelectorAll('a[href]')) {
    if (!accessibleName(el)) problems.push(`${where}: link without a name ${describe(el)}`)
  }
  for (const el of document.querySelectorAll('input, select, textarea')) {
    const type = el.getAttribute('type')
    if (type === 'hidden') continue
    const id = el.getAttribute('id')
    const labelled = Boolean(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.closest('label'))
    if (!labelled) problems.push(`${where}: form field without a label ${describe(el)}`)
  }
  const h1s = document.querySelectorAll('h1')
  if (h1s.length !== 1) problems.push(`${where}: expected exactly one <h1>, found ${h1s.length}`)

  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id).filter((i) => i && !i.startsWith('base-ui') && !i.startsWith(':r') && !i.startsWith('«'))
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dupes.length) problems.push(`${where}: duplicate ids ${[...new Set(dupes)].join(', ')}`)

  for (const table of document.querySelectorAll('table')) {
    // FullCalendar's grid manages its own responsive scrolling.
    if (table.closest('.fc')) continue
    const container = table.closest('[data-slot="table-container"]')
    if (!container || !/overflow-x-auto|overflow-auto|overflow-x-scroll/.test(container.className)) {
      problems.push(`${where}: a table is not wrapped in a horizontally scrollable container (it will overflow on small screens)`)
    }
  }
  for (const img of document.querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) problems.push(`${where}: image without alt text`)
  }
  return problems
}

scenario(
  'flow: accessibility audit of every page and form',
  async (check) => {
    const h = await startApp()
    const { nav, click, waitFor, has, findAll, q, registerUser, act } = h
    const S = () => useSubscriptionsStore.getState()
    const P = () => usePoliciesStore.getState()
    const sub = (o: object) => ({ name: 'x', provider: '', category: 'Entertainment', amountMinor: 49900, currency: 'INR', billingCycle: 'monthly', startDate: iso(-40), nextPaymentDate: iso(2), paymentMethod: '', reminderDays: 3, ...o }) as never
    const pol = (o: object) => ({ provider: 'Acme', policyName: 'x', policyType: 'vehicle', policyNumber: '', premiumAmountMinor: 900000, currency: 'INR', coverageAmountMinor: 5000000, billingCycle: 'monthly', startDate: iso(-100), expiryDate: iso(20), nextPremiumDate: iso(3), reminderDays: 30, notes: '', ...o }) as never

    try {
      await check('sign-in pages', async () => {
        for (const route of ['/login', '/register', '/forgot-password', '/reset-password']) {
          await nav(route)
          await waitFor(() => q('h1, [data-slot="card-title"]') || has('Log in'), route)
          // Auth pages use a card title rather than an h1; the layout provides the product name.
          const problems = audit(route).filter((p) => !p.includes('exactly one <h1>'))
          assert.deepEqual(problems, [])
        }
      })

      await registerUser('Access Tester', 'a11y@example.com')
      await act(async () => {
        await S().create(sub({ name: 'Netflix' }))
        await S().create(sub({ name: 'Spotify', category: 'Music', nextPaymentDate: iso(40) }))
        await P().create(pol({ policyName: 'Car Cover' }))
      })

      const pages: [string, string][] = [
        ['/', 'Dashboard'],
        ['/subscriptions', 'Subscriptions Overview'],
        ['/subscriptions/all', 'All Subscriptions'],
        ['/subscriptions/upcoming', 'Upcoming Payments'],
        ['/subscriptions/history', 'Payment History'],
        ['/policies', 'Policies Overview'],
        ['/policies/all', 'All Policies'],
        ['/policies/renewals', 'Upcoming Renewals'],
        ['/policies/details', 'Policy Details'],
        ['/calendar', 'Calendar'],
        ['/analytics', 'Analytics'],
        ['/notifications', 'Notifications'],
        ['/settings', 'Settings'],
      ]
      for (const [route, heading] of pages) {
        await check(`page ${route}`, async () => {
          await nav(route)
          await waitFor(() => findAll('h1', heading).length === 1, `${heading} heading`)
          await h.flush(100)
          assert.deepEqual(audit(route), [])
          assert.ok(q('main'), 'has a main landmark')
          assert.ok(q('nav[aria-label]'), 'navigation is labelled')
        })
      }

      await check('detail pages', async () => {
        const subId = S().subscriptions[0].id
        const polId = P().policies[0].id
        for (const [route, heading] of [[`/subscriptions/${subId}`, 'Netflix'], [`/policies/${polId}`, 'Car Cover']]) {
          await nav(route)
          await waitFor(() => findAll('h1', heading).length === 1, heading)
          assert.deepEqual(audit(route), [])
        }
      })

      await check('subscription add and edit dialogs', async () => {
        await nav('/subscriptions/all')
        await waitFor(() => findAll('button', 'Add subscription').length, 'add button')
        await click(findAll('button', 'Add subscription')[0])
        await waitFor(() => q('#name'), 'dialog')
        assert.ok(q('[role="dialog"]'), 'dialog role')
        assert.deepEqual(audit('add subscription dialog').filter((p) => !p.includes('<h1>')), [])
        await click(findAll('button', 'Cancel')[0])
        await waitFor(() => !q('#name'), 'closed')
      })

      await check('policy add dialog, renew dialog and payment dialog', async () => {
        await nav('/policies/all')
        await waitFor(() => findAll('button', 'Add policy').length, 'add button')
        await click(findAll('button', 'Add policy')[0])
        await waitFor(() => q('#policyName'), 'dialog')
        assert.deepEqual(audit('add policy dialog'), [])
        await click(findAll('button', 'Cancel')[0])
        await waitFor(() => !q('#policyName'), 'closed')
        await nav('/policies/renewals')
        await waitFor(() => findAll('button', 'Mark paid').length, 'open premium')
        await click(findAll('button', 'Mark paid')[0])
        await waitFor(() => q('#paymentDate'), 'payment dialog')
        assert.deepEqual(audit('payment dialog'), [])
      })
    } finally {
      await h.stop()
    }
  },
  180_000,
)
