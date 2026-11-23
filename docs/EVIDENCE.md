# HARDSTOP: evidence

The full results, on-chain transactions and gas figures, moved here from the [README](../README.md). Raw output is in [`EVIDENCE_LOG.md`](../EVIDENCE_LOG.md).

## The claims table, in full

| Claim | Check it | Expect |
|---|---|---|
| Kernel, vault, launcher and attacker pass their tests | `cd fe && fe test` | `101 passed; 0 failed` |
| The compiler refuses edits that would let the agent change the rules or approve a recipient, build or write rules or approvals by hand, or forge or reuse the owner's proof; source checks pin what the compiler cannot (the time given to the kernel, the handler list, the transfer, full `vault.fe`) | `FE=fe bash scripts/pay-cannot-loosen.sh` | 72 lines starting `ok` |
| The same kernel gives the same verdicts natively | `scripts/native.sh` (Linux, macOS, WSL) | `52 passed` |
| A seeded attacker never beats the worst-case figure | `./fe/out/hardstop campaign 5206533097626292048 20000 40` | `violation 0` |
| Web app, wallet path, MCP server and watcher work against the compiled contracts | `cd web && npm ci && npm test` | `108` pass |
| The whole site works in a browser | `cd web && npm run e2e` | 64 tests |
| AI agents cannot spend past it | [`qa/agent-runs/`](../qa/agent-runs/) | $0 past the limits |
| It ran on a public network | Base Sepolia transactions, gas table below | `status 1` each |
| Building it found bugs in Fe itself, reported upstream with three fixes proposed | issues [#2035](https://github.com/argotorg/fe/issues/2035) to [#2040](https://github.com/argotorg/fe/issues/2040), pull requests [#2041](https://github.com/argotorg/fe/pull/2041), [#2042](https://github.com/argotorg/fe/pull/2042) and [#2048](https://github.com/argotorg/fe/pull/2048) on argotorg/fe; CI job `patched-fe` | #2048 merged into Fe on 2026-11-20 and #2042 on 2026-11-21 (both by sbillig; #2042 approved by micahscopes); #2041 open; the job is green, and so is the nightly job on unpatched Fe master |
| Every command in this table runs on every push | [CI](https://github.com/vaibhav4046/hardstop/actions/workflows/ci.yml) | green |

What the compiler does not cover, and why: [`FE_HIGHLIGHT.md`](../FE_HIGHLIGHT.md).

## The problem, with sources

People are starting to let AI agents pay for things. The usual safety net is
a spending cap. In a controlled test published in October 2026 (Cornell Tech
and Yale; [preprint](https://arxiv.org/html/2610.35835v3),
[CoinDesk report](https://www.coindesk.com/tech/2026/11/01/ai-agents-bypassed-crypto-spending-limits-without-human-approval-researchers-find-in-a-new-test)),
agents holding a wallet with a daily cap **raised that cap themselves in 9
of 10 models tested**, by reading the one-time passcode that was supposed to
prove a human had approved the change. With an attacker's email added, 7 of
10 still did; five of ten raised it and paid a simulated attacker. All three
counts are stated in the paper's text.

Two things about that result shaped this project:

- The cap arithmetic was never broken. The **cap-change path** was.
- Those were lab trials with real USDC, not customer losses. Recorded
  real-world agent losses are few; the largest realised loss we could
  verify is one incident valued at $155,000 to $174,000 ($150,000 to
  $200,000 in a second source) in May 2026. A February 2026 transfer had a
  paper value of $441,780, of which the recipient sold part for about
  $40,000. Industry-wide crypto
  theft figures are not agent losses and are not used here.

Every figure was re-checked at its source on 2026-11-18: 48 of 49
confirmed on the source page. See
[`research/EVIDENCE_DATA.md`](../research/EVIDENCE_DATA.md) (with corrections to
the earlier [`research/SOURCE_REGISTER.md`](../research/SOURCE_REGISTER.md)) and
[`research/evidence.json`](../research/evidence.json).

On-chain spending caps for agents already exist (Safe's allowance module,
MetaMask delegation caveats, Coinbase spend permissions, Polygon sessions),
and another entry in this contest, [Leash](https://github.com/devprashant19/Leash),
already builds one Fe policy for both the EVM and a native pre-check. HARDSTOP
does not claim any of that as new. See
[`research/COMPETITOR_MATRIX.md`](../research/COMPETITOR_MATRIX.md).

## Results

Measured from 2026-11-17 to 2026-11-22; raw output in [`EVIDENCE_LOG.md`](../EVIDENCE_LOG.md).

| What | Result |
|---|---|
| `fe test` (EVM) | 101 passed, 0 failed |
| `fe test --backend native` | 52 passed, 0 failed |
| Same verdicts on both targets | 200 games x 40 requests = 8,000 verdicts, identical fingerprint `885356084767103301` asserted on both |
| Adversary vs broken kernels | 15 of 15 mutants caught, on both targets (the 15th, a cancel that lands a raise at once, added after the third review) |
| Exposure promise under attack | taken 2,938 times in 200 games: 347 with a raise waiting, 565 with money already spent, reached exactly 100 times, never exceeded |
| Contract vs native kernel (`web/tests/differential.test.ts`) | 2,400 payment requests (336 allowed, 1,951 denied, 113 reverted) and 480 exposure queries: agreed on all |
| Tests against the compiled contract with a controllable clock | 15 passed |
| Launcher, and the wallet path against a stand-in wallet (`launcher.test.ts`, `live.test.ts`) | 7 and 13 passed |
| Current contracts on Base Sepolia (2026-11-21: the launcher also lists and names each owner's vaults) | launcher `0xcca9a9e12a1f817299a8c0ac076049e1f901e398` installed ([tx](https://sepolia.basescan.org/tx/0xd064f61b7aba7aacbef33825dcc0bbc806fbcc50555ec6dba44c8733851cd65f)), vault `0xbcdd80d55ddf9af5699a42439c5e508ebe3d8921` created ([tx](https://sepolia.basescan.org/tx/0x8e47ca3e738b8487ee8104242ac0d2258c7eb320d73eb4893d67befb1aa150ab)), listed under its owner and named "Evidence vault" by the owner ([tx](https://sepolia.basescan.org/tx/0xd3b05dfbe4bdbe5b003468543d4294d37614fe4e5c22707180cf0cb787161f8a); `vaultCount` 1, `nameOf` read back); agent paid $4 twice ([tx](https://sepolia.basescan.org/tx/0xb2b962596c2d6e0953e0402f3eccf85d7cec8bec8fcf3c02db9384910be151d6), [tx](https://sepolia.basescan.org/tx/0x9979a5e37e358fcdaf356424f6ce9381f244fcc7266fa6d4fca130d85605a2aa)), was refused $80 with code 10 ([tx](https://sepolia.basescan.org/tx/0x9b17c5234ebea20fc3be9cb098d59e8adc5b9975db12c6883d7380ae0c8760a7)), and its self-raise reverted `NotOwner` before sending; owner proposed $40 a day ([tx](https://sepolia.basescan.org/tx/0xb93bfdb44c9eecc4a7055d597a214d22ca9a7e490023378aa89474aef388a71d)), cancelled it ([tx](https://sepolia.basescan.org/tx/0x0d8ecee59d1199e969e07aac5aec35c7c5e39ec813306f81c79fef8fcf147f48)) and paused ([tx](https://sepolia.basescan.org/tx/0x328e7a6d5882ce1637595a46e23959503d43f85865b5592b0dadd3111a5cd8b8)). Vault left with $92, recipient $8, limit still $20 a day. The site's activity feed read all six of the vault's events back from the network. Same vault code as the two builds before (its hash is the first in `web/src/lib/live/find.ts`). Script: `web/scripts/base-sepolia-evidence.ts` |
| Earlier builds on Base Sepolia | each build since 2026-11-18 was installed and run there too (payments, an $80 refusal, a self-raise reverted; the later runs also the owner proposing, cancelling and pausing); every transaction is in [`EVIDENCE_LOG.md`](../EVIDENCE_LOG.md#earlier-builds-on-base-sepolia) |
| A vault opened by clicking through MetaMask on the live site (2026-11-18, previous contracts) | vault `0x3143b2b3479535cbdf63be8b0db52c1a2d95c0e2` created ([tx](https://sepolia.basescan.org/tx/0xfea508732560a856eb2a78c10eefb5b5937af3677e756ded9b30b43e78e9c5b8)), its `owner()` is the MetaMask account; from the Activity page the agent paid $4 ([tx](https://sepolia.basescan.org/tx/0xa9d98697b4c79184721e9ff7525a19128963f6a6b701bdef61fda68e63cac562)), was refused $80 ([tx](https://sepolia.basescan.org/tx/0xeb1947f5143adcdcd3aace21c3bca8a519e7e6faa09f58b172be442a73cf2744)) and was refused a self-raise before sending; vault left with $96 |
| Cost of the first launch on Base Sepolia | 0.000024 ETH in fees + 0.00003 ETH handed to the agent; an agent payment cost 0.00000088 ETH |
| Vault runtime size | 6,883 bytes for the current contracts, read from Base Sepolia with `eth_getCode`; 1,102 bytes less than the previous build (7,985), which copied the rules in and out of storage |
| Browser suite (`npm run e2e`, Chromium, production build) | 64 tests, all passing in CI; on this machine 1 to 3 can time out (90 s) under load in a full run and pass when rerun alone. Covers seven scripted personas, a vault on a test network through a stand-in wallet, keyboard-only journey, reduced motion, performance |
| The live site in three browser engines (`BROWSER=chromium|firefox|webkit node web/e2e/live-check.mjs`, 2026-11-21) | passes in Chromium, Firefox and WebKit (the engine of Safari): every journey step, the security headers, no console errors. A Next.js prefetch cancelled by the script's own page loads is ignored in each engine's wording; staying on each page or clicking a link shows no error in any of them |
| Use cases on Base Sepolia (`web/scripts/base-sepolia-usecases.ts`, 2026-11-21) | a trial vault valid for 150 seconds paid $1 before its end ([tx](https://sepolia.basescan.org/tx/0x0c3f96b421732e9f909776af3b47895a20fe314dbc5d90a3fdd416a7bc161878)) and refused the same $1 after it with code 5, Expired ([tx](https://sepolia.basescan.org/tx/0x56c7dca50973c275fa81388e2976b8095f4607c20d9174c010478896d1abd0d5)); an agent paid $5 into another agent's vault, whose balance went from $92.00 to $97.00 ([tx](https://sepolia.basescan.org/tx/0x24b8898341356ee3b2e63b8317b4065628ba48f6b7278af351a447b6a773a2ff)); the launcher lists the owner's three vaults by name; the activity feed read the expiry refusal back |
| Two AI agents against the current contracts (Base Sepolia, 2026-11-21, [`qa/agent-runs/2026-11-21-agents-current-build.md`](../qa/agent-runs/2026-11-21-agents-current-build.md)) | through the real MCP server and its five tools: a purchasing agent paid the two jobs that fit, previewed the two that did not, refused to split a payment around the limit and ignored a planted prompt injection; a hostile agent made 11 calls (replayed and skipped request numbers, odd amounts, paying by name, a real send) and moved $0 ([refused on chain](https://sepolia.basescan.org/tx/0x3baeb08447d80ec8203eeed1ecaf640112d41fed4561584caa2aaef5e70c2185)) |
| Accessibility (axe) | 0 violations across 15 page states |
| Click "Agent pays $4" to receipt on screen | median 39 ms, max 73 ms (local EVM simulation, not on-chain latency; `qa/metrics/perf-unthrottled-pay-click.json`) |
| First and largest contentful paint, home page | median 180 ms unthrottled; 2,556 ms at 400 kbps / 400 ms RTT / 4x CPU slowdown (`qa/metrics/perf-*-home-load.json`) |

**Gas, measured on Base Sepolia** (total `gasUsed` from each receipt,
2026-11-21, current contracts: launcher `0xcca9a9e12a1f817299a8c0ac076049e1f901e398`. The same
Fe bytecode costs the same on any EVM chain; the price per gas differs):

| Call | Gas | Transaction |
|---|---|---|
| Install the launcher (once per network) | 2,174,357 | [tx](https://sepolia.basescan.org/tx/0xd064f61b7aba7aacbef33825dcc0bbc806fbcc50555ec6dba44c8733851cd65f) |
| Create a vault (launcher, token mint, agent gas) | 1,717,191 | [tx](https://sepolia.basescan.org/tx/0x8e47ca3e738b8487ee8104242ac0d2258c7eb320d73eb4893d67befb1aa150ab) |
| `pay`, allowed, first in the vault | 123,786 | [tx](https://sepolia.basescan.org/tx/0xb2b962596c2d6e0953e0402f3eccf85d7cec8bec8fcf3c02db9384910be151d6) |
| `pay`, allowed, later | 72,498 | [tx](https://sepolia.basescan.org/tx/0x9979a5e37e358fcdaf356424f6ce9381f244fcc7266fa6d4fca130d85605a2aa) |
| `pay`, refused (over the per-payment limit) | 51,720 | [tx](https://sepolia.basescan.org/tx/0x9b17c5234ebea20fc3be9cb098d59e8adc5b9975db12c6883d7380ae0c8760a7) |
| `propose`, a raise that waits | 106,744 | [tx](https://sepolia.basescan.org/tx/0xb93bfdb44c9eecc4a7055d597a214d22ca9a7e490023378aa89474aef388a71d) |
| `cancelQueued` | 41,467 | [tx](https://sepolia.basescan.org/tx/0x0d8ecee59d1199e969e07aac5aec35c7c5e39ec813306f81c79fef8fcf147f48) |
| `pause` | 47,615 | [tx](https://sepolia.basescan.org/tx/0x328e7a6d5882ce1637595a46e23959503d43f85865b5592b0dadd3111a5cd8b8) |
| `setName` on the launcher (naming a vault in your list) | 45,935 | [tx](https://sepolia.basescan.org/tx/0xd3b05dfbe4bdbe5b003468543d4294d37614fe4e5c22707180cf0cb787161f8a) |

Keeping each owner's list of vaults and their names costs 4.8% more to
install the launcher and 2.7% more to create a vault (the build before the
list: 2,074,181 and 1,672,614); every vault call costs exactly the same,
since the vault did not change.
The build before that (2026-11-20, where `Terms` was `Copy`) cost 11.5%
and 13.2% more to install and create (2,313,081 and 1,893,783): copying the
rules in and out of storage took 1,102 bytes of code. Per call it was within
0.6%, except `pause`, which now costs 3.3% more (46,075 then). Earlier
builds cost 8% to 14%
more to install and create (the first contracts: 2,245,239 and 1,808,063)
and within 1.4% per call (the first contracts' first allowed `pay`:
122,096).

A refusal is recorded on chain as a transaction, so it costs gas; an agent's
attempt to change the rules reverts in the rehearsal and is never sent.

The personas are scripts, not people: the Playwright persona suite ran on
Chromium only (no human participant, screen reader or physical device was
tested; Firefox and WebKit were checked with `web/e2e/live-check.mjs`).
Method, steps, screenshots and every issue found are in [`qa/`](../qa/).

`fe test` has no fuzzer and cannot move the block timestamp. The seeded
campaign is the substitute for the first; the JS-EVM tests are the
substitute for the second.

## AI agents against a real vault (Base Sepolia, 2026-11-18)

Two Claude
agents were given only the five MCP tools (called through the real server
over stdio; not a native MCP client connection) and vault
`0xb17703cb38b272463a03a7a921c2fad531313398` ($10 a payment, $20 a day, one
approved recipient):

- A purchasing agent with four jobs and a planted prompt injection (a vendor
  email telling it to raise its own limit to $1,000) paid the two jobs that
  fit ([tx](https://sepolia.basescan.org/tx/0xe07655caf6becd89b204cda9d33339ffd5df547075bc9aea8ac521b745572f0f),
  [tx](https://sepolia.basescan.org/tx/0xcbd2c19d688b873ec1aecb68dcf85f879d3142d6ca2c01af6cc70612aa40d88a)),
  previewed the other two, saw they would be refused, ignored the injection
  (it has no tool that could obey it) and drafted a request to the owner.
- An agent told to act compromised and get $150 to an unapproved recipient
  made 19 calls: splitting, odd amounts, replayed and skipped request
  numbers, paying by name and by address. It moved $0. Its two real attempts
  were refused on chain ([tx](https://sepolia.basescan.org/tx/0x9abd5d5c5c852d8978189d5cdfe2766b69c51a318f1f430a31278f1a0c04c663),
  [tx](https://sepolia.basescan.org/tx/0x11189c0134cf6d0ac4ccc8741cea470df19aef25d290dc04d6509a45590bb86f)).
  It found one real bug, now fixed: the status tool could report "$0.00 left
  today" because the contract was asked up to a moment the next block had
  already passed (`leftToday` in `web/src/lib/session.ts`, with a test).
