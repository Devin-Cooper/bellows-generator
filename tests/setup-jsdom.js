// tests/setup-jsdom.js
// Vitest setup file: patch Web Storage globals for Node.js 22+ compatibility.
//
// In Node.js 22+, `globalThis.localStorage` exists but is `undefined` (it
// requires --localstorage-file to be usable). When vitest runs a
// `@vitest-environment jsdom` test, jsdom's window.localStorage is a real
// Storage object, but it doesn't automatically override the Node.js built-in
// binding because the property already exists on globalThis.
//
// This file explicitly wires jsdom's implementations so bare
// `localStorage`/`sessionStorage` references in test code work as expected.
if (typeof window !== 'undefined') {
  // In a jsdom environment, window.localStorage should be available when the
  // URL is http-based. If it isn't (e.g. jsdom URL not set), provide a
  // minimal in-memory polyfill so the tests can still run.
  const ls = (() => {
    if (window.localStorage && typeof window.localStorage.clear === 'function') {
      return window.localStorage;
    }
    // Minimal in-memory Storage polyfill
    const store = Object.create(null);
    return {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    };
  })();

  Object.defineProperty(globalThis, 'localStorage', {
    value: ls,
    writable: true,
    configurable: true,
  });

  const ss = (() => {
    if (window.sessionStorage && typeof window.sessionStorage.clear === 'function') {
      return window.sessionStorage;
    }
    const store = Object.create(null);
    return {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    };
  })();

  Object.defineProperty(globalThis, 'sessionStorage', {
    value: ss,
    writable: true,
    configurable: true,
  });
}
