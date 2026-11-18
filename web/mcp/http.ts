// The MCP server over Streamable HTTP, for clients that cannot start a local
// process (ChatGPT connectors reach it through an HTTPS tunnel).
//
// Stateless and JSON-only: every POST to /mcp gets a fresh MCP server over the
// shared vault connection, and the answer comes back as plain JSON, not a
// stream, so it passes through simple tunnels.
//
// Whoever can reach this endpoint can ask the vault to pay, inside the owner's
// limits. Without HARDSTOP_HTTP_TOKEN it answers only requests addressed to
// localhost (which also stops DNS-rebinding pages); with a token it answers
// any host that presents it, as `Authorization: Bearer <token>` or in the
// path, /mcp/<token>, for clients that cannot send headers.

import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { hardstop, type Options } from './server.ts'
import { plain } from './vault.ts'

const MAX_BODY = 1_000_000
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export type HttpOptions = Options & { port: number; host?: string; token?: string }

const digest = (text: string) => createHash('sha256').update(text).digest()
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b))

function refuse(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }))
}

/** Null when allowed; otherwise why not. */
function gate(req: IncomingMessage, path: string, token: string | undefined): string | null {
  if (token) {
    const header = req.headers.authorization ?? ''
    const given = path.startsWith('/mcp/') ? decodeURIComponent(path.slice(5)) : header.startsWith('Bearer ') ? header.slice(7) : ''
    return given && sameSecret(given, token) ? null : 'Missing or wrong HARDSTOP_HTTP_TOKEN.'
  }
  if (path !== '/mcp') return 'Not found.'
  const host = (req.headers.host ?? '').replace(/:\d+$/, '')
  return LOCAL_HOSTS.has(host) ? null : 'This server only answers localhost. To serve it through a tunnel, set HARDSTOP_HTTP_TOKEN.'
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
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
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
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolve)
  })
  return server
}
