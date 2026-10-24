import type { FeedRow } from './director'
import { formatMonPlain } from './format'

export interface FeedSegment {
  key: 'boost' | 'consolation' | 'pot' | 'treasury'
  label: string
  amount: number
  amountText: string
  percent: number
}

export function feedSegments(row: FeedRow): FeedSegment[] {
  const parts: Array<Pick<FeedSegment, 'key' | 'label' | 'amount'>> = [
    { key: 'boost', label: 'Boost', amount: row.boost },
    { key: 'consolation', label: 'Consolation', amount: row.consolation },
    { key: 'pot', label: 'Pot', amount: row.toPot },
    { key: 'treasury', label: 'Treasury', amount: row.toTreasury }
  ]
  const total = parts.reduce((sum, part) => sum + part.amount, 0)
  return parts.map((part) => ({
    ...part,
    amountText: formatMonPlain(part.amount),
    percent: total > 0 ? (part.amount / total) * 100 : 25
  }))
}
