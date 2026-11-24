// A hosted alert feed for one vault: https://hardstop-omega.vercel.app/alerts?chain=84532&vault=0x…
// It answers the question an owner must not miss, read fresh from the chain on every request:
// is a rule change that loosens a limit waiting out its cooling period? It also reports a pause and an end date
// that is near or has passed. Any feed reader (or a phone app that follows Atom feeds) polls it,
// so the owner gets an alert without running the watcher. It only reads: no key, no state.

export type FeedInput = {
  vault: string
  network: string
  ownerPage: string
  selfUrl: string
  /** ISO time the chain was read. */
  now: string
  rules: {
    per_payment_usd: string
    per_day_usd: string
    valid_until: string
    paused: boolean
  }
  waiting: {
    per_payment_usd: string
    per_day_usd: string
    valid_until: string
    paused: boolean
    takes_effect_at: string
  } | null
  /** The vault's cooling period in seconds: a waiting change was proposed this long before it takes effect. */
  coolingSecs: number
  /** "per day", "per 1 hour": the vault's spending window in words. */
  per: string
}

type Entry = { id: string; title: string; summary: string; updated: string }

const SOON_MS = 86_400_000

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const money = (usd: string): string => `$${usd}`

/** The ISO time `seconds` before `iso`. */
const before = (iso: string, seconds: number): string => new Date(Date.parse(iso) - seconds * 1000).toISOString()

// Each entry's `updated` is a time the chain fixes (when the change was proposed, when the rules end), not the
// time of the poll, so a reader that compares `updated` does not alert again on every poll.

export function alertEntries(input: FeedInput): Entry[] {
  const { vault, waiting, rules, now, per } = input
  const entries: Entry[] = []
  if (waiting) {
    // The id names the change itself, so a reader alerts once per new change, not on every poll. A change waits
    // only when it loosens at least one limit; the rest of it may be tighter, so it is shown field by field.
    entries.push({
      id: `urn:hardstop:${vault}:waiting:${waiting.takes_effect_at}:${waiting.per_payment_usd}:${waiting.per_day_usd}:${waiting.valid_until}:${waiting.paused}`,
      title: `A rule change is waiting: it takes effect ${waiting.takes_effect_at} unless you cancel it`,
      summary:
        `It loosens at least one limit. Waiting: up to ${money(waiting.per_payment_usd)} per payment and ${money(waiting.per_day_usd)} ${per}, until ${waiting.valid_until}${waiting.paused ? ', paused' : ''}. ` +
        `In force now: ${money(rules.per_payment_usd)} per payment and ${money(rules.per_day_usd)} ${per}. ` +
        `If you did not ask for this, open the owner page with the owner wallet and cancel it before ${waiting.takes_effect_at}.`,
      updated: before(waiting.takes_effect_at, input.coolingSecs),
    })
  }
  if (rules.paused) {
    entries.push({
      id: `urn:hardstop:${vault}:paused:${rules.valid_until}`,
      title: 'The vault is paused: the agent cannot pay',
      summary: 'Every payment is refused until the owner resumes the vault.',
      // When the pause began is not in the vault's state; the start of the day keeps this to one alert a day.
      updated: `${now.slice(0, 10)}T00:00:00.000Z`,
    })
  }
  const left = Date.parse(rules.valid_until) - Date.parse(now)
  if (left <= 0) {
    entries.push({
      id: `urn:hardstop:${vault}:ended:${rules.valid_until}`,
      title: `The rules ended ${rules.valid_until}: the agent cannot pay`,
      summary: 'Every payment is refused until the owner sets a new end date.',
      updated: rules.valid_until,
    })
  } else if (left <= SOON_MS) {
    entries.push({
      id: `urn:hardstop:${vault}:ending:${rules.valid_until}`,
      title: `The rules end ${rules.valid_until}, within a day`,
      summary: 'After that every payment is refused until the owner sets a new end date.',
      updated: before(rules.valid_until, SOON_MS / 1000),
    })
  }
  return entries
}

export function alertFeed(input: FeedInput): string {
  const entries = alertEntries(input)
  const link = escape(input.ownerPage)
  const body = entries
    .map(
      (e) => `  <entry>
    <id>${escape(e.id)}</id>
    <title>${escape(e.title)}</title>
    <updated>${e.updated}</updated>
    <link rel="alternate" href="${link}"/>
    <summary>${escape(e.summary)}</summary>
  </entry>`,
    )
    .join('\n')
  const subtitle = entries.length
    ? `${entries.length} alert${entries.length > 1 ? 's' : ''} for this vault, read from ${input.network} at ${input.now}.`
    : `Nothing needs you: no change is waiting, read from ${input.network} at ${input.now}.`
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:hardstop:${escape(input.vault)}:alerts</id>
  <title>HARDSTOP alerts for vault ${escape(input.vault)}</title>
  <subtitle>${escape(subtitle)}</subtitle>
  <updated>${input.now}</updated>
  <link rel="self" href="${escape(input.selfUrl)}"/>
  <link rel="alternate" href="${link}"/>
  <author><name>HARDSTOP</name></author>
${body}
</feed>
`
}
