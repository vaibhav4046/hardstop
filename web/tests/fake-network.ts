// A stand-in for a wallet connected to a real network, for tests. It answers
// the same requests a wallet does (EIP-1193) and runs every call and
// transaction on an in-memory EVM, so the compiled Fe contracts are what
// answer. It is not a real network: gas is not charged and blocks are not
// mined. What it proves is that the site's real-network code sends the right
// requests and reads the answers correctly.

import { createBlock } from '@ethereumjs/block'
import { Common, Hardfork, Mainnet } from '@ethereumjs/common'
import { createEVM, type EVM } from '@ethereumjs/evm'
import { bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util'
import { keccak256, parseTransaction, recoverTransactionAddress, toHex, type Hex } from 'viem'

export const FAKE_CHAIN_ID = 84532
const PROXY: Hex = '0x4e59b44847b379578588920ca78fbf26c0b4956c'
/** Runtime code of the deterministic deployment proxy, as deployed on public networks. */
const PROXY_CODE: Hex =
  '0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3'
const GAS_LIMIT = 10_000_000n

type Call = { from?: Hex; to?: Hex; data?: Hex; value?: Hex }
type StoredReceipt = { status: Hex; gasUsed: Hex; blockNumber: Hex; logs: { address: Hex; topics: Hex[]; data: Hex }[] }

export class FakeNetwork {
  /** Block timestamp, Unix seconds. Tests may move it. */
  now: bigint
  /** The account the "wallet" holds. */
  readonly account: Hex
  /** Every transaction the wallet's owner was asked to approve, oldest first. */
  readonly approved: Call[] = []
  /** Every transaction that arrived already signed (the agent's). */
  readonly relayed: { from: Hex; to: Hex | null }[] = []
  /** When set, the next request for approval is turned down, as if the person closed the wallet. */
  refuseNext = false
  private readonly evm: EVM
  private readonly common: Common
  private block = 1n
  private readonly receipts = new Map<Hex, StoredReceipt>()
  private readonly nonces = new Map<string, number>()

  private constructor(evm: EVM, common: Common, account: Hex, now: bigint) {
    this.evm = evm
    this.common = common
    this.account = account
    this.now = now
  }

  static async create(account: Hex, now: bigint, withProxy = true): Promise<FakeNetwork> {
    const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun })
    const evm = await createEVM({ common })
    if (withProxy) await evm.stateManager.putCode(createAddressFromString(PROXY), hexToBytes(PROXY_CODE))
    return new FakeNetwork(evm, common, account.toLowerCase() as Hex, now)
  }

  /** The wallet's one entry point. */
  request = async ({ method, params = [] }: { method: string; params?: unknown[] }): Promise<unknown> => {
    switch (method) {
      case 'eth_chainId':
        return toHex(FAKE_CHAIN_ID)
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return [this.account]
      case 'wallet_switchEthereumChain':
        return null
      case 'eth_gasPrice':
        return toHex(1_000_000_000n)
      case 'eth_getBlockByNumber':
        return { timestamp: toHex(this.now), number: toHex(this.block) }
      case 'eth_getCode':
        return bytesToHex(await this.evm.stateManager.getCode(createAddressFromString(params[0] as Hex)))
      case 'eth_getBalance': {
        const account = await this.evm.stateManager.getAccount(createAddressFromString(params[0] as Hex))
        return toHex(account?.balance ?? 0n)
      }
      case 'eth_getTransactionCount':
        return toHex(this.nonces.get((params[0] as string).toLowerCase()) ?? 0)
      case 'eth_getTransactionReceipt':
        return this.receipts.get(params[0] as Hex) ?? null
      case 'eth_call': {
        const result = await this.rehearse(params[0] as Call)
        if (!result.ok) throw Object.assign(new Error('execution reverted'), { code: 3, data: result.data })
        return result.data
      }
      case 'eth_estimateGas': {
        const result = await this.rehearse(params[0] as Call)
        if (!result.ok) throw Object.assign(new Error('execution reverted'), { code: 3, data: result.data })
        return toHex(result.gasUsed + 21_000n)
      }
      case 'eth_sendTransaction': {
        const call = params[0] as Call
        if (this.refuseNext) {
          this.refuseNext = false
          throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
        }
        if (call.from?.toLowerCase() !== this.account) throw new Error('the wallet does not hold that account')
        this.approved.push(call)
        return this.mine(this.account, call.to ?? null, call.data ?? '0x', BigInt(call.value ?? '0x0'))
      }
      case 'eth_sendRawTransaction': {
        const raw = params[0] as Hex
        const tx = parseTransaction(raw)
        if (tx.chainId !== FAKE_CHAIN_ID) throw new Error('signed for another network')
        const from = (await recoverTransactionAddress({ serializedTransaction: raw as never })).toLowerCase() as Hex
        if (tx.nonce !== (this.nonces.get(from) ?? 0)) throw new Error('nonce too low or too high')
        this.relayed.push({ from, to: tx.to ?? null })
        return this.mine(from, tx.to ?? null, tx.data ?? '0x', tx.value ?? 0n, tx.gas)
      }
      default:
        throw new Error(`the fake network does not answer ${method}`)
    }
  }

  private run(from: Hex, to: Hex | null, data: Hex, value: bigint, gasLimit = GAS_LIMIT) {
    const caller = createAddressFromString(from)
    return this.evm.runCall({
      caller,
      origin: caller,
      to: to === null ? undefined : createAddressFromString(to),
      data: hexToBytes(data),
      value,
      gasLimit,
      block: createBlock(
        { header: { timestamp: this.now, number: this.block } },
        { common: this.common, skipConsensusFormatValidation: true },
      ),
      skipBalance: true,
    })
  }

  /** Runs a call and throws its effects away. */
  private async rehearse(call: Call): Promise<{ ok: boolean; data: Hex; gasUsed: bigint }> {
    await this.evm.journal.checkpoint()
    try {
      const { execResult } = await this.run(call.from ?? this.account, call.to ?? null, call.data ?? '0x', BigInt(call.value ?? '0x0'))
      return {
        ok: execResult.exceptionError === undefined,
        data: bytesToHex(execResult.returnValue),
        gasUsed: execResult.executionGasUsed,
      }
    } finally {
      await this.evm.journal.revert()
    }
  }

  /** Runs a transaction for good and files its receipt. */
  private async mine(from: Hex, to: Hex | null, data: Hex, value: bigint, gasLimit = GAS_LIMIT): Promise<Hex> {
    this.block += 1n
    this.nonces.set(from, (this.nonces.get(from) ?? 0) + 1)
    const { execResult } = await this.run(from, to, data, value, gasLimit)
    const hash = keccak256(toHex(`${this.block}:${from}`))
    this.receipts.set(hash, {
      status: execResult.exceptionError === undefined ? '0x1' : '0x0',
      gasUsed: toHex(execResult.executionGasUsed + 21_000n),
      blockNumber: toHex(this.block),
      logs: (execResult.logs ?? []).map(([address, topics, payload]) => ({
        address: bytesToHex(address),
        topics: topics.map((topic) => bytesToHex(topic)),
        data: bytesToHex(payload),
      })),
    })
    return hash
  }
}
