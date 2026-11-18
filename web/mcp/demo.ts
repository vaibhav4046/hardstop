// HARDSTOP_FAKE=1: a demo with no network and no keys to find. It starts the
// in-memory stand-in network the tests use (tests/fake-network.ts, which runs
// the compiled Fe contracts), launches a vault on it exactly as the site does,
// and hands back the settings an agent would be given. Nothing here has value
// or leaves this process.

import type { Hex } from 'viem'
import { launchVault } from '../src/lib/live/launch.ts'
import { NETWORKS, type Wallet } from '../src/lib/live/wallet.ts'
import { USD } from '../src/lib/money.ts'
import { FAKE_CHAIN_ID, FakeNetwork } from '../tests/fake-network.ts'
import { DAY, type Env } from './vault.ts'

const OWNER: Hex = '0x00000000000000000000000000000000000a11ce'
export const DEMO_PAYEE: Hex = '0x0000000000000000000000000000000000005109'
export const DEMO_NAME = 'in-memory demo network (HARDSTOP_FAKE=1, nothing is real)'

/** $10 per payment, $20 a day, 30 days, one approved recipient, $100 in the vault. */
export async function demo(): Promise<{ env: Env; wallet: Wallet }> {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const network = await FakeNetwork.create(OWNER, now)
  const live = await launchVault(
    network,
    NETWORKS.find((n) => n.chainId === FAKE_CHAIN_ID)!,
    {
      owner: OWNER,
      agent: OWNER, // replaced by a fresh key at launch, as on a real network
      perPayment: 10n * USD,
      perWindow: 20n * USD,
      validUntil: now + 30n * DAY,
      windowSecs: DAY,
      coolingSecs: DAY,
      payees: [DEMO_PAYEE],
      funding: 100n * USD,
      now,
    },
    () => {},
    1,
  )
  return {
    wallet: network,
    env: {
      HARDSTOP_AGENT_KEY: live.agentKey,
      HARDSTOP_VAULT: live.vault,
      HARDSTOP_CHAIN_ID: String(FAKE_CHAIN_ID),
      HARDSTOP_RECIPIENTS: `Cloud hosting=${DEMO_PAYEE}`,
    },
  }
}
