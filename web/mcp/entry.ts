import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * True when the module at `moduleUrl` is the program node was asked to run.
 * Compares real paths: npx starts a bin through a symlink on macOS and Linux,
 * so `process.argv[1]` is the link while `import.meta.url` is the real file.
 */
export function isMain(moduleUrl: string): boolean {
  const started = process.argv[1]
  if (!started) return false
  try {
    return realpathSync(started) === realpathSync(fileURLToPath(moduleUrl))
  } catch {
    return false
  }
}
