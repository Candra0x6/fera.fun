import { useSyncExternalStore } from 'react'

export interface ExternalStore<T> {
  get: () => T
  set: (next: T | ((previous: T) => T)) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore<T>(initial: T): ExternalStore<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === 'function' ? (next as (previous: T) => T)(value) : next
      if (Object.is(resolved, value)) return
      value = resolved
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

export function useStore<T>(store: ExternalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get)
}
