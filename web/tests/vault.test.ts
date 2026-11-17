// The Fe vault, as compiled bytecode, on an EVM whose clock the test controls.
// `fe test` cannot move time, so everything that depends on time passing is
// checked here against the real contract.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Hex } from 'viem'
import { Sim } from '../src/lib/hardstop/sim.ts'

const OWNER: Hex = '0x00000000000000000000000000000000000a11ce'
const AGENT: Hex = '0x0000000000000000000000000000000000a6e170'
const SHOP: Hex = '0x0000000000000000000000000000000000005109'
const THIEF: Hex = '0x0000000000000000000000000000000000000bad'
const USD = 1_000_000n
const DAY = 86_400n
const T0 = 1_800_000_000n
const END = T0 + 30n * DAY

const vault = (funding = 100n * USD) =>
  Sim.create({
    owner: OWNER,
    agent: AGENT,
    perPayment: 10n * USD,
    perWindow: 20n * USD,
    validUntil: END,
    windowSecs: DAY,
    coolingSecs: DAY,
    payees: [SHOP],
    funding,
    now: T0,
  })

test('the primary journey: allowed, then blocked, with the money to match', async () => {
  const sim = await vault()
  const paid = await sim.pay(SHOP, 4n * USD, 0n)
  assert.equal(paid.code, 0)
  assert.equal(paid.detail, 16n * USD)
  assert.deepEqual(paid.events, [{ name: 'Paid', nonce: 0n, to: SHOP, amount: 4n * USD, leftInWindow: 16n * USD }])
  assert.equal(await sim.balanceOf(SHOP), 4n * USD)

  const tooBig = await sim.pay(SHOP, 80n * USD, 1n)
  assert.equal(tooBig.code, 10)
  assert.equal(tooBig.detail, 10n * USD)
  const toThief = await sim.pay(THIEF, 4n * USD, 1n)
  assert.equal(toThief.code, 9)
  assert.equal(await sim.balanceOf(SHOP), 4n * USD)
  assert.equal(await sim.balanceOf(THIEF), 0n)
  assert.equal((await sim.state()).vaultBalance, 96n * USD)
})

test('a stranger is reverted and leaves no trace', async () => {
  const sim = await vault()
  const outcome = await sim.pay(SHOP, 1n, 0n, THIEF)
  assert.equal(outcome.ok, false)
  assert.equal(outcome.revert, 'NotAgent')
  assert.deepEqual(outcome.events, [])
  assert.equal((await sim.state()).ledger.nextNonce, 0n)
})

test('the agent cannot use any owner control', async () => {
  const sim = await vault()
  const raise = { perPayment: 1000n * USD, perWindow: 1000n * USD, validUntil: END, paused: false }
  for (const attempt of [
    sim.propose(raise, AGENT),
    sim.cancelQueued(AGENT),
    sim.pause(AGENT),
    sim.setRecipient(THIEF, true, AGENT),
    sim.withdraw(100n * USD, AGENT),
  ]) {
    const outcome = await attempt
    assert.equal(outcome.ok, false)
    assert.equal(outcome.revert, 'NotOwner')
  }
  assert.equal((await sim.state()).vaultBalance, 100n * USD)
})

test('a raised limit applies only after the cooling period, to the second', async () => {
  const sim = await vault()
  const raise = await sim.propose({ perPayment: 500n * USD, perWindow: 500n * USD, validUntil: END, paused: false })
  assert.deepEqual(raise.events[0], {
    name: 'PolicyProposed',
    policy: { perPayment: 500n * USD, perWindow: 500n * USD, validUntil: END, paused: false },
    effectiveAt: T0 + DAY,
  })
  assert.equal((await sim.state()).policy.perPayment, 10n * USD)

  sim.chain.advance(DAY - 1n)
  assert.equal((await sim.pay(SHOP, 80n * USD, 0n)).code, 10)
  sim.chain.advance(1n)
  assert.equal((await sim.pay(SHOP, 80n * USD, 0n)).code, 0)
  assert.equal(await sim.balanceOf(SHOP), 80n * USD)
})

test('a queued raise that is cancelled never happens', async () => {
  const sim = await vault()
  await sim.propose({ perPayment: 500n * USD, perWindow: 500n * USD, validUntil: END, paused: false })
  sim.chain.advance(DAY / 2n)
  assert.equal((await sim.cancelQueued()).ok, true)
  sim.chain.advance(5n * DAY)
  assert.equal((await sim.pay(SHOP, 80n * USD, 0n)).code, 10)
})

test('pause is instant; resuming waits out the cooling period', async () => {
  const sim = await vault()
  await sim.pause()
  assert.equal((await sim.pay(SHOP, 1n * USD, 0n)).code, 2)
  assert.equal(await sim.exposure(END), 0n)
  await sim.propose({ perPayment: 10n * USD, perWindow: 20n * USD, validUntil: END, paused: false })
  sim.chain.advance(DAY - 1n)
  assert.equal((await sim.pay(SHOP, 1n * USD, 0n)).code, 2)
  sim.chain.advance(1n)
  assert.equal((await sim.pay(SHOP, 1n * USD, 0n)).code, 0)
})

test('a new recipient can be paid only after the cooling period; removal is instant', async () => {
  const sim = await vault()
  const added = await sim.setRecipient(THIEF, true)
  assert.deepEqual(added.events, [{ name: 'RecipientChanged', who: THIEF, approvedFrom: T0 + DAY }])
  sim.chain.advance(DAY - 1n)
  assert.equal((await sim.pay(THIEF, 1n * USD, 0n)).code, 9)
  // Asking again does not restart or shorten the wait.
  await sim.setRecipient(THIEF, true)
  sim.chain.advance(1n)
  assert.equal((await sim.pay(THIEF, 1n * USD, 0n)).code, 0)
  await sim.setRecipient(THIEF, false)
  assert.equal((await sim.pay(THIEF, 1n * USD, 1n)).code, 9)
})

test('the cap is per fixed window and a new window starts empty', async () => {
  const sim = await vault()
  assert.equal((await sim.pay(SHOP, 10n * USD, 0n)).code, 0)
  assert.equal((await sim.pay(SHOP, 10n * USD, 1n)).code, 0)
  const over = await sim.pay(SHOP, 1n, 2n)
  assert.equal(over.code, 11)
  assert.equal(over.detail, 0n)
  sim.chain.advance(DAY - 1n)
  assert.equal((await sim.pay(SHOP, 1n, 2n)).code, 11)
  sim.chain.advance(1n)
  assert.equal((await sim.pay(SHOP, 10n * USD, 2n)).code, 0)
  assert.deepEqual((await sim.state()).ledger, { window: 1n, spent: 10n * USD, nextNonce: 3n })
})

test('permission ends at valid_until', async () => {
  const sim = await vault()
  sim.chain.advance(30n * DAY)
  assert.equal((await sim.pay(SHOP, 1n * USD, 0n)).code, 0)
  sim.chain.advance(1n)
  const late = await sim.pay(SHOP, 1n * USD, 1n)
  assert.equal(late.code, 5)
  assert.equal(late.detail, END)
})

test('a transfer that fails reverts the payment and records nothing', async () => {
  // $3 in the vault, $4 requested: the kernel allows it, the token cannot pay.
  const sim = await vault(3n * USD)
  const outcome = await sim.pay(SHOP, 4n * USD, 0n)
  assert.equal(outcome.ok, false)
  const state = await sim.state()
  assert.deepEqual(state.ledger, { window: 0n, spent: 0n, nextNonce: 0n })
  assert.equal(state.vaultBalance, 3n * USD)
  assert.equal(await sim.balanceOf(SHOP), 0n)
  // The same request works once the vault can cover it.
  await sim.fund(10n * USD)
  assert.equal((await sim.pay(SHOP, 4n * USD, 0n)).code, 0)
})

test('withdraw sends money to the owner and nowhere else', async () => {
  const sim = await vault()
  const outcome = await sim.withdraw(60n * USD)
  assert.deepEqual(outcome.events, [{ name: 'Withdrawn', amount: 60n * USD }])
  assert.equal(await sim.balanceOf(OWNER), 60n * USD)
  assert.equal((await sim.state()).vaultBalance, 40n * USD)
})

test('a greedy agent takes exactly the exposure bound, and no more', async () => {
  const sim = await vault(1000n * USD)
  const until = T0 + 3n * DAY - 1n
  const bound = await sim.exposure(until)
  assert.equal(bound, 60n * USD)
  let nonce = 0n
  while (sim.chain.now <= until) {
    for (;;) {
      const { code, detail } = await sim.preview(SHOP, 10n * USD, nonce)
      const amount = code === 0 ? 10n * USD : code === 11 ? detail : 0n
      if (amount === 0n) break
      assert.equal((await sim.pay(SHOP, amount, nonce)).code, 0)
      nonce += 1n
    }
    sim.chain.advance(DAY / 4n)
  }
  assert.equal(await sim.balanceOf(SHOP), bound)
})
