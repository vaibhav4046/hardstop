'use client'

// Shown on every page while the visitor's vault has a loosening waiting out
// its cooling period. The ratchet only protects an owner who notices a change
// they did not ask for, so the site says so wherever the owner is, not only
// on the Activity page. It reads the vault's own `queued`; nothing is guessed.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { formatTime, formatUsd } from '@/lib/money'
import { useVault } from '@/lib/vault-store'

export function WaitingChange() {
  const vault = useVault()
  const pathname = usePathname()
  const queued = vault.status === 'ready' ? (vault.view?.state.queued ?? null) : null
  if (queued === null) return null

  const live = vault.live
  // A waiting change that would end a pause is, to the owner, the agent coming back.
  const resumes = vault.view?.state.policy.paused === true && !queued.paused
  return (
    <div className="wrap">
      <section className="notice waiting-change mt-4" role="status" aria-labelledby="waiting-change-title">
        <h2 id="waiting-change-title" className="text-lg font-medium">
          A change that loosens your vault&rsquo;s rules is waiting
        </h2>
        <p className="mt-1">
          {resumes ? `The agent is paused and resumes at ${formatTime(queued.effectiveAt)}: from then` : `From ${formatTime(queued.effectiveAt)}`}{' '}
          the agent could pay up to {formatUsd(queued.perPayment)} at a time and {formatUsd(queued.perWindow)} a day
          {queued.paused ? ', though it stays paused' : ''}. If you did not ask for this, cancel it before then
          {resumes ? ' and it stays paused' : ''}.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn"
            disabled={vault.busy}
            onClick={() => void vault.act({ type: 'cancel' })}
          >
            Cancel the change
          </button>
          {pathname !== '/activity' && <Link href="/activity#scheduled">See it on your vault</Link>}
          {live !== null && (
            <a href={`${live.network.explorer}/address/${live.vault.vault}`} rel="noopener noreferrer">
              Watch this vault on the {live.network.name} explorer for email alerts
            </a>
          )}
        </div>
      </section>
    </div>
  )
}
