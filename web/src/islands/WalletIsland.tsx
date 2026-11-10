import { useEffect, useState } from 'react'
import { explorerAddressUrl } from '../chain/explorer'
import { formatNearCompact, shortAddress, yoctoToNumber } from '../chain/format'
import { useStore } from '../chain/store'
import { connectBurner, disconnect, isConnected, requestDrip, walletStore } from '../chain/wallet'
import { config, replayMode } from '../chain/session'
import { BTN_GLASS } from './shared'

const AUTO_BURNER_OFF = 'monster-arena.auto-burner-off'

function wantsAutoBurner(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('demo') && !replayMode && window.sessionStorage.getItem(AUTO_BURNER_OFF) === null
  } catch {
    return false
  }
}

function stopAutoBurner(): void {
  try {
    window.sessionStorage.setItem(AUTO_BURNER_OFF, '1')
  } catch {
    return
  }
}

const MENU_ITEM =
  'px-2.5 py-2 rounded-xl bg-[#fbf3de] hover:bg-white border-2 border-[#e3d1a6] text-xs font-bold text-left text-[#2a4a57] transition disabled:opacity-50'

export function WalletIsland() {
  const wallet = useStore(walletStore)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (walletStore.get().status === 'idle' && wantsAutoBurner()) void connectBurner()
  }, [])

  if (wallet.status === 'connecting') {
    return (
      <button type="button" disabled className={`${BTN_GLASS} opacity-70 cursor-wait`}>
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping"></span>
        Setting up burner...
      </button>
    )
  }

  if (isConnected(wallet) && wallet.accountId !== null) {
    const account = wallet.accountId
    const balance = wallet.balance === null ? '...' : formatNearCompact(yoctoToNumber(wallet.balance))
    return (
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          data-testid="wallet-connected"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="cartoon-btn px-3.5 py-2 flex items-center gap-2 text-sm !rounded-2xl"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-[#42e08a] animate-pulse"></span>
          <span className="font-mono-num font-extrabold text-[#2a4a57]">{shortAddress(account)}</span>
          <span className="font-mono-num text-[#1f7a46]">{balance}</span>
          <span className="text-[9px] uppercase text-[#b45309]">burner</span>
        </button>
        {open ? (
          <div className="cartoon-panel !rounded-2xl p-2 w-60 flex flex-col gap-1.5 absolute right-0 top-full mt-3 z-30">
            <button type="button" className={MENU_ITEM} onClick={() => void navigator.clipboard.writeText(account)}>
              Copy account id
            </button>
            <a className={MENU_ITEM} href={explorerAddressUrl(account)} target="_blank" rel="noopener noreferrer">
              View on explorer
            </a>
            {config.keeperUrl !== null ? (
              <button type="button" className={MENU_ITEM} disabled={wallet.dripping} onClick={() => void requestDrip()}>
                Get test NEAR
              </button>
            ) : null}
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setOpen(false)
                stopAutoBurner()
                disconnect()
              }}
            >
              Disconnect
            </button>
            <div className="text-[10px] text-[#4d6670] px-1">The burner key lives in this browser. Testnet play-money only.</div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="relative">
      <button type="button" data-testid="connect-wallet" onClick={() => setOpen((value) => !value)} aria-expanded={open} className={BTN_GLASS}>
        Connect Wallet
      </button>
      {open ? (
        <div className="cartoon-panel !rounded-2xl p-2 w-60 flex flex-col gap-1.5 absolute right-0 top-full mt-3 z-30">
          <button
            type="button"
            data-testid="use-burner"
            className={MENU_ITEM}
            onClick={() => {
              setOpen(false)
              void connectBurner()
            }}
          >
            Use burner (testnet only)
          </button>
          <div className="text-[10px] text-[#4d6670] px-1">The burner key lives in this browser. Testnet play-money only: do not deposit real funds.</div>
        </div>
      ) : null}
    </div>
  )
}
