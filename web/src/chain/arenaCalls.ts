import type { ArenaCall } from './nearSigner'

export interface RoundCoinRef {
  roundId: number
  coinId: number
}

export function createRoundCall(): ArenaCall {
  return { method: 'create_round', args: {} }
}

export function launchCoinCall(input: {
  roundId: number
  name: string
  ticker: string
  monsterType: number
  skinId: number
  deposit: bigint
}): ArenaCall {
  return {
    method: 'launch_coin',
    args: { round_id: input.roundId, name: input.name, ticker: input.ticker, monster_type: input.monsterType, skin_id: input.skinId },
    deposit: input.deposit
  }
}

export function buyCall(input: RoundCoinRef & { deposit: bigint; minTokensOut: bigint; deadlineMs: number }): ArenaCall {
  return {
    method: 'buy',
    args: { round_id: input.roundId, coin_id: input.coinId, min_tokens_out: input.minTokensOut.toString(), deadline_ms: input.deadlineMs },
    deposit: input.deposit
  }
}

export function sellCall(input: RoundCoinRef & { tokens: bigint; minNearOut: bigint; deadlineMs: number }): ArenaCall {
  return {
    method: 'sell',
    args: {
      round_id: input.roundId,
      coin_id: input.coinId,
      tokens: input.tokens.toString(),
      min_mon_out: input.minNearOut.toString(),
      deadline_ms: input.deadlineMs
    }
  }
}

export function redeemCall(input: { roundId: number; tokens: bigint }): ArenaCall {
  return { method: 'redeem', args: { round_id: input.roundId, tokens: input.tokens.toString() } }
}

export function claimConsolationCall(input: RoundCoinRef & { tokens: bigint }): ArenaCall {
  return { method: 'claim_consolation', args: { round_id: input.roundId, coin_id: input.coinId, tokens: input.tokens.toString() } }
}

export function claimRefundCall(input: RoundCoinRef & { tokens: bigint }): ArenaCall {
  return { method: 'claim_refund', args: { round_id: input.roundId, coin_id: input.coinId, tokens: input.tokens.toString() } }
}

export function claimSeedCall(input: RoundCoinRef): ArenaCall {
  return { method: 'claim_seed', args: { round_id: input.roundId, coin_id: input.coinId } }
}
