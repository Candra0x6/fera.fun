import { useEffect, useState } from 'react'
import { buyCall, sellCall } from '../chain/arenaCalls'
import { asBigInt, balanceOfCoin, readArena } from '../chain/contract'
import { describeError } from '../chain/errors'
import { formatNearCompact, formatTokenUnits, tokensToNumber, yoctoToNumber } from '../chain/format'
import { deadlineMsFrom, minOutWithSlippage, parseNearInput, parseTokenInput } from '../chain/slippage'
import { uiStore, useArenaState } from '../chain/session'
import { useStore } from '../chain/store'
import { isConnected, runArenaTx, walletStore } from '../chain/wallet'
import { BTN_PRIMARY, INPUT, findCoin } from './shared'

type Side = 'buy' | 'sell'

export function TradeIsland() {
  const state = useArenaState()
  const ui = useStore(uiStore)
  const wallet = useStore(walletStore)
  const [side, setSide] = useState<Side>('buy')
  const [amount, setAmount] = useState('0.5')
  const [quote, setQuote] = useState<bigint | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [holding, setHolding] = useState<bigint>(0n)
  const [busy, setBusy] = useState(false)
  const coin = findCoin(state, ui.selectedId)
  const round = state.optimistic.round
  const coinKey = coin === undefined ? null : `${coin.roundId}:${coin.coinId}`
  const parsed = side === 'buy' ? parseNearInput(amount) : parseTokenInput(amount)
  const address = wallet.accountId

  useEffect(() => {
    if (coin === undefined || parsed === null) {
      setQuote(null)
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      const call =
        side === 'buy'
          ? readArena('quote_buy', { round_id: coin.roundId, coin_id: coin.coinId, mon_in: parsed.toString() })
          : readArena('quote_sell', { round_id: coin.roundId, coin_id: coin.coinId, tokens: parsed.toString() })
      call
        .then((value) => {
          if (cancelled) return
          setQuote(asBigInt(value))
          setQuoteError(null)
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setQuote(null)
          setQuoteError(describeError(error))
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [coin?.roundId, coin?.coinId, coin?.rMon, parsed, side])

  useEffect(() => {
    if (coin === undefined || address === null) {
      setHolding(0n)
      return
    }
    let cancelled = false
    balanceOfCoin(coin.roundId, coin.coinId, address)
      .then((value) => {
        if (!cancelled) setHolding(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [coinKey, address, coin?.rMon])

  if (coin === undefined || round === null) return null
  const trading = round.phase === 'Leveling' || round.phase === 'Knockout'
  let blocker: string | null = null
  if (round.phase === 'Settled') blocker = 'The round has ended and trading is closed. Redeem the Chosen One from the claims panel.'
  else if (round.phase === 'Aborted') blocker = 'The round was aborted and trading is closed. Claim your refund from the claims panel.'
  else if (round.phase === 'Lobby') blocker = 'Trading opens when the round starts'
  else if (round.locked) blocker = 'Locked: the arena is resolving an epoch'
  else if (!trading) blocker = 'Trading is closed'
  else if (coin.status !== 'Alive') blocker = 'This coin is out of the arena'
  else if (!isConnected(wallet)) blocker = 'Connect a wallet first'
  else if (parsed === null) blocker = 'Enter an amount'
  else if (side === 'sell' && parsed > holding) blocker = 'More than your balance'
  else if (side === 'buy' && wallet.balance !== null && parsed > wallet.balance) blocker = 'Balance too low'
  else if (quote === null) blocker = quoteError ?? 'Waiting for a quote'

  async function submit(): Promise<void> {
    if (coin === undefined || parsed === null || quote === null || blocker !== null) return
    setBusy(true)
    const minOut = minOutWithSlippage(quote)
    const deadlineMs = deadlineMsFrom(Date.now())
    if (side === 'buy') {
      await runArenaTx(
        { pending: `Buying ${coin.ticker}`, done: `Bought ${coin.ticker}` },
        buyCall({ roundId: coin.roundId, coinId: coin.coinId, deposit: parsed, minTokensOut: minOut, deadlineMs })
      )
    } else {
      await runArenaTx(
        { pending: `Selling ${coin.ticker}`, done: `Sold ${coin.ticker}` },
        sellCall({ roundId: coin.roundId, coinId: coin.coinId, tokens: parsed, minNearOut: minOut, deadlineMs })
      )
    }
    setBusy(false)
  }

  const received = (units: bigint): number => (side === 'buy' ? tokensToNumber(units) : yoctoToNumber(units))
  const isCreator = address !== null && coin.creator === address
  return (
    <div className="cartoon-panel p-3 pointer-events-auto flex flex-col gap-2 text-xs" aria-label={`Trade ${coin.ticker}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono-num font-extrabold text-sm text-[#2a4a57]">{coin.ticker}</span>
        <span className="font-mono-num text-[#1f7a46] text-[11px]">{formatNearCompact(yoctoToNumber(BigInt(coin.rMon)))}</span>
      </div>
      <div className="flex items-center gap-1 bg-[#efe0bd] p-0.5 rounded-xl border-2 border-[#e3d1a6] w-fit" role="tablist">
        {(['buy', 'sell'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={side === value}
            onClick={() => setSide(value)}
            className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono-num uppercase ${side === value ? 'font-extrabold bg-[#ffc233] text-[#4a2c00] border border-[#c77b05]' : 'text-[#4d6670] hover:text-[#2a4a57]'}`}
          >
            {value}
          </button>
        ))}
      </div>
      <label className="text-[10px] uppercase tracking-wider text-[#4d6670]" htmlFor="trade-amount">
        {side === 'buy' ? 'Amount (NEAR)' : `Amount (${coin.ticker})`}
      </label>
      <input id="trade-amount" data-testid="buy-input" inputMode="decimal" className={`${INPUT} font-mono-num text-[#1f7a46]`} value={amount} disabled={busy} onChange={(event) => setAmount(event.target.value)} />
      <div className="flex gap-1" aria-label="Quick amounts">
        {(side === 'sell' ? [25, 50, 75, 100] : []).map((percent) => (
          <button key={percent} type="button" disabled={busy || holding === 0n} onClick={() => setAmount(formatTokenUnits((holding * BigInt(percent)) / 100n))} className="px-2.5 py-0.5 rounded-lg text-[10px] font-mono-num font-extrabold bg-[#fbf3de] hover:bg-white text-[#9a4a05] border-2 border-[#e3d1a6] disabled:opacity-50">
            {percent === 100 ? 'Max' : `${percent}%`}
          </button>
        ))}
        {side === 'buy' ? [0.1, 0.5, 1].map((value) => (
          <button key={value} type="button" disabled={busy} onClick={() => setAmount(String(value))} className="px-2.5 py-0.5 rounded-lg text-[10px] font-mono-num font-extrabold bg-[#fbf3de] hover:bg-white text-[#9a4a05] border-2 border-[#e3d1a6] disabled:opacity-50">
            {value} NEAR
          </button>
        )) : null}
      </div>
      <div className="text-[10px] text-[#4d6670] flex justify-between font-mono-num">
        <span>You receive about {quote === null ? '...' : received(quote).toLocaleString('en-US', { maximumFractionDigits: 4 })} {side === 'buy' ? coin.ticker : 'NEAR'}</span>
        <span>Held {tokensToNumber(holding).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
      </div>
      <div className="text-[10px] text-[#4d6670] font-mono-num">Minimum received {quote === null ? '...' : received(minOutWithSlippage(quote)).toLocaleString('en-US', { maximumFractionDigits: 4 })}</div>
      <div className="text-[10px] text-[#4d6670]">Slippage 5%. Quote valid for 120 seconds.{isCreator ? ' Creator seed tokens are held by the Arena and are not sellable.' : ''}</div>
      {blocker !== null ? <div className="text-[11px] text-[#be123c]" role="status">{blocker}</div> : null}
      <button type="button" data-testid="buy-submit" className={BTN_PRIMARY} disabled={busy || blocker !== null} onClick={() => void submit()}>
        {side === 'buy' ? 'Buy' : 'Sell'} {coin.ticker}
      </button>
    </div>
  )
}
