// A private, in-memory EVM. It runs the bytecode the Fe compiler produced,
// unchanged, in the browser or in Node. Nothing here talks to a network and
// nothing here has value: it is a simulator, and the UI must say so.

import { createBlock } from '@ethereumjs/block'
import { Common, Hardfork, Mainnet } from '@ethereumjs/common'
import { createEVM, type EVM } from '@ethereumjs/evm'
import { bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util'
import type { Hex } from 'viem'

export type Log = { address: Hex; topics: Hex[]; data: Hex }

export type Receipt = {
  /** False when the call reverted. `data` then holds the revert payload. */
  ok: boolean
  data: Hex
  logs: Log[]
  gasUsed: bigint
  /** Set when the call created a contract. */
  created?: Hex
  /** On a real network: the transaction that carried the call. Absent when nothing was sent. */
  hash?: Hex
}

/**
 * What a vault needs from a chain. The in-memory `Chain` below is one; a
 * real network reached through a wallet (../live/chain.ts) is another.
 */
export type ChainLike = {
  /** Current block timestamp, Unix seconds. */
  now: bigint
  send(from: Hex, to: Hex | null, data: Hex, value?: bigint): Promise<Receipt>
  read(from: Hex, to: Hex, data: Hex): Promise<Receipt>
  /** Move the clock forward. Only a simulated chain can. */
  advance(seconds: bigint): void
}

const GAS_LIMIT = 10_000_000n

export class Chain {
  private blockNumber = 1n
  private readonly evm: EVM
  private readonly common: Common
  /** Current block timestamp, Unix seconds. */
  now: bigint

  private constructor(evm: EVM, common: Common, now: bigint) {
    this.evm = evm
    this.common = common
    this.now = now
  }

  static async create(now: bigint): Promise<Chain> {
    const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun })
    const evm = await createEVM({ common })
    return new Chain(evm, common, now)
  }

  /** Move the clock forward. */
  advance(seconds: bigint): void {
    if (seconds < 0n) throw new Error('time only moves forward')
    this.now += seconds
  }

  /** Run a state-changing call. A revert undoes everything the call did. */
  send(from: Hex, to: Hex | null, data: Hex, value = 0n): Promise<Receipt> {
    this.blockNumber += 1n
    return this.run(from, to, data, false, value)
  }

  /** Run a call that may not change state. */
  read(from: Hex, to: Hex, data: Hex): Promise<Receipt> {
    return this.run(from, to, data, true)
  }

  private async run(from: Hex, to: Hex | null, data: Hex, isStatic: boolean, value = 0n): Promise<Receipt> {
    const caller = createAddressFromString(from)
    const block = createBlock(
      { header: { timestamp: this.now, number: this.blockNumber } },
      { common: this.common, skipConsensusFormatValidation: true },
    )
    const result = await this.evm.runCall({
      caller,
      origin: caller,
      to: to === null ? undefined : createAddressFromString(to),
      data: hexToBytes(data),
      value,
      gasLimit: GAS_LIMIT,
      block,
      isStatic,
      skipBalance: true,
    })
    const exec = result.execResult
    return {
      ok: exec.exceptionError === undefined,
      data: bytesToHex(exec.returnValue),
      logs: (exec.logs ?? []).map(([address, topics, payload]) => ({
        address: bytesToHex(address),
        topics: topics.map((topic) => bytesToHex(topic)),
        data: bytesToHex(payload),
      })),
      gasUsed: exec.executionGasUsed,
      created: result.createdAddress ? (result.createdAddress.toString() as Hex) : undefined,
    }
  }
}
