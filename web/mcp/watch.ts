// A 24/7 watcher for a HARDSTOP vault. It only reads: it needs the vault
// address and a network, never a key. Every few seconds it asks the vault
// what changed and reports:
//
//   - a looser rule waiting out its cooling period (the moment to cancel it if
//     the owner did not ask for it), and when it takes effect or is cancelled;
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
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import type { Hex } from 'viem'
import { explain } from '../src/lib/hardstop/reasons.ts'
import type { Log } from '../src/lib/hardstop/chain.ts'
import { decodeEvents, type Policy, type Queued, type State } from '../src/lib/hardstop/sim.ts'
import type { Wallet } from '../src/lib/live/wallet.ts'
import { FORMAT, formatTime, formatUsd } from '../src/lib/money.ts'
import {
  DAY,
  OWNER_PAGE,
  connect,
  describePolicy,
  iso,
  plain,
  policyJson,
  readConfig,
  txLink,
  usd,
  type Config,
  type Env,
  type Vault,
} from './vault.ts'

export type Alert = { kind: string; at: string; vault: Hex; message: string } & Record<string, unknown>

/** Most blocks asked for in one eth_getLogs; public RPCs limit the range. A watcher that fell behind catches up over several checks. */
const MAX_BLOCKS = 1_000n
/** Longest wait between attempts while the network is failing. */
const MAX_BACKOFF_SECS = 600

type RawLog = Log & { transactionHash?: Hex }

const sameRules = (a: Policy, b: Policy) =>
  a.perPayment === b.perPayment && a.perWindow === b.perWindow && a.validUntil === b.validUntil && a.paused === b.paused
const sameQueued = (a: Queued | null, b: Queued | null) =>
  a === b || (a !== null && b !== null && sameRules(a, b) && a.effectiveAt === b.effectiveAt)

export class Watcher {
  private last: State | undefined
  private nextBlock: bigint | undefined
  private readonly warned = new Set<string>()
  private readonly vault: Vault
  private readonly warnSecs: bigint

  constructor(vault: Vault, warnSecs = 3n * DAY) {
    this.vault = vault
    this.warnSecs = warnSecs
  }

  /**
   * One look at the vault. Returns what is new since the last look; the first
   * look reports what is already true (a waiting change, a near end date).
   * Nothing is remembered unless the whole look succeeds, so a failed look is
   * simply repeated.
   */
  async check(): Promise<Alert[]> {
    const { sim, chain, wallet } = this.vault
    await chain.refresh(true)
    const state = await sim.state()
    const latest = BigInt((await wallet.request({ method: 'eth_blockNumber' })) as Hex)

    const alerts: Alert[] = []
    let next = latest + 1n
    if (this.nextBlock === undefined) {
      alerts.push(this.alert('watching', `Watching vault ${sim.vault} on ${this.vault.config.network.name}. Rules in force: ${describePolicy(state.policy)}.`, { rules: policyJson(state.policy) }))
    } else if (this.nextBlock <= latest) {
      const to = latest < this.nextBlock + MAX_BLOCKS - 1n ? latest : this.nextBlock + MAX_BLOCKS - 1n
      const logs = (await wallet.request({
        method: 'eth_getLogs',
        params: [{ address: sim.vault, fromBlock: `0x${this.nextBlock.toString(16)}`, toBlock: `0x${to.toString(16)}` }],
      })) as RawLog[]
      for (const log of logs) alerts.push(...this.fromLog(log))
      next = to + 1n
    } else next = this.nextBlock

    const warned: string[] = []
    alerts.push(...(await this.fromState(this.last, state, warned)))

    this.last = state
    this.nextBlock = next
    for (const key of warned) this.warned.add(key)
    return alerts
  }

  private alert(kind: string, message: string, extra: Record<string, unknown> = {}): Alert {
    return { kind, at: iso(this.vault.chain.now), vault: this.vault.sim.vault, message, ...extra }
  }

  private name(address: Hex): string {
    return this.vault.config.recipients.find((r) => r.address === address)?.name ?? address
  }

  private fromLog(log: RawLog): Alert[] {
    const { network } = this.vault.config
    const tx = log.transactionHash ? { transaction: log.transactionHash, explorer: txLink(network, log.transactionHash) } : {}
    return decodeEvents({ ok: true, data: '0x', logs: [log], gasUsed: 0n }, this.vault.sim.vault).flatMap((event): Alert[] => {
      switch (event.name) {
        case 'Paid':
          return [
            this.alert('paid', `Paid ${formatUsd(event.amount)} to ${this.name(event.to)} (request ${event.nonce}). ${formatUsd(event.leftInWindow)} left today.`, {
              to: event.to,
              amount_usd: usd(event.amount),
              nonce: event.nonce.toString(),
              left_today_usd: usd(event.leftInWindow),
              ...tx,
            }),
          ]
        case 'Blocked': {
          const said = explain(event.code, event.detail, FORMAT)
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
                  `${this.name(event.who)} was approved as a recipient; it can be paid from ${formatTime(event.approvedFrom)}. If the owner did not do this, remove it at ${OWNER_PAGE} before then.`,
                  { who: event.who, approved_from: iso(event.approvedFrom), ...tx },
                ),
              ]
        case 'Withdrawn':
          return [this.alert('withdrawn', `The owner withdrew ${formatUsd(event.amount)} from the vault.`, { amount_usd: usd(event.amount), ...tx })]
        default:
          // Rule changes are read from the vault's state below, which also sees a waiting change take effect.
          return []
      }
    })
  }

  private async fromState(prev: State | undefined, cur: State, warned: string[]): Promise<Alert[]> {
    const alerts: Alert[] = []
    const { queued, policy } = cur
    const before = prev?.queued ?? null

    if (queued && !sameQueued(queued, before)) {
      // The contract queues only changes that loosen something; anything stricter applies at once.
      const worst = await this.vault.sim.exposure(queued.effectiveAt + DAY)
      alerts.push(
        this.alert(
          'loosening_waiting',
          `Looser rules are waiting: ${describePolicy(queued)} (now ${describePolicy(policy)}). They take effect ${formatTime(queued.effectiveAt)}. By a day after that the agent could have moved up to ${formatUsd(worst)}. If the owner did not ask for this, cancel it at ${OWNER_PAGE} before then.`,
          { proposed: policyJson(queued), current: policyJson(policy), takes_effect_at: iso(queued.effectiveAt), worst_case_usd: usd(worst) },
        ),
      )
    }

    let explained = false
    if (prev && before && !queued) {
      explained = sameRules(policy, before)
      alerts.push(
        explained
          ? this.alert('loosening_in_force', `The waiting change is now in force: ${describePolicy(policy)}.`, { rules: policyJson(policy) })
          : this.alert('loosening_cancelled', `The waiting change was cancelled. Rules in force: ${describePolicy(policy)}.`, { rules: policyJson(policy) }),
      )
    }

    if (prev && !explained) {
      if (prev.policy.paused !== policy.paused) {
        alerts.push(
          policy.paused
            ? this.alert('paused', 'The agent is paused. The vault refuses every payment until the owner resumes it.')
            : this.alert('resumed', `The agent is no longer paused. Rules in force: ${describePolicy(policy)}.`),
        )
      }
      const limits = (p: Policy) => [p.perPayment, p.perWindow, p.validUntil].join()
      if (limits(prev.policy) !== limits(policy)) {
        alerts.push(this.alert('rules_changed', `The rules changed: ${describePolicy(policy)} (was ${describePolicy(prev.policy)}).`, { rules: policyJson(policy), was: policyJson(prev.policy) }))
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
  const webhook = env.HARDSTOP_ALERT_WEBHOOK?.trim()
  const desktopOn = env.HARDSTOP_DESKTOP_NOTIFY === '1'
  return async (alert) => {
    write(`${JSON.stringify(alert)}\n`)
    if (desktopOn) desktop(`HARDSTOP: ${alert.kind.replace(/_/g, ' ')}`, alert.message)
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
        : ['notify-send', [title, body]]
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
}

/** Checks the vault until `signal` is aborted. Network failures are reported once, then retried with growing waits. */
export async function watch(config: Config, { everySecs, signal, deliver, wallet, warnSecs }: WatchOptions): Promise<void> {
  const sleep = (secs: number) => delay(secs * 1000, undefined, { signal }).catch(() => undefined)
  let watcher: Watcher | undefined
  let failures = 0
  while (!signal.aborted) {
    try {
      watcher ??= new Watcher(await connect(config, wallet), warnSecs)
      const alerts = await watcher.check()
      for (const alert of alerts) await deliver(alert)
      if (failures > 0) {
        await deliver({ kind: 'watch_recovered', at: new Date().toISOString(), vault: config.vault, message: 'The watcher can reach the vault again.' })
        failures = 0
      }
      await sleep(everySecs)
    } catch (error) {
      if (signal.aborted) break
      failures += 1
      const wait = Math.min(everySecs * 2 ** failures, MAX_BACKOFF_SECS)
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

async function main(): Promise<void> {
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
  await watch(config, { everySecs, signal: controller.signal, deliver: deliverer(process.env) })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    warn(plain(error))
    process.exit(1)
  })
}
