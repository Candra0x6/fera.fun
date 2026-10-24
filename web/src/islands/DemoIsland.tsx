import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDemoClient, demoEnablement, demoStatusLine, describeDemoError } from '../chain/demo'
import type { DemoAction, DemoStatus } from '../chain/demo'
import { pushToast } from '../chain/toasts'
import { BTN_NEUTRAL, BTN_PRIMARY } from './shared'

const POLL_MS = 3000
const SEED_COUNT = 5
const HIDDEN_KEY = 'monster-arena.demo-hidden'

function readHidden(): boolean {
  try {
    return window.sessionStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeHidden(value: boolean): void {
  try {
    window.sessionStorage.setItem(HIDDEN_KEY, value ? '1' : '0')
  } catch {
    return
  }
}

export function DemoIsland({ baseUrl, token }: { baseUrl: string; token: string }) {
  const client = useMemo(() => createDemoClient({ baseUrl, token, fetch: (url, init) => fetch(url, init) }), [baseUrl, token])
  const [status, setStatus] = useState<DemoStatus | null>(null)
  const [pending, setPending] = useState<DemoAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [launched, setLaunched] = useState<number | null>(null)
  const [hidden, setHidden] = useState<boolean>(readHidden)
  const toggleHidden = useCallback(() => {
    setHidden((value) => {
      writeHidden(!value)
      return !value
    })
  }, [])
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const next = await client.status()
      if (!alive.current) return
      setStatus(next)
      setError(null)
    } catch (failure) {
      if (alive.current) setError(describeDemoError(failure))
    }
  }, [client])

  useEffect(() => {
    alive.current = true
    void refresh()
    const handle = window.setInterval(() => void refresh(), POLL_MS)
    return () => {
      alive.current = false
      window.clearInterval(handle)
    }
  }, [refresh])

  async function run(action: DemoAction): Promise<void> {
    setPending(action)
    setError(null)
    try {
      if (action === 'create') {
        const created = await client.createRound()
        pushToast('confirmed', `Lobby created`, `Round ${created.roundId}`)
        setLaunched(null)
      } else {
        const seeded = await client.seedHouse(SEED_COUNT)
        setLaunched(seeded.launched.length)
        pushToast('confirmed', `Seeded ${seeded.launched.length} animals`)
      }
    } catch (failure) {
      const message = describeDemoError(failure)
      setError(message)
      pushToast('failed', action === 'create' ? 'Create lobby failed' : 'Seed failed', message)
    } finally {
      if (alive.current) setPending(null)
      await refresh()
    }
  }

  const enabled = demoEnablement(status, pending)
  if (hidden) {
    return (
      <button
        type="button"
        onClick={toggleHidden}
        aria-label="Show demo controls"
        title="Show demo controls"
        data-testid="demo-show"
        className="cartoon-panel !rounded-full w-11 h-11 flex items-center justify-center pointer-events-auto text-[#2a4a57]"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
      </button>
    )
  }
  return (
    <div className="cartoon-panel p-3 w-[300px] flex flex-col gap-2 pointer-events-auto text-[#2a4a57]" data-testid="demo-panel">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-wider">Demo controls</div>
        <button type="button" onClick={toggleHidden} aria-label="Hide demo controls" title="Hide demo controls" data-testid="demo-hide" className="w-6 h-6 rounded-full flex items-center justify-center text-[#4d6670] hover:text-[#2a4a57]">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={!enabled.create} onClick={() => void run('create')} data-testid="demo-create">
          {pending === 'create' ? 'Creating...' : 'Create Lobby'}
        </button>
        <button type="button" className={BTN_NEUTRAL} disabled={!enabled.seed} onClick={() => void run('seed')} data-testid="demo-seed">
          {pending === 'seed' ? 'Seeding...' : `Seed ${SEED_COUNT} Animals`}
        </button>
      </div>
      {launched !== null ? <div className="text-[10px] font-bold text-[#17674a]">Launched {launched} animals</div> : null}
      <div className="text-[10px] font-bold text-[#4d6670]" data-testid="demo-status">{demoStatusLine(status, error)}</div>
      {error !== null && status !== null ? (
        <div className="text-[10px] font-bold text-[#b42318]" role="alert" data-testid="demo-error">{error}</div>
      ) : null}
    </div>
  )
}
