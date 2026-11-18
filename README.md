# HARDSTOP

**Pitch:** HARDSTOP is a spending firewall for AI agents: the owner's limits
are enforced by a Fe contract the agent cannot talk its way past, raising a
limit takes a waiting period that the owner can cancel, and the worst-case
loss is a number you can read before anything goes wrong.

Fe Builders Challenge 2026 entry. Fe `26.6.0 (5b3f96a)`. MIT.

> Unaudited contest prototype. Do not put real money in it.

## For judges: one screen

| Claim | Check it | Expect |
|---|---|---|
| The kernel, vault, launcher and attacker pass their tests | `cd fe && fe test` | `88 passed; 0 failed` |
| The same kernel gives the same verdicts natively | `scripts/native.sh` (Linux / macOS / WSL) | `49 passed`, incl. `both_targets_reach_the_same_verdicts` |
| The agent's `Pay` cannot change the rules; owner handlers cannot skip the owner check; a proof cannot be hand-made or reused, or silently left unused (`let _ =` still compiles); the verdict-code constants stay distinct. Not covered: an owner handler assigning raised limits directly (see "Fe highlight") | `FE=fe bash scripts/pay-cannot-loosen.sh` | 16 lines starting `ok` |
| The attacker never beats the worst-case figure | `./fe/out/hardstop campaign 5206533097626292048 20000 40` (after the native build) | `violation 0` |
| The web app, wallet path, MCP server and watcher work against the compiled contracts | `cd web && npm ci && npm test` | `58` pass |
| The whole site, in a browser | `cd web && npm run e2e` | 58 tests (see the note in the results table) |
| It runs on a public network | Base Sepolia transactions in the gas table below | each one `status 1` |
| AI agents cannot spend past it | [`qa/agent-runs/`](qa/agent-runs/) | a purchasing agent and a hostile agent, $0 past the limits |
| CI runs the Fe tests, the native campaign, the refusal script and the web tests on every push | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | green |

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
  real-world agent losses are few; the largest we could verify is one
  incident of roughly $150,000 to $200,000 in May 2026. Industry-wide crypto
  theft figures are not agent losses and are not used here.

Every figure on the site was re-opened at its source on 2026-11-18: 49
sources, 48 confirmed on the page, kept apart as controlled tests, recorded
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
be cancelled until then. Any later tightening cancels a queued loosening. An
approval obtained by trickery stops being an instant loss and becomes a
pending change the owner can see.

**2. A worst-case number.** `exposure(rules, ledger, now, until)` is a pure
function returning the most the agent can move between two moments. With
nothing queued it is exact: a greedy agent reaches it and cannot exceed it.
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
campaign is pointed at fourteen deliberately broken kernels and must catch
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

The agent's entire authority is one handler signature. This is `Pay` in
[`fe/src/vault.fe`](fe/src/vault.fe):

```fe
Pay { to, amount, nonce } -> u8
    uses (ctx, agent, token, schedule, active, queued, approved_from, mut ledger, mut call, mut log)
{
    let now = seconds(ctx.timestamp())
    let rules = Rules { schedule, active, queued }
    let request = Request {
        amount,
        nonce,
        from_agent: ctx.caller() == agent,
        to_approved: cooled(at: approved_from.get(key: to), now),
    }
    match decide(rules, ledger, request, now) {
        Decision::Allow(next) => {
            ledger = next
            safe_transfer(token, receiver: to, amount)
            ...
```

`active`, `queued` and `approved_from` appear without `mut`. "The agent
cannot raise its own limit or approve its own recipient" is therefore not
only a tested behaviour: a `Pay` that assigned to any of them would not
compile. CI proves it on every push: [`scripts/pay-cannot-loosen.sh`](scripts/pay-cannot-loosen.sh)
edits a copy of `Pay` to write `active`, `queued` or `approved_from` and
requires the compiler to refuse each (errors 8-0018 and 8-0066), while a
control edit to the `mut` ledger still compiles. And `decide` has no `uses` clause at all, so the function that
makes the decision provably cannot read storage, call out, or log.

The owner's side is a type, not only a runtime `onlyOwner`. The kernel
functions that change the rules (`amend`, `cancel`, `approve_from`) and the
vault's `pay_owner` each take an `OwnerProof`. Its one field is private to
the kernel, so `OwnerProof { .. }` does not compile anywhere else, and the
only way to get one is `authorize(owner, caller)`, which returns it only when
the two match. The vault's `only` calls `authorize` with the stored owner and
`ctx.caller()` and reverts `NotOwner` otherwise. A proof is not `Copy` and
every function that takes one takes it `own`, so its first use spends it; it
is also `#[must_use]`, so one cannot be made and dropped. The same script
deletes the `only(...)` line from each of `Propose`, `CancelQueued`, `Pause`,
`SetRecipient` and `Withdraw` and requires each build to fail with "undefined
variable `proof`" (8-0012), requires a hand-made `OwnerProof` to fail as "not
visible", one proof passed to `pay_owner` twice to fail with "cannot use a
value after it was moved" (16-0002), and a proof made and dropped to fail
with "unused value of type `OwnerProof`" (8-0082).

What the compiler does not prove: that the proof was made from the real
caller. `authorize` is public, so
`authorize(owner: ctx.caller(), caller: ctx.caller())` in a handler compiles
and proves anyone is the owner. The kernel is pure, so it cannot see the
real caller itself. So the script also runs a source check, a text check of
`vault.fe` and not a compiler guarantee: `authorize` must be called exactly
once, inside `fn only`, and every `only(...)` call must be in a handler and
pass the stored `owner` and `ctx.caller()`, neither of them rebound. It then
shows that two forgeries it rejects (the line above, and `owner` rebound to
the caller) do compile, so the source check is what catches them. A helper in
another module that hands out proofs would get past it. Nor does a proof
force a handler to go through `amend`: one that lists `mut active` can still
assign a hand-built `Policy` directly.

The verdict codes are checked at compile time too. `Reason::code` returns
named constants (`CODE_PAUSED`, `CODE_OVER_PAYMENT_LIMIT`, ...), and a chain
of `static_assert`s in `kernel.fe` makes 0 "allowed" and every refusal code
the previous one plus one. The vault returns these codes, the native tool
prints them and the web app names them, so a constant edited into a
duplicate would mislabel every receipt; instead the build fails ("static
assertion failed", 8-0081), and the same CI script proves it. What this does
not check: that each `Reason` maps to its own constant. Pointing two
reasons at the same constant still compiles; the tests that assert each
reason's code catch that, not the compiler. These checks add no bytecode: the compiled contracts are
byte-identical with or without them.

The other half is that the same `decide` is the body of a native program:

```fe
#[cfg(target = "native")]
pub fn main() -> i32 uses (out: mut Stdout, args: Args, input: mut Stdin) {
    ingot::cli::run()
}
```

```sh
$ ./out/hardstop decide 1000000 86400 86400  10 20 3592000 0  0 0 0 1 0  0 0 0  80 0 1 1  1000005
10 10 0 0 0        # code 10 = over the per-payment limit; the limit is 10
```

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
  adversary_tests.fe  campaign + 14 broken kernels, run on both targets
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
fe test                           # 88 tests on the EVM
fe test --backend native          # the 49 kernel + adversary tests again, natively
fe build --emit bytecode,runtime-bytecode,abi
fe build --backend native         # writes out/hardstop
./out/hardstop campaign 5206533097626292048 20000 40

cd ../web
npm ci
npm test                          # 58 tests: the contract, the launcher, the wallet path, the MCP server and watcher, the differential test, the session log

npx playwright install chromium   # once
npm run e2e                       # 58 browser tests against the production build
```

Every command above except the browser suite runs in
[CI](.github/workflows/ci.yml) on each push, together with a check that the bytecode committed in
`web/src/lib/hardstop/artifacts.ts` is exactly what the source compiles to.

### Results

Measured on 2026-11-17 and 18; raw output in [`EVIDENCE_LOG.md`](EVIDENCE_LOG.md).

| What | Result |
|---|---|
| `fe test` (EVM) | 88 passed, 0 failed |
| `fe test --backend native` | 49 passed, 0 failed |
| Same verdicts on both targets | 200 games x 40 requests = 8,000 verdicts, identical fingerprint `885356084767103301` asserted on both |
| Adversary vs broken kernels | 14 of 14 mutants caught, on both targets |
| Exposure promise under attack | taken 2,938 times in 200 games: 347 with a raise waiting, 565 with money already spent, reached exactly 100 times, never exceeded |
| Contract vs native kernel (`web/tests/differential.test.ts`) | 2,400 payment requests (336 allowed, 1,951 denied, 113 reverted) and 480 exposure queries: agreed on all |
| Tests against the compiled contract with a controllable clock | 15 passed |
| Launcher, and the wallet path against a stand-in wallet (`launcher.test.ts`, `live.test.ts`) | 7 and 9 passed |
| The same wallet code on Base Sepolia, a public test network (2026-11-18, previous contracts) | launcher installed ([tx](https://sepolia.basescan.org/tx/0x3dd92270ec0c9a8056440ba8e98c633a8b1402b28a1d568ce275293d89ec8099)), vault created ([tx](https://sepolia.basescan.org/tx/0xc663ffe148aea8c9f7fbe3546741f7873de40347d45883f66958c22732ab2e62)), agent paid $4 ([tx](https://sepolia.basescan.org/tx/0x5e7e7a1e17e13c02d86e965a53a533c50494df8799f7b7fb007c4495a4edbc5a)), agent refused $80 over its per-payment limit ([tx](https://sepolia.basescan.org/tx/0xa95cc234253064fc29c13ce7e35be61106e3b20c86a67f0e8e5d56e4d8672967)), agent's attempt to raise its own limit refused before sending. All four succeeded; vault left with $96, recipient $4 |
| A vault opened by clicking through MetaMask on the live site (2026-11-18, previous contracts) | vault `0x3143b2b3479535cbdf63be8b0db52c1a2d95c0e2` created ([tx](https://sepolia.basescan.org/tx/0xfea508732560a856eb2a78c10eefb5b5937af3677e756ded9b30b43e78e9c5b8)), its `owner()` is the MetaMask account; from the Activity page the agent paid $4 ([tx](https://sepolia.basescan.org/tx/0xa9d98697b4c79184721e9ff7525a19128963f6a6b701bdef61fda68e63cac562)), was refused $80 ([tx](https://sepolia.basescan.org/tx/0xeb1947f5143adcdcd3aace21c3bca8a519e7e6faa09f58b172be442a73cf2744)) and was refused a self-raise before sending; vault left with $96 |
| Cost of the first launch on Base Sepolia | 0.000024 ETH in fees + 0.00003 ETH handed to the agent; an agent payment cost 0.00000088 ETH |
| Current contracts on Base Sepolia (zero-address check, typed time units, single-use `OwnerProof`, capped test-token mint) | launcher `0x811e79d3bd786fb5701e0e66cc287fcaa24e558b` installed, vault `0xae1e31f0cfcf65699e108a32c7ba2464d0def9e5` created; paid twice, refused $80 (code 10, read from the on-chain `Blocked` event), self-raise reverted `NotOwner`, owner proposed and cancelled; vault left with $92. Transactions in the gas table below |
| Vault runtime size | 7,941 bytes, read from Base Sepolia with `eth_getCode` |
| Browser suite (`npm run e2e`, Chromium, production build) | 58 tests, all passing (55 of 55 in one full run on 2026-11-18, before 3 were added); on this machine 1 to 3 can time out (90 s) under load in a full run and pass when rerun alone. Covers seven scripted personas, a vault on a test network through a stand-in wallet, keyboard-only journey, reduced motion, performance |
| Accessibility (axe) | 0 violations across 15 page states |
| Click "Agent pays $4" to receipt on screen | median 26 ms, max 33 ms (local EVM simulation, not on-chain latency) |
| First and largest contentful paint, home page | median 120 ms unthrottled; 2,348 ms at 400 kbps / 400 ms RTT / 4x CPU slowdown |

**Gas, measured on Base Sepolia** (total `gasUsed` from each receipt,
2026-11-18, current contracts; the same Fe bytecode costs the same on any
EVM chain, the price per gas differs):

| Call | Gas | Transaction |
|---|---|---|
| Install the launcher (once per network) | 2,319,595 | [tx](https://sepolia.basescan.org/tx/0xbc34a27b81f75040697946db0c7986115fe9747b0f55a88d11fb4a88ca5b8e82) |
| Create a vault (launcher, token mint, agent gas) | 1,863,159 | [tx](https://sepolia.basescan.org/tx/0xb76fb81ce0ef2543ddb114db9c2971de0b125127179c593bc045bbdf144a6417) |
| `pay`, allowed, first in the vault | 122,149 | [tx](https://sepolia.basescan.org/tx/0x7cd108f9b3b6cfcdc3fa891540a1759010908f2ffb9fe1453bf11b689dbc2160) |
| `pay`, allowed, later | 70,861 | [tx](https://sepolia.basescan.org/tx/0x6c97634a48e4f47718c3bf56b12988122e7ba46c3793b2dc2c2f9ba6729d3494) |
| `pay`, refused (over the per-payment limit) | 49,840 | [tx](https://sepolia.basescan.org/tx/0x3dcec5bc1cb0a76a62f9661bf1a73ebe005055dd0087c10e1574932f2a3d5185) |
| `propose`, a raise that waits | 103,760 | [tx](https://sepolia.basescan.org/tx/0x18d1b489218a6ed6fc7e30f9b38fead01a6536301f680c905c5514cd47d7cc94) |
| `cancelQueued` | 39,798 | [tx](https://sepolia.basescan.org/tx/0xdfb6eaa24591d6e00fe7e35be2fc603a6294cd3d8944de1fa9e42244b4f83c12) |
| `pause` | 43,673 | [tx](https://sepolia.basescan.org/tx/0x01d4383638b0c444e63272923c4bb359755912c768445a0cd5cfd9360d8fb41d) (previous launcher; the vault code is byte-identical) |

On the first contracts (before the zero-address check, typed time units and
`OwnerProof`) every run-time call cost within 0.3% of these (`pay`, first:
122,096), while installing and creating cost about 3% less (2,245,239 and
1,808,063): the changes make the code larger but cost almost nothing per
call.

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

Any assistant that speaks MCP can become a vault's agent: Claude Code, Claude Desktop, ChatGPT, Cursor, VS Code, or Python agents. `web/mcp/server.ts` gives it five tools: status, preview, pay, recipients, and asking the owner for more. There are no owner tools, and the server never holds the owner's key, so the AI cannot loosen its own limits. `web/mcp/watch.ts` watches the vault 24/7 for the owner and alerts on waiting loosenings, payments, refusals, pauses and the end date. To try it with nothing set up, run `cd web && HARDSTOP_FAKE=1 node mcp/server.ts`. Setup for each client is in [`web/mcp/README.md`](web/mcp/README.md).

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
  The current launcher, `0x811e79d3bd786fb5701e0e66cc287fcaa24e558b`, is
  installed on Base Sepolia; on Sepolia it installs itself on first use.
  Earlier ones stay on Base Sepolia with the vaults opened through them:
  `0x956fbbde5fcb981e5a8507b369c79105815d562d` (the first contracts; two
  vaults, one opened through MetaMask on the live site),
  `0xe7d4489cde5cdaabbce571162ec14beca324b7c3` (before `OwnerProof`) and
  `0x9fa47775b526373ba8d9b7d8a7cc84ca487540e1` (before the capped mint; the
  vault used by the AI agent runs). A
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
  the vault around the clock and alerts by webhook or desktop notification,
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
  command shown.

## Team

Vaibhav Lalwani ([@vaibhav4046](https://github.com/vaibhav4046)), solo.

## License

[MIT](LICENSE).
