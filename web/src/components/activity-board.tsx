'use client'

import Link from 'next/link'
import { useState } from 'react'
import { scheduleStatus } from '@/lib/describe'
import { formatDuration, formatTime, formatUsd } from '@/lib/money'
import { exampleSetup, namedRecipients, today, UNAPPROVED, type Action, type Entry, type Session, type View } from '@/lib/session'
import { useVault, type Live } from '@/lib/vault-store'
import { AgentPanel } from './agent-panel'
import { Amount } from './amount'
import { OwnerControls } from './owner-controls'
import { announcement, Slip } from './slip'
import { VaultConnect } from './vault-connect'

export function ActivityBoard() {
  const vault = useVault()

  if (vault.status === 'starting') {
    return (
      <p role="status" className="lede">
        Opening your vault…
      </p>
    )
  }

  if (vault.status === 'error' && vault.isLinkError) {
    return (
      <div className="notice max-w-[36rem]" role="alert">
        <h2 className="sub-title">This link did not open a vault</h2>
        <p className="mt-2">{vault.error}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={vault.retry}>
            Try again
          </button>
          <button type="button" className="btn" onClick={vault.reset}>
            Show my own vault instead
          </button>
        </div>
      </div>
    )
  }

  if (vault.status === 'error') {
    return (
      <div className="notice max-w-[36rem]" role="alert">
        <h2 className="sub-title">The vault could not be opened</h2>
        <p className="mt-2">
          The part of this site that runs the contract did not load, or the saved vault could not be reached. Check
          your connection, and your wallet if the vault is on a test network, then try again.
        </p>
        <details className="tech">
          <summary>Technical details</summary>
          <p className="mono">{vault.error}</p>
        </details>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={vault.retry}>
            Try again
          </button>
          <button type="button" className="btn" onClick={vault.reset}>
            Discard the saved vault
          </button>
        </div>
      </div>
    )
  }

  if (vault.status === 'none' || vault.view === null || vault.session === null) {
    return (
      <div className="card card-live max-w-[44rem]">
        <h2 className="sub-title">You have no practice vault yet</h2>
        <p className="soft mt-3">
          Start with an example to see how it behaves: $10.00 per payment, $20.00 per day, one approved recipient,
          $100.00 in test dollars. Or set your own rules.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-primary btn-large"
            onClick={() => vault.create(exampleSetup(BigInt(Math.floor(Date.now() / 1000))))}
          >
            Start with an example vault
          </button>
          <Link href="/protect" className="btn btn-large">
            Set my own rules
          </Link>
        </div>
      </div>
    )
  }

  return (
    <Board
      view={vault.view}
      session={vault.session}
      entries={vault.entries}
      isBusy={vault.busy}
      isSaved={vault.saved}
      live={vault.live}
      problem={vault.problem}
    />
  )
}

type BoardProps = {
  view: View
  session: Session
  entries: Entry[]
  isBusy: boolean
  isSaved: boolean
  live: Live | null
  problem: string | null
}

/** ETH to five places: enough to see gas money going down. */
const formatEth = (wei: bigint): string => (Number(wei / 10_000_000_000_000n) / 100_000).toFixed(5)
const short = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`

function Board({ view, session, entries, isBusy, isSaved, live, problem }: BoardProps) {
  const vault = useVault()
  const [fresh, setFresh] = useState<{ id: number; said: string } | null>(null)

  const names = new Map(namedRecipients(session).map((recipient) => [recipient.address as string, recipient.name]))
  const nameOf = (address: string) =>
    names.get(address) ?? (address === UNAPPROVED ? 'an address you never approved' : `${address.slice(0, 8)}…`)

  async function run(action: Action): Promise<Entry | null> {
    const entry = await vault.act(action)
    if (entry !== null) {
      const name = action.type === 'addRecipient' ? () => action.name : nameOf
      // An odd id adds an invisible character so that a repeated verdict is announced again.
      setFresh({ id: entry.id, said: announcement(entry, name) + (entry.id % 2 === 1 ? ' ' : '') })
    }
    return entry
  }

  const { state } = view
  const { policy, queued, schedule, now, vaultBalance } = state
  const day = today(state)
  const usedShare = policy.perWindow === 0n ? 1 : Math.min(1, Number((day.spent * 1000n) / policy.perWindow) / 1000)
  const worstShown = view.worstCase < vaultBalance ? view.worstCase : vaultBalance
  const leftShown = view.leftToday < vaultBalance ? view.leftToday : vaultBalance
  const cooling = formatDuration(schedule.coolingSecs)
  // Opened from a link: no agent key here, so the page acts only as the owner.
  const agentKey = live?.vault.agentKey ?? null
  const launched = live !== null && agentKey !== null ? { ...live, vault: { ...live.vault, agentKey } } : null

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_auto_auto_1fr]">
      <p className="sr-only" role="status" aria-live="polite">
        {fresh?.said ?? ''}
      </p>

      <div className="where lg:col-span-2">
        {live ? (
          <p>
            On <strong>{live.network.name}</strong>, a public test network. Vault{' '}
            <a href={`${live.network.explorer}/address/${live.vault.vault}`} rel="noopener noreferrer">
              {short(live.vault.vault)}
            </a>
            .{' '}
            {launched ? (
              <>
                The agent here is a trial key kept in this browser, with {formatEth(live.agentGas)} test ETH left to pay
                network fees for its requests. Your wallet is the owner.
              </>
            ) : (
              <>
                Opened from a link, so this page holds no agent key: it shows what the vault holds and lets its owner change
                it, from the owner&rsquo;s wallet ({short(live.vault.owner)}). Names you gave recipients are not on the
                network, so they are not shown here.
              </>
            )}
          </p>
        ) : (
          <p>
            In this browser only: the same contract, on a private chain inside this page.{' '}
            <Link href="/protect">Open a vault on a test network</Link>
          </p>
        )}
        {problem !== null && (
          <p className="notice mt-4" role="alert">
            {problem}
          </p>
        )}
      </div>

      <section aria-labelledby="vault-title" className="card card-live lg:col-start-1 lg:row-start-2">
        <h2 id="vault-title" className="label">
          In the vault
        </h2>
        <p className="figure mt-2">
          <Amount value={vaultBalance} />
        </p>
        <p className="small soft mt-1">Test dollars</p>

        <div className="mt-7">
          <div className={usedShare >= 1 ? 'gauge-stop is-full' : 'gauge-stop'}>
            <div
              className="gauge"
              role="meter"
              aria-label="Spent today"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(usedShare * 100)}
              aria-valuetext={`${formatUsd(day.spent)} spent of ${formatUsd(policy.perWindow)}`}
            >
              <div className="gauge-fill" style={{ transform: `scaleX(${usedShare})` }} />
            </div>
          </div>
          <dl className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1">
            <div>
              <dt className="small soft">Spent today</dt>
              <dd className="text-xl font-medium">
                <Amount value={day.spent} />
              </dd>
            </div>
            <div className="text-right">
              <dt className="small soft">Left today</dt>
              <dd className="text-xl font-medium">
                <Amount value={leftShown} />
              </dd>
            </div>
          </dl>
          <p className="small soft mt-2">
            {policy.paused
              ? 'The agent is paused, so nothing is left for it to spend.'
              : `Today's allowance of ${formatUsd(policy.perWindow)} resets on ${formatTime(day.resetsAt)}.`}
            {leftShown < view.leftToday && ` The rules allow ${formatUsd(view.leftToday)} more today; the figure is capped at what the vault holds.`}
            {view.leftTodayIfChanged !== null &&
              view.leftTodayIfChanged > view.leftToday &&
              queued !== null &&
              ` If the scheduled change is not cancelled, from ${formatTime(queued.effectiveAt)} the vault allows up to ${formatUsd(view.leftTodayIfChanged < vaultBalance ? view.leftTodayIfChanged : vaultBalance)} more today (an upper limit).`}
          </p>
          {/* The owner's emergency stop, where the money is shown: the full controls are further down. */}
          {!policy.paused && (
            <button type="button" className="btn mt-4" disabled={isBusy} onClick={() => void run({ type: 'pause' })}>
              Pause now
            </button>
          )}
        </div>

        {!isSaved && (
          <p className="notice small mt-5">
            This browser is not letting the site save your vault, so this page will not find it again after you
            reload or leave.
          </p>
        )}
      </section>

      {/* The worst case sits right under the balance, on a phone too, ahead of the agent and its receipts. */}
      <section aria-labelledby="worst-title" className="card lg:col-start-1 lg:row-start-3">
        <h2 id="worst-title" className="label">
          Worst case if your agent goes rogue
        </h2>
        <p className="figure figure-gold mt-2">
          <Amount value={worstShown} />
        </p>
        <p className="soft mt-3">
          The most it could take from this vault between now and {formatTime(view.worstCaseUntil)}. No change made
          from now on, by anyone, can raise that before then.
        </p>
        {worstShown < view.worstCase && (
          <p className="small soft mt-2">
            The rules alone would allow {formatUsd(view.worstCase)}. The figure is capped at what the vault holds.
          </p>
        )}
        {view.worstCaseUntil >= day.resetsAt && !policy.paused && (
          <p className="small soft mt-2">
            This can be more than one day&rsquo;s limit: the allowance resets on {formatTime(day.resetsAt)}, so the
            agent could spend what is left today and then the next day&rsquo;s.
          </p>
        )}
        {queued !== null && queued.effectiveAt <= view.worstCaseUntil && (
          <p className="small soft mt-2">
            It counts the scheduled change from the moment it takes effect, so it is an upper limit rather than an
            exact figure.
          </p>
        )}
      </section>

      <div className="grid content-start gap-6 lg:col-start-2 lg:row-span-3 lg:row-start-2">
        {live === null || launched ? (
          <AgentPanel view={view} entries={entries} isBusy={isBusy} run={run} />
        ) : (
          <section aria-labelledby="agent-title" className="card">
            <h2 id="agent-title" className="sub-title">
              The agent
            </h2>
            <p className="soft mt-3">
              Agent {short(live.vault.agent ?? '')}, with {formatEth(live.agentGas)} test ETH for network fees. Its key is
              not on this page, so nothing can be paid from here.
            </p>
          </section>
        )}

        <section aria-labelledby="receipts-title" className="card">
          <h2 id="receipts-title" className="sub-title">
            Receipts
          </h2>
          {entries.length === 0 ? (
            <p className="tile soft mt-4">
              Nothing yet. Press one of the agent&rsquo;s buttons and the vault&rsquo;s answer prints here, newest
              first. Only things you do in this session appear.
            </p>
          ) : (
            <ol className="mt-5 grid gap-4" reversed>
              {entries.toReversed().map((entry) => (
                <li key={entry.id}>
                  <Slip
                    entry={entry}
                    nameOf={nameOf}
                    vault={view.vault}
                    isNew={entry.id === fresh?.id}
                    explorer={live?.network.explorer}
                    status={scheduleStatus(entry, entries.slice(entries.indexOf(entry) + 1), now)}
                  />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="grid content-start gap-6 lg:col-start-1 lg:row-start-4">

        <section aria-labelledby="rules-title" className="card">
          <h2 id="rules-title" className="sub-title">
            Rules in force
          </h2>
          <dl className="rows mt-3">
            <div>
              <dt>Most per payment</dt>
              <dd>{formatUsd(policy.perPayment)}</dd>
            </div>
            <div>
              <dt>Most per day</dt>
              <dd>{formatUsd(policy.perWindow)}</dd>
            </div>
            <div>
              <dt>Permission ends</dt>
              <dd>{formatTime(policy.validUntil)}</dd>
            </div>
            <div>
              <dt>Agent</dt>
              <dd className={policy.paused || now >= policy.validUntil ? 'text-stop' : undefined}>
                {now >= policy.validUntil ? 'Permission ended' : policy.paused ? 'Paused' : 'Active'}
              </dd>
            </div>
            <div>
              <dt>Cooling period</dt>
              <dd>{cooling}</dd>
            </div>
          </dl>

          {queued !== null && (
            <div id="scheduled" className="scheduled mt-5">
              <p className="tag tag-cool">Scheduled</p>
              <p className="mt-1 font-medium">Takes effect {formatTime(queued.effectiveAt)}</p>
              <p className="small mt-1">Until then the rules above stay in force. From then:</p>
              <dl className="small mt-2 grid gap-1">
                <div className="flex justify-between gap-4">
                  <dt>Most per payment</dt>
                  <dd className="font-medium">{formatUsd(queued.perPayment)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Most per day</dt>
                  <dd className="font-medium">{formatUsd(queued.perWindow)}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4">
                  <dt>Permission ends</dt>
                  <dd className="font-medium">{formatTime(queued.validUntil)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Agent</dt>
                  <dd className="font-medium">{queued.paused ? 'Paused' : 'Active'}</dd>
                </div>
              </dl>
              <button type="button" className="btn mt-4" disabled={isBusy} onClick={() => run({ type: 'cancel' })}>
                Cancel scheduled change
              </button>
            </div>
          )}
        </section>

        <section aria-labelledby="clock-title" className="card">
          <h2 id="clock-title" className="label">
            {live ? 'Network clock' : 'Practice clock'}
          </h2>
          <p className="mt-1 font-display text-2xl">{formatTime(now)}</p>
          {live ? (
            <p className="hint mt-2">
              The time of the network&rsquo;s latest block. A cooling period ends when this clock reaches it; nobody can
              move it forward.
            </p>
          ) : (
            <PracticeClock isBusy={isBusy} run={run} />
          )}
        </section>

        <OwnerControls view={view} isBusy={isBusy} run={run} onReset={vault.reset} />
      </div>

      {launched && <VaultConnect live={launched} />}
    </div>
  )
}

function PracticeClock({ isBusy, run }: { isBusy: boolean; run: (action: Action) => Promise<Entry | null> }) {
  return (
    <>
          <div className="mt-3 grid gap-3 min-[26rem]:grid-cols-2">
            <button type="button" className="btn" disabled={isBusy} onClick={() => run({ type: 'skip', seconds: '3600' })}>
              Skip ahead 1 hour
            </button>
            <button type="button" className="btn" disabled={isBusy} onClick={() => run({ type: 'skip', seconds: '86400' })}>
              Skip ahead 1 day
            </button>
          </div>
          <p className="hint mt-2">
            The clock started at the real time and only moves when you skip it. It exists so you can watch a cooling
            period end or a new day start.
          </p>
    </>
  )
}
