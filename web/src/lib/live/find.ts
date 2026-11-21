// Finding a vault from nothing but its address: used by the website, to open
// a vault from a link, and by the MCP server and watcher. What the network
// answers is not trusted until the code at the address matches a vault build
// a HARDSTOP launcher deployed.

import { decodeFunctionResult, encodeFunctionData, keccak256, zeroAddress, type Hex } from 'viem'
import { vaultAbi } from '../hardstop/artifacts.ts'
import type { Schedule } from '../hardstop/sim.ts'
import type { Network, Wallet } from './wallet.ts'

/** A refusal that trying again cannot fix: the address is not a vault this program trusts, say. */
export class Refused extends Error {}

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
  '0x0d29aaa99568bef7f1b8a9e7f9f4caedaa0690673f163ed325e00699c1bd836b':
    "the current build, where Terms is not Copy and changes in place (launchers 0xcca9a9e12a1f817299a8c0ac076049e1f901e398, which also lists and names each owner's vaults; 0xeac071c085b20c02f36ed1771cbf9826da6b8e02, which lists them; and 0x77b42805c30cc6a0e598f02a9d8b4a9525bab4ee, all on Base Sepolia since 2026-11-21)",
  '0xb5b582328f1d7df187779837f3b8a58c28328ca7bfac887928eb4e6a91c259ce':
    "an earlier build, where the owner's proof carries the chain's time (launcher 0x770bbe43a3669f066b8dc3274ff6dca9f22a8fd1, on Base Sepolia since 2026-11-20)",
  '0x4975c54738332e56f3f39e3d525cf2ea5432281b830a4165eeb5f59fe3c21b84':
    'an earlier build, with amend and cancel checked at compile time (launcher 0xed8a5d83c64f71b6d027742124239dccbf018e44, on Base Sepolia since 2026-11-19)',
  '0xa5840ccfc835c9734732b1e29de030b851da06e4e3be8a12a6288c5573514c2d':
    'an earlier build, with sealed recipient approvals (launcher 0xbc4c616910af6cc7fd68b1e6ddce85e7b4b9859b)',
  '0x6e3ff3daea0dc95ed16ecaa344d3fdfdda76949991bf822fa040130ac3d1e719':
    'an earlier build, with sealed Terms (launcher 0xa5ecc8802db5520ab089d63b39bb4508d3794299)',
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

export type Found = { owner: Hex; token: Hex; agent: Hex; schedule: Schedule }

/**
 * Checks that `vault` on the wallet's current network is a HARDSTOP vault and
 * reads who its owner, agent and token are. `check` ends each refusal with
 * what to look at: an environment variable for the server, the link for the site.
 */
export async function findVault(
  wallet: Wallet,
  network: Network,
  vault: Hex,
  check: { address: string; addressAndNetwork: string },
): Promise<Found> {
  const code = (await wallet.request({ method: 'eth_getCode', params: [vault, 'latest'] })) as Hex
  if (code.length <= 2) throw new Error(`There is no vault at ${vault} on ${network.name}. ${check.addressAndNetwork}`)
  const codeHash = vaultCodeHash(code)
  if (!codeHash || !(codeHash in KNOWN_VAULT_CODE)) {
    throw new Refused(
      `The contract at ${vault} on ${network.name} is not a HARDSTOP vault: its code matches no vault build this program knows, so nothing it answers can be trusted. ${check.address} Nothing was sent.`,
    )
  }
  const schedule = await readSchedule(wallet, vault)
  if (schedule.windowSecs === 0n || schedule.coolingSecs < MIN_COOLING_SECS) {
    throw new Refused(
      `The vault at ${vault} has a schedule no HARDSTOP launcher could have made (a zero window or a cooling period under a minute). ${check.address}`,
    )
  }
  const [owner, token, agent] = await Promise.all([
    readAddress(wallet, vault, 'owner'),
    readAddress(wallet, vault, 'token'),
    readAddress(wallet, vault, 'agent'),
  ])
  // The vault constructor refuses these (fe/src/vault.fe, `init`): only a
  // hand-made deployment of the same code could hold them.
  if ([owner, token, agent].includes(zeroAddress) || owner === agent) {
    throw new Refused(
      `The vault at ${vault} has an owner, agent and token no HARDSTOP launcher could have set (one is the zero address, or the owner is the agent). ${check.address}`,
    )
  }
  return { owner, token, agent, schedule }
}
