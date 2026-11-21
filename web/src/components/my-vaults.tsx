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
import { summarize, vaultsOf, type Summary } from '@/lib/live/mine'
import { accountOf, injectedWallet, networkOf, NETWORKS, switchTo, type Network, type Wallet } from '@/lib/live/wallet'
import { formatTime, formatUsd } from '@/lib/money'

type Row = Summary | { vault: Hex; problem: string }
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
    const { vaults, total } = await vaultsOf(wallet, account)
    const rows = await Promise.all(vaults.map((vault) => summarize(wallet, network, vault)))
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
        <VaultCard key={row.vault} row={row} network={state.network} />
      ))}
    </div>
  )
}

function VaultCard({ row, network }: { row: Row; network: Network }) {
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
        <h3 className="label mono break-all">
          <a href={`${network.explorer}/address/${row.vault}`}>{row.vault}</a>
        </h3>
        <span className={row.paused ? 'text-stop' : undefined}>{status(row)}</span>
      </div>
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
      </details>
    </section>
  )
}
