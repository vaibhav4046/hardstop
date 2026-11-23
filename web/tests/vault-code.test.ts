// What mcp/vault.ts trusts as a vault: the runtime code of the vault the app
// ships (src/lib/hardstop/artifacts.ts), and the earlier builds listed with it.
// Also the words it uses for a vault's spending window.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodeDeployData, getContractAddress, type Hex } from 'viem'
import { KNOWN_VAULT_CODE, VAULT_IMMUTABLE_BYTES, vaultCodeHash, windowWords } from '../mcp/vault.ts'
import { vaultAbi, vaultBytecode } from '../src/lib/hardstop/artifacts.ts'
import { FakeNetwork } from './fake-network.ts'

const OWNER: Hex = '0x00000000000000000000000000000000000a11ce'
const NOW = 1_800_000_000n

/** Deploys the shipped vault directly (no launcher) with the given owner, token, limits and agent, and returns its runtime code. */
async function deployed(owner: Hex, token: Hex, windowSecs: bigint, agent: Hex): Promise<Hex> {
  const network = await FakeNetwork.create(owner, NOW)
  const data = encodeDeployData({
    abi: vaultAbi,
    bytecode: vaultBytecode,
    args: [owner, agent, token, 10n, 20n, NOW + 86_400n, windowSecs, 3_600n, `0x${'5'.repeat(40)}`, `0x${'0'.repeat(40)}`, `0x${'0'.repeat(40)}`],
  })
  await network.request({ method: 'eth_sendTransaction', params: [{ from: owner, data }] })
  return (await network.request({ method: 'eth_getCode', params: [getContractAddress({ from: owner, nonce: 0n })] })) as Hex
}

test('the vault the app ships is the first known build, whatever its owner, token, agent and schedule', async () => {
  const a = await deployed(OWNER, `0x${'7'.repeat(40)}`, 86_400n, `0x${'a'.repeat(40)}`)
  const b = await deployed(`0x${'0'.repeat(36)}b0b0`, `0x${'8'.repeat(40)}`, 3_600n, `0x${'b'.repeat(40)}`)
  assert.notEqual(a, b, 'the constructor writes the owner and token into the code')
  assert.equal(a.slice(0, -2 * VAULT_IMMUTABLE_BYTES), b.slice(0, -2 * VAULT_IMMUTABLE_BYTES), 'everything before them is the same')
  assert.ok(vaultBytecode.includes(a.slice(2, -2 * VAULT_IMMUTABLE_BYTES)), 'and is the runtime inside the shipped init code')
  assert.equal(vaultCodeHash(a), Object.keys(KNOWN_VAULT_CODE)[0])
  assert.equal(vaultCodeHash(b), Object.keys(KNOWN_VAULT_CODE)[0])
  assert.match(KNOWN_VAULT_CODE[vaultCodeHash(a)!], /^the current build/)
})

test('code that differs from every known build by one byte, or is too short to be a vault, matches nothing', async () => {
  const code = await deployed(OWNER, `0x${'7'.repeat(40)}`, 86_400n, `0x${'a'.repeat(40)}`)
  const flipped = `${code.slice(0, 100)}${code[100] === 'f' ? 'e' : 'f'}${code.slice(101)}` as Hex
  assert.equal(vaultCodeHash(flipped)! in KNOWN_VAULT_CODE, false)
  assert.equal(vaultCodeHash(`0x${'00'.repeat(VAULT_IMMUTABLE_BYTES)}`), undefined)
  assert.equal(vaultCodeHash('0x'), undefined)
})

test('a window is called a day only when it is exactly 86,400 seconds', () => {
  assert.deepEqual(windowWords(86_400n), { per: 'per day', left: 'today', current: 'Today', period: 'day', span: '24 hours' })
  assert.equal(windowWords(3_600n).per, 'per 1 hour')
  assert.equal(windowWords(172_800n).per, 'per 2 days')
  assert.equal(windowWords(86_401n).per, 'per window of 86401 seconds')
  assert.equal(windowWords(90n).per, 'per window of 90 seconds')
  assert.equal(windowWords(90n).left, 'in this window')
})
