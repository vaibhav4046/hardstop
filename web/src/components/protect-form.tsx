'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import type { Step } from '@/lib/live/launch'
import { NETWORKS } from '@/lib/live/wallet'
import { loadSim } from '@/lib/load-sim'
import { amountError, formatDuration, formatTime, formatUsd, parseUsd } from '@/lib/money'
import { build, DAY, nameProblem, practiceAddress, sameName, snapshot, type SessionSetup, type View } from '@/lib/session'
import { useVault } from '@/lib/vault-store'
import { MoneyField } from './money-field'

const DURATIONS = [7n, 30n, 90n]
const COOLING = [
  { secs: DAY, label: '24 hours', hint: 'Recommended. Long enough to notice a change you did not make and cancel it.' },
  {
    secs: 60n,
    label: '1 minute',
    hint: 'For trying things out here. Far too short to protect real money.',
  },
]
const MAX_RECIPIENTS = 3

/** What the main button says while a vault is being created on a network. */
const STEPS: Record<Step, string> = {
  wallet: 'Waiting for your wallet…',
  network: 'Switching network in your wallet…',
  installing: 'Approve the one-time install in your wallet…',
  launching: 'Approve the vault in your wallet…',
  confirming: 'Waiting for the network to confirm…',
}

type Row = { id: number; name: string }
type Errors = Partial<Record<'perPayment' | 'perDay' | 'funding' | 'recipients', string>>
type Draft = { setup: SessionSetup; view: View }

export function ProtectForm() {
  const vault = useVault()
  const router = useRouter()
  const nextId = useRef(1)
  const summaryRef = useRef<HTMLDivElement>(null)
  const reviewRef = useRef<HTMLHeadingElement>(null)

  const [perPayment, setPerPayment] = useState('10')
  const [perDay, setPerDay] = useState('20')
  const [days, setDays] = useState(30n)
  const [cooling, setCooling] = useState(DAY)
  const [funding, setFunding] = useState('100')
  const [rows, setRows] = useState<Row[]>([{ id: 0, name: 'Cloud hosting' }])
  // After the first press of Review, errors follow the form: one that is fixed goes away at once.
  const [hasTried, setTried] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [phase, setPhase] = useState<'edit' | 'checking' | 'review' | 'creating' | 'failed'>('edit')
  const [chainId, setChainId] = useState(NETWORKS[0].chainId)
  const network = NETWORKS.find((candidate) => candidate.chainId === chainId) ?? NETWORKS[0]

  // Moving to the review replaces the form, so focus goes to its heading.
  useEffect(() => {
    if (phase === 'review') reviewRef.current?.focus()
  }, [phase])

  // Next.js keeps this page mounted, hidden, after the visitor leaves it. Once
  // a vault has been created the review is finished, so when the page is
  // hidden it goes back to the form; the entries stay for the next vault.
  const isCreated = useRef(false)
  useLayoutEffect(
    () => () => {
      if (!isCreated.current) return
      isCreated.current = false
      setDraft(null)
      setPhase('edit')
    },
    [],
  )

  function validate(): Errors {
    const found: Errors = {
      perPayment: amountError(perPayment, 'the most per payment'),
      perDay: amountError(perDay, 'the most per day'),
      funding: amountError(funding, 'the starting balance'),
    }
    const payment = parseUsd(perPayment)
    const day = parseUsd(perDay)
    if (!found.perPayment && !found.perDay && payment !== null && day !== null && payment > day) {
      found.perPayment = 'One payment cannot be larger than the whole day’s limit.'
    }
    const names = rows.map((row) => row.name.trim())
    const nameIssue = names.map(nameProblem).find(Boolean)
    if (names.some((name) => name === '')) found.recipients = 'Give every recipient a name, or remove the empty one.'
    else if (nameIssue) found.recipients = nameIssue
    else if (names.some((name, i) => names.findIndex((other) => sameName(other, name)) !== i)) {
      found.recipients = 'Two recipients have the same name. Give each a different one.'
    }
    return Object.fromEntries(Object.entries(found).filter(([, message]) => message)) as Errors
  }

  const errors: Errors = hasTried ? validate() : {}

  // A recipient just added gets the cursor, so its name can be typed straight away.
  const isAdding = useRef(false)
  useEffect(() => {
    if (!isAdding.current) return
    isAdding.current = false
    document.getElementById(`recipient-${rows.length - 1}`)?.focus()
  }, [rows])

  /** Deploys a throwaway vault with these exact rules so the review can show the contract's own worst-case number. */
  async function review(event: FormEvent) {
    event.preventDefault()
    const found = validate()
    setTried(true)
    if (Object.keys(found).length > 0) {
      summaryRef.current?.focus()
      return
    }
    setPhase('checking')
    const now = BigInt(Math.floor(Date.now() / 1000))
    const setup: SessionSetup = {
      perPayment: parseUsd(perPayment)!.toString(),
      perDay: parseUsd(perDay)!.toString(),
      validUntil: (now + days * DAY).toString(),
      coolingSecs: cooling.toString(),
      funding: parseUsd(funding)!.toString(),
      now: now.toString(),
      recipients: rows.map((row) => ({ name: row.name.trim(), address: practiceAddress() })),
    }
    try {
      const session = { setup, actions: [] }
      const { sim } = await build(await loadSim(), session)
      setDraft({ setup, view: await snapshot(sim, session) })
      setPhase('review')
    } catch {
      setPhase('failed')
    }
  }

  async function confirm() {
    if (draft === null) return
    setPhase('creating')
    if (await vault.create(draft.setup)) {
      isCreated.current = true
      router.push('/activity')
    } else setPhase('failed')
  }

  /** Creates the vault on the chosen test network, through the visitor's wallet. */
  async function confirmLive() {
    if (draft === null) return
    setPhase('creating')
    if (await vault.createLive(draft.setup, network)) {
      isCreated.current = true
      router.push('/activity')
    } else setPhase('review')
  }

  if (phase === 'failed') {
    return (
      <div className="notice max-w-[36rem]" role="alert">
        <h2 className="sub-title">The practice vault could not be created</h2>
        <p className="mt-2">
          The part of this site that runs the contract did not load. Check your connection, then try again. Your
          entries are still here.
        </p>
        <button type="button" className="btn mt-4" onClick={() => setPhase(draft ? 'review' : 'edit')}>
          Try again
        </button>
      </div>
    )
  }

  if ((phase === 'review' || phase === 'creating') && draft !== null) {
    const { setup, view } = draft
    const coolingText = formatDuration(BigInt(setup.coolingSecs))
    const shown = view.worstCase < view.state.vaultBalance ? view.worstCase : view.state.vaultBalance
    return (
      <section aria-labelledby="review-title" className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="card">
          <h2 id="review-title" className="section-title" tabIndex={-1} ref={reviewRef}>
            Check the rules before you create the vault
          </h2>
          <ul className="bullets mt-6 max-w-[40rem] text-lg">
            <li>
              Your agent may pay up to <strong>{formatUsd(view.state.policy.perPayment)}</strong> at a time, and up to{' '}
              <strong>{formatUsd(view.state.policy.perWindow)}</strong> in a day.
            </li>
            <li>
              It may pay only{' '}
              {setup.recipients.length === 0 ? (
                <strong>nobody yet</strong>
              ) : (
                <strong>{new Intl.ListFormat('en', { type: 'conjunction' }).format(setup.recipients.map((r) => r.name))}</strong>
              )}
              .
            </li>
            <li>
              Its permission ends on <strong>{formatTime(view.state.policy.validUntil)}</strong>.
            </li>
            <li>
              The vault starts with <strong>{formatUsd(view.state.vaultBalance)}</strong> in test dollars.
            </li>
            <li>
              You can lower a limit, pause the agent or remove a recipient at once. Raising a limit, moving the end
              date later, adding a recipient or resuming after a pause waits <strong>{coolingText}</strong>, and you
              can cancel it while it waits.
            </li>
          </ul>
          <p className="small soft prose mt-4">
            A day is a fixed 24 hours counted from the moment the vault is created, not a rolling one. The cooling
            period cannot be changed later; to change it you withdraw and create a new vault.
          </p>
          {setup.recipients.length === 0 && (
            <p className="notice mt-5 max-w-[40rem]">
              With no recipients the agent cannot pay anyone. You can add one later; it becomes payable after{' '}
              {coolingText}.
            </p>
          )}
          <h3 className="column-title mt-10">Where should it live?</h3>
          <div className="choices">
            <div>
              <button type="button" className="btn btn-primary btn-large" disabled={phase === 'creating'} onClick={confirmLive}>
                {phase === 'creating' && vault.step !== null ? STEPS[vault.step] : `Open it on ${network.name}`}
              </button>
              <p className="small soft mt-3 max-w-[34rem]">
                A public test network. Your wallet is the owner and asks you to approve one transaction, or two if
                nobody has used this site on that network before. It costs a little test ETH in network fees. Test ETH and
                test dollars have no value.
              </p>
              <div className="field mt-3 max-w-[16rem]">
                <label htmlFor="network">Network</label>
                <select
                  id="network"
                  className="input"
                  value={chainId}
                  disabled={phase === 'creating'}
                  onChange={(event) => setChainId(Number(event.target.value))}
                >
                  {NETWORKS.map((option) => (
                    <option key={option.chainId} value={option.chainId}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              {vault.problem !== null && (
                <p className="notice mt-4 max-w-[34rem]" role="alert">
                  {vault.problem}
                </p>
              )}
            </div>
            <div>
              <button type="button" className="btn btn-large" disabled={phase === 'creating'} onClick={confirm}>
                {phase === 'creating' && vault.step === null ? 'Creating the vault…' : 'Create it in this browser'}
              </button>
              <p className="small soft mt-3 max-w-[34rem]">
                No wallet needed. The same contract runs on a private chain inside this page, and the vault is gone
                when you close the tab.
              </p>
            </div>
          </div>
          <p className="mt-8">
            <button type="button" className="btn btn-quiet" disabled={phase === 'creating'} onClick={() => setPhase('edit')}>
              Change something
            </button>
          </p>
          {vault.status === 'ready' && (
            <p className="small soft mt-4">Creating this vault replaces the one this browser is showing now.</p>
          )}
        </div>

        <aside className="card card-live self-start" aria-labelledby="review-worst-title">
          <h3 id="review-worst-title" className="label">
            Worst case in the next {coolingText}
          </h3>
          <p className="figure figure-gold mt-3">{formatUsd(shown)}</p>
          <p className="soft mt-4">
            That is the most your agent could take from this vault between now and {formatTime(view.worstCaseUntil)},
            whatever it tries and whatever anyone signs as you in that time.
          </p>
          {shown < view.worstCase && (
            <p className="small soft mt-3">
              The rules alone would allow {formatUsd(view.worstCase)}; the figure is capped at what the vault holds.
            </p>
          )}
          <p className="small soft mt-3">This number is calculated by the contract itself, not by this page.</p>
          <details className="tech">
            <summary>Technical details</summary>
            <dl>
              {setup.recipients.map((recipient) => (
                <div key={recipient.address}>
                  <dt>Address made for {recipient.name}</dt>
                  <dd>{recipient.address}</dd>
                </div>
              ))}
              <div>
                <dt>Worst case</dt>
                <dd>exposure({view.worstCaseUntil.toString()}) = {view.worstCase.toString()} units</dd>
              </div>
            </dl>
          </details>
        </aside>
      </section>
    )
  }

  const errorList = Object.entries(errors) as [keyof Errors, string][]
  const busy = phase === 'checking'

  return (
    <form onSubmit={review} noValidate className="grid max-w-[44rem] gap-5">
      <div ref={summaryRef} tabIndex={-1} role="alert" className={errorList.length > 0 ? 'notice' : 'sr-only'}>
        {errorList.length > 0 && (
          <>
            <p className="font-semibold">Fix {errorList.length === 1 ? 'this' : `these ${errorList.length} things`} to continue</p>
            <ul className="mt-2 grid gap-1">
              {errorList.map(([field, message]) => (
                <li key={field}>
                  <a href={`#${field === 'recipients' ? 'recipient-0' : field}`} className="error">
                    {message}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <fieldset className="card">
        <legend className="sub-title mb-4">How much may your agent spend?</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <MoneyField id="perPayment" label="Most per payment" value={perPayment} onChange={setPerPayment} error={errors.perPayment} />
          <MoneyField
            id="perDay"
            label="Most per day"
            value={perDay}
            onChange={setPerDay}
            error={errors.perDay}
            hint="A day is a fixed 24 hours from the moment you create the vault."
          />
        </div>
      </fieldset>

      <fieldset className="card">
        <legend className="sub-title mb-4">Who may it pay?</legend>
        <p className="hint mb-4">
          Up to {MAX_RECIPIENTS} to start with. You only choose a name: each gets a practice address made up for you.
        </p>
        <div className="grid gap-3">
          {rows.map((row, index) => (
            <div key={row.id} className="flex items-end gap-3">
              <div className="field flex-1">
                <label htmlFor={`recipient-${index}`}>Recipient {index + 1}</label>
                <input
                  id={`recipient-${index}`}
                  className="input"
                  value={row.name}
                  maxLength={40}
                  autoComplete="off"
                  aria-invalid={errors.recipients ? true : undefined}
                  aria-describedby={errors.recipients ? 'recipients-error' : undefined}
                  onChange={(event) =>
                    setRows(rows.map((other) => (other.id === row.id ? { ...other, name: event.target.value } : other)))
                  }
                />
              </div>
              <button
                type="button"
                className="btn"
                aria-label={`Remove recipient ${index + 1}${row.name ? `, ${row.name}` : ''}`}
                onClick={() => setRows(rows.filter((other) => other.id !== row.id))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {errors.recipients && (
          <p id="recipients-error" className="error mt-2">
            {errors.recipients}
          </p>
        )}
        {rows.length < MAX_RECIPIENTS ? (
          <button
            type="button"
            className="btn mt-4"
            onClick={() => {
              isAdding.current = true
              setRows([...rows, { id: nextId.current++, name: '' }])
            }}
          >
            Add a recipient
          </button>
        ) : (
          <p className="hint mt-4">That is the most a vault can start with. You can add more later.</p>
        )}
      </fieldset>

      <fieldset className="card">
        <legend className="sub-title mb-4">How long does the permission last?</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {DURATIONS.map((option) => (
            <label key={option.toString()} className="choice">
              <input type="radio" name="days" checked={days === option} onChange={() => setDays(option)} />
              <span>{option.toString()} days</span>
            </label>
          ))}
        </div>
        <p className="hint mt-3">After that the agent can pay nothing until you extend it.</p>
      </fieldset>

      <fieldset className="card">
        <legend className="sub-title mb-4">How long must a looser rule wait?</legend>
        <p className="hint mb-4">
          This is the cooling period. Raising a limit, moving the end date later, adding a recipient or resuming after
          a pause only takes effect once it has passed.
        </p>
        <div className="grid gap-3">
          {COOLING.map((option) => (
            <label key={option.label} className="choice">
              <input type="radio" name="cooling" checked={cooling === option.secs} onChange={() => setCooling(option.secs)} />
              <span>
                <span className="font-medium">{option.label}</span>
                <span className="hint block">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="card">
        <legend className="sub-title mb-4">How much goes in the vault?</legend>
        <div className="max-w-[20rem]">
          <MoneyField
            id="funding"
            label="Starting balance"
            value={funding}
            onChange={setFunding}
            error={errors.funding}
            hint="Test dollars, made up for practice. They are worth nothing."
          />
        </div>
      </fieldset>

      <div className="mt-4">
        <button type="submit" className="btn btn-primary btn-large" disabled={busy}>
          {busy ? 'Checking the rules…' : 'Review the rules'}
        </button>
        <p className="hint mt-3">
          Nothing is created yet. Next you see the rules in plain words and the worst-case number.{' '}
          <Link href="/how-it-works">How it works</Link>
        </p>
      </div>
    </form>
  )
}
