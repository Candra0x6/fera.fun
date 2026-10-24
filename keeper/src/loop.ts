import { seedArrived } from './port'
import type { ArenaPort, KeeperCall, RoundParams, RoundState, SendResult } from './port'

export interface LoopLogger {
  debug(fields: Record<string, unknown>, message: string): void
  info(fields: Record<string, unknown>, message: string): void
  warn(fields: Record<string, unknown>, message: string): void
  error(fields: Record<string, unknown>, message: string): void
}

export interface LoopOptions {
  port: ArenaPort
  roundId: number
  maxClashes: number
  log: LoopLogger
  sleep: (ms: number) => Promise<void>
  pollMs: number
  retryMs?: number
  alertSeconds?: number
}

export type TickAction =
  | 'wait'
  | 'startRound'
  | 'lockEpoch'
  | 'resolveEpoch'
  | 'cancelEpoch'
  | 'abortRound'
  | 'finished'

export interface TickOutcome {
  action: TickAction
  phase: RoundState['phase']
  sent: SendResult | null
  detail?: string
}

export type LoopResult = 'settled' | 'aborted' | 'stopped'

const ABORT_AFTER_CANCELS = 3

export function knockoutEpochs(coins: number, clashesPerEpoch: number): number {
  let left = coins
  let epochs = 0
  while (left > 1) {
    left -= Math.min(Math.floor(left / 2), clashesPerEpoch)
    epochs += 1
  }
  return epochs
}

export function createKeeperLoop(options: LoopOptions) {
  const { port, roundId, log } = options
  const retryMs = options.retryMs ?? 1000
  const alertSeconds = options.alertSeconds ?? 90
  let params: RoundParams | null = null
  let lockSeen: { epoch: number; lockedAt: number } | null = null
  let underfilledLogged = false
  let treasuryLogged = false

  async function loadParams(): Promise<RoundParams> {
    if (params === null) params = await port.readParams(roundId)
    return params
  }

  async function submit(call: KeeperCall, round: RoundState): Promise<SendResult> {
    const result = await port.send(call)
    if (result.kind === 'skipped') {
      log.debug({ roundId, epoch: round.epoch, fn: call.fn, reason: result.reason }, 'call skipped, a state guard refused it')
    } else if (result.status === 'reverted') {
      log.warn(
        { roundId, epoch: round.epoch, fn: call.fn, txHash: result.hash, gasUsed: result.gasUsed.toString() },
        'transaction reverted, another sender probably got there first'
      )
    } else {
      log.info(
        {
          roundId,
          epoch: round.epoch,
          fn: call.fn,
          txHash: result.hash,
          gasUsed: result.gasUsed.toString(),
          gasLimit: result.gasLimit.toString()
        },
        'transaction mined'
      )
    }
    return result
  }

  function outcome(action: TickAction, round: RoundState, sent: SendResult | null, detail?: string): TickOutcome {
    return detail === undefined ? { action, phase: round.phase, sent } : { action, phase: round.phase, sent, detail }
  }

  async function reportResolved(round: RoundState, sent: SendResult): Promise<void> {
    const after = await port.readRound(roundId)
    if (after.locked) return
    const lockedAt = lockSeen?.lockedAt ?? round.lockedAt
    const resolvedAt = sent.kind === 'mined' && sent.blockTimestamp > 0 ? sent.blockTimestamp : await port.latestTimestamp()
    const seconds = Math.max(0, resolvedAt - lockedAt)
    const fields = { roundId, epoch: round.epoch, secondsLockToResolved: seconds, aliveCount: after.aliveCount }
    if (seconds > alertSeconds) {
      log.error({ ...fields, alert: true, alertSeconds }, 'epoch took longer than the alert threshold')
    } else {
      log.info(fields, 'epoch resolved')
    }
    lockSeen = null
  }

  async function tick(): Promise<TickOutcome> {
    const p = await loadParams()
    const round = await port.readRound(roundId)
    if (round.phase === 'Settled' || round.phase === 'Aborted') return outcome('finished', round, null)
    if (round.phase === 'None') return outcome('wait', round, null, 'round does not exist yet')
    const now = await port.latestTimestamp()

    if (round.phase === 'Lobby') {
      const deadline = round.createdAt + p.lobbySeconds
      const full = round.coinCount >= p.maxCoins
      if (round.coinCount >= p.minCoins && (full || now >= deadline)) {
        const planned = p.levelingEpochs + knockoutEpochs(round.coinCount, p.clashesPerEpoch)
        const needed = (await port.readReserveFloor()) + BigInt(planned) * p.maxEntropyFee
        if (round.treasury < needed) {
          if (!treasuryLogged) {
            treasuryLogged = true
            log.warn(
              { roundId, treasury: round.treasury.toString(), needed: needed.toString(), plannedEpochs: planned },
              'treasury does not cover the planned epochs, fund it with fundTreasury'
            )
          }
          return outcome('wait', round, null, 'treasury too low to start')
        }
        return outcome('startRound', round, await submit({ fn: 'startRound', roundId }, round))
      }
      if (now >= deadline && round.coinCount < p.minCoins) {
        if (!underfilledLogged) {
          underfilledLogged = true
          log.warn({ roundId, coinCount: round.coinCount, minCoins: p.minCoins }, 'lobby deadline passed with too few coins, aborting')
        }
        return outcome('abortRound', round, await submit({ fn: 'abortRound', roundId }, round))
      }
      return outcome('wait', round, null, 'lobby open')
    }

    if (!round.locked) {
      if (round.cancelStreak >= ABORT_AFTER_CANCELS || now >= round.startedAt + p.maxRoundSeconds) {
        return outcome('abortRound', round, await submit({ fn: 'abortRound', roundId }, round))
      }
      const base = round.lastEpochResolvedAt > 0 ? round.lastEpochResolvedAt : round.startedAt
      if (now >= base + p.epochSeconds) {
        return outcome('lockEpoch', round, await submit({ fn: 'lockEpoch', roundId }, round))
      }
      return outcome('wait', round, null, `next lock in ${base + p.epochSeconds - now}s`)
    }

    if (lockSeen === null || lockSeen.lockedAt !== round.lockedAt) {
      lockSeen = { epoch: round.epoch, lockedAt: round.lockedAt }
    }
    if (seedArrived(round)) {
      const sent = await submit({ fn: 'resolveEpoch', roundId, maxClashes: options.maxClashes }, round)
      if (sent.kind === 'mined' && sent.status === 'success') await reportResolved(round, sent)
      return outcome('resolveEpoch', round, sent)
    }
    if (now >= round.lockedAt + p.seedTimeoutSeconds) {
      const fresh = await port.readRound(roundId)
      if (!fresh.locked || seedArrived(fresh)) return outcome('wait', fresh, null, 'seed arrived before the watchdog fired')
      return outcome('cancelEpoch', fresh, await submit({ fn: 'cancelEpoch', roundId }, fresh))
    }
    return outcome('wait', round, null, `waiting for the seed, timeout in ${round.lockedAt + p.seedTimeoutSeconds - now}s`)
  }

  async function run(shouldStop: () => boolean): Promise<LoopResult> {
    let failures = 0
    while (!shouldStop()) {
      try {
        const step = await tick()
        failures = 0
        if (step.action === 'finished') return step.phase === 'Settled' ? 'settled' : 'aborted'
        const acted = step.sent !== null && step.sent.kind === 'mined'
        await options.sleep(acted ? Math.min(100, options.pollMs) : step.sent !== null ? retryMs : options.pollMs)
      } catch (error) {
        failures += 1
        const delay = Math.min(10_000, retryMs * 2 ** Math.min(failures, 4))
        log.warn({ roundId, failures, delayMs: delay, error: error instanceof Error ? error.message : String(error) }, 'keeper tick failed')
        await options.sleep(delay)
      }
    }
    return 'stopped'
  }

  return { tick, run }
}

export type KeeperLoop = ReturnType<typeof createKeeperLoop>
