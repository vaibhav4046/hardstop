import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scheduleStatus } from './describe.ts'
import type { Entry } from './session.ts'

const raise = (id: number, at: bigint, effectiveAt: bigint): Entry =>
  ({
    id,
    kind: 'owner',
    at,
    action: { type: 'propose', perPayment: '1', perDay: '50', validUntil: '9', paused: false },
    outcome: { ok: true, gasUsed: 0n, events: [{ name: 'PolicyProposed', effectiveAt }] },
  }) as unknown as Entry
const owner = (id: number, at: bigint, type: 'cancel' | 'pause', dropped = false): Entry =>
  ({ id, kind: 'owner', at, action: { type }, outcome: { ok: true, gasUsed: 0n, events: [] }, dropped }) as unknown as Entry

test('a scheduled change says what became of it', () => {
  const asked = raise(0, 100n, 200n)
  assert.equal(scheduleStatus(asked, [], 150n), 'Scheduled')
  assert.equal(scheduleStatus(asked, [], 200n), 'In force')
  assert.equal(scheduleStatus(asked, [owner(1, 120n, 'cancel')], 150n), 'Cancelled')
  assert.equal(scheduleStatus(asked, [owner(1, 120n, 'pause', true)], 150n), 'Cancelled')
  assert.equal(scheduleStatus(asked, [raise(1, 120n, 220n)], 150n), 'Replaced')
  // Something done after the change took effect does not undo it.
  assert.equal(scheduleStatus(asked, [owner(1, 250n, 'cancel')], 300n), 'In force')
  // An entry that scheduled nothing has no status.
  assert.equal(scheduleStatus(owner(0, 100n, 'pause'), [], 150n), undefined)
})
