import { useEffect, useMemo, useState } from 'react'
import { claimConsolationCall, claimRefundCall, claimSeedCall, redeemCall } from '../chain/arenaCalls'
import { asBigInt, balanceOfCoin, readArena } from '../chain/contract'
import { addFeedNote, replayMode, uiStore, useArenaState } from '../chain/session'
import type { CoinView } from '@animal/shared'
import { formatNearCompact, yoctoToNumber } from '../chain/format'
import { useStore } from '../chain/store'
import { isConnected, runArenaTx, walletStore } from '../chain/wallet'
import { BTN_PRIMARY } from './shared'

interface ConsolationClaim {
  coin: CoinView
  owed: bigint
  tokens: bigint
}

interface Claims {
  consolations: ConsolationClaim[]
  redeem: { owed: bigint; tokens: bigint; winner: CoinView } | null
  seeds: CoinView[]
  refunds: Array<{ coin: CoinView; tokens: bigint; owed: bigint }>
}

const EMPTY: Claims = { consolations: [], redeem: null, seeds: [], refunds: [] }

async function settled<T>(task: Promise<T>): Promise<T | null> {
  return task.catch(() => null)
}

export function useClaims(): { claims: Claims; reload: () => void } {
  const state = useArenaState()
  const wallet = useStore(walletStore)
  const [claims, setClaims] = useState<Claims>(EMPTY)
  const [tick, setTick] = useState(0)
  const persisted = state.persisted.coins
  const round = state.persisted.round
  const address = wallet.accountId
  const seedClaims = state.events.filter((event) => event.name === 'SeedClaimed').length
  const signature = useMemo(() => persisted.map((coin) => `${coin.coinId}:${coin.status}`).join(',') + `|${round?.phase ?? ''}`, [persisted, round?.phase])

  useEffect(() => {
    if (replayMode) {
      const claimEvent = state.events.find((event) => event.name === 'ConsolationClaimed')
      const claimCoin = persisted.find((coin) => claimEvent !== undefined && coin.coinId === Number(claimEvent.args['coinId']) && coin.status === 'Eliminated')
      const champion = persisted.find((coin) => coin.status === 'Champion')
      const settled = round !== null && round.phase === 'Settled' && champion !== undefined
      setClaims({
        consolations:
          address !== null && claimEvent !== undefined && claimCoin !== undefined
            ? [{ coin: claimCoin, owed: BigInt(String(claimEvent.args['monPaid'])), tokens: BigInt(String(claimEvent.args['tokens'])) }]
            : [],
        redeem: address !== null && settled && round !== null ? { owed: BigInt(round.redeemPool) / 10n, tokens: BigInt(round.redeemSupply) / 10n, winner: champion } : null,
        seeds: [],
        refunds: []
      })
      return
    }
    if (address === null || round === null) {
      setClaims(EMPTY)
      return
    }
    let cancelled = false
    const eliminated = persisted.filter((coin) => coin.status === 'Eliminated')
    const winner = persisted.find((coin) => coin.status === 'Champion')
    const roundId = round.roundId
    const run = async (): Promise<void> => {
      const owedResults = await Promise.all(
        eliminated.map((coin) =>
          settled(readArena('pending_consolation', { round_id: roundId, coin_id: coin.coinId, account_id: address }).then(asBigInt))
        )
      )
      const owing = eliminated.flatMap((coin, index) => {
        const owed = owedResults[index] ?? 0n
        return owed > 0n ? [{ coin, owed }] : []
      })
      const consolations = await Promise.all(
        owing.map(async ({ coin, owed }) => ({ coin, owed, tokens: (await settled(balanceOfCoin(roundId, coin.coinId, address))) ?? 0n }))
      )
      let redeem: Claims['redeem'] = null
      if (round.phase === 'Settled' && winner !== undefined) {
        const [owedRaw, tokensRaw] = await Promise.all([
          settled(readArena('pending_redeem', { round_id: roundId, account_id: address }).then(asBigInt)),
          settled(balanceOfCoin(roundId, winner.coinId, address))
        ])
        const owed = owedRaw ?? 0n
        if (owed > 0n) redeem = { owed, tokens: tokensRaw ?? 0n, winner }
      }
      const seedClaimed = new Set(state.events.filter((event) => event.name === 'SeedClaimed').map((event) => Number(event.args['coinId'])))
      const ended = persisted.filter((coin) => coin.creator === address && coin.status !== 'Alive' && BigInt(coin.seedMon) > 0n && !seedClaimed.has(coin.coinId))
      const refunded = round.phase === 'Aborted' ? persisted.filter((coin) => coin.status === 'Refunded') : []
      const refunds = (
        await Promise.all(
          refunded.map(async (coin) => {
            const tokens = (await settled(balanceOfCoin(roundId, coin.coinId, address))) ?? 0n
            const supply = BigInt(coin.consolationSupply)
            const owed = supply > 0n ? (tokens * BigInt(coin.consolationPool)) / supply : 0n
            return tokens > 0n ? [{ coin, tokens, owed }] : []
          })
        )
      ).flat()
      if (!cancelled) setClaims({ consolations, redeem, seeds: ended, refunds })
    }
    void run().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [signature, address, tick, seedClaims])

  useEffect(() => {
    const handle = window.setInterval(() => setTick((value) => value + 1), 6000)
    return () => window.clearInterval(handle)
  }, [])

  return { claims, reload: () => setTick((value) => value + 1) }
}

function Row(props: { label: string; amount: bigint; testId: string; action: string; disabled: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[11px] text-[#2a4a57] truncate">{props.label}</div>
        <div className="text-[10px] font-mono-num text-[#1f7a46]">{formatNearCompact(yoctoToNumber(props.amount))}</div>
      </div>
      <button type="button" data-testid={props.testId} className={`${BTN_PRIMARY} !px-3 !py-1.5`} disabled={props.disabled} onClick={props.onClick}>
        {props.action}
      </button>
    </div>
  )
}

export function RedeemRow(props: { redeem: NonNullable<Claims['redeem']>; reload: () => void }) {
  const [busy, setBusy] = useState(false)
  const wallet = useStore(walletStore)
  const { redeem } = props
  return (
    <Row
      label={`Redeem ${redeem.winner.ticker}`}
      amount={redeem.owed}
      testId="redeem-button"
      action="Redeem"
      disabled={busy || redeem.tokens === 0n || !isConnected(wallet)}
      onClick={() => {
        setBusy(true)
        void runArenaTx({ pending: 'Redeeming', done: 'Redeemed' }, redeemCall({ roundId: redeem.winner.roundId, tokens: redeem.tokens })).then((ok) => {
          if (ok) addFeedNote(`Redeemed ${formatNearCompact(yoctoToNumber(redeem.owed))} from ${redeem.winner.ticker}`)
          setBusy(false)
          props.reload()
        })
      }}
    />
  )
}

export function ClaimsIsland() {
  const ui = useStore(uiStore)
  const wallet = useStore(walletStore)
  const { claims, reload } = useClaims()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const showRedeem = claims.redeem !== null && (ui.championClosed || !ui.finaleDone)
  const nothing = claims.consolations.length === 0 && claims.seeds.length === 0 && claims.refunds.length === 0 && !showRedeem
  if (nothing) return null
  const chainOk = isConnected(wallet)
  return (
    <div className="cartoon-panel p-3 pointer-events-auto flex flex-col gap-2" aria-label="Claims">
      <div className="hud-title !text-sm">Claims</div>
      {claims.consolations.map((claim) => (
        <Row
          key={`c-${claim.coin.coinId}`}
          label={`Claim consolation: ${claim.coin.ticker}`}
          amount={claim.owed}
          testId="claim-consolation"
          action="Claim consolation"
          disabled={busyKey !== null || claim.tokens === 0n || !chainOk}
          onClick={() => {
            setBusyKey(`c-${claim.coin.coinId}`)
            void runArenaTx({ pending: 'Claiming consolation', done: 'Consolation claimed' }, claimConsolationCall({ roundId: claim.coin.roundId, coinId: claim.coin.coinId, tokens: claim.tokens })).then((ok) => {
              if (ok) addFeedNote(`Claimed ${formatNearCompact(yoctoToNumber(claim.owed))} consolation from ${claim.coin.ticker}`)
              setBusyKey(null)
              reload()
            })
          }}
        />
      ))}
      {claims.refunds.map((refund) => (
        <Row
          key={`r-${refund.coin.coinId}`}
          label={`Claim refund: ${refund.coin.ticker}`}
          amount={refund.owed}
          testId="claim-refund"
          action="Claim refund"
          disabled={busyKey !== null || !chainOk}
          onClick={() => {
            setBusyKey(`r-${refund.coin.coinId}`)
            void runArenaTx({ pending: 'Claiming refund', done: 'Refund claimed' }, claimRefundCall({ roundId: refund.coin.roundId, coinId: refund.coin.coinId, tokens: refund.tokens })).then((ok) => {
              if (ok) addFeedNote(`Claimed the refund for ${refund.coin.ticker}`)
              setBusyKey(null)
              reload()
            })
          }}
        />
      ))}
      {claims.seeds.map((coin) => (
        <Row
          key={`s-${coin.coinId}`}
          label={`Claim seed: ${coin.ticker}`}
          amount={BigInt(coin.seedMon)}
          testId="claim-seed"
          action="Claim seed"
          disabled={busyKey !== null || !chainOk}
          onClick={() => {
            setBusyKey(`s-${coin.coinId}`)
            void runArenaTx({ pending: 'Claiming seed', done: 'Seed claimed' }, claimSeedCall({ roundId: coin.roundId, coinId: coin.coinId })).then((ok) => {
              if (ok) addFeedNote(`Claimed the seed of ${coin.ticker}`)
              setBusyKey(null)
              reload()
            })
          }}
        />
      ))}
      {showRedeem && claims.redeem !== null ? <RedeemRow redeem={claims.redeem} reload={reload} /> : null}
    </div>
  )
}
