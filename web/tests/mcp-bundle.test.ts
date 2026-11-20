// The one-file MCP server (mcp/dist/hardstop-mcp.mjs, built by scripts/bundle-mcp.mjs),
// started the way `npx -y github:vaibhav4046/hardstop --demo` starts it: plain node, --demo.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const BUNDLE = fileURLToPath(new URL('../mcp/dist/hardstop-mcp.mjs', import.meta.url))

test('the bundled server starts when run through a link, as npx runs it on macOS and Linux', async () => {
  // npx starts the bin through a symlink; node reports the real path as import.meta.url
  // but the link as process.argv[1]. A junction does the same on Windows without admin rights.
  const dir = mkdtempSync(join(tmpdir(), 'hardstop-link-'))
  const link = join(dir, 'linked')
  symlinkSync(dirname(BUNDLE), link, 'junction')
  const client = new Client({ name: 'bundle-link-test', version: '0' })
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(link, 'hardstop-mcp.mjs'), '--demo'], stderr: 'ignore' }))
    assert.equal((await client.listTools()).tools.length, 5)
  } finally {
    await client.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the bundled server runs with --demo: five tools, a $4 payment paid, $15 refused', async () => {
  const client = new Client({ name: 'bundle-test', version: '0' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [BUNDLE, '--demo'], stderr: 'ignore' }))
  try {
    const tools = (await client.listTools()).tools.map((tool) => tool.name).sort()
    assert.deepEqual(tools, ['hardstop_pay', 'hardstop_preview_payment', 'hardstop_recipients', 'hardstop_request_more', 'hardstop_status'])
    const pay = async (amount: number) =>
      ((await client.callTool({ name: 'hardstop_pay', arguments: { to: 'Cloud hosting', amount_usd: amount } })) as CallToolResult).structuredContent as Record<string, unknown>
    assert.equal((await pay(4)).result, 'paid')
    assert.equal((await pay(15)).result, 'refused')
  } finally {
    await client.close()
  }
})

test('the bundled server becomes the watcher with --watch, and says what is missing', () => {
  const env = { ...process.env, HARDSTOP_VAULT: undefined, HARDSTOP_AGENT_KEY: undefined, HARDSTOP_FAKE: undefined }
  const run = spawnSync(process.execPath, [BUNDLE, '--watch'], { env, encoding: 'utf8', timeout: 30_000 })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /HARDSTOP_VAULT is not set/)
})
