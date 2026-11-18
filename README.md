# HARDSTOP

**Pitch:** HARDSTOP is a spending firewall for AI agents: the owner's limits
are enforced by a Fe contract the agent cannot talk its way past, raising a
limit takes a waiting period that the owner can cancel, and the worst-case
loss is a number you can read before anything goes wrong.

Fe Builders Challenge 2026 entry. Fe `26.6.0 (5b3f96a)`. MIT.

> Unaudited contest prototype. Do not put real money in it.

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
fe test                           # 81 tests on the EVM
fe test --backend native          # the 45 kernel + adversary tests again, natively
fe build --emit bytecode,runtime-bytecode,abi
fe build --backend native         # writes out/hardstop
./out/hardstop campaign 5206533097626292048 20000 40

cd ../web
npm ci
npm test                          # 37 tests: the contract, the launcher, the wallet path, the differential test, the session log

npx playwright install chromium   # once
npm run e2e                       # 55 browser tests against the production build
```

Every command above except the browser suite runs in
[CI](.github/workflows/ci.yml) on each push, together with a check that the bytecode committed in
`web/src/lib/hardstop/artifacts.ts` is exactly what the source compiles to.

### Results

Measured on 2026-11-17 and 18; raw output in [`EVIDENCE_LOG.md`](EVIDENCE_LOG.md).

| What | Result |
|---|---|
| `fe test` (EVM) | 81 passed, 0 failed |
| `fe test --backend native` | 45 passed, 0 failed |
| Same verdicts on both targets | 200 games x 40 requests = 8,000 verdicts, identical fingerprint `885356084767103301` asserted on both |
| Adversary vs broken kernels | 14 of 14 mutants caught, on both targets |
| Exposure promise under attack | taken 2,938 times in 200 games: 347 with a raise waiting, 565 with money already spent, reached exactly 100 times, never exceeded |
| Contract vs native kernel (`web/tests/differential.test.ts`) | 2,400 payment requests (336 allowed, 1,951 denied, 113 reverted) and 480 exposure queries: agreed on all |
| Tests against the compiled contract with a controllable clock | 15 passed |
| Launcher, and the wallet path against a stand-in wallet (`launcher.test.ts`, `live.test.ts`) | 7 and 9 passed |
| The same wallet code on Base Sepolia, a public test network (2026-11-18, previous contracts) | launcher installed ([tx](https://sepolia.basescan.org/tx/0x3dd92270ec0c9a8056440ba8e98c633a8b1402b28a1d568ce275293d89ec8099)), vault created ([tx](https://sepolia.basescan.org/tx/0xc663ffe148aea8c9f7fbe3546741f7873de40347d45883f66958c22732ab2e62)), agent paid $4 ([tx](https://sepolia.basescan.org/tx/0x5e7e7a1e17e13c02d86e965a53a533c50494df8799f7b7fb007c4495a4edbc5a)), agent refused $80 over its per-payment limit ([tx](https://sepolia.basescan.org/tx/0xa95cc234253064fc29c13ce7e35be61106e3b20c86a67f0e8e5d56e4d8672967)), agent's attempt to raise its own limit refused before sending. All four succeeded; vault left with $96, recipient $4 |
| A vault opened by clicking through MetaMask on the live site (2026-11-18, previous contracts) | vault `0x3143b2b3479535cbdf63be8b0db52c1a2d95c0e2` created ([tx](https://sepolia.basescan.org/tx/0xfea508732560a856eb2a78c10eefb5b5937af3677e756ded9b30b43e78e9c5b8)), its `owner()` is the MetaMask account; from the Activity page the agent paid $4 ([tx](https://sepolia.basescan.org/tx/0xa9d98697b4c79184721e9ff7525a19128963f6a6b701bdef61fda68e63cac562)), was refused $80 ([tx](https://sepolia.basescan.org/tx/0xeb1947f5143adcdcd3aace21c3bca8a519e7e6faa09f58b172be442a73cf2744)) and was refused a self-raise before sending; vault left with $96 |
| Cost of the first launch on Base Sepolia | 0.000024 ETH in fees + 0.00003 ETH handed to the agent; an agent payment cost 0.00000088 ETH |
| Upgraded contracts on Base Sepolia (zero-address check, typed time units) | launcher `0xe7d4489cde5cdaabbce571162ec14beca324b7c3` installed, vault `0x6b075068dc0619678b52fbce571dcb6e90c3ca2c` created; paid twice, refused $80 (code 10), self-raise reverted `NotOwner`, owner proposed, cancelled, paused; vault left with $92. Transactions in the gas table below |
| Vault runtime size | 7,955 bytes, read from Base Sepolia with `eth_getCode` |
| Browser suite (`npm run e2e`, Chromium, production build) | 55 passed, 0 failed: seven scripted personas, a vault on a test network through a stand-in wallet, keyboard-only journey, reduced motion, performance |
| Accessibility (axe) | 0 violations across 15 page states |
| Click "Agent pays $4" to receipt on screen | median 26 ms, max 33 ms (local EVM simulation, not on-chain latency) |
| First and largest contentful paint, home page | median 120 ms unthrottled; 2,348 ms at 400 kbps / 400 ms RTT / 4x CPU slowdown |

**Gas, measured on Base Sepolia** (total `gasUsed` from each receipt,
2026-11-18, current contracts; the same Fe bytecode costs the same on any
EVM chain, the price per gas differs):

| Call | Gas | Transaction |
|---|---|---|
| Install the launcher (once per network) | 2,315,301 | [tx](https://sepolia.basescan.org/tx/0xc790f19bac59041e76ceca189a182463b77bac53f1e41d73529e074ed35016b3) |
| Create a vault (launcher, token mint, agent gas) | 1,865,936 | [tx](https://sepolia.basescan.org/tx/0x65b00f7fa6a52c835cd304beda2cde4c2c2c01cc87859b4845de470b7ae2e7ec) |
| `pay`, allowed, first in the vault | 122,149 | [tx](https://sepolia.basescan.org/tx/0xa10958d0855477034f31762595542bd1c1fae1ce1fb2543faa3c8c2a77f48409) |
| `pay`, allowed, later | 70,861 | [tx](https://sepolia.basescan.org/tx/0x5df0daec9f1f9497e54243e3d7ea6f4ea19d5f0dda24eada568ce5a49a53790c) |
| `pay`, refused (over the per-payment limit) | 49,840 | [tx](https://sepolia.basescan.org/tx/0x510b429899de54d8057b8eb0630f3771192a7620b6089c40b97852116c7561b4) |
| `propose`, a raise that waits | 103,758 | [tx](https://sepolia.basescan.org/tx/0xc495f4fb78485dec58ea243a683c9556e3eb856257f5406ff3cb822c0b1731aa) |
| `cancelQueued` | 39,796 | [tx](https://sepolia.basescan.org/tx/0x041995f0bd44616ac853621420e1b0796bb7f44355538aaf982ad537956b16cf) |
| `pause` | 43,671 | [tx](https://sepolia.basescan.org/tx/0x57e37ef2e326c4e6bee319e6423a143a3a4b09b4de08960f949b05d12360c42f) |

On the previous contracts every run-time call cost within 0.3% of these
(`pay`, first: 122,096), while installing and creating cost about 3% less
(2,245,239 and 1,808,063): the typed time units and the zero-address check
make the code larger but cost almost nothing per call.

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

## Limitations

- **Test networks only.** A vault can be opened on Base Sepolia or Sepolia.
  The current launcher, `0xe7d4489cde5cdaabbce571162ec14beca324b7c3`, is
  installed on Base Sepolia; on Sepolia it installs itself on first use. The
  previous one, `0x956fbbde5fcb981e5a8507b369c79105815d562d` (before the
  zero-address check and typed time units), stays there with the two vaults
  opened through it, one of them through MetaMask on the live site. A
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
- **The site warns about a pending change only while it is open.** Every
  page shows a waiting loosening with a cancel button, and a vault on a
  network links to its explorer page, where the owner can add the address to
  a watch list for email alerts. HARDSTOP itself sends nothing: it has no
  server. The ratchet still only helps an owner who looks.
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
