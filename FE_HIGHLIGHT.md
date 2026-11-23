# Fe highlight

The long version of the README's "Fe highlight": what the Fe compiler
enforces in HARDSTOP, how CI proves each part, and what it does not cover.
Every compile error named below is one that
[`scripts/pay-cannot-loosen.sh`](scripts/pay-cannot-loosen.sh) requires on every
push; checks that happen when the code runs are named as `fe test` tests.

## Check it in three commands

With Fe 26.6.0 on your path, from the repository root:

```
$ cd fe && fe test
test result: ok. 101 passed; 0 failed

$ cd .. && FE=fe bash scripts/pay-cannot-loosen.sh
ok   control: Pay may write its own ledger
ok   refused: Pay writing terms
ok   refused: Pay approving a recipient
...
ok   refused: amend applying a raise at once
                                   (72 lines starting ok: 30 refused, 7 controls, 7 source checks,
                                    28 edits the source checks catch)

$ gh run list -R vaibhav4046/hardstop -L 1
                                   (CI runs both on every push, plus the patched compiler: job patched-fe;
                                    and every night on unpatched Fe master: .github/workflows/fe-master.yml)
```

Output pasted from a run on 2026-11-21. [CI runs](https://github.com/vaibhav4046/hardstop/actions/workflows/ci.yml).

## On one screen

| Claim | Enforced by | Edit that must fail, and its error |
|---|---|---|
| The agent's `Pay` cannot change the rules or approve a recipient | `terms`, `approved_from` without `mut` in `Pay`'s `uses` | assign either in `Pay`: 8-0018, 8-0066 |
| No handler can make new rules except through the cooling period | sealed `Terms` (private field) | build or write `Terms`: 2-0003; store a plain `Rules`: 8-0000 |
| Old rules cannot be kept and put back later | `Terms` is not `Copy`; `amend`, `cancel` and `pause` take `mut self` and change the stored rules in place | save the stored rules aside, or put saved rules back: 16-0002 ("cannot move out of storage"); keep a second copy of the founding rules: 16-0002 ("cannot use a value after it was moved") |
| No handler can approve a recipient at once | sealed `Approval` | store a date: 8-0000; build an `Approval`: 2-0003 |
| Owner changes happen at the chain's own time | `OwnerCall` carries the block time in a private field, read by `prove` from the concrete `Evm`; `Terms`'s functions take no time argument | a made-up time passed to `amend`: 8-0023; a hand-made proof with a made-up time: 2-0003 |
| Owner actions need the real owner, once | sealed `OwnerCall`, `own`, not `Copy`, `#[must_use]`, `prove` takes the concrete `Evm` | hand-made proof or `Owner`: 2-0003; `authorize`'s proof or a stand-in `Ctx` passed to `prove`: 8-0000; no proof: 8-0012; reuse: 16-0002; drop: 8-0082 |
| Verdict codes and the ratchet's laws hold | `const fn` + `static_assert` in `kernel.fe` | two verdict-code edits and five law-breaking kernel edits: 8-0081; `+` wrapping: 3-0034 |
| Checked when the code runs, not compiled | `open` and `founding` only while deploying; a copied `Approval` approves no one | `fe test`: `open_works_only_while_deploying`, `founding_works_only_while_deploying`, `a_copied_approval_approves_no_one`, `zeroed_terms_cannot_be_raised` |
| Not covered by the compiler | an older `Approval` kept in a second storage map and put back (`Approval` is still `Copy`: Fe 26.6's `StorageMap::get` requires `V: Copy`, so a value kept in a map has to be); `Pay` writing its own ledger other than from the verdict | edits compile; a source check (text, not the compiler) allows one stored `Terms`, one approval map, and only `ledger = next` in `Pay`, and catches these edits and a second `Terms` field; `fe test`: `a_cancel_after_a_pause_keeps_the_agent_paused`, `a_cancel_after_lowering_a_limit_keeps_it_low`, `a_cancel_after_removing_a_recipient_keeps_it_removed` |
| Not covered by the compiler | what `Pay` tells the kernel: the caller, whether the recipient is approved, the ledger, the rules and the time it passes to `decide`, and refusing a catch-all arm that pays past `Decision::Deny` or tuple rebinding of arguments | edits compile (CI shows one: "every recipient is approved"); a source check (text, not the compiler) requires those contiguous lines in `Pay`, and catches six edits that subvert them |
| Not covered by the compiler | a new handler, or a capability added to one; a `Terms` kept under an alias or a glob import; a token allowance granted to the caller; the time `Pay` gives `decide` | edits compile and pass `fe test`; a source check (text, not the compiler) pins the vault's imports, storage fields, handlers and their `uses` exactly, refuses aliases, globs and token approvals, and requires every `now` to be the chain's; it catches six such edits (one of them, a made-up time in `Propose`, the compiler now refuses too) |
| Not covered by the compiler | the bodies of `vault.fe` (including `init`, `Withdraw`, owner controls and post-contract helpers), of `prove` and the rest of `kernel/sealed.fe`, of the helpers around the contract (`seconds`, `founded`), and all of `launcher.fe` and `kernel.fe` | edits compile (and `init` / `seconds` / `prove` / `Withdraw` / post-contract edits can pass `fe test` if time-gated or left unexercised; an AI review panel found `init`, `tx.origin`, `seconds`, launcher blank-recipient, `kernel.fe` date-gated caps/maturities, and `Withdraw`/post-contract gaps); a source check pins full `vault.fe` plus `prelude`/`init`, `sealed.fe`, `launcher.fe` and `kernel.fe` by sha256 (comments and blank lines ignored), and catches nine such edits; `launcher.test.ts` also reads every rule of a launched vault back |
| Runtime vs native & view consistency | view handler outputs (`policy()`, `queued()`, ...) matching the native specification | `differential.test.ts` checks 2,400 payment requests + 480 exposure queries against the native kernel, and `vault-code.test.ts` pins the vault runtime bytecode hash |
| Not covered on Fe 26.6 | where `Pay` sends allowed money; a forged `Call` or `Ctx` (Fe bug [argotorg/fe#2036](https://github.com/argotorg/fe/issues/2036), fixed on Fe master by this project's [#2042](https://github.com/argotorg/fe/pull/2042), merged 2026-11-21) | edits compile; tests catch the first, and a source check (text, not the compiler) requires `Pay`'s only transfer to be `safe_transfer(token, receiver: to, amount)`. With [`research/fe-patches`](research/fe-patches/) applied, both forgeries fail with 2-0003, checked by CI job `patched-fe` |

The first seven rows are edits that
[`scripts/pay-cannot-loosen.sh`](scripts/pay-cannot-loosen.sh) requires to fail,
and the last row's are controls it requires to compile, run by CI job `verify`
on the pinned Fe 26.6 release on every push.

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
        to_approved: cooled(at: approved_from.get(key: to).of(to), now),
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
so the function that makes the decision cannot read storage, call out, or
log. One exception on Fe 26.6: code with no `uses` clause can still set up
a forged `Call` with a `with` block and call out (Fe bug
[argotorg/fe#2036](https://github.com/argotorg/fe/issues/2036), fixed on Fe
master by this project's [#2042](https://github.com/argotorg/fe/pull/2042)).

What the compiler does not check here is the transfer. `decide` says
whether `to` may receive `amount`; the `safe_transfer` after it is ordinary
code, and an edit that sends the caller a thousand times `amount` compiles.
The tests catch it, and so does the script's source check. Taking `mut call` away from `Pay` would not change
that in Fe 26.6: `Call`'s methods have default bodies and its seal trait,
`std::evm::effects::EvmCapabilitySeal`, is private but can be implemented
from any ingot (Fe does not check a private trait's visibility in an `impl`;
reported as [argotorg/fe#2036](https://github.com/argotorg/fe/issues/2036)),
so any type can implement `Call`, and a function whose `uses` lists no `Call` can still
transfer tokens (such an edit, in a `Pay` without `mut call`, moved money
in a local `fe test`). A sealed payout value would bind only the path that
uses it, not every path, so the vault does not have one. The script keeps
both edits as controls that must compile on Fe 26.6.

The forged `Call` is a compiler bug, and it is fixed by this project's pull
request [argotorg/fe#2042](https://github.com/argotorg/fe/pull/2042), merged
into Fe on 2026-11-21 (the nightly CI job `fe-master` builds unpatched Fe master, whose head on 2026-11-21 is the #2042 merge, and HARDSTOP passes its 101 tests there with the forged `Call` and stand-in `Ctx` refused; the same patch is
[`research/fe-patches/2-private-trait-visibility.patch`](research/fe-patches/2-private-trait-visibility.patch)):
a private trait named in an `impl` header, a bound, a `where` clause, a
super-trait or an associated-type bound outside its module is now "not
visible" (2-0003), as a private function or struct already is. With the
patched compiler, HARDSTOP still passes `fe test` (101), and the refusal
script, which checks whichever compiler it is given, requires the forged
`Call` and the stand-in `Ctx` below to be refused at the seal instead of
compiling. CI and the deployed contracts use the unpatched 26.6 release.

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
each test fails if its check is removed.

**Recipient approvals are sealed the same way.** The recipient map stores
`Approval`s, also from `sealed.fe`, whose fields only that module can see.
New ones come from `founding`, for the recipients named when the vault is
created, and from `Terms::approve_from`, which takes an `OwnerCall` and runs
the kernel's `approve_from`, so a new recipient waits out the cooling
period. In `SetRecipient`, the one handler that lists `mut approved_from`,
the script requires storing a date (8-0000, "expected `Approval`") and
storing a hand-built `Approval` (2-0003) each to fail. Two parts are checked
when the code runs: `founding` returns nothing once the contract has code,
as `open` does; and copying an approval the kernel made under another
address compiles, but an `Approval` names the address it was made for, so
the copy approves no one. `fe test` checks both
(`founding_works_only_while_deploying`, `a_copied_approval_approves_no_one`),
and each test fails if its check is removed.

**The owner proof is bound to the real caller by the compiler.**
`Terms::amend`, `cancel`, `pause` and `approve_from`, and the vault's
`pay_owner`, each take an `OwnerCall`. Its field is private to `sealed.fe`,
and only `prove(owner, ctx)` makes one, when `ctx.caller()` is the address
in `owner` (what `prove` does is pinned by the sha256 of `sealed.fe`, a
source check: the compiler pins who may call it, not its body). `owner` must be an `Owner`, another sealed type that only `open`
makes, so only during deployment. `ctx` must be an `Evm`, the concrete type
whose methods read the EVM itself. A stand-in that implements `Ctx` and
reports any caller does compile on Fe 26.6 (the trait's private seal,
`std::evm::effects::EvmCapabilitySeal`, can be implemented from outside
`std`; see argotorg/fe#2036 and the patch above), and could be supplied to a
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
assertion failed", 8-0081), and the same CI script proves it.
`Reason::code` and `Decision::code` are `const fn` as well, and a
`static_assert` for every verdict requires it to answer with its own
constant, so pointing a reason at another reason's constant also fails the
build (the script checks one such edit).

**The ratchet's laws are checked when the kernel compiles.** Fe 26.6
evaluates `const fn`s inside `static_assert`, operator methods included
(`impl core::ops::Add<Seconds> for Instant { const fn add(..) }` makes `+`
usable there). `amend`, `cancel`, `matures_at`, `loosens`, `meet`, `cooled`,
`Rules::current` and the `Instant` and `Seconds` operators are `const fn`,
and the end of [`fe/src/kernel.fe`](fe/src/kernel.fe) runs them on fixed
values: the
tightest policy, the loosest (every limit at its maximum, valid until
`NEVER`), ordinary ones, and one changed in a single field at a time. The
asserts state that no policy loosens itself; that `meet` is idempotent and
never looser than either input; that `NOT_SET` and `NEVER` never take
effect and a queued policy is in force only from its moment on; that `+`
saturates at `NEVER`; and that `amend` and `cancel` themselves, called
directly on fixed rules, keep the ratchet: a raise leaves the active policy
as it was and is queued for `now + cooling_secs`; a tightening applies at
once and drops a waiting raise; a mixed proposal applies its tighter fields
at once and queues the rest; `matures_at` gives `NEVER` for a cooling
period past the end of time and never second zero; and `cancel`, before or
after a raise matures, leaves nothing looser than what was in force. Every
law-breaking edit tried fails the build: `meet` keeping the larger cap or
the later end, or dropping a pause; `loosens` ignoring any one field;
`cooled` letting `NEVER` through or firing a second early; `current`
ignoring the queue; `amend` applying a raise at once ("static assertion
failed", 8-0081); and `+` wrapping instead of saturating ("arithmetic
overflow in const context", 3-0034). CI checks six of them: `meet` keeping
the larger cap, `loosens` ignoring the window cap, `cooled` letting `NEVER`
through, `current` ignoring the queue, `+` wrapping, and `amend` applying a
raise at once, which only the asserts that call `amend` catch (with them
removed, that edit compiles). What this does not cover: the asserts check
those cases, not every input (breadth comes from `fe test` and the seeded
adversary).

The asserts add no bytecode: all 24 compiled outputs are byte-identical
with or without them. The `const` markings on `amend`, `cancel`,
`matures_at`, `Queued::none`, `Instant::at` and `Seconds::of` do change it:
the vault's runtime was 65 bytes smaller (7,983 bytes then; 6,883 on chain
now that `Terms` changes in place), and since the
launcher carries the vault's code, the launcher's deterministic address
changed with it.

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
