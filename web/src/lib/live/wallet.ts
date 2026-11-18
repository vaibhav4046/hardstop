// Talking to a real network through the visitor's own wallet. The site holds
// no key of the visitor's and has no server: every request goes to the wallet
// the browser provides (EIP-1193), and the wallet decides what to sign.

import type { Hex } from 'viem'

export type Wallet = { request(args: { method: string; params?: unknown[] }): Promise<unknown> }

export type Network = {
  chainId: number
  name: string
  /** Where a transaction or address can be looked up. */
  explorer: string
  /** Given to the wallet if it does not know the network yet. */
  rpc: string
  /** ETH handed to the trial agent's key at launch so that it can pay for its own requests. */
  gasMoney: bigint
}

/** Public test networks only. Their coins and the test dollars have no value. */
export const NETWORKS: Network[] = [
  {
    chainId: 84532,
    name: 'Base Sepolia',
    explorer: 'https://sepolia.basescan.org',
    rpc: 'https://sepolia.base.org',
    // 0.00003 ETH: about 34 agent payments at the fee measured on Base Sepolia
    // (0.00000088 ETH each, 2026-11-18). With the first launch's own fees
    // (0.000024 ETH) it still fits in one 0.0001 ETH faucet claim.
    gasMoney: 30_000_000_000_000n,
  },
  {
    chainId: 11155111,
    name: 'Sepolia',
    explorer: 'https://sepolia.etherscan.io',
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    gasMoney: 3_000_000_000_000_000n, // 0.003 ETH: gas costs more there
  },
]

export const networkOf = (chainId: number): Network | undefined => NETWORKS.find((network) => network.chainId === chainId)

/** The wallet this browser offers, if any. */
export function injectedWallet(): Wallet | null {
  const candidate = (globalThis as { ethereum?: unknown }).ethereum
  return typeof candidate === 'object' && candidate !== null && 'request' in candidate ? (candidate as Wallet) : null
}

export const toHex = (value: bigint | number): Hex => `0x${value.toString(16)}`

/** The bytes a contract reverted with, dug out of whatever shape the wallet reports the failure in. */
export function revertData(error: unknown): Hex | null {
  const seen = new Set<unknown>()
  const search = (value: unknown, depth: number): Hex | null => {
    if (depth > 4 || value === null || seen.has(value)) return null
    if (typeof value === 'string') return /^0x([0-9a-fA-F]{2})*$/.test(value) ? (value as Hex) : null
    if (typeof value !== 'object') return null
    seen.add(value)
    const record = value as Record<string, unknown>
    for (const key of ['data', 'originalError', 'error', 'cause']) {
      const found = search(record[key], depth + 1)
      if (found !== null) return found
    }
    return null
  }
  return search((error as { data?: unknown })?.data, 0) ?? search(error, 0)
}

/** True when the failure was the contract refusing, not the wallet or the network failing. */
export function isRevert(error: unknown): boolean {
  if (revertData(error) !== null) return true
  const message = String((error as { message?: unknown })?.message ?? '').toLowerCase()
  return message.includes('revert')
}

/** True when the person closed the wallet's window instead of approving. */
export function isRefusal(error: unknown): boolean {
  return (error as { code?: unknown })?.code === 4001
}

export async function accountOf(wallet: Wallet): Promise<Hex> {
  const accounts = (await wallet.request({ method: 'eth_requestAccounts' })) as string[]
  if (!accounts[0]) throw new Error('The wallet did not share an account.')
  return accounts[0].toLowerCase() as Hex
}

/** Puts the wallet on the given network, adding it first if the wallet has never heard of it. */
export async function switchTo(wallet: Wallet, network: Network): Promise<void> {
  const current = Number((await wallet.request({ method: 'eth_chainId' })) as string)
  if (current === network.chainId) return
  const chainId = toHex(network.chainId)
  try {
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  } catch (error) {
    if ((error as { code?: unknown })?.code !== 4902) throw error
    await wallet.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId,
          chainName: network.name,
          rpcUrls: [network.rpc],
          blockExplorerUrls: [network.explorer],
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        },
      ],
    })
  }
}

type RawReceipt = { status: Hex; gasUsed: Hex; blockNumber: Hex; logs: { address: Hex; topics: Hex[]; data: Hex }[] }

/** Waits until the network has included the transaction. */
export async function waitFor(wallet: Wallet, hash: Hex, everyMs = 1500, forMs = 180_000): Promise<RawReceipt> {
  const deadline = Date.now() + forMs
  for (;;) {
    const receipt = (await wallet.request({ method: 'eth_getTransactionReceipt', params: [hash] })) as RawReceipt | null
    if (receipt !== null && receipt.blockNumber) return receipt
    if (Date.now() > deadline) throw new Error('The network has not confirmed the transaction after three minutes.')
    await new Promise((resolve) => setTimeout(resolve, everyMs))
  }
}
