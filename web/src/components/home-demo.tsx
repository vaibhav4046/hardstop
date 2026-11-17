'use client'

// A small practice vault on the home page. It is separate from the visitor's
// own vault and is not saved: a reload starts it again.

import { useEffect, useRef, useState } from 'react'
import type { Sim } from '@/lib/hardstop/sim'
import { loadSim } from '@/lib/load-sim'
import { formatUsd, USD } from '@/lib/money'
import { apply, build, exampleSetup, snapshot, type Entry, type Session, type View } from '@/lib/session'
import { announcement, Slip } from './slip'

const EXAMPLE = exampleSetup(0n)
const PAYEE = EXAMPLE.recipients[0]
const SHOWN = 3

type Demo = { sim: Sim; session: Session }

export function HomeDemo() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [view, setView] = useState<View | null>(null)
  const [status, setStatus] = useState<'idle' | 'working' | 'failed'>('idle')
  const demoRef = useRef<Promise<Demo> | null>(null)

  /** Deploys the example vault once; later calls reuse it. */
  function start(): Promise<Demo> {
    demoRef.current ??= (async () => {
      const session: Session = { setup: exampleSetup(BigInt(Math.floor(Date.now() / 1000))), actions: [] }
      const { sim } = await build(await loadSim(), session)
      setView(await snapshot(sim, session))
      return { sim, session }
    })()
    return demoRef.current
  }

  function boot() {
    start()
      .then(() => setStatus('idle'))
      .catch(() => {
        demoRef.current = null
        setStatus('failed')
      })
  }

  // Runs once, after the page has rendered: `boot` only touches a ref and state setters.
  useEffect(boot, [])

  async function ask(dollars: bigint) {
    setStatus('working')
    try {
      const { sim, session } = await start()
      const { ledger } = await sim.state()
      const entry = await apply(
        sim,
        { type: 'pay', to: PAYEE.address, amount: (dollars * USD).toString(), nonce: ledger.nextNonce.toString() },
        entries.length,
      )
      setEntries((earlier) => [entry, ...earlier])
      setView(await snapshot(sim, session))
      setStatus('idle')
    } catch {
      demoRef.current = null
      setStatus('failed')
    }
  }

  const nameOf = () => PAYEE.name
  const latest = entries[0]

  return (
    <section aria-labelledby="demo-title">
      <h2 id="demo-title" className="sub-title">
        Try it on a practice vault
      </h2>
      <p className="mt-2">
        This one allows {formatUsd(BigInt(EXAMPLE.perPayment))} per payment and {formatUsd(BigInt(EXAMPLE.perDay))}{' '}
        per day, to one approved recipient, {PAYEE.name}.
      </p>

      <div className="mt-5 grid gap-3 min-[26rem]:grid-cols-2">
        <button type="button" className="btn" disabled={status === 'working'} onClick={() => ask(4n)}>
          Agent pays $4
        </button>
        <button type="button" className="btn" disabled={status === 'working'} onClick={() => ask(80n)}>
          Agent tries $80
        </button>
      </div>

      <p className="small soft mt-3" aria-live="off">
        {status === 'failed'
          ? null
          : view === null
            ? 'Starting the practice vault…'
            : `In the vault: ${formatUsd(view.state.vaultBalance)}. Left today: ${formatUsd(view.leftToday)}.`}
      </p>
      {status === 'failed' && (
        <div className="notice mt-3" role="alert">
          <p>The practice vault could not start in this browser.</p>
          <button type="button" className="btn mt-3" onClick={boot}>
            Try again
          </button>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {latest ? announcement(latest, nameOf) : ''}
      </p>

      <div className="mt-5 grid gap-4">
        {entries.length === 0 ? (
          <p className="hair-top soft small">The vault&rsquo;s answer prints here as a receipt.</p>
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
    </section>
  )
}
