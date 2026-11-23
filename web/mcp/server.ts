// HARDSTOP as an MCP server: any AI assistant that speaks MCP can spend
// through a HARDSTOP vault as its agent, and can do nothing else.
//
// Run from web/, with the HARDSTOP_* variables set (see mcp/README.md):
//   node mcp/server.ts                       stdio, for clients that start it themselves
//   node mcp/server.ts --http --port 8787    Streamable HTTP at http://127.0.0.1:8787/mcp
//   HARDSTOP_FAKE=1 node mcp/server.ts       a demo on an in-memory network (or: --demo)
//   node mcp/server.ts --tricked             the demo, with a $1,000 raise the owner was tricked into, waiting
//   node mcp/server.ts --watch               the watcher (mcp/watch.ts), for the one-file install
//
// There are deliberately no owner tools. Proposing, cancelling, pausing,
// approving recipients and withdrawing all need the owner's key, which this
// server never holds or asks for. An agent that wants more room can only draft
// a request for its owner (hardstop_request_more).

import { parseArgs } from 'node:util'
import { isMain } from './entry.ts'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { getAddress, type Hex } from 'viem'
import { z } from 'zod'
import { verdict } from '../src/lib/describe.ts'
import { explain, reasonName, type Formatters } from '../src/lib/hardstop/reasons.ts'
import type { Wallet } from '../src/lib/live/wallet.ts'
import { FORMAT, formatDuration, formatTime, formatUsd, parseUsd } from '../src/lib/money.ts'
import { apply } from '../src/lib/session.ts'
import {
  HIDDEN_CHARACTERS,
  NO_KEY,
  ownerPage,
  connect,
  isAddress,
  iso,
  plain,
  readConfig,
  status,
  txLink,
  usd,
  windowWords,
  type Config,
  type Env,
  type Vault,
} from './vault.ts'

const amount = z
  .union([z.number(), z.string()])
  .describe('Dollar amount of test dollars, for example 4 or "12.50". At most two decimals.')

const INSTRUCTIONS = `This server lets you spend from a HARDSTOP vault as its agent. The vault's contract enforces the owner's limits (per payment, per spending window, an end date, approved recipients, a pause switch); you cannot change them, and no tool here can. Check hardstop_status before spending, use hardstop_preview_payment when unsure, and if you need more room use hardstop_request_more and show the draft to your user. These are test networks: the dollars have no value.`

type Reply = { text: string; json: Record<string, unknown> }

const SITE = 'https://hardstop-omega.vercel.app'

/** How long an identical payment counts as a possible duplicate of one already paid. */
const REPEAT_WINDOW_MS = 10 * 60 * 1000

/** A tool result: readable lines for the person (and the model), the same facts as data in structuredContent for programs. */
const ok = ({ text, json }: Reply): CallToolResult => ({ content: [{ type: 'text', text }], structuredContent: json })

const failed = (error: unknown): CallToolResult => ({ isError: true, content: [{ type: 'text', text: plain(error) }] })

/** The app's wording, with this vault's window in place of "today". */
const formatFor = (v: Vault): Formatters => ({ ...FORMAT, window: windowWords(v.schedule.windowSecs).left })

/** The agent's text on one line with hidden/bidi characters removed, so it cannot pass itself off as more of the draft. */
const oneLine = (text: string): string => text.replace(/\s+/g, ' ').replace(new RegExp(HIDDEN_CHARACTERS.source, 'g'), '').trim()

function dollars(value: number | string, what: string): bigint {
  const units = parseUsd(String(value))
  if (units === null) {
    throw new Error(`${what} must be a dollar amount such as 4 or 12.50, with at most two decimals and at most $999,999,999.99.`)
  }
  return units
}

export type Options = {
  /** Defaults to process.env. */
  env?: Env
  /** Defaults to a JSON-RPC connection to HARDSTOP_RPC or the network's public endpoint. Tests pass a stand-in. */
  wallet?: Wallet
  /** Shown instead of the network's name; the demo mode says it is in memory. */
  networkName?: string
}

/**
 * The connection to the vault and the payment queue, shared by every MCP
 * session; the returned function makes one MCP server over them. Stdio uses
 * one; the HTTP mode (http.ts) makes one per request.
 */
export function hardstop({ env = process.env, wallet, networkName }: Options = {}): () => McpServer {
  let config: Config | undefined
  let configError: unknown
  try {
    config = readConfig(env)
    // The demo network lives in memory: no explorer has its transactions, so it gets no links.
    if (networkName) config = { ...config, demo: true, network: { ...config.network, name: networkName, explorer: '' } }
  } catch (error) {
    configError = error
  }

  let connecting: Promise<Vault> | undefined
  /** The vault, connected once; a failed attempt is forgotten so the next call tries again. */
  const vault = (): Promise<Vault> => {
    if (!config) return Promise.reject(configError)
    if (!config.agentKey) return Promise.reject(new Error(NO_KEY))
    connecting ??= connect(config, wallet).catch((error: unknown) => {
      connecting = undefined
      throw error
    })
    return connecting
  }

  /** Payments go one at a time, so a default request number is never used twice. */
  let line: Promise<unknown> = Promise.resolve()
  const oneAtATime = <T>(work: () => Promise<T>): Promise<T> => {
    const next = line.then(work)
    line = next.catch(() => undefined)
    return next
  }

  // Payments already made, by recipient and amount, so that a retry after a lost reply is not paid again.
  const recentlyPaid = new Map<string, { at: number; nonce: bigint; tx?: Hex }>()
  const payKey = (to: Hex, units: bigint) => to.toLowerCase() + '|' + units
  /** Why this payment must not be sent now, as the reply to give, or undefined to go ahead. */
  const notSendable = (to: Hex, name: string | undefined, units: bigint, repeat: boolean, signal: AbortSignal): Reply | undefined => {
    const held = (reason: string, sentence: string): Reply => ({
      text: `⏸️ Not sent: ${formatUsd(units)} to ${name ?? to}. ${sentence}
No transaction was sent.`,
      json: { paid: false, result: 'not_sent', reason, explanation: sentence, to, amount_usd: usd(units), nonce: null, left_today_usd: null, transaction: null, explorer: null },
    })
    if (signal.aborted) return held('Cancelled', 'The request was cancelled before anything was sent.')
    const last = recentlyPaid.get(payKey(to, units))
    if (repeat || !last || Date.now() - last.at > REPEAT_WINDOW_MS) return undefined
    const ago = Math.max(1, Math.round((Date.now() - last.at) / 1000))
    return held(
      'PossibleDuplicate',
      `This exact payment was already paid ${ago} second${ago === 1 ? '' : 's'} ago (request ${last.nonce}${last.tx ? ', transaction ' + last.tx : ''}). If a reply was lost, it went through. To pay it again on purpose, call hardstop_pay with repeat: true.`,
    )
  }

  const run = async (work: (v: Vault) => Promise<Reply>): Promise<CallToolResult> => {
    try {
      return ok(await work(await vault()))
    } catch (error) {
      return failed(error)
    }
  }

  /** An address, or the name of a recipient listed in HARDSTOP_RECIPIENTS. */
  const resolve = (v: Vault, to: string): { address: Hex; name?: string } => {
    const named = v.config.recipients.find((r) => r.name.toLowerCase() === to.trim().toLowerCase())
    if (named) return { address: named.address, name: named.name }
    if (isAddress(to.trim())) {
      const typed = to.trim()
      // Mixed case is a checksum (EIP-55): one that does not match is a mistyped address.
      if (typed.slice(2) !== typed.slice(2).toLowerCase() && typed.slice(2) !== typed.slice(2).toUpperCase() && getAddress(typed) !== typed) {
        throw new Error(`"${typed}" has a checksum that does not match: a character is probably mistyped. Check the address, or write it all in lower case.`)
      }
      const address = typed.toLowerCase() as Hex
      return { address, name: v.config.recipients.find((r) => r.address === address)?.name }
    }
    throw new Error(`"${oneLine(to).slice(0, 60)}" is neither an address (0x followed by 40 hex characters) nor a recipient name this server knows. hardstop_recipients lists the names it knows.`)
  }

  return (): McpServer => {
    const server = new McpServer(
      {
        name: 'hardstop',
        title: 'HARDSTOP',
        version: '0.1.2',
        websiteUrl: SITE,
        // The site's own mark, for clients that show a server's icon.
        icons: [
          { src: `${SITE}/icon.svg`, mimeType: 'image/svg+xml', sizes: ['any'] },
          { src: `${SITE}/apple-icon.png`, mimeType: 'image/png', sizes: ['180x180'] },
        ],
      },
      { instructions: INSTRUCTIONS },
    )

    server.registerTool(
      'hardstop_status',
      {
        title: 'HARDSTOP vault status',
        description:
          'Read the spending limits in force for you (per payment, per spending window, end date, paused or not), how much you have spent and have left in the current window and when it resets, the vault balance, your ETH left for network fees, any rule change waiting to take effect, and the worst case you could spend over the next window as computed by the contract. The window is window_secs long: a day when it is 86400, and the fields named per_day, today and 24h then mean exactly that; otherwise they mean the window. Changes nothing. Call this before planning any spending.',
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      () => run(status),
    )

    server.registerTool(
      'hardstop_preview_payment',
      {
        title: 'Preview a payment',
        description:
          'Ask the vault what it would answer right now to a payment of amount_usd to `to`, without sending anything and without spending gas. Returns allowed or refused and the reason in plain words. Use it when you are not sure a payment fits the limits. `to` is an address or the name of a known recipient.',
        inputSchema: { to: z.string().describe('Recipient address (0x...) or the name of a known recipient.'), amount_usd: amount },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      ({ to, amount_usd }) =>
        run(async (v) => {
          const recipient = resolve(v, to)
          const units = dollars(amount_usd, 'amount_usd')
          await v.chain.refresh(true)
          const { ledger } = await v.sim.state()
          const answer = await v.sim.preview(recipient.address, units, ledger.nextNonce)
          const said = explain(answer.code, answer.detail, formatFor(v))
          return {
            text: `${said.allowed ? '✅ Would be paid' : '⛔ Would be refused'}: ${formatUsd(units)} to ${recipient.name ?? recipient.address}. ${said.sentence} Nothing was sent.`,
            json: {
              would_pay: said.allowed,
              reason: said.name,
              explanation: said.sentence,
              to: recipient.address,
              amount_usd: usd(units),
              nonce: ledger.nextNonce.toString(),
            },
          }
        }),
    )

    server.registerTool(
      'hardstop_pay',
      {
        title: 'Pay from the vault',
        description:
          'Ask the vault to pay amount_usd to `to`, signed with your agent key. The contract decides: it pays if every limit allows it and refuses otherwise. A refusal is still recorded on the network (so the owner sees it) and costs a small network fee; use hardstop_preview_payment first if unsure. Returns result paid, refused, reverted (sent and mined, but undone by the network: nothing was paid) or not_sent (no transaction left this server), the reason in plain words, what is left in the current spending window, and a link to the transaction. Leave nonce out unless told otherwise; it defaults to the next request number. The same payment (same recipient and amount) already paid in the last 10 minutes is not sent again unless repeat is true, so a retry after a lost reply cannot pay twice; a request you cancel before it is sent is not sent.',
        inputSchema: {
          to: z.string().describe('Recipient address (0x...) or the name of a known recipient.'),
          amount_usd: amount,
          nonce: z.number().int('nonce must be a whole number from 0 to 9007199254740991.').min(0, 'nonce must be a whole number from 0 to 9007199254740991.').optional().describe('Request number. Defaults to the next one the vault expects.'),
          repeat: z.boolean().optional().describe('Set true only to pay the same recipient the same amount again within 10 minutes, on purpose.'),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      ({ to, amount_usd, nonce, repeat }, extra) =>
        run((v) =>
          oneAtATime(async () => {
            const recipient = resolve(v, to)
            const units = dollars(amount_usd, 'amount_usd')
            if (units === 0n) throw new Error('amount_usd must be more than zero: the vault never pays nothing. Nothing was sent.')
            const held = notSendable(recipient.address, recipient.name, units, repeat === true, extra.signal)
            if (held) {
              if (held.json.reason !== 'PossibleDuplicate') return held
              // Before advising a deliberate repeat, check that the vault would pay it now.
              await v.chain.refresh(true)
              const { ledger } = await v.sim.state()
              const answer = await v.sim.preview(recipient.address, units, ledger.nextNonce)
              const would = explain(answer.code, answer.detail, formatFor(v))
              if (answer.code === 0) return held
              const sentence = `${(held.json as { explanation: string }).explanation.replace(' To pay it again on purpose, call hardstop_pay with repeat: true.', '')} Paying it again now would be refused anyway: ${would.sentence}`
              return { text: held.text.replace((held.json as { explanation: string }).explanation, sentence), json: { ...held.json, explanation: sentence } }
            }
            if ((await v.chain.agentGas()) === 0n) {
              throw new Error(
                `The agent ${v.sim.agent} has no ETH left to pay network fees on ${v.config.network.name}, so nothing was sent. Ask the owner to send it a little test ETH.`,
              )
            }
            await v.chain.refresh(true)
            const number = nonce === undefined ? (await v.sim.state()).ledger.nextNonce : BigInt(nonce)
            // Checked again just before sending: the client may have given up while this waited.
            const late = notSendable(recipient.address, recipient.name, units, repeat === true, extra.signal)
            if (late) return late
            const entry = await apply(v.sim, { type: 'pay', to: recipient.address, amount: units.toString(), nonce: number.toString() }, 0)
            if (entry.kind !== 'payment') throw new Error('The vault answered something other than a payment.')
            const said = verdict(entry, formatFor(v))
            const paid = said.tone === 'paid'
            if (paid) recentlyPaid.set(payKey(recipient.address, units), { at: Date.now(), nonce: number, tx: entry.outcome.tx })
            // A transaction that was mined and reverted was sent; only one that never left was not.
            const result = paid ? 'paid' : said.tone === 'blocked' ? 'refused' : entry.outcome.tx ? 'reverted' : 'not_sent'
            const label = { paid: '✅ Paid', refused: '⛔ Refused', reverted: '⚠️ Sent, reverted (nothing was paid)', not_sent: '⏸️ Not sent' }[result]
            const link = entry.outcome.tx && v.config.network.explorer ? txLink(v.config.network, entry.outcome.tx) : undefined
            const lines = [
              `${label}: ${formatUsd(units)} to ${recipient.name ?? recipient.address}. ${said.sentence}`,
              `Left ${windowWords(v.schedule.windowSecs).left}: ${formatUsd(entry.leftToday)}.`,
              link
                ? `Transaction: ${link}`
                : entry.outcome.tx
                  ? 'Recorded on the in-memory demo network, which no explorer can show.'
                  : 'No transaction was sent.',
            ]
            return {
              text: lines.join('\n'),
              json: {
                paid,
                result,
                reason: entry.outcome.code === undefined ? (entry.outcome.revert ?? null) : reasonName(entry.outcome.code),
                explanation: said.sentence,
                to: recipient.address,
                amount_usd: usd(units),
                nonce: number.toString(),
                left_today_usd: usd(entry.leftToday),
                transaction: entry.outcome.tx ?? null,
                explorer: link ?? null,
              },
            }
          }),
        ),
    )

    server.registerTool(
      'hardstop_recipients',
      {
        title: 'Approved recipients',
        description:
          'List the recipients this server knows by name (from its configuration) and whether the vault will pay each one: approved now, approved from a later time (a waiting period after the owner adds one), or not approved. The vault can only pay approved recipients. Changes nothing.',
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      () =>
        run(async (v) => {
          await v.chain.refresh(true)
          const now = v.chain.now
          const rows = []
          const lines = []
          for (const r of v.config.recipients) {
            // The contract answers 0 for a recipient that is not approved.
            const from = await v.sim.approvedFrom(r.address)
            const state = from === 0n ? 'not_approved' : from <= now ? 'approved' : 'waiting'
            rows.push({ ...r, state, approved_from: from === 0n ? null : iso(from) })
            const words = state === 'approved' ? 'approved' : state === 'waiting' ? `approved from ${formatTime(from)}` : 'not approved'
            lines.push(`${{ approved: '✅', waiting: '⏳', not_approved: '⛔' }[state]} ${r.name} (${r.address}): ${words}`)
          }
          const text = lines.length
            ? lines.join('\n')
            : 'This server was given no recipient names (HARDSTOP_RECIPIENTS is empty). You can still pay an address the owner approved; hardstop_preview_payment tells you whether it is approved.'
          return { text, json: { recipients: rows } }
        }),
    )

    server.registerTool(
      'hardstop_request_more',
      {
        title: 'Ask the owner for more room',
        description:
          'Draft a request to the vault owner for higher limits, with your reason. This changes nothing and sends nothing: only the owner can loosen the rules, from their own wallet, and looser rules wait out a cooling period. Show the returned text to your user so they can pass it to the owner.',
        inputSchema: {
          reason: z.string().min(1).max(1000).describe('Why you need more, in a sentence or two.'),
          per_payment_usd: amount.optional().describe('The per-payment limit you are asking for, in dollars.'),
          per_day_usd: amount.optional().describe('The limit per spending window you are asking for, in dollars (per day for a vault with a one-day window).'),
          recipient: z.string().optional().describe('An address (0x...) you need the owner to approve, if any.'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      ({ reason, per_payment_usd, per_day_usd, recipient }) =>
        run(async (v) => {
          const cleanReason = oneLine(reason)
          if (!cleanReason) throw new Error('reason cannot be blank. Say why you need more, in a sentence or two.')
          const perPayment = per_payment_usd === undefined ? undefined : dollars(per_payment_usd, 'per_payment_usd')
          const perDay = per_day_usd === undefined ? undefined : dollars(per_day_usd, 'per_day_usd')
          const wanted = recipient === undefined ? undefined : resolve(v, recipient)
          const { policy, schedule } = await v.sim.state()
          // Asking for the same or less is not a request: the owner can lower a limit at once, and nothing is needed to keep one.
          for (const [asked, now, what] of [[perPayment, policy.perPayment, 'per_payment_usd'], [perDay, policy.perWindow, 'per_day_usd']] as const) {
            if (asked !== undefined && asked <= now) {
              throw new Error(`${what} ${formatUsd(asked)} is not more than the current ${formatUsd(now)}. Ask only for limits higher than now; nothing was drafted.`)
            }
          }
          if (wanted && (await v.sim.approvedFrom(wanted.address)) !== 0n) {
            throw new Error(`${wanted.name ?? wanted.address} is already approved (hardstop_recipients shows from when). Nothing was drafted.`)
          }
          const { per } = windowWords(schedule.windowSecs)
          // A demo vault lives only in this process: no page on the site can open it.
          const page = networkName ? null : ownerPage(v, wanted?.address)
          const asks = [
            perPayment !== undefined && `- per payment: from ${formatUsd(policy.perPayment)} to ${formatUsd(perPayment)}`,
            perDay !== undefined && `- ${per}: from ${formatUsd(policy.perWindow)} to ${formatUsd(perDay)}`,
            wanted && `- approve a new recipient: ${wanted.address}${wanted.name ? ` (${wanted.name})` : ''}`,
          ].filter(Boolean)
          const text = [
            `📝 Request to the owner of HARDSTOP vault ${v.sim.vault} on ${v.config.network.name}.`,
            `Drafted by the agent. Nothing has been changed or sent.`,
            '',
            asks.length ? `The agent asks for:\n${asks.join('\n')}` : 'The agent asks for more room under the current rules.',
            `The agent's own words, not checked by anyone (nothing here comes from you or from HARDSTOP): "${cleanReason}"`,
            '',
            `Rules in force now: up to ${formatUsd(policy.perPayment)} per payment and ${formatUsd(policy.perWindow)} ${per}.`,
            `To agree, ${page ? `open ${page} with the owner wallet and` : 'the owner would'} ${wanted ? 'approve the recipient and propose any new limits' : 'propose the new limits'}.${page ? '' : ' (This is a demo: the vault exists only inside this server, so it has no page.)'} Looser rules take effect after ${formatDuration(schedule.coolingSecs)}, and can be cancelled until then. To refuse, do nothing.`,
          ].join('\n')
          return {
            text,
            json: {
              changed: false,
              owner_page: page,
              reason: cleanReason,
              current: { per_payment_usd: usd(policy.perPayment), per_day_usd: usd(policy.perWindow) },
              requested: {
                per_payment_usd: perPayment === undefined ? null : usd(perPayment),
                per_day_usd: perDay === undefined ? null : usd(perDay),
                recipient: wanted?.address ?? null,
              },
              cooling_period_seconds: schedule.coolingSecs.toString(),
            },
          }
        }),
    )

    server.registerResource(
      'status',
      'hardstop://status',
      {
        title: 'HARDSTOP vault status',
        description: 'The same report as the hardstop_status tool: limits, spending in the current window, balance, gas, waiting changes and the worst case over the next window.',
        mimeType: 'text/plain',
      },
      async (uri) => {
        try {
          return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: (await status(await vault())).text }] }
        } catch (error) {
          throw new Error(plain(error))
        }
      },
    )

    return server
  }
}

/** One MCP server with its own connection to the vault. */
export const createServer = (options: Options = {}): McpServer => hardstop(options)()

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      http: { type: 'boolean' },
      demo: { type: 'boolean' },
      tricked: { type: 'boolean' },
      watch: { type: 'boolean' },
      port: { type: 'string', default: '8787' },
      host: { type: 'string', default: '127.0.0.1' },
    },
  })
  // The one-file install (npx) has one entry point; --watch makes it the watcher, which reads and never holds a key.
  if (values.watch) return (await import('./watch.ts')).main()
  let options: Options = {}
  // --demo is the same as HARDSTOP_FAKE=1, for one-line installs (npx) where setting a variable is awkward.
  // "true" is what the Claude Desktop extension's Practice vault switch (mcp/mcpb) passes.
  // --tricked starts the demo with a $1,000 raise the owner was talked into: it waits, and the agent is still refused.
  if (process.env.HARDSTOP_FAKE === '1' || process.env.HARDSTOP_FAKE === 'true' || values.demo || values.tricked) {
    const { demo, DEMO_NAME } = await import('./demo.ts')
    options = { ...(await demo({ trickedRaise: values.tricked === true })), networkName: DEMO_NAME }
    process.stderr.write('hardstop: demo mode, an in-memory network with a freshly launched vault. Nothing is real.\n')
  } else {
    try {
      readConfig(process.env)
    } catch (error) {
      // Still start, so the assistant can relay the problem; but say it where a person running this can see it.
      process.stderr.write(`hardstop: ${plain(error)}\n`)
    }
  }

  if (!values.http) {
    await createServer(options).connect(new StdioServerTransport())
    return
  }
  const port = Number(values.port)
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('--port must be a whole number from 0 to 65535.')
  const token = process.env.HARDSTOP_HTTP_TOKEN?.trim() || undefined
  const { startHttp } = await import('./http.ts')
  const server = await startHttp({ ...options, port, host: values.host, token })
  const address = server.address()
  const bound = typeof address === 'object' && address ? `${values.host}:${address.port}` : `${values.host}:${port}`
  process.stderr.write(
    `hardstop: MCP over Streamable HTTP at http://${bound}/mcp${token ? ' (token required)' : ' (localhost only; set HARDSTOP_HTTP_TOKEN before exposing it)'}\n`,
  )
  const stop = () => server.close(() => process.exit(0))
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

if (isMain(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`hardstop: ${plain(error)}\n`)
    process.exit(1)
  })
}
