// The public practice server (mcp/practice.ts), driven by the real MCP client
// through a fetch that hands each request straight to the server: no socket,
// the same Request and Response objects the site's route passes.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { practice, type Practice } from '../mcp/practice.ts'

const URL_ = 'https://practice.test/mcp'
const SHOP = '0x0000000000000000000000000000000000005109'
const text = (result: CallToolResult) => result.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n')

async function connect(server: Practice, from = '203.0.113.7'): Promise<Client> {
  const client = new Client({ name: 'practice-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    fetch: async (input, init) => {
      const request = new Request(input, init)
      request.headers.set('x-forwarded-for', from)
      return server.handle(request)
    },
  })
  await client.connect(transport)
  return client
}

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args })) as CallToolResult

test('each session gets its own practice vault: a payment in one is not seen by another', async () => {
  const server = practice()
  const alice = await connect(server)
  const bob = await connect(server)
  assert.equal(server.size, 2)

  const { tools } = await alice.listTools()
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    'hardstop_pay',
    'hardstop_preview_payment',
    'hardstop_recipients',
    'hardstop_request_more',
    'hardstop_status',
  ])
  const before = text(await call(alice, 'hardstop_status'))
  assert.match(before, /public practice server/)
  assert.match(before, /\$0\.00 of \$20\.00 used/)

  const paid = text(await call(alice, 'hardstop_pay', { to: SHOP, amount_usd: '3' }))
  assert.match(paid, /^✅ Paid/m)
  assert.match(text(await call(alice, 'hardstop_status')), /\$3\.00 of \$20\.00 used/)
  assert.match(text(await call(bob, 'hardstop_status')), /\$0\.00 of \$20\.00 used/)

  const refused = text(await call(alice, 'hardstop_pay', { to: SHOP, amount_usd: '15' }))
  assert.match(refused, /^⛔ Refused/m)
  await alice.close()
  await bob.close()
})

test('the tricked practice server starts with a $1,000 raise waiting, and the agent is still refused', async () => {
  const server = practice({ trickedRaise: true })
  const agent = await connect(server)
  assert.match(text(await call(agent, 'hardstop_status')), /⏳ A change is waiting/)
  assert.match(text(await call(agent, 'hardstop_pay', { to: SHOP, amount_usd: '500' })), /^⛔ Refused/m)
  await agent.close()
})

test('a request without a session must be an initialize; an unknown session is told to start again', async () => {
  const server = practice()
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  const list = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  const noSession = await server.handle(new Request(URL_, { method: 'POST', headers, body: list }))
  assert.equal(noSession.status, 400)
  const gone = await server.handle(new Request(URL_, { method: 'POST', headers: { ...headers, 'mcp-session-id': 'nope' }, body: list }))
  assert.equal(gone.status, 404)
  assert.equal(server.size, 0)
})

test('large bodies, too many requests and too many new sessions are refused', async () => {
  const server = practice()
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-forwarded-for': '198.51.100.1' }
  const big = await server.handle(new Request(URL_, { method: 'POST', headers, body: 'x'.repeat(100_001) }))
  assert.equal(big.status, 413)

  let last = 0
  for (let i = 0; i < 121; i += 1) {
    last = (await server.handle(new Request(URL_, { method: 'POST', headers: { ...headers, 'x-forwarded-for': '198.51.100.2' }, body: '{}' }))).status
  }
  assert.equal(last, 429)

  for (let i = 0; i < 10; i += 1) await (await connect(server, '198.51.100.3')).close()
  await assert.rejects(connect(server, '198.51.100.3'), /429|Too many/)
})

test('a vault idle for 30 minutes is forgotten', async () => {
  let clock = 1_000_000
  const server = practice({ now: () => clock })
  const agent = await connect(server)
  assert.equal(server.size, 1)
  clock += 31 * 60_000
  await assert.rejects(call(agent, 'hardstop_status'), /404|ended/)
  assert.equal(server.size, 0)
})

test('rate limits count an IPv6 address by its /64, and an IPv4 address by itself', async () => {
  const { clientKey } = await import('../mcp/practice.ts')
  assert.equal(clientKey('2001:db8:1:2:aaaa::1, 10.0.0.1'), clientKey('2001:db8:1:2:bbbb::9'))
  assert.notEqual(clientKey('2001:db8:1:2::1'), clientKey('2001:db8:1:3::1'))
  assert.equal(clientKey('203.0.113.7'), '203.0.113.7')
  assert.equal(clientKey(null), 'unknown')
})

test('a body over the limit is refused even when it declares no length', async () => {
  const server = practice()
  const chunk = new TextEncoder().encode('x'.repeat(60_000))
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(chunk)
      controller.enqueue(chunk)
      controller.close()
    },
  })
  const response = await server.handle(
    new Request(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half' } as RequestInit),
  )
  assert.equal(response.status, 413)
})
