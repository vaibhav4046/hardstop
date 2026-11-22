// A vault's history, from any device. The public RPCs answer `eth_getLogs`
// for 200 blocks at a time, so a block explorer's index (Etherscan-style
// API) is asked one thing only: which transactions touched the vault. That
// answer is not trusted. Each transaction's receipt is then fetched through
// the wallet, and only events the vault itself logged in a receipt that
// succeeded are shown, decoded with the vault's ABI. An index that lies can
// hide history; it cannot invent a payment or a refusal.

import { decodeEventLog, type Hex } from 'viem'
import { vaultAbi } from '../hardstop/artifacts.ts'
import type { Network, Wallet } from './wallet.ts'

/** The most transactions read back for one vault. ponytail: newest first; page if a vault ever needs more. */
export const MAX_HISTORY = 25

export type HistoryEvent =
  | { kind: 'paid'; tx: Hex; time: bigint; to: Hex; amount: bigint; nonce: bigint; leftInWindow: bigint }
  | { kind: 'blocked'; tx: Hex; time: bigint; to: Hex; amount: bigint; nonce: bigint; code: number; detail: bigint }
  | { kind: 'proposed'; tx: Hex; time: bigint; perPayment: bigint; perWindow: bigint; paused: boolean; effectiveAt: bigint }
  | { kind: 'cancelled'; tx: Hex; time: bigint }
  | { kind: 'recipient'; tx: Hex; time: bigint; who: Hex; approvedFrom: bigint }
  | { kind: 'withdrawn'; tx: Hex; time: bigint; amount: bigint }

type Receipt = { status: Hex; blockNumber: Hex; logs: { address: string; topics: Hex[]; data: Hex }[] }
type Fetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>

const HASH = /^0x[0-9a-f]{64}$/

/** Transaction hashes the index names for `vault`, newest first, unique, at most MAX_HISTORY. */
async function indexed(indexer: string, vault: Hex, get: Fetch): Promise<Hex[]> {
  const query = new URLSearchParams({ module: 'logs', action: 'getLogs', address: vault, fromBlock: '0', toBlock: 'latest' })
  const response = await get(`${indexer}?${query}`)
  if (!response.ok) throw new Error('The block explorer did not answer. Try again in a moment.')
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('The block explorer did not answer. Try again in a moment.')
  }
  const result = body && typeof body === 'object' ? (body as { result?: unknown }).result : undefined
  if (!Array.isArray(result)) throw new Error('The block explorer did not answer. Try again in a moment.')
  const hashes: Hex[] = []
  for (const row of [...result].reverse()) {
    const hash = typeof row?.transactionHash === 'string' ? row.transactionHash.toLowerCase() : ''
    if (HASH.test(hash) && !hashes.includes(hash as Hex)) hashes.push(hash as Hex)
    if (hashes.length === MAX_HISTORY) break
  }
  return hashes
}

function decode(tx: Hex, time: bigint, log: Receipt['logs'][number]): HistoryEvent | null {
  let event
  try {
    event = decodeEventLog({ abi: vaultAbi, topics: log.topics as [Hex, ...Hex[]], data: log.data })
  } catch {
    return null
  }
  const a = event.args as Record<string, unknown>
  switch (event.eventName) {
    case 'Paid':
      return { kind: 'paid', tx, time, to: (a.to as Hex).toLowerCase() as Hex, amount: a.amount as bigint, nonce: a.nonce as bigint, leftInWindow: a.left_in_window as bigint }
    case 'Blocked':
      return { kind: 'blocked', tx, time, to: (a.to as Hex).toLowerCase() as Hex, amount: a.amount as bigint, nonce: a.nonce as bigint, code: Number(a.code), detail: a.detail as bigint }
    case 'PolicyProposed':
      return { kind: 'proposed', tx, time, perPayment: a.per_payment as bigint, perWindow: a.per_window as bigint, paused: a.paused as boolean, effectiveAt: a.effective_at as bigint }
    case 'QueueCancelled':
      return { kind: 'cancelled', tx, time }
    case 'RecipientChanged':
      return { kind: 'recipient', tx, time, who: (a.who as Hex).toLowerCase() as Hex, approvedFrom: a.approved_from as bigint }
    case 'Withdrawn':
      return { kind: 'withdrawn', tx, time, amount: a.amount as bigint }
    default:
      return null
  }
}

/**
 * The vault's own events, newest first, each read from its receipt through
 * the wallet. `get` is the network fetch (a parameter so tests can give it
 * an index that lies).
 */
export async function vaultHistory(wallet: Wallet, network: Network, vault: Hex, get: Fetch = fetch): Promise<HistoryEvent[]> {
  if (!network.indexer) throw new Error(`No block explorer is set up for ${network.name}.`)
  const self = vault.toLowerCase()
  const events: HistoryEvent[] = []
  for (const tx of await indexed(network.indexer, vault, get)) {
    const receipt = (await wallet.request({ method: 'eth_getTransactionReceipt', params: [tx] })) as Receipt | null
    if (!receipt || receipt.status !== '0x1') continue
    const ours = receipt.logs.filter((log) => log.address.toLowerCase() === self)
    if (ours.length === 0) continue
    const block = (await wallet.request({ method: 'eth_getBlockByNumber', params: [receipt.blockNumber, false] })) as { timestamp: Hex } | null
    const time = block ? BigInt(block.timestamp) : 0n
    for (const log of [...ours].reverse()) {
      const event = decode(tx, time, log)
      if (event) events.push(event)
    }
  }
  return events
}
