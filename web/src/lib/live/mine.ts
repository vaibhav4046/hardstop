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

/** A vault name is at most this many bytes of UTF-8: one 32-byte word on chain. */
export const NAME_BYTES = 32

const HIDDEN_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/

/** The word stored on chain for `text`, or a plain sentence saying why it cannot be a name. */
export function encodeName(text: string): bigint | string {
  const trimmed = text.trim()
  const bytes = new TextEncoder().encode(trimmed)
  if (bytes.length > NAME_BYTES) return `A name can be at most ${NAME_BYTES} bytes; this one is ${bytes.length}.`
  if (HIDDEN_CHARACTERS.test(trimmed)) return 'A name cannot contain invisible or control characters.'
  let word = 0n
  for (const byte of bytes) word = (word << 8n) | BigInt(byte)
  return word << BigInt(8 * (NAME_BYTES - bytes.length))
}

/** The text of a stored name; '' for none. Bytes that are not valid UTF-8 are replaced, never trusted as markup. */
export function decodeName(word: bigint): string {
  const bytes: number[] = []
  for (let shift = BigInt(8 * (NAME_BYTES - 1)); shift >= 0n; shift -= 8n) bytes.push(Number((word >> shift) & 0xffn))
  while (bytes.length > 0 && bytes[bytes.length - 1] === 0) bytes.pop()
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)).replace(new RegExp(HIDDEN_CHARACTERS.source, 'g'), '')
}

/** The name `owner` gave `vault`; '' for none or when the launcher is not installed. */
export async function nameOf(wallet: Wallet, owner: Hex, vault: Hex, launcher: Hex = LAUNCHER): Promise<string> {
  const code = (await wallet.request({ method: 'eth_getCode', params: [launcher, 'latest'] })) as Hex
  if (code.length <= 2) return ''
  const word = await call(wallet, launcher, encodeFunctionData({ abi: launcherAbi, functionName: 'nameOf', args: [owner, vault] }), (data) =>
    decodeFunctionResult({ abi: launcherAbi, functionName: 'nameOf', data }),
  )
  return decodeName(word)
}

/** The data for the owner's `setName` transaction. */
export function setNameData(vault: Hex, word: bigint): Hex {
  return encodeFunctionData({ abi: launcherAbi, functionName: 'setName', args: [vault, word] })
}
