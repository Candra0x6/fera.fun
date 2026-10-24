import { describe, expect, it } from 'vitest'
import { getStatus, setStatus, statusFromFeed, subscribeStatus } from './status'

describe('statusFromFeed', () => {
  it('reports live when the upstream is live and fresh', () => {
    expect(statusFromFeed({ upstream: 'live', headBlock: 10, lagSeconds: 1 }).kind).toBe('live')
  })

  it('reports lagging when the feed is behind', () => {
    expect(statusFromFeed({ upstream: 'live', headBlock: 10, lagSeconds: 20 }).kind).toBe('lagging')
    expect(statusFromFeed({ upstream: 'polling', headBlock: 10, lagSeconds: 12 }).kind).toBe('lagging')
  })

  it('treats fresh polling as live', () => {
    expect(statusFromFeed({ upstream: 'polling', headBlock: 10, lagSeconds: 2 }).kind).toBe('live')
  })

  it('reports disconnected while reconnecting', () => {
    expect(statusFromFeed({ upstream: 'reconnecting', headBlock: 10, lagSeconds: 0 }).kind).toBe('disconnected')
  })
})

describe('status store', () => {
  it('notifies subscribers only when the state changes', () => {
    let calls = 0
    const unsubscribe = subscribeStatus(() => {
      calls += 1
    })
    setStatus({ kind: 'replay', blockNumber: 1, lagSeconds: 0 })
    setStatus({ kind: 'replay', blockNumber: 1, lagSeconds: 0 })
    setStatus({ kind: 'replay', blockNumber: 2, lagSeconds: 0 })
    unsubscribe()
    setStatus({ kind: 'live', blockNumber: 3, lagSeconds: 0 })
    expect(calls).toBe(2)
    expect(getStatus().kind).toBe('live')
  })
})
