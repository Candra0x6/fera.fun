export interface DuelQueueOptions<T> {
  limit: number
  start: (item: T, done: () => void) => boolean
}

export interface DuelQueue<T> {
  enqueue: (item: T) => void
  clear: () => T[]
  active: () => number
  pending: () => number
}

export function createDuelQueue<T>(options: DuelQueueOptions<T>): DuelQueue<T> {
  const waiting: T[] = []
  let running = 0
  let pumping = false

  function pump(): void {
    if (pumping) return
    pumping = true
    while (running < options.limit && waiting.length > 0) {
      const item = waiting.shift()
      if (item === undefined) break
      running += 1
      let finished = false
      const started = options.start(item, () => {
        if (finished) return
        finished = true
        running -= 1
        pump()
      })
      if (!started && !finished) {
        finished = true
        running -= 1
        waiting.unshift(item)
        break
      }
    }
    pumping = false
  }

  return {
    enqueue(item) {
      waiting.push(item)
      pump()
    },
    clear() {
      return waiting.splice(0, waiting.length)
    },
    active: () => running,
    pending: () => waiting.length
  }
}
