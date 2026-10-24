import { useNowSeconds } from '../chain/clock'
import { StartLobbyButton } from './StartLobbyButton'
import { canStartLobby, coinCounter, stageForPhase } from '../chain/stage'
import { formatClock, lobbySecondsLeft, nextLockSecondsLeft } from '../chain/timers'
import { useArenaState } from '../chain/session'
import { cfgNumber } from './shared'

const STAGES: ReadonlyArray<{ number: number; label: string }> = [
  { number: 1, label: 'Arena Spawn' },
  { number: 2, label: 'PvE Leveling' },
  { number: 3, label: 'Liquidity Merger' },
  { number: 4, label: 'The Chosen One' }
]

function chipClass(state: 'upcoming' | 'active' | 'done'): string {
  if (state === 'active') return 'bg-gradient-to-b from-[#ffd75e] to-[#f19a0c] text-[#4a2c00] border-2 border-[#c77b05] shadow-[0_2px_0_#a8650a]'
  if (state === 'done') return 'text-[#17674a] border-2 border-[#43c291] bg-[#43c291]/20'
  return 'bg-[#fbf3de] text-[#4d6670] border-2 border-[#e3d1a6]'
}

export function StageIsland() {
  const state = useArenaState()
  const now = useNowSeconds()
  const round = state.optimistic.round
  const stage = round === null ? 0 : stageForPhase(round.phase)
  const maxCoins = cfgNumber(state, 'maxCoins', 30)
  let timerLabel = ''
  let timerValue = ''
  if (round !== null && state.config !== null) {
    if (round.phase === 'Lobby') {
      timerLabel = 'Lobby ends in'
      timerValue = formatClock(lobbySecondsLeft(round.createdAt, cfgNumber(state, 'lobbySeconds', 120), now))
    } else if ((round.phase === 'Leveling' || round.phase === 'Knockout') && !round.locked) {
      timerLabel = `Epoch ${round.epoch + 1} locks in`
      timerValue = formatClock(nextLockSecondsLeft(round.lastEpochResolvedAt, cfgNumber(state, 'epochSeconds', 20), now))
    } else if (round.phase === 'Leveling' || round.phase === 'Knockout') {
      timerLabel = `Epoch ${round.epoch} locked, resolving`
      timerValue = '...'
    } else if (round.phase === 'Settled') {
      timerLabel = 'Round'
      timerValue = 'Settled'
    } else if (round.phase === 'Aborted') {
      timerLabel = 'Round'
      timerValue = 'Aborted'
    }
  }
  const stageLabel = STAGES.find((entry) => entry.number === stage)?.label ?? 'Waiting'
  const roundLabel = round === null ? 'No round' : `Round ${round.roundId}`
  return (
    <div className="flex flex-col items-center gap-2">
    {canStartLobby(round) ? <StartLobbyButton /> : null}
    <div className="cartoon-panel !rounded-2xl px-3 py-1.5 flex xl:hidden items-center gap-2 pointer-events-auto whitespace-nowrap text-[10px] font-extrabold uppercase tracking-wider text-[#2a4a57]" data-testid="stage-compact">
      <span className="px-2 py-0.5 rounded-full bg-[#fbf3de] border-2 border-[#e3d1a6]">{roundLabel}</span>
      <span className="px-2 py-0.5 rounded-full bg-gradient-to-b from-[#ffd75e] to-[#f19a0c] text-[#4a2c00] border-2 border-[#c77b05]">{stageLabel}</span>
      {timerLabel !== '' ? (
        <span>
          {timerLabel} <span className="font-mono-num text-sm">{timerValue}</span>
        </span>
      ) : null}
      <span>
        Coins <span className="font-mono-num text-sm">{coinCounter(round, maxCoins)}</span>
      </span>
    </div>
    <div className="cartoon-panel !rounded-2xl px-3 py-2 hidden xl:flex items-center gap-2 pointer-events-auto whitespace-nowrap" data-testid="stage-rail">
      <div className="px-2 py-0.5 rounded-full bg-[#fbf3de] border-2 border-[#e3d1a6] text-[10px] font-extrabold uppercase tracking-wider text-[#2a4a57]" data-testid="round-label">{roundLabel}</div>
      {STAGES.map((entry, index) => {
        const status = stage === entry.number ? 'active' : stage > entry.number ? 'done' : 'upcoming'
        return (
          <div key={entry.number} className="flex items-center gap-2">
            {index > 0 ? <div className="h-0.5 w-4 bg-[#e3d1a6] rounded-full"></div> : null}
            <div className={`flex items-center gap-1.5 rounded-full pl-1 pr-2 py-0.5 ${chipClass(status)}`} aria-current={status === 'active' ? 'step' : undefined}>
              <span className="w-5 h-5 rounded-full text-[10px] font-mono-num font-extrabold flex items-center justify-center bg-white/70 border border-current">
                {entry.number}
              </span>
              <span className={`text-[10px] font-extrabold uppercase tracking-wider ${status === 'active' ? '' : 'hidden 2xl:inline'}`}>{entry.label}</span>
              {status === 'active' ? <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span> : null}
            </div>
          </div>
        )
      })}
      <div className="h-6 w-0.5 bg-[#e3d1a6] rounded-full mx-1"></div>
      <div className="text-[10px] uppercase tracking-wider text-[#4d6670]">
        {timerLabel === '' ? `Coins ${coinCounter(round, maxCoins)}` : timerLabel}
        {timerValue !== '' ? (
          <span data-testid="lobby-timer" className="ml-1.5 font-mono-num font-bold text-sm text-[#2a4a57]">
            {timerValue}
          </span>
        ) : null}
      </div>
      {timerLabel !== '' ? (
        <div className="text-[10px] uppercase tracking-wider text-[#4d6670]" data-testid="coin-counter">
          Coins <span className="font-mono-num font-bold text-sm text-[#2a4a57]">{coinCounter(round, maxCoins)}</span>
        </div>
      ) : null}
    </div>
    </div>
  )
}
