import { describe, expect, it } from 'vitest'
import { isFinalClash } from './finalDuel'

describe('isFinalClash', () => {
  it('is true when exactly the two fighters are alive', () => {
    expect(isFinalClash(['1:1', '1:2'], new Set(), '1:1', '1:2')).toBe(true)
  })
  it('is false with more than two alive coins', () => {
    expect(isFinalClash(['1:1', '1:2', '1:3'], new Set(), '1:1', '1:2')).toBe(false)
  })
  it('ignores removed coins when counting', () => {
    expect(isFinalClash(['1:1', '1:2', '1:3'], new Set(['1:3']), '1:1', '1:2')).toBe(true)
  })
  it('is false when the fighters are not the two survivors', () => {
    expect(isFinalClash(['1:1', '1:2'], new Set(), '1:1', '1:9')).toBe(false)
  })
})
