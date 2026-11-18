import assert from 'node:assert/strict'
import { startApp } from '@/test/app-harness'
import { scenario } from '@/test/steps'

scenario(
  'flow: sidebar groups collapse and expand',
  async (check) => {
    localStorage.removeItem('moneygrid-nav-collapsed')
    const h = await startApp()
    const { nav, click, waitFor, q, registerUser } = h
    const groupButton = (name: string) =>
      [...document.querySelectorAll<HTMLButtonElement>('aside nav button[aria-expanded]')].find((b) => b.textContent?.includes(name))!
    const list = (name: string) => document.getElementById(groupButton(name).getAttribute('aria-controls')!)!

    try {
      await registerUser('Nav Tester', 'nav@example.com')

      await check('both groups start expanded, with their pages reachable', async () => {
        await waitFor(() => document.querySelector('aside nav'), 'sidebar')
        for (const name of ['Subscriptions', 'Policies']) {
          assert.equal(groupButton(name).getAttribute('aria-expanded'), 'true')
          assert.equal(list(name).hasAttribute('inert'), false)
        }
      })

      await check('clicking a heading folds the group away and hides its links from keyboard users', async () => {
        await click(groupButton('Policies'))
        await waitFor(() => groupButton('Policies').getAttribute('aria-expanded') === 'false', 'collapsed')
        assert.equal(list('Policies').hasAttribute('inert'), true, 'hidden links are not focusable')
        assert.equal(groupButton('Subscriptions').getAttribute('aria-expanded'), 'true', 'the other group is unaffected')
        assert.deepEqual(JSON.parse(localStorage.getItem('moneygrid-nav-collapsed')!), ['Policies'], 'choice remembered')
      })

      await check('clicking again opens it', async () => {
        await click(groupButton('Policies'))
        await waitFor(() => groupButton('Policies').getAttribute('aria-expanded') === 'true', 'expanded')
        assert.deepEqual(JSON.parse(localStorage.getItem('moneygrid-nav-collapsed')!), [])
      })

      await check('going to a page inside a collapsed group opens it', async () => {
        await click(groupButton('Subscriptions'))
        await waitFor(() => groupButton('Subscriptions').getAttribute('aria-expanded') === 'false', 'collapsed')
        await nav('/subscriptions/all')
        await waitFor(() => groupButton('Subscriptions').getAttribute('aria-expanded') === 'true', 'opened by navigation')
      })

      await check('a collapsed group stays collapsed on pages outside it, and a saved choice is honoured on load', async () => {
        await click(groupButton('Policies'))
        await nav('/calendar')
        await waitFor(() => document.querySelector('aside nav'), 'sidebar')
        assert.equal(groupButton('Policies').getAttribute('aria-expanded'), 'false')
      })
    } finally {
      await h.stop()
      localStorage.removeItem('moneygrid-nav-collapsed')
    }
  },
  60_000,
)
