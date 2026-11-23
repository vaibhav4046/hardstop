// A public practice server: the HARDSTOP MCP server over Streamable HTTP,
// where every MCP session gets its own practice vault on the in-memory demo
// network (the compiled Fe contracts on an EVM inside this process). Nothing
// here is real: no keys are read, no network is reached, and a vault is
// forgotten after 30 idle minutes or when the process restarts.
//
// The host may run several copies of this process and send a session's
// requests to any of them. So the MCP layer is stateless (a fresh MCP server
// per request) and the session id is this module's own: a copy that does not
// hold the session's vault opens a new one under the same id, and the session
// carries on with a reset vault instead of failing.
//
// Framework-free: `handle` takes a web `Request` and returns a `Response`,
// so the site's route (src/app/mcp/route.ts) and the tests use it the same way.

import { randomUUID } from 'node:crypto'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { demo } from './demo.ts'
import { hardstop } from './server.ts'

export const PRACTICE_NAME = 'public practice server (an in-memory vault for this session only; nothing is real, and it may reset)'
const MAX_BODY = 100_000
const IDLE_MS = 30 * 60_000
const MAX_SESSIONS = 50
/** Requests per address per minute, and new sessions per address per ten minutes. */
const REQUESTS_PER_MINUTE = 120
const SESSIONS_PER_TEN_MINUTES = 10

/** A session's vault and payment queue; each request gets its own MCP server over them. */
type Session = { make: () => McpServer; lastUsed: number }
type Counter = { count: number; since: number }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id',
  'access-control-expose-headers': 'mcp-session-id',
}

function jsonError(status: number, message: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }), {
    status,
    headers: { 'content-type': 'application/json', ...CORS, ...extra },
  })
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(CORS)) headers.set(name, value)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

/** The address to count requests against: an IPv6 address by its /64, since one user holds the whole block. */
export function clientKey(forwarded: string | null): string {
  const first = (forwarded ?? '').split(',')[0].trim()
  if (!first) return 'unknown'
  if (!first.includes(':')) return first
  return first.split(':').slice(0, 4).join(':') + '::/64'
}

/** The body as text, refusing once it passes `limit` bytes, whatever the request declares. */
async function readLimited(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/** Session ids this server hands out (UUIDs); anything else gets a new one. */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const isInitialize = (body: unknown): boolean =>
  (Array.isArray(body) ? body : [body]).some(
    (message) => typeof message === 'object' && message !== null && (message as { method?: unknown }).method === 'initialize',
  )

export type PracticeOptions = {
  /** Start each vault as if its owner had been talked into a $1,000 raise (`--tricked`). */
  trickedRaise?: boolean
  /** Milliseconds since the epoch; tests pass a clock. */
  now?: () => number
}

export type Practice = {
  handle(request: Request): Promise<Response>
  /** Open sessions, for tests and logs. */
  readonly size: number
}

export function practice({ trickedRaise = false, now = Date.now }: PracticeOptions = {}): Practice {
  const sessions = new Map<string, Session>()
  /** Sessions being opened: counted against the cap before they are in `sessions`. */
  let opening = 0
  const requests = new Map<string, Counter>()
  const starts = new Map<string, Counter>()

  /** True when `who` is over `limit` in the window, counting this one. */
  const over = (counters: Map<string, Counter>, who: string, limit: number, windowMs: number): boolean => {
    const at = now()
    const current = counters.get(who)
    if (!current || at - current.since >= windowMs) {
      counters.set(who, { count: 1, since: at })
      return false
    }
    current.count += 1
    return current.count > limit
  }

  const close = (id: string) => {
    sessions.delete(id)
  }

  /** Forget idle vaults, and the counters of addresses that went quiet. */
  const sweep = () => {
    const at = now()
    for (const [id, session] of sessions) if (at - session.lastUsed > IDLE_MS) close(id)
    for (const counters of [requests, starts]) {
      for (const [who, counter] of counters) if (at - counter.since > IDLE_MS) counters.delete(who)
    }
  }

  async function open(): Promise<Session> {
    // The demo's own settings, never this process's environment: no key, RPC or vault from outside is read.
    const { env, wallet } = await demo({ trickedRaise })
    // Without the in-memory wallet the server would fall back to a real network's RPC.
    if (!wallet) throw new Error('the practice vault has no in-memory network')
    return { make: hardstop({ env, wallet, networkName: PRACTICE_NAME }), lastUsed: now() }
  }

  async function handle(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    sweep()
    const who = clientKey(request.headers.get('x-forwarded-for'))
    if (over(requests, who, REQUESTS_PER_MINUTE, 60_000)) {
      return jsonError(429, 'Too many requests to the practice server. Wait a minute.', { 'retry-after': '60' })
    }

    const id = request.headers.get('mcp-session-id')
    if (request.method === 'GET') return jsonError(405, 'This practice server answers POST only (no event stream).', { allow: 'POST, DELETE' })
    if (request.method === 'DELETE') {
      if (id) close(id)
      return new Response(null, { status: 204, headers: CORS })
    }
    if (request.method !== 'POST') return jsonError(405, 'Send MCP requests as POST.', { allow: 'POST, DELETE' })

    const declared = Number(request.headers.get('content-length') ?? '0')
    if (declared > MAX_BODY) return jsonError(413, 'The request is too large.')
    const text = await readLimited(request, MAX_BODY)
    if (text === null) return jsonError(413, 'The request is too large.')
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return jsonError(400, 'The request body is not JSON.')
    }

    if (!id && !isInitialize(body)) {
      return jsonError(400, 'Start with an initialize request; this server keeps one practice vault per session.')
    }
    const sessionId = id && SESSION_ID.test(id) ? id : randomUUID()
    let session = sessions.get(sessionId)
    if (!session) {
      // A new session, or one this copy of the server does not hold: a new practice vault either way.
      if (over(starts, who, SESSIONS_PER_TEN_MINUTES, 10 * 60_000)) {
        return jsonError(429, 'Too many new practice sessions from this address. Wait ten minutes.', { 'retry-after': '600' })
      }
      if (sessions.size + opening >= MAX_SESSIONS) {
        // Make room by forgetting the vault idle the longest.
        const oldest = [...sessions].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0]
        if (!oldest) return jsonError(503, 'The practice server is full. Try again in a minute.', { 'retry-after': '60' })
        close(oldest[0])
      }
      opening += 1
      try {
        session = await open()
      } catch {
        return jsonError(500, 'The practice vault could not be started. Try again.')
      } finally {
        opening -= 1
      }
      sessions.set(sessionId, session)
    }
    session.lastUsed = now()
    // Stateless at the MCP layer: this request's own server and transport, over the session's vault.
    const server = session.make()
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    const headers = new Headers(request.headers)
    headers.delete('mcp-session-id')
    const replay = new Request(request.url, { method: 'POST', headers, body: text })
    try {
      const response = withCors(await transport.handleRequest(replay, { parsedBody: body }))
      response.headers.set('mcp-session-id', sessionId)
      return response
    } finally {
      void transport.close()
      void server.close()
    }
  }

  return {
    handle,
    get size() {
      return sessions.size
    },
  }
}
