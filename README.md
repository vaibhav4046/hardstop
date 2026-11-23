# HARDSTOP

**Pitch:** HARDSTOP is a spending firewall for AI agents: the owner's limits
are enforced by a Fe contract the agent cannot talk its way past, raising a
limit takes a waiting period that the owner can cancel, and the worst-case
loss is a number you can read before anything goes wrong.

Fe Builders Challenge 2026 entry. Fe `26.6.0 (5b3f96a)`. MIT.
Live app: https://hardstop-omega.vercel.app

**New: update film (85 s, 2026-11-23, narrated, captions):** [watch](https://hardstop-omega.vercel.app/demo/hardstop-update.mp4): the tricked-owner run, the three AI agents refused on Base Sepolia, and the compiler refusals. ([`web/public/demo/hardstop-update.mp4`](web/public/demo/hardstop-update.mp4))

**Demo video (2 min, narrated, with music and captions):** [watch in the browser](https://hardstop-omega.vercel.app/demo/hardstop-demo.mp4)
(also in the repo: [`web/public/demo/hardstop-demo.mp4`](web/public/demo/hardstop-demo.mp4)).
The narration is a synthetic voice (Kokoro, generated on the builder's machine); the screen recordings in it are the live site.
A silent walkthrough (1 min 47 s, recorded 2026-11-19; the test counts on screen are from that day, the current ones are in the table below) with the test output and on-chain receipts:
[watch](https://hardstop-omega.vercel.app/demo/hardstop-walkthrough.mp4)
([`web/public/demo/hardstop-walkthrough.mp4`](web/public/demo/hardstop-walkthrough.mp4)).

[![HARDSTOP demo video: the vault door, the lab test, the live site, an AI agent refused, the Fe compiler refusal, and a Base Sepolia receipt](web/public/demo/hardstop-demo.jpg)](https://hardstop-omega.vercel.app/demo/hardstop-demo.mp4)

> Unaudited contest prototype, on test networks only. Do not put real money in it.

**The Fe idea in ten seconds.** The agent's whole authority is one handler
signature in [`fe/src/vault.fe`](fe/src/vault.fe):

```fe
Pay { to, amount, nonce } -> u8
    uses (ctx, agent, token, terms, approved_from, mut ledger, mut call, mut log)
```

`terms` and `approved_from` come without `mut`, so a payment that writes
the rules or approves a recipient does not compile (adding `mut` to the
`uses` list compiles, but a CI check pins that list). The rules themselves are
a sealed type that only the kernel can make or change, and never at once
when they loosen. CI makes 36 attack edits and requires the compiler
to refuse each one ([details](FE_HIGHLIGHT.md)). (Background, outside the
contest's scope: building this found a hole in Fe itself, private traits
that anyone could implement; the fix,
[argotorg/fe#2042](https://github.com/argotorg/fe/pull/2042), is merged.)
The compiler guards the rules; where `Pay` sends allowed money is guarded
by tests and source checks instead, as [`FE_HIGHLIGHT.md`](FE_HIGHLIGHT.md) lists.

**Try it in 15 seconds, nothing to clone.** An AI agent on a practice vault
($10 a payment, $20 a day), in Claude Code:

```bash
claude mcp add hardstop-demo -- npx -y github:vaibhav4046/hardstop --demo
```

Then ask it to pay Cloud hosting $4, then $15. What it reads back:

```
✅ Paid: $4.00 to Cloud hosting. Inside every limit. $16.00 left today.
⛔ Refused: $15.00 to Cloud hosting. One payment may be at most $10.00.
[████░░░░░░░░░░░░░░░░] $4.00 of $20.00 used today.
```

**Or install nothing.** Any assistant that takes a remote MCP server can use
the site's practice server; each session gets its own practice vault, kept
in memory, forgotten after 30 idle minutes, and reset if the host moves the
session to another server instance:

```bash
claude mcp add --transport http hardstop-practice https://hardstop-omega.vercel.app/mcp
```

`/mcp/tricked` instead starts each vault with the tricked owner's raise below.

**The case caps miss: the owner is fooled.** Replace `--demo` with `--tricked`
and the practice vault starts with a $1,000-a-day raise its owner was talked
into. The agent is still refused, and the contract's worst case shows the danger
before any money moves (a run on 2026-11-23):

```
⏳ A change is waiting: up to $1,000.00 per payment and $1,000.00 per day, until 23 Dec 2026, 09:45. It takes effect 24 Nov 2026, 09:45 unless the owner cancels it.
Worst case over the next 24 hours, by the contract's own arithmetic: $1,020.00.
⛔ Refused: $500.00 to Cloud hosting. One payment may be at most $10.00.
```

Claude Desktop, Cursor, VS Code and Antigravity installs: [`web/mcp/README.md`](web/mcp/README.md).
Listed in the official MCP Registry as `io.github.vaibhav4046/hardstop`.

## For judges: one screen

| Claim | Check it | Expect |
|---|---|---|
| Kernel, vault, launcher and attacker pass their tests | `cd fe && fe test` | `106 passed; 0 failed` |
| The compiler refuses attack edits; source checks pin what it cannot | `FE=fe bash scripts/pay-cannot-loosen.sh` | 87 lines starting `ok` |
| The compiler checks the worst-case promise over 16,384 policy pairs | `cd fe && fe check` (about 26 s; the laws are in `fe/src/kernel/laws.fe`) | no output; break the kernel and it fails with 8-0081 |
| Same verdicts natively | `scripts/native.sh` (Linux, macOS, WSL) | `54 passed` |
| A seeded attacker never beats the worst case | `./fe/out/hardstop campaign 5206533097626292048 20000 40` | `violation 0` |
| Web app, wallet path, MCP server, watcher | `cd web && npm ci && npm test` | `117` pass |
| Time-dependent rules hold on the compiled vault (a raise applies only after the cooling period, to the second; the day resets) | `web/tests/vault.test.ts`: the Fe-compiled bytecode on an EVM whose clock the test moves (`fe test` cannot move time); and `fe-time/` runs the vault at a present-day block time on Fe master, nightly (Fe 26.6 tests run at time 1) | part of the 117; `fe-time`: 4 passed |
| The whole site in a browser | `cd web && npm run e2e` | 64 tests |
| AI agents cannot spend past it | [`qa/agent-runs/`](qa/agent-runs/) | $0 past the limits |
| It ran on a public network | Base Sepolia transactions and gas: [`docs/EVIDENCE.md`](docs/EVIDENCE.md) | `status 1` each |
| Fe bugs found, fixes sent upstream | issues [#2035](https://github.com/argotorg/fe/issues/2035) to [#2040](https://github.com/argotorg/fe/issues/2040); PRs [#2041](https://github.com/argotorg/fe/pull/2041), [#2042](https://github.com/argotorg/fe/pull/2042), [#2048](https://github.com/argotorg/fe/pull/2048); CI job `patched-fe` | #2048 and #2042 merged; #2041 open; job green |
| All of the above runs on every push | [CI](https://github.com/vaibhav4046/hardstop/actions/workflows/ci.yml) | green |

The table with every detail: [`docs/EVIDENCE.md`](docs/EVIDENCE.md#the-claims-table-in-full).

## The problem

People are starting to let AI agents pay for things, and the usual safety net
is a spending cap. In a controlled test published in October 2026 (Cornell
Tech and Yale; [preprint](https://arxiv.org/html/2610.35835v3),
[CoinDesk report](https://www.coindesk.com/tech/2026/11/01/ai-agents-bypassed-crypto-spending-limits-without-human-approval-researchers-find-in-a-new-test)),
agents holding a wallet with a daily cap **raised that cap themselves in 9
of 10 models tested**, by reading the one-time passcode that was supposed to
prove a human had approved the change. The cap arithmetic was never broken;
the **cap-change path** was. On-chain spending caps for agents already exist,
and HARDSTOP does not claim one as new
([`research/COMPETITOR_MATRIX.md`](research/COMPETITOR_MATRIX.md)); its
answer is to make the cap-change path slow, cancellable and bounded.
Sources and figures: [`docs/EVIDENCE.md`](docs/EVIDENCE.md#the-problem-with-sources).

## How it works

Three things, all in Fe, all built during the contest window:

- **A ratchet.** Tightening a rule is instant. Loosening one (a higher cap, a
  later expiry, a new recipient, resuming after a pause) is queued, takes
  effect only after a cooling period, and can be cancelled until then.
- **A worst-case number.** `exposure(rules, ledger, now, until)` is a pure
  function returning the most the agent can move between two moments.
- **An attacker written in Fe.** `adversary.fe` plays seeded hostile games
  against the kernel and checks every verdict against a second statement of
  the rules and the exposure bound; it must catch 15 deliberately broken kernels.

```
 agent ──pay()──▶ Vault ──facts──▶ kernel::decide ──▶ Allow ─▶ ledger, then transfer, Paid
                    ▲                              └─▶ Deny  ─▶ Blocked(code, detail), nothing moves
 owner ─propose()───┘──▶ kernel::amend ──▶ tighter parts now, looser parts after cooling

 the same kernel.fe ──fe build --backend native──▶ ./hardstop decide | exposure | campaign
```

The full design, the timelock comparison, the file layout, accounts and the
MCP server: [`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md).

### Build and test

Needs Fe 26.6.0, x86-64 Linux or AArch64 macOS for native (WSL2 on Windows)
and Node 24. Every command, with notes: [`docs/BUILD.md`](docs/BUILD.md).

```sh
cd fe
fe test                           # 106 tests on the EVM
fe test --backend native          # the 54 kernel + adversary tests again, natively
fe build --backend native         # writes out/hardstop
./out/hardstop decide 1000000 86400 86400  10 20 3592000 0  0 0 0 1 0  0 0 0  80 0 1 1  1000005
                                  # prints "10 10 0 0 0": code 10, over the per-payment limit of 10
cd ../web
npm ci
npm test                          # 117 tests
```

## What the compiler does and does not guard

- **Guarded:** `Pay` has no `mut` on `terms` or `approved_from`, so a payment
  that writes the rules or approves a recipient does not compile; a CI
  check pins the `uses` list itself.
- **Guarded:** rules and approvals are sealed types (`Terms`, `Approval` in
  [`fe/src/kernel/sealed.fe`](fe/src/kernel/sealed.fe)) that only the kernel
  can make; `Terms` is not `Copy`, so saving the rules aside and putting them
  back fails to compile (16-0002).
- **Guarded:** owner handlers need an unforgeable, use-once proof
  (`OwnerCall`) bound to the real caller, and `static_assert`s check the
  verdict codes and the ratchet's laws at compile time.
- **Guarded, on a grid:** the promise to the owner. 137 `static_assert`s in
  [`fe/src/kernel/laws.fe`](fe/src/kernel/laws.fe) make the compiler run
  `amend`, `decide` and `exposure` over 128 policies and all 16,384 pairs:
  no signature raises the worst case before the cooling period ends, no
  payment beats it, and an agent that spends all it can reaches it exactly.
  A kernel broken so any of this fails does not build. A grid, not every input.
- **Not guarded by the compiler:** where `Pay` sends the money a verdict
  allowed. Tests and a source check (it reads the text) pin `Pay`'s only
  transfer; `Approval` is still `Copy`, so a source check and three tests
  catch an older approval put back.
- **Pinned by CI:** 36 compiler refusals, 7 control edits that must compile,
  8 source checks and 29 edits they catch, 7 of them also by a failing test, and sha256 pins on `kernel.fe`,
  `kernel/sealed.fe` and `launcher.fe`
  ([`scripts/pay-cannot-loosen.sh`](scripts/pay-cannot-loosen.sh)).

Every error code and limit: [`FE_HIGHLIGHT.md`](FE_HIGHLIGHT.md).

## Evidence

- [`docs/EVIDENCE.md`](docs/EVIDENCE.md): every result, Base Sepolia transaction and gas figure.
- [`EVIDENCE_LOG.md`](EVIDENCE_LOG.md): raw output, and earlier builds on Base Sepolia.
- [`qa/`](qa/): scripted personas, AI agent runs, screenshots and every issue found.
- [`docs/UPSTREAM.md`](docs/UPSTREAM.md): the Fe issues and fixes sent upstream.
- [`security/AUDIT.md`](security/AUDIT.md) (an AI review), [`security/THREAT_MODEL.md`](security/THREAT_MODEL.md), [`security/ASSUMPTIONS.md`](security/ASSUMPTIONS.md).
- [`DECISIONS.md`](DECISIONS.md): design decisions and their costs.
- [`research/EVIDENCE_DATA.md`](research/EVIDENCE_DATA.md): the problem's figures, re-checked at source.

## Limitations

- **Test networks only** (Base Sepolia, Sepolia). The agent is a trial key kept in the browser.
- **Not professionally audited**, and built on a young compiler.
- **One vault, one token, one agent, three recipients at creation.**
- **Alerts need the watcher running.** Without it, the ratchet only helps an
  owner who looks.
- **Fixed windows.** A full cap can be spent at the end of one window and
  again at the start of the next; `exposure` accounts for it.
- **A stolen owner key is out of scope**, as is a malicious token.

The full list, including two MetaMask issues: [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).

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

Vaibhav Lalwani ([@vaibhav4046](https://github.com/vaibhav4046)), solo.

## Licence

[MIT](LICENSE).
