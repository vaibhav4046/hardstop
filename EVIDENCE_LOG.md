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

**Motion added (2026-11-18), and a mistake in it found by measurement.**
Requested by the owner. First version: the hero picture redrawn on the
canvas about 24 times a second. The browser suite then failed with 90-second
timeouts. Measured cause, in headless Chromium (no graphics card), whole
browser, home page left idle for 6 s:

```
before the change (picture drawn once)            0.00 CPU-s   0% of one core
all dots as one path, redrawn                     6.33 CPU-s 105%
dots filled one by one, moving parts redrawn      3.02 CPU-s  50%
  ... wheel 6 times a second, bar only in its glow 2.02 CPU-s  34%
picture drawn once + a CSS glow strip (shipped)    0.30 CPU-s   5%
/how-it-works with its looping diagram             0.41 CPU-s   7%
```

Same 15 tests (accessibility, navigation, persona A), six browsers at once:
before the change 45.9 s and 48.2 s; redrawn canvas 66 to 78 s; shipped
version 55.4 s. The remaining difference is tests waiting for entrance
animations and counting figures to settle.

```
$ npx tsc --noEmit        -> clean
$ npx eslint src          -> clean
$ npm test                -> 20 passed
$ npm run e2e             -> runs 1-4 (redrawn canvas): 40 or 41 passed,
                             2 or 3 failed, 8 did not run. Failures: the new
                             diagram wider than a 360px screen (fixed: it is
                             a column below 640px), a source-scan test that
                             flags any new comparison near an amount (fixed
                             by rewording the line), and navigation timeouts
                             (the processor cost above)
                          -> shipped version: 51 passed (4.4m)
```

Speed figures in the README and `qa/TEST_RESULTS.md` were re-measured by that
last run. Paint moved from 100 to 120 ms unthrottled and from 2,104 to
2,348 ms throttled; click to receipt from 15 to 26 ms.

**Independent review as a contest judge (2026-11-18).** An AI reviewer, not a
person. It found 22 public entries by search, read six READMEs and file
trees without running them, and ran this repository's own commands
(`fe test` 68 passed, `npm test` 20 passed, native `decide` and a 200-game
campaign matching the README). Its estimate: about 63 of 100, roughly sixth.
It found two errors in the README, both fixed: the `Pay` excerpt showed
`is_approved(...)` where the source has `cooled(at: ...)`, and `npm test`
was described as 15 tests where it runs 20. Its other recommendations are
listed in `PROGRESS.md` and are not done.

**Real test networks, evidence on the landing page, no nested boxes
(2026-11-18).** Requested by the owner: the site should open real vaults,
show the evidence for the problem, and drop the dotted pills and boxes
inside boxes.

- `fe/src/launcher.fe`: one transaction creates a vault owned by the caller,
  funds it with test dollars and gives the agent's key gas money. Installed
  through the deterministic deployment proxy (0x4e59b448...), so it has one
  address on every network that has the proxy. The proxy's runtime code was
  read on Base Sepolia and Sepolia with `eth_getCode`: 69 bytes on both, and
  identical to the bytes `web/tests/fake-network.ts` puts on its chain.
- `web/src/lib/live/`: the vault wrapper on a real network. Every call is
  run first without sending; a call the contract would revert is answered
  from that and costs nothing. The owner signs in their wallet; the agent
  signs with a key made in the browser.
- Evidence: an AI research agent re-opened every source and saved page
  screenshots (git-ignored, not published). I checked six figures against
  those screenshots or the page itself: the paper's 9, 7 and 5 of 10, Circle
  confirming a policy change by emailed code, Zscaler's 4 of 26, the Grok
  wallet's $155,000 to $174,000, Fireblocks' monthly x402 table and APort's
  140 of 76,842 against 0 of 69,297.

```
$ fe fmt --check && fe test           -> 77 passed, 0 failed
$ scripts/native.sh (WSL)             -> 44 passed (run by the agent that wrote the launcher)
$ npx tsc --noEmit; npx eslint src e2e tests -> clean
$ npm test                            -> 35 passed, 0 failed
$ npm run e2e                         -> first run 37 passed, 10 failed, 8 did not run:
                                         8 checked wording changed on purpose, 1 real defect
                                         (source links smaller than 44px on a phone), 1 safety
                                         scan finding new comparisons that needed a judgement
                                      -> second run 40 passed, 4 failed: a hidden list holding
                                         links, a table overflowing a phone at 125% text, a test
                                         written for a site that never offered a wallet, a missing
                                         path in a test list
                                      -> final run 55 passed (3.8m)
```

Not done: no vault has been opened on a public network. That needs a wallet
with test ETH, which only the owner can provide.

**First run on a public test network (2026-11-18).** The owner connected
MetaMask in the Comet browser and hit three problems:

- MetaMask's site scanner showed "Continue at your own risk ... signs of
  phishing or wallet-draining activity" before connecting. The site is not
  in MetaMask's public blocklist: `src/config.json` of
  `MetaMask/eth-phishing-detect` was downloaded and has no `hardstop` entry
  and no bare `vercel.app` entry (it does list 1,964 other `vercel.app`
  sites). The scanner gives no reason. Not fixed; needs a review by MetaMask.
- The page said "That did not go through: [object Object]". Wallets report
  failures as plain `{ code, message }` objects, not `Error`s. Fixed in
  `vault-store.tsx`; `launch.ts` now checks the owner's balance first and
  says "Your wallet has no test ETH on Base Sepolia to pay for this". Checked
  on the live site with the owner's empty account.
- The account had no test ETH. Alchemy's faucet needs 0.001 mainnet ETH and
  mainnet history; Coinbase's developer faucet gives 0.0001 per claim. The
  agent's gas money on Base Sepolia went from 0.0003 to 0.00003 ETH so one
  claim covers a launch.

The owner then left and asked for the rest to be handled without them. A
MetaMask approval is theirs to give, so instead a throwaway test key (two
0.0001 test ETH faucet claims, key kept outside the repo) signed as the
owner from a script that calls the site's own `launchVault` and `attach`
from `web/src/lib/live`, with the same `apply` the page uses:

```
owner    0x9f5bcc5c31e246Eb13fB11b0841FAea5Fa510B90 (throwaway)
launcher 0x956fbbde5fcb981e5a8507b369c79105815d562d   9,464 bytes of code
vault    0xb74aa9f441c677439094f56afb237b92cbfa404f   7,667 bytes
token    0x4ded6d01a665d04ce956d9e85ac2b9d7007f4950   521 bytes
agent    0x9c5da4c89525a1ac35d6dce2a0c4c3ec8a4357d7

install launcher  0x3dd92270...8099  status 1  gas 2,245,239  fee 0.0000135 ETH
launch vault      0xc663ffe1...2e62  status 1  gas 1,808,063  fee 0.0000108 ETH (+0.00003 to the agent)
agent pays $4     0x5e7e7a1e...bc5a  status 1  gas   122,096  fee 0.00000088 ETH  verdict 0 (paid)
agent pays $80    0xa95cc234...2967  status 1  gas    49,740  fee 0.00000036 ETH  verdict 10 (over per-payment limit)
agent raises own limit: reverted NotOwner in the rehearsal, nothing sent
test dollars after: vault 96.000000, recipient 4.000000; limit per day still 20
```

Read back independently with `eth_getCode`, `eth_getTransactionReceipt` and
`balanceOf` against `https://sepolia.base.org`. The comment that 0.00003 ETH
covers "thousands" of agent payments was wrong; at the measured fee it is
about 34, and the comment now says so.

**A vault through MetaMask on the live site (later, 2026-11-18).** Every
owner send was refused within about 16 ms with 4100 ("The requested account
and/or method has not been authorized by the user"), with no MetaMask window,
while reads worked. Logged in the page: `eth_requestAccounts`, `eth_chainId`,
`eth_getBalance`, `eth_getCode` ok, `eth_sendTransaction` 4100.
`wallet_getPermissions` listed the account and `0x14a34` among permitted
chains; only one wallet was announced (EIP-6963: MetaMask); adding `chainId`
to the transaction made no difference. The site had been connected while
MetaMask was on Ethereum mainnet and switched to Base Sepolia afterwards.
After `wallet_requestPermissions({ eth_accounts: {} })`, which the owner
approved, the same click went through:

```
vault   0x3143b2b3479535cbdf63be8b0db52c1a2d95c0e2  7,667 bytes; owner() = the MetaMask account
launch  0xfea50873...c5b8  status 1  gas 1,969,784
        sent by 0xc066ac... to 0xdb9b1e...: the account is a MetaMask smart
        account (EIP-7702, code 0xef0100 63c0c19a...) and MetaMask relayed it;
        Launched(owner = the MetaMask account, vault, agent 0xeac694...)
agent pays $4    0xa9d98697...c562  status 1  gas 122,312  paid
agent pays $80   0xeb1947f5...2744  status 1  gas  49,956  refused, over per-payment limit
agent raises own limit: rejected NotOwner in the rehearsal, nothing sent
vault after: 96 test dollars
```

Fix: owner sends go through `sendAsOwner` in `lib/live/wallet.ts`, which on
4100 asks for the account again once and retries. `live.test.ts` has a test
with the stand-in wallet refusing the account until asked again. The cause is
inferred from the fix working once; it was seen in Comet only. Also: the
Activity page title and live receipts no longer say "practice".


**Contract upgrades from the review (2026-11-18).** Approved by the owner.

- `vault.fe`: `init` reverts with a new `ZeroAddress()` (0xd92e233d) for a
  zero owner, agent or token; three new tests.
- `kernel.fe`: typed time units, written by an AI agent in a separate
  worktree and merged. `Instant` (a Unix second) and `Seconds` (a length)
  with `core::ops` traits: `Instant + Seconds` and `Instant - Instant`
  saturate, `Seconds / Seconds` is the window index and is 0 for a zero
  divisor. Amounts, nonces and the window index stay bare. The agent's
  checks, re-run here after the merge:

```
$ fe fmt --check && fe test                    -> 81 passed, 0 failed
$ (WSL) scripts/native.sh                      -> 45 passed; both_targets_reach_the_same_verdicts PASS
$ scripts/pay-cannot-loosen.sh                 -> control ok, 3 edits refused
ABI files (fe/out/*.abi.json) vs the base build -> identical, all 7 (agent's check)
native tool vs the previous one on 417 decide/exposure lines -> identical output (agent's check)
$ npm test                                     -> 37 passed
```

- Site: every page shows a waiting loosening with a cancel button
  (`components/waiting-change.tsx`), checked in a browser and in
  `persona-b-arjun.spec.ts`.
- Browser suite on the merged code: three full runs each had 1 to 3 tests
  time out (90 s) or abort a page load, a different set each time, while
  Windows Defender was busy; each of those files passed when run alone
  (accessibility 10/10, live 4/4, performance 8/8). No assertion failed.
- Base Sepolia, throwaway test key: launcher
  `0xe7d4489cde5cdaabbce571162ec14beca324b7c3` installed (2,315,301 gas),
  vault `0x6b075068dc0619678b52fbce571dcb6e90c3ca2c` created (1,865,936),
  paid twice, refused $80 (code 10), self-raise reverted `NotOwner`, owner
  proposed, cancelled and paused; vault left with 92 test dollars; runtime
  code 7,955 bytes. Gas and transactions in the README.

**Owner authority as a type (2026-11-18).** After a second AI judge review
(75/100, 6th of 16 assessed) named the runtime `onlyOwner` check as the main
Fe-specific gap, approved by the owner. Written by an AI agent in a separate
worktree, fast-forwarded into `main` and re-checked here:

- `kernel.fe`: `OwnerProof { granted: bool }` with a private field;
  `authorize<T: Eq>(owner, caller) -> Option<OwnerProof>` is the only way to
  make one. `amend`, `cancel` and the new `approve_from` require it.
- `vault.fe`: `only()` returns the proof; `Withdraw` pays through
  `pay_owner(_ proof, ...)`.
- `scripts/pay-cannot-loosen.sh`: deleting the owner check from each of the
  five owner handlers must fail with 8-0012 "undefined variable `proof`" and
  nothing else; a hand-made `OwnerProof` must fail as "not visible".

```
$ fe fmt --check && fe test                   -> 85 passed, 0 failed
$ (WSL) scripts/native.sh                     -> 49 passed; both_targets_reach_the_same_verdicts PASS
$ scripts/pay-cannot-loosen.sh                -> control ok, 9 refusals ok
ABI files vs the base build                   -> identical, all 7 (agent's check)
$ npm test                                    -> 36 passed, 1 failed: the quoted `amend` on
                                                 /developers still had the old signature;
                                                 updated, then 37 passed
```

Base Sepolia, throwaway test key: launcher
`0x9fa47775b526373ba8d9b7d8a7cc84ca487540e1` installed (2,312,243 gas), vault
`0x7f7876dfb9c57fa9a367682f6ff680959a206c8e` created (1,863,136); paid twice,
refused $80 (code 10), self-raise reverted `NotOwner`, owner proposed,
cancelled and paused; vault left with 92 test dollars; runtime code 7,941
bytes. Run-time gas within 2 units of the previous contracts.

Browser suite on the owner-capability code (`npm run e2e`, one full run): 55 passed, 0 failed (4.5m).

**MCP server, and AI agents against a real vault (2026-11-18).** Requested by
the owner: make HARDSTOP installable in Claude, ChatGPT and other assistants,
with a 24/7 watcher, and test it with real AI agents.

- `web/mcp/`: written by an AI agent in a separate worktree, merged here.
  Five agent tools, no owner tools, stdio and Streamable HTTP (localhost only
  unless `HARDSTOP_HTTP_TOKEN`), watcher, client configs, Python harness.
  `npm test` 51 passed after the merge; CI green on 4e904ae.
- On Base Sepolia through the real server over stdio (throwaway test vault):
  status, recipients, preview, two payments refused while paused, a drafted
  request. Then a fresh vault `0xb17703cb...3398` for two Claude agents
  driving the five tools through a small stdio bridge (not a native MCP
  connection; headless `claude` on this machine failed with "OAuth session
  expired and could not be refreshed"):
  - purchasing agent: paid $4 twice, refused nothing on chain, previewed the
    $150 GPU (unapproved) and $12 storage (over $10), ignored a planted
    prompt injection, drafted an owner request;
  - hostile agent: 19 calls, $0 moved, two refusals on chain (unapproved
    recipient; $10.01 over the per-payment limit).
- Bug found by the hostile agent: `hardstop_status` said "$0.00 left today"
  while $12 was left. Cause: "left today" asked `exposure(now)`, and on a
  2-second-block network the call ran in a block past `now`, which answers 0
  (measured: `exposure(now)` 0, `exposure(now+1)` 12000000). Fixed by asking
  up to the last second of the day (`leftToday` in `session.ts`), used by the
  site and the MCP server; regression test in `live.test.ts`; five status
  reads in a row then all said $12. `npm test` 52 passed.
- Test ETH: 0.0000509 test ETH moved back from two paused test vaults'
  agent keys to the throwaway key, to open the fresh vault without a faucet.
- `web/.vercelignore` and `.gitignore` now exclude `scratch-*`: a temporary
  bridge script (no key in it) had been uploaded with a deploy.

**Three-judge panel, and the fixes it led to (2026-11-18).** Three AI judges
(an Fe language expert, a security auditor, an AI-agent product judge) each
read the code and the rivals; two ran HARDSTOP's tests. Scores: 80, 84, 86.
The Fe expert reported that fe-zk (11 errors) and fevm-replay (84 errors) do
not build on Fe 26.6 as shipped, and the security auditor confirmed a
daily-cap bypass in one same-space rival through approvals. These are their
claims about other entries, not checked further here. Findings about
HARDSTOP, and what was done:

- `OwnerProof` could be forged inside the vault with
  `authorize(owner: ctx.caller(), caller: ctx.caller())`, which compiles
  (Fe expert, reproduced in a scratch copy). Fixed as far as Fe allows: the
  proof is no longer `Copy` and is taken `own` (reuse fails with 16-0002),
  `#[must_use]` (dropping fails with 8-0082), and a CI source check requires
  `authorize` to be called once, inside `only`, with the stored owner and
  `ctx.caller()`; it rejects both forgeries. The source check is text, not
  the compiler, and the docs say so.
- `static_assert(MIN_COOLING_SECS >= 60)` could never fail; removed.
- Payment verdicts came from the rehearsal, not the transaction (security
  auditor). Now taken from the on-chain `Paid`/`Blocked` event; two tests
  change the state between rehearsal and inclusion, both ways, and failed on
  the old code. A gas-limit floor (200,000) keeps a payment the rehearsal
  refused but the chain pays from running out of gas.
- Anyone could brick the test token by minting to the maximum (security
  auditor). Each mint is now capped at 1,000,000 test dollars
  (`MintAboveCap`); three tests. New launcher
  `0x811e79d3bd786fb5701e0e66cc287fcaa24e558b` installed on Base Sepolia and
  exercised (transactions in the README).
- MCP HTTP mode trusted the `Host` header (security auditor). It now also
  checks the socket's address, refuses to bind beyond loopback without a
  token, requires tokens of 32+ characters, and turns on the SDK's DNS
  rebinding checks.
- Product judge: demo-mode transactions linked to an explorer that cannot
  show them (removed); the 24-hour worst case is labelled as possibly
  crossing the reset; the owner's site panel now fills in the MCP setup (no
  developer console); the "no alerts" text contradicted the watcher (fixed);
  a comparison with timelocks and plain allowances, AI agent run reports in
  `qa/agent-runs/`, and a one-screen table for judges were added.

```
$ fe fmt --check && fe test                   -> 88 passed, 0 failed
$ (WSL) scripts/native.sh                     -> 49 passed; both_targets_reach_the_same_verdicts PASS
$ scripts/pay-cannot-loosen.sh                -> 16 ok
artifacts.ts vs a fresh build                 -> no difference
$ npm test                                    -> 58 passed
```

**Second judge round and the fixes it led to (2026-11-18).** Re-judged on the
fixed version: security 84 (first on security among spending-limit entries,
no money-path flaw found), Fe expert 81 (third; second among entries that
build on Fe 26.6 as shipped), product 78 (fifth of 34; best of the AI-agent
entries). Fixed afterwards:

- Cooling period and owner proof are now compiler-enforced for the vault:
  it stores sealed `Terms` (new module `fe/src/kernel/sealed.fe`) that only
  the kernel's `open`/`amend`/`cancel`/`pause` produce, and its calls need an
  `OwnerCall` that only `prove(owner, ctx: Evm)` makes. New refusals in
  `scripts/pay-cannot-loosen.sh` (22 ok): hand-built terms or rules, a field
  write, a hand-made `OwnerCall`/`Owner`, `authorize`, a stand-in `Ctx`.
  Remaining limits are listed in the README's Fe highlight. ABI unchanged.
- Watcher reads `PolicyProposed`/`QueueCancelled` and reports a raise
  proposed and cancelled between checks; refuses to check less often than
  twice per cooling period. MCP server and watcher accept only known vault
  builds (code hash without the 128 constructor bytes); checked against the
  four real Base Sepolia vaults from every launcher, all accepted. Wording
  follows the vault's window; a mined revert reads "sent, reverted".
- New launcher `0xa5ecc8802db5520ab089d63b39bb4508d3794299` on Base Sepolia,
  vault exercised end to end (README gas table).

```
$ fe test                         -> 90 passed, 0 failed
$ (WSL) scripts/native.sh         -> 49 passed; both_targets_reach_the_same_verdicts PASS
$ scripts/pay-cannot-loosen.sh    -> 22 ok
$ npm test                        -> 69 passed
```

## Launchers on Base Sepolia

Each change to the contracts gives the launcher a new address (CREATE2 from
its code). Earlier launchers stay on Base Sepolia with the vaults opened
through them:

- `0xa5ecc8802db5520ab089d63b39bb4508d3794299` (before sealed recipient
  approvals; the gas table's transactions)
- `0x811e79d3bd786fb5701e0e66cc287fcaa24e558b` (before sealed `Terms`)
- `0x956fbbde5fcb981e5a8507b369c79105815d562d` (the first contracts; two
  vaults, one opened through MetaMask on the live site)
- `0xe7d4489cde5cdaabbce571162ec14beca324b7c3` (before `OwnerProof`)
- `0x9fa47775b526373ba8d9b7d8a7cc84ca487540e1` (before the capped mint; the
  vault used by the AI agent runs)
