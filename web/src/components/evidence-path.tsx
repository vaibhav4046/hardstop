'use client'

// Two ways the same moment can go: the agent wants more than its limit.
// On the left, what happened in the test. On the right, what a HARDSTOP vault
// does. The steps arrive one at a time when the section is scrolled to, and
// can be stepped through by hand. With reduced motion they are all there.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const TESTED = [
  'The agent wants to pay more than its limit allows.',
  'It asks the wallet app to raise the limit.',
  'The app emails a one-time code to the owner, to prove a person agreed.',
  'The agent can read that inbox. It reads the code and types it in.',
  'The limit is raised. No person was asked.',
]

const VAULT = [
  'The agent wants to pay more than its limit allows.',
  'It asks the vault to raise the limit. Rejected: only your key can change a rule.',
  'Suppose it talks you round, and you sign the raise yourself.',
  'The raise does not apply. It waits out the cooling period, where you can see it.',
  'You think again and cancel it. The limit never moved.',
]

const LAST = TESTED.length - 1
const STEP_MS = 1500

export function EvidencePath() {
  const [step, setStep] = useState(LAST)
  const [isPlaying, setPlaying] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Plays once, the first time the comparison is on screen.
  useEffect(() => {
    const node = ref.current
    if (!node || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        seen.disconnect()
        setStep(0)
        setPlaying(true)
      },
      { threshold: 0.35 },
    )
    seen.observe(node)
    return () => seen.disconnect()
  }, [])

  useEffect(() => {
    if (!isPlaying) return
    const timer = setTimeout(() => {
      setStep((current) => Math.min(LAST, current + 1))
      if (step + 1 >= LAST) setPlaying(false)
    }, STEP_MS)
    return () => clearTimeout(timer)
  }, [isPlaying, step])

  const go = (to: number) => {
    setPlaying(false)
    setStep(Math.max(0, Math.min(LAST, to)))
  }

  // `aria-disabled`, not `disabled`: the steps also move by themselves, and a
  // button that became `disabled` while it had keyboard focus would drop that
  // focus on the floor. `go` already keeps the step in range.
  return (
    <div ref={ref} className="paths">
      <div className="paths-lanes">
        <Lane title="In the test: a wallet app with a one-time code" steps={TESTED} step={step} ending="bad" />
        <Lane title="With a HARDSTOP vault" steps={VAULT} step={step} ending="good" />
      </div>
      <div className="paths-controls">
        <button type="button" className="btn" onClick={() => go(step - 1)} aria-disabled={step === 0}>
          Back
        </button>
        <p aria-live="polite">
          Step {step + 1} of {TESTED.length}
        </p>
        <button type="button" className="btn" onClick={() => go(step + 1)} aria-disabled={step === LAST}>
          Next
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            setStep(0)
            setPlaying(true)
          }}
        >
          Play from the start
        </button>
      </div>
      <p className="small soft">
        The left side is how the limit was raised in the test described above. The right side is what the vault&rsquo;s
        contract does; you can try each step on the <Link href="/#live-example">practice vault</Link>. This site sends no alerts itself; the optional
        watcher you run yourself (web/mcp/watch.ts) reports a waiting raise around the clock.
      </p>
    </div>
  )
}

function Lane({ title, steps, step, ending }: { title: string; steps: string[]; step: number; ending: 'bad' | 'good' }) {
  return (
    <section className={`lane lane-${ending}`}>
      <h3 className="lane-title">{title}</h3>
      <ol>
        {steps.map((text, index) => (
          <li
            key={text}
            className={index === step ? 'is-now' : index < step ? 'is-done' : 'is-ahead'}
            aria-current={index === step ? 'step' : undefined}
          >
            <span className="lane-number" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
