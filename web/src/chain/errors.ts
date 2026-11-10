const ARENA_MESSAGES: Readonly<Record<string, string>> = {
  UnknownRound: 'That round does not exist',
  RoundInProgress: 'A round is already in progress',
  WrongPhase: 'This action is not available in the current phase',
  RoundFull: 'The arena is full',
  BadCatalogId: 'Pick a valid monster and skin',
  BadName: 'Name must be 1 to 28 characters',
  BadTicker: 'Ticker must be 2 to 7 letters or digits',
  CreatorCapReached: 'Limit of 2 coins per account',
  BadSeed: 'The seed is outside the allowed range',
  Expired: 'The quote expired: try again',
  MinOutRequired: 'A minimum output is required: try again',
  Locked: 'Locked: the arena is resolving an epoch',
  NotLocked: 'The arena is not locked yet',
  CoinNotAlive: 'This coin is out of the arena',
  ZeroOut: 'That amount is too small to trade',
  Slippage: 'Price moved: try again',
  Insolvent: 'The arena cannot pay that out right now',
  LobbyNotReady: 'The lobby is not ready to start',
  EpochTooEarly: 'The next epoch is not due yet',
  AbortNotOpen: 'The round cannot be aborted yet',
  NotClaimable: 'Nothing is claimable for this coin yet',
  NotCreator: 'Only the coin creator can claim the seed',
  NothingToClaim: 'Nothing to claim',
  SeedAlreadyClaimed: 'The seed was already claimed',
  NotRefundable: 'This coin is not refundable',
  PayFailed: 'The payout could not be sent: use Claim pending',
  SeedBlockNotReached: 'The epoch seed block has not arrived yet',
  StorageFloorBreached: 'The arena cannot take that deposit right now',
  BadDeposit: 'The attached NEAR amount is not valid for this action',
  InsufficientBalance: 'More than your balance'
}

const KNOWN: ReadonlyArray<readonly [RegExp, string]> = [
  [/does not have enough balance|NotEnoughBalance|LackBalanceForState/i, 'Not enough NEAR for this transaction'],
  [/AccessKeyDoesNotExist|AccessKeyNotFound|does not exist while viewing|UNKNOWN_ACCOUNT/i, 'The burner account is not ready yet: try again in a moment'],
  [/Exceeded \d+ providers|failed to fetch|NetworkError/i, 'The NEAR network is busy: try again'],
  [/Timeout|timed out/i, 'The network took too long: try again'],
  [/locked/i, 'Locked: the arena is resolving an epoch'],
  [/slippage|too little received|minout/i, 'Price moved: try again'],
  [/deadline|expired/i, 'The quote expired: try again']
]

const ARENA_ERROR = /ArenaError:([A-Za-z]+)/

export function describeError(error: unknown): string {
  const candidate = (typeof error === 'object' && error !== null ? error : {}) as { shortMessage?: unknown; message?: unknown }
  const raw =
    typeof candidate.shortMessage === 'string'
      ? candidate.shortMessage
      : typeof candidate.message === 'string'
        ? candidate.message
        : 'Transaction failed'
  const arena = ARENA_ERROR.exec(raw)
  if (arena !== null) {
    const name = arena[1] ?? ''
    return ARENA_MESSAGES[name] ?? `Arena error: ${name}`
  }
  for (const [pattern, text] of KNOWN) if (pattern.test(raw)) return text
  return raw.length > 140 ? `${raw.slice(0, 137)}...` : raw
}
