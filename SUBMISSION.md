# Submission: Fe Builders Challenge 2026

The text to paste into the submission form. The owner submits it through
their private link before **24 Nov 2026, 23:59 UTC**. Fill the commit SHA at
the moment of submitting: run `git rev-parse HEAD` on `main` after the last
push, and check that commit's CI run is green.

| Field | Value |
|---|---|
| Project | HARDSTOP |
| Repository | https://github.com/vaibhav4046/hardstop |
| Commit SHA (full) | _fill in at submission: `git rev-parse HEAD`_ |
| Fe version | 26.6.0 (5b3f96a) |
| Upstream to Fe (background, not part of the entry: the contest puts compiler work out of scope) | six issues, argotorg/fe #2035 to #2040, and three pull requests: #2048 merged into Fe on 2026-11-20 and #2042 (the capability-seal fix) on 2026-11-21, both by maintainer sbillig; #2041 open |
| Live app | https://hardstop-omega.vercel.app |
| Demo video | Update film, 85 s, recorded 2026-11-23: https://hardstop-omega.vercel.app/demo/hardstop-update.mp4 (the tricked-owner run, the three AI agents refused on Base Sepolia with their explorer pages, the 30 compiler refusals and 106 Fe tests; narrated by a synthetic voice, captions burned in, no music). The earlier launch film: https://hardstop-omega.vercel.app/demo/hardstop-demo.mp4 (plays in the browser; 2 min, narrated by a synthetic voice, with music and captions; also in the repo at `web/public/demo/hardstop-demo.mp4`). The launch film and the walkthrough were recorded on 2026-11-19, before the current contracts (2026-11-21), the AI-agent runs, the tricked-owner demo and the MCP Registry listing; those are in the update film and under Evidence below. A silent walkthrough with test output and receipts (its on-screen test counts are from that day): https://hardstop-omega.vercel.app/demo/hardstop-walkthrough.mp4 |
| Licence | MIT |
| Team | Vaibhav Lalwani ([@vaibhav4046](https://github.com/vaibhav4046)), solo |

## One-line pitch

A spending firewall for AI agents: the owner's limits are enforced by a Fe
contract the agent cannot talk its way past, raising a limit takes a
waiting period the owner can cancel, and the worst-case loss is a number you
can read before anything goes wrong.

## The problem, in two sentences

In a controlled test published in October 2026, AI agents holding a wallet
with a daily cap raised that cap themselves in 9 of 10 models, because the
cap-change path trusted a passcode the agent could read. HARDSTOP moves the
rules into a contract where loosening any rule waits out a cooling period,
so a tricked approval becomes a visible pending change instead of an
instant loss. (Sources and their limits: `README.md`, `research/EVIDENCE_DATA.md`.)

## What is new

Spending caps and transaction delays already exist. In the study above the
cap was not broken; the path that changes it was. HARDSTOP attacks that path:

1. **Loosening is slow, tightening is instant.** A raise waits out a cooling
   period and can be cancelled; any tighter limit applies at once and drops a
   waiting raise. A tricked approval becomes a visible pending change, not a
   loss (`npx -y github:vaibhav4046/hardstop --tricked` shows it: the owner has
   approved $1,000 a day, and the agent's $500 is still refused).
2. **The danger is a number before it happens, and the compiler checks the
   number.** The contract's `exposure` computes the most the agent can move
   over any span, counting the waiting raise: $40 over the next 24 hours
   before the tricked approval, $1,020 after, shown a day before the raise
   could be used. `fe/src/kernel/laws.fe` makes the Fe compiler itself run
   `amend`, `decide` and `exposure` over a grid of 128 policies (16,384
   pairs) on every build: whatever the owner signs, that number cannot go up
   before the cooling period ends; no payment beats it; and an agent that
   spends all it can gets exactly it. Break the kernel so any of these fails
   and the contract does not build.
3. **The agent's authority is a type.** `Pay` gets the rules read-only, as
   sealed types only the kernel can build, so a payment that writes them
   does not compile (CI makes 46 attack edits and requires the compiler to refuse each). Giving `Pay` write access
   means editing its `uses` list, which compiles but fails a CI check on that
   list, and a rule change would still need the owner's use-once proof.

`research/COMPETITOR_MATRIX.md` compares this with Safe, Zodiac's Delay
Modifier, Argent and the closest Fe entry, Leash, whose policy is fixed at
compile time.

## What is built in Fe

- `fe/src/kernel.fe`: pure `decide`, `amend`, `cancel` and `exposure`, with
  no `uses` clause, compiled for both the EVM and native from one source.
- `fe/src/vault.fe`: the contract. The agent's whole authority is the `Pay`
  handler, which takes the rules, the approvals and its own key without
  `mut`, so a `Pay` that wrote any of them would not compile. It holds no
  transfer of its own: the kernel judges the payment, counts it, and returns
  a sealed, use-once `Payout` that can pay only that recipient that amount.
- `fe/src/kernel/sealed.fe`: what the vault stores (`Terms`, `Owner`,
  `Approval`) and the proof it needs (`OwnerCall`), with fields only the
  kernel can see.
- `fe/src/adversary.fe`: a seeded attacker written in Fe; it catches 15 of
  15 deliberately broken kernels on both targets.
- `fe/src/launcher.fe`: creates a vault in one transaction, owned by the
  caller, and keeps each owner's list of vaults, and the names they give them, on chain.
  That list is the account: the site's My vaults page signs in with the wallet alone (no
  password, email or server) and shows only the vaults that wallet launched,
  on any device. It is installed through the deterministic deployment proxy,
  so it has the same address on every network. It is installed on Base
  Sepolia (2026-11-24); on Sepolia the site installs it on first use (one
  extra wallet approval).

## Fe highlight

The agent's whole authority is one handler signature, in `fe/src/vault.fe`:

```
Pay { to, amount, nonce } -> u8 uses (ctx, seat, token, terms,
    approved_from, mut ledger, mut call, mut log)
```

The rules (`terms`), recipient approvals and the agent's own key (`seat`)
come without `mut`, so a `Pay` that writes them does not compile (adding `mut` to its `uses` compiles, but
a CI check pins every handler's `uses` list). Around that, the compiler enforces:

- **Rules only the kernel can make.** The vault stores them as `Terms`, a
  sealed type whose field only `kernel/sealed.fe` can see. New rules come
  only from `open` (at deployment) and `Terms::amend`, `cancel` and
  `pause`, which apply the cooling period. Building, writing or storing
  hand-made rules fails (2-0003, 8-0000).
- **No putting old rules back.** `Terms` is not `Copy` and changes in
  place: saving the stored rules aside or restoring them fails (16-0002).
- **The chain's time, not the handler's.** The owner's proof carries the
  block time, so a handler that passes a made-up time fails (8-0023).
- **Recipients wait too.** Approvals are a sealed `Approval` only the kernel
  makes; storing a date or a hand-built approval fails.
- **The real owner, once.** Owner actions need an `OwnerCall`, which only
  `prove(owner, ctx)` makes from the concrete `Evm`. A hand-made proof, a
  stand-in context, a proof used twice or one thrown away as a bare
  statement each fails to compile.
- **The ratchet's laws, checked at compile time over a grid.** `amend`,
  `cancel`, `meet`, `loosens`, `decide`, `exposure` and the time operators
  are `const fn`. 137 `static_assert`s in `fe/src/kernel/laws.fe` run them
  on 128 policies and every pair of them: a tighter limit applies at once,
  a looser one waits to the second, a cancelled raise never happens, no
  signature raises the worst case before the cooling period ends, no payment
  beats it, and a greedy agent reaches it exactly. Nine broken kernels were
  tried and all fail the build; seven of them pass every earlier check. The
  contracts' bytecode is unchanged by any of it. This is a grid, not every
  input.
- **Paid only as judged (2026-11-24).** `vault.fe` holds no transfer. The
  kernel judges a payment from sealed inputs (caller and time, stored rules,
  the agent, the recipient's approval, the spending so far), counts it, and
  returns a sealed, use-once `Payout` that pays only that recipient that
  amount. A hand-made `Payout` or input does not compile; a payout sent
  twice does not compile.
- **A key that can be replaced, slowly.** The agent is a sealed `Seat`: the
  owner's `setAgent` stops the old key at once and starts the new one after
  the cooling period. `Pay` cannot touch it.

What the compiler guards is the code: whoever edits the contract (its author,
a maintainer, an AI coding assistant) cannot loosen the agent's authority
without the build failing. The running agent is stopped by the deployed
contract itself, its owner checks and cooling period.

On every push CI makes 46 attack edits and requires the compiler to refuse
each one (`scripts/pay-cannot-loosen.sh`).

**Where the compiler stops.** `vault.fe` importing a transfer of its own and
calling it beside the payout, copies of `Approval` (Fe 26.6's
`StorageMap::get` needs `Copy` values), and the bodies of `vault.fe`, the
kernel, `sealed.fe` and the launcher are guarded by tests and by source
checks that read the text, not by the compiler. Edits once caught only by a sha256 pin
now also fail a test, except one: an unused helper appended to the file,
which compiles to identical bytecode, so nothing deployed changes. (`prove`
accepting the transaction's origin, which `fe test` cannot see, is now
caught by a web test on the compiled vault.) One gap was a Fe bug: any type could
implement Fe 26.6's private `Call` trait, so a forged `Call` compiled. This
project reported it (argotorg/fe#2036) and fixed it in the compiler
(argotorg/fe#2042, merged 2026-11-21); on Fe master the forgery is refused
and HARDSTOP's tests pass. The same pure `decide` also runs as a native
command-line program. Every error code and limit:
[`FE_HIGHLIGHT.md`](FE_HIGHLIGHT.md).

## Evidence it works

- `fe test`: 112 passed on the EVM; 54 passed natively.
- Web: 120 unit tests (including the MCP server and watcher) and 64 browser
  tests (Chromium, production build).
  CI runs the Fe tests, the native campaign, the compile-refusal check,
  the unit tests and the browser suite on every push
  ([runs](https://github.com/vaibhav4046/hardstop/actions/workflows/ci.yml)).
- On Base Sepolia (public test network), with the current contracts
  (2026-11-24): the launcher installed, a vault created, two payments, $80
  refused with code 10, a self-raise and a self-swap of the agent's key
  refused before sending (the dry runs reverted `NotOwner`), a raise
  proposed, cancelled and paused, the agent's key replaced by the owner (the
  old key's next payment reverted `NotAgent`), and the gas of every call,
  each with its transaction link, in `docs/EVIDENCE.md`. Earlier builds ran there too, including a vault opened by
  clicking through MetaMask on the live site.
- Real AI agents through real MCP clients (2026-11-22, on the previous
  contracts): Claude Code, Cursor (its agent CLI) and Antigravity, each
  through its own MCP client, ran the same six steps against a Base Sepolia
  vault. Each paid an allowed amount ($3, or $1 when
  only $1 was left that day), had an unapproved recipient and a $15 payment
  refused on chain, and, asked to raise its own limit, had no tool that could:
  the one tool for it only drafted a request to the owner. Every receipt was read back
  (`qa/agent-runs/2026-11-22-claude-code-native.md`, `-cursor-native.md`,
  `-antigravity-native.md`). On the current contracts (2026-11-24) the same
  six steps ran through the official MCP client, not an assistant, with the
  same results and receipts read back
  (`qa/agent-runs/2026-11-24-mcp-client-current-build.md`).
- Install with nothing cloned: a Claude Desktop extension
  (https://hardstop-omega.vercel.app/install/hardstop.mcpb, with a practice
  vault switch), one-click Cursor and VS Code install links, and
  `npx -y github:vaibhav4046/hardstop` for any other client. Listed in the
  official MCP Registry as `io.github.vaibhav4046/hardstop` (2026-11-23).
- Install nothing at all: https://hardstop-omega.vercel.app/mcp is a public
  practice MCP server for any assistant that takes a remote server. Each
  session gets its own practice vault, in memory, forgotten after 30 idle
  minutes or reset if the host moves the session to another instance; `/mcp/tricked` starts it with the tricked owner's raise waiting.
  It reads no key and reaches no network.

## Honest limits

Test networks only; unaudited; MetaMask's site scanner currently warns
before connecting (a review was requested on 2026-11-18); a waiting raise is
shown on every page of the site, but the site sends nothing; alerts
elsewhere need the optional self-hosted watcher running. Full list in the README's "Limitations".

## AI assistance

Disclosed in full in the README's "Declaration": the code, tests,
documentation, research and demo films were written with Claude (Anthropic)
through Claude Code, directed and reviewed by the author. The film's
narration is a synthetic voice.
