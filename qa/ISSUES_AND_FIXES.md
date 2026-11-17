# Issues and fixes

Date: 2026-11-17. Found by the scripted persona suite in `web/e2e/` running in
headless Chromium against the production build (`next start`, port 3220), and
by reading the code the scripts exercised. The personas are scripts. No human
tested anything described here.

Severity scale used: **High** = a visitor cannot finish a main task without a
reload. **Medium** = the screen shows something wrong or a keyboard user is
taken to the wrong place. **Low** = cosmetic, minor accessibility, or
documentation. **Info** = recorded, no action taken.

No issue was found in the contract's answers: every payment, refusal, schedule
and cancellation the scripts provoked matched the behaviour the brief listed.
All five fixed issues are in the web layer.

## Fixed

### I-01 (High) `/protect` stuck on "Creating the vault…" after a vault had been created

- **How found.** Persona G's last assertion ("nothing is left spinning") found
  a "Creating the vault…" button still in the document after the journey
  ended. It was hidden, so that assertion was a false alarm, but following it
  up showed the real problem. `e2e/navigation.spec.ts` now covers it.
- **What a visitor saw.** Create a vault, then go back to "Protect my AI" (main
  navigation or the browser's back button). The page showed the review with
  two disabled buttons, "Creating the vault…" and "Change something". There
  was no way to make another vault without reloading the page. Observed
  output before the fix:
  `visible buttons: [ 'Creating the vault… [disabled]', 'Change something [disabled]' ]`
- **Root cause.** `next.config.ts` sets `cacheComponents: true`. With it,
  Next.js 16 keeps a page the visitor has left mounted and hidden (React
  `<Activity>`) instead of unmounting it, so `useState` values survive.
  `ProtectForm.confirm()` set `phase` to `'creating'`, navigated to
  `/activity` on success, and never set it back.
- **Fix.** `web/src/components/protect-form.tsx`: a `useLayoutEffect` cleanup
  that, once a vault has been created, returns the page to the form when it
  is hidden. This is the pattern in Next's own guide
  (`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`,
  "Resetting stale status messages"). The visitor's entries are kept.
- **Re-test.** `navigation.spec.ts › after creating a vault, /protect can be
  used again`: failed before (1 of 9 failures in the baseline run), passes
  now. It also creates a second vault with other limits and checks it
  replaced the first.

### I-02 (Medium) Home example: two activations in one frame printed two "Paid" receipts for one payment

- **How found.** Persona E, `rapid double-click on the home example` (two
  `click()` calls in the same task).
- **What a visitor would see.** Two receipts, both "Paid, $4.00, $16.00 left
  today", both with request number 0, while the line under the buttons read
  "In the vault: $96.00". One payment had happened; the list claimed two. One
  more click then showed four receipts for three requests. Observed before
  the fix:
  ```
  slips: [ 'slip-0 | Inside every limit. $16.00 left today. | nonce 0',
           'slip-0 | Inside every limit. $16.00 left today. | nonce 0' ]
  status line: In the vault: $96.00. Left today: $16.00.
  after one more click: 4 slips, three of them with id slip-0
  ```
  Screenshot: `qa/screenshots/BUG-home-double-click-before-fix.png`.
- **Root cause.** `HomeDemo.ask()` relied on the buttons being redrawn as
  `disabled`, which happens after the click handler returns, so a second
  activation in the same frame started a second request. Both read the same
  next request number and ran against the in-browser EVM at the same time
  (`Sim` is not written to be re-entered), and both used `entries.length`
  from the same render as the receipt id, giving two list items the same
  React key.
- **Reach.** The home example only. The visitor's own vault was not affected:
  `vault-store.tsx` already refuses a second action while one is running, and
  the same test on `/activity` passed from the first run. A person
  double-clicking at normal speed is unlikely to hit it, because the first
  click disables the buttons within a frame; a script, a key held down or a
  bouncing switch can.
- **Fix.** `web/src/components/home-demo.tsx`: a ref that lets one request
  run at a time, and a counter ref for receipt ids.
- **Re-test.** `persona-e-adversary.spec.ts › rapid double-click on the home
  example`: failed before, passes now (one receipt, balance $96.00, unique
  ids).

### I-03 (Medium) After moving to another page, the next Tab went to the footer

- **How found.** The keyboard-only journey in `e2e/accessibility.spec.ts`.
  After pressing Enter on "Protect my AI", the next four Tab stops were
  "Source on GitHub", "MIT licence", "How it works", "Developers" (the
  footer), then focus left the page.
- **Root cause.** Next.js 16.4 does not move focus on a client-side
  navigation (its layout router says so: "This handler intentionally leaves
  focus untouched; resetting focus on navigation is deferred"). Focus stayed
  at the position of the link that was pressed, which now belongs to a hidden
  page placed after the new page's content in the document.
- **Fix.** `web/src/components/nav.tsx` moves focus to `<main>` when the path
  changes; `web/src/app/layout.tsx` gives `<main>` `tabIndex={-1}`;
  `web/src/app/globals.css` removes the outline from `<main>` itself (it is
  the whole page). A side effect: the "Skip to content" link now moves focus
  as well as scroll position.
- **Re-test.** `accessibility.spec.ts › the primary journey with Tab,
  Shift+Tab, Enter and Space` asserts that `<main>` has focus after each
  navigation, that the next Tab is the first field of the new page, and that
  focus never leaves the page during the journey. Passes.

### I-04 (Medium) The same element id on pages that are in the document together

- **How found.** `navigation.spec.ts › labels still point at the right
  thing…`, written after I-01 showed that left pages stay in the document.
  First failure: `#worst-title is used 2 times`.
- **Root cause.** `id="worst-title"` was used on `/how-it-works`, on the
  `/protect` review and on `/activity`; `id="agent-title"` on `/how-it-works`
  and `/activity`; and receipt headings were `slip-0`, `slip-1`… on both the
  home example and the visitor's vault. With pages kept mounted, an
  `aria-labelledby` can resolve to the heading of a hidden page. The
  duplicate ids were observed; a wrong spoken name was not separately
  demonstrated.
- **Fix.** `web/src/app/how-it-works/page.tsx` (`how-agent-title`,
  `how-worst-title`), `web/src/components/protect-form.tsx`
  (`review-worst-title`), `web/src/components/slip.tsx` (React `useId()` for
  the receipt heading).
- **Re-test.** The same test visits all five pages by link, checks every
  `aria-labelledby`, `aria-describedby` and `label[for]` on screen for a
  missing, hidden or duplicated target, checks the regions by their
  accessible names, and runs axe at each step. Passes.

### I-05 (Low) Three kinds of link smaller than 44 x 44 CSS px

- **How found.** Persona C, target-size check at 360 px wide.
- **What.** On `/developers`: "MIT" 31.8 x 20 and
  "github.com/vaibhav4046/hardstop" 265.9 x 20 (default text), "MIT"
  39.7 x 25 (125% text). On `/protect` with errors: the links in the error
  summary were 42.8 px tall when they wrapped to two lines.
- **Fix.** `web/src/app/globals.css`: `.rows dd a` and `a.error` get
  `min-height: 2.75rem` (and `min-width` for the first).
- **Re-test.** `persona-c-barbara.spec.ts › no horizontal overflow and 44px
  targets…` at both text sizes passes; smallest non-inline target measured is
  44 px (default text) and 55 px (125%).

## Open issues

| # | Severity | Issue | Why it is open |
|---|---|---|---|
| I-06 | Low | Links inside sentences are 18 to 20 px tall at default text (13 distinct links, e.g. "the CoinDesk report", the five source-file links on `/how-it-works`, "kernel.fe"). The brief's criterion "every interactive target ≥ 44 x 44" is therefore **not met literally**. | The suite exempts links that sit inside running text, which is the inline exception in WCAG 2.5.8. Making them 44 px tall would break line spacing. The list is in `qa/metrics/persona-c-targets-*.json`. The five stacked source-file links on `/how-it-works` are the ones most likely to be mis-tapped. |
| I-07 | Low | The screens offer no way to ask for a payment to a recipient that has been removed: it vanishes from the agent's "Pay to" list. "Removed recipients are blocked at once" can be read but not tried. | Product limitation. The suite checks it by adding the request to the saved session and reloading; the contract answers "Blocked: unknown recipient" and the balance is unchanged. |
| I-08 | Low | The ratchet cannot be exercised within three clicks of `/`. Seeing an owner's raise become "Scheduled" takes four clicks and two typed amounts. Within three clicks a visitor can see a blocked payment with its reason (1), the worst-case number (2) and the agent's own raise rejected (3). The home example shows neither the ratchet nor the worst-case number. | Product limitation; closing it means adding an owner control to the home example, which is a feature, not a fix. |
| I-09 | Info | Two forms answer for the contract on owner input: the withdraw form refuses an amount above the balance (`owner-controls.tsx`), and every amount field refuses zero (`money.ts`). So the contract's "ZeroAmount" answer and its failed-withdrawal path cannot be reached by typing. | Not agent verdicts. No comparison outside `lib/hardstop/` produces "Paid" or "Blocked"; the 18 comparisons found and the judgement on each are in `qa/metrics/persona-d-comparisons.json`. Zero was checked by replay from storage: the contract says "Blocked: nothing to pay". |
| I-10 | Low | `README.md`: the sentence "An independent adversarial review, what it found and what was fixed: `security/AUDIT.md`." appears twice (lines 147 to 150). The architecture block says `adversary_tests.fe` has "8 mutants"; the results table says "14 of 14 mutants caught". The comment "npm test # 15 tests on the compiled contract + the differential test" is accurate as far as it goes (15 in `tests/vault.test.ts`, 1 in `tests/differential.test.ts`) but `npm test` reports 20: it also runs 4 in `src/lib/session.test.ts`. | Outside the files this task was allowed to change. |
| I-11 | Low | The home page downloads the part that runs the contract as soon as it loads (145 kB of the 304 kB of JavaScript, gzip), whether or not the visitor uses the example. At 400 kbps with a 4x slower CPU the example is ready 10.9 s after navigation starts; the page text is painted at 2.1 s. A loading line is shown meanwhile. | Works as designed and never hangs. Recorded because `load-sim.ts` says the download happens "only when a vault is needed". |
| I-12 | Low | At 360 px the two tables (`/how-it-works`, `/developers`) and the code blocks are wider than the screen and scroll sideways inside their own box. The page itself does not overflow. | By design (`min-w-[34rem]`, `min-w-[36rem]`, `overflow-x: auto`). Measured widths are in `qa/metrics/persona-c-targets-*.json`. |
| I-13 | Info | `npm audit` reports 14 high-severity advisories, all `picomatch` (ReDoS) reached through `eslint-config-next`. | Development tooling that was already in the project; not shipped to the browser; not introduced by Playwright or axe. |
| I-14 | Info | Once, a production build served a stylesheet that did not contain a CSS edit made a few minutes earlier (the first run after I-05's fix still measured the old sizes; the built file had no `.rows dd a` rule). The next build had it, and four further edit-and-build probes all picked the edit up. | Not reproduced, cause not established. `.next/cache/turbopack` exists; a stale build cache is a guess, not a finding. |

## Mistakes in the suite itself, corrected along the way

These were errors in the tests, not in the product. They are listed so that
no changed assertion goes unmentioned.

- A loop clicked "every closed disclosure" from a list that shrank as it
  clicked. Replaced with a helper that clicks the first closed one until none
  is left.
- One adversary step reused a "Pay to" choice left over from an earlier step
  and so tested the wrong recipient. The recipient is now named.
- `getByRole('alert')` also matched Next's hidden route announcer. Narrowed
  by text.
- The source scan's pattern missed most comparisons on the first run. It was
  simplified, and the test now fails both on an unjudged comparison and on a
  judged one it can no longer find. One comparison it cannot match
  (`today()` in `session.ts`, an `===`) is noted in the spec as read by hand.
- The expected worst-case figure for the example vault was guessed as $40.00
  before the first run and corrected to the $20.00 the contract returns.
- Persona G's reload check originally reloaded with a warm cache; the vault
  was already rebuilt by the time the page's `load` event fired, so the
  loading line was never there to see. The check now empties the HTTP cache
  first. The assertion is the same; the scenario is the harsher one.

## Assertions that are narrower than the brief's wording

- **"Fail on any failed network request."** A GET that the browser itself
  cancelled (`net::ERR_ABORTED`: a prefetch or preloaded chunk cut off by a
  navigation) is not failed on the spot. Each such URL is fetched again at
  the end of the test and must return 200, or the test fails. Any other
  failure, any HTTP status of 400 or above, any `console.error` and any
  uncaught page error fails the test.
- **"Every interactive target ≥ 44 x 44."** Links inside sentences are
  exempt (I-06).
- **"Within 3 clicks."** Asserted for three of the four things measured; the
  fourth (a scheduled raise) is recorded at four clicks (I-08).

## Since this report

- I-10 is fixed: the duplicated README sentence is removed and the
  architecture block now says 14 broken kernels.
- The full suite was run once more by the main session after these reports
  were written: 51 passed, 0 failed (3.8 min), with `npm test` at 20 passed
  and `tsc` and `eslint` clean.
