import type { FeedRow } from './director'
import { explorerTxUrl } from './explorer'
import { feedSegments } from './feedRow'
import type { FeedSegment } from './feedRow'
import { formatRelativeTime } from './format'
import { monsterIcon, monsterIconImage } from './monsters'

export interface FeedRenderer {
  add(row: FeedRow): void
  addNote(text: string): void
  clear(): void
}

const SEGMENT_BAR: Record<FeedSegment['key'], string> = {
  boost: 'bg-sky-400',
  consolation: 'bg-emerald-400',
  pot: 'bg-amber-400',
  treasury: 'bg-slate-500'
}



function iconNode(monsterType: number): HTMLElement {
  const url = monsterIconImage(monsterType)
  if (url === null) return element('span', '', monsterIcon(monsterType))
  const img = element('img', 'w-5 h-5 shrink-0 object-contain')
  img.src = url
  img.alt = ''
  return img
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function createFeedRenderer(host: HTMLElement, limit = 30): FeedRenderer {
  function buildRow(row: FeedRow): HTMLElement {
    const item = element(
      'div',
      'bg-[#FAF1DC] border-2 border-[#28553D]/30 rounded-xl p-2 flex flex-col gap-1 text-[11px] animate-fade-in shadow-sm text-[#382A20]'
    )
    item.dataset['testid'] = 'feed-row'

    const head = element('div', 'flex items-center justify-between gap-2')
    const names = element('div', 'flex items-center gap-1 font-extrabold text-[#382A20] min-w-0')
    names.append(
      iconNode(row.winner.monsterType),
      element('span', 'truncate uppercase', row.winner.ticker),
      element('span', 'text-[9px] font-bold px-1 py-0.5 bg-[#36C96A]/25 text-[#193827] rounded', 'DEFEATED'),
      iconNode(row.loser.monsterType),
      element('span', 'text-[#5c4738] truncate uppercase', row.loser.ticker)
    )
    const time = element('span', 'text-[9px] font-bold text-[#6e5848] shrink-0', 'Just now')
    time.dataset['feedTs'] = String(row.timestampMs)
    time.textContent = formatRelativeTime(Date.now(), row.timestampMs)
    head.append(names, time)

    const segments = feedSegments(row)
    const bar = element('div', 'h-1.5 rounded-full overflow-hidden flex bg-[#E2E8F0] border border-[#28553D]/30')
    for (const segment of segments) {
      const slice = element('div', SEGMENT_BAR[segment.key])
      slice.style.width = `${segment.percent}%`
      bar.append(slice)
    }

    const legend = element('div', 'text-[9px] font-bold flex flex-wrap gap-x-2 gap-y-0.5 text-[#5c4738]')
    for (const segment of segments) {
      legend.append(element('span', '', `${segment.label} ${segment.amountText}`))
    }

    const foot = element('div', 'flex items-center justify-end')
    const link = element('a', 'text-[9px] font-bold text-[#0284c7] hover:underline select-text', 'View on explorer')
    link.href = explorerTxUrl(row.txHash)
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    foot.append(link)

    item.append(head, bar, legend, foot)
    return item
  }

  return {
    add(row) {
      const empty = host.querySelector('.italic')
      if (empty !== null) host.replaceChildren()
      host.prepend(buildRow(row))
      while (host.children.length > limit) host.lastElementChild?.remove()
    },
    addNote(text) {
      const empty = host.querySelector('.italic')
      if (empty !== null) host.replaceChildren()
      const note = element('div', 'bg-[#FAF1DC] border-2 border-[#36C96A]/60 rounded-xl p-2 text-[11px] font-bold text-[#193827] animate-fade-in shadow-sm', text)
      note.dataset['testid'] = 'feed-row'
      host.prepend(note)
      while (host.children.length > limit) host.lastElementChild?.remove()
    },
    clear() {
      host.replaceChildren()
    }
  }
}
