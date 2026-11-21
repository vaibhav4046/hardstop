// The use cases README.md lists that the main evidence run does not cover,
// run on Base Sepolia with the site's own code and a throwaway TEST key:
//
// - a trial budget that expires: a vault valid for about two minutes pays
//   before its end and refuses after it;
// - an agent paying another agent: a vault whose approved recipient is
//   another HARDSTOP vault, funding that agent's budget;
// - one owner, many vaults: the launcher lists them all, each with its name;
// - the activity feed reads the expiry refusal back from the network.
//
// It also writes the use-case vault's agent key to a file OUTSIDE the repo
// (HARDSTOP_AGENT_OUT) for a real MCP client to use. The key is never printed.
//
//   HARDSTOP_OWNER_KEY_FILE=... HARDSTOP_AGENT_OUT=... node scripts/base-sepolia-usecases.ts <other vault>

import { readFileSync, writeFileSync } from 'node:fs'
import { createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { rpcWallet } from '../mcp/vault.ts'
import { reasonName } from '../src/lib/hardstop/reasons.ts'
import { vaultHistory } from '../src/lib/live/history.ts'
import { attach, LAUNCHER, launchVault } from '../src/lib/live/launch.ts'
import { encodeName, nameOf, setNameData, vaultsOf } from '../src/lib/live/mine.ts'
import { NETWORKS, waitFor, type Wallet } from '../src/lib/live/wallet.ts'
import { formatUsd, USD } from '../src/lib/money.ts'

const keyFile = process.env.HARDSTOP_OWNER_KEY_FILE
const agentOut = process.env.HARDSTOP_AGENT_OUT
const other = process.argv[2]?.toLowerCase() as Hex | undefined
if (!keyFile || !agentOut || !other || !/^0x[0-9a-f]{40}$/.test(other)) {
  throw new Error('Set HARDSTOP_OWNER_KEY_FILE and HARDSTOP_AGENT_OUT, and pass another vault address.')
}
const account = privateKeyToAccount(readFileSync(keyFile, 'utf8').trim() as Hex)
const owner = account.address.toLowerCase() as Hex
// Each vault's agent sends a handful of transactions here, so a little gas money is enough.
const network = { ...NETWORKS.find((n) => n.chainId === baseSepolia.id)!, gasMoney: 5_000_000_000_000n }
const rpc = rpcWallet(network.rpc)
const signer = createWalletClient({ account, chain: baseSepolia, transport: http(network.rpc) })
const wallet: Wallet = {
  async request({ method, params = [] }) {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account.address]
    if (method === 'eth_sendTransaction') {
      const [tx] = params as { to: Hex; data?: Hex; value?: Hex }[]
      return signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined })
    }
    return rpc.request({ method, params })
  },
}

const SHOP: Hex = '0x0000000000000000000000000000000000005109'
const DAY = 86_400n
const chainNow = async () => BigInt(((await rpc.request({ method: 'eth_getBlockByNumber', params: ['latest', false] })) as { timestamp: Hex }).timestamp)
const balance = async (sim: { balanceOf(who: Hex): Promise<bigint> }, who: Hex) => sim.balanceOf(who)
const verdict = (code: number | undefined) => (code === undefined ? "none (not sent)" : `${code} (${reasonName(code)})`)
async function name(vault: Hex, text: string) {
  const sent = (await wallet.request({ method: 'eth_sendTransaction', params: [{ from: account.address, to: LAUNCHER, data: setNameData(vault, encodeName(text) as bigint) }] })) as Hex
  const receipt = await waitFor(rpc, sent)
  console.log(`owner names ${vault} "${text}"  ${sent}  ${receipt.status === '0x1' ? 'ok' : 'reverted'}`)
}

console.log(`owner ${owner}\nlauncher ${LAUNCHER}`)

// 1. A vault for real agent work, whose second approved recipient is another agent's vault.
const now = await chainNow()
const work = await launchVault(
  wallet,
  network,
  { owner, agent: owner, perPayment: 10n * USD, perWindow: 20n * USD, validUntil: now + 30n * DAY, windowSecs: DAY, coolingSecs: DAY, payees: [SHOP, other], funding: 100n * USD, now },
  () => {},
)
writeFileSync(agentOut, JSON.stringify({ chainId: network.chainId, vault: work.vault, agentKey: work.agentKey }), { mode: 0o600 })
console.log(`use-case vault ${work.vault} (agent key written outside the repo)`)
const { sim: workSim } = await attach(wallet, work)
const before = await balance(workSim, other)
const toAgent = await workSim.pay(other, 5n * USD, 0n)
const after = await balance(workSim, other)
console.log(`agent pays $5 into another agent's vault ${other}: ${toAgent.tx}  verdict ${verdict(toAgent.code)}; that vault held ${formatUsd(before)}, now ${formatUsd(after)}`)

// 2. A trial budget valid for about two minutes.
const start = await chainNow()
const trial = await launchVault(
  wallet,
  network,
  { owner, agent: owner, perPayment: 10n * USD, perWindow: 20n * USD, validUntil: start + 150n, windowSecs: DAY, coolingSecs: 60n, payees: [SHOP], funding: 20n * USD, now: start },
  () => {},
)
const { sim: trialSim } = await attach(wallet, trial)
const ends = (await trialSim.state()).policy.validUntil
const early = await trialSim.pay(SHOP, 1n * USD, 0n)
console.log(`trial vault ${trial.vault} ends at ${ends} (chain time)\n  pays $1 before the end: ${early.tx}  verdict ${verdict(early.code)}`)
while ((await chainNow()) <= ends) await new Promise((resolve) => setTimeout(resolve, 5000))
const late = await trialSim.pay(SHOP, 1n * USD, 1n)
console.log(`  pays $1 after the end:  ${late.tx}  verdict ${verdict(late.code)} detail ${late.detail}`)

// 3. Names, and the owner's whole list.
await name(work.vault, 'Use-case vault')
await name(trial.vault, 'Expiring trial')
const { vaults, total } = await vaultsOf(rpc, owner)
console.log(`launcher lists ${total} vaults for the owner:`)
for (const vault of vaults) console.log(`  ${vault}  "${await nameOf(rpc, owner, vault)}"`)

// 4. The activity feed, read back from the network (the explorer may need a few seconds to index).
await new Promise((resolve) => setTimeout(resolve, 15_000))
const events = await vaultHistory(rpc, network, trial.vault)
console.log(`activity feed for the trial vault: ${events.map((event) => (event.kind === 'blocked' ? `blocked ${verdict(event.code)}` : event.kind)).join(', ')}`)
