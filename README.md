# HARDSTOP

**The problem.** In a controlled test published in October 2026
([preprint](https://arxiv.org/html/2610.35835v3),
[CoinDesk](https://www.coindesk.com/tech/2026/11/01/ai-agents-bypassed-crypto-spending-limits-without-human-approval-researchers-find-in-a-new-test)),
AI agents holding a wallet with a daily spending cap raised that cap
themselves in 9 of 10 models tested. The cap's arithmetic held. The path
that *changes* the cap is what failed.

**HARDSTOP guards that path.** Most spending limits guard the cap; this one
also guards every change to it:

- a raise waits out a cooling period, and the owner can cancel it until then; a tighter limit applies at once;
- what the raise could cost is a number the contract computes before any money moves;
- on every build, the Fe compiler itself checks, over a grid of policies, that no signature raises that number before the cooling period ends.

So a tricked owner, or an agent that gets an approval it should not have, makes a visible, cancellable pending change, not a loss. Two AI assistants, Claude Code and Cursor, were pointed at the current contracts on Base Sepolia (2026-11-24) and moved $0 past its limits ([Claude Code](qa/agent-runs/2026-11-24-claude-code-native-v3.md), [Cursor](qa/agent-runs/2026-11-24-cursor-native-v3.md)). Their tools cannot change a rule, so the agent's raw key was also sent at every owner-only function and at $500 payments: each was refused on chain, and the vault kept every dollar ([run](qa/agent-runs/2026-11-24-raw-agent-key-v3.md)).

Fe Builders Challenge 2026 entry. Fe `26.6.0 (5b3f96a)`. MIT.
Live app: https://hardstop-omega.vercel.app

> Unaudited contest prototype, on test networks only. Do not put real money in it.

**For judges, in 60 seconds.**

1. **The agent's authority is a type.** `Pay`'s `uses` list gives it the rules, the approvals and its own key read-only, and it can move money only through a sealed, use-once `Payout` the kernel returns, in the vault's own token. A payment that writes a rule, or makes its own payout to pay anyone else, does not compile. (A transfer imported into `vault.fe` beside the payout would compile; a CI source check refuses it. See below.)
2. **The promise is checked by the compiler.** On every build, Fe itself runs the vault's engine over 16,384 policy pairs: for every pair on that grid, whatever the owner signs, the worst case cannot rise before the cooling period ends. (A grid, on two schedules, from a vault with nothing waiting and from one with a raise already waiting; `fe test` and a seeded adversary cover the rest.)
3. **A tricked approval waits.** Loosening takes a cooling period; tightening is instant. The worst case is a number before any money moves.

Check it: `cd fe && fe test` (113 passed), `FE=fe bash scripts/pay-cannot-loosen.sh` (92 lines `ok`: 48 attack edits the compiler refuses), or point any AI assistant at `https://hardstop-omega.vercel.app/mcp` and ask it to pay $15. What the compiler does not cover is listed, not hidden: [`FE_HIGHLIGHT.md`](FE_HIGHLIGHT.md).

**What is new here, and what is not.** Spending caps and delays already exist. HARDSTOP's claim is the last three columns together:

| | Limits | Loosening a limit on a live vault | Worst case computed by the contract | Compile-time check |
|---|---|---|---|---|
| Safe allowance module | a cap per period | not described in its docs | not described | none (Solidity) |
| Zodiac Delay Modifier | none (it delays transactions) | every queued transaction waits a cooldown, not only loosening | not described | none (Solidity) |
| Leash (`devprashant19`, closest Fe entry) | per transaction and per period | limits are fixed at compile time; a change is a new deployment | not described | a `const fn` stops the build on a malformed policy |
| **HARDSTOP** | per payment, per window, end date, recipients, pause | tightening at once; loosening waits a cooling period and can be cancelled | yes, `exposure`, shown before money moves | the engine's behaviour checked over 16,384 policy pairs |

What Leash does that HARDSTOP does not: a rolling 24-hour window (HARDSTOP's windows are fixed), a circuit breaker, and running as a module inside a Safe (a HARDSTOP vault is instead a contract a Safe can own: [run](qa/agent-runs/2026-11-24-safe-owner-v3.md)). Read from each project's own docs and code (2026-11-17, Leash again 2026-11-23); the cells say "not described" where their docs did not say. Sources and more entries: [`research/COMPETITOR_MATRIX.md`](research/COMPETITOR_MATRIX.md).

## Film

**[Watch the 70-second film](https://hardstop-omega.vercel.app/demo/hardstop-laws.mp4)** ([`web/public/demo/hardstop-laws.mp4`](web/public/demo/hardstop-laws.mp4); narrated by a synthetic voice, captions, every shot a real run; [sources](docs/FILM_SOURCES_2026-11-23.md)): the compiler checking the promise over 16,384 policy pairs and stopping a broken kernel, a hand-made payout refused at compile time, the agent's key replaced on Base Sepolia, and the practice server refusing $15. It was recorded on the 2026-11-23 contracts; v3 (2026-11-24) only seals the token and refuses the owner as agent.

**[On v3, 43 seconds](https://hardstop-omega.vercel.app/demo/hardstop-v3.mp4)** (silent, captioned, every frame a real capture; [sources](docs/FILM_SOURCES_2026-11-24.md)): Cursor's AI agent on the current contracts, its $3 paid and its GPU Market and $15 payments refused on Base Sepolia, and the hosted alert feed showing a waiting raise.

Older films, from earlier builds: [update film, 85 s](https://hardstop-omega.vercel.app/demo/hardstop-update.mp4) (three AI agents refused on Base Sepolia), [demo, 2 min](https://hardstop-omega.vercel.app/demo/hardstop-demo.mp4), [silent walkthrough](https://hardstop-omega.vercel.app/demo/hardstop-walkthrough.mp4).

[![HARDSTOP 70-second film: the compiler checking the promise over 16,384 policy pairs, a broken kernel stopped, a hand-made payout refused, the agent's key replaced on Base Sepolia](web/public/demo/hardstop-laws.jpg)](https://hardstop-omega.vercel.app/demo/hardstop-laws.mp4)

## Try it

An AI agent on a practice vault ($10 a payment, $20 a day), in Claude Code:

```bash
claude mcp add hardstop-demo -- npx -y github:vaibhav4046/hardstop --demo
```

Then ask it to pay Cloud hosting $4, then $15. What it reads back:

```
✅ Paid: $4.00 to Cloud hosting. Inside every limit. $16.00 left today.
⛔ Refused: $15.00 to Cloud hosting. One payment may be at most $10.00.
[████░░░░░░░░░░░░░░░░] $4.00 of $20.00 used today.
```

**Or install nothing.** Any assistant that takes a remote MCP server can use the site's practice server. Each session gets its own practice vault, kept in memory, forgotten after 30 idle minutes, and reset if the host moves the session to another server instance. `/mcp/tricked` starts each vault with the tricked owner's raise below.

```bash
claude mcp add --transport http hardstop-practice https://hardstop-omega.vercel.app/mcp
```

**The case caps miss: the owner is fooled.** Replace `--demo` with `--tricked` and the practice vault starts with a $1,000-a-day raise its owner was talked into. The agent is still refused, and the contract's worst case shows the danger before any money moves (a run on 2026-11-23):

```
⏳ A change is waiting: up to $1,000.00 per payment and $1,000.00 per day, until 23 Dec 2026, 09:45. It takes effect 24 Nov 2026, 09:45 unless the owner cancels it.
Worst case over the next 24 hours, by the contract's own arithmetic: $1,020.00.
⛔ Refused: $500.00 to Cloud hosting. One payment may be at most $10.00.
```

The $1,020 is today's $20 plus the $1,000 the raise would allow: the next 24 hours reach the second it takes effect. Up to that second the worst case stays $40: windows are fixed 24-hour blocks, so the next 24 hours cross one reset, and $20 can go out before it and $20 after. That is the promise the compiler checks, law 4 in `fe/src/kernel/laws.fe`: up to one second before a raise can start, the worst case does not rise (checked on two schedules, and with a raise already waiting).

**Build and check it yourself** (Fe 26.6.0; more in [`docs/BUILD.md`](docs/BUILD.md)):

```bash
cd fe
fe test                           # 113 tests on the EVM
fe test --backend native          # the 54 kernel + adversary tests again, natively
fe build --backend native         # writes out/hardstop
./out/hardstop decide 1000000 86400 86400  10 20 3592000 0  0 0 0 1 0  0 0 0  80 0 1 1  1000005
cd ../web
npm test                          # 125 web tests
```

Claude Desktop, Cursor, VS Code and Antigravity installs: [`web/mcp/README.md`](web/mcp/README.md). Listed in the official MCP Registry as `io.github.vaibhav4046/hardstop` (version 0.1.1, published the morning of 2026-11-23, before that evening's contracts; the extension on the site is newer, 0.1.2).

## For judges: one screen

| Claim | Check it | Expect |
|---|---|---|
| Kernel, vault, launcher and attacker pass their tests | `cd fe && fe test` | `113 passed; 0 failed` |
| The compiler refuses attack edits; source checks pin what it cannot | `FE=fe bash scripts/pay-cannot-loosen.sh` | 92 lines starting `ok` |
| The compiler checks the worst-case promise over 16,384 policy pairs | `cd fe && fe check` (about 72 s; the laws are in `fe/src/kernel/laws.fe`) | no output; break the kernel in a way a law covers and the build fails (8-0081, or 3-0026 if the broken kernel runs past Fe's compile-time step limit) |
| Same verdicts natively | `scripts/native.sh` (Linux, macOS, WSL) | `54 passed` |
| A seeded attacker never beats the worst case | `./fe/out/hardstop campaign 5206533097626292048 20000 40` | `violation 0` |
| Web app, wallet path, MCP server, watcher | `cd web && npm ci && npm test` | `125` pass |
| Time-dependent rules hold on the compiled vault (a raise applies only after the cooling period, to the second; the day resets) | `web/tests/vault.test.ts`: the Fe-compiled bytecode on an EVM whose clock the test moves (`fe test` cannot move time); and `fe-time/` runs the vault at a present-day block time on Fe master, nightly (Fe 26.6 tests run at time 1) | part of the 125; `fe-time`: 4 passed |
| The whole site in a browser | `cd web && npm run e2e` | 65 tests |
| An agent cannot spend past it | [`qa/agent-runs/`](qa/agent-runs/): Claude Code, Cursor and Antigravity on earlier contracts (2026-11-22); on the current ones (v3, 2026-11-24) Claude Code ([run](qa/agent-runs/2026-11-24-claude-code-native-v3.md)), Cursor's agent ([run](qa/agent-runs/2026-11-24-cursor-native-v3.md)) and the official MCP client; and the agent's raw key sent at every owner-only function ([run](qa/agent-runs/2026-11-24-raw-agent-key-v3.md)) | $0 past the limits |
| It ran on a public network | Base Sepolia transactions and gas for the current contracts (v3, 2026-11-24), including a vault holding testnet USDC: [`docs/EVIDENCE.md`](docs/EVIDENCE.md) | `status 1` each |
| Fe bugs found, fixes sent upstream | issues [#2035](https://github.com/argotorg/fe/issues/2035) to [#2040](https://github.com/argotorg/fe/issues/2040); PRs [#2041](https://github.com/argotorg/fe/pull/2041), [#2042](https://github.com/argotorg/fe/pull/2042), [#2048](https://github.com/argotorg/fe/pull/2048); CI job `patched-fe` | #2048 and #2042 merged; #2041 open; job green |
| All of the above runs on every push | [CI](https://github.com/vaibhav4046/hardstop/actions/workflows/ci.yml) | green |

The table with every detail: [`docs/EVIDENCE.md`](docs/EVIDENCE.md#the-claims-table-in-full).

## What the compiler does and does not guard

- **Guarded:** `Pay` gets the rules, the approvals and its own key without `mut`, so a payment that writes them does not compile (a CI check pins the `uses` list).
- **Guarded:** `Pay` pays only through a sealed, use-once `Payout` from the kernel: that recipient, that amount, and (since v3, 2026-11-24) the vault's own token, sealed in the kernel's `Books` from creation.
- **Guarded:** rules, approvals and the owner's proof are sealed types only the kernel can make; `Terms` is not `Copy`, so old rules cannot be put back.
- **Guarded, on a grid:** 373 `static_assert`s in `fe/src/kernel/laws.fe` check the worst-case promise over 16,384 policy pairs. A grid, not every input.
- **Refused when it runs (v3):** `setAgent` with the owner's own address reverts.
- **Not guarded by the compiler:** a transfer imported into `vault.fe` and called beside the payout, and an older `Approval` put back (`Approval` is `Copy`). Source checks and tests catch both. CI pins 48 compiler refusals, 6 controls, 8 source checks and 23 edits they catch, and 7 edits a test catches.

The full list: [`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md#what-the-compiler-does-and-does-not-guard-in-full). Every error code: [`FE_HIGHLIGHT.md`](FE_HIGHLIGHT.md). The problem and its sources, every result and gas figure: [`docs/EVIDENCE.md`](docs/EVIDENCE.md). Design and accounts: [`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md). Build and test commands: [`docs/BUILD.md`](docs/BUILD.md).

## From test network to real use

What already works the way a real team would use it:

- **A real stablecoin.** A v3 vault held Circle's testnet USDC, paid 2 USDC and refused 4 on Base Sepolia ([run](qa/agent-runs/2026-11-24-usdc-vault.md)). Since v3 a vault can hold an existing token instead of the test dollar.
- **Real AI assistants, no code.** Claude Code, Cursor and Antigravity connect through their own MCP clients ([runs](qa/agent-runs/)); the server is in the official MCP Registry, Claude Desktop has an extension (`hardstop.mcpb`), and any assistant can try `https://hardstop-omega.vercel.app/mcp` first.
- **A Safe as the owner.** A 2-of-2 Safe launched a v3 vault and owns it: one signer alone could not even propose a raise (the Safe refused, `GS020`); with both, the raise was queued, shown by the alert feed and cancelled ([run](qa/agent-runs/2026-11-24-safe-owner-v3.md)). A tricked approval then needs a tricked quorum, and it still waits.
- **The owner hears about a raise.** Each vault's alert feed shows a waiting raise to any feed reader; the self-hosted watcher pushes it to a phone (ntfy), a webhook or the desktop.
- **Costs, measured on Base Sepolia:** a payment 80,858 gas (132,146 for a vault's first), a refusal 56,671, a new vault 1,982,063 ([gas table](docs/EVIDENCE.md)).

What a team would need before real money, and why it is not done here: an independent audit, and a compiler its makers call production-ready (Fe's own docs say it is not yet). Until then it is for test networks, as the banner says.

## Limitations

Test networks only (Base Sepolia, Sepolia), not professionally audited, and built on a young compiler. One vault holds one token (the launcher's test dollar, or since v3 an existing token such as testnet USDC), has one agent and three recipients at creation. Each vault has a hosted alert feed (`/alerts?chain=…&vault=…`) that shows a waiting raise to any feed reader; payments, refusals and a raise withdrawn between two polls need the self-hosted watcher. A stolen owner key and a malicious token are out of scope. The full list, including two MetaMask issues: [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).

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
