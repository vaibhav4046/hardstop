// A verdict shown as a receipt card. Everything on it is read from the entry,
// which is what the contract answered.

import { useId } from 'react'
import type { Hex } from 'viem'
import { reasonName } from '@/lib/hardstop/reasons'
import { note, scheduledFor, verdict } from '@/lib/describe'
import { formatTime, formatUsd } from '@/lib/money'
import { AGENT_RAISE, type Entry } from '@/lib/session'

type Props = {
  entry: Entry
  /** The name the visitor gave an address, or a plain description of it. */
  nameOf: (address: string) => string
  vault: Hex
  /** Plays the print and stamp animation once. */
  isNew?: boolean
  /** Set when the vault is on a real network: where its transactions can be looked up. */
  explorer?: string
}

export function Slip({ entry, nameOf, vault, isNew = false, explorer }: Props) {
  // The home example and the visitor's vault can be in the document together,
  // each numbering its receipts from 0, so the heading id cannot be the number.
  const titleId = useId()
  if (entry.kind === 'owner' || entry.kind === 'skip') {
    return (
      <p className={`logline${isNew ? ' is-new' : ''}`}>
        {/* The sentence already says "Scheduled"; the label is for the eye. */}
        {scheduledFor(entry) !== undefined && (
          <span className="tag tag-cool" aria-hidden="true">
            Scheduled
          </span>
        )}
        {note(entry, nameOf)}
      </p>
    )
  }

  const said = verdict(entry)
  const { outcome } = entry
  const isPayment = entry.kind === 'payment'

  return (
    <article className={`slip${isNew ? ' is-new' : ''}`} aria-labelledby={titleId}>
      <div className="slip-head">
        <span className={`stamp stamp-${said.tone}`} aria-hidden="true">
          {said.stamp}
        </span>
        <p className="slip-amount">{isPayment ? formatUsd(entry.amount) : 'Rule change'}</p>
      </div>
      <h3 id={titleId} className="sr-only">
        {said.headline}
        {isPayment ? `, ${formatUsd(entry.amount)} to ${nameOf(entry.to)}` : ''}
      </h3>
      <p className="slip-sentence">{said.sentence}</p>
      <dl className="rows">
        {isPayment ? (
          <>
            <div>
              <dt>Agent asked to pay</dt>
              <dd>{nameOf(entry.to)}</dd>
            </div>
            <div>
              <dt>Left today</dt>
              <dd>{formatUsd(entry.leftToday)}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Agent asked for</dt>
            <dd>{formatUsd(AGENT_RAISE)} per payment and per day</dd>
          </div>
        )}
        <div>
          <dt>Practice clock</dt>
          <dd>{formatTime(entry.at)}</dd>
        </div>
      </dl>
      <details className="tech">
        <summary>Technical details</summary>
        <dl>
          {isPayment && outcome.ok && entry.outcome.code !== undefined && (
            <div>
              <dt>Reason code</dt>
              <dd>
                {entry.outcome.code} ({reasonName(entry.outcome.code)})
              </dd>
            </div>
          )}
          {!outcome.ok && (
            <div>
              <dt>Contract reverted with</dt>
              <dd>{outcome.revert}</dd>
            </div>
          )}
          {isPayment && (
            <>
              <div>
                <dt>Request number (nonce)</dt>
                <dd>{entry.nonce.toString()}</dd>
              </div>
              <div>
                <dt>Recipient address</dt>
                <dd>{entry.to}</dd>
              </div>
            </>
          )}
          {explorer !== undefined && (
            <div>
              <dt>Transaction</dt>
              <dd>
                {outcome.tx ? (
                  <a href={`${explorer}/tx/${outcome.tx}`} rel="noopener noreferrer">
                    {outcome.tx}
                  </a>
                ) : (
                  'None. The contract refused when asked, so nothing was sent and no gas was spent.'
                )}
              </dd>
            </div>
          )}
          <div>
            <dt>Gas used</dt>
            <dd>{outcome.gasUsed.toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt>Vault address</dt>
            <dd>{vault}</dd>
          </div>
        </dl>
      </details>
    </article>
  )
}

/** What a screen reader hears when this entry arrives. */
export function announcement(entry: Entry, nameOf: (address: string) => string): string {
  if (entry.kind === 'owner' || entry.kind === 'skip') return note(entry, nameOf)
  const said = verdict(entry)
  return `${said.headline}. ${said.sentence}`
}
