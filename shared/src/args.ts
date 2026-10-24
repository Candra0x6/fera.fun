import type { ArenaEventEnvelope, Hex } from './types'

export class MalformedEventError extends Error {
  readonly eventName: string
  readonly key: string

  constructor(eventName: string, key: string, expected: string) {
    super(`event ${eventName}: argument ${key} is not ${expected}`)
    this.name = 'MalformedEventError'
    this.eventName = eventName
    this.key = key
  }
}

export function argNumber(e: ArenaEventEnvelope, key: string): number {
  const value = e.args[key]
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return parsed
  }
  throw new MalformedEventError(e.name, key, 'a safe integer')
}

export function argBigInt(e: ArenaEventEnvelope, key: string): bigint {
  const value = e.args[key]
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value)
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  throw new MalformedEventError(e.name, key, 'a non-negative integer')
}

export function argString(e: ArenaEventEnvelope, key: string): string {
  const value = e.args[key]
  if (typeof value === 'string') return value
  throw new MalformedEventError(e.name, key, 'a string')
}

export function argBoolean(e: ArenaEventEnvelope, key: string): boolean {
  const value = e.args[key]
  if (typeof value === 'boolean') return value
  throw new MalformedEventError(e.name, key, 'a boolean')
}

export function isHex(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value)
}

export function argHex(e: ArenaEventEnvelope, key: string): Hex {
  const value = e.args[key]
  if (isHex(value)) return value
  throw new MalformedEventError(e.name, key, 'a hex string')
}
