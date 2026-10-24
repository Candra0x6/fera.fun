import { describe, expect, it } from 'vitest'
import { describeError } from './errors'

describe('describeError', () => {
  it('maps the locked revert to a readable reason', () => {
    expect(describeError({ shortMessage: 'The contract function "buy" reverted with: Locked()' })).toMatch(/^Locked/)
  })
  it('maps the start-lobby reverts', () => {
    expect(describeError({ shortMessage: 'reverted with: RoundInProgress()' })).toBe('A round is already in progress')
    expect(describeError({ shortMessage: 'reverted with: NoDefaultConfig()' })).toMatch(/default round config/)
  })
  it('maps the bad image revert', () => {
    expect(describeError({ shortMessage: 'reverted with: BadImage()' })).toBe('That image cannot be used. Pick a PNG, JPEG or WebP under 5 MB')
  })
  it('maps wallet rejection', () => {
    expect(describeError(new Error('User rejected the request.'))).toBe('Request rejected in the wallet')
  })
  it('truncates long unknown errors', () => {
    expect(describeError(new Error('x'.repeat(400))).length).toBeLessThanOrEqual(140)
  })
  it('falls back for non-errors', () => {
    expect(describeError(undefined)).toBe('Transaction failed')
  })
})
