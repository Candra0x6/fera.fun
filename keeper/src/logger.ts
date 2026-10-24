import pino from 'pino'
import type { Logger } from 'pino'
import { createScrubbedSink } from './redact'
import type { TextSink } from './redact'

export type KeeperLogger = Logger

export interface LoggerOptions {
  secrets: readonly string[]
  level?: string
  sink?: TextSink
}

export function createLogger(options: LoggerOptions): KeeperLogger {
  const sink = options.sink ?? { write: (chunk: string) => void process.stdout.write(chunk) }
  const scrubbed = createScrubbedSink(options.secrets, sink)
  return pino(
    {
      level: options.level ?? 'info',
      base: { service: 'keeper' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: ['privateKey', 'mnemonic', 'key', 'secret', '*.privateKey', '*.mnemonic', '*.key', '*.secret'],
        censor: '[redacted]'
      }
    },
    scrubbed
  )
}
