import assert from 'node:assert/strict'
import { startApp } from '@/test/app-harness'
import { scenario } from '@/test/steps'
import { setTheme } from '@/lib/theme'

const isDark = () => document.documentElement.classList.contains('dark')

scenario(
  'flow: switching between light and dark mode',
  async (check) => {
    setTheme('light')
    const h = await startApp()
    const { nav, click, setValue, waitFor, q, registerUser } = h

    try {
      await registerUser('Theme Tester', 'theme@example.com')

      await check('the header button switches to dark and back, and the label follows', async () => {
        await waitFor(() => q('button[aria-label="Switch to dark mode"]'), 'toggle shows the dark option')
        assert.equal(isDark(), false)
        await click(q('button[aria-label="Switch to dark mode"]'))
        await waitFor(() => isDark() && q('button[aria-label="Switch to light mode"]'), 'dark applied')
        assert.equal(localStorage.getItem('moneygrid-theme'), 'dark')
        await click(q('button[aria-label="Switch to light mode"]'))
        await waitFor(() => !isDark() && q('button[aria-label="Switch to dark mode"]'), 'light applied')
      })

      await check('Settings offers Light, Dark and Match my device', async () => {
        await nav('/settings')
        await waitFor(() => q('#theme'), 'appearance select')
        const select = q<HTMLSelectElement>('#theme')!
        assert.deepEqual([...select.options].map((o) => o.value), ['system', 'light', 'dark'])
        await setValue(select, 'dark')
        await waitFor(() => isDark(), 'dark from settings')
        await setValue(select, 'system')
        await waitFor(() => !isDark() && localStorage.getItem('moneygrid-theme') === 'system', 'follows the device again (jsdom reports a light device)')
      })
    } finally {
      await h.stop()
    }
  },
  60_000,
)
