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
test result: ok. 112 passed; 0 failed

$ cd .. && FE=fe bash scripts/pay-cannot-loosen.sh
ok   control: Pay may read its own spending
ok   refused: Pay writing terms
ok   refused: Pay replacing its own agent key
ok   refused: Pay approving a recipient
...
ok   refused: exposure ignoring a raise that takes effect in the span
                                   (90 lines starting ok: 46 refused, 6 controls, 8 source checks,
                                    23 edits they catch, 7 edits a test catches)

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
| The worst case is a promise: no signature raises it before the cooling period ends, no payment beats it, and an agent reaches it exactly | 137 `static_assert`s in `kernel/laws.fe` run `amend`, `cancel`, `decide` and `exposure` over a grid of 128 policies (16,384 pairs) | six kernel edits no earlier check catches (`decide` ignoring a cap, the end date or a pause; `exposure` forgetting later windows or a waiting raise): 8-0081 |
| Checked when the code runs, not compiled | `open` and `founding` only while deploying; a copied `Approval` approves no one | `fe test`: `open_works_only_while_deploying`, `founding_works_only_while_deploying`, `a_copied_approval_approves_no_one`, `zeroed_terms_cannot_be_raised` |
| Not covered by the compiler | an older `Approval` kept in a second storage map and put back (`Approval` is still `Copy`: Fe 26.6's `StorageMap::get` requires `V: Copy`, so a value kept in a map has to be); `Pay` writing its own ledger other than from the verdict | edits compile; a source check (text, not the compiler) allows one stored `Terms`, one approval map, and only `ledger = next` in `Pay`, and catches these edits and a second `Terms` field; `fe test`: `a_cancel_after_a_pause_keeps_the_agent_paused`, `a_cancel_after_lowering_a_limit_keeps_it_low`, `a_cancel_after_removing_a_recipient_keeps_it_removed` |
| `Pay` pays only what the kernel allowed, to whom it allowed (2026-11-24) | `Books::judge` reads the caller and time from a sealed `Moment`, the rules from a sealed `TermsNow`, the agent from a sealed `AgentNow` and the recipient's sealed `Approval`; it counts the payment and returns a sealed, use-once `Payout`, the only thing in `vault.fe` that can send money | a hand-made `Payout`, `Moment`, `TermsNow`, `AgentNow`, `Approval` or `Books`: 2-0003; a payout sent twice: 16-0002 |
| The owner can replace the agent's key; the old key stops at once, the new one waits out the cooling period (2026-11-24) | the agent is a sealed `Seat`, not `Copy`, changed in place only by `Seat::replace`, which takes an `OwnerCall` | `Pay` writing its own seat: 8-0018; `SetAgent` without its owner check: 8-0012; the old seat saved aside to put back: 16-0002 |
| Not covered by the compiler | a new handler, or a capability added to one; a `Terms` kept under an alias or a glob import; a token allowance granted to the caller; the time `Pay` gives `decide` | edits compile and pass `fe test`; a source check (text, not the compiler) pins the vault's imports, storage fields, handlers and their `uses` exactly, refuses aliases, globs and token approvals, and requires every `now` to be the chain's; it catches six such edits (one of them, a made-up time in `Propose`, the compiler now refuses too) |
| Not covered by the compiler | the bodies of `vault.fe` (including `init`, `Withdraw`, owner controls and post-contract helpers), of `prove` and the rest of `kernel/sealed.fe`, of the helpers around the contract (`seconds`, `founded`), and all of `launcher.fe` and `kernel.fe` | edits compile (and `init` / `seconds` / `prove` / `Withdraw` / post-contract edits can pass `fe test` if time-gated or left unexercised; an AI review panel found `init`, `tx.origin`, `seconds`, launcher blank-recipient, `kernel.fe` date-gated caps/maturities, and `Withdraw`/post-contract gaps); a source check pins full `vault.fe` plus `prelude`/`init`, `sealed.fe`, `launcher.fe` and `kernel.fe` by sha256 (comments and blank lines ignored), and catches nine such edits; `launcher.test.ts` also reads every rule of a launched vault back |
| Runtime vs native & view consistency | view handler outputs (`policy()`, `queued()`, ...) matching the native specification | `differential.test.ts` checks 2,400 payment requests + 480 exposure queries against the native kernel, and `vault-code.test.ts` pins the vault runtime bytecode hash |
| Not covered on Fe 26.6 | `vault.fe` importing a transfer of its own and calling it beside the payout (a source check refuses any transfer, ERC-20 function or raw call in `vault.fe`, and requires `Pay` to send only the payout, right after `Verdict::Pay`); a forged `Call` or `Ctx` (Fe bug [argotorg/fe#2036](https://github.com/argotorg/fe/issues/2036), fixed on Fe master by this project's [#2042](https://github.com/argotorg/fe/pull/2042), merged 2026-11-21) | edits compile; tests catch the first, and the source check catches it too. With [`research/fe-patches`](research/fe-patches/) applied, both forgeries fail with 2-0003, checked by CI job `patched-fe` |

The first ten rows are edits that
[`scripts/pay-cannot-loosen.sh`](scripts/pay-cannot-loosen.sh) requires to fail,
and the last row's are controls it requires to compile, run by CI job `verify`
on the pinned Fe 26.6 release on every push.

The agent's entire authority is one handler signature. This is `Pay` in
[`fe/src/vault.fe`](fe/src/vault.fe), since 2026-11-24:

```fe
Pay { to, amount, nonce } -> u8
    uses (ctx, seat, token, terms, approved_from, mut ledger, mut call, mut log)
{
    let rules = terms.now()
    let agent = seat.now(ctx)
    let approval = approved_from.get(key: to)
    let at = moment(ctx)
    let pay_in = token
    let verdict = ledger.judge(at, terms: rules, seat: agent, approval, token: pay_in, to, amount, nonce)
    match verdict {
        Verdict::Pay(payout) => {
            payout.send()
            ...
```

`terms`, `seat` and `approved_from` appear without `mut`. "The agent cannot
raise its own limit, approve its own recipient or swap its own key" is
therefore not only a tested behaviour: a `Pay` that assigned to any of them
would not compile. CI proves it on every push:
[`scripts/pay-cannot-loosen.sh`](scripts/pay-cannot-loosen.sh) edits a copy
of `Pay` to write each and requires the compiler to refuse (errors 8-0018
and 8-0066). And `decide` has no `uses` clause at all, so the function that
makes the decision cannot read storage, call out, or log.

**Where `Pay` sends money is the compiler's too.** `vault.fe` holds no
transfer. Everything `Pay` hands the kernel is a sealed value with private
fields: the caller and the time (`Moment`, read by `moment` from the
concrete `Evm`), the stored rules (`TermsNow`), the key that may pay now
(`AgentNow`), the recipient's `Approval`, and the spending so far (`Books`,
which `judge` changes in place). `Books::judge` runs `decide`, counts an
allowed payment, and returns a `Payout`: a sealed, use-once value that can
pay only that recipient that amount, from that token. A hand-made `Payout`,
`Moment`, `TermsNow`, `AgentNow`, `Approval` or `Books` fails with 2-0003; a
payout sent twice fails with 16-0002. Each of these is an edit in the script.

**What the compiler still does not stop** is `vault.fe` importing a
transfer of its own (`std::evm::erc20::safe_transfer`) and calling it beside
the payout. Fe 26.6 has no way to forbid an import, and inside a handler
every host effect is the concrete `Evm`, which implements `Call`, so any
mutable effect `Pay` holds (it needs `mut log` to record a payment) can be
rebound as `Call` (`with (Call = mut log) { ... }`). Before 2026-11-24 a
second reason was a Fe bug: any type could implement the private `Call`
trait (reported as [argotorg/fe#2036](https://github.com/argotorg/fe/issues/2036),
fixed on Fe master by this project's
[#2042](https://github.com/argotorg/fe/pull/2042)). A source check closes
this: it refuses any transfer, ERC-20 function, raw call, `Call =` or
`with (` anywhere in `vault.fe`, and requires `Pay` to send only the payout,
right after `Verdict::Pay`. The script keeps both edits as controls that
must compile on Fe 26.6, and checks that the source check catches each.

The forged `Call` is a compiler bug, and it is fixed by this project's pull
request [argotorg/fe#2042](https://github.com/argotorg/fe/pull/2042), merged
into Fe on 2026-11-21 (the nightly CI job `fe-master` builds unpatched Fe master, whose head on 2026-11-21 is the #2042 merge, and HARDSTOP passes its tests there with the forged `Call` and stand-in `Ctx` refused; the same patch is
[`research/fe-patches/2-private-trait-visibility.patch`](research/fe-patches/2-private-trait-visibility.patch)):
a private trait named in an `impl` header, a bound, a `where` clause, a
super-trait or an associated-type bound outside its module is now "not
visible" (2-0003), as a private function or struct already is. With the
patched compiler, HARDSTOP still passes `fe test`, and the refusal
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
`Terms::amend`, `cancel`, `pause` and `approve_from`, `Seat::replace` and
`withdraw`, each take an `OwnerCall`. Its field is private to `sealed.fe`,
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

**The promise to the owner, checked by the compiler on a grid
(2026-11-24).** The asserts above run the kernel on a few fixed policies.
[`fe/src/kernel/laws.fe`](fe/src/kernel/laws.fe) goes further: Fe 26.6's
`const fn` runs `while` loops, so the compiler itself walks a grid of 128
policies (each cap 0, 1, 100 or the largest number; an end date before,
inside, at the end of, or after the cooling period; paused or not) and runs
`amend`, `cancel`, `decide` and `exposure` on them. `decide`, `exposure` and
two helpers were marked `const fn` for this; every compiled contract is
byte-identical to before, so the deployed vaults are unchanged. 137
`static_assert`s state seven laws:

1. No policy loosens itself, and `meet` of any two is looser than neither
   (all 16,384 pairs).
2. Whatever the owner signs, a tighter limit applies at once and anything
   looser waits out the cooling period, to the second: in force at the last
   second before it ends, not before; at its first second, yes (16,384
   pairs).
3. A raise cancelled before it matures never happens (16,384 pairs).
4. **Whatever the owner signs, the most the agent can move before the
   cooling period ends does not go up** (16,384 pairs, each with nothing,
   1, 100 or everything already spent). This is the product's promise: a
   tricked approval changes nothing the agent can reach in time.
5. `decide` never allows more than the worst case `exposure` reports, and a
   payment uses up at least its own amount of it (1,536 requests; the
   second half is skipped where `exposure` is the largest number, which
   means "unbounded").
6. The worst case is exact: an agent run by the compiler, paying as much as
   it can at every window, gets paid exactly what `exposure` reports (a
   smaller grid of 72 policies with bounded caps, so it can spend all of it).
7. A raise signed now is counted in the worst case of a span in which it
   takes effect (72 × 9 pairs).

They add about 21 seconds to a build (26 s against 5 s for `fe check` on
this machine). Nine broken kernels were tried; all nine fail the build.
Seven of them pass every earlier check, because no earlier compile-time
check ran `decide` or `exposure`: `decide` checking the window cap instead
of what is left in it, or ignoring the payment cap, the end date or a
pause; `exposure` forgetting the windows after this one, a raise that takes
effect in the span, or what was already spent this window. CI runs six of
them on every push (section 8 of
[`scripts/pay-cannot-loosen.sh`](scripts/pay-cannot-loosen.sh)), and a
source check keeps `laws.fe` free of any `pub` item, since it makes owner
proofs by hand. What this is not: a proof for every input. The grid is
chosen to include zero, one, the largest amount and every edge of the
cooling period; breadth still comes from `fe test`, the seeded adversary
and the differential test.

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
