// Runs the native `hardstop` tool that `fe build --backend native` produced.
// Fe links native executables on x86-64 Linux and AArch64 macOS only, so on
// Windows the Linux binary is run through WSL.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const defaultBinary = resolve(here, '..', '..', 'fe', 'out', 'hardstop')

export const nativeBinary = process.env.HARDSTOP_BIN ?? defaultBinary

export function nativeAvailable(): boolean {
  return existsSync(nativeBinary)
}

function toWslPath(windowsPath: string): string {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(windowsPath)
  if (!match) throw new Error(`cannot map ${windowsPath} into WSL`)
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`
}

/** Feeds `lines` to `hardstop batch` and returns one output line per input line. */
export function nativeBatch(lines: string[]): string[] {
  const input = lines.join('\n') + '\n'
  const options = { input, encoding: 'utf8' as const, maxBuffer: 256 * 1024 * 1024 }
  const run =
    process.platform === 'win32'
      ? spawnSync('wsl', ['--', toWslPath(nativeBinary), 'batch'], options)
      : spawnSync(nativeBinary, ['batch'], options)
  if (run.error) throw run.error
  if (run.status !== 0) throw new Error(`hardstop batch exited ${run.status}: ${run.stderr}`)
  const output = run.stdout.trimEnd().split('\n')
  if (output.length !== lines.length) {
    throw new Error(`hardstop batch answered ${output.length} lines for ${lines.length} questions`)
  }
  return output
}

/** `join` re-exported so tests can build paths without another import. */
export { join }
