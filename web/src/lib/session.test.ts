// Checks for the code beside the contract: money parsing, replay, and the
// excerpt shown on /developers. Run with `npm test`.

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Sim } from './hardstop/sim.ts'
import { AMEND, LOOSENS } from './kernel-excerpt.ts'
import { formatDuration, formatUsd, parseUsd, USD } from './money.ts'
import { build, exampleSetup, parseSession, snapshot, today, UNAPPROVED, type Session } from './session.ts'

test('dollar text and base units convert both ways', () => {
  assert.equal(parseUsd('4'), 4n * USD)
  assert.equal(parseUsd(' $1,000.5 '), 1_000_500_000n)
  assert.equal(parseUsd('0.01'), 10_000n)
  for (const bad of ['', '-1', '1.234', 'abc', '1e3', '.5']) assert.equal(parseUsd(bad), null, bad)
  assert.equal(formatUsd(4n * USD), '$4.00')
  assert.equal(formatUsd(1_234_567_890n), '$1,234.56789')
  assert.equal(formatUsd(0n), '$0.00')
  assert.equal(formatDuration(86_400n), '24 hours')
  assert.equal(formatDuration(60n), '1 minute')
  assert.equal(formatDuration(7n * 86_400n), '7 days')
})

test('replaying a saved session rebuilds the same vault and the same answers', async () => {
  const setup = exampleSetup(1_800_000_000n)
  const shop = setup.recipients[0].address
  const session: Session = {
    setup,
    actions: [
      { type: 'pay', to: shop, amount: (4n * USD).toString(), nonce: '0' },
      { type: 'pay', to: shop, amount: (80n * USD).toString(), nonce: '1' },
      { type: 'pay', to: UNAPPROVED, amount: (4n * USD).toString(), nonce: '1' },
      { type: 'agentRaise' },
      { type: 'pause' },
      { type: 'pay', to: shop, amount: (4n * USD).toString(), nonce: '1' },
      { type: 'propose', perPayment: (500n * USD).toString(), perDay: (500n * USD).toString(), validUntil: setup.validUntil, paused: false },
      { type: 'skip', seconds: '86400' },
      { type: 'pay', to: shop, amount: (80n * USD).toString(), nonce: '1' },
    ],
  }
  const saved = parseSession(JSON.stringify(session))
  assert.deepEqual(saved, session)

  const first = await build(Sim, session)
  const second = await build(Sim, saved!)
  assert.deepEqual(second.entries, first.entries)
  assert.deepEqual(await snapshot(second.sim, saved!), await snapshot(first.sim, session))

  const codes = first.entries.map((entry) => (entry.kind === 'payment' ? entry.outcome.code : entry.kind))
  assert.deepEqual(codes, [0, 10, 9, 'agentRaise', 'owner', 2, 'owner', 'skip', 0])
  const raise = first.entries[3]
  assert.equal(raise.kind === 'agentRaise' && raise.outcome.revert, 'NotOwner')

  const view = await snapshot(first.sim, session)
  assert.equal(view.state.vaultBalance, 16n * USD)
  assert.equal(view.leftToday, 420n * USD)
  assert.deepEqual(today(view.state), { spent: 80n * USD, resetsAt: 1_800_000_000n + 2n * 86_400n })
})

test('a damaged saved session is refused', () => {
  const good = { setup: exampleSetup(1n), actions: [] }
  assert.notEqual(parseSession(JSON.stringify(good)), null)
  assert.equal(parseSession('not json'), null)
  assert.equal(parseSession(JSON.stringify({ ...good, actions: [{ type: 'pay', to: 'x', amount: '1', nonce: '0' }] })), null)
  assert.equal(parseSession(JSON.stringify({ ...good, setup: { ...good.setup, perDay: '-5' } })), null)
})

test('the code shown on /developers is the code in kernel.fe', (t) => {
  const kernel = new URL('../../../fe/src/kernel.fe', import.meta.url)
  if (!existsSync(kernel)) return t.skip('fe/src/kernel.fe is not in this checkout')
  const source = readFileSync(kernel, 'utf8').replace(/\r\n/g, '\n')
  assert.ok(source.includes(LOOSENS))
  assert.ok(source.includes(AMEND))
})
