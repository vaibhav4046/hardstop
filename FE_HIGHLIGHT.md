# Fe highlight

The long version of the README's "Fe highlight": what the Fe compiler
enforces in HARDSTOP, how CI proves each part, and what it does not cover.
Every compile error named below is one that
[`scripts/pay-cannot-loosen.sh`](scripts/pay-cannot-loosen.sh) requires on every
push; checks that happen when the code runs are named as `fe test` tests.

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
so the function that makes the decision provably cannot read storage, call
out, or log.

What the compiler does not check here is the transfer. `decide` says
whether `to` may receive `amount`; the `safe_transfer` after it is ordinary
code, and an edit that sends the caller a thousand times `amount` compiles.
Only the tests catch it. Taking `mut call` away from `Pay` would not change
that in Fe 26.6: `Call`'s methods have default bodies and its seal trait,
`std::evm::effects::EvmCapabilitySeal`, is private but can be implemented
from any ingot (Fe does not check a private trait's visibility in an `impl`;
reported as Draft 6 in [`research/UPSTREAM_ISSUES.md`](research/UPSTREAM_ISSUES.md)),
so any type can implement `Call`, and a function whose `uses` lists no `Call` can still
transfer tokens (such an edit, in a `Pay` without `mut call`, moved money
in a local `fe test`). A sealed payout value would bind only the path that
uses it, not every path, so the vault does not have one. The script keeps
both edits as controls that must compile.

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
in `owner`. `owner` must be an `Owner`, another sealed type that only `open`
makes, so only during deployment. `ctx` must be an `Evm`, the concrete type
whose methods read the EVM itself. A stand-in that implements `Ctx` and
reports any caller does compile (the trait's private seal,
`std::evm::effects::EvmCapabilitySeal`, can be implemented from outside
`std`; see Draft 6), and could be supplied to a
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
