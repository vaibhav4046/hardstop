# Test results

Date: 2026-11-17. A snapshot: current counts are in README.md (browser 61,
Fe 98, native 52, web 88, mutants 15). All output below was produced by
running the command shown on this machine. The personas are scripts; no human took part in any test.

## How to run it again

```sh
cd D:/hardstop/web
npm run e2e          # builds the production app, serves it on :3220, runs all 51 tests
```

`npm run e2e` is `playwright test`. `web/playwright.config.ts` starts
`npm run build && npx next start -p 3220` itself and stops it afterwards.
Port 3220 must be free. Nothing else needs to be running.

Raw files from the final run: `qa/metrics/final-run.txt` (reporter output),
`qa/metrics/playwright-results.json`, and one JSON file per measurement in
`qa/metrics/`.

## Environment

| | |
|---|---|
| OS | Windows 11 Home Single Language, 10.0.26200; 16 GB RAM |
| Node / npm | v24.22.3 / 11.19.1 |
| Playwright | `@playwright/test` 1.65.1 |
| Browser | Chrome Headless Shell 159.0.8154.6 (Playwright chromium-headless-shell v1255). Chromium only. |
| axe | `@axe-core/playwright` 4.14.0, `axe-core` 4.14.1 |
| App | Next.js 16.4.6, React 19.3.0, production build served by `next start -p 3220` |
| Installed for this work | `npm install -D @playwright/test @axe-core/playwright` (4 packages added, no peer-dependency conflict, no `--force`, no `--legacy-peer-deps`), then `npx playwright install chromium` |

## Final run

Started 2026-11-17T20:49:54Z. Command: `npm run e2e`. Exit code 0.

```
Running 51 tests using 6 workers
  51 passed (4.0m)
```

`playwright-results.json`: `"expected":51,"skipped":0,"unexpected":0,"flaky":0`.
Retries are off (`retries: 0`), so a pass is a first-attempt pass.

| Spec file | Tests | Passed | Failed |
|---|---|---|---|
| `persona-a-maya.spec.ts` | 3 | 3 | 0 |
| `persona-b-arjun.spec.ts` | 1 | 1 | 0 |
| `persona-c-barbara.spec.ts` | 5 | 5 | 0 |
| `persona-d-lena.spec.ts` | 6 | 6 | 0 |
| `persona-e-adversary.spec.ts` | 12 | 12 | 0 |
| `persona-f-judge.spec.ts` | 2 | 2 | 0 |
| `persona-g-constrained.spec.ts` | 2 | 2 | 0 |
| `accessibility.spec.ts` | 10 | 10 | 0 |
| `navigation.spec.ts` | 2 | 2 | 0 |
| `performance.spec.ts` | 8 | 8 | 0 |
| **Total** | **51** | **51** | **0** |

### Every test, with its duration in the final run

```
accessibility.spec.ts (10)
  passed  20.6s  Accessibility: axe › static routes and the home example
  passed   8.3s  Accessibility: axe › /protect: form errors and the review
  passed  19.4s  Accessibility: axe › /activity: vault, receipts, form errors, scheduled change, paused
  passed   3.7s  Accessibility: axe › /activity: saved vault that cannot be read
  passed   1.7s  Accessibility: keyboard only › the primary journey with Tab, Shift+Tab, Enter and Space
  passed   0.8s  Accessibility: keyboard only › a form error moves focus to the summary, and its links go to the fields
  passed  14.7s  Accessibility: announcements and errors › every verdict is announced through a polite live region
  passed  10.3s  Accessibility: announcements and errors › form errors are tied to their inputs
  passed   6.4s  Accessibility: reduced motion › with reduced motion, nothing on a verdict animates for longer than 10 ms
  passed   4.2s  Accessibility: reduced motion › control: without the preference the slip does animate, so the check above can fail
navigation.spec.ts (2)
  passed  12.4s  Moving between pages › after creating a vault, /protect can be used again
  passed  19.3s  Moving between pages › labels still point at the right thing after visiting every page, and axe stays clean
persona-a-maya.spec.ts (3)
  passed   9.6s  Persona A: Maya, non-technical creator › home example, primary CTA, default vault, paid and blocked with the reason
  passed   5.4s  Persona A: Maya, non-technical creator › shortest path from landing to a verdict on her own vault
  passed   5.6s  Persona A: Maya, non-technical creator › primary copy has no jargon on the empty states either
persona-b-arjun.spec.ts (1)
  passed  55.9s  Persona B: Arjun, SaaS founder › own limits, two recipients, and every owner control
persona-c-barbara.spec.ts (5)
  passed   7.0s  Persona C: Barbara, mobile with larger text › the home walkthrough and the protects / does not protect section, with nothing to connect
  passed  11.0s  Persona C: Barbara, mobile with larger text › no route asks for a wallet or an address
  passed  12.5s  Persona C: Barbara, mobile with larger text › no horizontal overflow and 44px targets on all five routes at 360px, text 125%
  passed  10.2s  Persona C: Barbara, mobile with larger text › no horizontal overflow and 44px targets on all five routes at 360px, text 100%
  passed  11.5s  Persona C: Barbara, mobile with larger text › contrast passes on all five routes at 360px with larger text (axe)
persona-d-lena.spec.ts (6)
  passed   2.1s  Persona D: Lena, security engineer › every command shown on /developers is in the README or CI
  passed   5.5s  Persona D: Lena, security engineer › the reason-code table has 12 rows that match REASON_NAMES
  passed   4.0s  Persona D: Lena, security engineer › GitHub links point at the repository and every linked source path exists on disk
  passed   2.5s  Persona D: Lena, security engineer › the excerpt and usage text on /developers are in the Fe source
  passed  11.9s  Persona D: Lena, security engineer › the reason code under Technical details matches the plain sentence
  passed   1.1s  Persona D: Lena, Node-side source check › outside lib/hardstop, no comparison of an amount with a limit produces a verdict
persona-e-adversary.spec.ts (12)
  passed   4.7s  Persona E: adversarial agent › amounts around the cap: over, exactly, one cent over
  passed  10.7s  Persona E: adversarial agent › amounts that are not amounts: zero, negative, text, 1e30, 31 digits, seven decimals, over the form maximum
  passed   3.6s  Persona E: adversarial agent › amounts the form will not send still get the contract’s answer when replayed from storage
  passed   8.2s  Persona E: adversarial agent › unapproved recipient, replay, and raising its own limit
  passed   6.1s  Persona E: adversarial agent › splitting: $10 + $10, then one cent
  passed  14.6s  Persona E: adversarial agent › payment while paused, and after the end date
  passed   4.8s  Persona E: adversarial agent › rapid double-click on Pay: no extra payment, receipt list intact
  passed   4.1s  Persona E: adversarial agent › rapid double-click on the home example
  passed   5.2s  Persona E: adversarial agent › reload mid-session, then continue
  passed   9.0s  Persona E: adversarial agent › corrupt saved data: an error with a way out, not a broken page
  passed   7.8s  Persona E: adversarial agent › saved data that cannot be rebuilt: an error with a way out
  passed   7.3s  Persona E: adversarial agent › a hand-edited action that claims a payment the contract refuses
persona-f-judge.spec.ts (2)
  passed   0.4s  Persona F: contest judge › every relative link in README.md resolves to a file
  passed   8.3s  Persona F: contest judge › the contribution within three clicks of /
persona-g-constrained.spec.ts (2)
  passed  13.7s  Persona G: mobile on a constrained network › adjust the policy, send a request, read the outcome; loading is always visible and ends
  passed  13.6s  Persona G: mobile on a constrained network › a reload under the same conditions shows a loading state, then the same vault
performance.spec.ts (8)
  passed   5.0s  Performance, unthrottled › paint times and JavaScript transferred for /
  passed   1.2s  Performance, unthrottled › JavaScript transferred for /activity
  passed   2.1s  Performance, unthrottled › click "Agent pays $4" to receipt, 10 runs
  passed   9.4s  Performance, unthrottled › time to create a vault
  passed  33.5s  Performance, throttled › paint times and JavaScript transferred for /
  passed  12.3s  Performance, throttled › JavaScript transferred for /activity
  passed  20.2s  Performance, throttled › click "Agent pays $4" to receipt, 10 runs
  passed  71.9s  Performance, throttled › time to create a vault
```

### Run history

Each row is one complete `npm run e2e` (fresh production build each time).
The performance project only starts when everything before it has passed,
which is why it "did not run" in the first four.

| Run | Passed | Failed | Did not run | What changed before it |
|---|---|---|---|---|
| 1 (persona and accessibility specs only) | 30 | 10 | 1 | First run of the suite. |
| 2 (baseline, full) | 34 | 9 | 8 | Five mistakes in the specs corrected; `navigation.spec.ts` added. No app code changed yet. |
| 3 | 40 | 3 | 8 | App fixes I-01 to I-05. |
| 4 | 42 | 1 | 8 | Spec: one more comparison judged. (The two target-size failures in run 3 were the stale stylesheet, ISSUES I-14.) |
| 5 | 51 | 0 | 0 | Spec: one judged entry the scan cannot match removed and noted. |
| 6 | 51 | 0 | 0 | Spec: sideways-scroll measurement and one more recorded metric. |
| **7 (final)** | **51** | **0** | **0** | Spec: evidence-screenshot time taken off persona A's clock. |

Of the 9 failures in the baseline run, 6 were caused by the five product
issues (I-01 to I-05; the target-size issue failed two tests) and 3 by
mistakes in the specs. Both lists are in `ISSUES_AND_FIXES.md`.

Three partial runs with tracing switched on (persona and cross-cutting specs
only, used to look into slow tests) passed 24 of 24, 43 of 43 and 43 of 43.

### A note on test durations

Some tests take several times longer in one run than in another (persona B:
15 s to 56 s; one accessibility test: 0.8 s to 1.1 min) and still pass. Two such
stalls were captured with tracing on. Both were inside Playwright's own calls,
not waits on the app: injecting the axe script into a static page (29.4 s)
and a full-page screenshot (13.5 s). They overlapped in wall-clock time
(20:47:13 to 20:47:42 and 20:47:24 to 20:47:38) in two separate browser
processes, with six workers running. That points at the machine, which was
also running other work, and not at the pages; it was not investigated
further. Consequences:

- Durations in the list above are not performance measurements.
- The performance figures below come from a project that runs after
  everything else, with one worker.
- The persona journey times further down are wall-clock times that include
  this overhead, and are labelled as such.

## Performance

**These are local production-server numbers.** Server and browser are on the
same machine, over loopback, with nothing else in the test runner active. They
are not field data and say nothing about a deployed site.

**A "payment" here is a transaction in an EVM running inside the page.** The
click-to-receipt times are how long that local simulation and the redraw
take. They are **not** on-chain confirmation latency; no chain is involved.

Conditions. *Unthrottled*: 1280 x 720, no network or CPU limits. *Throttled*
(persona G's conditions): 375 x 667, Chromium DevTools emulation at 400 kbps
down and up, 400 ms round trip, CPU slowed 4x. Every load measurement uses a
new browser context with an empty cache. Times are milliseconds.

| Measurement | Unthrottled median | max | runs | Throttled median | max | runs |
|---|---|---|---|---|---|---|
| First Contentful Paint, `/` | 120 | 140 | 5 | 2,348 | 2,372 | 3 |
| Largest Contentful Paint, `/` (element: the opening paragraph under the `h1`) | 120 | 140 | 5 | 2,348 | 2,372 | 3 |
| Navigation start until the home example is ready (contract code downloaded, vault deployed) | 370 | 607 | 5 | 10,452 | 10,462 | 3 |
| Click "Agent pays $4" until the receipt is in the page and a frame is produced | 26 | 33 | 10 | 86 | 100 | 10 |
| Create a vault: "Start with an example vault" on `/activity`, cold (includes downloading the contract code) | 121 | 137 | 5 | 3,666 | 3,677 | 3 |
| Create a vault: "Create vault" on the `/protect` review until `/activity` shows it (contract code already loaded) | 42 | 58 | 5 | 1,236 | 1,251 | 3 |
| First Contentful Paint, `/activity` | 136 | | 1 | 2,280 | | 1 |
| Largest Contentful Paint, `/activity` | 136 | | 1 | 5,752 | | 1 |

All individual values:

```
unthrottled  FCP /            [140, 120, 128, 112, 100]           (LCP identical)
unthrottled  example ready    [607, 370, 378, 342, 341]
unthrottled  pay click        [25, 27, 33, 33, 13, 15, 28, 23, 26, 17]
unthrottled  example vault    [113, 107, 137, 121, 132]
unthrottled  own vault        [47, 35, 58, 38, 42]
throttled    FCP /            [2304, 2348, 2372]           (LCP identical)
throttled    example ready    [10321, 10462, 10452]
throttled    pay click        [86, 93, 85, 77, 100, 91, 82, 97, 84, 81]
throttled    example vault    [3677, 3650, 3666]
throttled    own vault        [1236, 1251, 1224]
```

Notes on reading these:

- These figures were re-measured on 2026-11-18, after motion was added. The
  home page's first lines are now wiped in, so the largest element is counted
  when the opening paragraph appears rather than the `h1`. Before that change
  the same measurements were: paint 100 ms unthrottled and 2,104 ms throttled,
  click to receipt 15 ms and 58 ms.
- Paint times come from `PerformanceObserver` (`paint`,
  `largest-contentful-paint`) inside the page. LCP is the last candidate
  reported once the network was idle.
- On `/activity` under throttling, LCP (5.8 s) is much later than FCP (2.3 s)
  because the first HTML says "Starting your practice vault…" and the real
  content replaces it only after the page's JavaScript has arrived. Single
  run each.
- The click-to-receipt time stops when the receipt is in the document and one
  animation frame has been produced. The 320 ms print animation that follows
  is not included.
- Throttled sample sizes are 3 where a run costs 10 s or more.

### JavaScript transferred

Sum of the encoded (on-the-wire) size of every script response, from the
browser's network log (`Network.loadingFinished.encodedDataLength`), empty
cache, counted until the network was idle. The server sent every script with
`content-encoding: gzip`. Identical under throttling, as expected.

| Page and state | Script files | Transferred (gzip) | Decoded |
|---|---|---|---|
| `/` (the home example loads the contract code at once) | 10 | 304,410 bytes (297 kB) | 1,018,328 bytes |
| `/activity`, no vault yet | 9 | 159,682 bytes (156 kB) | 520,321 bytes |
| `/activity`, after "Start with an example vault" | 10 | 304,410 bytes (297 kB) | 1,018,328 bytes |

The difference, 144,728 bytes gzip (498,007 decoded), is the chunk with the
in-browser EVM and the compiled vault. The totals include whatever Next.js
prefetches for links on the page.

### Persona journey times (wall clock, with test-runner overhead)

| Journey | Clicks | Time |
|---|---|---|
| Persona A as scripted: landing, two example clicks, primary button, review, create, first verdict on her own vault | 6 | 5,160 ms (930 ms of evidence screenshots excluded) |
| Persona A shortest path: landing, primary button, "Review the rules", "Create vault", "Pay $4.00" | 4, no typing | 4,761 ms in the final run; 1,490 ms and 2,127 ms in two earlier runs |
| Persona G, throttled: landing heading visible | | 6,188 ms |
| Persona G: policy edited (two fields typed) | | 8,144 ms |
| Persona G: review visible | | 11,448 ms |
| Persona G: vault ready | | 11,723 ms |
| **Persona G: first verdict on screen** | 4 taps, 2 fields | **12,109 ms** from navigation start |
| Persona G: reload with an empty cache: loading line visible / vault restored | | 6,145 ms / 10,460 ms |

A script types and taps without pausing to read, so these are lower bounds
on anything a person would do, and the persona A figures vary by a factor of
three between runs for the reason given under "A note on test durations".

## Accessibility

### axe

`AxeBuilder.analyze()` with every rule enabled (not only the WCAG tags), on
15 states. **Violations of any impact: 0. Serious or critical: 0.**

```
/ (empty)                                   /protect (with form errors)
/protect (empty)                            /protect (review, no recipients)
/activity (empty)                           /activity (with vault, no receipts)
/how-it-works (empty)                       /activity (with receipts)
/developers (empty)                         /activity (every disclosure open, with form errors)
/ (with receipts, technical details open)   /activity (with a scheduled change)
/how-it-works (technical section open)      /activity (paused)
                                            /activity (error state)
```

Also clean: axe after each of six client-side page changes
(`navigation.spec.ts`), and axe `color-contrast` on all five routes at
360 px with 125% text (persona C).

Not examined: results axe marks "incomplete" (needs a person to judge). axe
finds a subset of accessibility problems; a clean run is not a conformance
claim.

### Keyboard only

One journey using Tab, Shift+Tab, Enter and Space: skip link, home example
(Space, then Enter), back up to the primary button (Shift+Tab), `/protect`,
type a new day limit, review, create, pay (Space), a blocked payment (Enter),
open "Technical details" (Enter), pause (Space). **34 focus stops; a focus
indicator (outline of at least 2 px, or a box shadow, on the element or on
its radio row) was asserted at every one; focus never left the page.** After
each page change `<main>` has focus and the next Tab is the first control of
the new page. The trail is `qa/metrics/keyboard-trail.json`.

### Announcements

Each verdict changes the text of one `role="status"` `aria-live="polite"`
region that is in the document before the first verdict. Checked for 2
verdicts on the home example and 11 actions on a vault (paid, blocked: too
large twice in a row, unknown recipient, repeat request, rejected raise,
scheduled change, cancelled change, pause, blocked: paused, clock skip). The
region's text was read from the DOM; **no screen reader was run**, so what is
actually spoken was not verified.

### Form errors

9 error states across `/protect` and `/activity`: the input has
`aria-invalid="true"`, its `aria-describedby` includes the id of a visible
element holding the message, a hint stays attached beside the error, and the
`/protect` summary is a `role="alert"` that takes focus and links to each
field. Fixing a field and resubmitting removes the attribute and the message.

### Reduced motion

With `prefers-reduced-motion: reduce` emulated, after a verdict on the home
example, on a vault, and after an owner action: longest computed animation or
transition on `.slip`, its stamp, `.logline`, `.gauge-fill` and every `.btn`
is **0 ms**, and `document.getAnimations()` reports nothing over 10 ms. A
control test without the preference finds `print-out` and `stamp-down`
running for at least 300 ms, so the check is able to fail.

### Target size and overflow (persona C, 360 px wide)

| Text size | States checked | Horizontal overflow | Smallest target (links inside sentences excluded) |
|---|---|---|---|
| 100% | 8 | none | 44 px |
| 125% | 8 | none | 55 px |

13 distinct links inside sentences are 18 to 20 px tall at 100% and are
exempt (ISSUES I-06). Tables and code blocks scroll sideways inside their
own boxes (ISSUES I-12).

## Persona F: the README's "Build and test" commands

Run on 2026-11-17T20:11:08Z from Git Bash with `MSYS_NO_PATHCONV=1`. Full log:
`qa/metrics/readme-commands.txt`.

| Command | Where | Exit | Result line | README says |
|---|---|---|---|---|
| `fe --version` | `D:\tools\fe\fe.exe` | 0 | `fe 26.6.0 (5b3f96a)` | `fe 26.6.0 (5b3f96a)` |
| `fe fmt --check` | `fe/`, Windows | 0 | (no output) | |
| `fe test` | `fe/`, Windows | 0 | `test result: ok. 68 passed; 0 failed` | 68 tests on the EVM |
| `fe test --backend native` | `fe/`, WSL Ubuntu 24.04, via `scripts/native.sh` | 0 | `test result: ok. 44 passed; 0 failed` | 44 kernel + adversary tests |
| `fe build --emit bytecode,runtime-bytecode,abi` | `fe/`, Windows | 0 | `Wrote … Vault.runtime.bin` and 7 other files | |
| `fe build --backend native` | `fe/`, WSL, via `scripts/native.sh` | 0 | `Wrote /mnt/d/hardstop/fe/out/hardstop` (87,280 bytes) | writes `out/hardstop` |
| `./out/hardstop campaign 5206533097626292048 20000 40` | `fe/`, WSL | 0 | `violation 0`, `digest 11679353013553752036`, `promises 287976`, `promises_reached 8396`; 0.22 s | |
| `npm test` | `web/`, Windows (uses WSL for the differential test) | 0 | `tests 20`, `pass 20`, `fail 0` | "15 tests on the compiled contract + the differential test" |
| `curl … feup.sh \| bash` | | not run | Fe was already installed; a remote script was not piped into a shell | |
| `npm ci` | `web/` | not run | It deletes `node_modules` while another process on this machine was using the directory | |

```
$ wsl -d Ubuntu-24.04 -- bash -c "cd /mnt/d/hardstop/fe && ./out/hardstop campaign 5206533097626292048 20000 40"
violation 0
at_case 0
at_step 0
digest 11679353013553752036
promises 287976
promises_with_queue 36775
promises_with_spend 52600
promises_reached 8396
[exit 0]
```

Other README claims checked: `fe/out/Vault.runtime.bin` is 15,078 hex
characters, which is the 7,539 bytes in the results table. `npm test` counts
by file: 15 in `tests/vault.test.ts`, 1 in `tests/differential.test.ts`, 4 in
`src/lib/session.test.ts`. All 10 relative links in the README resolve to
files. `git status` after the Fe build shows no change to
`web/src/lib/hardstop/artifacts.ts`.

README claims **not** re-checked here: the figures in the results table that
come from inside the test output (8,000 verdicts with fingerprint
`885356084767103301`, 14 of 14 mutants, the 2,938 exposure checks, the 2,400
differential requests). The tests that assert them passed; the numbers
themselves were not read back out.

## Checks after the fixes

Run after the last change to `web/src`. Full output: `qa/metrics/checks.txt`.

| Command (in `web/`) | Exit | Result |
|---|---|---|
| `npx tsc --noEmit` | 0 | no output |
| `npm run lint` | 0 | no output from eslint |
| `npm run build` | 0 | 6 routes prerendered as static content |
| `npm test` | 0 | `tests 20`, `pass 20`, `fail 0`, `duration_ms 51223` |

`tsc` and `eslint` cover `web/e2e/` as well, and were run again (both exit 0)
after the last change to a spec.

## Not verified

- **No human testing of any kind.** No usability study, no assistive-
  technology user, no screen reader run.
- **One browser.** Headless Chromium only. Not Firefox, not Safari, no real
  phone. The mobile personas are a viewport size with touch events.
- **Larger text** is the root font size set to 125%, as instructed. Browser
  zoom and operating-system text scaling were not tested.
- **Network throttling** is Chromium's emulation, not a real slow link.
- **Online links.** Whether `github.com/vaibhav4046/hardstop`, the CoinDesk
  and arXiv links and `fe-lang.org` resolve was not checked; no request was
  made to any outside host. GitHub links were checked for form, and their
  paths for existence on disk.
- **CI.** The GitHub Actions workflow was read, not run.
- **`npm ci`** and the Fe install script: not run (reasons above).
- **Where a withdrawal goes.** The screen says "back to yourself" and the
  balance drops by the amount; the screens show no owner balance. The
  destination is covered by an existing contract test, which passes.
- **The stale stylesheet** (ISSUES I-14) and the **test stalls** (above) were
  each seen and neither was explained.
- **Port 3210.** Something was listening on it at the start of this work and
  nothing is now. Nothing here connected to it or stopped it.

## Processes

After the final run: no listener on port 3220, no Chromium or headless-shell
process, and no `next` process. The only server this work started by hand (a
`next start -p 3220` used for debugging, PID 11080) was stopped before the
later runs.
