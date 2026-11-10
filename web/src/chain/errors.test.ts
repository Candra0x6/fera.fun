import { describe, expect, it } from 'vitest'
import { describeError } from './errors'

describe('describeError', () => {
  it('maps arena panics by name', () => {
    expect(describeError({ message: 'Smart contract panicked: ArenaError:Locked' })).toMatch(/^Locked/)
    expect(describeError(new Error('wasm execution failed: ArenaError:Slippage'))).toBe('Price moved: try again')
    expect(describeError(new Error('ArenaError:Expired'))).toBe('The quote expired: try again')
    expect(describeError(new Error('ArenaError:CreatorCapReached'))).toBe('Limit of 2 coins per account')
    expect(describeError(new Error('ArenaError:RoundInProgress'))).toBe('A round is already in progress')
    expect(describeError(new Error('ArenaError:SeedBlockNotReached'))).toMatch(/seed block/)
  })
  it('names an unknown arena panic instead of hiding it', () => {
    expect(describeError(new Error('ArenaError:Brandnew'))).toBe('Arena error: Brandnew')
  })
  it('maps NEAR account and balance failures', () => {
    expect(describeError(new Error('Sender a.testnet does not have enough balance 1 for operation costing 2'))).toBe('Not enough NEAR for this transaction')
    expect(describeError(new Error('Can not sign transactions for account a.testnet, no matching key (AccessKeyDoesNotExist)'))).toMatch(/not ready yet/)
    expect(describeError(new Error('Exceeded 2 providers to execute request'))).toMatch(/busy/)
  })
  it('truncates long unknown errors', () => {
    expect(describeError(new Error('x'.repeat(400))).length).toBeLessThanOrEqual(140)
  })
  it('falls back for non-errors', () => {
    expect(describeError(undefined)).toBe('Transaction failed')
  })
})
