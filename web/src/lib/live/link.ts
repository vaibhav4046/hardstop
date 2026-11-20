// A link that opens one vault on the activity page for its owner:
// /activity?chain=84532&vault=0x...[&who=0x...]. Alerts and the agent's
// "ask the owner" drafts carry it, so the owner can act from any browser
// that has their wallet, not only the one that created the vault.

import type { Hex } from 'viem'
import { networkOf } from './wallet.ts'

export type VaultLink = { chainId: number; vault: Hex; who: Hex | null }

const ADDRESS = /^0x[0-9a-f]{40}$/

/** Null when the address has no vault in it; 'invalid' when it names one badly or names a network this site does not use. */
export function parseVaultLink(search: string): VaultLink | 'invalid' | null {
  const params = new URLSearchParams(search)
  const chain = params.get('chain')
  const vault = params.get('vault')?.toLowerCase()
  const who = params.get('who')?.toLowerCase() ?? null
  if (chain === null && vault === undefined) return null
  if (chain === null || vault === undefined || !/^\d{1,12}$/.test(chain) || networkOf(Number(chain)) === undefined) return 'invalid'
  if (!ADDRESS.test(vault) || (who !== null && !ADDRESS.test(who))) return 'invalid'
  return { chainId: Number(chain), vault: vault as Hex, who: who as Hex | null }
}

/** The owner's page for one vault; `who` is a recipient the alert is about. */
export function vaultLink(site: string, chainId: number, vault: Hex, who?: Hex): string {
  const query = new URLSearchParams({ chain: String(chainId), vault: vault.toLowerCase() })
  if (who) query.set('who', who.toLowerCase())
  return `${site}/activity?${query}`
}
