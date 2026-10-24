import { useEffect, useRef } from 'react'
import { CoinAvatar } from './CoinAvatar'
import { weiToMon } from '../chain/format'
import { explorerAddressUrl } from '../chain/explorer'
import { shortAddress } from '../chain/format'
import { uiStore, useArenaState } from '../chain/session'
import { useStore } from '../chain/store'
import { BTN_NEUTRAL } from './shared'
import { RedeemRow, useClaims } from './ClaimsIsland'

export function ChampionIsland() {
  const state = useArenaState()
  const ui = useStore(uiStore)
  const { claims, reload } = useClaims()
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const round = state.optimistic.round
  const open = round !== null && round.phase === 'Settled' && ui.finaleDone && !ui.championClosed
  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])
  if (!open || round === null) return null
  const winner = state.optimistic.coins.find((coin) => coin.status === 'Champion') ?? state.optimistic.coins.find((coin) => coin.coinId === round.winnerCoinId)
  const pool = BigInt(round.redeemPool)
  const supply = BigInt(round.redeemSupply)
  const ratePerMillion = supply > 0n ? weiToMon(((pool * 10n ** 24n) / supply).toString()) : 0
  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-auto" role="dialog" aria-modal="true" aria-label="The Chosen One" data-testid="chosen-one-screen" onKeyDown={(event) => { if (event.key === 'Escape') uiStore.set((previous) => ({ ...previous, championClosed: true })) }}>
      <div className="cartoon-panel max-w-lg w-full p-6 text-center flex flex-col gap-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-b from-[#ffcd47] to-[#f29b0c] flex items-center justify-center border-[3px] border-[#d78208] shadow-[0_5px_0_#a8650a]">
          <svg className="w-9 h-9 text-[#4a2c00]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
          </svg>
        </div>
        <div className="text-[10px] uppercase tracking-wider text-[#075985] font-extrabold font-mono-num">STAGE 4</div>
        <h2 className="hud-banner-title text-4xl">THE CHOSEN ONE</h2>
        {winner !== undefined ? (
          <div>
            <div className="font-mono-num font-extrabold text-3xl text-[#2a4a57]">
              <CoinAvatar imageUri={winner.imageUri} monsterType={winner.monsterType} label={winner.ticker} className="inline-block w-10 h-10 align-middle mr-2" />
              {winner.ticker}
            </div>
            <div className="text-xs text-[#4d6670]">{winner.name}</div>
          </div>
        ) : null}
        <div className="hud-well grid grid-cols-2 gap-1.5 text-[11px] p-3 text-left">
          <div>
            <span className="text-[#4d6670] block text-[10px]">Redeem rate</span>
            <span data-testid="redeem-rate" className="font-mono-num text-[#1f7a46] font-semibold">1M {winner?.ticker ?? 'tokens'} = {ratePerMillion.toFixed(4)} MON</span>
          </div>
          <div>
            <span className="text-[#4d6670] block text-[10px]">Final pool</span>
            <span className="font-mono-num text-[#1f7a46] font-semibold">{weiToMon(round.redeemPool).toLocaleString('en-US', { maximumFractionDigits: 2 })} MON</span>
          </div>
          <div>
            <span className="text-[#4d6670] block text-[10px]">Clashes played</span>
            <span className="font-mono-num text-[#7e22ce] font-semibold">{round.clashesPlayed}</span>
          </div>
          <div>
            <span className="text-[#4d6670] block text-[10px]">Wins</span>
            <span className="font-mono-num text-[#b45309] font-semibold">{winner?.wins ?? 0}</span>
          </div>
          {winner !== undefined ? (
            <div className="col-span-2 pt-1 border-t border-[#e3d1a6] flex items-center justify-between">
              <span className="text-[#4d6670] text-[10px]">Token Address</span>
              <a className="font-mono-num text-[10px] text-[#0369a1] select-text" href={explorerAddressUrl(winner.token)} target="_blank" rel="noopener noreferrer">{shortAddress(winner.token)}</a>
            </div>
          ) : null}
        </div>
        {claims.redeem !== null ? <RedeemRow redeem={claims.redeem} reload={reload} /> : null}
        <div className="flex justify-center">
          <button ref={closeRef} type="button" className={BTN_NEUTRAL} onClick={() => uiStore.set((previous) => ({ ...previous, championClosed: true }))}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
