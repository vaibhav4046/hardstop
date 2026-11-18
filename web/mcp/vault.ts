// Shared by the MCP server (server.ts) and the watcher (watch.ts): the
// configuration read from the environment, a JSON-RPC connection, and the
// vault reached through the web app's own code (src/lib/live). Nothing here
// decides whether a payment is allowed; the contract does.
//
// Only the agent's key is ever read. The owner's key is never asked for, and
// the connection refuses to send anything as anyone but the agent.

import { decodeFunctionResult, encodeFunctionData, formatEther, keccak256, type Hex } from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import { vaultAbi } from '../src/lib/hardstop/artifacts.ts'
import { Sim, type Policy, type Schedule, type State } from '../src/lib/hardstop/sim.ts'
import type { LiveChain } from '../src/lib/live/chain.ts'
import { attach } from '../src/lib/live/launch.ts'
import { NETWORKS, networkOf, type Network, type Wallet } from '../src/lib/live/wallet.ts'
import { formatDuration, formatTime, formatUsd, inputValue } from '../src/lib/money.ts'
import { leftToday as leftInDay, today, type Recipient } from '../src/lib/session.ts'

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

/** `schedule` never changes after a vault is created, so it is read once, at connection. */
export type Vault = { config: Config; sim: Sim; chain: LiveChain; wallet: Wallet; schedule: Schedule }

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

/** A refusal that trying again cannot fix: the address is not a vault this program trusts, say. */
export class Refused extends Error {}

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

async function readSchedule(wallet: Wallet, vault: Hex): Promise<Schedule> {
  const data = encodeFunctionData({ abi: vaultAbi, functionName: 'schedule' })
  const answer = (await wallet.request({ method: 'eth_call', params: [{ to: vault, data }, 'latest'] })) as Hex
  const [anchor, windowSecs, coolingSecs] = decodeFunctionResult({ abi: vaultAbi, functionName: 'schedule', data: answer })
  return { anchor, windowSecs, coolingSecs }
}

/**
 * A vault's runtime code is the compiled contract followed by 128 bytes its
 * constructor fills in: owner, agent and token (32 bytes each) and the packed
 * schedule. Those differ from vault to vault, so what is compared is the
 * keccak256 of the code without them. Every vault build a HARDSTOP launcher
 * has deployed is listed; all of them answer the same functions and emit the
 * same events (the builds differ in the kernel's internals). The first entry
 * is checked against `vaultBytecode` in src/lib/hardstop/artifacts.ts by
 * tests/vault-code.test.ts, so a rebuilt vault cannot be forgotten here.
 */
export const VAULT_IMMUTABLE_BYTES = 128
export const KNOWN_VAULT_CODE: Readonly<Record<Hex, string>> = {
  '0x6e3ff3daea0dc95ed16ecaa344d3fdfdda76949991bf822fa040130ac3d1e719':
    'the current build, with sealed Terms (launcher 0xa5ecc8802db5520ab089d63b39bb4508d3794299)',
  '0x94c9fa9ac1757b70c2624ccd6e8823e0bdfa4fb3fd413f7e57e98d99fd313e75':
    'an earlier build (launchers 0x811e79d3bd786fb5701e0e66cc287fcaa24e558b and 0x9fa47775b526373ba8d9b7d8a7cc84ca487540e1)',
  '0x815c1dd4f08463bc5ed5b2222e552e4963d1cc1b153723d1137852d61d49bf04':
    'an earlier build (launcher 0xe7d4489cde5cdaabbce571162ec14beca324b7c3)',
  '0xfcd06b30860cdc183314f1860f53500bf4dd8c8792ec3dae46658f1aae418e63':
    'an earlier build (launchers 0x956fbbde5fcb981e5a8507b369c79105815d562d and 0x3b835612009343eea6d14f79302412bcfb09e9df)',
}

/** keccak256 of a vault's runtime code without its constructor-filled tail; undefined if the code is too short to be a vault. */
export function vaultCodeHash(code: Hex): Hex | undefined {
  const body = code.length - 2 - 2 * VAULT_IMMUTABLE_BYTES
  return body > 0 ? keccak256(`0x${code.slice(2, 2 + body)}`) : undefined
}

/** The vault constructor refuses a cooling period shorter than this (fe/src/vault.fe, MIN_COOLING_SECS). */
const MIN_COOLING_SECS = 60n

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
  const codeHash = vaultCodeHash(code)
  if (!codeHash || !(codeHash in KNOWN_VAULT_CODE)) {
    throw new Refused(
      `The contract at ${vault} on ${network.name} is not a HARDSTOP vault: its code matches no vault build this program knows, so nothing it answers can be trusted. Check HARDSTOP_VAULT. Nothing was sent.`,
    )
  }
  const schedule = await readSchedule(wallet, vault)
  if (schedule.windowSecs === 0n || schedule.coolingSecs < MIN_COOLING_SECS) {
    throw new Refused(
      `The vault at ${vault} has a schedule no HARDSTOP launcher could have made (a zero window or a cooling period under a minute). Check HARDSTOP_VAULT.`,
    )
  }

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
  return { config, sim, chain: attached.chain, wallet, schedule }
}

/** ETH the vault's agent has for network fees. Read for the vault's own agent, so it is right without a key too. */
export const agentGas = async ({ wallet, sim }: Vault): Promise<bigint> =>
  BigInt((await wallet.request({ method: 'eth_getBalance', params: [sim.agent, 'latest'] })) as Hex)

// --- words ----------------------------------------------------------------

export const iso = (seconds: bigint): string => new Date(Number(seconds) * 1000).toISOString()
export const usd = (units: bigint): string => inputValue(units)
export const txLink = (network: Network, hash: Hex): string => `${network.explorer}/tx/${hash}`

/**
 * How to talk about a vault's spending window. A vault can be launched with any
 * window length; "day" is said only when it is exactly 86,400 seconds.
 */
export type WindowWords = {
  /** "per day", "per 1 hour", "per window of 90 seconds" */
  per: string
  /** "today", "in this window" */
  left: string
  /** "Today", "This window" */
  current: string
  /** "day", "window" */
  period: string
  /** One window as a span of time: "24 hours", "1 hour", "90 seconds" */
  span: string
}

export function windowWords(windowSecs: bigint): WindowWords {
  if (windowSecs === DAY) return { per: 'per day', left: 'today', current: 'Today', period: 'day', span: '24 hours' }
  const round = windowSecs % 60n === 0n
  const span = round ? formatDuration(windowSecs) : `${windowSecs} seconds`
  return { per: round ? `per ${span}` : `per window of ${span}`, left: 'in this window', current: 'This window', period: 'window', span }
}

export function describePolicy(policy: Policy, windowSecs: bigint): string {
  return `up to ${formatUsd(policy.perPayment)} per payment and ${formatUsd(policy.perWindow)} ${windowWords(windowSecs).per}, until ${formatTime(policy.validUntil)}${policy.paused ? ', paused' : ''}`
}

/** `per_day_usd` is the limit per spending window (`window_secs`); the name dates from when every window was a day. */
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
  const { windowSecs } = state.schedule
  const words = windowWords(windowSecs)
  // One window ahead: for a daily vault, the next 24 hours.
  const until = state.now + windowSecs
  const [leftToday, worstCase, gas] = await Promise.all([leftInDay(sim, state), sim.exposure(until), agentGas(vault)])
  const { policy, queued } = state

  const lines = [
    `HARDSTOP vault ${sim.vault} on ${config.network.name} (a test network: its dollars have no value).`,
    `Rules in force: ${describePolicy(policy, windowSecs)}.`,
    `${words.current}: ${formatUsd(spent)} spent, ${formatUsd(leftToday)} left. The ${words.period} resets ${formatTime(resetsAt)}.`,
    `The vault holds ${formatUsd(state.vaultBalance)}. The agent has ${formatEther(gas)} ETH left for network fees.`,
    queued
      ? `A change is waiting: ${describePolicy(queued, windowSecs)}. It takes effect ${formatTime(queued.effectiveAt)} unless the owner cancels it.`
      : 'No change to the rules is waiting.',
    `Worst case over the next ${words.span}, by the contract's own arithmetic: ${formatUsd(worstCase)}. This span can cross the ${words.period}'s reset, so it can include part of the next ${words.period}'s allowance.`,
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
      // The *_today_*, per_day, day_resets_at and worst_case_24h names are kept, but they mean
      // "this window" and "the next window_secs": a day only when window_secs is 86400.
      window_secs: windowSecs.toString(),
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
