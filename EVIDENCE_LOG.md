# Evidence log

Real commands and real output. Times are UTC. Nothing here is estimated.

## 2026-11-17

**Toolchain**

```
$ fe --version
fe 26.6.0 (5b3f96a)
```

Windows binary `fe_windows_amd64.exe` from the `argotorg/fe` v26.6.0 release
for EVM work; `feup.sh --version v26.6.0` inside WSL2 Ubuntu 24.04 for the
native target (Fe links native executables only on x86-64 Linux and AArch64
macOS).

**Registration.** Completed by the project owner through the official form
before the 23:59 UTC deadline (owner-reported; the confirmation email with
the project ID is held by the owner).

**Feasibility spike (commit 89ee829).** One pure function, three tests, both
targets:

```
$ fe test                         -> test result: ok. 3 passed; 0 failed
$ fe test --backend native        -> test result: ok. 3 passed; 0 failed
$ fe build --backend native && ./out/hardstop
decision code: 1
```

**Kernel v2 + adversary + vault v2**

```
$ fe test                                    (Windows, EVM)
test result: ok. 50 passed; 0 failed

$ fe test --backend native                   (WSL2)
test result: ok. 30 passed; 0 failed
```

The 20 extra EVM tests are the vault tests, which need a chain.

**Same verdicts on both targets.** `both_targets_reach_the_same_verdicts`
plays 200 games of 40 requests (8,000 verdicts) and asserts the fingerprint
`18432554080552133010` and `allowed == 1739`. The same assertion passes under
`fe test` and under `fe test --backend native`.

**Native campaign**

```
$ ./out/hardstop campaign 5206533097626292048 200 40
cases 200
requests 8000
allowed 1739
denied 6261
violation 0
at_case 0
at_step 0
digest 18432554080552133010
```

An earlier, less balanced generator ran 20,000 games x 40 requests (800,000
verdicts) natively in 0.074 s wall time; the current one has not been timed
yet.

**The adversary catches broken kernels.** Eight mutants (one over the cap,
forgets spending, accepts replays, ignores pause, skips cooling, pays anyone,
too strict, under-counts) each make `campaign` report a violation within 200
games. All eight tests pass on both targets.

**Exact revert reasons** (read from the test runner, then pinned in
`vault_tests.fe`): `NotAgent()` 0x0d9ab13f, `NotOwner()` 0x30cd7471,
`InvalidPolicy()` 0xd06b96b1.

**Contract vs native kernel (commit a6dc29f).** `web/tests/differential.test.ts`
deploys the compiled vault into an in-memory EVM, plays seeded games, and for
each request compares the contract's result with `hardstop batch`:

```
$ cd web && npm test
✔ vault bytecode and native kernel agree on 2400 payment requests (25631ms)
ℹ 2400 payment requests (343 allowed, 1977 denied, 80 reverted) and 480
  exposure queries: vault and native kernel agreed on all of them
ℹ tests 13   ℹ pass 13   ℹ fail 0
```

The 12 other tests are the time-travel tests in `web/tests/vault.test.ts`.

**CI on Linux (GitHub Actions run 44157674013, commit a6dc29f).** Passed:
format, `fe test`, `fe test --backend native`, contract build, native build,
native campaign of 20,000 games x 40 requests, "the committed web artifacts
are what this source compiles to" (so the Windows-built bytecode is
byte-identical to the Linux-built bytecode), and the web tests including the
differential test. Failed: the type-check step, because Next's generated
route types were missing in CI; fixed by running `next typegen` first.

**CI fully green (run 44158519489, commit 8637f43)**, including the
type-check step.

**Headline claim re-checked at source (2026-11-17).** The CoinDesk article
(Francisco Rodrigues, 2026-11-01) was fetched again and states: nine of 10
models raised their own spending cap at least once with no attacker present;
five of 10 sent money to a simulated attacker at least once in the
impersonation experiment; Cornell Tech and Yale researchers; Circle agent
wallets, 10 USDC on Base, 1-cent daily limit; the agents retrieved the
emailed one-time passcode themselves; "controlled tests using real USDC,
rather than documented attacks on Circle customers". The arXiv abstract
(2610.35835 v3) confirms the mechanism and "ten different frontier models"
but gives no count. Both were read through a summarising fetch tool.

**Independent adversarial review and fixes.** Findings and fixes are in
`security/AUDIT.md`. After the fixes:

```
$ fe test                                    (Windows, EVM)
test result: ok. 68 passed; 0 failed

$ fe test --backend native                   (WSL2)
test result: ok. 44 passed; 0 failed

$ ./out/hardstop campaign 5206533097626292048 200 40
cases 200
requests 8000
allowed 1745
denied 6255
violation 0
digest 885356084767103301
promises 2938
promises_with_queue 347
promises_with_spend 565
promises_reached 100

$ cd web && npm test
✔ vault bytecode and native kernel agree on 2400 payment requests
ℹ 2400 payment requests (336 allowed, 1951 denied, 113 reverted) and 480
  exposure queries: vault and native kernel agreed on all of them
ℹ tests 16   ℹ pass 16   ℹ fail 0
```

The fingerprint changed from the earlier `18432554080552133010` because the
order of two checks in `decide` changed and the campaign now makes more
random choices per step. Fourteen broken kernels are each caught on both
targets. Vault runtime: 7,539 bytes.

Two broken kernels were NOT caught on the first attempt after the review
(`OneSecondEarly`, `AmendKeepsOldMaturity`). The campaign was changed to steer
the clock onto the second a raise matures and to have the owner stack a
bigger raise on a waiting one; both are caught now.

**Competing entry checked.** `devprashant19/Leash` README and rule list read
through the GitHub API on 2026-11-17; not run. See `DECISIONS.md` D2.

**Not done yet:** accessibility and persona testing, deployment, the film.
The web UI is being built; nothing about it is claimed here until it has been
exercised in a browser.

**Browser suite (Playwright 1.65, Chromium, production build).** Written and
first run by a QA agent, then re-run independently:

```
$ cd web && npm run e2e
  51 passed (3.8m)
$ npm test
ℹ tests 20   ℹ pass 20   ℹ fail 0
```

Seven scripted personas, a keyboard-only journey, reduced motion, axe on 15
page states (0 violations) and performance measurements. Five product bugs
were found and fixed, the most serious being that `/protect` stayed on
"Creating the vault…" after a vault was created. Details, screenshots and the
issues left open are in `qa/`. No human participants; Chromium only.

**Deployment (Vercel, production).** https://hardstop-omega.vercel.app

```
$ curl -sI https://hardstop-omega.vercel.app/      -> HTTP/1.1 200 OK, with
  Content-Security-Policy, X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, Permissions-Policy, Strict-Transport-Security
$ / /protect /activity /how-it-works /developers  -> 200 each

$ node web/e2e/live-check.mjs https://hardstop-omega.vercel.app
     page loaded 303 ms after navigation started
ok   home: $4 is paid
     first verdict 171 ms after the click
ok   home: $80 is blocked with the reason
ok   protect: worst case shown before creating
ok   activity: vault holds $100.00
ok   activity: $4 is paid
ok   activity: $80 is blocked
ok   activity: a repeated request is blocked
ok   activity: the agent cannot change the rules
ok   activity: paused blocks the next payment
ok   activity: reload restores the vault
ok   /how-it-works renders
ok   /developers renders
live check passed against https://hardstop-omega.vercel.app
```

The very first request after deployment took about 10 s to reach a verdict
(cold cache); the figures above are from the second run. Screenshots:
`qa/screenshots/live/`. These timings are for a simulation in the visitor's
browser, not for a transaction on a public chain.

**Frontend rebuilt (commit 88ac30d) and redeployed.** Dark, serif-and-gold
direction requested by the owner, with xade.xyz as visual reference; no
assets, copy or code from it are used. After the rebuild, run by the main
session:

```
$ npx tsc --noEmit        -> clean
$ npm run lint            -> clean
$ npm test                -> 20 passed
$ npm run e2e             -> first run: 42 passed, 1 failed, 8 did not run
                             (axe colour-contrast on a PAID label sampled
                             while the receipt was still fading in)
                          -> after removing the fade: 51 passed (3.5m)
$ node e2e/live-check.mjs https://hardstop-omega.vercel.app
                          -> live check passed; page loaded 259 ms, first
                             verdict 315 ms after the click (warm). The first
                             request after each deployment took about 10 s.
```

Vercel had also been starting a build from the repository root on every
push, which failed because the app lives in `web/`; those never replaced the
live site. `vercel.json` at the root now turns Git-triggered builds off, and
deployment is done with `npx vercel deploy --prod` from `web/`.
