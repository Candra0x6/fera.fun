import { useState } from 'react'
import { GAS } from '../chain/contract'
import { startLobbyBlocker } from '../chain/stage'
import { useStore } from '../chain/store'
import { isChainOk, runArenaTx, walletStore } from '../chain/wallet'
import { BTN_PRIMARY } from './shared'

export function StartLobbyButton() {
  const wallet = useStore(walletStore)
  const [pending, setPending] = useState(false)
  const blocker = startLobbyBlocker({ connected: wallet.status === 'connected', chainOk: isChainOk(wallet), pending })

  async function start(): Promise<void> {
    if (blocker !== null) return
    setPending(true)
    try {
      await runArenaTx(
        { pending: 'Starting a new lobby', done: 'New lobby started' },
        { functionName: 'createDefaultRound', args: [], valueWei: 0n, gas: GAS.createDefaultRound },
        () => undefined
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1 pointer-events-auto">
      <button type="button" data-testid="start-lobby" disabled={blocker !== null} title={blocker ?? undefined} aria-describedby={blocker === null ? undefined : 'start-lobby-reason'} onClick={() => void start()} className={BTN_PRIMARY}>
        {pending ? 'Starting lobby...' : 'Start New Lobby'}
      </button>
      {blocker !== null && !pending ? <p id="start-lobby-reason" role="status" className="cartoon-panel !rounded-full px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#4d6670]">{blocker}</p> : null}
    </div>
  )
}
