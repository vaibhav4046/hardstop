// One MCP tool call through the real one-file server (mcp/dist/hardstop-mcp.mjs)
// over stdio, with the official MCP client. Used to let an AI agent that has
// no MCP client of its own work through the same five tools any client gets.
//
//   HARDSTOP_MCP_CONFIG=<file outside the repo> node scripts/mcp-call.mjs <tool> '<json arguments>'
//
// The config file is an ordinary MCP client config ({"mcpServers": {"hardstop":
// {"env": {...}}}}); only its env is used. Nothing secret is printed.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const [tool, raw = '{}'] = process.argv.slice(2)
const configFile = process.env.HARDSTOP_MCP_CONFIG
if (!tool || !configFile) {
  console.error('usage: HARDSTOP_MCP_CONFIG=<file> node scripts/mcp-call.mjs <tool> [json arguments]')
  process.exit(2)
}
const env = JSON.parse(readFileSync(configFile, 'utf8')).mcpServers.hardstop.env
const server = fileURLToPath(new URL('../mcp/dist/hardstop-mcp.mjs', import.meta.url))
const client = new Client({ name: 'hardstop-agent-bridge', version: '0' })
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [server],
    env: { PATH: process.env.PATH ?? '', ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), ...env },
    stderr: 'ignore',
  }),
)
try {
  if (tool === 'list') {
    const { tools } = await client.listTools()
    for (const t of tools) console.log(`${t.name}: ${t.description?.split('\n')[0]}`)
  } else {
    const result = await client.callTool({ name: tool, arguments: JSON.parse(raw) })
    for (const part of result.content) if (part.type === 'text') console.log(part.text)
    if (result.isError) process.exitCode = 1
  }
} finally {
  await client.close()
}
