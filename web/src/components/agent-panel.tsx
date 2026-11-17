'use client'

// The agent in practice mode: buttons that send requests to the vault from
// the agent's address. The vault decides; this panel never does.

import { useState, type FormEvent } from 'react'
import type { Hex } from 'viem'
import { amountError, formatUsd, parseUsd, USD } from '@/lib/money'
import { AGENT_RAISE, UNAPPROVED, type Action, type Entry, type View } from '@/lib/session'
import { MoneyField } from './money-field'

type Props = {
  view: View
  entries: Entry[]
  isBusy: boolean
  run: (action: Action) => Promise<Entry | null>
}

export function AgentPanel({ view, entries, isBusy, run }: Props) {
  const [amount, setAmount] = useState('4')
  const [chosen, setTo] = useState<Hex>(view.recipients[0]?.address ?? UNAPPROVED)
  const [error, setError] = useState<string>()

  const first = view.recipients[0]
  // A recipient chosen earlier may have been removed from the list since.
  const to = view.recipients.some((recipient) => recipient.address === chosen) ? chosen : UNAPPROVED
  // The request worth repeating is one that was paid: sending it again is the
  // "pay me twice" attempt. Repeating a refused request only repeats the refusal.
  const last = entries
    .filter((entry) => entry.kind === 'payment')
    .findLast((entry) => entry.outcome.code === 0)

  /** A new request carries the number the contract says comes next. */
  const pay = (recipient: Hex, units: bigint) =>
    run({ type: 'pay', to: recipient, amount: units.toString(), nonce: view.state.ledger.nextNonce.toString() })

  function sendCustom(event: FormEvent) {
    event.preventDefault()
    const problem = amountError(amount, 'the amount')
    setError(problem)
    if (!problem) void pay(to, parseUsd(amount)!)
  }

  return (
    <section aria-labelledby="agent-title" className="card card-live">
      <h2 id="agent-title" className="sub-title">
        What the agent tries
      </h2>
      <p className="soft mt-2 max-w-[36rem]">
        Each button sends a request to the vault as the agent. The vault answers, and its answer prints below as a
        receipt.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {first ? (
          <>
            <button type="button" className="btn" disabled={isBusy} onClick={() => pay(first.address, 4n * USD)}>
              Pay $4.00 to {first.name}
            </button>
            <button type="button" className="btn" disabled={isBusy} onClick={() => pay(first.address, 80n * USD)}>
              Pay $80.00 to {first.name}
            </button>
          </>
        ) : (
          <p className="small soft sm:col-span-2">
            There is no recipient on your list, so the agent has nobody approved to pay. Add one under Recipients.
          </p>
        )}
        <button type="button" className="btn" disabled={isBusy} onClick={() => pay(UNAPPROVED, 4n * USD)}>
          Pay $4.00 to an address you never approved
        </button>
        <button
          type="button"
          className="btn"
          disabled={isBusy || last === undefined}
          onClick={() =>
            last && run({ type: 'pay', to: last.to, amount: last.amount.toString(), nonce: last.nonce.toString() })
          }
        >
          Send the last paid request again
        </button>
        <button type="button" className="btn sm:col-span-2" disabled={isBusy} onClick={() => run({ type: 'agentRaise' })}>
          Raise its own limit to {formatUsd(AGENT_RAISE)}
        </button>
      </div>

      <details className="disclosure mt-4">
        <summary>Send a different request</summary>
        <form onSubmit={sendCustom} noValidate className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-start">
          <MoneyField id="custom-amount" label="Amount" value={amount} onChange={setAmount} error={error} />
          <div className="field">
            <label htmlFor="custom-to">Pay to</label>
            <select id="custom-to" className="input" value={to} onChange={(event) => setTo(event.target.value as Hex)}>
              {view.recipients.map((recipient) => (
                <option key={recipient.address} value={recipient.address}>
                  {recipient.name}
                </option>
              ))}
              <option value={UNAPPROVED}>An address you never approved</option>
            </select>
          </div>
          <button type="submit" className="btn sm:mt-[1.875rem]" disabled={isBusy}>
            Send request
          </button>
        </form>
      </details>
    </section>
  )
}
