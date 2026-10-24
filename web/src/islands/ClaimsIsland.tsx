import { useEffect, useMemo, useState } from 'react'
import { GAS, arenaAddress, asBigInt, publicClient } from '../chain/contract'
import { addFeedNote, config, replayMode, uiStore, useArenaState } from '../chain/session'
import { arenaAbi, monsterCoinAbi } from '@animal/shared'
import type { CoinView } from '@animal/shared'
import { formatMonCompact } from '../chain/format'
import { useStore } from '../chain/store'
import { isChainOk, runArenaTx, walletStore } from '../chain/wallet'
import { BTN_PRIMARY, weiToNumber } from './shared'

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

export function useClaims(): { claims: Claims; reload: () => void } {
  const state = useArenaState()
  const wallet = useStore(walletStore)
  const [claims, setClaims] = useState<Claims>(EMPTY)
  const [tick, setTick] = useState(0)
  const persisted = state.persisted.coins
  const round = state.persisted.round
  const address = wallet.address
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
    if (address === null || config.arena === null || round === null) {
      setClaims(EMPTY)
      return
    }
    let cancelled = false
    const eliminated = persisted.filter((coin) => coin.status === 'Eliminated')
    const winner = persisted.find((coin) => coin.status === 'Champion')
    const roundId = BigInt(round.roundId)
    const run = async (): Promise<void> => {
      const owedCalls = await publicClient.multicall({
        allowFailure: true,
        contracts: eliminated.map((coin) => ({ address: arenaAddress(), abi: arenaAbi, functionName: 'pendingConsolation', args: [roundId, coin.coinId, address] }))
      })
      const owing = eliminated.flatMap((coin, index) => {
        const result = owedCalls[index]
        const owed = result !== undefined && result.status === 'success' ? asBigInt(result.result) : 0n
        return owed > 0n ? [{ coin, owed }] : []
      })
      const balances = await publicClient.multicall({
        allowFailure: true,
        contracts: owing.map(({ coin }) => ({ address: coin.token as `0x${string}`, abi: monsterCoinAbi, functionName: 'balanceOf', args: [address] }))
      })
      const consolations = owing.map(({ coin, owed }, index) => {
        const result = balances[index]
        return { coin, owed, tokens: result !== undefined && result.status === 'success' ? asBigInt(result.result) : 0n }
      })
      let redeem: Claims['redeem'] = null
      if (round.phase === 'Settled' && winner !== undefined) {
        const [owedRaw, tokensRaw] = await Promise.all([
          publicClient.readContract({ address: arenaAddress(), abi: arenaAbi, functionName: 'pendingRedeem', args: [roundId, address] }),
          publicClient.readContract({ address: winner.token as `0x${string}`, abi: monsterCoinAbi, functionName: 'balanceOf', args: [address] })
        ])
        const owed = asBigInt(owedRaw)
        if (owed > 0n) redeem = { owed, tokens: asBigInt(tokensRaw), winner }
      }
      const seedClaimed = new Set(state.events.filter((event) => event.name === 'SeedClaimed').map((event) => Number(event.args['coinId'])))
      const ended = persisted.filter((coin) => coin.creator.toLowerCase() === address.toLowerCase() && coin.status !== 'Alive' && BigInt(coin.seedMon) > 0n && !seedClaimed.has(coin.coinId))
      const refunded = round.phase === 'Aborted' ? persisted.filter((coin) => coin.status === 'Refunded') : []
      const refundBalances = await publicClient.multicall({
        allowFailure: true,
        contracts: refunded.map((coin) => ({ address: coin.token as `0x${string}`, abi: monsterCoinAbi, functionName: 'balanceOf', args: [address] }))
      })
      const refunds = refunded.flatMap((coin, index) => {
        const result = refundBalances[index]
        const tokens = result !== undefined && result.status === 'success' ? asBigInt(result.result) : 0n
        const supply = BigInt(coin.consolationSupply)
        const owed = supply > 0n ? (tokens * BigInt(coin.consolationPool)) / supply : 0n
        return tokens > 0n ? [{ coin, tokens, owed }] : []
      })
      if (!cancelled) setClaims({ consolations, redeem, seeds: ended, refunds })
    }
    void run().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [signature, address, tick])

  useEffect(() => {
    const handle = window.setInterval(() => setTick((value) => value + 1), 6000)
    return () => window.clearInterval(handle)
  }, [])

  return { claims, reload: () => setTick((value) => value + 1) }
}

function Row(props: { label: string; amount: bigint; testId: string; action: string; disabled: boolean; unit?: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[11px] text-[#2a4a57] truncate">{props.label}</div>
        <div className="text-[10px] font-mono-num text-[#1f7a46]">{props.unit === undefined ? formatMonCompact(weiToNumber(props.amount)) : `${weiToNumber(props.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${props.unit}`}</div>
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
      disabled={busy || redeem.tokens === 0n || !isChainOk(wallet)}
      onClick={() => {
        setBusy(true)
        void runArenaTx({ pending: 'Redeeming', done: 'Redeemed' }, { functionName: 'redeem', args: [BigInt(redeem.winner.roundId), redeem.tokens], gas: GAS.redeem }).then((ok) => {
          if (ok) addFeedNote(`Redeemed ${formatMonCompact(weiToNumber(redeem.owed))} from ${redeem.winner.ticker}`)
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
  const chainOk = isChainOk(wallet)
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
            void runArenaTx({ pending: 'Claiming consolation', done: 'Consolation claimed' }, { functionName: 'claimConsolation', args: [BigInt(claim.coin.roundId), claim.coin.coinId, claim.tokens], gas: GAS.claim }).then((ok) => {
              if (ok) addFeedNote(`Claimed ${formatMonCompact(weiToNumber(claim.owed))} consolation from ${claim.coin.ticker}`)
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
            void runArenaTx({ pending: 'Claiming refund', done: 'Refund claimed' }, { functionName: 'claimRefund', args: [BigInt(refund.coin.roundId), refund.coin.coinId, refund.tokens], gas: GAS.claim }).then((ok) => {
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
            void runArenaTx({ pending: 'Claiming seed', done: 'Seed claimed' }, { functionName: 'claimSeed', args: [BigInt(coin.roundId), coin.coinId], gas: GAS.claim }).then((ok) => {
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
