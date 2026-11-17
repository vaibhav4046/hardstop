// Words for what the contract answered. The verdict itself is read from the
// entry (reason code, revert name, events); this file only phrases it.

import { explain } from './hardstop/reasons.ts'
import { FORMAT, formatDuration, formatTime, formatUsd } from './money.ts'
import { AGENT_RAISE, type Entry } from './session.ts'

export type Tone = 'paid' | 'blocked' | 'plain'

export type Verdict = {
  tone: Tone
  /** One word for the stamp. */
  stamp: string
  headline: string
  sentence: string
}

/** A payment request or a rule-change attempt by the agent. */
export function verdict(entry: Extract<Entry, { kind: 'payment' | 'agentRaise' }>): Verdict {
  const { outcome } = entry
  if (entry.kind === 'agentRaise') {
    if (outcome.revert === 'NotOwner') {
      return {
        tone: 'blocked',
        stamp: 'Rejected',
        headline: 'The agent tried to change the rules',
        sentence: 'Rejected. Only you can change the rules.',
      }
    }
    return {
      tone: 'plain',
      stamp: outcome.ok ? 'Accepted' : 'Refused',
      headline: outcome.ok ? 'Accepted' : 'Refused',
      sentence: outcome.ok
        ? `The vault accepted a request to raise the limits to ${formatUsd(AGENT_RAISE)}.`
        : `The vault refused this request (${outcome.revert}).`,
    }
  }
  const { code, detail } = entry.outcome
  if (code !== undefined) {
    const said = explain(code, detail ?? 0n, FORMAT)
    return {
      tone: said.allowed ? 'paid' : 'blocked',
      stamp: said.allowed ? 'Paid' : 'Blocked',
      headline: said.headline,
      sentence: said.sentence,
    }
  }
  return {
    tone: 'plain',
    stamp: 'Not sent',
    headline: 'Payment failed',
    sentence:
      'The vault could not send this payment, so nothing was paid and nothing was counted against your limits. Usually this means the vault holds less than the amount requested.',
  }
}

/** One line for something the owner did, or for a clock skip. */
export function note(entry: Extract<Entry, { kind: 'owner' | 'skip' }>, nameOf: (address: string) => string): string {
  if (entry.kind === 'skip') {
    const span = entry.seconds === 86_400n ? '1 day' : formatDuration(entry.seconds)
    return `Practice clock skipped ahead ${span}, to ${formatTime(entry.at)}.`
  }
  const { action, outcome } = entry
  if (!outcome.ok) {
    return action.type === 'withdraw'
      ? `Withdrawal of ${formatUsd(BigInt(action.amount))} failed, so nothing moved. The vault holds less than that.`
      : `The vault refused this change (${outcome.revert}).`
  }
  switch (action.type) {
    case 'propose': {
      const proposed = outcome.events.find((event) => event.name === 'PolicyProposed')
      return proposed && proposed.effectiveAt !== 0n
        ? `You asked for looser rules. Scheduled: they take effect ${formatTime(proposed.effectiveAt)}.`
        : 'You changed the rules. Nothing in the change was looser, so it is in force at once.'
    }
    case 'cancel':
      return 'You cancelled the scheduled change. The rules stay as they are.'
    case 'pause':
      return 'You paused the agent. In force at once.'
    case 'addRecipient': {
      const changed = outcome.events.find((event) => event.name === 'RecipientChanged')
      return `You added ${action.name}. It can be paid from ${changed ? formatTime(changed.approvedFrom) : 'the end of the cooling period'}.`
    }
    case 'removeRecipient':
      return `You removed ${nameOf(action.address)}. In force at once.`
    case 'withdraw':
      return `You withdrew ${formatUsd(BigInt(action.amount))} back to yourself.`
  }
}
