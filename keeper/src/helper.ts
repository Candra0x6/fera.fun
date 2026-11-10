export type HelperResult = { ok: true } | { ok: false; status: number; retryAfterSeconds: number | null }

export interface HelperClient {
  create(accountId: string, publicKey: string): Promise<HelperResult>
}

export interface HelperOptions {
  url: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export function createHelperClient(options: HelperOptions): HelperClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 4000
  return {
    async create(accountId, publicKey) {
      try {
        const response = await fetchImpl(`${options.url}/account`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
          signal: AbortSignal.timeout(timeoutMs)
        })
        if (response.ok) return { ok: true }
        const retry = Number(response.headers.get('retry-after'))
        return { ok: false, status: response.status, retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : null }
      } catch {
        return { ok: false, status: 0, retryAfterSeconds: null }
      }
    }
  }
}
