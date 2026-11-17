// Turning the contract's numbers into text and the visitor's text into
// numbers. Nothing here decides anything.

import type { Formatters } from './hardstop/reasons.ts'

/** Test dollars have six decimals: 1_000_000 units are $1.00. */
export const USD = 1_000_000n
/** Largest amount any form accepts. */
export const MAX_INPUT = 1_000_000n * USD

/** Base units to "$4.00". Shows more than two decimals only when they are not zero. */
export function formatUsd(units: bigint): string {
  const whole = units / USD
  const fraction = units % USD
  const digits =
    fraction % 10_000n === 0n
      ? (fraction / 10_000n).toString().padStart(2, '0')
      : fraction.toString().padStart(6, '0').replace(/0+$/, '')
  return `$${whole.toLocaleString('en-US')}.${digits}`
}

/** "4", "4.5", "$1,000.00" to base units. Null when the text is not a dollar amount. */
export function parseUsd(text: string): bigint | null {
  const match = /^\$?(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ''))
  if (!match) return null
  return BigInt(match[1]) * USD + BigInt((match[2] ?? '').padEnd(6, '0'))
}

/** Base units as text for a form field: "10.00". */
export const inputValue = (units: bigint): string => formatUsd(units).slice(1).replace(/,/g, '')

/** Why `text` cannot be used as an amount, or undefined when it can. `what` reads like "the most per day". */
export function amountError(text: string, what: string): string | undefined {
  const value = parseUsd(text)
  if (value === null) return `Enter ${what} as a number of dollars, for example 10 or 12.50.`
  if (value === 0n) return `${what[0].toUpperCase()}${what.slice(1)} must be more than $0.`
  if (value > MAX_INPUT) return `Enter ${formatUsd(MAX_INPUT)} or less.`
}

/** Unix seconds to "17 Nov 2026, 14:05". Uses the reader's time zone unless one is given. */
export function formatTime(seconds: bigint, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(Number(seconds) * 1000))
}

/** 86400 to "24 hours", 60 to "1 minute", 604800 to "7 days". */
export function formatDuration(seconds: bigint): string {
  const say = (count: bigint, unit: string) => `${count} ${unit}${count === 1n ? '' : 's'}`
  if (seconds > 86_400n && seconds % 86_400n === 0n) return say(seconds / 86_400n, 'day')
  if (seconds % 3_600n === 0n) return say(seconds / 3_600n, 'hour')
  if (seconds % 60n === 0n) return say(seconds / 60n, 'minute')
  return say(seconds, 'second')
}

/** What `explain` needs to write its sentences. Every window in this app is one day. */
export const FORMAT: Formatters = {
  money: formatUsd,
  time: (seconds) => formatTime(seconds),
  window: 'today',
}
