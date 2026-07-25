import '@testing-library/jest-dom/vitest'

// React Flow needs these browser APIs that jsdom lacks.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as any).ResizeObserver = ResizeObserverMock

if (!(globalThis as any).DOMMatrixReadOnly) {
  ;(globalThis as any).DOMMatrixReadOnly = class {
    m22 = 1
    constructor() {}
  }
}
