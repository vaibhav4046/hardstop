# Usability observations

**No human participants were tested.** Everything below was noticed while
writing and running seven scripted personas in headless Chromium, and while
reading the screens and screenshots the scripts produced. A script does not
get confused, lose patience or misread a sentence, so these are places where
a person *might* have trouble. None of them is a measured human result, and
none should be quoted as user research.

Date: 2026-11-17. Build: production (`next build`, `next start -p 3220`).
Where an observation rests on a measurement, the file under `qa/metrics/` is
named.

## Things the scripts had to work around

These are the strongest signals, because the script could not do the obvious
thing.

1. **A removed recipient cannot be tried.** After "Remove", the recipient is
   gone from the agent's "Pay to" list, so there is no button that shows a
   payment to it being refused. The script had to edit the saved session and
   reload to see the refusal. (ISSUES I-07.)
2. **Getting past a pause takes the practice clock.** Persona B paused, then
   had to press "Resume the agent" and "Skip ahead 1 day" before any later
   step could be paid. The hint under the button says resuming waits 24
   hours, but a first-time visitor who pauses to see what happens then has an
   agent that refuses everything until they find the practice clock and
   skip a day.
3. **Reaching the end date takes 30 presses.** The clock skips one hour or
   one day. The default permission lasts 30 days, so persona E pressed "Skip
   ahead 1 day" 31 times to see "Blocked: expired", and each press adds a
   line to the receipts. There is no larger skip.
4. **Seeing a raise get scheduled takes four clicks and typing.** From `/`:
   Activity, "Start with an example vault", open "Change limits", type two
   amounts, "Save limits". The home example shows a blocked payment in one
   click but nothing about the waiting period, which is the part of the
   project that is new. (`qa/metrics/persona-f-clicks.json`, ISSUES I-08.)
5. **Zero and oversized amounts never reach the vault.** The amount field
   refuses them first, so the contract's own sentence for a zero payment
   ("The agent asked to pay an amount of zero.") can only be seen by
   replaying a saved session.

## Wording

6. **One sentence covers two different refusals.** "This recipient is not on
   your approved list, or was added so recently that its waiting period has
   not ended." is shown both for a stranger and for a recipient the owner
   added an hour ago. In the second case the visitor has to work out which
   half applies; the time it becomes payable is shown only in the Recipients
   panel, not on the receipt.
7. **The amount error does not say what was wrong.** "-5", "abc", "1e30",
   "4.999" and an empty field all get "Enter the amount as a number of
   dollars, for example 10 or 12.50." Someone who typed 4.999 is not told
   that the limit is two decimal places.
8. **"Send the last paid request again" is disabled with no reason given**
   until something has been paid. The label also assumes the visitor knows
   why an agent would resend a request.
9. **"Left today" on a blocked receipt.** A refused $80.00 payment still
   prints "Left today $20.00". It is correct, but next to a BLOCKED stamp it
   can read as if something were deducted.
10. **Two "worst case" phrasings.** The review says "Worst case in the next
    24 hours"; the vault page says "Worst case if your agent goes rogue".
    Same number, different names.
11. **Terms inside "Technical details" are untranslated**: "Request number
    (nonce)", "Gas used", "Contract reverted with NotOwner". That is where
    the brief allows them, and the primary copy on `/`, `/protect` and
    `/activity` contains none of EVM, ABI, gas, nonce, hash, smart contract,
    bytecode or private key (asserted in persona A).

## Layout on a phone (360 px and 375 px wide)

12. **The example is more than two screens down.** At 360 px with 125% text
    the "Agent pays $4" button starts about 1,670 px from the top of a
    740 px screen, after the headline, two paragraphs and both hero buttons
    (`qa/screenshots/C-01-home-360-large-text.png`). The page's first
    interactive proof is below the fold.
13. **Feedback for owner actions prints far from the control.** On a phone the
    order is: balance, the agent's buttons, receipts, then worst case, rules,
    clock and the owner's controls. Pressing "Pause the agent now", "Save
    limits" or "Skip ahead 1 day" prints its line in Receipts, above the
    control and usually off screen. The control's own state does change in
    place (the button becomes "Paused", the clock time changes), and the
    result is announced to screen readers, but a sighted visitor does not see
    the printed line without scrolling up. On a wide screen the receipts are
    in the column beside the controls.
14. **Tables and code scroll sideways inside their box.** On `/how-it-works`
    the "Who can do what" table is 544 px wide in a 326 px box (680 px in
    320 px at 125% text); on `/developers` the reason-code table is 576 px
    and the three code blocks 605 to 878 px (up to 1,098 px at 125%). The
    page itself never scrolls sideways (asserted), but the third column of
    each table starts off screen and nothing indicates there is more to the
    right. (`qa/metrics/persona-c-targets-*.json`.)
15. **Links inside sentences are small targets.** 13 links, 18 to 20 px tall
    at default text. The five source-file links on `/how-it-works` are
    stacked one under another. (ISSUES I-06.)

## Waiting

16. **On a slow connection the home example is the slowest thing on the
    page.** At 400 kbps with a 4x slower CPU the headline is painted at about
    2.1 s and the example is ready at about 10.9 s. In between, the line
    under the buttons reads "Starting the practice vault…" and the buttons
    can be pressed; a press is held until the vault is ready. Nothing hangs,
    but the wait is not explained beyond that one line.
    (`qa/metrics/perf-throttled-home-load.json`.)
17. **"Checking the rules…" and "Creating the vault…"** replace the button
    text and disable the button while the contract code loads. Persona G saw
    both and neither stayed. Before the fix for I-01, "Creating the vault…"
    stayed for ever if the visitor came back to the page.

## Things that read well to a script

Recorded so that the list is not only complaints. These are assertions that
passed, not opinions.

- Every refusal's sentence names the limit or the reason: "One payment may be
  at most $10.00.", "Only $0.00 is left today.", "You paused this agent…",
  "The agent's permission ended on <date>.", "Rejected. Only you can change
  the rules."
- The practice-mode notice is on every page, above the header.
- Shortest path from landing to a verdict on the visitor's own vault: four
  clicks and no typing (primary button, "Review the rules", "Create vault",
  "Pay $4.00 to Cloud hosting").
- No page asks for a wallet, an address, a key or an account, and no request
  left `localhost:3220` during persona C's walkthrough.
- Corrupt or hand-edited saved data produces either an error with "Try again"
  and "Discard the saved vault", or the contract's real answers; it never
  produced a verdict the contract did not give.
