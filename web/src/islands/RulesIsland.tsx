import { useEffect, useState } from 'react'
import { useArenaState } from '../chain/session'
import { cfgNumber } from './shared'

export function RulesIsland() {
  const state = useArenaState()
  const [open, setOpen] = useState(false)
  const locked = state.optimistic.round?.locked === true
  useEffect(() => {
    if (locked) setOpen(false)
  }, [locked])
  const percent = (key: string, fallback: number): string => `${cfgNumber(state, key, fallback) / 100}%`
  return (
    <div className="relative pointer-events-none">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'Hide rules' : 'Show rules'}
        title={open ? 'Hide rules' : 'Rules'}
        data-testid="rules-toggle"
        className="pointer-events-auto cartoon-panel !rounded-full !border-2 !shadow-[0_3px_0_#c9b684,0_8px_14px_rgba(15,60,90,0.22)] w-10 h-10 flex items-center justify-center text-[#4d6670] hover:text-[#2a4a57] transition"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.8" r="0.6" fill="currentColor" /></>}
        </svg>
      </button>
      {open ? (
        <div data-testid="rules-card" className="pointer-events-auto cartoon-panel p-4 w-[340px] absolute left-0 top-full mt-2 z-30 text-[11px] text-[#4d6670] flex flex-col gap-2">
          <div className="hud-title">How a round works</div>
          <p className="font-bold text-[#9a4a05]">Testnet play-money. House coins are labelled.</p>
          <p>Launch a coin in the lobby. Each epoch the arena locks, draws one seed, then pairs coins into clashes and runs hunts.</p>
          <p>
            A clash merges the loser into the winner. Its reserve splits{' '}
            <span className="font-mono-num text-[#0369a1]">{percent('boostBps', 5000)}</span> boost,{' '}
            <span className="font-mono-num text-[#1f7a46]">{percent('consolationBps', 3000)}</span> consolation to the loser&apos;s holders,{' '}
            <span className="font-mono-num text-[#b45309]">{percent('potBps', 1500)}</span> prize pot and{' '}
            <span className="font-mono-num text-[#4d6670]">{percent('treasuryBps', 500)}</span> treasury.
          </p>
          <p>The last coin standing is the Chosen One and holders redeem at (reserve + pot) / supply.</p>
          <p className="text-[#4d6670]">Timers use the demo preset. Outcomes come from the chain; the 3D view only replays them.</p>
        </div>
      ) : null}
    </div>
  )
}
