'use client'

// What only the owner can do. Each control sends one message to the vault as
// the owner; whether it applied at once or was scheduled is read back from
// the contract, not assumed here.

import { useState, type FormEvent } from 'react'
import { amountError, formatDuration, formatTime, formatUsd, inputValue, parseUsd } from '@/lib/money'
import { DAY, practiceAddress, type Action, type Entry, type View } from '@/lib/session'
import { MoneyField } from './money-field'

type Props = {
  view: View
  isBusy: boolean
  run: (action: Action) => Promise<Entry | null>
  onReset: () => void
}

const KEEP = 'keep'

export function OwnerControls({ view, isBusy, run, onReset }: Props) {
  const { policy, queued, schedule, now, vaultBalance } = view.state
  const cooling = formatDuration(schedule.coolingSecs)
  // A new proposal replaces the scheduled one, so resuming keeps whatever limits are already waiting.
  const pending = queued ?? policy

  return (
    <section aria-labelledby="owner-title" className="card">
      <h2 id="owner-title" className="sub-title">
        What only you can do
      </h2>

      <div className="mt-5">
        {policy.paused ? (
          <>
            <p className="tag tag-stop">Paused</p>
            <p className="mt-2">Nothing the agent asks for is paid.</p>
            {queued !== null && !queued.paused ? (
              <p className="small soft mt-2">Resuming is scheduled for {formatTime(queued.effectiveAt)}.</p>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-wide mt-3"
                  disabled={isBusy}
                  onClick={() =>
                    run({
                      type: 'propose',
                      perPayment: pending.perPayment.toString(),
                      perDay: pending.perWindow.toString(),
                      validUntil: pending.validUntil.toString(),
                      paused: false,
                    })
                  }
                >
                  Resume the agent
                </button>
                <p className="hint mt-2">Resuming loosens the rules, so it waits {cooling} before it takes effect.</p>
              </>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-stop btn-wide" disabled={isBusy} onClick={() => run({ type: 'pause' })}>
              Pause the agent now
            </button>
            <p className="hint mt-2">Instant. While paused, nothing the agent asks for is paid.</p>
          </>
        )}
      </div>

      <div className="mt-6 border-t border-rule">
        <details className="disclosure">
          <summary>Change limits</summary>
          <LimitsForm key={`${policy.perPayment}-${policy.perWindow}`} view={view} isBusy={isBusy} run={run} />
        </details>

        <details className="disclosure">
          <summary>Recipients ({view.recipients.length})</summary>
          <ul className="grid gap-3">
            {view.recipients.map((recipient) => (
              <li key={recipient.address} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span>
                  <span className="font-medium">{recipient.name}</span>
                  {recipient.approvedFrom > now ? (
                    <span className="tag tag-cool block">Can be paid from {formatTime(recipient.approvedFrom)}</span>
                  ) : (
                    <span className="small soft block">Can be paid</span>
                  )}
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={isBusy}
                  aria-label={`Remove ${recipient.name}`}
                  onClick={() => run({ type: 'removeRecipient', address: recipient.address })}
                >
                  Remove
                </button>
              </li>
            ))}
            {view.recipients.length === 0 && <li className="small soft">Nobody is on the list.</li>}
          </ul>
          <RecipientForm view={view} isBusy={isBusy} run={run} />
        </details>

        <details className="disclosure">
          <summary>Withdraw money</summary>
          <WithdrawForm balance={vaultBalance} isBusy={isBusy} run={run} />
        </details>

        <details className="disclosure">
          <summary>Start over</summary>
          <p className="small">This forgets the practice vault and its receipts. It cannot be undone.</p>
          <button type="button" className="btn mt-3" onClick={onReset}>
            Close this practice vault
          </button>
        </details>
      </div>
    </section>
  )
}

type FormProps = Pick<Props, 'view' | 'isBusy' | 'run'>

function LimitsForm({ view, isBusy, run }: FormProps) {
  const { policy, queued, schedule, now } = view.state
  const [perPayment, setPerPayment] = useState(inputValue(policy.perPayment))
  const [perDay, setPerDay] = useState(inputValue(policy.perWindow))
  const [ends, setEnds] = useState(KEEP)
  const [errors, setErrors] = useState<{ perPayment?: string; perDay?: string }>({})

  function submit(event: FormEvent) {
    event.preventDefault()
    const found = {
      perPayment: amountError(perPayment, 'the most per payment'),
      perDay: amountError(perDay, 'the most per day'),
    }
    const payment = parseUsd(perPayment)
    const day = parseUsd(perDay)
    if (!found.perPayment && !found.perDay && payment !== null && day !== null && payment > day) {
      found.perPayment = 'One payment cannot be larger than the whole day’s limit.'
    }
    setErrors(found)
    if (found.perPayment || found.perDay || payment === null || day === null) return
    void run({
      type: 'propose',
      perPayment: payment.toString(),
      perDay: day.toString(),
      validUntil: (ends === KEEP ? policy.validUntil : now + BigInt(ends) * DAY).toString(),
      // Keep a resume that is already waiting; this form only changes limits.
      paused: (queued ?? policy).paused,
    })
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <p className="hint">
        Anything you lower applies at once. Anything you raise waits {formatDuration(schedule.coolingSecs)} and shows
        as Scheduled until then. Saving a new change replaces one that is already scheduled.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <MoneyField id="limit-payment" label="Most per payment" value={perPayment} onChange={setPerPayment} error={errors.perPayment} />
        <MoneyField id="limit-day" label="Most per day" value={perDay} onChange={setPerDay} error={errors.perDay} />
      </div>
      <div className="field">
        <label htmlFor="limit-ends">Permission ends</label>
        <select id="limit-ends" className="input" value={ends} onChange={(event) => setEnds(event.target.value)}>
          <option value={KEEP}>Keep {formatTime(policy.validUntil)}</option>
          {[7, 30, 90].map((days) => (
            <option key={days} value={days}>
              {days} days from now, {formatTime(now + BigInt(days) * DAY)}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary" disabled={isBusy}>
        Save limits
      </button>
    </form>
  )
}

function RecipientForm({ view, isBusy, run }: FormProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    const wanted = name.trim()
    const problem =
      wanted === ''
        ? 'Enter a name for the recipient.'
        : view.recipients.some((recipient) => recipient.name.toLowerCase() === wanted.toLowerCase())
          ? 'There is already a recipient with that name.'
          : undefined
    setError(problem)
    if (problem) return
    if (await run({ type: 'addRecipient', name: wanted, address: practiceAddress() })) setName('')
  }

  return (
    <form onSubmit={submit} noValidate className="mt-5 grid gap-3">
      <div className="field">
        <label htmlFor="new-recipient">Add a recipient</label>
        <input
          id="new-recipient"
          className="input"
          value={name}
          maxLength={40}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={`new-recipient-hint${error ? ' new-recipient-error' : ''}`}
          onChange={(event) => setName(event.target.value)}
        />
        <p id="new-recipient-hint" className="hint">
          You only choose a name. A new recipient can be paid after {formatDuration(view.state.schedule.coolingSecs)}.
        </p>
        {error && (
          <p id="new-recipient-error" className="error">
            {error}
          </p>
        )}
      </div>
      <button type="submit" className="btn" disabled={isBusy}>
        Add recipient
      </button>
    </form>
  )
}

function WithdrawForm({ balance, isBusy, run }: { balance: bigint } & Pick<Props, 'isBusy' | 'run'>) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    const units = parseUsd(amount)
    const problem =
      amountError(amount, 'the amount') ??
      (units !== null && units > balance ? `The vault only holds ${formatUsd(balance)}.` : undefined)
    setError(problem)
    if (problem || units === null) return
    if (await run({ type: 'withdraw', amount: units.toString() })) setAmount('')
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-3">
      <MoneyField
        id="withdraw-amount"
        label="Amount to take back"
        value={amount}
        onChange={setAmount}
        error={error}
        hint={`The vault holds ${formatUsd(balance)}. Withdrawals go to you and nowhere else, at once.`}
      />
      <button type="submit" className="btn" disabled={isBusy}>
        Withdraw to yourself
      </button>
    </form>
  )
}
