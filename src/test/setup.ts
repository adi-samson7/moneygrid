// Runs before every test file. jsdom has no layout engine, so browser APIs that components and
// libraries expect are stubbed here. Files that run in plain Node (the emulator tests) skip this.

if (typeof window !== 'undefined') {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }

  Object.assign(window, {
    ResizeObserver: NoopObserver,
    IntersectionObserver: NoopObserver,
    scrollTo: () => {},
  })
  Object.assign(globalThis, { ResizeObserver: NoopObserver, IntersectionObserver: NoopObserver })

  window.matchMedia = () =>
    ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList

  Element.prototype.scrollIntoView = () => {}
  Element.prototype.getAnimations = () => []
  HTMLElement.prototype.hasPointerCapture = () => false
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.releasePointerCapture = () => {}

}
