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
| 9 | Low | **"Is this a real vault" checked the code, not what it stores.** A hand-made deployment of the same code could hold an owner equal to the agent, or a zero owner, which the constructor refuses. | `connect` refuses a vault whose owner, agent or token is zero, or whose owner is its agent. It still does not check which launcher made the vault. | `vault code with storage no launcher could have written is refused: owner equal to the agent, or zero` |
| 10 | Info | **Two sentences overstated.** "Any later tightening cancels a queued loosening" does not hold for a recipient in its cooling period (only removing it does), and the exposure bound was called "exact" with nothing queued, which item 7 had already retracted. | README and THREAT_MODEL.md corrected. | (wording) |

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

## What changed in the numbers

| | Before review | After |
|---|---|---|
| `fe test` (EVM) | 50 | 68 |
| `fe test --backend native` | 30 | 44 |
| Broken kernels the campaign must catch | 8 | 14 |
| Times the exposure promise is taken, per 200 games | 200 | 2,938 (347 with a raise waiting, 565 with money already spent, 100 reached exactly) |
| JS-EVM tests | 13 | 16 |
