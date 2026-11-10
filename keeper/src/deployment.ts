import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { Deployment } from './config'

const deploymentSchema = z.object({
  network: z.string().optional(),
  arena: z.string().optional(),
  deployHeight: z.number().optional(),
  gasUnit: z.string().optional(),
  gas: z.record(z.string(), z.number()).optional()
})

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function readDeployment(network: string, root: string = REPO_ROOT): Deployment | null {
  const path = join(root, 'deployments', `near-${network}.json`)
  if (!existsSync(path)) return null
  const parsed = deploymentSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
  if (!parsed.success) return null
  const out: Deployment = {}
  if (parsed.data.arena !== undefined) out.arena = parsed.data.arena
  if (parsed.data.deployHeight !== undefined) out.deployHeight = parsed.data.deployHeight
  if (parsed.data.gas !== undefined && parsed.data.gasUnit === 'Tgas') {
    out.gas = Object.fromEntries(Object.entries(parsed.data.gas).map(([method, tgas]) => [method, BigInt(Math.round(tgas * 1e6)) * 10n ** 6n]))
  }
  return out
}
