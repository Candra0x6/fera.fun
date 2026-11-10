import { MONSTERS, SKINS } from '@animal/shared'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { launchCoinCall } from '../chain/arenaCalls'
import { yoctoToNumber } from '../chain/format'
import { launchBlocker, sanitizeTickerInput } from '../chain/launchRules'
import { launchDisabledReason, launchEnabled } from '../chain/stage'
import { parseNearInput } from '../chain/slippage'
import { useArenaState } from '../chain/session'
import { useStore } from '../chain/store'
import { isConnected, runArenaTx, walletStore } from '../chain/wallet'
import { trapTab } from '../arena/launchInfo'
import { LaunchPreviewPane, MonsterPicker, SkinPicker } from './LaunchPicker'
import { BTN_NEUTRAL, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, cfgNumber, cfgYocto } from './shared'

type Step = 'idle' | 'wallet' | 'launching' | 'done'

export function LaunchIsland() {
  const state = useArenaState()
  const wallet = useStore(walletStore)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('Solar Flare Dragon')
  const [ticker, setTicker] = useState('SOLAR')
  const [monsterType, setMonsterType] = useState(0)
  const [skinId, setSkinId] = useState(0)
  const [seed, setSeed] = useState('0.1')
  const [step, setStep] = useState<Step>('idle')

  const round = state.optimistic.round
  const maxCoins = cfgNumber(state, 'maxCoins', 6)
  const launchFee = cfgYocto(state, 'launchFee', 10n ** 23n)
  const minSeed = cfgYocto(state, 'minSeed', 10n ** 23n)
  const maxSeed = cfgYocto(state, 'maxSeed', 10n ** 23n)
  const mine = state.optimistic.coins.filter((coin) => wallet.accountId !== null && coin.creator === wallet.accountId).length
  const blocker = launchBlocker({
    name,
    ticker,
    seedNear: seed,
    minSeedNear: yoctoToNumber(minSeed),
    maxSeedNear: yoctoToNumber(maxSeed),
    phase: round?.phase ?? 'None',
    coinCount: round?.coinCount ?? 0,
    maxCoins,
    launchedByMe: mine,
    connected: isConnected(wallet),
    balanceNear: wallet.balance === null ? null : yoctoToNumber(wallet.balance),
    launchFeeNear: yoctoToNumber(launchFee)
  })
  const selectedMonster = MONSTERS.find((monster) => monster.monsterType === monsterType)
  const selectedSkin = SKINS.find((skin) => skin.skinId === skinId)
  const overlayRef = useRef<HTMLDivElement>(null)
  const busy = step === 'wallet' || step === 'launching'

  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    overlayRef.current?.querySelector<HTMLElement>('#launch-name')?.focus()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [open])

  async function submit(): Promise<void> {
    const seedYocto = parseNearInput(seed)
    if (seedYocto === null || blocker !== null || round === null) return
    const ok = await runArenaTx(
      { pending: `Launching ${ticker}`, done: 'Coin launched' },
      launchCoinCall({ roundId: round.roundId, name: name.trim(), ticker, monsterType, skinId, deposit: launchFee + seedYocto }),
      (next) => setStep(next === 'wallet' ? 'wallet' : next === 'sent' ? 'launching' : next === 'done' ? 'done' : 'idle')
    )
    if (ok) setOpen(false)
    setStep('idle')
  }

  return (
    <>
      <button
        type="button"
        data-testid="launch-open"
        disabled={!launchEnabled(round)}
        title={launchEnabled(round) ? undefined : launchDisabledReason(round)}
        onClick={() => setOpen(true)}
        className={BTN_SECONDARY}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span>Launch Coin</span>
      </button>
      {open ? createPortal(
        <div ref={overlayRef} className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Launch a coin" onKeyDown={(event) => { if (event.key === 'Escape' && !busy) setOpen(false); else if (overlayRef.current !== null) trapTab(event, overlayRef.current) }}>
          <div className="cartoon-panel launch-panel w-full">
            <div className="modal-head">
              <div>
                <h3>Launch Coin</h3>
                <p>Choose how your coin looks in the arena</p>
              </div>
              <button type="button" aria-label="Close launch dialog" disabled={busy} onClick={() => setOpen(false)} className="text-white/80 hover:text-white p-1">✕</button>
            </div>
            <form
              className="launch-body launch-grid text-xs"
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              {selectedMonster !== undefined && selectedSkin !== undefined ? <LaunchPreviewPane monster={selectedMonster} skin={selectedSkin} /> : null}
              <div className="launch-right">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className={LABEL} htmlFor="launch-name">Name</label>
                    <input id="launch-name" className={INPUT} maxLength={28} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="launch-ticker">Ticker</label>
                    <input id="launch-ticker" className={`${INPUT} font-mono-num font-bold uppercase text-[#b45309]`} maxLength={7} value={ticker} disabled={busy} onChange={(event) => setTicker(sanitizeTickerInput(event.target.value))} />
                  </div>
                </div>
                <MonsterPicker items={MONSTERS} value={monsterType} disabled={busy} onChange={setMonsterType} />
                <SkinPicker items={SKINS} value={skinId} disabled={busy} onChange={setSkinId} />
                <div>
                  <label className={LABEL} htmlFor="launch-seed">Seed (NEAR)</label>
                  <input id="launch-seed" inputMode="decimal" className={`${INPUT} font-mono-num text-[#1f7a46]`} value={seed} disabled={busy} onChange={(event) => setSeed(event.target.value)} />
                  <div className="mt-1 text-[10px] text-[#4d6670] flex justify-between">
                    <span>Launch fee <span className="font-mono-num text-[#4d6670]">{yoctoToNumber(launchFee)} NEAR</span></span>
                    <span>Seed {yoctoToNumber(minSeed)} to {yoctoToNumber(maxSeed)} NEAR</span>
                  </div>
                </div>
                <ol className="flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-wider" aria-label="Launch steps">
                  {([['wallet', 'Signing'], ['launching', 'Launching'], ['done', 'Done']] as const).map(([key, label]) => (
                    <li key={key} className={`px-2.5 py-0.5 rounded-full border-2 ${step === key ? 'bg-[#BFE8F7] text-[#075985] border-[#2b7a8e] font-extrabold' : 'text-[#4d6670] border-[#e3d1a6]'}`}>{label}</li>
                  ))}
                </ol>
                {blocker !== null ? <p className="text-[11px] text-[#be123c]" role="status">{blocker}</p> : null}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button type="button" className={BTN_NEUTRAL} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
                  <button type="submit" data-testid="launch-submit" className={BTN_PRIMARY} disabled={busy || blocker !== null}>Launch in the Arena</button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  )
}
