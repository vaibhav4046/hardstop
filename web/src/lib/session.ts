// A practice session is `{setup, actions}`: how the vault was created and
// everything the visitor did to it, in order. The EVM is deterministic, so
// replaying the actions rebuilds exactly the same vault after a reload.
//
// Every outcome recorded here is what the contract answered. This file sends
// messages and reads state; it never works out a verdict itself.

import type { Hex } from 'viem'
import type { Outcome, PayOutcome, Setup, Sim, State } from './hardstop/sim.ts'
import { USD } from './money.ts'

export const DAY = 86_400n
export const OWNER: Hex = '0x00000000000000000000000000000000000a11ce'
export const AGENT: Hex = '0x0000000000000000000000000000000000a6e170'
/** An address the owner never approved, for "pay a stranger" requests. */
export const UNAPPROVED: Hex = '0x0000000000000000000000000000000000000bad'
/** What the agent asks for when it tries to raise its own limit. */
export const AGENT_RAISE = 1_000n * USD

export type Recipient = { name: string; address: Hex }

/** JSON-safe: amounts and times are decimal strings. */
export type SessionSetup = {
  perPayment: string
  perDay: string
  validUntil: string
  coolingSecs: string
  funding: string
  now: string
  recipients: Recipient[]
}

export type OwnerAction =
  | { type: 'propose'; perPayment: string; perDay: string; validUntil: string; paused: boolean }
  | { type: 'cancel' }
  | { type: 'pause' }
  | { type: 'addRecipient'; name: string; address: Hex }
  | { type: 'removeRecipient'; address: Hex }
  | { type: 'withdraw'; amount: string }

export type Action =
  | { type: 'pay'; to: Hex; amount: string; nonce: string }
  | { type: 'agentRaise' }
  | { type: 'skip'; seconds: string }
  | OwnerAction

export type Session = { setup: SessionSetup; actions: Action[] }

/** What one action did, as reported by the contract. `at` is the practice clock. */
export type Entry =
  | {
      id: number
      kind: 'payment'
      at: bigint
      to: Hex
      amount: bigint
      nonce: bigint
      outcome: PayOutcome
      /** The contract's `exposure(now)` right after: what the agent can still move this instant. */
      leftToday: bigint
    }
  | { id: number; kind: 'agentRaise'; at: bigint; outcome: Outcome }
  | {
      id: number
      kind: 'owner'
      at: bigint
      action: OwnerAction
      outcome: Outcome
      /** A looser change was waiting before this action and is gone after it (a pause or a tightening drops it). */
      dropped?: boolean
      /** The rules in force changed at once: a proposal's tighter part, or all of it. */
      changedNow?: boolean
    }
  | { id: number; kind: 'skip'; at: bigint; seconds: bigint }

/** Everything the screens show, read from the contract after each action. */
export type View = {
  vault: Hex
  state: State
  /** `exposure(now)`: the most the agent can move this instant. */
  leftToday: bigint
  /** `exposure(worstCaseUntil)`: the most it can move before anything the owner signs now could loosen the rules. */
  worstCase: bigint
  worstCaseUntil: bigint
  recipients: (Recipient & { approvedFrom: bigint })[]
}

/** The class is passed in so that this module does not pull the EVM into the first page load. */
export type SimClass = { create(setup: Setup): Promise<Sim> }

export function exampleSetup(now: bigint): SessionSetup {
  return {
    perPayment: (10n * USD).toString(),
    perDay: (20n * USD).toString(),
    validUntil: (now + 30n * DAY).toString(),
    coolingSecs: DAY.toString(),
    funding: (100n * USD).toString(),
    now: now.toString(),
    recipients: [{ name: 'Cloud hosting', address: '0x0000000000000000000000000000000000005109' }],
  }
}

/** A fresh practice address. Nobody holds a key for it; it only exists inside this browser. */
export function practiceAddress(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/** The numbers a vault is created with. On a real network `owner` and `agent` are replaced by the wallet and a fresh key. */
export function toSetup(setup: SessionSetup): Setup {
  return {
    owner: OWNER,
    agent: AGENT,
    perPayment: BigInt(setup.perPayment),
    perWindow: BigInt(setup.perDay),
    validUntil: BigInt(setup.validUntil),
    windowSecs: DAY,
    coolingSecs: BigInt(setup.coolingSecs),
    payees: setup.recipients.map((recipient) => recipient.address),
    funding: BigInt(setup.funding),
    now: BigInt(setup.now),
  }
}

/** Send one action to the contract and report what it did. */
export async function apply(sim: Sim, action: Action, id: number): Promise<Entry> {
  const at = sim.chain.now
  switch (action.type) {
    case 'pay': {
      const amount = BigInt(action.amount)
      const nonce = BigInt(action.nonce)
      const outcome = await sim.pay(action.to, amount, nonce)
      const left = await leftToday(sim, await sim.state())
      return { id, kind: 'payment', at, to: action.to, amount, nonce, outcome, leftToday: left }
    }
    case 'agentRaise': {
      const { policy } = await sim.state()
      const raised = { ...policy, perPayment: AGENT_RAISE, perWindow: AGENT_RAISE, paused: false }
      return { id, kind: 'agentRaise', at, outcome: await sim.propose(raised, sim.agent) }
    }
    case 'skip': {
      const seconds = BigInt(action.seconds)
      sim.chain.advance(seconds)
      return { id, kind: 'skip', at: sim.chain.now, seconds }
    }
    case 'propose':
      return dropping(sim, () =>
        sim.propose({
          perPayment: BigInt(action.perPayment),
          perWindow: BigInt(action.perDay),
          validUntil: BigInt(action.validUntil),
          paused: action.paused,
        }),
      ).then(({ outcome, dropped, changedNow }) => ({ ...owner(id, at, action, outcome), dropped, changedNow }))
    case 'cancel':
      return owner(id, at, action, await sim.cancelQueued())
    case 'pause':
      return dropping(sim, () => sim.pause()).then(({ outcome, dropped }) => ({ ...owner(id, at, action, outcome), dropped }))
    case 'addRecipient':
      return owner(id, at, action, await sim.setRecipient(action.address, true))
    case 'removeRecipient':
      return owner(id, at, action, await sim.setRecipient(action.address, false))
    case 'withdraw':
      return owner(id, at, action, await sim.withdraw(BigInt(action.amount)))
  }
}

/** Runs an owner call and says whether a looser change that was waiting before it is gone after it. */
async function dropping(sim: Sim, call: () => Promise<Outcome>): Promise<{ outcome: Outcome; dropped: boolean; changedNow: boolean }> {
  const before = await sim.state()
  const outcome = await call()
  const after = await sim.state()
  const same = (a: State['policy'], b: State['policy']) =>
    a.perPayment === b.perPayment && a.perWindow === b.perWindow && a.validUntil === b.validUntil && a.paused === b.paused
  return {
    outcome,
    dropped: outcome.ok && before.queued !== null && after.queued === null,
    changedNow: outcome.ok && !same(before.policy, after.policy),
  }
}

function owner(id: number, at: bigint, action: OwnerAction, outcome: Outcome): Entry {
  return { id, kind: 'owner', at, action, outcome }
}

/** Deploy the vault and replay every action. */
export async function build(Sim: SimClass, session: Session): Promise<{ sim: Sim; entries: Entry[] }> {
  const sim = await Sim.create(toSetup(session.setup))
  const entries: Entry[] = []
  for (const [id, action] of session.actions.entries()) entries.push(await apply(sim, action, id))
  return { sim, entries }
}

/** Every recipient the visitor has named, including ones since removed. */
export function namedRecipients(session: Session): Recipient[] {
  const named = new Map<Hex, string>(session.setup.recipients.map((r) => [r.address, r.name]))
  for (const action of session.actions) {
    if (action.type === 'addRecipient') named.set(action.address, action.name)
  }
  return [...named].map(([address, name]) => ({ address, name }))
}

export async function snapshot(sim: Sim, session: Session): Promise<View> {
  const state = await sim.state()
  const worstCaseUntil = state.now + state.schedule.coolingSecs - 1n
  const recipients = []
  for (const recipient of namedRecipients(session)) {
    const approvedFrom = await sim.approvedFrom(recipient.address)
    // The contract answers 0 for a recipient that was removed.
    if (approvedFrom !== 0n) recipients.push({ ...recipient, approvedFrom })
  }
  return {
    vault: sim.vault,
    state,
    leftToday: await leftToday(sim, state),
    worstCase: await sim.exposure(worstCaseUntil),
    worstCaseUntil,
    recipients,
  }
}

/**
 * What the agent can still spend before the day resets, as the contract's own
 * `exposure` reports it. Asked up to the last second of the day, not up to
 * "now": on a real network the call runs in a block a second or two after the
 * clock was read, and an end that is already in the past answers 0.
 */
export async function leftToday(sim: Sim, state: State): Promise<bigint> {
  return sim.exposure(today(state).resetsAt - 1n)
}

/**
 * Display only: which fixed day the practice clock is in, what the ledger
 * holds for it, and when the next one starts. Never used to allow or refuse
 * anything; "left today" comes from the contract's `exposure`.
 */
export function today(state: State): { spent: bigint; resetsAt: bigint } {
  const { anchor, windowSecs } = state.schedule
  const index = (state.now - anchor) / windowSecs
  return {
    spent: state.ledger.window === index ? state.ledger.spent : 0n,
    resetsAt: anchor + (index + 1n) * windowSecs,
  }
}

// --- reading a saved session back --------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isAmount = (value: unknown): value is string => typeof value === 'string' && /^\d{1,30}$/.test(value)
const isAddress = (value: unknown): value is Hex => typeof value === 'string' && /^0x[0-9a-f]{40}$/.test(value)
/** Invisible and text-direction characters: they can make one name look like another, or show it reversed. */
const HIDDEN_CHARACTERS = /[ --­؜᠎​-‏‪-‮⁠-⁯﻿]/

/** Two names that read the same: compared after Unicode normalisation and without case. */
export const sameName = (a: string, b: string): boolean => a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase()

/** Why `name` cannot be a recipient's name, or undefined when it can. */
export function nameProblem(name: string): string | undefined {
  if (name.trim() === '') return 'Give every recipient a name.'
  if (name.length > 40) return 'Keep each name to 40 characters or fewer.'
  if (HIDDEN_CHARACTERS.test(name)) return 'Names cannot contain invisible or text-direction characters.'
  if (MIXED_ALPHABETS.some((other) => LATIN.test(name) && other.test(name))) return 'Use one alphabet per name: Latin letters mixed with Cyrillic or Greek can imitate another name.'
}

const LATIN = /\p{Script=Latin}/u
const MIXED_ALPHABETS = [/\p{Script=Cyrillic}/u, /\p{Script=Greek}/u]

const isName = (value: unknown): value is string => typeof value === 'string' && value === value.trim() && nameProblem(value) === undefined
const isRecipient = (value: unknown): value is Recipient => isObject(value) && isName(value.name) && isAddress(value.address)

function isAction(value: unknown): value is Action {
  if (!isObject(value)) return false
  switch (value.type) {
    case 'pay':
      return isAddress(value.to) && isAmount(value.amount) && isAmount(value.nonce)
    case 'agentRaise':
    case 'cancel':
    case 'pause':
      return true
    case 'skip':
      return isAmount(value.seconds)
    case 'propose':
      return (
        isAmount(value.perPayment) && isAmount(value.perDay) && isAmount(value.validUntil) && typeof value.paused === 'boolean'
      )
    case 'addRecipient':
      return isRecipient(value)
    case 'removeRecipient':
      return isAddress(value.address)
    case 'withdraw':
      return isAmount(value.amount)
    default:
      return false
  }
}

/** A saved session, or null when the text is not one. Storage is not trusted. */
export function parseSession(raw: string): Session | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObject(value) || !isObject(value.setup) || !Array.isArray(value.actions)) return null
  const { setup, actions } = value
  const amounts = [setup.perPayment, setup.perDay, setup.validUntil, setup.coolingSecs, setup.funding, setup.now]
  if (!amounts.every(isAmount)) return null
  if (!Array.isArray(setup.recipients) || setup.recipients.length > 3 || !setup.recipients.every(isRecipient)) return null
  if (!actions.every(isAction)) return null
  return value as Session
}
