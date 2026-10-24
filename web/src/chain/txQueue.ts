export interface TxQueueOptions {
  minGapMs: number
  lowBalanceWei: bigint
  now: () => number
  sleep: (ms: number) => Promise<void>
}

export interface TxQueue {
  run<T>(task: () => Promise<T>, valueWei: bigint, balanceWei: bigint | null): Promise<T>
}

export function createTxQueue(options: TxQueueOptions): TxQueue {
  let tail: Promise<unknown> = Promise.resolve()
  let lastValueTxAt = Number.NEGATIVE_INFINITY
  return {
    run(task, valueWei, balanceWei) {
      const serialise = valueWei > 0n && balanceWei !== null && balanceWei < options.lowBalanceWei
      const step = tail.then(async () => {
        if (serialise) {
          const wait = lastValueTxAt + options.minGapMs - options.now()
          if (wait > 0) await options.sleep(wait)
        }
        try {
          return await task()
        } finally {
          if (valueWei > 0n) lastValueTxAt = options.now()
        }
      })
      tail = step.catch(() => undefined)
      return step
    }
  }
}
