export const REDACTED = '[redacted]'

export interface TextSink {
  write(chunk: string): void
}

function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createRedactor(secrets: readonly string[]): (text: string) => string {
  const patterns = secrets
    .map((secret) => secret.trim())
    .filter((secret) => secret.length >= 8)
    .flatMap((secret) => {
      const variants = new Set<string>([secret])
      if (secret.startsWith('0x')) variants.add(secret.slice(2))
      return [...variants]
    })
    .sort((a, b) => b.length - a.length)
    .map((secret) => new RegExp(secret.split(/\s+/).map(escapePattern).join('\\s+'), 'gi'))
  return (text) => {
    let out = text
    for (const pattern of patterns) out = out.replace(pattern, REDACTED)
    return out
  }
}

export function createScrubbedSink(secrets: readonly string[], sink: TextSink): TextSink {
  const redact = createRedactor(secrets)
  return { write: (chunk) => sink.write(redact(chunk)) }
}

export function describeError(error: unknown, redact: (text: string) => string): string {
  if (error instanceof Error) return redact(error.message)
  return redact(String(error))
}
