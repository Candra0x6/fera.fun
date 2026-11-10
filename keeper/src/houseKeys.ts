import { createHash, createPrivateKey, createPublicKey } from 'node:crypto'
import { KeyPair, baseEncode } from 'near-api-js'
import type { KeyPairString } from 'near-api-js'

const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')
const SPKI_PREFIX_LENGTH = 12

export function houseAccountId(index: number, seederAccountId: string): string {
  return `h${index + 1}.${seederAccountId}`
}

export function houseSecretKey(seed: string, index: number): KeyPairString {
  const secret = createHash('sha256').update(`fera-house:${seed}:${index}`).digest()
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, secret]), format: 'der', type: 'pkcs8' })
  const spki = createPublicKey(privateKey).export({ format: 'der', type: 'spki' })
  const publicBytes = spki.subarray(SPKI_PREFIX_LENGTH)
  return `ed25519:${baseEncode(new Uint8Array(Buffer.concat([secret, publicBytes])))}` as KeyPairString
}

export function housePublicKey(seed: string, index: number): string {
  return KeyPair.fromString(houseSecretKey(seed, index)).getPublicKey().toString()
}
