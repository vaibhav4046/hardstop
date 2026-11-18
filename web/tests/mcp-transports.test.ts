// The MCP server as a client really meets it: started as a child process and
// spoken to over stdio, and started with --http and spoken to over Streamable
// HTTP. Both run in demo mode (HARDSTOP_FAKE=1): an in-memory network with a
// freshly launched vault, so no network or key is needed.

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { gate, startHttp } from '../mcp/http.ts'
import { demo } from '../mcp/demo.ts'

const TOOLS = ['hardstop_pay', 'hardstop_preview_payment', 'hardstop_recipients', 'hardstop_request_more', 'hardstop_status']
const STRANGER = '0x0000000000000000000000000000000000000bad'
/** The child gets only what it needs: never this process's own HARDSTOP_* settings. */
const childEnv = (): Record<string, string> => ({
  PATH: process.env.PATH ?? '',
  ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  HARDSTOP_FAKE: '1',
})

const TOKEN = 'correct horse battery staple, 32+'

const text = (result: CallToolResult) => result.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n')
const data = (result: CallToolResult) => result.structuredContent as Record<string, unknown>

/** Every tool once, in the order an agent would use them. */
async function exercise(client: Client): Promise<void> {
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult
    assert.equal(result.isError, undefined, `${name}: ${text(result)}`)
    return result
  }
  const { tools } = await client.listTools()
  assert.deepEqual(tools.map((tool) => tool.name).sort(), TOOLS)

  const status = await call('hardstop_status')
  assert.match(text(status), /in-memory demo network/)
  assert.equal(data(status).left_today_usd, '20.00')

  assert.equal(data(await call('hardstop_recipients')).recipients instanceof Array, true)
  assert.equal(data(await call('hardstop_preview_payment', { to: 'Cloud hosting', amount_usd: 4 })).would_pay, true)
  assert.equal(data(await call('hardstop_pay', { to: 'Cloud hosting', amount_usd: 4 })).result, 'paid')
  assert.equal(data(await call('hardstop_pay', { to: STRANGER, amount_usd: 1 })).reason, 'RecipientNotApproved')
  assert.equal(data(await call('hardstop_request_more', { reason: 'testing', per_day_usd: 30 })).changed, false)
  assert.equal(data(await call('hardstop_status')).left_today_usd, '16.00')

  const resource = await client.readResource({ uri: 'hardstop://status' })
  assert.match(String((resource.contents[0] as { text?: string }).text), /\$4\.00 spent, \$16\.00 left/)
}

test('over stdio, as a child process', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['mcp/server.ts'], env: childEnv(), stderr: 'pipe' })
  const client = new Client({ name: 'stdio-test', version: '0.0.0' })
  await client.connect(transport)
  try {
    await exercise(client)
  } finally {
    await client.close()
  }
})

test('over Streamable HTTP, started with --http', async () => {
  const child = spawn(process.execPath, ['mcp/server.ts', '--http', '--port', '0'], {
    env: childEnv() as NodeJS.ProcessEnv,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  try {
    let said = ''
    const url = await new Promise<string>((resolve, reject) => {
      child.stderr.on('data', (chunk: Buffer) => {
        said += chunk.toString()
        const found = /at (http:\/\/\S+\/mcp)/.exec(said)
        if (found) resolve(found[1])
      })
      child.once('exit', (code) => reject(new Error(`the server exited (${code}): ${said}`)))
    })
    const client = new Client({ name: 'http-test', version: '0.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(url)))
    await exercise(client)
    await client.close()
  } finally {
    child.kill()
    if (child.exitCode === null) await once(child, 'exit')
  }
})

test('over HTTP with a token: no token or a wrong one is refused, the header and the path both work', async () => {
  const server = await startHttp({ ...(await demo()), port: 0, token: TOKEN })
  const { port } = server.address() as { port: number }
  const base = `http://127.0.0.1:${port}`
  try {
    const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '0' } } }
    const post = (path: string, headers: Record<string, string> = {}) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
        body: JSON.stringify(init),
      })
    assert.equal((await post('/mcp')).status, 403)
    assert.equal((await post('/mcp', { authorization: 'Bearer wrong' })).status, 403)
    assert.equal((await post('/mcp/wrong')).status, 403)
    assert.equal((await post('/elsewhere')).status, 404)
    assert.equal((await post('/mcp', { authorization: `Bearer ${TOKEN}` })).status, 200)

    const client = new Client({ name: 'token-test', version: '0.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${encodeURIComponent(TOKEN)}`)))
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), TOOLS)
    await client.close()
  } finally {
    server.close()
  }
})

test('over HTTP without a token, only requests addressed to localhost are answered', async () => {
  const server = await startHttp({ ...(await demo()), port: 0 })
  const { port } = server.address() as { port: number }
  try {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
    // A page that rebinds its own domain to 127.0.0.1 still sends its own Host header.
    const rebound = await new Promise<number>((resolve, reject) => {
      import('node:http').then(({ request }) => {
        const req = request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { ...headers, host: 'evil.example' } }, (res) => resolve(res.statusCode ?? 0))
        req.on('error', reject)
        req.end(body)
      }, reject)
    })
    assert.equal(rebound, 403)
    const local = await fetch(`http://localhost:${port}/mcp`, { method: 'POST', headers, body })
    assert.notEqual(local.status, 403)
  } finally {
    server.close()
  }
})

test('over HTTP, a token shorter than 32 characters is refused at start', async () => {
  await assert.rejects(startHttp({ ...(await demo()), port: 0, token: 'correct horse' }), /too short \(13 characters; at least 32\)/)
})

test('over HTTP, listening beyond loopback without a token is refused at start, with a plain message', async () => {
  await assert.rejects(startHttp({ ...(await demo()), port: 0, host: '0.0.0.0' }), /Refusing to listen on 0\.0\.0\.0 without HARDSTOP_HTTP_TOKEN/)
  const child = spawn(process.execPath, ['mcp/server.ts', '--http', '--port', '0', '--host', '0.0.0.0'], {
    env: childEnv() as NodeJS.ProcessEnv,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let said = ''
  child.stderr.on('data', (chunk: Buffer) => (said += chunk.toString()))
  const [code] = await once(child, 'exit')
  assert.equal(code, 1)
  assert.match(said, /hardstop: Refusing to listen on 0\.0\.0\.0 without HARDSTOP_HTTP_TOKEN/)
  // Loopback names and a long enough token are fine.
  for (const host of ['localhost', '::1']) (await startHttp({ ...(await demo()), port: 0, host })).close()
  ;(await startHttp({ ...(await demo()), port: 0, host: '0.0.0.0', token: TOKEN })).close()
})

test('over HTTP without a token, a connection from beyond loopback is refused even when it says localhost', () => {
  const from = (remoteAddress: string) => ({ headers: { host: 'localhost:8787' }, socket: { remoteAddress } }) as never
  assert.match(gate(from('192.0.2.7'), '/mcp', undefined) ?? '', /only answers localhost/)
  assert.match(gate(from('::ffff:192.0.2.7'), '/mcp', undefined) ?? '', /only answers localhost/)
  assert.equal(gate(from('127.0.0.1'), '/mcp', undefined), null)
  assert.equal(gate(from('::ffff:127.0.0.1'), '/mcp', undefined), null)
  assert.equal(gate(from('::1'), '/mcp', undefined), null)
})

test("over HTTP without a token, the SDK's DNS-rebinding check refuses a foreign Origin", async () => {
  const server = await startHttp({ ...(await demo()), port: 0 })
  const { port } = server.address() as { port: number }
  try {
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
    const foreign = await fetch(`http://localhost:${port}/mcp`, { method: 'POST', headers: { ...headers, origin: 'http://evil.example' }, body })
    assert.equal(foreign.status, 403)
    assert.match(await foreign.text(), /Invalid Origin header/)
    const own = await fetch(`http://localhost:${port}/mcp`, { method: 'POST', headers: { ...headers, origin: `http://localhost:${port}` }, body })
    assert.notEqual(own.status, 403)
  } finally {
    server.close()
  }
})
