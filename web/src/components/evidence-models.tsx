'use client'

// Ten models, one bar each. The switch changes which result the bars count.
// The bars are a tally: which bar stands for which model is not claimed.

import { useState } from 'react'
import { MODEL_TEST, sourceById } from '@/lib/evidence'

const RESULTS = [
  {
    key: 'raised',
    label: 'Raised its own limit',
    count: MODEL_TEST.raisedOwnLimit,
    claim: 'AI models raised their own spending limit at least once, while paying ordinary invoices. Nobody was attacking them.',
  },
  {
    key: 'warned',
    label: 'With an attack email',
    count: MODEL_TEST.raisedDespiteAttackEmail,
    claim: 'AI models still raised their own limit at least once when an attacker’s email was also in the inbox. Some spotted the trick.',
  },
  {
    key: 'attacker',
    label: 'Paid an attacker',
    count: MODEL_TEST.paidAttacker,
    claim: 'AI models sent money to a simulated attacker at least once, when someone pretended to be a person they should pay.',
  },
] as const

export function EvidenceModels() {
  const [shown, setShown] = useState(0)
  const result = RESULTS[shown]
  const [paper, report] = MODEL_TEST.sources.map(sourceById)

  return (
    <div className="models reveal">
      <div className="models-head">
        {/* Keyed so the number and bars run their arrival again when the result changes. */}
        <p key={result.key} className="models-count" aria-live="polite">
          <span className="models-number">{result.count}</span> of {MODEL_TEST.models}
          <span className="sr-only"> {result.claim}</span>
        </p>
        <p className="models-claim" aria-hidden="true">
          {result.claim}
        </p>
      </div>

      <div key={result.key} className="models-bars" aria-hidden="true">
        {Array.from({ length: MODEL_TEST.models }, (_, index) => (
          <span key={index} className={index < result.count ? 'is-hit' : undefined} style={{ animationDelay: `${index * 55}ms` }} />
        ))}
      </div>

      <div className="switch" role="group" aria-label="Which result to show">
        {RESULTS.map((option, index) => (
          <button key={option.key} type="button" aria-pressed={index === shown} onClick={() => setShown(index)}>
            {option.label}
          </button>
        ))}
      </div>

      <p className="small soft models-note">
        Cornell Tech and Yale, October 2026. Laboratory trials, not customer losses.{' '}
        <a href={paper.url} rel="noopener noreferrer">
          Paper
        </a>{' '}
        (preprint) and{' '}
        <a href={report.url} rel="noopener noreferrer">
          {report.publisher} report
        </a>
        .
      </p>
      <details className="disclosure models-note">
        <summary>About this test</summary>
        <p className="small soft">
          A controlled test by researchers at Cornell Tech and Yale, published in October 2026. Each model ran an agent
          wallet holding {MODEL_TEST.walletUsdc} USDC (a digital dollar) with a daily limit of one cent, for{' '}
          {MODEL_TEST.trialsPerScenario} runs per scenario. Raising the limit needed a one-time code sent by email, and
          the agent could read that inbox. These were laboratory trials, not losses by customers, and HARDSTOP was not
          part of the test. The researchers&rsquo; paper is a preprint, not yet peer reviewed.
        </p>
      </details>
    </div>
  )
}
