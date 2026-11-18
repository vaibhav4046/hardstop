// What this browser keeps about a vault on a real network, written to and
// read from storage. The vault itself is on the network; this is how to find
// it, the trial agent's key, the names given to recipients and the receipts.
//
// The agent's key is kept in the open here. That is the point of the product:
// whoever holds it can only ask the vault to pay inside the owner's limits.
// What is read back is not trusted: anything malformed is thrown away.

import type { Hex } from 'viem'
import { parseSession, type Entry, type Session } from '../session.ts'
import type { LiveVault } from './launch.ts'
import { networkOf } from './wallet.ts'

export type SavedLive = { vault: LiveVault; session: Session; entries: Entry[] }

const KINDS = new Set(['payment', 'agentRaise', 'owner', 'skip'])
const isHex = (value: unknown, bytes: number): value is Hex =>
  typeof value === 'string' && new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)

/** Amounts are whole numbers too large for JSON, so each is written as `{"$n": "123"}`. */
export function stringifyLive(saved: SavedLive): string {
  return JSON.stringify({ ...saved, session: JSON.stringify(saved.session) }, (_key, value) =>
    typeof value === 'bigint' ? { $n: value.toString() } : value,
  )
}

export function parseLive(raw: string): SavedLive | null {
  let value: unknown
  try {
    value = JSON.parse(raw, (_key, item) =>
      typeof item === 'object' && item !== null && typeof item.$n === 'string' && /^\d{1,78}$/.test(item.$n) ? BigInt(item.$n) : item,
    )
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { vault, session, entries } = value as Record<string, unknown>
  if (typeof vault !== 'object' || vault === null || typeof session !== 'string' || !Array.isArray(entries)) return null

  const found = vault as Record<string, unknown>
  if (typeof found.chainId !== 'number' || networkOf(found.chainId) === undefined) return null
  if (!isHex(found.vault, 20) || !isHex(found.token, 20) || !isHex(found.owner, 20)) return null
  if (!isHex(found.agentKey, 32) || !isHex(found.launchedIn, 32)) return null

  const parsed = parseSession(session)
  if (parsed === null) return null
  // Receipts are only shown, never acted on. One that is not shaped like a receipt is dropped.
  const receipts = entries.filter(
    (entry): entry is Entry =>
      typeof entry === 'object' && entry !== null && typeof entry.id === 'number' && KINDS.has(entry.kind) && typeof entry.at === 'bigint',
  )
  return { vault: found as unknown as LiveVault, session: parsed, entries: receipts }
}
