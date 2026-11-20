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
| Upstream to Fe | six issues, argotorg/fe #2035 to #2040, and three pull requests: #2042 approved by a Fe maintainer on 2026-11-20 and green in Fe's CI, #2041 and #2048 open; none merged yet |
| Live app | https://hardstop-omega.vercel.app |
| Demo video | https://hardstop-omega.vercel.app/demo/hardstop-demo.mp4 (plays in the browser; 2 min, narrated by a synthetic voice, with music and captions; also in the repo at `web/public/demo/hardstop-demo.mp4`). A longer silent walkthrough with test output and receipts: https://hardstop-omega.vercel.app/demo/hardstop-walkthrough.mp4 |
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

## What is built in Fe

- `fe/src/kernel.fe`: pure `decide`, `amend`, `cancel` and `exposure`, with
  no `uses` clause, compiled for both the EVM and native from one source.
- `fe/src/vault.fe`: the contract. The agent's whole authority is the `Pay`
  handler, which takes the rules without `mut`, so a `Pay` that loosened a
  rule would not compile.
- `fe/src/kernel/sealed.fe`: what the vault stores (`Terms`, `Owner`,
  `Approval`) and the proof it needs (`OwnerCall`), with fields only the
  kernel can see.
- `fe/src/adversary.fe`: a seeded attacker written in Fe; it catches 15 of
  15 deliberately broken kernels on both targets.
- `fe/src/launcher.fe`: creates a vault in one transaction. It is installed
  through the deterministic deployment proxy, so on any network where it is
  installed it has the same address. The current one is installed on Base
  Sepolia (2026-11-19); on another network the site installs it on first
  use (one extra wallet approval).

## Fe highlight

`Pay { to, amount, nonce } -> u8 uses (ctx, agent, token, terms,
approved_from, mut ledger, mut call, mut log)`: the rules appear without
`mut`, so the agent's only handler cannot change them.

The cooling period is a compiler guarantee for the rules. The vault stores
them as `Terms`, whose field only `fe/src/kernel/sealed.fe` can see, so no
handler can build terms, store a hand-built `Rules` or write a field. New
terms come only from `open` and from `Terms::amend`, `cancel` and `pause`,
which apply the kernel's cooling period. Two runtime checks complete it:
`open` works only while the contract is being deployed, and zeroed storage
cannot be amended. Recipient approvals are sealed the same way: the map
stores `Approval`s, which only `founding` (at deployment) and
`Terms::approve_from` (owner proof, cooling period) make, so storing a date
or a hand-built approval does not compile. An approval copied under another
address compiles but approves no one (a runtime check, tested).

The owner proof is bound to the real caller by the compiler. Changing the
terms, approving a recipient and withdrawing each need an `OwnerCall`, which
only `prove(owner, ctx)` makes: `owner` must be an `Owner`, which only
`open` makes, and `ctx` must be the concrete `Evm`, so a stand-in context
that implements `Ctx` does not type-check. The kernel's public
`authorize(owner, caller)` still makes an `OwnerProof` for the tests and
the native tool; nothing the vault calls accepts one. A proof is spent by
its first use, and one thrown away as a bare statement is a compile error
(`let _ =` still discards it). CI proves each of these on every push. What
the compiler does not decide: which address `init` makes the owner (a CI
source check pins it to the constructor's `owner_` argument), whether a
handler passes on what the owner asked for, and where `Pay` sends the money
a verdict allowed. An edit that pays the caller more compiles, even in a
`Pay` without `mut call`, because any type can implement Fe 26.6's `Call`;
the tests catch it, and a CI source check (it reads the text; it is not a
compiler guarantee) requires `Pay`'s only transfer to be exactly
`safe_transfer(token, receiver: to, amount)`, not the compiler. That last gap is a Fe bug (a private
trait is not visibility-checked in an `impl` header or a bound), reported
as argotorg/fe#2036, and pull request argotorg/fe#2042 (approved by a Fe
maintainer on 2026-11-20, not yet merged; also `research/fe-patches/2-private-trait-visibility.patch`) fixes
it in the compiler: with it, the forged `Call` and the stand-in `Ctx` are refused
(2-0003), HARDSTOP's 95 tests still pass, and the Fe suite passes apart
from one language-server test that fails on unmodified `master` too.

The ratchet's laws are checked when the kernel compiles. `amend`,
`cancel`, `matures_at`, `loosens`, `meet`, `cooled`, `Rules::current` and
the time operators (`+`, `-`, `<`, ...) are `const fn`, and
`static_assert`s run them on fixed policies, zero and the maximum among
them. No policy loosens itself; `meet` is never looser than either input;
`NOT_SET` and `NEVER` never take effect; `+` saturates at `NEVER`; and
`amend` itself, called on fixed rules, queues a raise for `now + cooling`,
applies a tightening at once and drops a waiting raise, and splits a mixed
proposal, while `cancel` never loosens. An edit that breaks one fails the
build, and CI proves it for six such edits, including `amend` applying a
raise at once. Each verdict's wire code is asserted the same way
(`Reason::code` is a `const fn`), so a reason answering with another's code
fails to build. These are representative cases, not every input (the tests
and the adversary cover breadth). The asserts add no bytecode; marking
`amend`, `cancel` and `matures_at` `const` did change it (the vault's
runtime is 65 bytes smaller), and with it the launcher's address. The same pure `decide` also runs as a native command-line program.
Details in [`FE_HIGHLIGHT.md`](FE_HIGHLIGHT.md).

## Evidence it works

- `fe test`: 95 passed on the EVM; 52 passed natively.
- Web: 87 unit tests (including the MCP server and watcher) and 60 browser
  tests (Chromium, production build).
  CI runs the Fe tests, the native campaign, the compile-refusal check,
  the unit tests and the browser suite on every push
  ([runs](https://github.com/vaibhav4046/hardstop/actions/workflows/ci.yml)).
- On Base Sepolia (public test network), with the current contracts
  (2026-11-19): the launcher installed, a vault created, two payments, $80
  refused with code 10, a self-raise reverted, a raise proposed, cancelled
  and paused, and the gas of every call, each with its transaction link, in
  the README. Earlier builds ran there too: seven vaults, one opened by
  clicking through MetaMask on the live site.

## Honest limits

Test networks only; unaudited; MetaMask's site scanner currently warns
before connecting (a review was requested on 2026-11-18); a waiting raise is
shown on every page of the site, but nothing is sent to an owner who is not
on it. Full list in the README's "Limitations".

## AI assistance

Disclosed in full in the README's "Declaration": the code, tests,
documentation, research and demo films were written with Claude (Anthropic)
through Claude Code, directed and reviewed by the author. The film's
narration is a synthetic voice.
