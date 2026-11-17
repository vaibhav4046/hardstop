// Differential test: the Fe vault running as EVM bytecode against the same
// Fe kernel built as a native program.
//
// For every payment request the test reads the vault's state, asks the
// native tool what the verdict will be, then sends the request to the vault
// and compares: the reason code, the number attached to it, the ledger
// afterwards, and the money that actually moved. Any disagreement fails.
//
// The games are seeded, so a failure is reproduced by the seed, vault and
// step numbers in its message.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Hex } from 'viem'
import { Sim, type Policy, type State } from '../src/lib/hardstop/sim.ts'
import { nativeAvailable, nativeBatch, nativeBinary } from './native.ts'

const SEED = 0x48415244
const VAULTS = Number(process.env.DIFF_VAULTS ?? 40)
const STEPS = Number(process.env.DIFF_STEPS ?? 60)

const OWNER: Hex = '0x00000000000000000000000000000000000a11ce'
const AGENT: Hex = '0x0000000000000000000000000000000000a6e170'
const STRANGER: Hex = '0x0000000000000000000000000000000000057a26'
const SHOP_A: Hex = '0x000000000000000000000000000000000000510a'
const SHOP_B: Hex = '0x000000000000000000000000000000000000510b'
const LATER: Hex = '0x0000000000000000000000000000000000001a7e'
const THIEF: Hex = '0x0000000000000000000000000000000000000bad'
const RECIPIENTS = [SHOP_A, SHOP_B, LATER, THIEF]

const T0 = 1_800_000_000n
const MAX_U256 = (1n << 256n) - 1n

/** mulberry32: small, seeded, the same everywhere. */
function rng(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const below = (n: number) => Math.floor(next() * n)
  return { below, oneIn: (n: number) => below(n) === 0, pick: <T>(items: T[]) => items[below(items.length)] }
}

type Random = ReturnType<typeof rng>

function randomPolicy(r: Random, now: bigint, windowSecs: bigint): Policy {
  return {
    perPayment: r.oneIn(12) ? 0n : BigInt(1 + r.below(50)),
    perWindow: BigInt(r.below(160)),
    validUntil: now + BigInt(r.below(40)) * windowSecs + BigInt(r.below(Number(windowSecs))),
    paused: r.oneIn(24),
  }
}

function rulesLine(state: State): string {
  const q = state.queued
  return [
    state.schedule.anchor,
    state.schedule.windowSecs,
    state.schedule.coolingSecs,
    state.policy.perPayment,
    state.policy.perWindow,
    state.policy.validUntil,
    state.policy.paused ? 1 : 0,
    q ? q.perPayment : 0,
    q ? q.perWindow : 0,
    q ? q.validUntil : 0,
    q ? (q.paused ? 1 : 0) : 1,
    q ? q.effectiveAt : 0,
    state.ledger.window,
    state.ledger.spent,
    state.ledger.nextNonce,
  ].join(' ')
}

type Check =
  | {
      kind: 'pay'
      where: string
      reverted: string | undefined
      code: number | undefined
      detail: bigint | undefined
      ledgerAfter: State['ledger']
      amount: bigint
      moved: bigint
    }
  | { kind: 'exposure'; where: string; onChain: bigint }

test(`vault bytecode and native kernel agree on ${VAULTS * STEPS} payment requests`, async (t) => {
  if (!nativeAvailable()) {
    t.skip(`native tool not built at ${nativeBinary}; run scripts/native.sh`)
    return
  }

  const questions: string[] = []
  const checks: Check[] = []
  let allowed = 0
  let denied = 0
  let reverted = 0

  for (let v = 0; v < VAULTS; v++) {
    const r = rng(SEED + v * 7919)
    const windowSecs = r.pick([60n, 3600n, 86_400n])
    const coolingSecs = r.pick([30n, 3600n, 86_400n])
    const first = randomPolicy(r, T0, windowSecs)
    const sim = await Sim.create({
      owner: OWNER,
      agent: AGENT,
      perPayment: first.perPayment,
      perWindow: first.perWindow,
      validUntil: first.validUntil,
      windowSecs,
      coolingSecs,
      payees: [SHOP_A, SHOP_B],
      funding: 10n ** 12n,
      now: T0,
    })

    // The promise checked on the chain: nothing proposed after this moment
    // can let more than `bound` out before the cooling period would end.
    const horizon = T0 + coolingSecs - 1n
    const bound = await sim.exposure(horizon)
    let paidInHorizon = 0n

    for (let s = 0; s < STEPS; s++) {
      const where = `seed ${SEED} vault ${v} step ${s}`

      const jump = r.below(8)
      if (jump >= 3 && jump < 5) sim.chain.advance(BigInt(1 + r.below(3)))
      else if (jump === 5) {
        const into = (sim.chain.now - T0) % windowSecs
        sim.chain.advance(windowSecs - into - 1n + BigInt(r.below(2)))
      } else if (jump === 6) sim.chain.advance(BigInt(r.below(Number(windowSecs) + 1)))
      else if (jump === 7) sim.chain.advance(BigInt(r.below(3 * Number(windowSecs) + 1)))

      const owner = r.below(40)
      if (owner < 3) await sim.propose(randomPolicy(r, sim.chain.now, windowSecs))
      else if (owner === 3) await sim.cancelQueued()
      else if (owner === 4) await sim.pause()
      else if (owner < 8) await sim.setRecipient(r.pick([LATER, SHOP_A, SHOP_B]), !r.oneIn(3))

      const before = await sim.state()
      const now = sim.chain.now
      const policy = before.policy
      const inWindow = now >= before.schedule.anchor && (now - before.schedule.anchor) / windowSecs === before.ledger.window
      const spent = inWindow ? before.ledger.spent : 0n
      const left = spent >= policy.perWindow ? 0n : policy.perWindow - spent
      const most = policy.perPayment < left ? policy.perPayment : left

      const roll = r.below(10)
      const amount =
        roll < 3 ? most : roll < 5 ? most + 1n : roll === 5 ? 0n : roll === 6 ? MAX_U256 : BigInt(1 + r.below(Number(policy.perPayment) + 3))
      const nonceRoll = r.below(16)
      const nonce =
        nonceRoll === 0 && before.ledger.nextNonce > 0n
          ? before.ledger.nextNonce - 1n
          : nonceRoll === 1
            ? before.ledger.nextNonce + BigInt(1 + r.below(3))
            : before.ledger.nextNonce
      const from = r.oneIn(20) ? STRANGER : AGENT
      const to = r.oneIn(8) ? r.pick(RECIPIENTS) : r.pick([SHOP_A, SHOP_B])

      const approvedFrom = await sim.approvedFrom(to)
      const toApproved = approvedFrom !== 0n && now >= approvedFrom
      questions.push(`${rulesLine(before)} ${amount} ${nonce} ${from === AGENT ? 1 : 0} ${toApproved ? 1 : 0} ${now}`)

      const balanceBefore = await sim.balanceOf(to)
      const outcome = await sim.pay(to, amount, nonce, from)
      const after = await sim.state()
      const moved = (await sim.balanceOf(to)) - balanceBefore
      assert.equal(before.vaultBalance - after.vaultBalance, moved, `${where}: vault and recipient disagree on what moved`)

      checks.push({
        kind: 'pay',
        where,
        reverted: outcome.revert,
        code: outcome.code,
        detail: outcome.detail,
        ledgerAfter: after.ledger,
        amount,
        moved,
      })
      if (!outcome.ok) reverted++
      else if (outcome.code === 0) allowed++
      else denied++

      if (now <= horizon) {
        paidInHorizon += moved
        assert.ok(paidInHorizon <= bound, `${where}: ${paidInHorizon} left the vault, exposure bound was ${bound}`)
      }

      if (s % 5 === 0) {
        const until = now + BigInt(r.below(4 * Number(windowSecs)))
        questions.push(`${rulesLine(after)} ${now} ${until}`)
        checks.push({ kind: 'exposure', where, onChain: await sim.exposure(until) })
      }
    }
  }

  const answers = nativeBatch(questions)
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i]
    const answer = answers[i]
    if (check.kind === 'exposure') {
      assert.equal(BigInt(answer), check.onChain, `${check.where}: exposure differs (native ${answer})`)
      continue
    }
    const [code, detail, window, spentAfter, nextNonce] = answer.split(' ').map(BigInt)
    if (check.reverted !== undefined) {
      // The only refusal the vault turns into a revert is a stranger's.
      assert.equal(check.reverted, 'NotAgent', `${check.where}: unexpected revert`)
      assert.equal(code, 3n, `${check.where}: vault reverted NotAgent, native said ${code}`)
      assert.equal(check.moved, 0n, `${check.where}: money moved on a revert`)
      continue
    }
    assert.equal(BigInt(check.code!), code, `${check.where}: vault code ${check.code}, native ${code}`)
    assert.equal(check.detail, detail, `${check.where}: vault detail ${check.detail}, native ${detail}`)
    assert.deepEqual(
      check.ledgerAfter,
      { window, spent: spentAfter, nextNonce },
      `${check.where}: ledger after the request differs`,
    )
    assert.equal(check.moved, code === 0n ? check.amount : 0n, `${check.where}: wrong amount moved`)
  }

  const exposures = checks.length - VAULTS * STEPS
  t.diagnostic(
    `${VAULTS * STEPS} payment requests (${allowed} allowed, ${denied} denied, ${reverted} reverted) and ${exposures} exposure queries: vault and native kernel agreed on all of them`,
  )
  assert.ok(allowed > VAULTS * STEPS * 0.1, 'too few allowed payments for the comparison to mean much')
  assert.ok(denied > VAULTS * STEPS * 0.2, 'too few denied payments for the comparison to mean much')
})
