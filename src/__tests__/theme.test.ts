import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'vitest'
import { initTheme, resolveTheme, setTheme } from '@/lib/theme'

const isDark = () => document.documentElement.classList.contains('dark')

describe('theme', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  test('dark and light are applied to the page and remembered', () => {
    setTheme('dark')
    assert.equal(isDark(), true)
    assert.equal(localStorage.getItem('moneygrid-theme'), 'dark')
    setTheme('light')
    assert.equal(isDark(), false)
    assert.equal(localStorage.getItem('moneygrid-theme'), 'light')
  })

  test('"system" is remembered as a choice and follows the device', () => {
    setTheme('dark')
    setTheme('system')
    assert.equal(localStorage.getItem('moneygrid-theme'), 'system')
    assert.equal(isDark(), resolveTheme('system') === 'dark') // jsdom reports a light device
    assert.equal(isDark(), false)
  })

  test('a first-time visitor gets dark mode', () => {
    initTheme()
    assert.equal(isDark(), true)
    assert.equal(localStorage.getItem('moneygrid-theme'), null, 'nothing is saved until they choose')
  })

  test('the saved choice is applied on start-up, and junk values are ignored', () => {
    localStorage.setItem('moneygrid-theme', 'dark')
    initTheme()
    assert.equal(isDark(), true)
    localStorage.setItem('moneygrid-theme', 'purple')
    initTheme()
    assert.equal(isDark(), true) // unknown values fall back to the default, dark
    localStorage.setItem('moneygrid-theme', 'light')
    initTheme()
    assert.equal(isDark(), false)
  })

  test('blocked storage does not break switching', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
    try {
      setTheme('dark')
      assert.equal(isDark(), true)
    } finally {
      Storage.prototype.setItem = original
    }
  })
})
