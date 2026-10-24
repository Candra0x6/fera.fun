import { describe, expect, it } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import { createLogger } from '../src/logger'
import { createRedactor, describeError } from '../src/redact'

const MNEMONIC = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima'

function capture(secrets: string[]) {
  const lines: string[] = []
  const log = createLogger({ secrets, level: 'debug', sink: { write: (chunk) => void lines.push(chunk) } })
  return { log, lines, text: () => lines.join('') }
}

describe('secret redaction', () => {
  it('scrubs a key from messages, fields and errors', () => {
    const key = generatePrivateKey()
    const { log, text } = capture([key])
    log.info(`connecting with ${key}`)
    log.info({ detail: `signer ${key.slice(2)} ready` }, 'startup')
    log.warn({ err: new Error(`request failed for ${key}`).message }, 'rpc error')
    log.error({ nested: { note: key.toUpperCase().replace('0X', '0x') } }, 'uppercase variant')
    expect(text()).not.toContain(key)
    expect(text()).not.toContain(key.slice(2))
    expect(text().toLowerCase()).not.toContain(key.slice(2).toLowerCase())
    expect(text()).toContain('[redacted]')
  })

  it('censors fields named like secrets even when the value is unknown', () => {
    const { log, text } = capture([])
    log.info({ privateKey: 'unknown-value-1', nested: { mnemonic: 'unknown-value-2' } }, 'config')
    expect(text()).not.toContain('unknown-value-1')
    expect(text()).not.toContain('unknown-value-2')
  })

  it('scrubs a mnemonic written with irregular spacing', () => {
    const { log, text } = capture([MNEMONIC])
    log.info(`phrase: ${MNEMONIC}`)
    log.info(`phrase: ${MNEMONIC.split(' ').join('  ')}`)
    expect(text()).not.toContain(MNEMONIC)
    expect(text()).not.toContain('alpha bravo charlie')
  })

  it('keeps ordinary data intact, tx hashes included', () => {
    const key = generatePrivateKey()
    const hash = `0x${'ab'.repeat(32)}`
    const { log, text } = capture([key])
    log.info({ txHash: hash, roundId: 1 }, 'transaction mined')
    expect(text()).toContain(hash)
    expect(text()).toContain('transaction mined')
  })

  it('redacts error descriptions and short secrets are ignored', () => {
    const key = generatePrivateKey()
    const redact = createRedactor([key, 'abc'])
    expect(describeError(new Error(`bad key ${key}`), redact)).toBe('bad key [redacted]')
    expect(describeError('plain abc text', redact)).toBe('plain abc text')
  })
})
