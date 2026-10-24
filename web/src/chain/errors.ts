const KNOWN: ReadonlyArray<readonly [RegExp, string]> = [
  [/RoundInProgress/i, 'A round is already in progress'],
  [/NoDefaultConfig/i, 'The host has not set a default round config yet'],
  [/ReserveNotFunded/i, 'The arena reserve is not funded yet. Ask the host to fund it.'],
  [/BadImage/i, 'That image cannot be used. Pick a PNG, JPEG or WebP under 5 MB'],
  [/MinOutRequired/i, 'A minimum output is required: try again'],
  [/locked/i, 'Locked: the arena is resolving an epoch'],
  [/user rejected|denied|rejected the request/i, 'Request rejected in the wallet'],
  [/insufficient funds|exceeds the balance/i, 'Not enough MON for this transaction'],
  [/slippage|too little received|minout/i, 'Price moved: try again'],
  [/deadline|expired/i, 'The quote expired: try again']
]

export function describeError(error: unknown): string {
  const candidate = (typeof error === 'object' && error !== null ? error : {}) as { shortMessage?: unknown; message?: unknown }
  const raw =
    typeof candidate.shortMessage === 'string'
      ? candidate.shortMessage
      : typeof candidate.message === 'string'
        ? candidate.message
        : 'Transaction failed'
  for (const [pattern, text] of KNOWN) if (pattern.test(raw)) return text
  return raw.length > 140 ? `${raw.slice(0, 137)}...` : raw
}
