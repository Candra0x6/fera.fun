import { useEffect, useState } from 'react'
import { explorerAddressUrl } from '../chain/explorer'
import { formatMonCompact, shortAddress } from '../chain/format'
import { useStore } from '../chain/store'
import { connectBurner, connectInjected, disconnect, discoverWallets, isChainOk, requestDrip, switchNetwork, walletStore } from '../chain/wallet'
import { config } from '../chain/session'
import { BTN_GLASS } from './shared'

const MENU_ITEM =
  'px-2.5 py-2 rounded-xl bg-[#fbf3de] hover:bg-white border-2 border-[#e3d1a6] text-xs font-bold text-left text-[#2a4a57] transition disabled:opacity-50'

export function WalletIsland() {
  const wallet = useStore(walletStore)
  const [open, setOpen] = useState(false)
  useEffect(() => discoverWallets(), [])

  if (wallet.status === 'connecting') {
    return (
      <button type="button" disabled className={`${BTN_GLASS} opacity-70 cursor-wait`}>
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping"></span>
        Connecting...
      </button>
    )
  }

  if (wallet.status === 'connected' && wallet.address !== null) {
    const wrongNetwork = !isChainOk(wallet)
    const balance = wallet.balance === null ? '...' : formatMonCompact(Number(wallet.balance / 10n ** 12n) / 1e6)
    return (
      <div className="relative flex items-center gap-2">
        {wrongNetwork ? (
          <button
            type="button"
            onClick={() => void switchNetwork()}
            className="bg-[#FDE2E0] text-[#9f1239] border-[3px] border-[#E95B55] shadow-[0_4px_0_#b94540] text-xs font-extrabold px-3.5 py-2.5 rounded-2xl"
          >
            Switch Network
          </button>
        ) : null}
        <button
          type="button"
          data-testid="wallet-connected"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="cartoon-btn px-3.5 py-2 flex items-center gap-2 text-sm !rounded-2xl"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-[#42e08a] animate-pulse"></span>
          <span className="font-mono-num font-extrabold text-[#2a4a57]">{shortAddress(wallet.address)}</span>
          <span className="font-mono-num text-[#1f7a46]">{balance}</span>
          {wallet.kind === 'burner' ? <span className="text-[9px] uppercase text-[#b45309]">burner</span> : null}
        </button>
        {open ? (
          <div className="cartoon-panel !rounded-2xl p-2 w-60 flex flex-col gap-1.5 absolute right-0 top-full mt-3 z-30">
            <button type="button" className={MENU_ITEM} onClick={() => void navigator.clipboard.writeText(wallet.address ?? '')}>
              Copy address
            </button>
            <a className={MENU_ITEM} href={explorerAddressUrl(wallet.address)} target="_blank" rel="noopener noreferrer">
              View on explorer
            </a>
            {config.keeperUrl !== null ? (
              <button type="button" className={MENU_ITEM} disabled={wallet.dripping} onClick={() => void requestDrip()}>
                Get test MON
              </button>
            ) : null}
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setOpen(false)
                disconnect()
              }}
            >
              Disconnect
            </button>
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
          {wallet.providers.map((provider) => (
            <button
              key={provider.uuid}
              type="button"
              className={`${MENU_ITEM} flex items-center gap-2`}
              onClick={() => {
                setOpen(false)
                void connectInjected(provider)
              }}
            >
              <img src={provider.icon} alt="" className="w-4 h-4 rounded" />
              {provider.name}
            </button>
          ))}
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
          <div className="text-[10px] text-[#4d6670] px-1">Testnet play-money. Do not deposit real funds.</div>
        </div>
      ) : null}
    </div>
  )
}
