'use client'

// The panels beside the three steps on the home page. Each one reads from, or
// sends to, the same practice vault as the example above them. Every figure
// and every answer shown is what that contract returned.

import Link from 'next/link'
import { note, verdict } from '@/lib/describe'
import { formatDuration, formatTime, formatUsd, USD } from '@/lib/money'
import { AGENT_RAISE, UNAPPROVED, type Entry } from '@/lib/session'
import { Amount } from './amount'
import { useHomeVault } from './home-vault'

const RAISED_DAY = 50n * USD

/** Shown in a panel until the vault has answered for the first time. */
function Waiting({ hasFailed }: { hasFailed: boolean }) {
  return (
    <p className="tile soft" data-practice-vault>
      {hasFailed
        ? 'The practice vault could not start in this browser. Use “Try again” in the example above.'
        : 'The practice vault is loading.'}
    </p>
  )
}

/** Step 1: the rules the contract holds, and its own worst-case figure. */
export function RulesPanel() {
  const { view, status } = useHomeVault()
  if (view === null) return <Waiting hasFailed={status === 'failed'} />

  const { policy, schedule } = view.state
  const payees = view.recipients.map((recipient) => recipient.name)

  return (
    <div className="grid gap-5">
      <p className="panel-title">Rules in force on the practice vault</p>
      <dl className="rows">
        <div>
          <dt>Most per payment</dt>
          <dd>{formatUsd(policy.perPayment)}</dd>
        </div>
        <div>
          <dt>Most per day</dt>
          <dd>{formatUsd(policy.perWindow)}</dd>
        </div>
        <div>
          <dt>May pay</dt>
          <dd>{payees.length > 0 ? new Intl.ListFormat('en', { type: 'conjunction' }).format(payees) : 'Nobody'}</dd>
        </div>
        <div>
          <dt>Permission ends</dt>
          <dd>{formatTime(policy.validUntil)}</dd>
        </div>
        <div>
          <dt>A looser rule waits</dt>
          <dd>{formatDuration(schedule.coolingSecs)}</dd>
        </div>
      </dl>
      <div className="tile">
        <p className="panel-title">The most the rules let this agent take before {formatTime(view.worstCaseUntil)}</p>
        <p className="figure figure-gold mt-3">
          <Amount value={view.worstCase} />
        </p>
        <p className="small soft mt-3">
          Worked out by the vault itself. No change made from now on, by anyone, can raise it before then.
        </p>
      </div>
    </div>
  )
}

/** Step 2: two more things an agent might ask for, and the vault's last answer. */
export function AskPanel() {
  const { view, entries, status, send } = useHomeVault()
  if (view === null) return <Waiting hasFailed={status === 'failed'} />

  const isBusy = status === 'working'
  const last = entries.find((entry) => entry.kind === 'payment' || entry.kind === 'agentRaise')

  return (
    <div className="grid gap-5">
      <p className="panel-title">Two more things an agent might try</p>
      <div className="btn-pair">
        <button
          type="button"
          className="btn"
          disabled={isBusy}
          onClick={() =>
            send(({ ledger }) => ({
              type: 'pay',
              to: UNAPPROVED,
              amount: (4n * USD).toString(),
              nonce: ledger.nextNonce.toString(),
            }))
          }
        >
          Agent pays a stranger $4
        </button>
        <button type="button" className="btn" disabled={isBusy} onClick={() => send(() => ({ type: 'agentRaise' }))}>
          Agent asks for a higher limit
        </button>
      </div>
      {last === undefined ? (
        <p className="tile soft">Nothing asked yet. The vault&rsquo;s last answer shows here.</p>
      ) : (
        <LastAnswer entry={last} names={new Map(view.recipients.map((recipient) => [recipient.address, recipient.name]))} />
      )}
    </div>
  )
}

function LastAnswer({ entry, names }: { entry: Extract<Entry, { kind: 'payment' | 'agentRaise' }>; names: Map<string, string> }) {
  const said = verdict(entry)
  const asked =
    entry.kind === 'payment'
      ? `Pay ${formatUsd(entry.amount)} to ${names.get(entry.to) ?? 'an address you never approved'}`
      : `Raise its own limit to ${formatUsd(AGENT_RAISE)} per payment and per day`

  return (
    <dl className="tile grid gap-4">
      <div>
        <dt className="panel-title">The agent asked</dt>
        <dd className="mt-1 text-lg">{asked}</dd>
      </div>
      <div>
        <dt className="panel-title">The vault answered</dt>
        <dd className="mt-2">
          <span className={`stamp stamp-${said.tone}`}>{said.stamp}</span>
          <span className="mt-2 block text-lg">{said.sentence}</span>
        </dd>
      </div>
    </dl>
  )
}

/** Step 3: what only the owner can do, sent to the vault as the owner. */
export function OwnerPanel() {
  const { view, entries, status, send, restart } = useHomeVault()
  if (view === null) return <Waiting hasFailed={status === 'failed'} />

  const { policy, queued } = view.state
  const isBusy = status === 'working'
  const lastOwner = entries.find((entry) => entry.kind === 'owner')

  return (
    <div className="grid gap-5">
      <p className="panel-title">You, as the owner of the practice vault</p>
      <dl className="rows">
        <div>
          <dt>Agent</dt>
          <dd className={policy.paused ? 'text-stop' : undefined}>{policy.paused ? 'Paused' : 'Active'}</dd>
        </div>
        <div>
          <dt>Most per day, in force now</dt>
          <dd>{formatUsd(policy.perWindow)}</dd>
        </div>
      </dl>

      <div className="btn-pair">
        <button
          type="button"
          className="btn btn-stop"
          disabled={isBusy || policy.paused}
          onClick={() => send(() => ({ type: 'pause' }))}
        >
          Pause the agent
        </button>
        <button
          type="button"
          className="btn"
          disabled={isBusy || queued !== null}
          onClick={() =>
            send(() => ({
              type: 'propose',
              perPayment: policy.perPayment.toString(),
              perDay: RAISED_DAY.toString(),
              validUntil: policy.validUntil.toString(),
              paused: policy.paused,
            }))
          }
        >
          Raise the daily limit to {formatUsd(RAISED_DAY)}
        </button>
      </div>

      {queued !== null && (
        <div className="tile tile-waiting">
          <p className="tag tag-cool">Scheduled</p>
          <p className="mt-2">
            {formatUsd(queued.perWindow)} per day takes effect {formatTime(queued.effectiveAt)}. Until then the limit
            stays {formatUsd(policy.perWindow)}.
          </p>
          <button type="button" className="btn mt-4" disabled={isBusy} onClick={() => send(() => ({ type: 'cancel' }))}>
            Cancel the waiting change
          </button>
        </div>
      )}

      {lastOwner !== undefined && <p className="small soft">{note(lastOwner, () => 'a recipient')}</p>}

      <p className="small soft">
        {policy.paused ? 'While it is paused, try “Agent pays $4” in the example above. ' : null}
        On a vault of your own you can also move the clock forward and watch the wait end.{' '}
        <Link href="/activity">Open a practice vault</Link>
      </p>
      <div>
        <button type="button" className="btn btn-quiet" disabled={isBusy} onClick={restart}>
          Start this example again
        </button>
      </div>
    </div>
  )
}
