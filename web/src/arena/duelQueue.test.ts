import { describe, expect, it } from 'vitest'
import { createDuelQueue } from './duelQueue'

describe('createDuelQueue', () => {
  it('never runs more than the limit at once and drains the backlog in order', () => {
    const started: number[] = []
    const finishers: Array<() => void> = []
    let peak = 0
    const queue = createDuelQueue<number>({
      limit: 8,
      start: (item, done) => {
        started.push(item)
        finishers.push(done)
        peak = Math.max(peak, queue.active())
        return true
      }
    })
    for (let item = 0; item < 20; item++) queue.enqueue(item)
    expect(queue.active()).toBe(8)
    expect(queue.pending()).toBe(12)
    while (finishers.length > 0) {
      finishers.shift()?.()
      peak = Math.max(peak, queue.active())
      expect(queue.active()).toBeLessThanOrEqual(8)
    }
    expect(started).toEqual(Array.from({ length: 20 }, (_, index) => index))
    expect(peak).toBe(8)
    expect(queue.active()).toBe(0)
    expect(queue.pending()).toBe(0)
  })

  it('holds an item that cannot start yet and retries after a duel finishes', () => {
    const blocked = new Set<number>([2])
    const finishers = new Map<number, () => void>()
    const queue = createDuelQueue<number>({
      limit: 8,
      start: (item, done) => {
        if (blocked.has(item)) return false
        finishers.set(item, done)
        return true
      }
    })
    queue.enqueue(1)
    queue.enqueue(2)
    queue.enqueue(3)
    expect(queue.active()).toBe(1)
    expect(queue.pending()).toBe(2)
    blocked.delete(2)
    finishers.get(1)?.()
    expect(finishers.has(2)).toBe(true)
    expect(finishers.has(3)).toBe(true)
  })

  it('hands back the waiting items when cleared', () => {
    const queue = createDuelQueue<number>({ limit: 1, start: () => true })
    queue.enqueue(1)
    queue.enqueue(2)
    queue.enqueue(3)
    expect(queue.clear()).toEqual([2, 3])
    expect(queue.pending()).toBe(0)
  })

  it('accepts items that finish synchronously without leaking slots', () => {
    const queue = createDuelQueue<number>({
      limit: 2,
      start: (_item, done) => {
        done()
        return true
      }
    })
    for (let item = 0; item < 10; item++) queue.enqueue(item)
    expect(queue.active()).toBe(0)
    expect(queue.pending()).toBe(0)
  })
})
