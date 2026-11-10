import { describe, expect, it } from 'vitest'
import { KeyPair } from 'near-api-js'
import { houseAccountId, housePublicKey, houseSecretKey } from '../src/houseKeys'

describe('house keys', () => {
  it('derives stable distinct ed25519 keys from the seed and index', () => {
    const a = houseSecretKey('seed-one-long', 0)
    expect(houseSecretKey('seed-one-long', 0)).toBe(a)
    expect(houseSecretKey('seed-one-long', 1)).not.toBe(a)
    expect(houseSecretKey('seed-two-long', 0)).not.toBe(a)
    expect(a.startsWith('ed25519:')).toBe(true)
  })

  it('returns a public key that matches the secret key', () => {
    const secret = houseSecretKey('seed-one-long', 3)
    expect(housePublicKey('seed-one-long', 3)).toBe(KeyPair.fromString(secret).getPublicKey().toString())
    const pair = KeyPair.fromString(secret)
    const signature = pair.sign(new Uint8Array([1, 2, 3]))
    expect(pair.getPublicKey().verify(new Uint8Array([1, 2, 3]), signature.signature)).toBe(true)
  })

  it('names the accounts as sub-accounts of the seeder', () => {
    expect(houseAccountId(0, 'fera-seeder.testnet')).toBe('h1.fera-seeder.testnet')
    expect(houseAccountId(4, 'fera-seeder.testnet')).toBe('h5.fera-seeder.testnet')
  })
})
