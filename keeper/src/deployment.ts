import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { Hex } from '@animal/shared'
import type { Deployment } from './config'

const deploymentSchema = z.object({
  chainId: z.number().optional(),
  arena: z.string().optional(),
  seedSource: z.string().optional(),
  deployBlock: z.number().optional()
})

export interface DeploymentFile extends Deployment {
  seedSource?: Hex
}

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function readDeployment(chainId: number, root: string = REPO_ROOT): DeploymentFile | null {
  const path = join(root, 'deployments', `${chainId}.json`)
  if (!existsSync(path)) return null
  const parsed = deploymentSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
  if (!parsed.success) return null
  const { arena, seedSource, deployBlock } = parsed.data
  const out: DeploymentFile = {}
  if (arena !== undefined) out.arena = arena
  if (deployBlock !== undefined) out.deployBlock = deployBlock
  if (seedSource !== undefined) out.seedSource = seedSource as Hex
  return out
}
