# HARDSTOP

**Pitch:** HARDSTOP is a spending firewall for AI agents: the owner's limits
are enforced by a Fe contract the agent cannot talk its way past, raising a
limit takes a waiting period that the owner can cancel, and the worst-case
loss is a number you can read before anything goes wrong.

**Demo video (2 min, narrated, with music and captions):** [watch in the browser](https://hardstop-omega.vercel.app/demo/hardstop-demo.mp4)
(also in the repo: [`web/public/demo/hardstop-demo.mp4`](web/public/demo/hardstop-demo.mp4)).
The narration is a synthetic voice (Kokoro, generated on the builder's machine); the screen recordings in it are the live site.
A silent walkthrough (1 min 47 s, recorded 2026-11-19; the test counts on screen are from that day, the current ones are in the table below) with the test output and on-chain receipts:
[watch](https://hardstop-omega.vercel.app/demo/hardstop-walkthrough.mp4)
([`web/public/demo/hardstop-walkthrough.mp4`](web/public/demo/hardstop-walkthrough.mp4)).

[![HARDSTOP demo video: the vault door, the lab test, the live site, an AI agent refused, the Fe compiler refusal, and a Base Sepolia receipt](web/public/demo/hardstop-demo.jpg)](https://hardstop-omega.vercel.app/demo/hardstop-demo.mp4)

Fe Builders Challenge 2026 entry. Fe `26.6.0 (5b3f96a)`. MIT.

> Unaudited contest prototype. Do not put real money in it.

## For judges: one screen

| Claim | Check it | Expect |
|---|---|---|
| Kernel, vault, launcher and attacker pass their tests | `cd fe && fe test` | `98 passed; 0 failed` |
| The compiler refuses edits that would let the agent change the rules or approve a recipient, build or write rules or approvals by hand, or forge or reuse the owner's proof; source checks pin what the compiler cannot (the time given to the kernel, the handler list, the transfer) | `FE=fe bash scripts/pay-cannot-loosen.sh` | 58 lines starting `ok` |
| The same kernel gives the same verdicts natively | `scripts/native.sh` (Linux, macOS, WSL) | `52 passed` |
| A seeded attacker never beats the worst-case figure | `./fe/out/hardstop campaign 5206533097626292048 20000 40` | `violation 0` |
| Web app, wallet path, MCP server and watcher work against the compiled contracts | `cd web && npm ci && npm test` | `89` pass |
| The whole site works in a browser | `cd web && npm run e2e` | 61 tests |
| AI agents cannot spend past it | [`qa/agent-runs/`](qa/agent-runs/) | $0 past the limits |
| It ran on a public network | Base Sepolia transactions, gas table below | `status 1` each |
| Building it found bugs in Fe itself, reported upstream with three fixes proposed | issues [#2035](https://github.com/argotorg/fe/issues/2035) to [#2040](https://github.com/argotorg/fe/issues/2040), pull requests [#2041](https://github.com/argotorg/fe/pull/2041), [#2042](https://github.com/argotorg/fe/pull/2042) and [#2048](https://github.com/argotorg/fe/pull/2048) on argotorg/fe; CI job `patched-fe` | #2048 merged into Fe on 2026-11-20 and #2042 on 2026-11-21 (both by sbillig; #2042 approved by micahscopes); #2041 open; the job is green, and so is the nightly job on unpatched Fe master |
| Every command in this table runs on every push | [CI](https://github.com/vaibhav4046/hardstop/actions/workflows/ci.yml) | green |

What the compiler does not cover, and why: [`FE_HIGHLIGHT.md`](FE_HIGHLIGHT.md).

## The problem

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

Every figure on the site was re-opened at its source on 2026-11-18: 49
figures from 35 source pages, 48 confirmed on the source's page (the
site's evidence page cites 12 of those sources), kept apart as controlled tests, recorded
incidents, adoption signals and excluded figures. See
[`research/EVIDENCE_DATA.md`](research/EVIDENCE_DATA.md) (with corrections to
the earlier [`research/SOURCE_REGISTER.md`](research/SOURCE_REGISTER.md)) and
[`research/evidence.json`](research/evidence.json).

On-chain spending caps for agents already exist (Safe's allowance module,
MetaMask delegation caveats, Coinbase spend permissions, Polygon sessions),
and another entry in this contest, [Leash](https://github.com/devprashant19/Leash),
already builds one Fe policy for both the EVM and a native pre-check. HARDSTOP
does not claim any of that as new. See
[`research/COMPETITOR_MATRIX.md`](research/COMPETITOR_MATRIX.md).

## Approach

Three things, all in Fe, all built during the contest window.

**1. A ratchet.** Tightening a rule is instant. Loosening one (a higher cap,
a later expiry, a new recipient, resuming after a pause) is queued, takes
effect only after a cooling period fixed when the vault is created, and can
be cancelled until then. Any later tightening of the rules cancels a queued
loosening of them; a recipient still in its cooling period stays pending
until the owner removes it (a pause does not stop it either). An
approval obtained by trickery stops being an instant loss and becomes a
pending change the owner can see.

**2. A worst-case number.** `exposure(rules, ledger, now, until)` is a pure
function returning the most the agent can move between two moments: an upper
bound, which a greedy agent reaches when nothing is queued, a recipient is
approved, request numbers are left and the vault holds that much.
While `until` is inside the cooling period it holds whatever the owner signs
in the meantime. The vault exposes it as a view, the native tool computes it
offline, and the app shows it as "worst case in the next 24 hours".

**3. An attacker written in Fe.** `adversary.fe` plays seeded hostile games
against the kernel: over the cap, one unit over, replayed, from a stranger,
to an unapproved recipient, zero, enormous, with time jumping around window
edges and the owner amending the rules mid-game. Every verdict is checked
against a second statement of the rules that shares no code with the kernel
(written separately, though by the same author and AI) and against
the exposure bound, which it re-takes many times per game. The same
campaign is pointed at fifteen deliberately broken kernels and must catch
each one.

The kernel and the adversary have no `#[cfg]` and no `uses` clause, so they
compile for the EVM and natively from one source and cannot perform effects
on either.

## Why not a timelock, or a plain allowance?

| | Plain allowance or spending cap | Timelock | HARDSTOP |
|---|---|---|---|
| Lowering a limit or pausing takes effect | at once | only after the delay | at once |
| Raising a limit takes effect | at once | only after the delay | only after the cooling period |
| A later tightening cancels a waiting raise | no waiting raise exists | no; each change waits on its own | yes (`amend` in `kernel.fe`) |
| Most the agent can spend over a span, answered by the contract | no | no | yes (`exposure`) |
| An agent's toolset can loosen its own limits | depends on the integration | depends on the integration | no: the MCP server has no owner tools and no owner key |

A plain allowance makes a raise instant, so an owner tricked into approving
one loses money at once. A timelock delays every change, including the
emergency stop. HARDSTOP delays only loosening, so stopping an agent is
never slowed down, and that one-way rule is what lets the contract state
the worst case in advance. Products in each column, and how other entries in
this contest compare, are in [`research/COMPETITOR_MATRIX.md`](research/COMPETITOR_MATRIX.md).

## Fe highlight

The agent's entire authority is one handler signature, `Pay` in
[`fe/src/vault.fe`](fe/src/vault.fe):

```fe
Pay { to, amount, nonce } -> u8
    uses (ctx, agent, token, terms, approved_from, mut ledger, mut call, mut log)
```

`terms` and `approved_from` have no `mut`, so a `Pay` that changed the rules
or approved a recipient would not compile. The rules and recipient approvals
are stored as sealed types (`Terms`, `Approval` in
[`fe/src/kernel/sealed.fe`](fe/src/kernel/sealed.fe)) that only the kernel can
make, so no owner handler can build new rules or approvals that skip the cooling period. `Terms` is not `Copy` and changes in place, so saving the stored rules aside and putting them back later fails to compile (16-0002); `Approval` is still `Copy`, and a CI source check and three tests catch an older approval kept and put back; owner handlers
need an unforgeable, use-once proof (`OwnerCall`: private field, not `Copy`,
`own`, `#[must_use]`) bound to the real caller; and `static_assert`s run the
kernel's `const fn`s at compile time to check the verdict codes and the
ratchet's laws. CI edits copies of the code and requires the compiler to
refuse each attack (30 refusals, plus 7 control edits that must still
compile and 21 source-check lines, in
[`scripts/pay-cannot-loosen.sh`](scripts/pay-cannot-loosen.sh)). The same
pure `decide` also builds as a native program. Not covered by the compiler:
where `Pay` sends the money a verdict allowed. Tests cover it, and a source
check (it reads the text; it is not a compiler guarantee) requires `Pay`'s
only transfer to be exactly `safe_transfer(token, receiver: to, amount)`,
right after the ledger is updated, pins what `Pay` tells the kernel, and
catches eight edits that compile. A further source check pins the vault's
whole shape (its imports, storage, handlers and their `uses`, no token
approvals, and the chain's own time for every `now` given to the kernel)
and catches six more edits that compile and pass every test.

The full account, with every error code and limit:
[`FE_HIGHLIGHT.md`](FE_HIGHLIGHT.md).

**Feedback to Fe.** Building this turned up six compiler issues, filed
upstream with reproductions on 2026-11-19 (argotorg/fe
[#2035](https://github.com/argotorg/fe/issues/2035) to
[#2040](https://github.com/argotorg/fe/issues/2040); text in
[`research/UPSTREAM_ISSUES.md`](research/UPSTREAM_ISSUES.md)), including
[one](https://github.com/argotorg/fe/issues/2036) where a private trait can be implemented
from any ingot, which lets user code forge `std`'s sealed `Call` and `Ctx`
capabilities. Three have fixes from this project:
[#2048](https://github.com/argotorg/fe/pull/2048), which lets `fe test` set
the block time and number, was merged into Fe on 2026-11-20;
[#2042](https://github.com/argotorg/fe/pull/2042), approved by micahscopes,
was merged on 2026-11-21 with a test commit sbillig added;
[#2041](https://github.com/argotorg/fe/pull/2041) is open. The nightly CI job `fe-master` builds unpatched Fe master, whose head on 2026-11-21 is the #2042 merge, and HARDSTOP passes its 98 tests there with the forged `Call` and stand-in `Ctx` refused. The
first two compiler patches are also in [`research/fe-patches/`](research/fe-patches/):
`2-private-trait-visibility.patch` makes a private trait named outside its
module "not visible" (2-0003) in an `impl` header, a bound, a `where`
clause or a super-trait, which closes the forged `Call` and `Ctx`; and
`1-unknown-attributes.patch` makes an unknown attribute such as `#[mustuse]`
an error with a "did you mean `#[must_use]`?" hint. Each adds snapshot
tests; the compiler's own suite passes (2672) except one language-server
test that also fails on unmodified `master` on Windows. With the patched
compiler HARDSTOP passes `fe test`, and the refusal script requires the
forged `Call` and `Ctx` to be refused instead of compiling. CI job
`patched-fe` checks this on every push: it applies both patches to Fe
`master` at `6cd57cc`, runs their UI tests, then HARDSTOP's tests and the
refusal script on that compiler. The contracts are built and deployed with
the unpatched 26.6 release.

## Architecture

```
fe/src/
  kernel.fe           pure. decide / amend / cancel / exposure. Both targets.
  adversary.fe        pure. Seeded campaign + reference spec. Both targets.
  vault.fe            EVM only. Holds the token, gathers facts, obeys the kernel.
  launcher.fe         EVM only. Creates a vault in one transaction, owned by the caller.
  token.fe            EVM only. 6-decimal test token.
  cli.fe              native only. decide / exposure / batch / campaign.
  tests.fe            kernel tests, run on both targets
  adversary_tests.fe  campaign + 15 broken kernels, run on both targets
  vault_tests.fe      vault tests, EVM
  launcher_tests.fe   launcher tests, EVM

web/
  src/lib/hardstop/   an in-memory EVM (ethereumjs) running the bytecode above,
                      and a typed wrapper. No rules are restated in TypeScript.
  src/lib/live/       the same wrapper on a public test network, through the
                      visitor's wallet; the agent signs with its own key
  tests/              time-travel tests against the contract, and a
                      differential test: contract vs native kernel
  e2e/                scripted persona, accessibility and performance tests
                      in a real browser (Playwright)
  src/app/            the practice-mode app
```

```
 agent ──pay()──▶ Vault ──facts──▶ kernel::decide ──▶ Allow ─▶ ledger, then transfer, Paid
                    ▲                              └─▶ Deny  ─▶ Blocked(code, detail), nothing moves
 owner ─propose()───┘──▶ kernel::amend ──▶ tighter parts now, looser parts after cooling

 the same kernel.fe ──fe build --backend native──▶ ./hardstop decide | exposure | campaign
```

Design decisions and their costs: [`DECISIONS.md`](DECISIONS.md).
An adversarial review by an AI reviewer, what it found and what was fixed:
[`security/AUDIT.md`](security/AUDIT.md).
Trust boundaries and what is not defended: [`security/THREAT_MODEL.md`](security/THREAT_MODEL.md),
[`security/ASSUMPTIONS.md`](security/ASSUMPTIONS.md).

## Build and test

Needs Fe 26.6.0. The native target needs x86-64 Linux or AArch64 macOS (on
Windows, use WSL2 for the native steps). The web tests need Node 24.

```sh
curl -fsSL https://raw.githubusercontent.com/argotorg/fe/master/feup/feup.sh | bash -s -- --version v26.6.0
fe --version                      # fe 26.6.0 (5b3f96a)

cd fe
fe fmt --check
fe test                           # 98 tests on the EVM
fe test --backend native          # the 52 kernel + adversary tests again, natively
fe build --emit bytecode,runtime-bytecode,abi
fe build --backend native         # writes out/hardstop
./out/hardstop campaign 5206533097626292048 20000 40
./out/hardstop decide 1000000 86400 86400  10 20 3592000 0  0 0 0 1 0  0 0 0  80 0 1 1  1000005
                                  # prints "10 10 0 0 0": code 10, over the per-payment limit of 10

cd ../web
npm ci
npm test                          # 89 tests: the contract, the launcher, the wallet path, the MCP server and watcher, the differential test, the session log

npx playwright install chromium   # once
npm run e2e                       # 61 browser tests against the production build
```

Every command above except the `decide` example, the browser suite included, runs in
[CI](.github/workflows/ci.yml) on each push, together with a check that the bytecode committed in
`web/src/lib/hardstop/artifacts.ts` is exactly what the source compiles to.

### Results

Measured from 2026-11-17 to 2026-11-20; raw output in [`EVIDENCE_LOG.md`](EVIDENCE_LOG.md).

| What | Result |
|---|---|
| `fe test` (EVM) | 98 passed, 0 failed |
| `fe test --backend native` | 52 passed, 0 failed |
| Same verdicts on both targets | 200 games x 40 requests = 8,000 verdicts, identical fingerprint `885356084767103301` asserted on both |
| Adversary vs broken kernels | 15 of 15 mutants caught, on both targets (the 15th, a cancel that lands a raise at once, added after the third review) |
| Exposure promise under attack | taken 2,938 times in 200 games: 347 with a raise waiting, 565 with money already spent, reached exactly 100 times, never exceeded |
| Contract vs native kernel (`web/tests/differential.test.ts`) | 2,400 payment requests (336 allowed, 1,951 denied, 113 reverted) and 480 exposure queries: agreed on all |
| Tests against the compiled contract with a controllable clock | 15 passed |
| Launcher, and the wallet path against a stand-in wallet (`launcher.test.ts`, `live.test.ts`) | 7 and 13 passed |
| The same wallet code on Base Sepolia, a public test network (2026-11-18, previous contracts) | launcher installed ([tx](https://sepolia.basescan.org/tx/0x3dd92270ec0c9a8056440ba8e98c633a8b1402b28a1d568ce275293d89ec8099)), vault created ([tx](https://sepolia.basescan.org/tx/0xc663ffe148aea8c9f7fbe3546741f7873de40347d45883f66958c22732ab2e62)), agent paid $4 ([tx](https://sepolia.basescan.org/tx/0x5e7e7a1e17e13c02d86e965a53a533c50494df8799f7b7fb007c4495a4edbc5a)), agent refused $80 over its per-payment limit ([tx](https://sepolia.basescan.org/tx/0xa95cc234253064fc29c13ce7e35be61106e3b20c86a67f0e8e5d56e4d8672967)), agent's attempt to raise its own limit refused before sending. All four succeeded; vault left with $96, recipient $4 |
| A vault opened by clicking through MetaMask on the live site (2026-11-18, previous contracts) | vault `0x3143b2b3479535cbdf63be8b0db52c1a2d95c0e2` created ([tx](https://sepolia.basescan.org/tx/0xfea508732560a856eb2a78c10eefb5b5937af3677e756ded9b30b43e78e9c5b8)), its `owner()` is the MetaMask account; from the Activity page the agent paid $4 ([tx](https://sepolia.basescan.org/tx/0xa9d98697b4c79184721e9ff7525a19128963f6a6b701bdef61fda68e63cac562)), was refused $80 ([tx](https://sepolia.basescan.org/tx/0xeb1947f5143adcdcd3aace21c3bca8a519e7e6faa09f58b172be442a73cf2744)) and was refused a self-raise before sending; vault left with $96 |
| Cost of the first launch on Base Sepolia | 0.000024 ETH in fees + 0.00003 ETH handed to the agent; an agent payment cost 0.00000088 ETH |
| Current contracts on Base Sepolia (2026-11-21: `Terms` is not `Copy` and changes in place) | launcher `0x77b42805c30cc6a0e598f02a9d8b4a9525bab4ee` installed ([tx](https://sepolia.basescan.org/tx/0x674bb890054488bef299cf8876787157e2cf0a1c440b8730c001d9c8a57cac4b)), vault `0xc6e2edc9c244781a7656611da0c7710475dd87c9` created ([tx](https://sepolia.basescan.org/tx/0xb0fba57575dd1ee211f2ab2e4053e412e955d5742f60adcf7d06629cb45639b1)); agent paid $4 twice ([tx](https://sepolia.basescan.org/tx/0xca3bacfe24d40da4488145fbe62759a7e472fac88635d42f2ad84b5378be0c67), [tx](https://sepolia.basescan.org/tx/0x38cd9d8cb227df6ad639b3689563a2ded7ea5eaa2b1a5fd32bf394676483c84c)), was refused $80 with code 10 ([tx](https://sepolia.basescan.org/tx/0x6352c632a66c2e1b9c208aa8eef8d02f10a3d23d9bc46ef9c593d835fe2d9e09)), and its self-raise reverted `NotOwner` before sending; owner proposed $40 a day ([tx](https://sepolia.basescan.org/tx/0x49fbcd7dc1b90b4bfbd4226352cfecb917aaa317b331f7cd13591aa3ff1783af)), cancelled it ([tx](https://sepolia.basescan.org/tx/0xe26424d68b54f32c41d18850405f77fe5c9569f10c1c09b67afc0cabe0715d12)) and paused ([tx](https://sepolia.basescan.org/tx/0x27ead0361099140b0eb630de25558afc6347bf5fe56a79cee1d324bf527ff260)). Vault left with $92, recipient $8, limit still $20 a day. Its code hash is the current build's (`web/src/lib/live/find.ts`). Script: `web/scripts/base-sepolia-evidence.ts`, the site's own `launchVault` with a throwaway test key |
| Previous contracts on Base Sepolia (2026-11-20: the owner's proof carries the chain's time) | launcher `0x770bbe43a3669f066b8dc3274ff6dca9f22a8fd1` installed ([tx](https://sepolia.basescan.org/tx/0x7e1da5bf529ee3d7121f294a54af623f8ad4f596bbb24522fbf048dfbbe38cf5)), vault `0x76a0494dd6c205671adde95defc04c21a4e32100` created ([tx](https://sepolia.basescan.org/tx/0xcf1b4aa2b0fade62ec043a55b5d3b14bbdd4a9cb3c87b8871fde05f112147017)); agent paid $4 twice ([tx](https://sepolia.basescan.org/tx/0x77d173c1b33d94dd305b34ee54870c322815206af99e622cc23bcd84c1191334), [tx](https://sepolia.basescan.org/tx/0x91824c8fc1e7aa29753cb00a084a48e4bef85751756cf9b3ad0fc36929d23b8f)), was refused $80 with code 10 ([tx](https://sepolia.basescan.org/tx/0x5526d9d3cb697f02fb6991fa4b95ec4fa664f2710b84f98aa05c2ee25f9a1bb7)), and its self-raise reverted `NotOwner` before sending; owner proposed $40 a day ([tx](https://sepolia.basescan.org/tx/0xa91d57977f0775ee317fd5a12c4923cedce24eef57bc409f9d616768f6c4a301)), cancelled it ([tx](https://sepolia.basescan.org/tx/0xd52080c8a7299698235c4f6417835b5f4a9d3c3e6f31f0ea4a08eb5a700ba0ef)) and paused ([tx](https://sepolia.basescan.org/tx/0xe8fa2feab55c413d77ca902ecbc78af474b682d8ae6969b71b6f23828ff4857b)). Vault left with $92, recipient $8, limit still $20 a day. Its code hash is that build's (`web/src/lib/live/find.ts`) |
| Earlier contracts on Base Sepolia (2026-11-19: sealed recipient approvals; `amend` and `cancel` run at compile time) | launcher `0xed8a5d83c64f71b6d027742124239dccbf018e44` installed ([tx](https://sepolia.basescan.org/tx/0x58562f4e482baed273c2e0225b20e284e3df80e0a1b2ce7416f3d5dc5630b006)), vault `0xf7d0b1e9872c21d33eec5dc9624deba0023a0d31` created ([tx](https://sepolia.basescan.org/tx/0x7ae1d584feb6ab2dbfe8b984c5c68e86e6233c51d76dccfe69e4409e4b6590af)); agent paid $4 twice ([tx](https://sepolia.basescan.org/tx/0xe554cac5920a34eb11ac2a72b507f2d84de15015824903971b0aba4f239e870a), [tx](https://sepolia.basescan.org/tx/0x4b73992ea966035c9e7c0c236ad3fb8a496a39665c35d4dcc15e4e379684b675)), was refused $80 with code 10 ([tx](https://sepolia.basescan.org/tx/0x295fa1da2b7401216a6db2e4585cebaa463329087d6bf5e4adb9e82e025cba2f)), and its self-raise reverted `NotOwner` before sending; owner proposed $40 a day ([tx](https://sepolia.basescan.org/tx/0xd4ed323d36488cdaf27ca7f3aba79e693db9d16a9d0bdeb1b892890c6e9c0dfd)), cancelled it ([tx](https://sepolia.basescan.org/tx/0x36edf95a9f3969f15d933c40fc7d7d3863c2d7124a161f49fa7e17c12f6175f6)) and paused ([tx](https://sepolia.basescan.org/tx/0x075024aeefd70212df65ca45109de1a55347d70da2e0dd51f7e98b782c9eb30f)). Vault left with $92, recipient $8, limit still $20 a day. Its code hash is that build's (`web/src/lib/live/find.ts`) |
| Earlier contracts on Base Sepolia (sealed `Terms`, caller-bound `OwnerCall`, capped test-token mint; recipient approvals not sealed) | launcher `0xa5ecc8802db5520ab089d63b39bb4508d3794299` installed, vault `0x65f9cd46b3d0ba8fd199175558b9162d789f0758` created; paid twice, refused $80 (code 10, from the on-chain `Blocked` event), self-raise reverted `NotOwner`, owner proposed, cancelled and paused; vault left with $92. Transactions: install [tx](https://sepolia.basescan.org/tx/0xc08665972a57e4ab9f383ceee7330cc6fa523db86a33c55d2734ea1c56a76163), create [tx](https://sepolia.basescan.org/tx/0x7d562ad1aceae4911ec7369e976d3d9a3d09b01458033d60e6183e71980ce9c5), first payment [tx](https://sepolia.basescan.org/tx/0xbff1564f660d8f5adbff43765e3fe92ff3b1be8655769d8387b02e01d675fbf6) |
| Vault runtime size | 6,883 bytes for the current contracts, read from Base Sepolia with `eth_getCode`; 1,102 bytes less than the previous build (7,985), which copied the rules in and out of storage |
| Browser suite (`npm run e2e`, Chromium, production build) | 61 tests, all passing (61 of 61 on 2026-11-20); on this machine 1 to 3 can time out (90 s) under load in a full run and pass when rerun alone. Covers seven scripted personas, a vault on a test network through a stand-in wallet, keyboard-only journey, reduced motion, performance |
| Accessibility (axe) | 0 violations across 15 page states |
| Click "Agent pays $4" to receipt on screen | median 39 ms, max 73 ms (local EVM simulation, not on-chain latency; `qa/metrics/perf-unthrottled-pay-click.json`) |
| First and largest contentful paint, home page | median 180 ms unthrottled; 2,556 ms at 400 kbps / 400 ms RTT / 4x CPU slowdown (`qa/metrics/perf-*-home-load.json`) |

**Gas, measured on Base Sepolia** (total `gasUsed` from each receipt,
2026-11-21, current contracts: launcher `0x77b42805c30cc6a0e598f02a9d8b4a9525bab4ee`. The same
Fe bytecode costs the same on any EVM chain; the price per gas differs):

| Call | Gas | Transaction |
|---|---|---|
| Install the launcher (once per network) | 2,074,181 | [tx](https://sepolia.basescan.org/tx/0x674bb890054488bef299cf8876787157e2cf0a1c440b8730c001d9c8a57cac4b) |
| Create a vault (launcher, token mint, agent gas) | 1,672,614 | [tx](https://sepolia.basescan.org/tx/0xb0fba57575dd1ee211f2ab2e4053e412e955d5742f60adcf7d06629cb45639b1) |
| `pay`, allowed, first in the vault | 123,786 | [tx](https://sepolia.basescan.org/tx/0xca3bacfe24d40da4488145fbe62759a7e472fac88635d42f2ad84b5378be0c67) |
| `pay`, allowed, later | 72,498 | [tx](https://sepolia.basescan.org/tx/0x38cd9d8cb227df6ad639b3689563a2ded7ea5eaa2b1a5fd32bf394676483c84c) |
| `pay`, refused (over the per-payment limit) | 51,720 | [tx](https://sepolia.basescan.org/tx/0x6352c632a66c2e1b9c208aa8eef8d02f10a3d23d9bc46ef9c593d835fe2d9e09) |
| `propose`, a raise that waits | 106,744 | [tx](https://sepolia.basescan.org/tx/0x49fbcd7dc1b90b4bfbd4226352cfecb917aaa317b331f7cd13591aa3ff1783af) |
| `cancelQueued` | 41,467 | [tx](https://sepolia.basescan.org/tx/0xe26424d68b54f32c41d18850405f77fe5c9569f10c1c09b67afc0cabe0715d12) |
| `pause` | 47,615 | [tx](https://sepolia.basescan.org/tx/0x27ead0361099140b0eb630de25558afc6347bf5fe56a79cee1d324bf527ff260) |

The build before this one (2026-11-20, where `Terms` was `Copy`) cost 11.5%
and 13.2% more to install and create (2,313,081 and 1,893,783): copying the
rules in and out of storage took 1,102 bytes of code. Per call it was within
0.6%, except `pause`, which now costs 3.3% more (46,075 then). Earlier
builds cost 8% to 14%
more to install and create (the first contracts: 2,245,239 and 1,808,063)
and within 1.4% per call (the first contracts' first allowed `pay`:
122,096).

A refusal is recorded on chain as a transaction, so it costs gas; an agent's
attempt to change the rules reverts in the rehearsal and is never sent.

The personas are scripts, not people: no human participant, screen
reader, Firefox, Safari or physical device was tested. Method, steps,
screenshots and every issue found are in [`qa/`](qa/).

`fe test` has no fuzzer and cannot move the block timestamp. The seeded
campaign is the substitute for the first; the JS-EVM tests are the
substitute for the second.

## Demo

- **Reproducible CLI example:** the commands above; `./out/hardstop` prints
  usage with no arguments.
- **Live app:** https://hardstop-omega.vercel.app (static; no server-side
  state, no secrets). Open a vault on Base Sepolia or Sepolia with your own
  wallet, or in your browser with no wallet. `node web/e2e/live-check.mjs https://hardstop-omega.vercel.app`
  drives the whole journey against it and fails on any wrong verdict or
  console error.
- **Locally:** `cd web && npm run dev`, then open http://localhost:3000.

## Connect your AI

Any assistant that speaks MCP can become a vault's agent: Claude Code, Claude Desktop, ChatGPT, Cursor, VS Code, or Python agents. `web/mcp/server.ts` gives it five tools: status, preview, pay, recipients, and asking the owner for more. There are no owner tools, and the server never holds the owner's key, so the AI cannot loosen its own limits. `web/mcp/watch.ts` watches the vault 24/7 for the owner and alerts on waiting loosenings, payments, refusals, pauses and the end date. To try it with nothing installed but Node 20+, add the demo to Claude Code in one line, `claude mcp add hardstop-demo -- npx -y github:vaibhav4046/hardstop --demo`, or run that `npx` command in any MCP client's config (a one-file build of the server; the demo is an in-memory network, nothing real). From a clone: `cd web && HARDSTOP_FAKE=1 node mcp/server.ts`. Setup for each client is in [`web/mcp/README.md`](web/mcp/README.md).

**AI agents against a real vault (Base Sepolia, 2026-11-18).** Two Claude
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

## Limitations

- **Test networks only.** A vault can be opened on Base Sepolia or Sepolia.
  The current launcher, `0x77b42805c30cc6a0e598f02a9d8b4a9525bab4ee`, is
  installed on Base Sepolia (2026-11-21, transactions in the results table);
  on Sepolia the site installs it on first use, which takes one extra wallet
  approval. Earlier launchers stay on Base Sepolia
  with the vaults opened through them (seven, listed in
  [`EVIDENCE_LOG.md`](EVIDENCE_LOG.md#launchers-on-base-sepolia)). A
  launcher's address follows from its code, so every change to the
  contracts gives a new one. The agent is a trial key kept in the browser;
  a real agent would hold its own key.
- **MetaMask can refuse the owner's transactions after a network switch.**
  A site connected while MetaMask was on Ethereum mainnet and then switched
  to Base Sepolia got error 4100 on every send, though its permissions listed
  both. The site now asks for the account again once and retries; only that
  one case was seen, in Comet (a Chromium browser) on 2026-11-18.
- **MetaMask warns before connecting.** On 2026-11-18 MetaMask's site scanner
  showed "Continue at your own risk" for `hardstop-omega.vercel.app`. The site
  is not on MetaMask's public blocklist (`eth-phishing-detect`); a review has
  to be requested from MetaMask. Until then a visitor has to click past it.
- **One vault, one token, one agent, three recipients at creation.** No Safe
  integration, no calldata rules, no multi-token caps.
- **Alerts need the watcher running.** The site has no server and sends
  nothing: every page shows a waiting loosening with a cancel button while
  it is open. The optional, self-hosted watcher (`web/mcp/watch.ts`) checks
  the vault around the clock and alerts by phone push (ntfy), webhook or desktop notification,
  but only while someone runs it. Without it, the ratchet only helps an
  owner who looks.
- **Fixed windows.** A full cap can be spent at the end of one window and
  again at the start of the next. `exposure` accounts for it.
- **A stolen owner key is out of scope**, as is a malicious token.
- **Not professionally audited**, and built on a young compiler. An AI
  reviewer attacked it once ([`security/AUDIT.md`](security/AUDIT.md));
  that is not the same thing.

The full list, with what breaks under each, is in the threat model.

## Declaration

- **Pre-existing work:** none. The repository's first commit is
  2026-11-17, inside the contest window. The project layout follows the
  official [starter](https://github.com/fe-lang/builders-challenge-starter)
  (its `fe.toml` and CI shape); no starter source code remains.
- **Third-party code:** Fe `std` and `core` (shipped with the compiler,
  Apache-2.0). In `web/`: Next.js, React, Tailwind CSS, viem, and the
  `@ethereumjs` EVM, each under its own MIT or MPL-2.0 licence as recorded
  in `web/package-lock.json`.
- **AI assistance:** substantial and disclosed. The Fe source, tests,
  TypeScript, documentation and research files were written with Claude
  (Anthropic) through Claude Code, directed and reviewed by the author.
  Research was gathered by AI agents from public web sources and is logged
  with URLs and access dates; figures were read through a summarising fetch
  tool and should be checked against the linked source before being quoted
  elsewhere. Every test result in this README was produced by running the
  command shown. The demo films were made the same way; the narration is a
  synthetic voice and the music is generated, not a recording.

## Team

Vaibhav Lalwani ([@vaibhav4046](https://github.com/vaibhav4046)), solo.

## License

[MIT](LICENSE).
