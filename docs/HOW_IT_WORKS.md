# HARDSTOP: how it works

The design in full, moved here from the [README](../README.md).

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
offline, and the app shows it up to the end of the cooling period: the most
the agent can take before anything the owner signs now could loosen the rules.
The MCP server's status gives it for one window ahead, which can cross a reset.

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
this contest compare, are in [`research/COMPETITOR_MATRIX.md`](../research/COMPETITOR_MATRIX.md).

## Fe highlight

The agent's entire authority is one handler signature, `Pay` in
[`fe/src/vault.fe`](../fe/src/vault.fe):

```fe
Pay { to, amount, nonce } -> u8
    uses (ctx, seat, token, terms, approved_from, mut ledger, mut call, mut log)
```

`terms`, `approved_from` and `seat` have no `mut`, so a `Pay` that changed
the rules, approved a recipient or swapped its own key would not compile.
`Pay` moves money only through a sealed `Payout` the kernel returns after
judging and counting the payment. The rules and recipient approvals
are stored as sealed types (`Terms`, `Approval` in
[`fe/src/kernel/sealed.fe`](../fe/src/kernel/sealed.fe)) that only the kernel can
make, so no owner handler can build new rules or approvals that skip the cooling period. `Terms` is not `Copy` and changes in place, so saving the stored rules aside and putting them back later fails to compile (16-0002); `Approval` is still `Copy`, and a CI source check and three tests catch an older approval kept and put back; owner handlers
need an unforgeable, use-once proof (`OwnerCall`: private field, not `Copy`,
`own`, `#[must_use]`) bound to the real caller; and `static_assert`s run the
kernel's `const fn`s at compile time to check the verdict codes and the
ratchet's laws. CI edits copies of the code and requires the compiler to
refuse each attack (47 refusals, plus 6 control edits that must still
compile, 8 source checks and 23 edits they catch, and 7 edits a test must catch, in
[`scripts/pay-cannot-loosen.sh`](../scripts/pay-cannot-loosen.sh)). The same
pure `decide` also builds as a native program. Not covered by the compiler:
where `Pay` sends the money a verdict allowed. Tests cover it, and a source
check (it reads the text; it is not a compiler guarantee) requires `Pay`'s
only transfer to be exactly `safe_transfer(token, receiver: to, amount)`,
right after the ledger is updated, pins what `Pay` tells the kernel, and
catches eight edits that compile. A further source check pins the vault's
shape (its imports, storage, handlers and their `uses`, no token
approvals, and the chain's own time for every `now` given to the kernel)
and catches six more edits that compile and pass every test. `init`, the
helpers around the contract, and all of `kernel.fe`, `kernel/sealed.fe` and
`launcher.fe` are pinned by their sha256, so a change to them fails CI until
the pin is updated; that catches six more edits an AI review panel found on
2026-11-21.

The full account, with every error code and limit:
[`FE_HIGHLIGHT.md`](../FE_HIGHLIGHT.md).

## Architecture

```
fe/src/
  kernel.fe           pure. decide / amend / cancel / exposure. Both targets.
  kernel/sealed.fe    sealed Terms, Owner, Approval, OwnerCall. Only kernel sees fields.
  adversary.fe        pure. Seeded campaign + reference spec. Both targets.
  vault.fe            EVM only. Holds the token, gathers facts, obeys the kernel.
  launcher.fe         EVM only. Creates a vault in one transaction, owned by the caller,
                      and lists each owner's vaults on chain.
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
  src/app/            the app: practice mode, a vault on a test network, My vaults
```

```
 agent ──pay()──▶ Vault ──sealed facts──▶ Books::judge (kernel::decide) ──▶ Allow ─▶ counted, then Payout.send(), Paid
                    ▲                              └─▶ Deny  ─▶ Blocked(code, detail), nothing moves
 owner ─propose()───┘──▶ kernel::amend ──▶ tighter parts now, looser parts after cooling

 the same kernel.fe ──fe build --backend native──▶ ./hardstop decide | exposure | campaign
```

Design decisions and their costs: [`DECISIONS.md`](../DECISIONS.md).
An adversarial review by an AI reviewer, what it found and what was fixed:
[`security/AUDIT.md`](../security/AUDIT.md).
Trust boundaries and what is not defended: [`security/THREAT_MODEL.md`](../security/THREAT_MODEL.md),
[`security/ASSUMPTIONS.md`](../security/ASSUMPTIONS.md).

## Accounts, profiles and isolation

There is no password, email or user table to steal, because there is no
account server. **Your wallet is your account**: signing in on
[My vaults](https://hardstop-omega.vercel.app/vaults) asks the wallet for
its address and nothing else, and nothing is signed or sent.

**Your profile is on chain.** The launcher (`fe/src/launcher.fe`) keeps,
for each owner, the list of vaults it created for them (`vaultCount`,
`vaultAt`). Only `launch` writes it, and only for its caller, so a vault is
in your list only if you launched it, and the list is the same on any
device. The page reads it, checks every vault's code against the known
builds, and shows each vault's status, limits, balance and agent, with a
link to its controls and its own setup for an AI and for the watcher.

**Name your vaults.** Each card has Rename: the name (up to 32 bytes) is
stored on the launcher under your own address (`setName`, `nameOf`), so it
follows you to any device, and nobody else can change what your list
shows. It costs one small transaction and changes nothing about the vault.

**Each vault's activity, from any device.** Open Activity on a vault's card
and it lists what the agent paid, what was refused and why, and what the
owner changed, newest first. The public RPCs only return 200 blocks of logs
at a time, so a block explorer's index (Blockscout) is asked one thing:
which transactions touched the vault. Each one's receipt is then fetched
through the wallet and only events the vault itself logged are shown, so
a lying index can hide history but cannot invent a payment
(`web/src/lib/live/history.ts`, tested with an index that lies).

**Every user is isolated by the chain itself.** Each vault is its own
contract with one owner, one agent and one token. Owner actions take a
proof the compiler makes only for the vault's owner (`OwnerCall`), so
another user, the site, the launcher or an agent cannot change your vault.
Each AI connects through its own MCP server process holding only its own
vault's agent key, so one user's agent cannot see or spend from another's
vault. Tests: `fe/src/launcher_tests.fe` (each owner lists only the vaults
they launched; a failed launch adds nothing), `web/tests/mine.test.ts`,
and two browser tests in `web/e2e/live.spec.ts` (the owner sees both of
their vaults; another wallet sees none).

**If the agent's key leaks.** The owner replaces it (`setAgent`): the
leaked key stops paying at once, and the new key may pay after the cooling
period, because a new spender is a loosening too. The agent is stored as a
sealed `Seat` that only the owner's proof changes, so neither the agent nor
an edit to `Pay` can swap it (tests: `fe/src/vault_tests.fe`, the
`agent key` tests in `web/tests/vault.test.ts`). For a working agent at
once, the owner can instead **pause**, **withdraw** and **launch** a new
vault (`web/tests/rotation.test.ts`); that is also the only way for vaults
made through earlier launchers.

## Connect your AI

Any assistant that speaks MCP can become a vault's agent: Claude Code, Claude Desktop, ChatGPT, Cursor, VS Code, or Python agents. `web/mcp/server.ts` gives it five tools: status, preview, pay, recipients, and asking the owner for more. There are no owner tools, and the server never holds the owner's key, so the AI cannot loosen its own limits. `web/mcp/watch.ts` watches the vault 24/7 for the owner and alerts on waiting loosenings, payments, refusals, pauses and the end date. To try it with nothing installed but Node 20+, add the demo to Claude Code in one line, `claude mcp add hardstop-demo -- npx -y github:vaibhav4046/hardstop --demo`, or run that `npx` command in any MCP client's config (a one-file build of the server; the demo is an in-memory network, nothing real). From a clone: `cd web && HARDSTOP_FAKE=1 node mcp/server.ts`. Setup for each client is in [`web/mcp/README.md`](../web/mcp/README.md).
