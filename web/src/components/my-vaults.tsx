'use client'

// "My vaults": the account page. The wallet is the account: connecting it is
// signing in, and there is no password, email or server-side record. The
// list comes from the chain (the launcher's per-owner list, src/lib/live/
// mine.ts), so it is the same on any device and shows only vaults this
// wallet launched. Every vault is checked against the known vault builds
// before anything it reports is shown. This page only reads; changing a
// vault happens on its own page, where the contract refuses anyone but its
// owner.

import Link from 'next/link'
import { useState } from 'react'
import type { Hex } from 'viem'
import type { HistoryEvent } from '@/lib/live/history'
import type { Summary } from '@/lib/live/mine'
import { explain } from '@/lib/hardstop/reasons'
import { accountOf, injectedWallet, isRefusal, networkOf, NETWORKS, sendAsOwner, switchTo, waitFor, type Network, type Wallet } from '@/lib/live/wallet'
import { FORMAT, formatTime, formatUsd } from '@/lib/money'

type Row = (Summary & { name: string }) | { vault: Hex; problem: string }
type State =
  | { phase: 'signed-out' }
  | { phase: 'working'; doing: string }
  | { phase: 'failed'; message: string }
  | { phase: 'wrong-network'; account: Hex; chainId: number }
  | { phase: 'ready'; account: Hex; network: Network; rows: Row[]; total: bigint }

const PACKAGE = 'github:vaibhav4046/hardstop'
const short = (address: Hex) => `${address.slice(0, 6)}…${address.slice(-4)}`
const plain = (error: unknown) => (error instanceof Error ? error.message : 'The wallet did not answer.')

function status(row: Summary): string {
  if (row.paused) return 'Paused'
  if (row.changeAt !== 0n) return `A change takes effect ${formatTime(row.changeAt)}`
  return 'Active'
}

export function MyVaults() {
  const [state, setState] = useState<State>({ phase: 'signed-out' })

  async function load(wallet: Wallet) {
    setState({ phase: 'working', doing: 'Asking your wallet who you are…' })
    const account = await accountOf(wallet)
    const chainId = Number((await wallet.request({ method: 'eth_chainId' })) as string)
    const network = networkOf(chainId)
    if (!network) return setState({ phase: 'wrong-network', account, chainId })
    setState({ phase: 'working', doing: `Reading your vaults on ${network.name}…` })
    // Loaded only now: it carries the contracts' code, which no other page needs before a vault exists.
    const { nameOf, summarize, vaultsOf } = await import('@/lib/live/mine')
    const { vaults, total } = await vaultsOf(wallet, account)
    const rows: Row[] = await Promise.all(
      vaults.map(async (vault) => {
        const summary = await summarize(wallet, network, vault)
        return 'problem' in summary ? summary : { ...summary, name: await nameOf(wallet, account, vault) }
      }),
    )
    setState({ phase: 'ready', account, network, rows, total })
  }

  async function signIn(to?: Network) {
    const wallet = injectedWallet()
    if (!wallet) {
      return setState({ phase: 'failed', message: 'No wallet found in this browser. Install MetaMask or another Ethereum wallet, then try again.' })
    }
    try {
      if (to) await switchTo(wallet, to)
      await load(wallet)
    } catch (error) {
      setState({ phase: 'failed', message: plain(error) })
    }
  }

  if (state.phase === 'signed-out' || state.phase === 'failed') {
    return (
      <section className="card max-w-[44rem]" aria-labelledby="sign-in-title">
        <h2 id="sign-in-title" className="label">
          Sign in with your wallet
        </h2>
        <p className="mt-2">
          Your wallet is your account. Signing in asks it for your address and nothing else: no password, no email, and
          nothing about you kept on a server. Your vaults are found on the network, so they follow you to any device.
        </p>
        <p className="mt-5">
          <button type="button" className="btn btn-primary" onClick={() => signIn()}>
            Connect wallet
          </button>
        </p>
        {state.phase === 'failed' && (
          <p className="mt-4 text-stop" role="alert">
            {state.message}
          </p>
        )}
      </section>
    )
  }

  if (state.phase === 'working') {
    return (
      <p className="soft" role="status">
        {state.doing}
      </p>
    )
  }

  if (state.phase === 'wrong-network') {
    return (
      <section className="card max-w-[44rem]" aria-labelledby="network-title">
        <h2 id="network-title" className="label">
          Signed in as {short(state.account)}
        </h2>
        <p className="mt-2">Vaults live on public test networks. Pick one to see yours there.</p>
        <p className="mt-5 flex flex-wrap gap-3">
          {NETWORKS.map((network) => (
            <button key={network.chainId} type="button" className="btn" onClick={() => signIn(network)}>
              Switch to {network.name}
            </button>
          ))}
        </p>
      </section>
    )
  }

  const others = NETWORKS.filter((network) => network.chainId !== state.network.chainId)
  return (
    <div className="grid gap-[var(--gap-part)]">
      <section className="card" aria-labelledby="account-title">
        <h2 id="account-title" className="label">
          Your account
        </h2>
        <dl className="rows mt-3 max-w-[40rem]">
          <div>
            <dt>Wallet</dt>
            <dd className="mono break-all">{state.account}</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{state.network.name} (a test network: its dollars have no value)</dd>
          </div>
          <div>
            <dt>Vaults</dt>
            <dd>{state.total.toString()}</dd>
          </div>
        </dl>
        <p className="small soft mt-4">
          Only this wallet can change these vaults: each one is its own contract, and it refuses every owner action from
          anyone else. Another person signing in here sees only their own.
        </p>
        <p className="mt-4 flex flex-wrap gap-3">
          <Link href="/protect" className="btn btn-primary">
            New vault
          </Link>
          {others.map((network) => (
            <button key={network.chainId} type="button" className="btn" onClick={() => signIn(network)}>
              See {network.name}
            </button>
          ))}
        </p>
      </section>

      {state.rows.length === 0 && (
        <p className="soft max-w-[44rem]">
          No vaults launched from this wallet on {state.network.name} yet. Vaults opened with an earlier version of the
          site are not in this list; open them from their link.
        </p>
      )}

      {state.rows.map((row) => (
        <VaultCard key={row.vault} row={row} network={state.network} account={state.account} />
      ))}
    </div>
  )
}

function VaultCard({ row, network, account }: { row: Row; network: Network; account: Hex }) {
  const [name, setName] = useState('name' in row ? row.name : '')
  const page = `/activity?chain=${network.chainId}&vault=${row.vault}`
  if ('problem' in row) {
    return (
      <section className="card" aria-label={`Vault ${row.vault}`}>
        <h3 className="label mono break-all">{row.vault}</h3>
        <p className="mt-2 text-stop">{row.problem}</p>
      </section>
    )
  }
  const period = row.schedule.windowSecs === 86_400n ? 'a day' : 'a window'
  const watch = `HARDSTOP_VAULT=${row.vault} HARDSTOP_CHAIN_ID=${network.chainId} npx -y ${PACKAGE} --watch`
  const agent = `claude mcp add --env HARDSTOP_AGENT_KEY=<agent key> --env HARDSTOP_VAULT=${row.vault} --env HARDSTOP_CHAIN_ID=${network.chainId} --transport stdio --scope user hardstop -- npx -y ${PACKAGE}`
  return (
    <section className="card" aria-label={`Vault ${row.vault}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="section-title break-words">{name || 'Unnamed vault'}</h3>
        <span className={row.paused ? 'text-stop' : undefined}>{status(row)}</span>
      </div>
      <p className="small mono break-all mt-1">
        <a href={`${network.explorer}/address/${row.vault}`}>{row.vault}</a>
      </p>
      <dl className="rows mt-3 max-w-[40rem]">
        <div>
          <dt>Limits</dt>
          <dd>
            {formatUsd(row.perPayment)} a payment, {formatUsd(row.perWindow)} {period}, until {formatTime(row.validUntil)}
          </dd>
        </div>
        <div>
          <dt>Holds</dt>
          <dd>{formatUsd(row.balance)}</dd>
        </div>
        <div>
          <dt>Agent</dt>
          <dd className="mono break-all">{row.agent}</dd>
        </div>
      </dl>
      <p className="mt-4">
        <Link href={page} className="btn">
          Open vault
        </Link>
      </p>
      <VaultActivity vault={row.vault} network={network} />
      <Rename vault={row.vault} account={account} name={name} onNamed={setName} />
      <details className="disclosure mt-5">
        <summary>Connect an AI or watch this vault</summary>
        <p className="small soft">
          Each AI gets its own vault and its own agent key; it can pay only through that vault, inside its limits. The
          browser that launched the vault holds the agent key and fills it in on the vault&rsquo;s page. Watching needs no
          key at all.
        </p>
        <pre className="code mt-3" tabIndex={0} aria-label="Agent setup for Claude Code">
          <code>{agent}</code>
        </pre>
        <pre className="code mt-3" tabIndex={0} aria-label="Watcher command">
          <code>{watch}</code>
        </pre>
        <p className="small mt-3">
          Or nothing to run: add{' '}
          <a href={`/alerts?chain=${network.chainId}&vault=${row.vault}`}>this vault&rsquo;s alert feed</a> to any feed
          reader. It says when a looser rule is waiting and until when you can cancel it.
        </p>
      </details>
    </section>
  )
}

/** One line per event, from the vault's own log. Refusal reasons are the kernel's codes, worded by `explain`. */
function line(event: HistoryEvent): string {
  switch (event.kind) {
    case 'paid':
      return `Paid ${formatUsd(event.amount)} to ${short(event.to)}. ${formatUsd(event.leftInWindow)} left in that window.`
    case 'blocked':
      return `Refused ${formatUsd(event.amount)} to ${short(event.to)}. ${explain(event.code, event.detail, FORMAT).sentence}`
    case 'proposed': {
      const rules = `${formatUsd(event.perPayment)} a payment, ${formatUsd(event.perWindow)} a window${event.paused ? ', paused' : ''}`
      const applied = event.effectiveAt === 0n
      return applied ? `You set the rules to ${rules}. They applied at once.` : `You asked for ${rules}. It waits until ${formatTime(event.effectiveAt)}.`
    }
    case 'cancelled':
      return 'You cancelled a waiting change.'
    case 'recipient': {
      const removed = event.approvedFrom === 0n
      return removed ? `You removed ${short(event.who)} as a recipient.` : `You approved ${short(event.who)}, payable from ${formatTime(event.approvedFrom)}.`
    }
    case 'withdrawn':
      return `You withdrew ${formatUsd(event.amount)}.`
  }
}

type Feed = { phase: 'closed' } | { phase: 'loading' } | { phase: 'failed'; message: string } | { phase: 'shown'; events: HistoryEvent[] }

function VaultActivity({ vault, network }: { vault: Hex; network: Network }) {
  const [feed, setFeed] = useState<Feed>({ phase: 'closed' })

  async function open() {
    const wallet = injectedWallet()
    if (!wallet) return setFeed({ phase: 'failed', message: 'No wallet found in this browser.' })
    setFeed({ phase: 'loading' })
    try {
      const { vaultHistory } = await import('@/lib/live/history')
      setFeed({ phase: 'shown', events: await vaultHistory(wallet, network, vault) })
    } catch (error) {
      setFeed({ phase: 'failed', message: plain(error) })
    }
  }

  return (
    <details className="disclosure mt-5" onToggle={(event) => event.currentTarget.open && feed.phase === 'closed' && open()}>
      <summary>Activity</summary>
      <p className="small soft">
        What this vault&rsquo;s agent did and what you changed, read from the vault&rsquo;s own records on {network.name}. A
        block explorer only says which transactions to look at; each line comes from the transaction itself.
      </p>
      {feed.phase === 'loading' && (
        <p className="soft mt-3" role="status">
          Reading the vault&rsquo;s records…
        </p>
      )}
      {feed.phase === 'failed' && (
        <div className="mt-3" role="alert">
          <p className="text-stop">{feed.message}</p>
          <button type="button" className="btn mt-3" onClick={open}>
            Try again
          </button>
        </div>
      )}
      {feed.phase === 'shown' && feed.events.length === 0 && <p className="soft mt-3">Nothing yet.</p>}
      {feed.phase === 'shown' && feed.events.length > 0 && (
        <ol className="mt-3 grid gap-2" aria-label="Activity, newest first">
          {feed.events.map((event, index) => (
            <li key={`${event.tx}-${index}`} className={event.kind === 'blocked' ? 'text-stop' : undefined}>
              <span className="small soft">{formatTime(event.time)}</span> {line(event)}{' '}
              <a className="small tx-link" href={`${network.explorer}/tx/${event.tx}`}>
                transaction
              </a>
            </li>
          ))}
        </ol>
      )}
    </details>
  )
}

type Naming = { phase: 'idle' } | { phase: 'sending' } | { phase: 'failed'; message: string } | { phase: 'done' }

/** Names a vault on chain: one transaction from the owner's wallet to the launcher, stored under the owner's address. */
function Rename({ vault, account, name, onNamed }: { vault: Hex; account: Hex; name: string; onNamed: (name: string) => void }) {
  const [text, setText] = useState(name)
  const [naming, setNaming] = useState<Naming>({ phase: 'idle' })

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const wallet = injectedWallet()
    if (!wallet) return setNaming({ phase: 'failed', message: 'No wallet found in this browser.' })
    const { encodeName, setNameData } = await import('@/lib/live/mine')
    const word = encodeName(text)
    if (typeof word === 'string') return setNaming({ phase: 'failed', message: word })
    setNaming({ phase: 'sending' })
    try {
      const { LAUNCHER } = await import('@/lib/live/launch')
      const sent = await sendAsOwner(wallet, { from: account, to: LAUNCHER, data: setNameData(vault, word) })
      const receipt = await waitFor(wallet, sent)
      if (receipt.status !== '0x1') throw new Error('The network refused the change of name.')
      onNamed(text.trim())
      setNaming({ phase: 'done' })
    } catch (error) {
      setNaming({ phase: 'failed', message: isRefusal(error) ? 'You declined in the wallet. Nothing changed.' : plain(error) })
    }
  }

  const errorId = `rename-error-${vault}`

  return (
    <details className="disclosure mt-5">
      <summary>Rename</summary>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={save}>
        <label className="grid gap-1">
          <span className="small">Name (up to 32 bytes; only you see it in your list)</span>
          <input
            className="input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            autoComplete="off"
            aria-invalid={naming.phase === 'failed' ? true : undefined}
            aria-describedby={naming.phase === 'failed' ? errorId : undefined}
          />
        </label>
        <button type="submit" className="btn" disabled={naming.phase === 'sending'}>
          {naming.phase === 'sending' ? 'Waiting for the network…' : 'Save name'}
        </button>
      </form>
      <p className="small soft mt-2">
        Saving sends one transaction from your wallet to the launcher. It changes nothing about the vault or its rules.
      </p>
      {naming.phase === 'failed' && (
        <p id={errorId} className="mt-2 text-stop" role="alert">
          {naming.message}
        </p>
      )}
      {naming.phase === 'done' && (
        <p className="mt-2" role="status">
          Saved on the network.
        </p>
      )}
    </details>
  )
}
