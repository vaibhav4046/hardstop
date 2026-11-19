# HARDSTOP

**Pitch:** HARDSTOP is a spending firewall for AI agents: the owner's limits
are enforced by a Fe contract the agent cannot talk its way past, raising a
limit takes a waiting period that the owner can cancel, and the worst-case
loss is a number you can read before anything goes wrong.

**Demo video (2 min 28 s, silent, captioned):**
[`web/public/demo/hardstop-demo.mp4`](web/public/demo/hardstop-demo.mp4)

[![HARDSTOP demo video: the problem, the idea, the live site, an AI agent through MCP, and Fe](web/public/demo/hardstop-demo.jpg)](web/public/demo/hardstop-demo.mp4)

Fe Builders Challenge 2026 entry. Fe `26.6.0 (5b3f96a)`. MIT.

> Unaudited contest prototype. Do not put real money in it.

## For judges: one screen

| Claim | Check it | Expect |
|---|---|---|
| The kernel, vault, launcher and attacker pass their tests | `cd fe && fe test` | `90 passed; 0 failed` |
| The same kernel gives the same verdicts natively | `scripts/native.sh` (Linux / macOS / WSL) | `49 passed`, incl. `both_targets_reach_the_same_verdicts` |
| The agent's `Pay` cannot change the rules or recipients; no handler can store rules the kernel did not make (no instant raise); owner handlers cannot skip the owner check, and a proof can only come from the stored owner and the real caller; a proof cannot be hand-made or reused, or dropped as a bare statement (`let _ =` still compiles); the verdict-code constants stay distinct; the ratchet's laws hold, at compile time, on representative cases (`meet` keeping the larger cap fails to build). Not covered by the compiler: which address `init` makes the owner (a source check), a handler writing the recipient map directly, and the laws on inputs the asserts do not list (see "Fe highlight") | `FE=fe bash scripts/pay-cannot-loosen.sh` | 23 lines starting `ok` |
| The attacker never beats the worst-case figure | `./fe/out/hardstop campaign 5206533097626292048 20000 40` (after the native build) | `violation 0` |
| The web app, wallet path, MCP server and watcher work against the compiled contracts | `cd web && npm ci && npm test` | `69` pass |
| The whole site, in a browser | `cd web && npm run e2e` | 58 tests (see the note in the results table) |
| It runs on a public network | Base Sepolia transactions in the gas table below | each one `status 1` |
| AI agents cannot spend past it | [`qa/agent-runs/`](qa/agent-runs/) | a purchasing agent and a hostile agent, $0 past the limits |
| CI runs the Fe tests, the native campaign, the refusal script and the web tests on every push, and now the browser suite (`e2e` job, Playwright on Chromium) too | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | green |

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
    uses (ctx, agent, token, terms, approved_from, mut ledger, mut call, mut log)
{
    let now = seconds(ctx.timestamp())
    let rules = terms.rules()
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

`terms` and `approved_from` appear without `mut`. "The agent cannot raise
its own limit or approve its own recipient" is therefore not only a tested
behaviour: a `Pay` that assigned to either would not compile. CI proves it
on every push: [`scripts/pay-cannot-loosen.sh`](scripts/pay-cannot-loosen.sh)
edits a copy of `Pay` to write `terms` or `approved_from` and requires the
compiler to refuse each (errors 8-0018 and 8-0066), while a control edit to
the `mut` ledger still compiles. And `decide` has no `uses` clause at all,
so the function that makes the decision provably cannot read storage, call
out, or log.

**The cooling period is enforced by the compiler for the rules.** The vault
does not store the kernel's plain `Rules`. It stores `Terms`, from
[`fe/src/kernel/sealed.fe`](fe/src/kernel/sealed.fe), whose one field only
that module can see: any other module that builds `Terms`, reads its field
or writes it fails with "not visible" (2-0003). New terms come from four
functions only: `open`, and `Terms::amend`, `cancel` and `pause`, which run
the kernel's `amend` and `cancel`, so a looser policy waits out the cooling
period. An owner handler lists `mut terms` and still cannot raise a limit at
once: the script requires storing hand-built terms (2-0003), storing a
hand-built `Rules` (8-0000, "expected `Terms`"), and writing a field of
`terms` (2-0003) each to fail in `Propose`. A handler can still build a
`Policy` or a `Rules` (it needs one to make a proposal); it cannot make
either the vault's rules.

Two parts of this are checked when the code runs, not when it compiles.
`open` accepts any starting policy, so it returns nothing unless the
contract is still being deployed (its own code size is zero): a handler that
calls it compiles and gets `None`. And storage nobody wrote reads as zeroed
terms, with a cooling period of zero; `amend`, `cancel`, `pause` and
`approve_from` leave those unchanged, so a second, never-written `Terms`
field cannot be used to raise a limit. `fe test` checks both
(`open_works_only_while_deploying`, `zeroed_terms_cannot_be_raised`), and
each test fails if its check is removed. Not covered: recipient approvals.
Their cooling period comes from the kernel's `approve_from`, but the map is a
plain `StorageMap`, so a handler that lists `mut approved_from` (only
`SetRecipient` does) could write a date into it directly; the script shows
that this compiles.

**The owner proof is bound to the real caller by the compiler.**
`Terms::amend`, `cancel`, `pause` and `approve_from`, and the vault's
`pay_owner`, each take an `OwnerCall`. Its field is private to `sealed.fe`,
and only `prove(owner, ctx)` makes one, when `ctx.caller()` is the address
in `owner`. `owner` must be an `Owner`, another sealed type that only `open`
makes, so only during deployment. `ctx` must be an `Evm`, the concrete type
whose methods read the EVM itself. A stand-in that implements `Ctx` and
reports any caller does compile (the trait's seal is public as
`std::evm::effects::EvmCapabilitySeal`), and could be supplied to a
`with (Ctx = ...)` block, but handing it to `prove` is a type error
("expected `Evm`", 8-0000). The kernel's `authorize` is still public: the
tests, the adversary and the native tool use it, because Fe 26.6 has no
test-only visibility (`#[cfg]` takes only target, target_os and
target_family, and `pub(in path)` is "not yet supported"). Its
`OwnerProof` is accepted by nothing the vault calls (8-0000, "expected
`OwnerCall`").

A proof is not `Copy` and every function that takes one takes it `own`, so
its first use spends it. It is `#[must_use]`, so a bare `only(...)` whose
proof is thrown away fails (8-0082); `let _ = only(...)` still compiles. The
script deletes the `only(owner, ctx)` line from each of `Propose`,
`CancelQueued`, `Pause`, `SetRecipient` and `Withdraw` and requires "undefined
variable `proof`" (8-0012), and requires a hand-made `OwnerCall`, an `Owner`
made for the caller, `authorize`, the stand-in context, and one proof used
twice ("cannot use a value after it was moved", 16-0002) each to fail. What
the compiler does not decide is which address `init` gives `open`; the
script's source check requires one `open` call, in `init`, with
`owner: owner_`, and that `Owner` stored. Nor does a proof check what a
handler does with it: it says who is calling, not that `Propose` passes on
what the owner asked for.

The verdict codes are checked at compile time too. `Reason::code` returns
named constants (`CODE_PAUSED`, `CODE_OVER_PAYMENT_LIMIT`, ...), and a chain
of `static_assert`s in `kernel.fe` makes 0 "allowed" and every refusal code
the previous one plus one. The vault returns these codes, the native tool
prints them and the web app names them, so a constant edited into a
duplicate would mislabel every receipt; instead the build fails ("static
assertion failed", 8-0081), and the same CI script proves it. What this does
not check: that each `Reason` maps to its own constant. Pointing two
reasons at the same constant still compiles; the tests that assert each
reason's code catch that, not the compiler.

**The ratchet's laws are checked when the kernel compiles.** Fe 26.6
evaluates `const fn`s inside `static_assert`, operator methods included
(`impl core::ops::Add<Seconds> for Instant { const fn add(..) }` makes `+`
usable there). `loosens`, `meet`, `cooled`, `Rules::current` and the
`Instant` and `Seconds` operators are `const fn`, and the end of
[`fe/src/kernel.fe`](fe/src/kernel.fe) runs them on fixed values: the
tightest policy, the loosest (every limit at its maximum, valid until
`NEVER`), ordinary ones, and one changed in a single field at a time. The
asserts state that no policy loosens itself; that `meet` is idempotent and
never looser than either input; that `NOT_SET` and `NEVER` never take
effect and a queued policy is in force only from its moment on; that `+`
saturates at `NEVER`; and, for a raise, a tightening and a mixed proposal,
the rule `amend` applies (the active policy becomes `meet(in force,
proposed)`, and the proposal is queued exactly when it loosens that). Every
law-breaking edit tried fails the build: `meet` keeping the larger cap or
the later end, or dropping a pause; `loosens` ignoring any one field;
`cooled` letting `NEVER` through or firing a second early; `current`
ignoring the queue ("static assertion failed", 8-0081); and `+` wrapping
instead of saturating ("arithmetic overflow in const context", 3-0034). CI
checks the first. What this does not cover: the asserts check those cases,
not every input (breadth comes from `fe test` and the seeded adversary). And
`amend`, `cancel` and `matures_at` are not `const fn`, so their own code is
tested, not asserted. Making them `const` changes the compiled vault, and
with it the launcher's deterministic address.

None of this adds bytecode. All 24 compiled outputs are byte-identical with
or without the asserts and the `const` markings.

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
fe test                           # 90 tests on the EVM
fe test --backend native          # the 49 kernel + adversary tests again, natively
fe build --emit bytecode,runtime-bytecode,abi
fe build --backend native         # writes out/hardstop
./out/hardstop campaign 5206533097626292048 20000 40

cd ../web
npm ci
npm test                          # 71 tests: the contract, the launcher, the wallet path, the MCP server and watcher, the differential test, the session log

npx playwright install chromium   # once
npm run e2e                       # 58 browser tests against the production build
```

Every command above, the browser suite included, runs in
[CI](.github/workflows/ci.yml) on each push, together with a check that the bytecode committed in
`web/src/lib/hardstop/artifacts.ts` is exactly what the source compiles to.

### Results

Measured on 2026-11-17 and 18; raw output in [`EVIDENCE_LOG.md`](EVIDENCE_LOG.md).

| What | Result |
|---|---|
| `fe test` (EVM) | 90 passed, 0 failed |
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
| Current contracts on Base Sepolia (sealed `Terms`, caller-bound `OwnerCall`, capped test-token mint) | launcher `0xa5ecc8802db5520ab089d63b39bb4508d3794299` installed, vault `0x65f9cd46b3d0ba8fd199175558b9162d789f0758` created; paid twice, refused $80 (code 10, from the on-chain `Blocked` event), self-raise reverted `NotOwner`, owner proposed, cancelled and paused; vault left with $92. Transactions in the gas table below |
| Vault runtime size | 7,958 bytes, read from Base Sepolia with `eth_getCode` |
| Browser suite (`npm run e2e`, Chromium, production build) | 58 tests, all passing (55 of 55 in one full run on 2026-11-18, before 3 were added); on this machine 1 to 3 can time out (90 s) under load in a full run and pass when rerun alone. Covers seven scripted personas, a vault on a test network through a stand-in wallet, keyboard-only journey, reduced motion, performance |
| Accessibility (axe) | 0 violations across 15 page states |
| Click "Agent pays $4" to receipt on screen | median 26 ms, max 33 ms (local EVM simulation, not on-chain latency) |
| First and largest contentful paint, home page | median 120 ms unthrottled; 2,348 ms at 400 kbps / 400 ms RTT / 4x CPU slowdown |

**Gas, measured on Base Sepolia** (total `gasUsed` from each receipt,
2026-11-18, current contracts; the same Fe bytecode costs the same on any
EVM chain, the price per gas differs):

| Call | Gas | Transaction |
|---|---|---|
| Install the launcher (once per network) | 2,280,200 | [tx](https://sepolia.basescan.org/tx/0xc08665972a57e4ab9f383ceee7330cc6fa523db86a33c55d2734ea1c56a76163) |
| Create a vault (launcher, token mint, agent gas) | 1,888,050 | [tx](https://sepolia.basescan.org/tx/0x7d562ad1aceae4911ec7369e976d3d9a3d09b01458033d60e6183e71980ce9c5) |
| `pay`, allowed, first in the vault | 123,930 | [tx](https://sepolia.basescan.org/tx/0xbff1564f660d8f5adbff43765e3fe92ff3b1be8655769d8387b02e01d675fbf6) |
| `pay`, allowed, later | 72,642 | [tx](https://sepolia.basescan.org/tx/0x8e9acffd4ef0f67abc7f0df79cc44312f6583f939a186efc0ffb3a6090811029) |
| `pay`, refused (over the per-payment limit) | 51,718 | [tx](https://sepolia.basescan.org/tx/0x2532ecfa4986ccc2c05c6eb1ab46bdf93050540b44edcbf33403d2a7725b083e) |
| `propose`, a raise that waits | 106,121 | [tx](https://sepolia.basescan.org/tx/0xa5ddd19de9dd8cda591c6fbd7a0c5d9fbe6df7432cf9fe636966a96f84183c79) |
| `cancelQueued` | 41,610 | [tx](https://sepolia.basescan.org/tx/0x45c35fcffabe877fb98602031d0c7146d4c7aefb320a8c728ed9be5ed404b241) |
| `pause` | 46,065 | [tx](https://sepolia.basescan.org/tx/0x694ac57a474aa3f5909b25814ee3f945d05d97a827e500e64270954645e244b1) |

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
  The current launcher, `0xa5ecc8802db5520ab089d63b39bb4508d3794299`, is
  installed on Base Sepolia; on Sepolia it installs itself on first use.
  Earlier ones stay on Base Sepolia with the vaults opened through them
  (`0x811e79d3bd786fb5701e0e66cc287fcaa24e558b`, before sealed `Terms`, and):
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
