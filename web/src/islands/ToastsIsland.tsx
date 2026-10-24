import { dismissToast, toastStore } from '../chain/toasts'
import type { ToastTone } from '../chain/toasts'
import { explorerTxUrl } from '../chain/explorer'
import { shortAddress } from '../chain/format'
import { useStore } from '../chain/store'

const BORDER: Record<ToastTone, string> = {
  pending: 'border-[#2b7a8e]',
  confirmed: 'border-[#27996f]',
  failed: 'border-[#E95B55]',
  info: 'border-[#ffc233]'
}

const DOT: Record<ToastTone, string> = {
  pending: 'bg-[#2b7a8e] animate-ping',
  confirmed: 'bg-[#43c291]',
  failed: 'bg-rose-400',
  info: 'bg-amber-400'
}

export function ToastsIsland() {
  const toasts = useStore(toastStore)
  return (
    <div className="flex flex-col gap-2 pointer-events-none" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid="toast"
          className={`cartoon-panel !rounded-2xl p-3 pointer-events-auto flex items-start gap-2.5 animate-fade-in ${BORDER[toast.tone]}`}
        >
          <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${DOT[toast.tone]}`} aria-hidden="true"></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold text-[#2a4a57]">{toast.title}</div>
            {toast.detail !== null ? (
              <div className={`text-[10px] ${toast.tone === 'failed' ? 'text-[#be123c]' : 'text-[#4d6670]'}`}>{toast.detail}</div>
            ) : null}
            {toast.txHash !== null ? (
              <div className="text-[10px] text-[#4d6670] flex items-center gap-2">
                <span className="font-mono-num text-[#4d6670] select-text">{shortAddress(toast.txHash)}</span>
                <a
                  className="text-[#075985] hover:text-[#0369a1] underline font-bold"
                  href={explorerTxUrl(toast.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on explorer
                </a>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismissToast(toast.id)}
            className="text-[#4d6670] hover:text-[#2a4a57] p-1 rounded-lg hover:bg-white transition"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
