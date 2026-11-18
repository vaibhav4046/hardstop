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
against a second, independently written statement of the rules and against
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
compile. And `decide` has no `uses` clause at all, so the function that
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
An independent adversarial review, what it found and what was fixed:
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
fe test                           # 77 tests on the EVM
fe test --backend native          # the 44 kernel + adversary tests again, natively
fe build --emit bytecode,runtime-bytecode,abi
fe build --backend native         # writes out/hardstop
./out/hardstop campaign 5206533097626292048 20000 40

cd ../web
npm ci
npm test                          # 35 tests: the contract, the launcher, the wallet path, the differential test, the session log

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
| `fe test` (EVM) | 77 passed, 0 failed |
| `fe test --backend native` | 44 passed, 0 failed |
| Same verdicts on both targets | 200 games x 40 requests = 8,000 verdicts, identical fingerprint `885356084767103301` asserted on both |
| Adversary vs broken kernels | 14 of 14 mutants caught, on both targets |
| Exposure promise under attack | taken 2,938 times in 200 games: 347 with a raise waiting, 565 with money already spent, reached exactly 100 times, never exceeded |
| Contract vs native kernel (`web/tests/differential.test.ts`) | 2,400 payment requests (336 allowed, 1,951 denied, 113 reverted) and 480 exposure queries: agreed on all |
| Tests against the compiled contract with a controllable clock | 15 passed |
| Launcher, and the wallet path against a stand-in wallet (`launcher.test.ts`, `live.test.ts`) | 7 and 8 passed |
| Vault runtime size | 7,539 bytes |
| Browser suite (`npm run e2e`, Chromium, production build) | 55 passed, 0 failed: seven scripted personas, a vault on a test network through a stand-in wallet, keyboard-only journey, reduced motion, performance |
| Accessibility (axe) | 0 violations across 15 page states |
| Click "Agent pays $4" to receipt on screen | median 26 ms, max 33 ms (local EVM simulation, not on-chain latency) |
| First and largest contentful paint, home page | median 120 ms unthrottled; 2,348 ms at 400 kbps / 400 ms RTT / 4x CPU slowdown |

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

- **Test networks only, and not yet run on one.** A vault can be opened on
  Base Sepolia or Sepolia: the launcher installs itself through the
  deterministic deployment proxy on first use (its code on both networks was
  read and matches the one the tests run), then one transaction creates the
  vault. That whole path is tested against a stand-in wallet running the
  compiled contracts, not yet against a public network, because no funded
  test wallet was available while building it. The agent is a trial key kept
  in the browser; a real agent would hold its own key.
- **One vault, one token, one agent, three recipients at creation.** No Safe
  integration, no calldata rules, no multi-token caps.
- **Nothing tells the owner a change is pending.** The ratchet only helps an
  owner who looks. Alerts are the missing piece between this and a product.
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
