import { useState } from 'react'
import { createRoundCall } from '../chain/arenaCalls'
import { startLobbyBlocker } from '../chain/stage'
import { useStore } from '../chain/store'
import { isConnected, runArenaTx, walletStore } from '../chain/wallet'
import { BTN_PRIMARY } from './shared'

export function StartLobbyButton() {
  const wallet = useStore(walletStore)
  const [pending, setPending] = useState(false)
  const blocker = startLobbyBlocker({ connected: isConnected(wallet), pending })

  async function start(): Promise<void> {
    if (blocker !== null) return
    setPending(true)
    try {
      await runArenaTx({ pending: 'Starting a new lobby', done: 'New lobby started' }, createRoundCall(), () => undefined)
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
