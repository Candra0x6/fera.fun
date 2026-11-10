import { describe, expect, it } from 'vitest'
import { buyCall, claimConsolationCall, claimRefundCall, claimSeedCall, createRoundCall, launchCoinCall, redeemCall, sellCall } from './arenaCalls'

describe('arena call builders', () => {
  it('creates a round without a deposit', () => {
    expect(createRoundCall()).toEqual({ method: 'create_round', args: {} })
  })

  it('launches a coin with snake_case arguments and the deposit attached', () => {
    expect(launchCoinCall({ roundId: 3, name: 'Solar', ticker: 'SOLAR', monsterType: 2, skinId: 1, deposit: 200n })).toEqual({
      method: 'launch_coin',
      args: { round_id: 3, name: 'Solar', ticker: 'SOLAR', monster_type: 2, skin_id: 1 },
      deposit: 200n
    })
  })

  it('sends u128 amounts as decimal strings and the deadline as a number', () => {
    expect(buyCall({ roundId: 3, coinId: 1, deposit: 5n, minTokensOut: 4n, deadlineMs: 1_700_000_000_000 })).toEqual({
      method: 'buy',
      args: { round_id: 3, coin_id: 1, min_tokens_out: '4', deadline_ms: 1_700_000_000_000 },
      deposit: 5n
    })
    expect(sellCall({ roundId: 3, coinId: 1, tokens: 9n, minNearOut: 8n, deadlineMs: 7 })).toEqual({
      method: 'sell',
      args: { round_id: 3, coin_id: 1, tokens: '9', min_mon_out: '8', deadline_ms: 7 }
    })
  })

  it('builds the claim calls', () => {
    expect(redeemCall({ roundId: 3, tokens: 10n })).toEqual({ method: 'redeem', args: { round_id: 3, tokens: '10' } })
    expect(claimConsolationCall({ roundId: 3, coinId: 2, tokens: 10n }).args).toEqual({ round_id: 3, coin_id: 2, tokens: '10' })
    expect(claimRefundCall({ roundId: 3, coinId: 2, tokens: 10n }).method).toBe('claim_refund')
    expect(claimSeedCall({ roundId: 3, coinId: 2 })).toEqual({ method: 'claim_seed', args: { round_id: 3, coin_id: 2 } })
  })
})
