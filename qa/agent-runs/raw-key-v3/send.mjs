// The agent's raw key, as a tool. Signs and sends any call, from the v3 use-case vault's agent key, on Base Sepolia.
// The key is read from a file outside this folder; it is never printed.
//
//   node send.mjs call <to> "<signature>" [args...]     read-only call (eth_call), prints the result or the revert
//   node send.mjs tx   <to> "<signature>" [args...]     simulates, then sends only if the simulation passes
//   node send.mjs force <to> "<signature>" [args...]    sends even if the simulation reverts (pays the fee)
//
// <to> may be an address, or "vault" or "token". Arguments: numbers, addresses, true/false.
import { readFileSync } from 'node:fs'
const V = 'file:///D:/hardstop/web/node_modules/viem/_esm/'
const { createPublicClient, createWalletClient, http, parseAbiItem, encodeFunctionData, decodeFunctionResult, decodeErrorResult, formatEther } = await import(V + 'index.js')
const { privateKeyToAccount } = await import(V + 'accounts/index.js')
const { baseSepolia } = await import(V + 'chains/index.js')
const { vaultAbi, tokenAbi } = await import('file:///D:/hardstop/web/src/lib/hardstop/artifacts.ts')

const { vault, agentKey } = JSON.parse(readFileSync('C:/Users/lalwa/.hardstop/usecase-agent-v3.json', 'utf8'))
const TOKEN = '0xa1e3cd76f5d2b0be85a70669fe92e35d576c3c1f'
const account = privateKeyToAccount(agentKey)
const rpc = http('https://sepolia.base.org')
const pub = createPublicClient({ chain: baseSepolia, transport: rpc })
const wallet = createWalletClient({ account, chain: baseSepolia, transport: rpc })

const [mode, toArg, sig, ...rest] = process.argv.slice(2)
if (!['call', 'tx', 'force'].includes(mode) || !toArg || !sig) {
  console.log(`agent ${account.address}, vault ${vault}, token ${TOKEN}\nusage: node send.mjs call|tx|force <to|vault|token> "<signature>" [args...]`)
  process.exit(2)
}
const to = toArg === 'vault' ? vault : toArg === 'token' ? TOKEN : toArg
const item = parseAbiItem(`function ${sig}${sig.includes(')') && !/returns/.test(sig) ? '' : ''}`)
const args = rest.map((a, i) => {
  const t = item.inputs[i]?.type ?? ''
  if (t === 'bool') return a === 'true'
  if (t.startsWith('uint') || t.startsWith('int')) return BigInt(a)
  return a
})
const data = encodeFunctionData({ abi: [item], args })
const why = (e) => {
  const raw = e?.cause?.data ?? e?.data ?? e?.cause?.cause?.data
  for (const abi of [vaultAbi, tokenAbi]) {
    try { if (raw) return `reverted ${decodeErrorResult({ abi, data: raw }).errorName}` } catch {}
  }
  return `reverted: ${(e?.shortMessage ?? e?.message ?? String(e)).split('\n')[0]}`
}
let simulated = 'ok'
try {
  const out = await pub.call({ account: account.address, to, data })
  if (mode === 'call') {
    let shown = out.data ?? '0x'
    try {
      const decoded = decodeFunctionResult({ abi: [item], data: out.data })
      if (decoded !== undefined) shown = JSON.stringify(decoded, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
    } catch {}
    console.log(`call ${sig} -> ${shown}`)
    process.exit(0)
  }
} catch (e) {
  simulated = why(e)
  if (mode === 'call') { console.log(`call ${sig} -> ${simulated}`); process.exit(0) }
}
console.log(`simulation: ${simulated}`)
if (simulated !== 'ok' && mode !== 'force') { console.log('not sent (use force to send anyway)'); process.exit(0) }
try {
  const hash = await wallet.sendTransaction({ to, data, gas: 300000n })
  const r = await pub.waitForTransactionReceipt({ hash })
  console.log(`sent ${hash} status ${r.status} gas ${r.gasUsed} logs ${r.logs.length}; agent ETH left ${formatEther(await pub.getBalance({ address: account.address }))}`)
} catch (e) {
  console.log(`not sent: ${(e?.shortMessage ?? e?.message ?? String(e)).split('\n')[0]}`)
}
