// A vault that holds real testnet USDC (Circle's, on Base Sepolia) instead of
// the launcher's test dollars: launched through the same launcher, funded by
// the owner with an ordinary ERC-20 transfer, then paid from by the agent.
// The owner is a throwaway TEST key read from a file outside the repo.
//   HARDSTOP_OWNER_KEY_FILE=/path/to/key.txt node scripts/base-sepolia-usdc.ts
import { readFileSync } from 'node:fs'
import { createWalletClient, encodeFunctionData, erc20Abi, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { rpcWallet } from '../mcp/vault.ts'
import { attach, LAUNCHER, launchVault } from '../src/lib/live/launch.ts'
import { NETWORKS, waitFor, type Wallet } from '../src/lib/live/wallet.ts'

const USDC: Hex = '0x036cbd53842c5426634e7929541ec2318f3dcf7e' // Circle's USDC on Base Sepolia
const UNIT = 1_000_000n // USDC has 6 decimals, like the test dollar
const keyFile = process.env.HARDSTOP_OWNER_KEY_FILE
if (!keyFile) throw new Error('Set HARDSTOP_OWNER_KEY_FILE to a file holding a throwaway test key.')
const account = privateKeyToAccount(readFileSync(keyFile, 'utf8').trim() as Hex)
const network = { ...NETWORKS.find((n) => n.chainId === baseSepolia.id)!, gasMoney: 3_000_000_000_000n }
const rpc = rpcWallet(network.rpc)
const signer = createWalletClient({ account, chain: baseSepolia, transport: http(network.rpc) })
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
const usdcOf = async (who: Hex) =>
  BigInt((await rpc.request({ method: 'eth_call', params: [{ to: USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [who] }) }, 'latest'] })) as Hex)
const line = (what: string, out: { tx?: Hex; ok: boolean; gasUsed: bigint; revert?: string }, extra = '') =>
  console.log(`${what.padEnd(28)} ${out.tx ?? '(not sent)'}  ${out.ok ? 'ok' : `reverted ${out.revert}`}  gas ${out.gasUsed}${extra}`)

console.log(`owner ${account.address}, USDC ${Number(await usdcOf(account.address)) / 1e6}\nlauncher ${LAUNCHER}`)
const live = await launchVault(
  owner,
  network,
  { owner: account.address, agent: account.address, perPayment: 3n * UNIT, perWindow: 5n * UNIT, validUntil: now + 30n * DAY, windowSecs: DAY, coolingSecs: DAY, payees: [PAYEE], funding: 0n, token: USDC, now },
  (step) => console.log(`  step: ${step}`),
)
console.log(`vault ${live.vault} holds token ${live.token} (USDC: ${live.token === USDC})\nlaunched in ${live.launchedIn}`)
const funded = (await owner.request({ method: 'eth_sendTransaction', params: [{ from: account.address, to: USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [live.vault, 10n * UNIT] }) }] })) as Hex
console.log(`owner sends 10 USDC to the vault ${funded}  ${(await waitFor(rpc, funded)).status === '0x1' ? 'ok' : 'reverted'}`)
const { sim } = await attach(owner, live)
const p1 = await sim.pay(PAYEE, 2n * UNIT, 0n)
line('agent pays 2 USDC', p1, `  verdict ${p1.code}`)
const p2 = await sim.pay(PAYEE, 4n * UNIT, 1n)
line('agent asks for 4 USDC', p2, `  verdict ${p2.code} detail ${p2.detail}`)
console.log(`after: vault ${Number(await usdcOf(live.vault)) / 1e6} USDC, recipient ${Number(await usdcOf(PAYEE)) / 1e6} USDC`)
