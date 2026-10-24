import { describe, expect, it } from 'vitest'
import { createArenaStore } from '@animal/shared'
import { createRoundFollower } from './roundFollow'
import { createSwitchableStore } from './switchableStore'

function manual() {
  const jobs: Array<() => void> = []
  return { schedule: (cb: () => void) => jobs.push(cb), cancel: () => undefined, tick: () => jobs.forEach((job) => job()) }
}

describe('createRoundFollower', () => {
  it('adopts the current round on start and follows new rounds only', async () => {
    const timer = manual()
    let chain = 3
    const seen: Array<[number, number | null]> = []
    const follower = createRoundFollower({
      readCurrent: () => Promise.resolve(chain),
      onRound: (id, previous) => seen.push([id, previous]),
      schedule: timer.schedule,
      cancel: timer.cancel
    })
    await follower.start()
    timer.tick()
    await Promise.resolve()
    expect(seen).toEqual([[3, null]])
    chain = 4
    timer.tick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(seen).toEqual([[3, null], [4, 3]])
  })

  it('ignores older or repeated round ids from events', async () => {
    const seen: number[] = []
    const follower = createRoundFollower({ readCurrent: () => Promise.resolve(5), onRound: (id) => seen.push(id), schedule: () => 0, cancel: () => undefined })
    await follower.start()
    follower.noteRoundCreated(5)
    follower.noteRoundCreated(4)
    follower.noteRoundCreated(6)
    expect(seen).toEqual([5, 6])
    expect(follower.current()).toBe(6)
  })

  it('uses a fixed round without polling', async () => {
    const seen: number[] = []
    let reads = 0
    const follower = createRoundFollower({ readCurrent: () => { reads += 1; return Promise.resolve(9) }, fixedRoundId: 2, onRound: (id) => seen.push(id) })
    await follower.start()
    expect(seen).toEqual([2])
    expect(reads).toBe(0)
    follower.stop()
  })

  it('survives read failures and stops cleanly', async () => {
    const timer = manual()
    const seen: number[] = []
    let fail = true
    const follower = createRoundFollower({
      readCurrent: () => (fail ? Promise.reject(new Error('rpc')) : Promise.resolve(7)),
      onRound: (id) => seen.push(id),
      schedule: timer.schedule,
      cancel: timer.cancel
    })
    await follower.start()
    fail = false
    timer.tick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(seen).toEqual([7])
    follower.stop()
    follower.noteRoundCreated(8)
    expect(seen).toEqual([7])
  })
})

describe('createSwitchableStore', () => {
  it('drops the old state and notifies subscribers on reset', () => {
    const store = createSwitchableStore(() => createArenaStore())
    let calls = 0
    store.subscribe(() => {
      calls += 1
    })
    const before = store.getState()
    store.reset()
    expect(calls).toBe(1)
    expect(store.getState()).not.toBe(before)
    expect(store.getState().hydrated).toBe(false)
  })
})

describe('createEpoch', () => {
  it('invalidates tokens taken before an advance', async () => {
    const { createEpoch } = await import('./roundFollow')
    const epoch = createEpoch()
    const token = epoch.token()
    expect(epoch.isCurrent(token)).toBe(true)
    epoch.advance()
    expect(epoch.isCurrent(token)).toBe(false)
    expect(epoch.isCurrent(epoch.token())).toBe(true)
  })
})
