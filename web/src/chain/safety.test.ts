import { afterEach, describe, expect, it, vi } from 'vitest'
import { withTimeout } from './safety'

afterEach(() => vi.useRealTimers())

describe('withTimeout', () => {
  it('resolves when the task resolves first', async () => {
    await expect(withTimeout(Promise.resolve(), 1000)).resolves.toBeUndefined()
  })
  it('resolves after the timeout when the task never settles', async () => {
    vi.useFakeTimers()
    let done = false
    void withTimeout(new Promise(() => undefined), 5000).then(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(4999)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(done).toBe(true)
  })
  it('resolves when the task rejects', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 1000)).resolves.toBeUndefined()
  })
})
