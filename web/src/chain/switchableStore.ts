import { createArenaStore } from '@animal/shared'
import type { ArenaStore } from '@animal/shared'

export interface SwitchableStore extends ArenaStore {
  reset(): void
}

export function createSwitchableStore(factory: () => ArenaStore = () => createArenaStore()): SwitchableStore {
  let inner = factory()
  const listeners = new Set<() => void>()
  let unsubscribeInner = inner.subscribe(notify)

  function notify(): void {
    for (const listener of [...listeners]) listener()
  }

  return {
    getState: () => inner.getState(),
    subscribe(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    hydrate: (snapshot) => inner.hydrate(snapshot),
    apply: (e) => inner.apply(e),
    commit: (c) => inner.commit(c),
    retract: (r) => inner.retract(r),
    replay: (events, opts) => inner.replay(events, opts),
    reset() {
      unsubscribeInner()
      inner = factory()
      unsubscribeInner = inner.subscribe(notify)
      notify()
    }
  }
}
