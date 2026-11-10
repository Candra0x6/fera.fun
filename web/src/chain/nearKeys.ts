import type { KeyPairString } from 'near-api-js'

export interface BurnerKey {
  secretKey: KeyPairString
  publicKey: string
}

const SECRET_KEY_PATTERN = /^ed25519:[1-9A-HJ-NP-Za-km-z]{60,100}$/

export function isSecretKey(value: string | null): value is KeyPairString {
  return value !== null && SECRET_KEY_PATTERN.test(value)
}

export async function newBurnerKey(): Promise<BurnerKey> {
  const { KeyPair } = await import('near-api-js')
  const pair = KeyPair.fromRandom('ed25519')
  return { secretKey: pair.toString(), publicKey: pair.getPublicKey().toString() }
}

export async function publicKeyOf(secretKey: KeyPairString): Promise<string> {
  const { KeyPair } = await import('near-api-js')
  return KeyPair.fromString(secretKey).getPublicKey().toString()
}
