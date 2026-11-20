'use client'

// A sum of money that counts to its new value instead of jumping to it, so
// the eye can see which number a payment changed. The value React renders is
// always the true one; only the text on screen is run through the count, and
// it ends on the true value. With reduced motion it simply changes.

import { useLayoutEffect, useRef } from 'react'
import { formatUsd, USD } from '@/lib/money'

const COUNT_MS = 450
const STEPS = 1000n
const CENT = USD / 100n // the count passes through whole cents only

export function Amount({ value }: { value: bigint }) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(value)

  useLayoutEffect(() => {
    // React's own text node: writing to it, rather than replacing it, keeps React's later updates landing on screen.
    const text = ref.current?.firstChild
    const from = shown.current
    shown.current = value
    if (!text || from === value || matchMedia('(prefers-reduced-motion: reduce)').matches) return

    text.nodeValue = formatUsd(from)
    const began = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - began) / COUNT_MS)
      const isCounting = progress !== 1
      const eased = BigInt(Math.round((1 - (1 - progress) ** 3) * Number(STEPS)))
      const between = from + ((value - from) * eased) / STEPS
      text.nodeValue = formatUsd(isCounting ? (between / CENT) * CENT : value)
      if (isCounting) frame = requestAnimationFrame(step)
    })
    // Frames do not run in a hidden tab or pane: the true value lands anyway, just after the count would have ended.
    const settle = window.setTimeout(() => {
      cancelAnimationFrame(frame)
      text.nodeValue = formatUsd(value)
    }, COUNT_MS + 100)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(settle)
      text.nodeValue = formatUsd(value)
    }
  }, [value])

  return <span ref={ref}>{formatUsd(value)}</span>
}
