// A HARDSTOP vault and its test token, deployed on a private in-memory EVM.
// Every method here sends a real message to the Fe-compiled contract and
// reports what the contract did. There is no second copy of the rules in
// TypeScript.

import {
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionResult,
  encodeDeployData,
  encodeFunctionData,
  type Hex,
} from 'viem'
import { tokenAbi, tokenBytecode, vaultAbi, vaultBytecode } from './artifacts.ts'
import { Chain, type ChainLike, type Receipt } from './chain.ts'

export const ZERO: Hex = '0x0000000000000000000000000000000000000000'

export type Policy = { perPayment: bigint; perWindow: bigint; validUntil: bigint; paused: boolean }
export type Queued = Policy & { effectiveAt: bigint }
export type Ledger = { window: bigint; spent: bigint; nextNonce: bigint }
export type Schedule = { anchor: bigint; windowSecs: bigint; coolingSecs: bigint }

export type Setup = {
  owner: Hex
  agent: Hex
  perPayment: bigint
  perWindow: bigint
  validUntil: bigint
  windowSecs: bigint
  coolingSecs: bigint
  /** Up to three recipients approved from the first second. */
  payees: Hex[]
  /** Test dollars minted into the vault. */
  funding: bigint
  /** Block timestamp at creation. */
  now: bigint
}

export type VaultEvent =
  | { name: 'Paid'; nonce: bigint; to: Hex; amount: bigint; leftInWindow: bigint }
  | { name: 'Blocked'; nonce: bigint; to: Hex; amount: bigint; code: number; detail: bigint }
  | { name: 'PolicyProposed'; policy: Policy; effectiveAt: bigint }
  | { name: 'QueueCancelled' }
  | { name: 'RecipientChanged'; who: Hex; approvedFrom: bigint }
  | { name: 'Withdrawn'; amount: bigint }

/** What the contract did with one message. */
export type Outcome = {
  /** False when the contract reverted; `revert` then names the error. */
  ok: boolean
  revert?: string
  events: VaultEvent[]
  gasUsed: bigint
  /** Block timestamp the message ran at. */
  at: bigint
  /** On a real network: the transaction that carried the message. */
  tx?: Hex
}

export type PayOutcome = Outcome & {
  /** Reason code returned by `pay`; 0 is allowed. Undefined on revert. */
  code?: number
  /** Number attached to the verdict: what is left, or the limit that was hit. */
  detail?: bigint
}

export type State = {
  now: bigint
  schedule: Schedule
  policy: Policy
  queued: Queued | null
  ledger: Ledger
  vaultBalance: bigint
}

/** Addresses are compared and shown in lower case throughout. */
const lower = (address: Hex): Hex => address.toLowerCase() as Hex

/** The vault's own events among a receipt's logs. Exported for the watcher (mcp/watch.ts). */
export function decodeEvents(receipt: Receipt, vault: Hex): VaultEvent[] {
  const events: VaultEvent[] = []
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== vault.toLowerCase()) continue
    const { eventName, args } = decodeEventLog({
      abi: vaultAbi,
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data,
    })
    switch (eventName) {
      case 'Paid':
        events.push({
          name: 'Paid',
          nonce: args.nonce,
          to: lower(args.to),
          amount: args.amount,
          leftInWindow: args.left_in_window,
        })
        break
      case 'Blocked':
        events.push({
          name: 'Blocked',
          nonce: args.nonce,
          to: lower(args.to),
          amount: args.amount,
          code: args.code,
          detail: args.detail,
        })
        break
      case 'PolicyProposed':
        events.push({
          name: 'PolicyProposed',
          policy: {
            perPayment: args.per_payment,
            perWindow: args.per_window,
            validUntil: args.valid_until,
            paused: args.paused,
          },
          effectiveAt: args.effective_at,
        })
        break
      case 'QueueCancelled':
        events.push({ name: 'QueueCancelled' })
        break
      case 'RecipientChanged':
        events.push({ name: 'RecipientChanged', who: lower(args.who), approvedFrom: args.approved_from })
        break
      case 'Withdrawn':
        events.push({ name: 'Withdrawn', amount: args.amount })
        break
    }
  }
  return events
}

function revertName(data: Hex): string {
  try {
    return decodeErrorResult({ abi: vaultAbi, data }).errorName
  } catch {
    return data === '0x' ? 'reverted' : `reverted (${data.slice(0, 10)})`
  }
}

export class Sim {
  readonly chain: ChainLike
  readonly token: Hex
  readonly vault: Hex
  readonly owner: Hex
  readonly agent: Hex

  private constructor(chain: ChainLike, token: Hex, vault: Hex, owner: Hex, agent: Hex) {
    this.chain = chain
    this.token = token
    this.vault = vault
    this.owner = owner
    this.agent = agent
  }

  static async create(setup: Setup): Promise<Sim> {
    if (setup.payees.length > 3) throw new Error('at most three recipients at creation')
    const chain = await Chain.create(setup.now)
    const token = await deploy(chain, setup.owner, encodeDeployData({ abi: tokenAbi, bytecode: tokenBytecode }))
    const [a = ZERO, b = ZERO, c = ZERO] = setup.payees
    const vault = await deploy(
      chain,
      setup.owner,
      encodeDeployData({
        abi: vaultAbi,
        bytecode: vaultBytecode,
        args: [
          setup.owner,
          setup.agent,
          token,
          setup.perPayment,
          setup.perWindow,
          setup.validUntil,
          setup.windowSecs,
          setup.coolingSecs,
          a,
          b,
          c,
        ],
      }),
    )
    const sim = new Sim(chain, token, vault, setup.owner, setup.agent)
    if (setup.funding > 0n) await sim.fund(setup.funding)
    return sim
  }

  /** A vault that already exists, on whatever chain is given. Nothing is deployed. */
  static attach(chain: ChainLike, token: Hex, vault: Hex, owner: Hex, agent: Hex): Sim {
    return new Sim(chain, token, vault, owner, agent)
  }

  /** Mint test dollars into the vault. */
  async fund(amount: bigint): Promise<void> {
    const receipt = await this.chain.send(
      this.owner,
      this.token,
      encodeFunctionData({ abi: tokenAbi, functionName: 'mint', args: [this.vault, amount] }),
    )
    if (!receipt.ok) throw new Error('mint failed')
  }

  // --- the agent ----------------------------------------------------------

  /** Ask the vault to pay. `from` defaults to the agent; pass another address to play a stranger. */
  async pay(to: Hex, amount: bigint, nonce: bigint, from: Hex = this.agent): Promise<PayOutcome> {
    const receipt = await this.chain.send(
      from,
      this.vault,
      encodeFunctionData({ abi: vaultAbi, functionName: 'pay', args: [to, amount, nonce] }),
    )
    const outcome = this.outcome(receipt)
    if (!receipt.ok) return outcome
    // The verdict is what the vault recorded. On a real network `receipt.data` is a
    // rehearsal run just before sending, and the state can change in between.
    const event = outcome.events.find((e) => e.name === 'Paid' || e.name === 'Blocked')
    if (event?.name === 'Paid') return { ...outcome, code: 0, detail: event.leftInWindow }
    if (event?.name === 'Blocked') return { ...outcome, code: event.code, detail: event.detail }
    return { ...outcome, code: decodeFunctionResult({ abi: vaultAbi, functionName: 'pay', data: receipt.data }) }
  }

  /** What `pay` would answer right now. Changes nothing. */
  async preview(to: Hex, amount: bigint, nonce: bigint, from: Hex = this.agent): Promise<{ code: number; detail: bigint }> {
    const [code, detail] = await this.view('preview', [from, to, amount, nonce])
    return { code, detail }
  }

  // --- the owner ----------------------------------------------------------

  propose(policy: Policy, from: Hex = this.owner): Promise<Outcome> {
    return this.act(from, 'propose', [policy.perPayment, policy.perWindow, policy.validUntil, policy.paused])
  }

  cancelQueued(from: Hex = this.owner): Promise<Outcome> {
    return this.act(from, 'cancelQueued', [])
  }

  pause(from: Hex = this.owner): Promise<Outcome> {
    return this.act(from, 'pause', [])
  }

  setRecipient(who: Hex, approved: boolean, from: Hex = this.owner): Promise<Outcome> {
    return this.act(from, 'setRecipient', [who, approved])
  }

  withdraw(amount: bigint, from: Hex = this.owner): Promise<Outcome> {
    return this.act(from, 'withdraw', [amount])
  }

  // --- reading ------------------------------------------------------------

  async state(): Promise<State> {
    const [anchor, windowSecs, coolingSecs] = await this.view('schedule', [])
    const [perPayment, perWindow, validUntil, paused] = await this.view('policy', [])
    const [qPayment, qWindow, qUntil, qPaused, effectiveAt] = await this.view('queued', [])
    const [window, spent, nextNonce] = await this.view('ledger', [])
    return {
      now: this.chain.now,
      schedule: { anchor, windowSecs, coolingSecs },
      policy: { perPayment, perWindow, validUntil, paused },
      queued:
        effectiveAt === 0n
          ? null
          : { perPayment: qPayment, perWindow: qWindow, validUntil: qUntil, paused: qPaused, effectiveAt },
      ledger: { window, spent, nextNonce },
      vaultBalance: await this.balanceOf(this.vault),
    }
  }

  /** The most the agent can move from now until `until`, by the contract's own arithmetic. */
  exposure(until: bigint): Promise<bigint> {
    return this.view('exposure', [until])
  }

  /** The second from which `who` may be paid; 0 when not approved. */
  approvedFrom(who: Hex): Promise<bigint> {
    return this.view('approvedFrom', [who])
  }

  async balanceOf(who: Hex): Promise<bigint> {
    const receipt = await this.chain.read(
      this.owner,
      this.token,
      encodeFunctionData({ abi: tokenAbi, functionName: 'balanceOf', args: [who] }),
    )
    return decodeFunctionResult({ abi: tokenAbi, functionName: 'balanceOf', data: receipt.data })
  }

  // --- plumbing -----------------------------------------------------------

  private async act(from: Hex, functionName: OwnerFunction, args: readonly unknown[]): Promise<Outcome> {
    const data = encodeFunctionData({ abi: vaultAbi, functionName, args } as Parameters<typeof encodeFunctionData>[0])
    return this.outcome(await this.chain.send(from, this.vault, data))
  }

  private async view<F extends ViewFunction>(functionName: F, args: readonly unknown[]): Promise<ViewResult<F>> {
    const data = encodeFunctionData({ abi: vaultAbi, functionName, args } as Parameters<typeof encodeFunctionData>[0])
    const receipt = await this.chain.read(this.owner, this.vault, data)
    if (!receipt.ok) throw new Error(`${functionName} reverted: ${revertName(receipt.data)}`)
    return decodeFunctionResult({ abi: vaultAbi, functionName, data: receipt.data } as Parameters<
      typeof decodeFunctionResult
    >[0]) as ViewResult<F>
  }

  private outcome(receipt: Receipt): Outcome {
    return {
      ok: receipt.ok,
      revert: receipt.ok ? undefined : revertName(receipt.data),
      events: receipt.ok ? decodeEvents(receipt, this.vault) : [],
      gasUsed: receipt.gasUsed,
      at: this.chain.now,
      tx: receipt.hash,
    }
  }
}

type OwnerFunction = 'propose' | 'cancelQueued' | 'pause' | 'setRecipient' | 'withdraw'
type ViewFunction = 'preview' | 'exposure' | 'schedule' | 'policy' | 'queued' | 'ledger' | 'approvedFrom'
type ViewResult<F extends ViewFunction> = F extends 'preview'
  ? readonly [number, bigint]
  : F extends 'exposure'
    ? bigint
    : F extends 'schedule'
      ? readonly [bigint, bigint, bigint]
      : F extends 'policy'
        ? readonly [bigint, bigint, bigint, boolean]
        : F extends 'queued'
          ? readonly [bigint, bigint, bigint, boolean, bigint]
          : F extends 'ledger'
            ? readonly [bigint, bigint, bigint]
            : bigint

async function deploy(chain: ChainLike, from: Hex, initCode: Hex): Promise<Hex> {
  const receipt = await chain.send(from, null, initCode)
  if (!receipt.ok || !receipt.created) throw new Error(`deployment failed: ${revertName(receipt.data)}`)
  return receipt.created
}
