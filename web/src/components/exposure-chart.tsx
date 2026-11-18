'use client'

// The worst case over the next three days, drawn from the practice vault's own
// contract: every point on the line is one call to its `exposure` function.
// Nothing here is worked out in the page. Spend, sign a raise or cancel it,
// and the line is asked for again.

import { useEffect, useState } from 'react'
import { formatUsd, USD } from '@/lib/money'
import { exampleSetup } from '@/lib/session'
import { useHomeVault } from './home-vault'

const HOURS = 72
const HOUR = 3600n
const RAISED_DAY = 50n * USD
const PAYEE = exampleSetup(0n).recipients[0]

// The drawing, in SVG units.
const WIDTH = 720
const HEIGHT = 320
const LEFT = 64
const RIGHT = 20
const TOP = 20
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
  const { view, status, send, restart, exposureAt } = useHomeVault()
  const [curve, setCurve] = useState<Curve | null>(null)
  const [hour, setHour] = useState(12)

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
    return (
      <p className="soft" role={status === 'failed' ? 'alert' : undefined}>
        {status === 'failed' ? 'The practice vault could not start in this browser.' : 'Asking the practice vault…'}
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

  return (
    <div className="chart">
      <figure>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="chart-title chart-reading">
          <title id="chart-title">The most the agent can take, hour by hour, over the next three days</title>

          {/* What a limit that can be raised at once leaves at risk: everything. */}
          <line className="chart-all" x1={LEFT} x2={WIDTH - RIGHT} y1={y(curve.holds)} y2={y(curve.holds)} />
          <text className="chart-label chart-label-stop" x={WIDTH - RIGHT} y={y(curve.holds) + 16} textAnchor="end">
            Everything in the vault, {formatUsd(curve.holds)}
          </text>

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
          <line className="chart-wait" x1={x(curve.coolingHours)} x2={x(curve.coolingHours)} y1={TOP} y2={y(0n)} />

          {/* Keyed on the answers, so a changed line draws itself again. */}
          <g key={curve.atMost.join()}>
            <path className="chart-area" d={area} />
            <path className="chart-line" d={line} pathLength={1} />
          </g>

          <line className="chart-cursor" x1={x(hour)} x2={x(hour)} y1={TOP} y2={y(0n)} />
          <rect className="chart-mark" x={x(hour) - 5} y={y(here) - 5} width={10} height={10} />
        </svg>
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
      <p className="small soft">
        Each point is the practice vault&rsquo;s own answer to &ldquo;how much, by then?&rdquo;, never more than the
        vault holds. The shaded part is the waiting period: sign a raise and watch that part stay where it is.
      </p>
    </div>
  )
}
