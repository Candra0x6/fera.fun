export interface RoundFollowerOptions {
  readCurrent: () => Promise<number>
  onRound: (roundId: number, previous: number | null) => void
  intervalMs?: number
  fixedRoundId?: number | null
  schedule?: (callback: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
}

export interface RoundFollower {
  start(): Promise<void>
  noteRoundCreated(roundId: number): void
  current(): number | null
  stop(): void
}

export function createRoundFollower(options: RoundFollowerOptions): RoundFollower {
  const schedule = options.schedule ?? ((callback, ms) => setInterval(callback, ms))
  const cancel = options.cancel ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>))
  let currentRound: number | null = null
  let handle: unknown = null
  let stopped = false

  function adopt(roundId: number): void {
    if (stopped || !Number.isInteger(roundId) || roundId <= 0) return
    if (currentRound !== null && roundId <= currentRound) return
    const previous = currentRound
    currentRound = roundId
    options.onRound(roundId, previous)
  }

  async function poll(): Promise<void> {
    try {
      adopt(await options.readCurrent())
    } catch {
      return
    }
  }

  return {
    async start() {
      if (options.fixedRoundId !== undefined && options.fixedRoundId !== null) {
        adopt(options.fixedRoundId)
        return
      }
      await poll()
      handle = schedule(() => void poll(), options.intervalMs ?? 3000)
    },
    noteRoundCreated: adopt,
    current: () => currentRound,
    stop() {
      stopped = true
      if (handle !== null) cancel(handle)
    }
  }
}

export interface Epoch {
  token(): number
  advance(): void
  isCurrent(token: number): boolean
}

export function createEpoch(): Epoch {
  let value = 0
  return {
    token: () => value,
    advance() {
      value += 1
    },
    isCurrent: (token) => token === value
  }
}
