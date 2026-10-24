import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sharedRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(sharedRoot, '..', 'contracts', 'abi')
const target = join(sharedRoot, 'src', 'abi')

if (!existsSync(source)) {
  process.stdout.write('sync-abi: contracts/abi does not exist yet; nothing to copy (contracts C0 has not frozen the ABI)\n')
  process.exit(0)
}

const files = readdirSync(source).filter((name) => name.endsWith('.json'))
if (files.length === 0) {
  process.stdout.write('sync-abi: contracts/abi has no json files yet; nothing to copy\n')
  process.exit(0)
}

mkdirSync(target, { recursive: true })
for (const name of files) {
  copyFileSync(join(source, name), join(target, name))
}
process.stdout.write(`sync-abi: copied ${files.length} file(s) to shared/src/abi: ${files.join(', ')}\n`)
