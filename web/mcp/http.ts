// The MCP server over Streamable HTTP, for clients that cannot start a local
// process (ChatGPT connectors reach it through an HTTPS tunnel).
//
// Stateless and JSON-only: every POST to /mcp gets a fresh MCP server over the
// shared vault connection, and the answer comes back as plain JSON, not a
// stream, so it passes through simple tunnels.
//
// Whoever can reach this endpoint can ask the vault to pay, inside the owner's
// limits. Without HARDSTOP_HTTP_TOKEN it binds only to loopback and answers
// only connections from loopback addressed to localhost (which also stops
// DNS-rebinding pages); with a token of at least 32 characters it answers any
// host that presents it, as `Authorization: Bearer <token>` or in the path,
// /mcp/<token>, for clients that cannot send headers.

import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { hardstop, type Options } from './server.ts'
import { plain } from './vault.ts'

const MAX_BODY = 1_000_000
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
/** Values of --host that keep the server on this machine. */
const LOOPBACK_BINDS = new Set(['127.0.0.1', '::1', 'localhost'])
export const MIN_TOKEN = 32

export type HttpOptions = Options & { port: number; host?: string; token?: string }

const digest = (text: string) => createHash('sha256').update(text).digest()
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b))

function refuse(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }))
}

const isLoopback = (address: string | undefined) => address === '::1' || /^(::ffff:)?127\./.test(address ?? '')

/** Null when allowed; otherwise why not. Exported for tests. */
export function gate(req: Pick<IncomingMessage, 'headers' | 'socket'>, path: string, token: string | undefined): string | null {
  if (token) {
    const header = req.headers.authorization ?? ''
    let given = ''
    if (path.startsWith('/mcp/')) {
      try {
        given = decodeURIComponent(path.slice(5))
      } catch {
        return 'Missing or wrong HARDSTOP_HTTP_TOKEN.'
      }
    } else if (header.startsWith('Bearer ')) {
      given = header.slice(7)
    }
    return given && sameSecret(given, token) ? null : 'Missing or wrong HARDSTOP_HTTP_TOKEN.'
  }
  if (path !== '/mcp') return 'Not found.'
  const host = (req.headers.host ?? '').replace(/:\d+$/, '')
  if (!LOCAL_HOSTS.has(host) || !isLoopback(req.socket.remoteAddress)) {
    return 'This server only answers localhost. To serve it through a tunnel, set HARDSTOP_HTTP_TOKEN.'
  }
  return null
}

/** Throws, in words a person can act on, when these settings would expose the vault. */
export function checkExposure(host: string, token: string | undefined): void {
  if (token !== undefined && token.length < MIN_TOKEN) {
    throw new Error(`HARDSTOP_HTTP_TOKEN is too short (${token.length} characters; at least ${MIN_TOKEN}). Make one with: openssl rand -hex 32`)
  }
  if (!token && !LOOPBACK_BINDS.has(host)) {
    throw new Error(`Refusing to listen on ${host} without HARDSTOP_HTTP_TOKEN: anyone who can reach it could spend from the vault. Set a token, or use --host 127.0.0.1.`)
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('The request is too large.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export async function startHttp({ port, host = '127.0.0.1', token, ...options }: HttpOptions): Promise<Server> {
  checkExposure(host, token)
  const make = hardstop(options)
  const server = createHttpServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '')
      if (path !== '/mcp' && !path.startsWith('/mcp/')) return refuse(res, 404, 'Not found. The MCP endpoint is /mcp.')
      const denied = gate(req, path, token)
      if (denied) return refuse(res, denied === 'Not found.' ? 404 : 403, denied)
      if (req.method !== 'POST') return refuse(res, 405, 'This server is stateless: send MCP requests as POST.')

      let body: unknown
      try {
        body = await readJson(req)
      } catch (error) {
        return refuse(res, 400, `The request body is not usable JSON: ${plain(error)}`)
      }
      const mcp = make()
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, ...rebinding() })
      res.on('close', () => {
        void transport.close()
        void mcp.close()
      })
      await mcp.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch (error) {
      if (!res.headersSent) refuse(res, 500, plain(error))
    }
  })
  // The SDK's own Host and Origin checks, on top of `gate`. A token server sits
  // behind a tunnel whose host name is not known here, so the token guards it.
  const rebinding = () => {
    if (token) return {}
    const { port: bound } = server.address() as AddressInfo
    const hosts = [...LOCAL_HOSTS].map((name) => `${name}:${bound}`)
    return { enableDnsRebindingProtection: true, allowedHosts: hosts, allowedOrigins: hosts.map((h) => `http://${h}`) }
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolve)
  })
  return server
}
