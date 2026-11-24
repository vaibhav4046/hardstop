import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alertEntries, alertFeed, type FeedInput } from '../mcp/feed.ts'

const base: FeedInput = {
  vault: '0x76b5cc6fc87102a36fb95ca2f9d8c20c98201acb',
  network: 'Base Sepolia',
  ownerPage: 'https://hardstop-omega.vercel.app/activity?chain=84532&vault=0x76b5cc6fc87102a36fb95ca2f9d8c20c98201acb',
  selfUrl: 'https://hardstop-omega.vercel.app/alerts?chain=84532&vault=0x76b5cc6fc87102a36fb95ca2f9d8c20c98201acb',
  now: '2026-11-24T10:00:00.000Z',
  rules: {
    per_payment_usd: '10',
    per_day_usd: '20',
    valid_until: '2026-12-23T00:00:00.000Z',
    paused: false,
  },
  waiting: null,
  per: 'per day',
  coolingSecs: 86_400,
}

test('a quiet vault gives an empty, valid feed that says nothing needs the owner', () => {
  assert.deepEqual(alertEntries(base), [])
  const xml = alertFeed(base)
  assert.match(xml, /^<\?xml version="1.0"/)
  assert.match(xml, /Nothing needs you/)
  assert.doesNotMatch(xml, /<entry>/)
})

test('a waiting change is one alert, with an id and a time that stay put, so a reader alerts once', () => {
  const waiting = {
    per_payment_usd: '1000',
    per_day_usd: '1000',
    valid_until: '2026-12-23T00:00:00.000Z',
    paused: false,
    takes_effect_at: '2026-11-25T10:00:00.000Z',
  }
  const [entry, ...rest] = alertEntries({ ...base, waiting })
  assert.equal(rest.length, 0)
  assert.match(entry.title, /rule change is waiting.*2026-11-25T10:00:00.000Z/)
  assert.match(entry.summary, /\$1000 per payment/)
  assert.match(entry.summary, /In force now: \$10 per payment and \$20 per day/)
  // Its time is when it was proposed: one cooling period before it takes effect, not the time of the poll.
  assert.equal(entry.updated, '2026-11-24T10:00:00.000Z')
  // Polling again later gives the same id and time: the reader does not alert twice.
  const again = alertEntries({ ...base, waiting, now: '2026-11-24T11:00:00.000Z' })[0]
  assert.equal(again.id, entry.id)
  assert.equal(again.updated, entry.updated)
  // A different change is a new alert.
  assert.notEqual(alertEntries({ ...base, waiting: { ...waiting, per_day_usd: '2000' } })[0].id, entry.id)
})

test('a change that loosens one limit and tightens another is not called looser, and shows a waiting pause', () => {
  const waiting = {
    per_payment_usd: '50',
    per_day_usd: '5',
    valid_until: '2026-12-23T00:00:00.000Z',
    paused: true,
    takes_effect_at: '2026-11-25T10:00:00.000Z',
  }
  const [entry] = alertEntries({ ...base, waiting })
  assert.doesNotMatch(entry.title, /looser/)
  assert.match(entry.summary, /loosens at least one limit/)
  assert.match(entry.summary, /\$50 per payment and \$5 per day, until 2026-12-23T00:00:00.000Z, paused\./)
})

test('a pause, an end date within a day, and an end date passed are each reported', () => {
  assert.match(alertEntries({ ...base, rules: { ...base.rules, paused: true } })[0].title, /paused/)
  assert.match(
    alertEntries({
      ...base,
      rules: { ...base.rules, valid_until: '2026-11-24T20:00:00.000Z' },
    })[0].title,
    /within a day/,
  )
  assert.match(
    alertEntries({
      ...base,
      rules: { ...base.rules, valid_until: '2026-11-24T09:00:00.000Z' },
    })[0].title,
    /ended/,
  )
})

test('text in the feed is escaped', () => {
  const xml = alertFeed({ ...base, ownerPage: 'https://x.test/?a=1&b=<2>' })
  assert.match(xml, /a=1&amp;b=&lt;2&gt;/)
  assert.doesNotMatch(xml, /b=<2>/)
})
