// A 2-of-2 Safe owns a HARDSTOP v3 vault on Base Sepolia. Test keys only, read from files outside the repo; never printed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
const W = 'file:///D:/hardstop/web/'
const V = W + 'node_modules/viem/_esm/'
const { createPublicClient, createWalletClient, http, encodeFunctionData, decodeEventLog, parseAbi, concat, zeroAddress, formatEther, parseEther } = await import(V + 'index.js')
const { privateKeyToAccount, generatePrivateKey } = await import(V + 'accounts/index.js')
const { baseSepolia } = await import(V + 'chains/index.js')
const { rpcWallet } = await import(W + 'mcp/vault.ts')
const { launchVault, attach } = await import(W + 'src/lib/live/launch.ts')
const { NETWORKS } = await import(W + 'src/lib/live/wallet.ts')
const { USD } = await import(W + 'src/lib/money.ts')
const { GET } = await import(W + 'src/app/alerts/route.ts')

const FACTORY = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67'
const SAFE_L2 = '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'
const HANDLER = '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99'
const RPC = 'https://sepolia.base.org'
const PAYEE = '0x0000000000000000000000000000000000005109'
const DAY = 86_400n
const safeAbi = parseAbi([
  'function setup(address[] owners, uint256 threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)',
  'function nonce() view returns (uint256)',
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)',
])
const factoryAbi = parseAbi([
  'function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address proxy)',
  'event ProxyCreation(address indexed proxy, address singleton)',
])

const keyA = readFileSync('C:/Users/lalwa/.hardstop/throwaway-test-key.txt', 'utf8').trim()
const fileB = 'C:/Users/lalwa/.hardstop/safe-second-key.txt'
if (!existsSync(fileB)) writeFileSync(fileB, generatePrivateKey())
const A = privateKeyToAccount(keyA)
const B = privateKeyToAccount(readFileSync(fileB, 'utf8').trim())
const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) })
const sender = createWalletClient({ account: A, chain: baseSepolia, transport: http(RPC) })
const rpc = rpcWallet(RPC)
const log = (...a) => console.log(...a)

// 1. The Safe: owners A and B, both must sign.
const owners = [A.address, B.address]
const initializer = encodeFunctionData({ abi: safeAbi, functionName: 'setup', args: [owners, 2n, zeroAddress, '0x', HANDLER, zeroAddress, 0n, zeroAddress] })
const created = await sender.writeContract({ address: FACTORY, abi: factoryAbi, functionName: 'createProxyWithNonce', args: [SAFE_L2, initializer, BigInt(Date.now())] })
const createdR = await pub.waitForTransactionReceipt({ hash: created })
let safe
for (const l of createdR.logs) {
  try { const e = decodeEventLog({ abi: factoryAbi, data: l.data, topics: l.topics }); if (e.eventName === 'ProxyCreation') safe = e.args.proxy } catch {}
}
log('safe created', created, createdR.status, 'gas', createdR.gasUsed, 'safe', safe)
log('owners', await pub.readContract({ address: safe, abi: safeAbi, functionName: 'getOwners' }), 'threshold', await pub.readContract({ address: safe, abi: safeAbi, functionName: 'getThreshold' }))
const fund = await sender.sendTransaction({ to: safe, value: parseEther('0.00002') })
log('safe funded', fund, (await pub.waitForTransactionReceipt({ hash: fund })).status)

// 2. A wallet that is the Safe: every transaction goes through execTransaction, signed by `signers`.
let signers = [A, B]
async function execViaSafe({ to, data = '0x', value = '0x0' }) {
  const v = BigInt(value)
  const nonce = await pub.readContract({ address: safe, abi: safeAbi, functionName: 'nonce' })
  const hash = await pub.readContract({ address: safe, abi: safeAbi, functionName: 'getTransactionHash', args: [to, v, data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, nonce] })
  const sorted = [...signers].sort((x, y) => (BigInt(x.address) < BigInt(y.address) ? -1 : 1))
  const signatures = concat(await Promise.all(sorted.map((s) => s.sign({ hash }))))
  return sender.writeContract({ address: safe, abi: safeAbi, functionName: 'execTransaction', args: [to, v, data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, signatures], gas: 3_000_000n })
}
const safeWallet = {
  async request({ method, params = [] }) {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [safe.toLowerCase()]
    if (method === 'eth_sendTransaction') return execViaSafe(params[0])
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null
    return rpc.request({ method, params })
  },
}

// 3. The Safe launches a vault: the Safe is its owner.
const network = { ...NETWORKS.find((n) => n.chainId === 84532), gasMoney: 8_000_000_000_000n }
const now = BigInt(Math.floor(Date.now() / 1000))
const live = await launchVault(safeWallet, network, {
  owner: safe, agent: safe, perPayment: 10n * USD, perWindow: 20n * USD, validUntil: now + 30n * DAY,
  windowSecs: DAY, coolingSecs: DAY, payees: [PAYEE], funding: 100n * USD, now,
}, (s) => log('  step', s))
log('vault', live.vault, 'launched in', live.launchedIn, 'owner', live.owner)
const { sim } = await attach(safeWallet, live)
const line = (what, o) => log(`${what.padEnd(34)} ${o.tx ?? '(not sent)'} ${o.ok ? 'ok' : `reverted ${o.revert}`} gas ${o.gasUsed}${o.code !== undefined ? ` verdict ${o.code}` : ''}`)

// 4. The agent pays, and cannot raise its own limits.
line('agent pays $4', await sim.pay(PAYEE, 4n * USD, 0n))
const raise = { perPayment: 10n * USD, perWindow: 40n * USD, validUntil: now + 30n * DAY, paused: false }
line('agent raises its own limit', await sim.propose(raise, sim.agent))

// 5. One owner alone, tricked: the Safe refuses to run it.
signers = [A]
try {
  const h = await execViaSafe({ to: live.vault, data: encodeFunctionData({ abi: parseAbi(['function propose(uint256,uint256,uint64,bool)']), functionName: 'propose', args: [raise.perPayment, raise.perWindow, raise.validUntil, false] }) })
  const r = await pub.waitForTransactionReceipt({ hash: h })
  log('one signer alone proposes $40/day', h, r.status, 'gas', r.gasUsed)
} catch (e) {
  log('one signer alone proposes $40/day  (not sent)', (e.shortMessage ?? e.message).split('\n')[0], '|', (e.details ?? e.cause?.details ?? '').toString().slice(0, 120))
}
signers = [A, B]

// 6. Both sign: the raise is queued, not applied, and the alert feed shows it. Then the Safe cancels it.
line('Safe (2 of 2) proposes $40/day', await sim.propose(raise))
const feed = await (await GET(new Request(`https://hardstop-omega.vercel.app/alerts?chain=84532&vault=${live.vault}`))).text()
log('feed:', (feed.match(/<title>A rule change[^<]*<\/title>/) ?? ['(no waiting entry)'])[0])
log('policy per window now', (await sim.state()).policy.perWindow / USD, 'queued per window', (await sim.state()).queued?.perWindow / USD)
line('Safe (2 of 2) cancels it', await sim.cancelQueued())
log('owner ETH left', formatEther(await pub.getBalance({ address: A.address })))
