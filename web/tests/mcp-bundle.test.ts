// The one-file MCP server (mcp/dist/hardstop-mcp.mjs, built by scripts/bundle-mcp.mjs),
// started the way `npx -y github:vaibhav4046/hardstop --demo` starts it: plain node, --demo.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const BUNDLE = fileURLToPath(new URL('../mcp/dist/hardstop-mcp.mjs', import.meta.url))

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
