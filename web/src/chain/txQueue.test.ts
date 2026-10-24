import { describe, expect, it } from 'vitest'
import { createTxQueue } from './txQueue'

describe('createTxQueue', () => {
  it('spaces value transactions at least four blocks apart while the balance is low', async () => {
    let clock = 0
    const sleeps: number[] = []
    const queue = createTxQueue({
      minGapMs: 1200,
      lowBalanceWei: 10n * 10n ** 18n,
      now: () => clock,
      sleep: (ms) => {
        sleeps.push(ms)
        clock += ms
        return Promise.resolve()
      }
    })
    const starts: number[] = []
    const task = () => {
      starts.push(clock)
      return Promise.resolve(true)
    }
    await Promise.all([queue.run(task, 1n, 5n * 10n ** 18n), queue.run(task, 1n, 5n * 10n ** 18n)])
    expect(starts).toHaveLength(2)
    expect((starts[1] ?? 0) - (starts[0] ?? 0)).toBeGreaterThanOrEqual(1200)
    expect(sleeps).toHaveLength(1)
  })

  it('does not delay when the balance is comfortable or no value is sent', async () => {
    const sleeps: number[] = []
    const queue = createTxQueue({
      minGapMs: 1200,
      lowBalanceWei: 10n * 10n ** 18n,
      now: () => 0,
      sleep: (ms) => {
        sleeps.push(ms)
        return Promise.resolve()
      }
    })
    await queue.run(() => Promise.resolve(1), 1n, 50n * 10n ** 18n)
    await queue.run(() => Promise.resolve(1), 1n, 50n * 10n ** 18n)
    await queue.run(() => Promise.resolve(1), 0n, 1n)
    await queue.run(() => Promise.resolve(1), 0n, 1n)
    expect(sleeps).toHaveLength(0)
  })

  it('keeps running after a failed task', async () => {
    const queue = createTxQueue({ minGapMs: 0, lowBalanceWei: 0n, now: () => 0, sleep: () => Promise.resolve() })
    await expect(queue.run(() => Promise.reject(new Error('boom')), 0n, null)).rejects.toThrow('boom')
    await expect(queue.run(() => Promise.resolve('ok'), 0n, null)).resolves.toBe('ok')
  })
})
