'use client'

// The worst case over the next three days, drawn from the practice vault's own
// contract: every point on the line is one call to its `exposure` function.
// Nothing here is worked out in the page. Spend, sign a raise or cancel it,
// and the line is asked for again.

import { useEffect, useId, useState, type PointerEvent } from 'react'
import { formatUsd, USD } from '@/lib/money'
import { exampleSetup } from '@/lib/session'
import { useHomeVault } from './home-vault'
import { announcement } from './slip'

const HOURS = 72
const HOUR = 3600n
const RAISED_DAY = 50n * USD
const PAYEE = exampleSetup(0n).recipients[0]

// The drawing, in SVG units.
const WIDTH = 720
const HEIGHT = 320
const LEFT = 88
const RIGHT = 20
const TOP = 36
const BOTTOM = 44
const PLOT_W = WIDTH - LEFT - RIGHT
const PLOT_H = HEIGHT - TOP - BOTTOM

type Curve = {
  /** For each hour from now, the most the agent can take by then, capped at what the vault holds. */
  atMost: bigint[]
  holds: bigint
  coolingHours: number
}

export function ExposureChart() {
  const { view, entries, status, send, restart, exposureAt } = useHomeVault()
  const [curve, setCurve] = useState<Curve | null>(null)
  const [hour, setHour] = useState(12)
  const id = useId().replace(/:/g, '')

  useEffect(() => {
    if (view === null) return
    let isCurrent = true
    const { now, schedule, vaultBalance } = view.state
    const untils = Array.from({ length: HOURS + 1 }, (_, h) => now + BigInt(h) * HOUR)
    void exposureAt(untils).then((answers) => {
      if (!isCurrent || answers === null) return
      setCurve({
        atMost: answers.map((answer) => (answer > vaultBalance ? vaultBalance : answer)),
        holds: vaultBalance,
        coolingHours: Number(schedule.coolingSecs / HOUR),
      })
    })
    return () => {
      isCurrent = false
    }
    // `exposureAt` is a new function on every render of the provider; the vault's state is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  if (view === null || curve === null) {
    if (status === 'failed') {
      return (
        <div className="soft" data-practice-vault role="alert">
          <p>The practice vault could not start in this browser.</p>
          <button type="button" className="btn mt-3" onClick={restart}>
            Try again
          </button>
        </div>
      )
    }
    return (
      <p className="soft" data-practice-vault>
        Asking the practice vault…
      </p>
    )
  }

  const { policy, queued, ledger } = view.state
  const isBusy = status === 'working'
  const top = curve.holds > 0n ? curve.holds : 1n
  const x = (h: number) => LEFT + (h / HOURS) * PLOT_W
  const y = (amount: bigint) => TOP + PLOT_H - (Number(amount) / Number(top)) * PLOT_H
  // A step line: the amount holds until the hour it changes.
  const line = curve.atMost
    .map((amount, h) => (h === 0 ? `M${x(0)},${y(amount)}` : `H${x(h)}V${y(amount)}`))
    .join('')
  const area = `${line}V${y(0n)}H${x(0)}Z`
  const here = curve.atMost[hour]
  const isFixed = hour < curve.coolingHours
  // Each hour where the worst case steps up: a gold dot, with the figure the vault gave.
  const steps = curve.atMost.flatMap((sum, h) => (h > 0 && sum !== curve.atMost[h - 1] ? [h] : []))
  // Dotted guides at a quarter, a half and three quarters of what the vault holds.
  const guides = [1n, 2n, 3n].map((quarter) => (curve.holds * quarter) / 4n)
  // The readout hangs below and right of the marker: step figures sit above their dots, so the two do not
  // meet. Near the right edge it goes left; near the bottom, where there is no room below, it goes above.
  const isTipLeft = x(hour) > WIDTH - 260
  const isTipAbove = y(here) > TOP + PLOT_H - 70
  // Above the marker the readout would cover the figure of a step at the same level: it says the same number, so that figure steps aside.
  const isUnderReadout = (h: number) => isTipAbove && curve.atMost[h] === here && Math.abs(x(h) - x(hour)) < 280
  const latest = entries[0]
  const nameOf = (address: string) => (address === PAYEE.address ? PAYEE.name : 'an address you never approved')

  // Pointing at, or dragging along, the chart moves the look-ahead, as the slider does.
  const follow = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const along = ((event.clientX - box.left) / box.width) * WIDTH
    setHour(Math.round(Math.min(HOURS, Math.max(0, ((along - LEFT) / PLOT_W) * HOURS))))
  }

  return (
    <div className="chart">
      <figure className="chart-figure">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby="chart-title chart-reading"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            follow(event)
          }}
          onPointerMove={(event) => {
            if (event.pointerType === 'mouse' || event.currentTarget.hasPointerCapture(event.pointerId)) follow(event)
          }}
        >
          <title id="chart-title">The most the agent can take, hour by hour, over the next three days</title>
          <defs>
            {/* Gold dots on a 6-unit grid, as the hero door is drawn. */}
            <pattern id={`${id}-dots`} width="6" height="6" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="1.3" fill="#e3b04b" />
            </pattern>
            <pattern id={`${id}-dots-fine`} width="6" height="6" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="0.8" fill="#e3b04b" />
            </pattern>
            {/* The dots fade toward the bottom of the area. */}
            <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.12" />
            </linearGradient>
            <mask id={`${id}-fade-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={WIDTH} height={HEIGHT}>
              <rect x="0" y={TOP} width={WIDTH} height={PLOT_H} fill={`url(#${id}-fade)`} />
            </mask>
            <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Guides at a quarter, a half and three quarters of what the vault holds. */}
          {guides.map((level) => (
            <g key={level.toString()}>
              <line className="chart-guide" x1={LEFT} x2={WIDTH - RIGHT} y1={y(level)} y2={y(level)} />
              <text className="chart-label" x={LEFT - 10} y={y(level) + 4} textAnchor="end">
                {formatUsd(level)}
              </text>
            </g>
          ))}
          {[24, 48].map((h) => (
            <line key={h} className="chart-guide" x1={x(h)} x2={x(h)} y1={TOP} y2={y(0n)} />
          ))}

          {/* What a limit that can be raised at once leaves at risk: everything. */}
          <line className="chart-all" x1={LEFT} x2={WIDTH - RIGHT} y1={y(curve.holds)} y2={y(curve.holds)} />

          <line className="chart-axis" x1={LEFT} x2={WIDTH - RIGHT} y1={y(0n)} y2={y(0n)} />
          {[0, 24, 48, 72].map((h) => (
            <text key={h} className="chart-label" x={x(h)} y={HEIGHT - 16} textAnchor={h === 0 ? 'start' : h === HOURS ? 'end' : 'middle'}>
              {h === 0 ? 'Now' : `${h / 24} day${h === 24 ? '' : 's'}`}
            </text>
          ))}
          <text className="chart-label" x={LEFT - 10} y={y(0n) + 4} textAnchor="end">
            $0
          </text>

          {/* Left of this line nothing signed today can change the answer. */}
          <rect className="chart-fixed" x={LEFT} y={TOP} width={x(curve.coolingHours) - LEFT} height={PLOT_H} />
          <rect
            className="chart-fixed-dots"
            x={LEFT}
            y={TOP}
            width={x(curve.coolingHours) - LEFT}
            height={PLOT_H}
            fill={`url(#${id}-dots-fine)`}
          />
          <line className="chart-wait" x1={x(curve.coolingHours)} x2={x(curve.coolingHours)} y1={TOP} y2={y(0n)} />
          <text className="chart-label chart-label-gold" x={LEFT + 10} y={TOP + 26}>
            Locked in
          </text>

          {/* Keyed on the answers, so a changed line draws itself again. */}
          <g key={curve.atMost.join()}>
            <path className="chart-area" d={area} fill={`url(#${id}-dots)`} mask={`url(#${id}-fade-mask)`} />
            <path className="chart-line" d={line} pathLength={1} filter={`url(#${id}-glow)`} />
            {steps.map((h) => (
              <g key={h} className="chart-step">
                <circle cx={x(h)} cy={y(curve.atMost[h])} r={4} />
                {/* Near the right edge the figure goes on the left of its dot, so it is never cut off. */}
                {!isUnderReadout(h) && (
                  <text
                    className="chart-label chart-label-gold"
                    x={x(h) > WIDTH - 140 ? x(h) - 8 : x(h) + 8}
                    y={y(curve.atMost[h]) - 8}
                    textAnchor={x(h) > WIDTH - 140 ? 'end' : 'start'}
                  >
                    {formatUsd(curve.atMost[h])}
                  </text>
                )}
              </g>
            ))}
          </g>

          <line className="chart-cursor" x1={x(hour)} x2={x(hour)} y1={TOP} y2={y(0n)} />
          <circle className="chart-pulse" cx={x(hour)} cy={y(here)} r={7} />
          <circle className="chart-mark" cx={x(hour)} cy={y(here)} r={5.5} filter={`url(#${id}-glow)`} />
        </svg>
        {/* Set in the page's own type, not the drawing's, so it stays readable when the chart is small. The same words are in the sentence below. */}
        <p
          className="chart-readout"
          aria-hidden="true"
          data-left={isTipLeft || undefined}
          data-above={isTipAbove || undefined}
          style={{ left: `${(x(hour) / WIDTH) * 100}%`, top: `${(y(here) / HEIGHT) * 100}%` }}
        >
          {hour === 0 ? 'Now' : `In ${hour} h`} · {formatUsd(here)}
        </p>
        <figcaption className="chart-legend">
          <span>
            <i className="chart-key" aria-hidden="true" />
            The most the agent can take by then
          </span>
          <span>
            <i className="chart-key chart-key-stop" aria-hidden="true" />
            Everything in the vault, {formatUsd(curve.holds)}
          </span>
        </figcaption>
      </figure>

      <div className="chart-read">
        <label htmlFor="chart-hour">Look ahead</label>
        <input
          id="chart-hour"
          type="range"
          min={0}
          max={HOURS}
          value={hour}
          onChange={(event) => setHour(Number(event.target.value))}
          aria-valuetext={`${hour} hours from now`}
        />
        <p id="chart-reading" className="chart-reading" aria-live="polite">
          Within <strong>{hour} hours</strong> the agent can take at most{' '}
          <strong className="text-gold">{formatUsd(here)}</strong>.{' '}
          {isFixed
            ? 'Nothing anyone signs from now on can raise that.'
            : 'This far ahead it holds only if the rules are not loosened in the meantime.'}
        </p>
      </div>

      <div className="chart-actions">
        <button
          type="button"
          className="btn"
          disabled={isBusy}
          onClick={() =>
            send(() => ({ type: 'pay', to: PAYEE.address, amount: (4n * USD).toString(), nonce: ledger.nextNonce.toString() }))
          }
        >
          Spend $4.00
        </button>
        {queued === null ? (
          <button
            type="button"
            className="btn"
            disabled={isBusy}
            onClick={() =>
              send(() => ({
                type: 'propose',
                perPayment: policy.perPayment.toString(),
                perDay: RAISED_DAY.toString(),
                validUntil: policy.validUntil.toString(),
                paused: policy.paused,
              }))
            }
          >
            Sign a raise to {formatUsd(RAISED_DAY)} a day
          </button>
        ) : (
          <button type="button" className="btn" disabled={isBusy} onClick={() => send(() => ({ type: 'cancel' }))}>
            Cancel the raise
          </button>
        )}
        <button type="button" className="btn btn-quiet" disabled={isBusy} onClick={restart}>
          Start the chart again
        </button>
      </div>
      {latest && <p className="small chart-answer">The practice vault answered: {announcement(latest, nameOf)}</p>}
      <p className="small soft">
        Each point is the practice vault&rsquo;s own answer to &ldquo;how much, by then?&rdquo;, never more than the
        vault holds. The shaded part is the waiting period: sign a raise and watch that part stay where it is.
      </p>
    </div>
  )
}
