# The hosted alert feed on a real raise (Base Sepolia, 2026-11-24)

`/alerts?chain=84532&vault=0x…` is an Atom feed the site serves for any
HARDSTOP vault (`web/src/app/alerts/route.ts`, `web/mcp/feed.ts`). It reads
the vault fresh from the chain on each request, needs no key and stores
nothing. A feed reader that follows it alerts the owner when a rule change
that loosens a limit is waiting, with the time it takes effect: the moment
to cancel it.

Checked against the v3 use-case vault
`0x76b5cc6fc87102a36fb95ca2f9d8c20c98201acb`, by a script that called the
route's own `GET` handler, with the owner's throwaway test key
(`0x296067b49f888de31c0e654871cbc2256a261870`) proposing and cancelling:

| Step | Transaction | Gas | Feed |
|---|---|---|---|
| Before | none | | "Nothing needs you: no change is waiting", no entries |
| Owner proposes $40 a day (from $20) | [`0xbb1d8676…`](https://sepolia.basescan.org/tx/0xbb1d867670b4faecfaa4567eef7911ef96c12db7bc6381a39d9553f1eb3ad1d3) | 106,795 | one entry, `updated` 2026-11-24T10:43:24Z (the proposal's block time): "A rule change is waiting: it takes effect 2026-11-25T10:43:24.000Z unless you cancel it", and "It loosens at least one limit. Waiting: up to $10.00 per payment and $40.00 per day, until 2026-12-24T01:16:28.000Z. In force now: $10.00 per payment and $20.00 per day. If you did not ask for this, open the owner page with the owner wallet and cancel it before 2026-11-25T10:43:24.000Z.", linking to the owner page |
| Owner cancels | [`0xf0b7e4dc…`](https://sepolia.basescan.org/tx/0xf0b7e4dca9d845b8d257139633564d4c00cb971d752026afd9acf8342b257fa2) | 41,489 | "Nothing needs you" again |

An earlier run the same morning, before a review changed the wording, did
the same: proposed ([`0x617e5c0f…`](https://sepolia.basescan.org/tx/0x617e5c0fa797168bca005f8b9603c0f667aa14cbd2926e89d05fdc050cf11e0c)),
the feed showed "A looser rule is waiting: it takes effect
2026-11-25T10:31:44.000Z unless you cancel it", cancelled
([`0x1de2c113…`](https://sepolia.basescan.org/tx/0x1de2c1136a003dfd9773b193c992dca1f71daf28ad2c24c441069529a5428e1f)),
and the feed was empty again. The review pointed out that a change can
loosen one limit and tighten another, so "looser rule" could mislead; the
entry now says which limits change, field by field.

The entry's id names the change (its effective time, limits, end date and
pause), and its `updated` time is when the change was proposed, not when the
feed was read. So a reader alerts once for a change, not on every poll, and
again for a different one. Bad input is refused in plain words:
`vault=0x1234` and `chain=1` (a network with real money) give 400, an
address with no vault 502.

What the feed does not do, and the self-hosted watcher (`web/mcp/watch.ts`)
does: it is read when the reader polls, so it is only as quick as the
reader; it shows a change only while it waits, so one proposed and withdrawn
between two polls is not seen (the watcher reads the vault's events); and it
does not report payments, refusals, recipients added or a new agent key
waiting. Unit tests: `web/tests/feed.test.ts`.
