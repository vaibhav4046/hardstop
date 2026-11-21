// Re-runs the on-chain evidence on Base Sepolia with the site's own code:
// installs the launcher if it is missing, opens a vault, has the agent pay
// twice, ask for $80 and try to raise its own limit, then has the owner
// propose a raise, cancel it and pause. Prints every transaction.
//
// The owner is a throwaway TEST key read from a file outside the repo; it
// holds only faucet test ETH. Run from web/:
//   HARDSTOP_OWNER_KEY_FILE=/path/to/key.txt node scripts/base-sepolia-evidence.ts

import { readFileSync } from 'node:fs'
import { createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { rpcWallet } from '../mcp/vault.ts'
import { LAUNCHER, attach, launchVault } from '../src/lib/live/launch.ts'
import { NETWORKS, type Wallet } from '../src/lib/live/wallet.ts'
import { USD } from '../src/lib/money.ts'

const keyFile = process.env.HARDSTOP_OWNER_KEY_FILE
if (!keyFile) throw new Error('Set HARDSTOP_OWNER_KEY_FILE to a file holding a throwaway test key.')
const account = privateKeyToAccount(readFileSync(keyFile, 'utf8').trim() as Hex)
// The agent sends four transactions here, not the site's ~34, so it gets less
// gas money (0.000008 ETH, about nine payments at the measured fee).
const network = { ...NETWORKS.find((n) => n.chainId === baseSepolia.id)!, gasMoney: 8_000_000_000_000n }
const rpc = rpcWallet(network.rpc)
const signer = createWalletClient({ account, chain: baseSepolia, transport: http(network.rpc) })

/** The owner's wallet: signs locally with the test key, everything else goes to the public RPC. */
const owner: Wallet = {
  async request({ method, params = [] }) {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account.address]
    if (method === 'eth_sendTransaction') {
      const [tx] = params as { to: Hex; data?: Hex; value?: Hex }[]
      return signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined })
    }
    return rpc.request({ method, params })
  },
}

const PAYEE: Hex = '0x0000000000000000000000000000000000005109' // "Cloud hosting"
const DAY = 86_400n
const now = BigInt(Math.floor(Date.now() / 1000))
const line = (what: string, out: { tx?: Hex; ok: boolean; gasUsed: bigint; revert?: string }, extra = '') =>
  console.log(`${what.padEnd(26)} ${out.tx ?? '(not sent)'}  ${out.ok ? 'ok' : `reverted ${out.revert}`}  gas ${out.gasUsed}${extra}`)

const hadLauncher = ((await rpc.request({ method: 'eth_getCode', params: [LAUNCHER, 'latest'] })) as Hex).length > 2
console.log(`owner ${account.address}\nlauncher ${LAUNCHER} (${hadLauncher ? 'already installed' : 'installing now'})`)

const live = await launchVault(
  owner,
  network,
  {
    owner: account.address,
    agent: account.address,
    perPayment: 10n * USD,
    perWindow: 20n * USD,
    validUntil: now + 30n * DAY,
    windowSecs: DAY,
    coolingSecs: DAY,
    payees: [PAYEE],
    funding: 100n * USD,
    now,
  },
  (step) => console.log(`  step: ${step}`),
)
console.log(`vault ${live.vault}\ntoken ${live.token}\nlaunched in ${live.launchedIn}`)

const { sim } = await attach(owner, live)
console.log(`agent ${sim.agent}`)

const p1 = await sim.pay(PAYEE, 4n * USD, 0n)
line('agent pays $4', p1, `  verdict ${p1.code}`)
const p2 = await sim.pay(PAYEE, 4n * USD, 1n)
line('agent pays $4 again', p2, `  verdict ${p2.code}`)
const p3 = await sim.pay(PAYEE, 80n * USD, 2n)
line('agent asks for $80', p3, `  verdict ${p3.code} detail ${p3.detail}`)
const raise = { perPayment: 1_000n * USD, perWindow: 1_000n * USD, validUntil: now + 30n * DAY, paused: false }
line('agent raises own limit', await sim.propose(raise, sim.agent))
line('owner proposes $40/day', await sim.propose({ perPayment: 10n * USD, perWindow: 40n * USD, validUntil: now + 30n * DAY, paused: false }))
line('owner cancels it', await sim.cancelQueued())
line('owner pauses', await sim.pause())

const state = await sim.state()
console.log(
  `after: vault ${Number(await sim.balanceOf(live.vault)) / Number(USD)} test dollars, recipient ${Number(await sim.balanceOf(PAYEE)) / Number(USD)}; ` +
    `per day ${Number(state.policy.perWindow) / Number(USD)}, paused ${state.policy.paused}, queued ${state.queued ? 'yes' : 'none'}`,
)
