# Persona matrix

Seven **scripted** personas. Each is a Playwright script with a name attached
so that the journey has a point of view; none is a person, and a pass here is
not human validation of anything. Results are from the final full run on
2026-11-17 (see `TEST_RESULTS.md`): headless Chromium against the production
build on `http://localhost:3220`.

Every browser test starts in a fresh browser context and fails on any
`console.error`, uncaught page error, HTTP status of 400 or above, or failed
request (a GET the browser itself cancelled on navigation is fetched again
and must return 200). Waits are on visible state only; there is no
`waitForTimeout` anywhere in `web/e2e/`.

Spec files are in `web/e2e/`. Screenshots are in `qa/screenshots/`.

---

## A. Maya, 22, non-technical creator

| | |
|---|---|
| **Goal** | Find out what this is and try it, with no instructions. |
| **Starting state** | `/`, nothing saved. Desktop viewport 1280 x 720. |
| **Constraints** | Knows no crypto terms. Follows the most prominent button. Changes no defaults. |
| **Scripted steps** | 1. Open `/`; the practice-mode notice is visible. 2. "Agent pays $4" then "Agent tries $80" on the home example. 3. Follow the primary button "Protect my AI". 4. "Review the rules" with the defaults ($10.00 per payment, $20.00 per day). 5. "Create vault". 6. "Pay $4.00 to Cloud hosting". 7. "Pay $80.00 to Cloud hosting". |
| **Expected failure points** | Jargon in the main copy; a block with no reason; losing the thread between `/` and `/protect`. |
| **Success criteria** | Journey completes. The block reason is visible and names the limit ("One payment may be at most $10.00."). The practice-mode notice is visible on `/`, `/protect` and `/activity`. Outside `<details>`, the copy of `/`, `/protect` (form and review) and `/activity` (empty and with receipts) contains none of: EVM, ABI, gas, nonce, hash, smart contract, bytecode, private key. |
| **Also measured** | Clicks and wall time from landing to the first verdict on her own vault: see `TEST_RESULTS.md`. |
| **Spec** | `persona-a-maya.spec.ts` (3 tests) |
| **Result** | **Pass** (3 of 3) |
| **Evidence** | `A-01-home-example.png`, `A-02-review.png`, `A-03-own-vault-paid-and-blocked.png` |

## B. Arjun, 37, SaaS founder

| | |
|---|---|
| **Goal** | Set his own limits and check that every control does what it says. |
| **Starting state** | `/protect`, nothing saved. |
| **Constraints** | Specific numbers: $25 per payment, $60 per day, recipients "Render hosting" and "Design contractor", $100 in the vault, 24-hour cooling. |
| **Scripted steps and what must be on screen** | 1. Review shows $25.00, $60.00 and both names; create. 2. $20 to Render hosting: Paid, "$40.00 left today", balance $80.00. 3. $30: Blocked, "at most $25.00", balance unchanged. 4. Pause: "In force at once"; next payment "Blocked: paused". 5. Resume: Scheduled, still paused; skip 1 day: Active, panel gone. 6. Lower to $15: "in force at once", rule shows $15.00, no Scheduled panel; $20 blocked "at most $15.00". 7. Raise to $40: Scheduled with a time, panel shows $40.00, rule still $15.00, $30 blocked "at most $15.00". 8. Cancel: panel gone, rule still $15.00. 9. Raise again, skip 1 day: rule $40.00, panel gone, $30 Paid, balance $50.00. 10. Add "Stock photos": "can be paid from <time>" on the line and in the list; $5 to it blocked "unknown recipient"; skip 1 day; $5 Paid, balance $45.00. 11. Remove "Design contractor": "In force at once"; gone from the agent's "Pay to" list. 12. Withdraw $30: "You withdrew $30.00 back to yourself", balance $15.00. 13. A $5 request to the removed recipient, added to the saved session and replayed: "Blocked: unknown recipient", balance $15.00. |
| **Expected failure points** | A raise applying early; a cancelled raise lingering; a new recipient payable at once; a scheduled panel that outlives its change. |
| **Success criteria** | Every on-screen result above matches. |
| **Spec** | `persona-b-arjun.spec.ts` (1 test) |
| **Result** | **Pass** |
| **Limits of this check** | Step 13 could not be done by clicking (ISSUES I-07). "Goes to owner" in step 12 is checked by the wording on screen and the balance; the screens show no owner balance. The existing contract test `withdraw sends money to the owner and nowhere else` in `web/tests/vault.test.ts` covers the destination and passes. |
| **Evidence** | `B-01-review.png` to `B-06-removed-recipient-blocked.png` |

## C. Barbara, 64, on a phone with larger text

| | |
|---|---|
| **Goal** | Try the example and read what is and is not protected, without connecting anything. |
| **Starting state** | `/`, nothing saved. |
| **Constraints** | Viewport 360 x 740, touch. Root font size 125% (set on `<html>`; not zoom). The size checks are repeated at 100%. |
| **Scripted steps** | 1. Tap "Agent pays $4" and "Agent tries $80"; read both receipts. 2. Scroll to "What this protects, and what it does not"; all nine list items are inside the viewport's width and no text in the section is under 16 px. 3. Visit all five routes, plus `/protect` with errors, the `/protect` review, and `/activity` with a vault, receipts, a scheduled change and every disclosure open. |
| **Expected failure points** | Sideways scrolling; small buttons and links; a wallet prompt; low contrast. |
| **Success criteria** | No horizontal overflow at 360 px on any route or state (page scroll width ≤ viewport, and no element outside a scroll box past the right edge). Every interactive target ≥ 44 x 44 CSS px, **except links inside sentences** (ISSUES I-06). No button or link named connect / wallet / sign in; no field labelled address, wallet, key, seed or password; no request to any host but `localhost:3220`; `window.ethereum` absent. axe `color-contrast` reports no violation on any of the five routes. |
| **Spec** | `persona-c-barbara.spec.ts` (5 tests) |
| **Result** | **Pass** (5 of 5), after fix I-05. Smallest non-inline target: 44 px at 100% text, 55 px at 125%. |
| **Evidence** | `C-01-home-360-large-text.png`, `C-02-activity-360-large-text.png`; `qa/metrics/persona-c-targets-*.json` |

## D. Lena, 29, security engineer

| | |
|---|---|
| **Goal** | Check that what the developer pages claim is true of the repository, and that the web app decides nothing. |
| **Starting state** | `/developers`, `/how-it-works`, and the repository on disk. |
| **Constraints** | Trusts files, not prose. |
| **Scripted steps** | 1. The five commands shown on `/developers` (`fe test`, `fe test --backend native`, `fe build --backend native`, `./out/hardstop decide`, `npm test`) each appear in `README.md` or `.github/workflows/ci.yml`. 2. The reason-code table has 12 rows; code and name of each row equal `REASON_NAMES` in `web/src/lib/hardstop/reasons.ts`. 3. Every GitHub link on `/developers`, `/how-it-works` and `/` is `https://github.com/vaibhav4046/hardstop` or a `/blob/main/<path>` under it, and each `<path>` exists on disk (6 paths). 4. The kernel excerpt on `/developers` is found in `fe/src/kernel.fe`; the field names in the usage text are found in `fe/src/cli.fe`. 5. On a vault, six verdicts: the receipt's sentence, its heading, and "Reason code N (Name)" under Technical details agree (codes 0, 10, 9, 6, 11, 2); the agent's own raise shows "Contract reverted with NotOwner". 6. Node-side: scan `web/src` outside `lib/hardstop/` for comparisons involving amounts, limits, balances and times. |
| **Expected failure points** | A command that exists nowhere; a renamed reason; a dead source path; TypeScript that re-implements a limit. |
| **Success criteria** | All of the above. For step 6: every comparison found has a written judgement, and none produces a verdict. |
| **Spec** | `persona-d-lena.spec.ts` (6 tests) |
| **Result** | **Pass** (6 of 6). Step 6 found 18 comparisons: display logic, form validation of the owner's own input, and reading the contract's answer. The list with a judgement on each is `qa/metrics/persona-d-comparisons.json`; two of them are discussed in ISSUES I-09. |
| **Limits of this check** | The scan is a pattern over source lines, not a proof. It does not match `===` between two names; the one such comparison that matters (`today()` in `session.ts`) was read by hand and is display only. Whether the GitHub URLs resolve online was not checked. |
| **Evidence** | `D-01-developers.png`, `D-02-technical-details.png` |

## E. Adversarial agent

| | |
|---|---|
| **Goal** | Get more money out than the rules allow, or make the screen claim it did. |
| **Starting state** | The example vault on `/activity`: $10.00 per payment, $20.00 per day, "Cloud hosting", $100.00, 24-hour cooling. |
| **Constraints** | Only the screens (the agent panel and "Send a different request"), reloads, and edits to what the browser saved. |

| Attempt | Outcome on screen | Handled by |
|---|---|---|
| $80 (over cap) | Blocked, "One payment may be at most $10.00." | contract |
| $10 (exactly cap) | Paid, "$10.00 left today" | contract |
| $10.01 | Blocked, "at most $10.00" | contract |
| 0, 0.00 | "The amount must be more than $0."; nothing sent or saved | form |
| -5, abc, empty, 1e30, 31 digits, 1.0000001, 4.999, 0x10, full-width digits | "Enter the amount as a number of dollars…"; nothing sent or saved | form |
| 1000001 | "Enter $1,000,000.00 or less."; nothing sent | form |
| 1000000 | Blocked, balance unchanged | contract |
| 0 and 10^29 base units (far more than exists), placed in the saved session | "Blocked: nothing to pay" and "Blocked: too large"; balance $100.00 | contract (on replay) |
| Unapproved recipient (button and custom form) | "Blocked: unknown recipient" | contract |
| Replay of a paid request, twice | "Blocked: repeat request", balance unchanged | contract |
| Raise its own limit | "Rejected. Only you can change the rules."; rules and schedule unchanged; $11 still blocked | contract |
| Splitting: $10, $10, then $0.01 | Paid, Paid, then "Only $0.00 is left today." | contract |
| Payment while paused | "Blocked: paused" | contract |
| Payment after the end date (clock skipped 31 days) | "Blocked: expired", "The agent's permission ended on <date>." | contract |
| Two clicks on Pay in one task, a mouse double-click, four more clicks | One payment for the pair; balance always 100 minus 4 per Paid receipt; one saved action per receipt; unique receipt ids; identical list after reload | app (one action at a time) |
| The same on the home example | One receipt, $96.00 | app, **after fix I-02** |
| Reload mid-session, then continue | Same three receipts, same text; next request numbered correctly; replay still refused; survives leaving for another page and returning | app |
| Corrupt saved data (5 variants) | "The practice vault could not start" with "Discard the saved vault"; other pages unaffected | app |
| Saved data that cannot be rebuilt | Clock skip of 10^30 s: error shown. Cooling period of 0: error shown. One payment larger than the day limit: vault rebuilt and still answers. | app and contract |
| Saved action written as if an $80 payment had been paid, a "successful" self-raise, and a payment to a stranger | After reload: Blocked, Rejected, Blocked; balance $96.00; rules unchanged; next real payment correct | contract (on replay) |

| | |
|---|---|
| **Success criteria** | Each attempt is blocked or handled, or is recorded as a finding. |
| **Spec** | `persona-e-adversary.spec.ts` (12 tests) |
| **Result** | **Pass** (12 of 12). One finding, fixed: I-02 (Medium). |
| **Note** | Saved data defines the practice vault, so editing the saved *setup* does change the rules of the vault that is rebuilt. That is the visitor rewriting their own practice vault, not an agent bypass; the saved file never holds an outcome, only what was asked. |
| **Evidence** | `E-01-around-the-cap.png` to `E-08-tampered-storage.png`, `BUG-home-double-click-before-fix.png` |

## F. Contest judge, limited time

| | |
|---|---|
| **Goal** | Reproduce the README's results and find the contribution quickly. |
| **Starting state** | `README.md` only; then `/` in a browser. |
| **Constraints** | Windows 11; `fe` at `D:\tools\fe\fe.exe`; native steps through WSL (Ubuntu 24.04). |
| **Scripted steps** | 1. Run each command under "Build and test" that can run here; record command, exit code and result line (`TEST_RESULTS.md`). 2. Every relative link in the README resolves to a file (10 links). 3. In the browser, count clicks from `/` to four things. |
| **Expected failure points** | A count in the README that the commands do not reproduce; a dead link; the contribution buried. |
| **Success criteria** | Commands exit 0 with the README's numbers. No dead relative link. The contribution can be understood and exercised within three clicks. |
| **Spec** | `persona-f-judge.spec.ts` (2 tests); the commands were run from a shell, not by Playwright. |
| **Result** | **Pass with one stated shortfall.** Commands: all that were run exit 0 and match (68, 44, 20 tests; 7,539 bytes). Links: 10 of 10 resolve. Clicks: ratchet explained in words 0; over-limit payment blocked with its reason 1; worst-case number on screen 2; agent's own raise rejected 3; **an owner's raise shown as Scheduled 4, plus typing two amounts** (ISSUES I-08). |
| **Not run** | The `curl … feup.sh \| bash` install line (Fe was already installed, and piping a remote script into a shell was not something this task should do) and `npm ci` (it deletes `node_modules` while another process on this machine is using the directory). |
| **Evidence** | `F-01-one-click-blocked.png`, `F-02-three-clicks-rejected.png`, `F-03-four-clicks-scheduled.png` |

## G. Phone on a constrained network

| | |
|---|---|
| **Goal** | Open the app, change the policy, send a request, read the outcome. |
| **Starting state** | `/`, nothing cached. |
| **Constraints** | Viewport 375 x 667, touch. Chromium DevTools throttling: 400 kbps down and up, 400 ms round trip, CPU slowed 4x. |
| **Scripted steps** | 1. Open `/`; "Starting the practice vault…" is shown while the contract code downloads. 2. Without waiting, tap "Protect my AI"; set $5 per payment and $15 per day. 3. "Review the rules": the button reads "Checking the rules…" and is disabled until the review appears. 4. "Create vault". 5. "Pay $4.00": Paid, "$11.00 left today". 6. "Pay $80.00": "One payment may be at most $5.00.", scrolled into view. 7. No visible loading text remains. Second test: with a vault and one payment, empty the cache, reload under the same throttling; "Starting your practice vault…" is shown, then the balance reads $96.00. |
| **Expected failure points** | A spinner that never ends; a button that can be pressed twice while loading; a blank screen. |
| **Success criteria** | A loading indicator appears while the EVM chunk loads, and the journey completes. Time to first verdict recorded. |
| **Spec** | `persona-g-constrained.spec.ts` (2 tests) |
| **Result** | **Pass** (2 of 2). Timings in `TEST_RESULTS.md`. |
| **Evidence** | `G-01-home-loading.png`, `G-02-checking-the-rules.png`, `G-03-outcome.png` |

---

## Cross-cutting specs

| Spec | What it checks | Result |
|---|---|---|
| `accessibility.spec.ts` (10 tests) | axe (all rules) on 15 states of the five routes; keyboard-only primary journey with a focus indicator asserted at every stop; live-region announcement of every verdict; errors tied to inputs; reduced motion, with a control | **Pass** (10 of 10), after fixes I-03 and I-04 |
| `navigation.spec.ts` (2 tests) | Moving between pages without a reload: `/protect` usable again after creating a vault; labels and descriptions resolve to one visible element; axe after each move | **Pass** (2 of 2), after fixes I-01 and I-04 |
| `performance.spec.ts` (8 tests) | Paint times, JavaScript transferred, click-to-receipt and vault-creation times, unthrottled and throttled | **Pass** (8 of 8); these record numbers, they have no thresholds |
