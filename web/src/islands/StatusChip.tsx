import { useSyncExternalStore } from 'react'
import { getStatus, subscribeStatus } from '../chain/status'
import type { StatusKind } from '../chain/status'
import { STRINGS } from '../copy/strings'

const DOT_CLASS: Record<StatusKind, string> = {
  live: 'bg-emerald-400 animate-pulse',
  syncing: 'bg-sky-400 animate-ping',
  lagging: 'bg-amber-400',
  disconnected: 'bg-rose-400',
  replay: 'bg-purple-400',
  sandbox: 'bg-purple-400'
}

const TEXT_CLASS: Partial<Record<StatusKind, string>> = {
  lagging: 'text-[#b45309]',
  disconnected: 'text-[#be123c]'
}

export function StatusChip() {
  const status = useSyncExternalStore(subscribeStatus, getStatus)
  const label = STRINGS.status[status.kind]
  const block = status.blockNumber === null ? null : status.blockNumber.toLocaleString('en-US')
  const lag = status.kind === 'lagging' ? ` ${Math.round(status.lagSeconds)}s` : ''
  return (
    <>
      <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLASS[status.kind]}`} aria-hidden="true"></span>
      <span className={TEXT_CLASS[status.kind]} role="status">
        {label}
        {lag}
        {(status.kind === 'live' || status.kind === 'replay') && block !== null ? (
          <>
            {' • block '}
            <span className="font-mono-num">{block}</span>
          </>
        ) : null}
      </span>
    </>
  )
}
