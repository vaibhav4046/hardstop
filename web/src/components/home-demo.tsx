'use client'

// The live example on the home page: two requests an agent might send, and
// the receipts the vault prints for them.

import { formatUsd, USD } from '@/lib/money'
import { exampleSetup } from '@/lib/session'
import { useHomeVault } from './home-vault'
import { announcement, Slip } from './slip'

const EXAMPLE = exampleSetup(0n)
const PAYEE = EXAMPLE.recipients[0]
const SHOWN = 3

export function HomeDemo() {
  const { view, entries, status, send, restart } = useHomeVault()

  const ask = (dollars: bigint) =>
    send(({ ledger }) => ({
      type: 'pay',
      to: PAYEE.address,
      amount: (dollars * USD).toString(),
      nonce: ledger.nextNonce.toString(),
    }))

  const nameOf = (address: string) => (address === PAYEE.address ? PAYEE.name : 'an address you never approved')
  const latest = entries[0]

  return (
    <section id="live-example" className="wrap band" aria-labelledby="demo-title" data-practice-vault>
      <div className="split">
        <div>
          <h2 id="demo-title" className="section-title">
            Try it on a practice vault
          </h2>
          <p className="section-lede">
            This one allows {formatUsd(BigInt(EXAMPLE.perPayment))} per payment and {formatUsd(BigInt(EXAMPLE.perDay))}{' '}
            per day, to one approved recipient, {PAYEE.name}.
          </p>

          <div className="btn-pair mt-7">
            <button type="button" className="btn btn-large" disabled={status === 'working'} onClick={() => ask(4n)}>
              Agent pays $4
            </button>
            <button type="button" className="btn btn-large" disabled={status === 'working'} onClick={() => ask(80n)}>
              Agent tries $80
            </button>
          </div>

          <p className="small soft mt-4" aria-live="off">
            {status === 'failed'
              ? null
              : view === null
                ? 'Starting the practice vault…'
                : `In the vault: ${formatUsd(view.state.vaultBalance)}. Left today: ${formatUsd(view.leftToday)}.`}
          </p>
          {status === 'failed' && (
            <div className="notice mt-3" role="alert">
              <p>The practice vault could not start in this browser.</p>
              <button type="button" className="btn mt-3" onClick={restart}>
                Try again
              </button>
            </div>
          )}

          <p className="sr-only" role="status" aria-live="polite">
            {latest ? announcement(latest, nameOf) : ''}
          </p>
        </div>

        <div className="card card-live grid gap-4">
          <p className="panel-title">The vault&rsquo;s answers, newest first</p>
          {entries.length === 0 ? (
            <p className="tile soft">The vault&rsquo;s answer prints here as a receipt.</p>
          ) : (
            entries
              .slice(0, SHOWN)
              .map((entry, index) => (
                <Slip key={entry.id} entry={entry} nameOf={nameOf} vault={view?.vault ?? '0x'} isNew={index === 0} />
              ))
          )}
          {entries.length > SHOWN && (
            <p className="small soft">
              Showing the latest {SHOWN} of {entries.length} requests.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
