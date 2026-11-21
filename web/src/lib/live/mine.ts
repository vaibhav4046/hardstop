// An owner's vaults, read from the chain. The launcher keeps, for each owner,
// the list of vaults it created for them (`vaultCount`, `vaultAt` in
// fe/src/launcher.fe): only `launch` appends to it, and only for its caller,
// so a vault in this list was launched by that wallet. There is no account
// on a server: the wallet is the account, and this list is the profile.
//
// Each vault in the list is still checked like any other (`findVault`):
// its code must match a known vault build before anything it says is shown.

import { decodeFunctionResult, encodeFunctionData, erc20Abi, type Hex } from 'viem'
import { launcherAbi, vaultAbi } from '../hardstop/artifacts.ts'
import { findVault, Refused, type Found } from './find.ts'
import { LAUNCHER } from './launch.ts'
import type { Network, Wallet } from './wallet.ts'

/** The most vaults listed for one owner. ponytail: one call each; page if owners ever keep more. */
export const MAX_LISTED = 50

async function call<T>(wallet: Wallet, to: Hex, data: Hex, decode: (answer: Hex) => T): Promise<T> {
  return decode((await wallet.request({ method: 'eth_call', params: [{ to, data }, 'latest'] })) as Hex)
}

/**
 * The vaults `owner` launched through `launcher`, oldest first, at most
 * MAX_LISTED. Empty when the launcher is not installed on this network yet.
 */
export async function vaultsOf(wallet: Wallet, owner: Hex, launcher: Hex = LAUNCHER): Promise<{ vaults: Hex[]; total: bigint }> {
  const code = (await wallet.request({ method: 'eth_getCode', params: [launcher, 'latest'] })) as Hex
  if (code.length <= 2) return { vaults: [], total: 0n }
  const total = await call(wallet, launcher, encodeFunctionData({ abi: launcherAbi, functionName: 'vaultCount', args: [owner] }), (data) =>
    decodeFunctionResult({ abi: launcherAbi, functionName: 'vaultCount', data }),
  )
  const shown = Number(total > BigInt(MAX_LISTED) ? BigInt(MAX_LISTED) : total)
  const vaults = await Promise.all(
    Array.from({ length: shown }, (_, index) =>
      call(wallet, launcher, encodeFunctionData({ abi: launcherAbi, functionName: 'vaultAt', args: [owner, BigInt(index)] }), (data) =>
        decodeFunctionResult({ abi: launcherAbi, functionName: 'vaultAt', data }).toLowerCase() as Hex,
      ),
    ),
  )
  return { vaults, total }
}

export type Summary = Found & {
  vault: Hex
  perPayment: bigint
  perWindow: bigint
  validUntil: bigint
  paused: boolean
  /** When a waiting change takes effect; 0n when nothing waits. */
  changeAt: bigint
  balance: bigint
}

/** One vault, checked and summed up; a plain sentence instead when it cannot be trusted or read. */
export async function summarize(wallet: Wallet, network: Network, vault: Hex): Promise<Summary | { vault: Hex; problem: string }> {
  try {
    const found = await findVault(wallet, network, vault, { address: '', addressAndNetwork: '' })
    const [policy, queued, balance] = await Promise.all([
      call(wallet, vault, encodeFunctionData({ abi: vaultAbi, functionName: 'policy' }), (data) =>
        decodeFunctionResult({ abi: vaultAbi, functionName: 'policy', data }),
      ),
      call(wallet, vault, encodeFunctionData({ abi: vaultAbi, functionName: 'queued' }), (data) =>
        decodeFunctionResult({ abi: vaultAbi, functionName: 'queued', data }),
      ),
      call(wallet, found.token, encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [vault] }), (data) =>
        decodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', data }),
      ),
    ])
    const [perPayment, perWindow, validUntil, paused] = policy
    return { ...found, vault, perPayment, perWindow, validUntil, paused, changeAt: queued[4], balance }
  } catch (error) {
    const problem = error instanceof Refused || error instanceof Error ? error.message.trim() : 'This vault could not be read.'
    return { vault, problem }
  }
}
