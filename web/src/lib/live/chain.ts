// A real network, in the shape the vault wrapper expects of a chain.
//
// Two people can send: the owner, through their wallet, and the trial agent,
// with a key this browser made for it. Everything else is refused here, as it
// would be by the network.
//
// Before anything is sent, the same call is run without sending. If the
// contract would refuse it outright (a revert), that refusal is the answer
// and no gas is spent on a transaction that could only fail.

import { privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'
import type { ChainLike, Receipt } from '../hardstop/chain.ts'
import { isRevert, revertData, sendAsOwner, toHex, waitFor, type Wallet } from './wallet.ts'

/** How stale the clock may be before the latest block is asked for again. */
const CLOCK_MS = 4000
/** Gas limit floor for the agent's requests: enough for a payment that pays. */
const AGENT_GAS_FLOOR = 200_000n
const bigMax = (a: bigint, b: bigint): bigint => (a > b ? a : b)

export class LiveChain implements ChainLike {
  now = 0n
  readonly agent: Hex
  private readonly wallet: Wallet
  private readonly chainId: number
  private readonly owner: Hex
  /** Null when this browser only views the vault as its owner: nothing can be sent as the agent. */
  private readonly agentKey: Hex | null
  private clockReadAt = 0
  /** Milliseconds between checks for a receipt. Tests shorten it. */
  pollMs = 1500

  /** `agent` is needed only without a key; with one, the agent is whoever the key belongs to. */
  constructor(wallet: Wallet, chainId: number, owner: Hex, agentKey: Hex | null, agent?: Hex) {
    this.wallet = wallet
    this.chainId = chainId
    this.owner = owner.toLowerCase() as Hex
    this.agentKey = agentKey
    const address = agentKey === null ? agent : privateKeyToAccount(agentKey).address
    if (address === undefined) throw new Error('A vault opened without its agent key needs the agent address.')
    this.agent = address.toLowerCase() as Hex
  }

  advance(): void {
    throw new Error('The clock of a real network cannot be moved.')
  }

  /** Sets `now` to the latest block's time. */
  async refresh(force = false): Promise<void> {
    if (!force && Date.now() - this.clockReadAt < CLOCK_MS) return
    const block = (await this.wallet.request({ method: 'eth_getBlockByNumber', params: ['latest', false] })) as { timestamp: Hex }
    this.now = BigInt(block.timestamp)
    this.clockReadAt = Date.now()
  }

  async read(from: Hex, to: Hex, data: Hex): Promise<Receipt> {
    await this.refresh()
    try {
      const answer = (await this.wallet.request({ method: 'eth_call', params: [{ from, to, data }, 'latest'] })) as Hex
      return { ok: true, data: answer, logs: [], gasUsed: 0n }
    } catch (error) {
      if (!isRevert(error)) throw error
      return { ok: false, data: revertData(error) ?? '0x', logs: [], gasUsed: 0n }
    }
  }

  async send(from: Hex, to: Hex | null, data: Hex, value = 0n): Promise<Receipt> {
    if (to === null) throw new Error('Contracts are created through the launcher, not directly.')
    const sender = from.toLowerCase()
    const rehearsal = await this.read(from, to, data)
    if (!rehearsal.ok) return rehearsal

    let hash: Hex
    if (sender === this.agent) hash = await this.sendAsAgent(to, data)
    else if (sender === this.owner) {
      hash = await sendAsOwner(this.wallet, { from, to, data, value: toHex(value) })
    } else throw new Error(`Nobody here holds a key for ${from}.`)

    const receipt = await waitFor(this.wallet, hash, this.pollMs)
    await this.refresh(true)
    const ok = receipt.status === '0x1'
    return {
      ok,
      // A transaction does not report what the call returned; the rehearsal just before it did,
      // against state that may since have changed. Callers take the verdict from `logs`, which
      // are what happened on chain. A failed transaction's revert payload is not known here.
      data: ok ? rehearsal.data : '0x',
      logs: receipt.logs.map((log) => ({ address: log.address, topics: log.topics, data: log.data })),
      gasUsed: BigInt(receipt.gasUsed),
      hash,
    }
  }

  /** ETH the trial agent's key has left to pay for its requests. */
  async agentGas(): Promise<bigint> {
    return BigInt((await this.wallet.request({ method: 'eth_getBalance', params: [this.agent, 'latest'] })) as Hex)
  }

  /** The agent signs with its own key; the wallet only passes the signed transaction on. */
  private async sendAsAgent(to: Hex, data: Hex): Promise<Hex> {
    if (this.agentKey === null) throw new Error('This page holds no agent key, so it cannot ask the vault to pay.')
    const account = privateKeyToAccount(this.agentKey)
    const ask = (method: string, params: unknown[]) => this.wallet.request({ method, params }) as Promise<Hex>
    const [nonce, gasPrice, estimate] = await Promise.all([
      ask('eth_getTransactionCount', [this.agent, 'pending']),
      ask('eth_gasPrice', []),
      ask('eth_estimateGas', [{ from: this.agent, to, data }]),
    ])
    const signed = await account.signTransaction({
      type: 'legacy',
      chainId: this.chainId,
      nonce: Number(nonce),
      to,
      data,
      // Room to spare on both: a request that runs out of gas would look like a refusal.
      // The floor covers a payment the rehearsal refused but the chain pays (the paid
      // path measured 122,149 gas on Base Sepolia, a refusal about 50,000). Only gas
      // used is charged.
      gas: bigMax((BigInt(estimate) * 13n) / 10n, AGENT_GAS_FLOOR),
      gasPrice: (BigInt(gasPrice) * 12n) / 10n,
    })
    return ask('eth_sendRawTransaction', [signed])
  }
}
