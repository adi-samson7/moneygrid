import assert from 'node:assert/strict'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { vi } from 'vitest'
import App from '@/App'
import { router } from '@/routes'

/**
 * Boots the real app (router, stores, services, localStorage) in jsdom and returns helpers to drive
 * it like a user would: type, click, navigate and wait for text to appear.
 * jsdom has no layout engine, so these tests check behaviour and content, not visual appearance.
 */

// Console noise that is expected in jsdom and not a defect.
const IGNORED_ERRORS = /not wrapped in act|Not implemented: (navigation|window\.scrollTo)/

export async function startApp(options: { allowedErrors?: RegExp[] } = {}) {
  const consoleErrors: string[] = []
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(' ').slice(0, 400))
  })
  // Recharts warns when a chart has no size; jsdom never has one.
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

  localStorage.clear()
  window.history.replaceState(null, '', '/')
  await act(async () => {
    await router.navigate('/')
  })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  await act(async () => {
    root.render(createElement(App))
  })

  const flush = (ms = 20) =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms))
    })

  const waitFor = async <T>(condition: () => T, what: string, timeout = 4000): Promise<NonNullable<T>> => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      let value: T | undefined
      try {
        value = condition()
      } catch {
        value = undefined
      }
      if (value) return value as NonNullable<T>
      await flush()
    }
    throw new Error(`timed out waiting for: ${what}\n  path: ${window.location.pathname}\n  page: ${body().slice(0, 500)}`)
  }

  const body = () => (document.body.textContent ?? '').replace(/\s+/g, ' ')
  const has = (text: string) => body().includes(text)
  const path = () => window.location.pathname
  const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)
  const findAll = <T extends HTMLElement = HTMLElement>(selector: string, text?: string) =>
    [...document.querySelectorAll<T>(selector)].filter(
      (el) => !text || (el.textContent ?? '').replace(/\s+/g, ' ').trim().includes(text),
    )

  const click = async (el: Element | null | undefined) => {
    assert.ok(el, 'element to click not found')
    await act(async () => {
      ;(el as HTMLElement).click()
    })
    await flush()
  }

  const setValue = async (el: Element | null | undefined, value: string) => {
    assert.ok(el, 'input not found')
    const proto =
      el instanceof window.HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : el instanceof window.HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
      el.dispatchEvent(new window.Event(el instanceof window.HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
  }

  const submitDialog = () => click(q('[role="dialog"] button[type="submit"], form button[type="submit"]'))

  const nav = async (to: string) => {
    await act(async () => {
      await router.navigate(to)
    })
    await flush(50)
  }

  const registerUser = async (name: string, email: string) => {
    await nav('/register')
    await waitFor(() => q('#fullName'), 'register form')
    await setValue(q('#fullName'), name)
    await setValue(q('#email'), email)
    await setValue(q('#password'), 'password123')
    await setValue(q('#confirmPassword'), 'password123')
    await click(findAll('button', 'Create account').find((b) => (b as HTMLButtonElement).type === 'submit'))
    await waitFor(() => path() === '/' && has(name), 'signed in')
  }

  /** Unmounts the app and fails if it logged an unexpected error. */
  const stop = async () => {
    await act(async () => root.unmount())
    container.remove()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
    const allowed = [IGNORED_ERRORS, ...(options.allowedErrors ?? [])]
    const unexpected = [...new Set(consoleErrors)].filter((e) => !allowed.some((pattern) => pattern.test(e)))
    assert.deepEqual(unexpected, [], `the app logged errors:\n${unexpected.join('\n')}`)
  }

  return { nav, click, setValue, waitFor, has, body, path, findAll, q, submitDialog, flush, registerUser, stop, act, router }
}

export type AppHarness = Awaited<ReturnType<typeof startApp>>
