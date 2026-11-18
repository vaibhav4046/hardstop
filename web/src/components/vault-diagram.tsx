'use client'

// A moving diagram of what the vault does with each request, using the
// practice vault's own rules. One loop shows three requests in turn: one
// inside every rule is paid, one over the cap per payment is blocked at the
// first check, and a request to raise the limit is rejected at the door.
// It is an illustration on a loop, not a feed of anything that happened; the
// caption says so and carries the meaning, and the drawing is hidden from
// screen readers. It only plays while it is on screen. Styles: styles/flow.css.

import { useEffect, useRef, useState } from 'react'
import { formatUsd, USD } from '@/lib/money'
import { exampleSetup } from '@/lib/session'

const EXAMPLE = exampleSetup(0n)
const PAYEE = EXAMPLE.recipients[0]
const SMALL = formatUsd(4n * USD)
const LARGE = formatUsd(80n * USD)
const CAP = formatUsd(BigInt(EXAMPLE.perPayment))
const DAILY = formatUsd(BigInt(EXAMPLE.perDay))

const CHECKS = [`Up to ${CAP} a payment`, `Up to ${DAILY} a day`, 'To a recipient you approved', 'Before the end date']

export function VaultDiagram() {
  const ref = useRef<HTMLDivElement>(null)
  const [isPlaying, setPlaying] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const seen = new IntersectionObserver(([entry]) => setPlaying(entry.isIntersecting), { threshold: 0.25 })
    seen.observe(node)
    return () => seen.disconnect()
  }, [])

  return (
    <figure className="vd reveal">
      <div ref={ref} className="vd-stage" aria-hidden="true" data-playing={isPlaying || undefined}>
        <div className="vd-node">Your agent</div>
        <div className="vd-track">
          <span className="vd-token vd-small">{SMALL}</span>
          <span className="vd-token vd-large">{LARGE}</span>
          <span className="vd-token vd-raise">Raise my limit</span>
        </div>
        <div className="vd-vault">
          <p className="vd-vault-title">Vault</p>
          <ol className="vd-checks">
            {CHECKS.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ol>
          <span className="vd-bar" />
          <div className="vd-verdicts">
            <p className="vd-verdict-paid">Paid</p>
            <p className="vd-verdict-blocked">Blocked: over {CAP} a payment</p>
            <p className="vd-verdict-rejected">Rejected: only your key can change a rule</p>
          </div>
        </div>
        <div className="vd-track">
          <span className="vd-token vd-small vd-onward">{SMALL}</span>
        </div>
        <div className="vd-node vd-payee">{PAYEE.name}</div>
      </div>
      <figcaption className="vd-caption">
        <p className="small soft">Illustration, with the practice vault&rsquo;s rules. Three requests from the agent:</p>
        <ol>
          <li>
            <span className="vd-key vd-key-paid" aria-hidden="true" />
            {SMALL} to {PAYEE.name} passes all four checks and is paid.
          </li>
          <li>
            <span className="vd-key vd-key-stop" aria-hidden="true" />
            {LARGE} stops at the first check, over the cap of {CAP} a payment. Nothing moves.
          </li>
          <li>
            <span className="vd-key vd-key-stop" aria-hidden="true" />A request to raise its own limit is rejected
            before any check: only your key can change a rule.
          </li>
        </ol>
      </figcaption>
    </figure>
  )
}
