import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.turbo'])
const TEXT_EXTENSIONS = new Set(['.ts', '.mjs', '.json'])
const slashes = '/'.repeat(2)
const blockOpen = '/' + '\\*'
const lineComment = new RegExp(`^\\s*${slashes}`, 'm')
const blockComment = new RegExp(blockOpen)
const suppressions = /@ts-ignore|@ts-expect-error|@ts-nocheck/
const anyKeyword = /\bany\b/
const secretWords = ['private', 'secret', 'mnemonic'].join('|')
const secretAssignment = new RegExp(`(${secretWords})[_a-z]*\\s*[:=]\\s*['"]0x`, 'i')

function walk(directory, files) {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) continue
    const full = join(directory, entry)
    const info = statSync(full)
    if (info.isDirectory()) {
      walk(full, files)
    } else {
      files.push(full)
    }
  }
  return files
}

const roots = process.argv.slice(2)
const targets = roots.length > 0 ? roots : ['.']
const problems = []

for (const target of targets) {
  const base = resolve(target)
  if (!existsSync(base)) {
    problems.push(`${target}: path does not exist`)
    continue
  }
  for (const file of walk(base, [])) {
    const shown = relative(process.cwd(), file) || file
    const name = file.split('/').pop() ?? file
    if (/^\.env(\..*)?$/.test(name) && name !== '.env.example') {
      problems.push(`${shown}: environment file must not exist in the tree`)
      continue
    }
    const extension = extname(file)
    if (!TEXT_EXTENSIONS.has(extension)) continue
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    lines.forEach((line, index) => {
      const where = `${shown}:${index + 1}`
      if (lineComment.test(line) || blockComment.test(line)) problems.push(`${where}: comment`)
      if (secretAssignment.test(line)) problems.push(`${where}: secret-looking assignment`)
      if (extension === '.ts') {
        if (suppressions.test(line)) problems.push(`${where}: type suppression`)
        if (anyKeyword.test(line)) problems.push(`${where}: the any keyword`)
      }
    })
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.stderr.write(`lint failed with ${problems.length} problem(s)\n`)
  process.exit(1)
}
process.stdout.write('lint ok\n')
