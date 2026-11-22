// A 24/7 watcher for a HARDSTOP vault. It only reads: it needs the vault
// address and a network, never a key. Every few seconds it asks the vault
// what changed and reports:
//
//   - a looser rule waiting out its cooling period (the moment to cancel it if
//     the owner did not ask for it), and when it takes effect or is cancelled;
//     also one proposed and withdrawn, or already in force, between two checks
//     (read from the vault's PolicyProposed and QueueCancelled events);
//   - every payment and every refusal, from the vault's own events;
//   - a pause or resume, other rule changes, recipients added or removed;
//   - the end date approaching, and passing.
//
// Each alert is one line of JSON on stdout, optionally POSTed to
// HARDSTOP_ALERT_WEBHOOK and shown as a desktop notification
// (HARDSTOP_DESKTOP_NOTIFY=1).
//
// Run: node mcp/watch.ts   (from web/; see mcp/README.md)

import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { isMain } from './entry.ts'
import type { Hex } from 'viem'
import { explain, type Formatters } from '../src/lib/hardstop/reasons.ts'
import type { Log } from '../src/lib/hardstop/chain.ts'
import { decodeEvents, type Policy, type Queued, type State, type VaultEvent } from '../src/lib/hardstop/sim.ts'
import type { Wallet } from '../src/lib/live/wallet.ts'
import { FORMAT, formatDuration, formatTime, formatUsd } from '../src/lib/money.ts'
import {
  DAY,
  OWNER_PAGE,
  ownerPage,
  Refused,
  connect,
  describePolicy,
  iso,
  plain,
  policyJson,
  readConfig,
  txLink,
  usd,
  windowWords,
  type Config,
  type Env,
  type Vault,
} from './vault.ts'

export type Alert = { kind: string; at: string; vault: Hex; message: string } & Record<string, unknown>

/** Most blocks asked for in one eth_getLogs; public RPCs limit the range. A watcher that fell behind asks several times in one check. */
const MAX_BLOCKS = 1_000n
/** Most eth_getLogs requests in one check. A watcher far behind catches up over several checks, so the alerts from the vault's rules (a raise waiting) are never held up by a long backlog. */
const MAX_RANGES_PER_CHECK = 8
/** Seconds per block, to turn the cooling period into a number of blocks to look back at start. Unknown chains (the test network) count one second. */
const BLOCK_SECS: Record<number, bigint> = { 84532: 2n, 11155111: 12n }
/** Longest wait between attempts while the network is failing; never more than half the vault's cooling period either. */
const MAX_BACKOFF_SECS = 600

type RawLog = Log & { transactionHash?: Hex }

const sameRules = (a: Policy, b: Policy) =>
  a.perPayment === b.perPayment && a.perWindow === b.perWindow && a.validUntil === b.validUntil && a.paused === b.paused
const sameQueued = (a: Queued | null, b: Queued | null) =>
  a === b || (a !== null && b !== null && sameRules(a, b) && a.effectiveAt === b.effectiveAt)
/** One queued loosening, as the contract identifies it: the rules and the second they take effect. */
const queuedKey = (q: Queued) => [q.perPayment, q.perWindow, q.validUntil, q.paused, q.effectiveAt].join()

export class Watcher {
  private last: State | undefined
  private nextBlock: bigint | undefined
  private readonly warned = new Set<string>()
  /** Every queued loosening already reported, from the vault's state or its events. */
  private readonly seen = new Set<string>()
  private readonly vault: Vault
  private readonly warnSecs: bigint
  /** Where a previous run stopped (HARDSTOP_WATCH_CURSOR), if known. */
  private readonly resumeAt: bigint | undefined
  /** Blocks asked for in one eth_getLogs; halved each time the network refuses a range. */
  private span = MAX_BLOCKS
  /** The latest block at the first look: events up to it happened before this run, so are catch-up. */
  private catchUpTo: bigint | undefined
  /** The last look could not read every event range. */
  private eventsFailing = false

  constructor(vault: Vault, warnSecs = 3n * DAY, resumeAt?: bigint) {
    this.vault = vault
    this.warnSecs = warnSecs
    this.resumeAt = resumeAt
  }

  /** The first block the next look will read: save it to resume there after a restart. */
  get cursor(): bigint | undefined {
    return this.nextBlock
  }

  /**
   * One look at the vault. Returns what is new since the last look; the first
   * look reports what is already true (a waiting change, a near end date) and
   * what happened while no watcher was running: the vault's events from one
   * cooling period back, or from where the previous run stopped if that is
   * earlier. Those are marked `catch_up`. Nothing is remembered unless the
   * whole look succeeds, so a failed look is simply repeated.
   */
  async check(): Promise<Alert[]> {
    const { sim, chain, wallet } = this.vault
    await chain.refresh(true)
    const state = await sim.state()
    const latest = BigInt((await wallet.request({ method: 'eth_blockNumber' })) as Hex)

    const alerts: Alert[] = []
    let from = this.nextBlock
    if (from === undefined) {
      alerts.push(this.alert('watching', `Watching vault ${sim.vault} on ${this.vault.config.network.name}. Rules in force: ${this.describe(state.policy)}.`, { rules: policyJson(state.policy) }))
      const lookback = this.vault.schedule.coolingSecs / (BLOCK_SECS[this.vault.config.network.chainId] ?? 1n) + 1n
      from = latest > lookback ? latest - lookback : 0n
      if (this.resumeAt !== undefined && this.resumeAt < from) from = this.resumeAt
    }
    const catchUpTo = this.catchUpTo ?? latest

    // The events, a range at a time. A range the network refuses (a public RPC
    // limits how many logs one query returns) ends the reading for this look:
    // what was read is reported, the rest is read next time with half the
    // range, and the alerts from the state below still go out.
    const events: { event: VaultEvent; tx: Record<string, unknown> }[] = []
    let next = from
    let unreadable: unknown
    for (let ranges = 0; next <= latest && ranges < MAX_RANGES_PER_CHECK; ranges++) {
      const to = latest < next + this.span - 1n ? latest : next + this.span - 1n
      let logs: RawLog[]
      try {
        logs = (await wallet.request({
          method: 'eth_getLogs',
          params: [{ address: sim.vault, fromBlock: `0x${next.toString(16)}`, toBlock: `0x${to.toString(16)}` }],
        })) as RawLog[]
      } catch (error) {
        unreadable = error
        if (this.span > 1n) this.span /= 2n
        break
      }
      // A range the network answered: the next one may be larger again, up to the most a public RPC allows.
      if (this.span < MAX_BLOCKS) this.span = this.span * 2n > MAX_BLOCKS ? MAX_BLOCKS : this.span * 2n
      const catchUp = next <= catchUpTo
      for (const log of logs) for (const e of this.decode(log)) events.push(catchUp ? { ...e, tx: { ...e.tx, catch_up: true } } : e)
      next = to + 1n
    }

    for (const { event, tx } of events) alerts.push(...this.fromEvent(event, tx))
    const seen: string[] = []
    const missed = this.fromProposals(events, state, seen)
    alerts.push(...missed.alerts)

    const warned: string[] = []
    alerts.push(...(await this.fromState(this.last, state, warned, seen, missed.inForce)))

    if (unreadable !== undefined && !this.eventsFailing) {
      alerts.push(
        this.alert(
          'events_unreadable',
          `The watcher cannot read the vault's events from block ${next}: ${plain(unreadable)} Payments, refusals and recipient changes are reported once they can be read; the rules are still checked every time.`,
          { from_block: next.toString() },
        ),
      )
    } else if (unreadable === undefined && this.eventsFailing) {
      alerts.push(this.alert('events_readable', "The watcher can read the vault's events again."))
    }

    this.eventsFailing = unreadable !== undefined
    this.catchUpTo = catchUpTo
    this.last = state
    this.nextBlock = next
    for (const key of warned) this.warned.add(key)
    for (const key of seen) this.seen.add(key)
    return alerts
  }

  private alert(kind: string, message: string, extra: Record<string, unknown> = {}): Alert {
    return { kind, at: iso(this.vault.chain.now), vault: this.vault.sim.vault, owner_page: ownerPage(this.vault), message, ...extra }
  }

  private name(address: Hex): string {
    return this.vault.config.recipients.find((r) => r.address === address)?.name ?? address
  }

  private get words() {
    return windowWords(this.vault.schedule.windowSecs)
  }

  private describe(policy: Policy): string {
    return describePolicy(policy, this.vault.schedule.windowSecs)
  }

  private decode(log: RawLog): { event: VaultEvent; tx: Record<string, unknown> }[] {
    const { network } = this.vault.config
    const tx = log.transactionHash ? { transaction: log.transactionHash, explorer: txLink(network, log.transactionHash) } : {}
    return decodeEvents({ ok: true, data: '0x', logs: [log], gasUsed: 0n }, this.vault.sim.vault).map((event) => ({ event, tx }))
  }

  private fromEvent(event: VaultEvent, tx: Record<string, unknown>): Alert[] {
    const format: Formatters = { ...FORMAT, window: this.words.left }
    switch (event.name) {
      case 'Paid':
        return [
          this.alert('paid', `Paid ${formatUsd(event.amount)} to ${this.name(event.to)} (request ${event.nonce}). ${formatUsd(event.leftInWindow)} left ${this.words.left}.`, {
            to: event.to,
            amount_usd: usd(event.amount),
            nonce: event.nonce.toString(),
            left_today_usd: usd(event.leftInWindow),
            ...tx,
          }),
        ]
      case 'Blocked': {
        const said = explain(event.code, event.detail, format)
        return [
          this.alert('refused', `Refused ${formatUsd(event.amount)} to ${this.name(event.to)} (request ${event.nonce}). ${said.sentence}`, {
            to: event.to,
            amount_usd: usd(event.amount),
            nonce: event.nonce.toString(),
            reason: said.name,
            ...tx,
          }),
        ]
      }
      case 'RecipientChanged':
        return event.approvedFrom === 0n
          ? [this.alert('recipient_removed', `${this.name(event.who)} was removed from the approved recipients.`, { who: event.who, ...tx })]
          : [
              this.alert(
                'recipient_approved',
                `${this.name(event.who)} was approved as a recipient; it can be paid from ${formatTime(event.approvedFrom)}. If the owner did not do this, remove it at ${ownerPage(this.vault, event.who)} before then.`,
                { who: event.who, approved_from: iso(event.approvedFrom), ...tx },
              ),
            ]
      case 'Withdrawn':
        return [this.alert('withdrawn', `The owner withdrew ${formatUsd(event.amount)} from the vault.`, { amount_usd: usd(event.amount), ...tx })]
      default:
        // PolicyProposed and QueueCancelled: see fromProposals. Rule changes are also read from the state.
        return []
    }
  }

  /**
   * Looser rules that were proposed since the last look and are no longer
   * waiting: cancelled or replaced in between, or already in force. The state
   * alone cannot show these (it only holds what is queued now), so they are
   * read from the vault's PolicyProposed and QueueCancelled events. Any later
   * proposal (a pause too) or a cancel ends a queued one.
   */
  private fromProposals(events: { event: VaultEvent; tx: Record<string, unknown> }[], cur: State, seen: string[]): { alerts: Alert[]; inForce: boolean } {
    const steps = events.filter(({ event }) => event.name === 'PolicyProposed' || event.name === 'QueueCancelled')
    const alerts: Alert[] = []
    let inForce = false
    steps.forEach(({ event, tx }, i) => {
      if (event.name !== 'PolicyProposed' || event.effectiveAt === 0n) return
      const proposed: Queued = { ...event.policy, effectiveAt: event.effectiveAt }
      const key = queuedKey(proposed)
      // Still waiting: reported from the state, with the worst case.
      if (this.seen.has(key) || seen.includes(key) || sameQueued(cur.queued, proposed)) return
      seen.push(key)
      const endedBy = steps[i + 1]?.event.name
      if (!endedBy && proposed.effectiveAt <= cur.now && sameRules(cur.policy, proposed)) {
        inForce = true
        alerts.push(
          this.alert(
            'loosening_in_force',
            `Looser rules were proposed and took effect before this watcher saw them waiting: ${this.describe(proposed)}, in force since ${formatTime(proposed.effectiveAt)}. If the owner did not ask for this, the owner key is compromised.`,
            { rules: policyJson(proposed), took_effect_at: iso(proposed.effectiveAt), unseen: true, ...tx },
          ),
        )
        return
      }
      alerts.push(
        this.alert(
          'loosening_withdrawn',
          `Looser rules were proposed and then ${endedBy === 'QueueCancelled' ? 'cancelled' : 'replaced'} between two checks: ${this.describe(proposed)}, to take effect ${formatTime(proposed.effectiveAt)}. Rules in force: ${this.describe(cur.policy)}. Only the owner's key can do this; if the owner did not, treat that key as compromised and move the funds out at ${ownerPage(this.vault)}.`,
          { proposed: policyJson(proposed), takes_effect_at: iso(proposed.effectiveAt), ended_by: endedBy === 'QueueCancelled' ? 'cancelled' : 'replaced', current: policyJson(cur.policy), ...tx },
        ),
      )
    })
    return { alerts, inForce }
  }

  private async fromState(prev: State | undefined, cur: State, warned: string[], seen: string[], explainedByEvents: boolean): Promise<Alert[]> {
    const alerts: Alert[] = []
    const { queued, policy } = cur
    const before = prev?.queued ?? null

    if (queued && !sameQueued(queued, before) && !this.seen.has(queuedKey(queued)) && !seen.includes(queuedKey(queued))) {
      seen.push(queuedKey(queued))
      // The contract queues only changes that loosen something; anything stricter applies at once.
      const worst = await this.vault.sim.exposure(queued.effectiveAt + this.vault.schedule.windowSecs)
      alerts.push(
        this.alert(
          'loosening_waiting',
          `Looser rules are waiting: ${this.describe(queued)} (now ${this.describe(policy)}). They take effect ${formatTime(queued.effectiveAt)}. In the ${this.words.span} after that the agent could have moved up to ${formatUsd(worst)}. If the owner did not ask for this, cancel it at ${ownerPage(this.vault)} before then.`,
          { proposed: policyJson(queued), current: policyJson(policy), takes_effect_at: iso(queued.effectiveAt), worst_case_usd: usd(worst) },
        ),
      )
    }

    let explained = explainedByEvents
    if (prev && before && !queued) {
      const inForce = sameRules(policy, before)
      explained ||= inForce
      alerts.push(
        inForce
          ? this.alert('loosening_in_force', `The waiting change is now in force: ${this.describe(policy)}.`, { rules: policyJson(policy) })
          : this.alert('loosening_cancelled', `The waiting change was cancelled. Rules in force: ${this.describe(policy)}.`, { rules: policyJson(policy) }),
      )
    }

    if (prev && !explained) {
      if (prev.policy.paused !== policy.paused) {
        alerts.push(
          policy.paused
            ? this.alert('paused', 'The agent is paused. The vault refuses every payment until the owner resumes it.')
            : this.alert('resumed', `The agent is no longer paused. Rules in force: ${this.describe(policy)}.`),
        )
      }
      const limits = (p: Policy) => [p.perPayment, p.perWindow, p.validUntil].join()
      if (limits(prev.policy) !== limits(policy)) {
        alerts.push(this.alert('rules_changed', `The rules changed: ${this.describe(policy)} (was ${this.describe(prev.policy)}).`, { rules: policyJson(policy), was: policyJson(prev.policy) }))
      }
    }

    const left = policy.validUntil - cur.now
    const key = (what: string) => `${what}:${policy.validUntil}`
    if (left <= 0n && !this.warned.has(key('expired'))) {
      warned.push(key('expired'))
      alerts.push(this.alert('expired', `The agent's permission ended ${formatTime(policy.validUntil)}. The vault refuses every payment.`, { valid_until: iso(policy.validUntil) }))
    } else if (left > 0n && left <= this.warnSecs && !this.warned.has(key('ending'))) {
      warned.push(key('ending'))
      alerts.push(
        this.alert('ending_soon', `The agent's permission ends ${formatTime(policy.validUntil)}. After that the vault refuses every payment unless the owner extends it.`, {
          valid_until: iso(policy.validUntil),
        }),
      )
    }
    return alerts
  }
}

// --- delivering alerts ---------------------------------------------------------

export type Deliver = (alert: Alert) => Promise<void>

/** stdout, plus the webhook and desktop notification when configured. */
export function deliverer(env: Env, write: (line: string) => void = (line) => process.stdout.write(line)): Deliver {
  const webhook = safeUrl(env.HARDSTOP_ALERT_WEBHOOK, 'HARDSTOP_ALERT_WEBHOOK', ' for alerts')
  const desktopOn = env.HARDSTOP_DESKTOP_NOTIFY === '1'
  const ntfy = safeUrl(env.HARDSTOP_ALERT_NTFY, 'HARDSTOP_ALERT_NTFY', ' of an ntfy topic, such as https://ntfy.sh/<a long, secret topic name>')
  return async (alert) => {
    write(`${JSON.stringify(alert)}\n`)
    if (desktopOn) desktop(`HARDSTOP: ${alert.kind.replace(/_/g, ' ')}`, alert.message)
    if (ntfy) await push(ntfy, alert)
    if (!webhook) return
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(alert),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) warn(`the webhook answered HTTP ${response.status}.`)
    } catch (error) {
      warn(`could not reach the webhook: ${plain(error)}`)
    }
  }
}

const warn = (text: string) => process.stderr.write(`hardstop-watch: ${text}\n`)

/** Alerts the owner must act on before a cooling period ends: pushed as urgent, with a link to where they can. */
const ACT_NOW = new Set(['loosening_waiting', 'loosening_withdrawn', 'loosening_in_force', 'recipient_approved'])

/** Checks an alert destination address: https anywhere, or http only to this machine. */
function safeUrl(text: string | undefined, envName: string, what: string): URL | undefined {
  const value = text?.trim()
  if (!value) return undefined
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${envName} must be an https address${what}.`)
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error(`${envName} must be an https address (http is allowed only to this machine).`)
  }
  return url
}

/** One phone notification through ntfy: the message as plain text, a title, and a priority. Best effort, like the webhook. */
async function push(url: URL, alert: Alert): Promise<void> {
  const urgent = ACT_NOW.has(alert.kind)
  const headers: Record<string, string> = {
    'content-type': 'text/plain; charset=utf-8',
    title: `HARDSTOP: ${alert.kind.replace(/_/g, ' ')}`,
    priority: urgent ? 'urgent' : 'default',
    tags: urgent ? 'warning' : 'moneybag',
  }
  if (urgent) headers.click = typeof alert.owner_page === 'string' ? alert.owner_page : OWNER_PAGE
  try {
    const response = await fetch(url, { method: 'POST', headers, body: alert.message, signal: AbortSignal.timeout(10_000) })
    if (!response.ok) warn(`ntfy answered HTTP ${response.status}.`)
  } catch (error) {
    warn(`could not reach ntfy: ${plain(error)}`)
  }
}

const WINDOWS_TOAST = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$n = $t.GetElementsByTagName('text')
$n.Item(0).AppendChild($t.CreateTextNode($env:HARDSTOP_NOTE_TITLE)) | Out-Null
$n.Item(1).AppendChild($t.CreateTextNode($env:HARDSTOP_NOTE_BODY)) | Out-Null
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($t))
`

/** Best effort. The text travels in environment variables, never through a shell, and the agent key is not passed on. */
function desktop(title: string, body: string): void {
  const env: NodeJS.ProcessEnv = { ...process.env, HARDSTOP_NOTE_TITLE: title, HARDSTOP_NOTE_BODY: body }
  delete env.HARDSTOP_AGENT_KEY
  const [command, args]: [string, string[]] =
    process.platform === 'win32'
      ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_TOAST]]
      : process.platform === 'darwin'
        ? ['osascript', ['-e', 'display notification (system attribute "HARDSTOP_NOTE_BODY") with title (system attribute "HARDSTOP_NOTE_TITLE")']]
        : ['notify-send', ['--', title, body]]
  execFile(command, args, { env, timeout: 15_000, windowsHide: true }, (error) => {
    if (error) warn(`desktop notification failed: ${plain(error)}`)
  })
}

// --- the loop ----------------------------------------------------------------

export type WatchOptions = {
  everySecs: number
  signal: AbortSignal
  deliver: Deliver
  /** Tests pass the stand-in network; otherwise a JSON-RPC connection is made from the config. */
  wallet?: Wallet
  warnSecs?: bigint
  /** Run even when checks are further apart than half the cooling period. Unsafe: see intervalProblem. */
  unsafeInterval?: boolean
  /** A file holding the next block to read (HARDSTOP_WATCH_CURSOR), so a restart resumes where the last run stopped. */
  cursorFile?: string
}

/**
 * A looser rule takes effect one cooling period after it is proposed. Checking
 * at least twice in that time is what lets the watcher warn while it can still
 * be cancelled. Returns why `everySecs` is too slow for this vault, if it is.
 */
export function intervalProblem(coolingSecs: bigint, everySecs: number): string | undefined {
  const most = Math.floor(Number(coolingSecs) / 2)
  if (everySecs <= most) return undefined
  return `This vault's cooling period is ${formatDuration(coolingSecs)}: a looser rule takes effect that long after it is proposed. Checking every ${everySecs} seconds could miss it while it can still be cancelled. Set HARDSTOP_WATCH_SECS to ${most} or less (half the cooling period). HARDSTOP_WATCH_UNSAFE=1 runs anyway, but then a loosening can take effect before you are warned.`
}

/**
 * Checks the vault until `signal` is aborted. Network failures are reported
 * once, then retried with growing waits, never longer than half the cooling
 * period. A vault the watcher must not trust, or a check interval too slow for
 * it, stops it with an error instead.
 */
export async function watch(config: Config, { everySecs, signal, deliver, wallet, warnSecs, unsafeInterval = false, cursorFile }: WatchOptions): Promise<void> {
  const sleep = (secs: number) => delay(secs * 1000, undefined, { signal }).catch(() => undefined)
  let watcher: Watcher | undefined
  let maxBackoff = MAX_BACKOFF_SECS
  let failures = 0
  while (!signal.aborted) {
    try {
      if (!watcher) {
        const vault = await connect(config, wallet)
        const problem = intervalProblem(vault.schedule.coolingSecs, everySecs)
        if (problem && !unsafeInterval) throw new Refused(problem)
        if (problem) warn(`UNSAFE (HARDSTOP_WATCH_UNSAFE=1): ${problem}`)
        maxBackoff = Math.min(MAX_BACKOFF_SECS, Math.floor(Number(vault.schedule.coolingSecs) / 2))
        watcher = new Watcher(vault, warnSecs, cursorFile ? await readCursor(cursorFile) : undefined)
      }
      const alerts = await watcher.check()
      for (const alert of alerts) await deliver(alert)
      if (cursorFile && watcher.cursor !== undefined) await writeFile(cursorFile, `${watcher.cursor}
`)
      if (failures > 0) {
        await deliver({ kind: 'watch_recovered', at: new Date().toISOString(), vault: config.vault, message: 'The watcher can reach the vault again.' })
        failures = 0
      }
      await sleep(everySecs)
    } catch (error) {
      if (signal.aborted) break
      if (error instanceof Refused) throw error
      failures += 1
      const wait = Math.min(everySecs * 2 ** failures, maxBackoff)
      if (failures === 1) {
        await deliver({
          kind: 'watch_error',
          at: new Date().toISOString(),
          vault: config.vault,
          message: `The watcher cannot read the vault: ${plain(error)} It keeps trying.`,
        })
      }
      warn(`${plain(error)} Trying again in ${wait} seconds.`)
      await sleep(wait)
    }
  }
}

/** The saved block, or undefined if there is no usable file yet. */
async function readCursor(file: string): Promise<bigint | undefined> {
  const text = await readFile(file, 'utf8').catch(() => '')
  return /^\d+$/.test(text.trim()) ? BigInt(text.trim()) : undefined
}

/** Runs the watcher from the environment until stopped. Also reached as `hardstop-mcp --watch`. */
export async function main(): Promise<void> {
  let config: Config
  try {
    // The watcher only reads; it never needs, uses or passes on a key.
    config = readConfig({ ...process.env, HARDSTOP_AGENT_KEY: undefined })
  } catch (error) {
    warn(plain(error))
    process.exit(1)
  }
  const text = process.env.HARDSTOP_WATCH_SECS?.trim() || '30'
  const everySecs = Number(text)
  if (!Number.isInteger(everySecs) || everySecs < 1 || everySecs > 86_400) {
    warn('HARDSTOP_WATCH_SECS must be a whole number of seconds between 1 and 86400.')
    process.exit(1)
  }
  const controller = new AbortController()
  const stop = () => {
    warn('stopping.')
    controller.abort()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  await watch(config, {
    everySecs,
    signal: controller.signal,
    deliver: deliverer(process.env),
    unsafeInterval: process.env.HARDSTOP_WATCH_UNSAFE === '1',
    cursorFile: process.env.HARDSTOP_WATCH_CURSOR?.trim() || undefined,
  })
}

if (isMain(import.meta.url)) {
  main().catch((error: unknown) => {
    warn(plain(error))
    process.exit(1)
  })
}
