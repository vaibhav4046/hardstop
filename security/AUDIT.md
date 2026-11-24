# Independent adversarial review

On 2026-11-17, after the kernel, vault and tests were written, a second AI
agent was given the source and one instruction: break the claims in the
threat model, and report only what it could back with a concrete sequence.
It worked on a copy, wrote its own proof tests, and mutated the code to see
which changes the test suite would notice.

This file records what it found and what was done about it. It is not a
professional audit and does not replace one.

## Outcome in one paragraph

It found no way to move money outside the caps, replay a payment, or get a
raise to take effect early on any state the vault can reach. It found one
behaviour that contradicted a stated claim, and it showed that the test
suite was weaker than the documentation said: several deliberately broken
versions of the code passed every test. All findings below are fixed, and
each fix has a test that fails without it.

## Findings

| # | Severity | Finding | Fix | Test that now pins it |
|---|---|---|---|---|
| 1 | Medium | **A stranger could write to the vault's log while it was paused.** `decide` checked "paused" before "is this the agent", and the vault only reverts on "not the agent". So during a pause, any address could call `pay` and get a `Blocked` event with fields of its choosing. No money could move. | `decide` now checks the caller first. | `stranger_is_reverted_even_while_paused` (Fe, exact error), `a stranger is reverted even while the vault is paused` (JS EVM), `refusals_come_in_a_fixed_order` |
| 2 | Medium | **The exposure bound was barely tested.** The campaign took the bound once per game, never with a raise waiting and never with money already spent. Three broken versions survived: a bound that ignored a matured raise, a bound that subtracted spending from an old window, and a campaign with the bound check deleted. | The campaign now takes the promise afresh many times per game and counts the states it was taken in. `exposure` and `amend` are part of the `Engine` trait, so broken versions of them can be attacked too. | `the_campaign_presses_on_the_exposure_bound`, `catches_an_exposure_bound_that_is_too_low`, `..._forgets_a_waiting_raise`, `..._counts_stale_spending`, `exposure_uses_a_raise_that_already_took_effect`, `exposure_ignores_spending_from_an_older_window` |
| 3 | Medium/Low | **Ratchet behaviour rested on one golden fingerprint.** "Proposing again restarts the wait" and "a matured raise is the baseline for the next proposal" were only caught by the digest test. `spec_allows` shared helper functions with `decide`, so a raise landing one second early passed the campaign. | Named tests for each behaviour. `spec_allows` now restates the maturity rule and the window arithmetic itself and calls nothing in the kernel. The campaign steers the clock onto the second a raise matures, and has the owner pile a bigger raise on a waiting one. | `proposing_again_restarts_the_wait`, `a_matured_raise_is_the_baseline_for_the_next_proposal`, `catches_a_raise_that_lands_one_second_early`, `catches_a_raise_applied_without_waiting`, `catches_a_raise_that_jumps_the_queue`, `pausing cancels a raise that was waiting` (JS EVM) |
| 4 | Low | **A vacuous test.** `failed_transfer_reverts_the_whole_payment` only checked that something reverted and could not look at the ledger. The claim itself held. | Replaced by a test that catches the revert and reads the ledger. A hostile token that re-enters `pay` three ways is now a permanent test. | `failed_transfer_reverts_and_leaves_the_ledger_untouched`, `a_hostile_token_cannot_reenter_past_the_caps` |
| 5 | Low | **Cooling was skipped at the very end of `u64` time.** `now + cooling` saturated, so a raise proposed within one cooling period of the last representable second matured early. Unreachable on a real chain. | A change scheduled for the last representable second never takes effect. | `a_raise_that_would_mature_past_the_end_of_time_never_does` |
| 6 | Info | **An unstated precondition.** The "whatever the owner signs" promise assumes the queue was built by `amend`. Hand-built rules with a queue tighter than the active policy make `cancel` a loosening. The vault cannot reach that state; the command-line tool can be handed it. | Documented on `exposure`, and pinned as a test of the precondition. | `exposure_owner_promise_needs_a_queue_built_by_amend` |
| 7 | Info | "Exact" was overstated: with the sequence counter used up nothing can be paid, yet the bound is non-zero. `preview` answers for the rules and does not check the vault's balance. The constructor accepted `owner == agent` and a one-second cooling period. | Wording corrected on `exposure` and `preview`. The constructor now rejects `owner == agent` and any cooling period under 60 seconds. | `exposure_is_only_an_upper_bound_once_sequence_numbers_run_out`, `owner_and_agent_must_differ`, `cooling_period_under_a_minute_is_rejected` |

## Second review, 2026-11-19

A fresh AI reviewer was given the code at `b0b62a4` with the same
instruction. It found no way to move money past the policy, replay a
payment, make a loosening land early or lock the owner out. It found these,
now fixed, each with a test that fails without the fix:

| # | Severity | Finding | Fix | Test that now pins it |
|---|---|---|---|---|
| 8 | Medium | **The watcher went quiet about a waiting raise when the vault's events could not be read.** `check()` read the event log before comparing state, so a failing `eth_getLogs` (a public RPC refusing a range with too many logs, which an agent could cause with refused payments) aborted the whole check, and the "looser rules are waiting" alert never came; the same range then failed every time. | Events are read a range at a time; a refused range ends the reading for that check, is retried next time with half the range, and the alerts from the vault's state go out regardless, with one `events_unreadable` alert and one `events_readable` when it recovers. Nothing read is lost. | `a raise is still reported while the vault events cannot be read, and no event is lost` (web/tests/watch.test.ts) |
| 9 | Low | **"Is this a real vault" checked the code, not what it stores.** A hand-made deployment of the same code could hold an owner equal to the agent, or a zero owner, which the constructor refuses. | `connect` refuses a vault whose owner or token is zero, or whose owner is its agent. (Since the 2026-11-23 contracts a zero agent is accepted: there is none while a replacement key waits out its cooling period, `web/src/lib/live/find.ts`.) It still does not check which launcher made the vault. | `vault code with storage no launcher could have written is refused: owner equal to the agent, or zero` |
| 10 | Info | **Two sentences overstated.** "Any later tightening cancels a queued loosening" does not hold for a recipient in its cooling period (only removing it does), and the exposure bound was called "exact" with nothing queued, which item 7 had already retracted. | README and THREAT_MODEL.md corrected. | (wording) |

## Third review, 2026-11-20

Three AI attackers worked at once, each told to break one part and to report
only what it could reproduce with a test that passes only if the attack works:
the Fe contracts, the TypeScript side (MCP server, watcher, wallet path) and
the live site in a browser. None moved money past the vault's limits on the
real code. Each finding below is fixed, and each fix has a test that fails
without it; the attackers' own proofs of concept now fail.

| # | Severity | Finding | Fix | Test that now pins it |
|---|---|---|---|---|
| 11 | Medium | **A payment whose reply was lost could be paid twice.** An MCP client that timed out (and sent a cancel) left `hardstop_pay` running; the agent's ordinary retry got the next request number and paid again. A payment queued behind it was sent too, though its client had given up. One $4 intent became $11 spent. | `hardstop_pay` checks the client's cancel before sending, and holds a payment identical (same recipient and amount) to one paid in the last 10 minutes unless the agent passes `repeat: true`. | `a payment whose reply was lost is not paid twice by an ordinary retry, ...` (web/tests/mcp.test.ts) |
| 12 | Medium | **"4,99" was read as $499.** `parseUsd` deleted every comma, so a European decimal comma paid a hundred times the amount (within the caps), in the MCP tools and in the owner's forms ("12,50" became $1,250.00). | A comma is accepted only as a thousands separator in groups of three; anything else is refused. | `a comma is read only as a thousands separator, never as a decimal point` (web/tests/money.test.ts) |
| 13 | Low/Medium | **A watcher far behind read its whole backlog before alerting.** After a long outage, one check made hundreds of event requests before the "raise waiting" alert; after refused ranges the range never grew back. | At most eight ranges per check, the rest on later checks; the range doubles back to 1,000 blocks after each success. | `a watcher far behind still reports a waiting raise at its first check, ...`, `after the network refuses a few ranges, the range grows back to 1,000 blocks` |
| 14 | Medium (test gap) | **Removing a recipient during its cooling period was never tested.** A kernel that ignored such a removal passed all 92 Fe tests and the 15 contract tests. | New test; the broken kernel now fails it. | `removing_a_recipient_while_it_cools_is_instant` (fe/src/tests.fe) |
| 15 | Low/Medium (test gap) | **A cancel that lands a raise at once was caught only by a fixed digest.** `cancel` was not part of the adversary's `Engine`, and no check compared the policy in force before and after an owner call. | `cancel` is in `Engine`; the campaign now flags any owner call that loosens the policy in force that same second (`LOOSENED_AT_ONCE`); a fifteenth broken kernel, `CancelsLate`, must be caught. 20,000 native games, 800,000 requests: no violation on the real kernel. | `catches_a_cancel_that_lands_a_raise_at_once`, `cancelling_a_raise_in_its_last_second_keeps_the_old_cap` |
| 16 | Low | **The site said "Agent: Active" after the permission had ended**, while every payment was refused as expired. | The rules card says "Permission ended" once the end date has passed. | (screen; checked in the browser suite) |
| 17 | Low | **Recipient names could hide text-direction and invisible characters**, so a receipt could show a name reversed, and two names that look identical ("Café" composed and decomposed) were both accepted. | Such characters are refused; names are compared after Unicode normalisation. Since 20 Nov a name mixing Latin with Cyrillic or Greek letters ("Clоud" with a Cyrillic о) is refused too. A name wholly in another alphabet is accepted: names are labels, and the address is what is paid. | `a recipient name with invisible or text-direction characters is refused`, `a name mixing Latin with Cyrillic or Greek letters is refused`, `names that read the same count as the same name` (web/src/lib/session-names.test.ts) |
| 18 | Low | **A pause dropped a waiting raise without saying so.** | The receipt for a pause, or for any tightening, says when it dropped a looser change that was waiting. | (wording) |

## Fourth review, 2026-11-23

Two AI reviewers worked in parallel on commit `64b5501`, one on the Fe
contracts (`kernel.fe`, `kernel/sealed.fe`, `vault.fe`, `launcher.fe`) and one
on the MCP server (`web/mcp/*`). Each was told to find real bugs and then to
try to refute each of its own findings. Neither found a way to move money
past the vault's limits, skip a cooling period, pay an unapproved address,
lock the owner out, make `exposure` report too little, or leak the agent's
key. This is still an AI review, not a professional audit.

| # | Severity | Finding | What was done |
|---|---|---|---|
| 19 | Info | **THREAT_MODEL.md named the wrong mechanism.** It said the window length and cooling period are immutable fields that no handler lists `mut`. They live inside `Terms`, which owner handlers list `mut`; they stay fixed because only the kernel's `amend` and `cancel` change `Terms`, and both copy the schedule. | Wording corrected. |
| 20 | Info | **The `PolicyProposed` event under-describes a mixed proposal.** A proposal that tightens one field and loosens another applies the tighter fields at once, but the event carries the proposed numbers and a non-zero `effective_at`. Its comment says so, and no money is at risk. | Kept. The app shows `policy()` and `queued()`; the watcher reads the events for history but also compares the vault's state each check, so the tighter fields show there. |
| 21 | Low, by design | **One tricked signature can freeze the agent for a cooling period.** A pause, a zero cap or a past end date applies at once; undoing it waits. `withdraw` still works. | Added to THREAT_MODEL.md as a denial-of-service path. It is the trade-off the ratchet makes. |
| 22 | Info | **The HTTP token can travel in the URL** (`/mcp/<token>`, for clients that cannot send headers), where tunnel and proxy logs keep it. | Accepted and documented: the path form exists for clients that cannot send headers, and the ChatGPT example in `web/mcp/README.md` uses it; clients that can should send `Authorization: Bearer` instead. |
| 23 | Low | **The HTTP token is checked for length only.** A guessable 32-character token passes, and there is no rate limit on refusals. | Accepted: the docs give `openssl rand -hex 32`; only an owner who picks a weak token is exposed. |
| 24 | Low | **An injected agent can put a phishing line in a request to the owner.** | Mostly mitigated already: the reason is one line, stripped of hidden and bidirectional characters, quoted, labelled "not checked by anyone", and followed by the real owner link. |
| 25 | Info | **The RPC is trusted for fees and error text.** `HARDSTOP_RPC` may be plain `http://`, gas is priced from the RPC with no ceiling, and RPC error text reaches the model. | Accepted: the operator chooses the RPC, the gas is test ETH, and the contract still enforces every limit. |

The reviewers also refuted these suspicions: re-proposing, cancelling or
pausing to skip a cooling period; re-approving a recipient to shorten its
wait; `exposure` under-reporting across a queued switch; overflow; re-entering
`pay`; a copied or zeroed `Approval`; re-entering the launcher's vault list;
a launch address taken in advance (the caller is part of the create2 salt);
key leaks through errors, tool output or logs; DNS rebinding on the loopback
server; and demo mode reaching a real network.

The same day, the kernel's laws were run by the compiler over a grid of
policies (`fe/src/kernel/laws.fe`). One law first failed: a payment did not
reduce the worst case by its own amount when the worst case was the largest
number there is, because `exposure` saturates there and means "unbounded".
That is the documented behaviour, not a bug; the law now states it.

## Fifth review, 2026-11-23: the sealed payout and the agent's seat

An AI reviewer attacked the new payment path and key replacement on a copy
of the branch, wrote five probe tests of `Seat` at exact seconds, and ran
the full `fe test` (112 passed). It found no way to pay past the policy,
pay an unapproved recipient, reuse a payout (the compiler refuses it,
16-0002), double-spend by re-entering `pay` from the token (the books are
saved before the send; the existing hostile-token test passes), get an old
key back, or make a waiting key start early. `agent_at` and `waiting` test
the same condition, one negated, so they agree at every second.

| # | Severity | Finding | What was done |
|---|---|---|---|
| 26 | Low | **`setAgent` with the owner's own address does nothing, silently.** An owner who means "take the key back" by naming themselves leaves the leaked key working, and the transaction succeeds. With nothing waiting, its `AgentChanged(0, 0)` event is the same as a real `setAgent(0)`'s, so a log reader could believe the key was revoked. | **Fixed in v3 (2026-11-24).** `Seat::replace` now refuses the owner's own address, and `SetAgent` then reverts with `InvalidPolicy`, so the call fails instead of doing nothing; `open` also refuses a vault whose agent is its owner. Test: `the_owner_cannot_name_itself_the_agent` in `fe/src/vault_tests.fe`. This changed the vault's bytecode, so the v3 launcher (`0x40646dfb8d374037a4011e8ab222c6e13d35d707`) has a new address. Vaults made through the 2026-11-23 launcher keep the old behaviour; there, revoke with the zero address or a new key. |
| 27 | Info | **While no agent is seated, the worst case overstates.** After a replacement, nobody can pay until the new key's time, yet `exposure` still counts the full caps. It never understates. | Documented. |

## What it tried and could not break

- Making `Pay` write the policy: the compiler refuses
  (`error[8-0018] ... immutable`).
- Denied payments moving money or changing the ledger; replay, including
  from inside a re-entrant call.
- Pause with a raise waiting, and with a raise that had matured but not yet
  been folded into the active policy.
- The ratchet and the exposure bound on states the vault can reach:
  re-proposing, mixed proposals, tightening then re-loosening, cancelling
  after maturity, removing and re-adding a recipient, window and expiry
  edges, a clock before the anchor, a zero per-payment cap.
- Making any kernel function panic.

## What it did not test

- ABI decoding with dirty high bits in the arguments.
- Whether the broken versions survive the JS-EVM tests: that was reasoned,
  not run.

## What changed in the numbers (first review, 2026-11-17)

| | Before review | After |
|---|---|---|
| `fe test` (EVM) | 50 | 68 |
| `fe test --backend native` | 30 | 44 |
| Broken kernels the campaign must catch | 8 | 14 |
| Times the exposure promise is taken, per 200 games | 200 | 2,938 (347 with a raise waiting, 565 with money already spent, 100 reached exactly) |
| JS-EVM tests | 13 | 16 |
