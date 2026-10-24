import { MONSTERS } from '@animal/shared'
import { useEffect, useMemo, useRef } from 'react'
import { useNowSeconds } from '../chain/clock'
import { lockInfo } from '../chain/lockInfo'
import { powerRating } from '../chain/power'
import { useArenaState } from '../chain/session'
import { formatClock, lockdownPhase, seedTimeoutSecondsLeft } from '../chain/timers'
import { pushToast } from '../chain/toasts'
import { weiToMon } from '../chain/format'
import { cfgNumber } from './shared'

export function LockdownIsland() {
  const state = useArenaState()
  const now = useNowSeconds()
  const round = state.optimistic.round
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(state.events.map((event) => event.id))
      return
    }
    for (const event of state.events) {
      if (seen.current.has(event.id)) continue
      seen.current.add(event.id)
      if (event.name === 'EpochCancelled') pushToast('info', 'Arena stabilised', 'The seed did not arrive in time. The epoch will be retried.')
    }
  }, [state.events])

  const info = useMemo(() => lockInfo(state.events), [state.events])
  const ratings = useMemo(() => {
    const alive = state.optimistic.coins.filter((coin) => coin.status === 'Alive')
    const reserves = alive.map((coin) => weiToMon(coin.rMonAtLock))
    const mean = reserves.length === 0 ? 0 : reserves.reduce((sum, value) => sum + value, 0) / reserves.length
    return alive
      .map((coin) => ({
        key: `${coin.roundId}:${coin.coinId}`,
        ticker: coin.ticker,
        rating: powerRating({
          baseStat: MONSTERS.find((monster) => monster.monsterType === coin.monsterType)?.baseStat ?? 10000,
          level: coin.level,
          levelBonusBps: cfgNumber(state, 'levelBonusBps', 400),
          rMonAtLock: weiToMon(coin.rMonAtLock),
          meanRMonAlive: mean,
          gammaBps: cfgNumber(state, 'gammaBps', 8500),
          poolFactorMinBps: cfgNumber(state, 'poolFactorMinBps', 1000),
          poolFactorMaxBps: cfgNumber(state, 'poolFactorMaxBps', 100000)
        })
      }))
      .sort((a, b) => b.rating - a.rating)
  }, [state])

  if (round === null || !round.locked) return null
  const phase = lockdownPhase(true, info?.seedReady ?? false)
  const timeout = cfgNumber(state, 'seedTimeoutSeconds', 60)
  const left = Math.min(timeout, seedTimeoutSecondsLeft(round.lockedAt, timeout, now))
  const status = phase === 'resolving' ? 'Resolving' : 'Waiting for the seed'
  return (
    <div data-testid="lockdown-banner" role="status" className="cartoon-panel px-6 py-3 text-center pointer-events-auto w-[340px]">
      <div className="text-[10px] uppercase tracking-wider text-[#075985] font-extrabold font-mono-num">Epoch {info?.epoch ?? round.epoch + 1}</div>
      <div className="hud-banner-title text-3xl">LOCKDOWN</div>
      <div className="text-xs text-[#4d6670]">
        {status}
        {phase === 'seed-wait' ? <span className="font-mono-num text-[#4d6670]"> • times out in {formatClock(left)}</span> : null}
      </div>
      <div className="text-[10px] text-[#4d6670]">Trading is paused. Pairings are unknown until the seed arrives.</div>
      {ratings.length > 0 ? (
        <ul className="mt-2 max-h-24 overflow-y-auto text-left text-[10px] font-mono-num flex flex-col gap-0.5" aria-label="Public power ratings">
          {ratings.map((entry) => (
            <li key={entry.key} className="flex justify-between text-[#4d6670]">
              <span>{entry.ticker}</span>
              <span className="text-[#b45309]">{entry.rating.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
