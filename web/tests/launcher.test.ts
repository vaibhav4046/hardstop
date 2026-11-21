// The Fe launcher, as compiled bytecode: one transaction from the owner
// creates a vault, funds it with test dollars and passes ETH to the agent.
// `fe test` can neither send ETH nor speak as the launcher, so both are
// checked here.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bytesToHex, createAddressFromString } from '@ethereumjs/util'
import {
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionResult,
  encodeDeployData,
  encodeFunctionData,
  type Hex,
} from 'viem'
import {
  launcherAbi,
  launcherBytecode,
  launcherRuntimeBytecode,
  tokenAbi,
  tokenBytecode,
  vaultAbi,
} from '../src/lib/hardstop/artifacts.ts'
import { Chain, type Receipt } from '../src/lib/hardstop/chain.ts'

const DEPLOYER: Hex = '0x00000000000000000000000000000000000d3910'
const OWNER: Hex = '0x00000000000000000000000000000000000a11ce'
const AGENT: Hex = '0x0000000000000000000000000000000000a6e170'
const SHOP: Hex = '0x0000000000000000000000000000000000005109'
const ZERO: Hex = '0x0000000000000000000000000000000000000000'
const USD = 1_000_000n
const DAY = 86_400n
const T0 = 1_800_000_000n
const END = T0 + 30n * DAY
const GAS_MONEY = 10n ** 16n // 0.01 ETH

type World = { chain: Chain; launcher: Hex; token: Hex }

const order = {
  agent: AGENT,
  perPayment: 10n * USD,
  perWindow: 20n * USD,
  validUntil: END,
  windowSecs: DAY,
  coolingSecs: DAY,
  token: ZERO,
  deposit: 100n * USD,
  salt: 7n,
  value: 0n,
  from: OWNER,
}

async function deploy(chain: Chain, initCode: Hex): Promise<Hex> {
  const receipt = await chain.send(DEPLOYER, null, initCode)
  assert.ok(receipt.ok && receipt.created, 'deployment failed')
  return receipt.created
}

async function world(): Promise<World> {
  const chain = await Chain.create(T0)
  const launcher = await deploy(chain, encodeDeployData({ abi: launcherAbi, bytecode: launcherBytecode }))
  const answer = await chain.read(OWNER, launcher, encodeFunctionData({ abi: launcherAbi, functionName: 'token' }))
  const token = decodeFunctionResult({ abi: launcherAbi, functionName: 'token', data: answer.data })
  return { chain, launcher, token: token.toLowerCase() as Hex }
}

/**
 * `Chain.send` with ETH attached. `Chain` has no parameter for value, so the
 * amount is added to the one call it makes to the EVM underneath.
 */
async function sendWithValue(chain: Chain, from: Hex, to: Hex, data: Hex, value: bigint): Promise<Receipt> {
  const evm = chain['evm']
  const runCall = evm.runCall.bind(evm)
  evm.runCall = (opts) => runCall({ ...opts, value })
  try {
    return await chain.send(from, to, data)
  } finally {
    evm.runCall = runCall
  }
}

async function ethBalance(chain: Chain, who: Hex): Promise<bigint> {
  const account = await chain['evm'].stateManager.getAccount(createAddressFromString(who))
  return account?.balance ?? 0n
}

function launch(w: World, change: Partial<typeof order> = {}): Promise<Receipt> {
  const o = { ...order, ...change }
  const data = encodeFunctionData({
    abi: launcherAbi,
    functionName: 'launch',
    args: [
      o.agent, o.perPayment, o.perWindow, o.validUntil, o.windowSecs, o.coolingSecs,
      SHOP, ZERO, ZERO, o.token, o.deposit, o.salt,
    ],
  })
  return sendWithValue(w.chain, o.from, w.launcher, data, o.value)
}

/** The vault address `launch` returned. */
function launched(receipt: Receipt): Hex {
  if (!receipt.ok) assert.fail(`launch reverted: ${revertName(receipt)}`)
  return decodeFunctionResult({ abi: launcherAbi, functionName: 'launch', data: receipt.data }).toLowerCase() as Hex
}

function revertName(receipt: Receipt): string {
  assert.equal(receipt.ok, false)
  if (receipt.data === '0x') return 'no data'
  return decodeErrorResult({ abi: [...launcherAbi, ...vaultAbi], data: receipt.data }).errorName
}

async function vaultAddress(w: World, who: 'owner' | 'agent' | 'token', vault: Hex): Promise<Hex> {
  const answer = await w.chain.read(OWNER, vault, encodeFunctionData({ abi: vaultAbi, functionName: who }))
  return decodeFunctionResult({ abi: vaultAbi, functionName: who, data: answer.data }).toLowerCase() as Hex
}

async function dollars(w: World, who: Hex, token: Hex = w.token): Promise<bigint> {
  const answer = await w.chain.read(
    OWNER,
    token,
    encodeFunctionData({ abi: tokenAbi, functionName: 'balanceOf', args: [who] }),
  )
  return decodeFunctionResult({ abi: tokenAbi, functionName: 'balanceOf', data: answer.data })
}

async function pay(w: World, vault: Hex, amount: bigint, nonce: bigint): Promise<number> {
  const receipt = await w.chain.send(
    AGENT,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: 'pay', args: [SHOP, amount, nonce] }),
  )
  assert.ok(receipt.ok)
  return decodeFunctionResult({ abi: vaultAbi, functionName: 'pay', data: receipt.data })
}

test('one transaction from the owner sets up a funded vault and an agent with gas money', async () => {
  const w = await world()
  const receipt = await launch(w, { value: GAS_MONEY })
  const vault = launched(receipt)

  const log = receipt.logs.find((entry) => entry.address.toLowerCase() === w.launcher.toLowerCase())
  assert.ok(log, 'the launcher logged nothing')
  const event = decodeEventLog({ abi: launcherAbi, topics: log.topics as [Hex, ...Hex[]], data: log.data })
  assert.equal(event.eventName, 'Launched')
  assert.equal(event.args.owner.toLowerCase(), OWNER)
  assert.equal(event.args.vault.toLowerCase(), vault)
  assert.equal(event.args.agent.toLowerCase(), AGENT)
  assert.equal(event.args.token.toLowerCase(), w.token)

  assert.equal(await vaultAddress(w, 'owner', vault), OWNER)
  assert.equal(await vaultAddress(w, 'agent', vault), AGENT)
  assert.equal(await vaultAddress(w, 'token', vault), w.token)
  assert.equal(await dollars(w, vault), 100n * USD)
  assert.equal(await ethBalance(w.chain, AGENT), GAS_MONEY)
  assert.equal(await ethBalance(w.chain, w.launcher), 0n)
  assert.equal(await ethBalance(w.chain, vault), 0n)

  assert.equal(await pay(w, vault, 4n * USD, 0n), 0)
  assert.equal(await dollars(w, SHOP), 4n * USD)
  // Over the $10 per-payment cap.
  assert.equal(await pay(w, vault, 80n * USD, 1n), 10)
  assert.equal(await dollars(w, SHOP), 4n * USD)
  assert.equal(await dollars(w, vault), 96n * USD)
})

test('the launcher has no owner control over a vault it created', async () => {
  const w = await world()
  const vault = launched(await launch(w))
  const propose = encodeFunctionData({
    abi: vaultAbi,
    functionName: 'propose',
    args: [1000n * USD, 1000n * USD, END, false],
  })
  const withdraw = encodeFunctionData({ abi: vaultAbi, functionName: 'withdraw', args: [100n * USD] })
  for (const data of [propose, withdraw]) {
    assert.equal(revertName(await w.chain.send(w.launcher, vault, data)), 'NotOwner')
  }
  assert.equal(await dollars(w, vault), 100n * USD)
  // The owner still can.
  assert.ok((await w.chain.send(OWNER, vault, withdraw)).ok)
  assert.equal(await dollars(w, OWNER), 100n * USD)
})

test('a salt works once per owner, and another caller cannot take the address', async () => {
  const w = await world()
  const first = launched(await launch(w))
  assert.equal(revertName(await launch(w)), 'no data')
  assert.equal(await dollars(w, first), 100n * USD)
  assert.notEqual(launched(await launch(w, { salt: 8n })), first)
  // The same arguments from someone else land somewhere else.
  const theirs = launched(await launch(w, { from: DEPLOYER }))
  assert.notEqual(theirs, first)
  assert.equal(await vaultAddress(w, 'owner', theirs), DEPLOYER)
})

test('a custom token is used as given: nothing minted, no deposit accepted', async () => {
  const w = await world()
  const custom = await deploy(w.chain, encodeDeployData({ abi: tokenAbi, bytecode: tokenBytecode }))
  assert.equal(revertName(await launch(w, { token: custom, deposit: 1n })), 'DepositNeedsTestDollar')
  const vault = launched(await launch(w, { token: custom, deposit: 0n }))
  assert.equal(await vaultAddress(w, 'token', vault), custom)
  assert.equal(await dollars(w, vault, custom), 0n)
  assert.equal(await dollars(w, vault), 0n)
})

test('the vault refuses a bad policy and the launch reverts with its error', async () => {
  const w = await world()
  for (const bad of [{ agent: OWNER }, { coolingSecs: 59n }, { windowSecs: 0n }]) {
    assert.equal(revertName(await launch(w, bad)), 'InvalidPolicy')
  }
  launched(await launch(w, { coolingSecs: 60n }))
})

test('an agent that cannot take ETH undoes the whole launch', async () => {
  const w = await world()
  // The token contract has no way to receive ETH.
  const refused = await launch(w, { agent: w.token, value: GAS_MONEY })
  assert.equal(revertName(refused), 'AgentRefusedEth')
  assert.deepEqual(refused.logs, [])
  assert.equal(await ethBalance(w.chain, w.token), 0n)
  // Nothing was created or minted: the same salt is still free.
  const vault = launched(await launch(w, { agent: w.token }))
  assert.equal(await dollars(w, vault), 100n * USD)
})

test('the deployed launcher is the runtime bytecode in the artifacts plus its token address', async () => {
  const w = await world()
  const code = await w.chain['evm'].stateManager.getCode(createAddressFromString(w.launcher))
  // Fe keeps a field that never changes in the code itself, as one word after the runtime.
  assert.equal(bytesToHex(code), launcherRuntimeBytecode + w.token.slice(2).padStart(64, '0'))
})

test('a launched vault holds exactly what the owner ordered: its limits, its schedule and only the named recipient', async () => {
  // A launcher edit can change what it hands the vault without touching the
  // vault's code (an Fe judge, 2026-11-21: approving the agent whenever a
  // recipient is left blank). Read every rule back and compare with the order.
  const w = await world()
  const vault = launched(await launch(w))
  const read = async <F extends 'policy' | 'schedule' | 'queued' | 'approvedFrom'>(functionName: F, args?: readonly [Hex]) => {
    const data = encodeFunctionData({ abi: vaultAbi, functionName, args } as Parameters<typeof encodeFunctionData>[0])
    const answer = await w.chain.read(OWNER, vault, data)
    return decodeFunctionResult({ abi: vaultAbi, functionName, data: answer.data } as Parameters<typeof decodeFunctionResult>[0])
  }
  assert.deepEqual(await read('policy'), [order.perPayment, order.perWindow, order.validUntil, false])
  const [anchor, windowSecs, coolingSecs] = (await read('schedule')) as readonly [bigint, bigint, bigint]
  assert.deepEqual([windowSecs, coolingSecs], [order.windowSecs, order.coolingSecs])
  assert.ok(anchor >= T0, 'the schedule starts at the launch')
  // effective_at 0: nothing queued (the rest is the kernel's placeholder).
  assert.equal(((await read('queued')) as readonly unknown[])[4], 0n)
  assert.equal(await read('approvedFrom', [SHOP]), anchor)
  for (const other of [AGENT, OWNER, ZERO, w.launcher, w.token]) {
    assert.equal(await read('approvedFrom', [other]), 0n, `${other} is approved but was never named`)
  }
})
