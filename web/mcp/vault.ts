// Shared by the MCP server (server.ts) and the watcher (watch.ts): the
// configuration read from the environment, a JSON-RPC connection, and the
// vault reached through the web app's own code (src/lib/live). Nothing here
// decides whether a payment is allowed; the contract does.
//
// Only the agent's key is ever read. The owner's key is never asked for, and
// the connection refuses to send anything as anyone but the agent.

import { decodeFunctionResult, encodeFunctionData, formatEther, type Hex } from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import { vaultAbi } from '../src/lib/hardstop/artifacts.ts'
import { Sim, type Policy, type State } from '../src/lib/hardstop/sim.ts'
import type { LiveChain } from '../src/lib/live/chain.ts'
import { attach } from '../src/lib/live/launch.ts'
import { NETWORKS, networkOf, type Network, type Wallet } from '../src/lib/live/wallet.ts'
import { formatTime, formatUsd, inputValue } from '../src/lib/money.ts'
import { today, type Recipient } from '../src/lib/session.ts'

/** Where the owner changes the rules. Every "ask the owner" points here. */
export const OWNER_PAGE = 'https://hardstop-omega.vercel.app/activity'
export const DAY = 86_400n

export type Env = Record<string, string | undefined>

export type Config = {
  network: Network
  vault: Hex
  /** Absent for the watcher, which only reads. */
  agentKey?: Hex
  rpc: string
  recipients: Recipient[]
}

export type Vault = { config: Config; sim: Sim; chain: LiveChain; wallet: Wallet }

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const KEY = /^(0x)?[0-9a-fA-F]{64}$/

export const isAddress = (text: string): text is Hex => ADDRESS.test(text)

/** Reads and checks the HARDSTOP_* variables. Every failure is a sentence that names the variable to fix. */
export function readConfig(env: Env): Config {
  const chainText = env.HARDSTOP_CHAIN_ID?.trim() || '84532'
  const network = /^\d{1,12}$/.test(chainText) ? networkOf(Number(chainText)) : undefined
  if (!network) {
    const allowed = NETWORKS.map((n) => `${n.chainId} (${n.name})`).join(' or ')
    throw new Error(
      `HARDSTOP_CHAIN_ID is "${chainText.slice(0, 20)}", which is not a test network HARDSTOP works on. Use ${allowed}. Networks with real money are refused.`,
    )
  }

  const vault = env.HARDSTOP_VAULT?.trim()
  if (!vault) throw new Error('HARDSTOP_VAULT is not set. Set it to the vault address (0x followed by 40 hex characters).')
  if (!isAddress(vault)) throw new Error('HARDSTOP_VAULT is not an address. It should be 0x followed by 40 hex characters.')

  const key = env.HARDSTOP_AGENT_KEY?.trim()
  if (key && !KEY.test(key)) {
    throw new Error('HARDSTOP_AGENT_KEY is not a private key. It should be 64 hex characters, with or without 0x. (Its value is not shown.)')
  }

  const rpc = env.HARDSTOP_RPC?.trim() || network.rpc
  let protocol = ''
  try {
    protocol = new URL(rpc).protocol
  } catch {
    // reported below
  }
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error('HARDSTOP_RPC is not a web address. It should start with https://.')

  return {
    network,
    vault: vault.toLowerCase() as Hex,
    agentKey: key ? ((key.startsWith('0x') ? key : `0x${key}`).toLowerCase() as Hex) : undefined,
    rpc,
    recipients: parseRecipients(env.HARDSTOP_RECIPIENTS ?? ''),
  }
}

/** `name=0x...,name2=0x...` */
export function parseRecipients(text: string): Recipient[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const at = item.lastIndexOf('=')
      const name = item.slice(0, at).trim()
      const address = item.slice(at + 1).trim()
      if (at < 1 || !name || !isAddress(address)) {
        throw new Error(`HARDSTOP_RECIPIENTS has an entry "${item.slice(0, 80)}" that is not name=0x... (40 hex characters).`)
      }
      return { name, address: address.toLowerCase() as Hex }
    })
}

/** The message for a missing agent key. The owner's key is never the answer. */
export const NO_KEY =
  "HARDSTOP_AGENT_KEY is not set. Set it to the agent's private key for this vault (64 hex characters). Never use the owner's key: this server does not need it and must not have it."

/** Turns anything thrown into a sentence. */
export function plain(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : 'Something went wrong, and the network gave no reason.'
}

/**
 * An EIP-1193 stand-in over plain JSON-RPC. It answers reads and relays
 * transactions the agent has already signed; it refuses anything that would
 * need someone else's key.
 */
export function rpcWallet(url: string): Wallet {
  const host = new URL(url).host // never the full address: it may carry an API key
  let id = 0
  return {
    async request({ method, params = [] }) {
      if (method === 'eth_sendTransaction' || method === 'eth_requestAccounts' || method.startsWith('wallet_')) {
        throw new Error('This connection only relays what the agent signed. It never acts for the owner.')
      }
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
          signal: AbortSignal.timeout(20_000),
        })
      } catch (error) {
        throw new Error(`Could not reach the network at ${host}: ${plain(error)}`)
      }
      if (!response.ok) throw new Error(`The network at ${host} answered HTTP ${response.status}.`)
      const body = (await response.json().catch(() => null)) as { result?: unknown; error?: { code?: number; message?: string; data?: unknown } } | null
      if (body === null) throw new Error(`The network at ${host} sent an answer that is not JSON.`)
      if (body.error) {
        // `data` is kept so that a contract's revert can be read back (wallet.ts, revertData).
        throw Object.assign(new Error(body.error.message || `The network at ${host} refused ${method}.`), {
          code: body.error.code,
          data: body.error.data,
        })
      }
      return body.result
    },
  }
}

async function readAddress(wallet: Wallet, vault: Hex, functionName: 'owner' | 'token' | 'agent'): Promise<Hex> {
  const data = encodeFunctionData({ abi: vaultAbi, functionName })
  const answer = (await wallet.request({ method: 'eth_call', params: [{ to: vault, data }, 'latest'] })) as Hex
  return (decodeFunctionResult({ abi: vaultAbi, functionName, data: answer }) as Hex).toLowerCase() as Hex
}

/** Finds the vault on the network and checks that the agent key, if given, is this vault's agent. */
export async function connect(config: Config, wallet: Wallet = rpcWallet(config.rpc)): Promise<Vault> {
  const { network, vault } = config
  const chainId = Number(await wallet.request({ method: 'eth_chainId' }))
  if (chainId !== network.chainId) {
    throw new Error(
      `The RPC is on chain ${chainId}, not ${network.name} (${network.chainId}). Check HARDSTOP_RPC and HARDSTOP_CHAIN_ID.`,
    )
  }
  const code = (await wallet.request({ method: 'eth_getCode', params: [vault, 'latest'] })) as Hex
  if (code.length <= 2) throw new Error(`There is no vault at ${vault} on ${network.name}. Check HARDSTOP_VAULT and HARDSTOP_CHAIN_ID.`)

  const [owner, token, agent] = await Promise.all([
    readAddress(wallet, vault, 'owner'),
    readAddress(wallet, vault, 'token'),
    readAddress(wallet, vault, 'agent'),
  ])
  // The watcher has no key and only reads: a throwaway key fills the slot and never signs anything.
  const live = { chainId, vault, token, owner, agentKey: config.agentKey ?? generatePrivateKey(), launchedIn: '0x' as Hex }
  const attached = await attach(wallet, live)
  if (config.agentKey && attached.chain.agent !== agent) {
    throw new Error(
      `HARDSTOP_AGENT_KEY belongs to ${attached.chain.agent}, but the agent of vault ${vault} is ${agent}. Use this vault's agent key.`,
    )
  }
  const sim = config.agentKey ? attached.sim : Sim.attach(attached.chain, token, vault, owner, agent)
  return { config, sim, chain: attached.chain, wallet }
}

/** ETH the vault's agent has for network fees. Read for the vault's own agent, so it is right without a key too. */
export const agentGas = async ({ wallet, sim }: Vault): Promise<bigint> =>
  BigInt((await wallet.request({ method: 'eth_getBalance', params: [sim.agent, 'latest'] })) as Hex)

// --- words ----------------------------------------------------------------

export const iso = (seconds: bigint): string => new Date(Number(seconds) * 1000).toISOString()
export const usd = (units: bigint): string => inputValue(units)
export const txLink = (network: Network, hash: Hex): string => `${network.explorer}/tx/${hash}`

export function describePolicy(policy: Policy): string {
  return `up to ${formatUsd(policy.perPayment)} per payment and ${formatUsd(policy.perWindow)} per day, until ${formatTime(policy.validUntil)}${policy.paused ? ', paused' : ''}`
}

export const policyJson = (policy: Policy) => ({
  per_payment_usd: usd(policy.perPayment),
  per_day_usd: usd(policy.perWindow),
  valid_until: iso(policy.validUntil),
  paused: policy.paused,
})

export type Status = { text: string; json: Record<string, unknown> }

/** Everything the agent may want to know before spending, as the contract reports it. */
export async function status(vault: Vault): Promise<Status> {
  const { sim, chain, config } = vault
  await chain.refresh(true)
  const state: State = await sim.state()
  const { spent, resetsAt } = today(state)
  const until = state.now + DAY
  const [leftToday, worstCase, gas] = await Promise.all([sim.exposure(state.now), sim.exposure(until), agentGas(vault)])
  const { policy, queued } = state

  const lines = [
    `HARDSTOP vault ${sim.vault} on ${config.network.name} (a test network: its dollars have no value).`,
    `Rules in force: ${describePolicy(policy)}.`,
    `Today: ${formatUsd(spent)} spent, ${formatUsd(leftToday)} left. The day resets ${formatTime(resetsAt)}.`,
    `The vault holds ${formatUsd(state.vaultBalance)}. The agent has ${formatEther(gas)} ETH left for network fees.`,
    queued
      ? `A change is waiting: ${describePolicy(queued)}. It takes effect ${formatTime(queued.effectiveAt)} unless the owner cancels it.`
      : 'No change to the rules is waiting.',
    `Worst case over the next 24 hours, by the contract's own arithmetic: ${formatUsd(worstCase)}.`,
    `Next request number: ${state.ledger.nextNonce}.`,
  ]
  return {
    text: lines.join('\n'),
    json: {
      vault: sim.vault,
      agent: sim.agent,
      network: config.network.name,
      chain_id: config.network.chainId,
      now: iso(state.now),
      rules: policyJson(policy),
      spent_today_usd: usd(spent),
      left_today_usd: usd(leftToday),
      day_resets_at: iso(resetsAt),
      vault_balance_usd: usd(state.vaultBalance),
      agent_gas_eth: formatEther(gas),
      waiting_change: queued ? { ...policyJson(queued), takes_effect_at: iso(queued.effectiveAt) } : null,
      worst_case_24h_usd: usd(worstCase),
      next_nonce: state.ledger.nextNonce.toString(),
    },
  }
}
