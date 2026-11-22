// Packs the Claude Desktop extension, public/install/hardstop.mcpb: the
// one-file server (npm run bundle:mcp first), the icon and mcp/mcpb/manifest.json.
// Opening the file in Claude Desktop installs HARDSTOP with nothing cloned.
// Run from web/: node scripts/pack-mcpb.mjs
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const stage = mkdtempSync(join(tmpdir(), 'hardstop-mcpb-'))
try {
  mkdirSync(join(stage, 'server'))
  copyFileSync('mcp/mcpb/manifest.json', join(stage, 'manifest.json'))
  copyFileSync('src/app/apple-icon.png', join(stage, 'icon.png'))
  copyFileSync('mcp/dist/hardstop-mcp.mjs', join(stage, 'server', 'hardstop-mcp.mjs'))
  mkdirSync('public/install', { recursive: true })
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  execFileSync(npx, ['-y', '@anthropic-ai/mcpb@2.1.2', 'pack', stage, 'public/install/hardstop.mcpb'], { stdio: 'inherit', shell: process.platform === 'win32' })
} finally {
  rmSync(stage, { recursive: true, force: true })
}
