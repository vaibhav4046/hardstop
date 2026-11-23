// A public practice server: the HARDSTOP MCP server over Streamable HTTP,
// where every MCP session gets its own practice vault on the in-memory demo
// network (the compiled Fe contracts on an EVM inside this process). Nothing
// here is real: no keys are read, no network is reached, and a vault is
// forgotten after 30 idle minutes or when the process restarts.
//
// Framework-free: `handle` takes a web `Request` and returns a `Response`,
// so the site's route (src/app/mcp/route.ts) and the tests use it the same way.

import { randomUUID } from 'node:crypto'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { demo } from './demo.ts'
import { hardstop } from './server.ts'

export const PRACTICE_NAME = 'public practice server (an in-memory vault for this session only; nothing is real)'
const MAX_BODY = 100_000
const IDLE_MS = 30 * 60_000
const MAX_SESSIONS = 50
/** Requests per address per minute, and new sessions per address per ten minutes. */
const REQUESTS_PER_MINUTE = 120
const SESSIONS_PER_TEN_MINUTES = 10

type Session = { transport: WebStandardStreamableHTTPServerTransport; server: McpServer; lastUsed: number }
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
    const session = sessions.get(id)
    if (!session) return
    sessions.delete(id)
    void session.transport.close()
    void session.server.close()
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
    const server = hardstop({ env, wallet, networkName: PRACTICE_NAME })()
    const session: Session = { server, lastUsed: now(), transport: undefined as never }
    session.transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        sessions.set(id, session)
      },
      onsessionclosed: (id) => {
        sessions.delete(id)
      },
    })
    await server.connect(session.transport)
    return session
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

    let session: Session | undefined
    if (id) {
      session = sessions.get(id)
      // The MCP way to say "start again": the client opens a new session and gets a new practice vault.
      if (!session) return jsonError(404, 'This practice session has ended (idle for 30 minutes, or the server restarted). Start a new one.')
    } else {
      if (!isInitialize(body)) return jsonError(400, 'Start with an initialize request; this server keeps one practice vault per session.')
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
    }
    session.lastUsed = now()
    const replay = new Request(request.url, { method: 'POST', headers: request.headers, body: text })
    return withCors(await session.transport.handleRequest(replay, { parsedBody: body }))
  }

  return {
    handle,
    get size() {
      return sessions.size
    },
  }
}
