# Upstream issues for the Fe compiler

**Repository:** [argotorg/fe](https://github.com/argotorg/fe). `ethereum/fe` redirects there; the
official starter (`fe-lang/builders-challenge-starter`) links its issue tracker; release `v26.6.0`
there is commit `5b3f96a`, the one `fe --version` reports. `fe-lang/fe` is a fork with issues
turned off.

**Posted on 2026-11-19**, with the owner's approval, as six issues and two pull requests. On
2026-11-20 a Fe maintainer (micahscopes) approved #2042: "Thanks for catching this! My initial
look suggests this is ready to go, but I'm doing a more thorough review." Fe's own CI then
passed on it (lint, tests on Ubuntu and Windows, native ARM64, wasm). Nothing is merged yet;
the other pull request and the issues have no reply yet.

| Draft | Posted as | Fix |
|---|---|---|
| 1, `pub(in path)` | [argotorg/fe#2037](https://github.com/argotorg/fe/issues/2037) | |
| 2, `#[cfg]` predicates | [argotorg/fe#2038](https://github.com/argotorg/fe/issues/2038) | |
| 3, block timestamp in `fe test` | [argotorg/fe#2039](https://github.com/argotorg/fe/issues/2039) | pull request [argotorg/fe#2048](https://github.com/argotorg/fe/pull/2048) (posted 2026-11-20) |
| 4, unknown attributes | [argotorg/fe#2035](https://github.com/argotorg/fe/issues/2035) | pull request [argotorg/fe#2041](https://github.com/argotorg/fe/pull/2041) |
| 5, `#[must_use]` and bindings | [argotorg/fe#2040](https://github.com/argotorg/fe/issues/2040) | |
| 6, private traits and the capability seal | [argotorg/fe#2036](https://github.com/argotorg/fe/issues/2036) | pull request [argotorg/fe#2042](https://github.com/argotorg/fe/pull/2042) |

The optional draft at the end was not posted. Each posted body is the text between the fences
below plus a line saying where it was found and that it was drafted with AI assistance.

Every reproduction below was run on `fe 26.6.0 (5b3f96a)` (Windows) in a scratch ingot, and the
output is pasted as printed (`--color never`). Where a draft says "still the case on `master`",
that comes from reading the source at `6cd57cc` (2026-11-18), not from running it.

Candidates from the list, after checking:

| | Candidate | Result |
|---|---|---|
| a | Operator impls can't be called in `const fn` | **Dropped as stated.** Writing the impl method as `const fn add(...)` works, and `static_assert` evaluates it (std does this for `Timestamp`). A smaller diagnostics draft is at the end, optional. |
| b | `pub(in path)` not supported | Verified. Draft 1. |
| c | `#[cfg(test)]`, `not`, `any` refused | Verified. The accepted list is wider than "evm and native" (also `wasm`, `target_os`, `target_family`). Draft 2. |
| d | `fe test` can't move the block timestamp | Verified. No `#[test]` argument, harness option or std helper sets it; `Ctx` is sealed. Draft 3. |
| e | Unknown attributes accepted silently | Verified. Draft 4. |
| f | `#[must_use]` only enforced on bare statements | Verified for `let x = f()`; `let _ = f()` is the documented way to discard. Draft 5, marked as possibly intended. |

---

## Draft 1: `pub(in path)` visibility

**Title:** Support `pub(in path)` visibility

**Suggested labels:** `type: feature`, `comp: parser`

**Duplicate search:** none found. Searched `pub(in`, `visibility`, `restricted visibility`,
`pub super` (open and closed, issues and PRs). Nearest: #598 (closed, 2021, the original `pub`
modifier). The parser message is unchanged on `master` (`crates/parser/src/parser/item.rs`).

````markdown
### What happened

`pub(in path)` is rejected by the parser:

```fe
pub mod inner {
    pub mod token {
        pub struct Ticket { id: u64 }

        impl Ticket {
            pub(in ingot::inner::issuer) fn new(_ id: u64) -> Ticket {
                Ticket { id }
            }

            pub fn id(self) -> u64 {
                self.id
            }
        }
    }

    pub mod issuer {
        use super::token::Ticket

        pub fn issue() -> Ticket {
            Ticket::new(1)
        }
    }
}
```

`fe check`:

```
error[1-0001]: `pub(in path)` is not yet supported; use `pub(ingot)` or `pub(super)`
  ┌─ src/lib.fe:6:17
  │
6 │             pub(in ingot::inner::issuer) fn new(_ id: u64) -> Ticket {
  │                 ^^ `pub(in path)` is not yet supported; use `pub(ingot)` or `pub(super)`

error[2-0003]: `new` is not visible
   ┌─ src/lib.fe:20:21
   │
 6 │             pub(in ingot::inner::issuer) fn new(_ id: u64) -> Ticket {
   │                                             --- `new` is defined here
   ·
20 │             Ticket::new(1)
   │                     ^^^ `new` is not visible
```

The suggested `pub(super)` compiles, but it makes `new` visible to every module under `inner`,
not only `issuer`. Adding a sibling `inner::other` that calls `Ticket::new(99)` also compiles.

### Expected

`pub(in path)` accepted, so that an item can be visible to one named ancestor module (here
`inner::issuer`) and its children, as in Rust.

### Why it matters

We use private fields plus a single constructor to make a type that only one module can create
(a capability-style "proof" value); with only `pub(super)` / `pub(ingot)`, the constructor has to
be visible to every sibling, so the guarantee covers a whole module tree instead of one module.

Version: `fe 26.6.0 (5b3f96a)`.
````

---

## Draft 2: `#[cfg]` predicates (`test`, `not`, `any`, `all`)

**Title:** `#[cfg]` accepts only single `key = "value"` predicates: no `test`, `not(...)`, `any(...)`, `all(...)`

**Suggested labels:** `type: feature`, `comp: analyzer`

**Duplicate search:** none found. Searched `cfg`, `cfg(test`, `cfg not`, `cfg attribute`,
`conditional compilation`, `test only`. Related: PR #1989 (merged 2026-11-12, after 26.6.0) added
`target_arch`; `CfgPredicate` on `master` (`crates/hir/src/core/lower/attr.rs`) still has no
`test` key and no combinators.

````markdown
### What happened

```fe
#[cfg(test)]
pub fn test_only_helper() -> u64 {
    1
}

#[cfg(not(target = "native"))]
pub fn evm_only() -> u64 {
    2
}

#[cfg(any(target = "evm", target = "native"))]
pub fn both() -> u64 {
    3
}
```

`fe check` (and `fe test`, which then reports `tests::compile` as failed):

```
error[12-0002]: invalid `#[cfg]` attribute form on item
  ┌─ src/lib.fe:1:1
  │
1 │ #[cfg(test)]
  │ ^^^^^^^^^^^^ expected `#[cfg(target = "evm")]`, `#[cfg(target = "native")]`, `#[cfg(target = "wasm")]`, `#[cfg(target_os = "linux")]`, `#[cfg(target_os = "macos")]`, or `#[cfg(target_family = "unix")]`

error[12-0002]: invalid `#[cfg]` attribute form on item
  ┌─ src/lib.fe:6:1
  │
6 │ #[cfg(not(target = "native"))]
  │ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ expected `#[cfg(target = "evm")]`, `#[cfg(target = "native")]`, `#[cfg(target = "wasm")]`, `#[cfg(target_os = "linux")]`, `#[cfg(target_os = "macos")]`, or `#[cfg(target_family = "unix")]`

error[12-0002]: invalid `#[cfg]` attribute form on item
   ┌─ src/lib.fe:11:1
   │
11 │ #[cfg(any(target = "evm", target = "native"))]
   │ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ expected `#[cfg(target = "evm")]`, `#[cfg(target = "native")]`, `#[cfg(target = "wasm")]`, `#[cfg(target_os = "linux")]`, `#[cfg(target_os = "macos")]`, or `#[cfg(target_family = "unix")]`
```

### Expected

- A `test` predicate that holds when compiling for `fe test`, so an item (a helper, a
  constructor, an impl) can exist only in test builds.
- `not(...)`, `any(...)` and `all(...)` over the existing predicates.

`[profiles.test]` in `fe.toml` exists, but as far as I can tell it only sets `arithmetic`, so it
does not cover this.

### Why it matters

Without `cfg(test)`, a library that wants a test-only way to construct an otherwise sealed type
has to ship that constructor in every build, which weakens the guarantee the type exists for;
without `not`/`any`, code shared by two of three targets needs one copy per target.

Version: `fe 26.6.0 (5b3f96a)`.
````

---

## Draft 3: setting the block timestamp in `fe test`

**Title:** `fe test`: no way to set or advance the block timestamp

**Suggested labels:** `type: feature`, `type: tests`, `comp: CLI`

**Duplicate search:** no duplicate. Searched `timestamp`, `block timestamp test`, `warp`,
`cheatcode`, `block number test`, `set_block_timestamp`. Related: #309 (open, 2021, "Make contract
testing utilities available to all"), which lists `set_block_timestamp!(...)` among ideas for a
Rust test library that predates `fe test`. If the owner prefers, this could instead be a comment
on #309; a new issue seems clearer because it is about `fe test` itself.

What was checked before calling this missing (source at `5b3f96a`, and `master` at `6cd57cc`):
`#[test]` arguments are only `balance`, `should_revert`, `panic`, `selector`
(`crates/codegen/src/test_output.rs`); the harness's `ExecutionOptions` has caller, gas, gas price,
value and nonce, no block fields (`crates/contract-harness/src/lib.rs`); std has no test helper for
block values, and `std::evm::Ctx` is sealed (`EvmCapabilitySeal`), so a test cannot pass its own
`Ctx` to a contract. std's `random.fe` suggests driving code through an effect instead of mocking
block values; that works for library code but not for a deployed contract whose handler reads
`ctx.timestamp()`.

````markdown
### What happened

Under `fe test` the block timestamp is always 1, and there is no way to change it:

```fe
use std::evm::{Ctx, Evm}

/// The block timestamp under `fe test` is 1 and does not change.
#[test]
fn timestamp_is_fixed() uses (evm: mut Evm) {
    assert!(evm.timestamp().as_seconds() == 1)
}

/// There is no `#[test]` argument for the block time.
#[test(timestamp = 1000)]
fn timestamp_argument() uses (evm: mut Evm) {
    assert!(evm.timestamp().as_seconds() == 1000)
}
```

`fe test`:

```
PASS  [0.0003s] timestamp_is_fixed
FAIL  [0.0003s] timestamp_argument
    Test reverted: 0x4e487b710000000000000000000000000000000000000000000000000000000000000001

test result: FAILED. 1 passed; 1 failed

failures:
    timestamp_argument
```

(`timestamp = 1000` is also accepted without any diagnostic; see the separate issue on unknown
attributes.)

I could not find another way: the `#[test]` arguments are `balance`, `should_revert`, `panic` and
`selector`, and `Ctx` is sealed, so a test cannot hand a contract its own clock.

### Expected

Some way to set the block timestamp (and ideally block number) for a test, and to move it
between calls within one test, e.g. a `#[test(timestamp = N)]` argument plus a test-only effect
or std function that advances it.

### Why it matters

Contract logic that depends on time (a delay before a change takes effect, a rolling spending
window) cannot be tested end to end with `fe test`; we test that logic on pure functions instead
and cover the deployed contract with an external harness.

Version: `fe 26.6.0 (5b3f96a)`.
````

---

## Draft 4: unknown attributes are accepted without a diagnostic

**Title:** Unknown attributes on items (e.g. a misspelled `#[must_use]`) are accepted silently

**Fix ready:** [`fe-patches/1-unknown-attributes.patch`](fe-patches/1-unknown-attributes.patch), against
`master` at `6cd57cc`. Unknown attributes on items, members, fields, variants, msg variants and
`for` loops become error `12-0008`, with "did you mean" for close names; `#[test(..)]` accepts only
the keys `fe test` reads. New uitest snapshots (`unknown_attr`, `attr_test_args`); no existing
snapshot changes. `cargo test --workspace --exclude fe-bench` on Windows: 2672 passed, 1 failed
(`mock_lsp_checks_for_the_project_target`, which fails the same way on unmodified `master` there).
HARDSTOP builds and passes `fe test` (92) with the patched compiler. Posted as [argotorg/fe#2041](https://github.com/argotorg/fe/pull/2041).

**Suggested labels:** `type: bug` (or `type: ui/ux`), `comp: analyzer`

**Duplicate search:** none found. Searched `unknown attribute`, `unrecognized attribute`,
`attribute typo`, `attribute ignored`, `mustuse`. On `master`, unknown attributes are refused only
in restricted contexts (recv arms and contract entries, via
`validate_unknown_attrs_in_restricted_context`).

````markdown
### What happened

```fe
#[mustuse]
pub struct Proof { ok: bool }

#[must_use]
pub struct Checked { ok: bool }

#[definitely_not_an_attribute(foo = 1)]
pub fn make() -> Proof {
    Proof { ok: true }
}

pub fn make_checked() -> Checked {
    Checked { ok: true }
}

pub fn drop_both() {
    make()
    make_checked()
}
```

`fe check` reports only the correctly spelled one:

```
error[8-0082]: unused value of type `Checked`
   ┌─ src/lib.fe:18:5
   │
18 │     make_checked()
   │     ^^^^^^^^^^^^^^ use this value or explicitly discard it with `let _ = ...`
   │
   = this type is marked `#[must_use]`
```

`#[mustuse]` and `#[definitely_not_an_attribute(foo = 1)]` produce nothing, so the misspelled
`#[mustuse]` silently turns the check off. The same happens to unknown `#[test(...)]` arguments:
`#[test(timestamp = 1000)]` compiles and the argument is ignored.

Recv arms already refuse unknown attributes:

```fe
msg Msg {
    #[selector = sol("ping()")]
    Ping -> u256,
}

contract C {
    recv Msg {
        #[payabel]
        Ping -> u256 {
            1
        }
    }
}
```

```
error[12-0004]: unsupported `#[payabel]` attribute on recv arm
  ┌─ src/lib.fe:8:9
  │
8 │         #[payabel]
  │         ^^^^^^^^^^ expected `#[payable]`
```

### Expected

An error (or at least a warning) for an attribute name the compiler does not recognise on any
item, and for unknown `#[test(...)]` arguments, ideally with a "did you mean" suggestion, as the
recv-arm check does.

### Why it matters

Attributes like `#[must_use]` carry safety properties; a typo removes the property without any
sign, and the code still compiles and passes its tests.

Version: `fe 26.6.0 (5b3f96a)`.
````

---

## Draft 5: `#[must_use]` and named bindings (possibly intended)

**Title:** `#[must_use]` value bound to a name that is never used gives no diagnostic

**Suggested labels:** `type: RFC / discussion / question` (or `type: feature`), `comp: analyzer`

**Duplicate search:** none found. Searched `must_use`, `unused variable`, `unused binding`,
`lint warning`. `#[must_use]` came in with PR #1468 (merged 2026-05-29); its description does not
discuss bindings.

This one may well be intended: the diagnostic itself recommends `let _ = ...` as the way to
discard, which matches Rust, where `let x = f()` also satisfies `#[must_use]` and the unused
binding is caught by a separate `unused_variables` lint. The draft is written as a question.

````markdown
### What happened

```fe
#[must_use]
pub struct Proof { ok: bool }

#[must_use]
pub fn compute() -> u64 {
    1
}

pub fn make() -> Proof {
    Proof { ok: true }
}

pub fn bound_but_unused() {
    let p = make()
    let n = compute()
}

pub fn discarded() {
    let _ = make()
    let _ = compute()
}

pub fn bare() {
    make()
    compute()
}
```

`fe check` reports only the bare statements in `bare`:

```
error[8-0082]: unused value of type `Proof`
   ┌─ src/lib.fe:24:5
   │
24 │     make()
   │     ^^^^^^ use this value or explicitly discard it with `let _ = ...`
   │
   = this type is marked `#[must_use]`

error[8-0082]: unused return value of function `compute`
   ┌─ src/lib.fe:25:5
   │
25 │     compute()
   │     ^^^^^^^^^ use this value or explicitly discard it with `let _ = ...`
   │
   = this function is marked `#[must_use]`
```

`let _ = ...` in `discarded` is accepted, as the message says it should be. `let p = make()` and
`let n = compute()` in `bound_but_unused` are also accepted, and there is no unused-variable
diagnostic for `p` or `n`.

### Question

Is this the intended scope of `#[must_use]`? If so, would an unused-binding diagnostic (at
least for bindings of `#[must_use]` values) be welcome, so that `let p = make()` with `p` never
read is reported the way a bare `make()` is?

### Why it matters

We use a `#[must_use]`, non-`Copy` type as a proof that a check was done; a binding that is never
read drops the proof as silently as a bare statement would have, and nothing reports it.

Version: `fe 26.6.0 (5b3f96a)`.
````

---

## Draft 6: private traits are not visibility-checked, so std's sealed EVM capabilities can be forged

**Title:** Private trait usable in `impl` and bounds from anywhere; `std::evm` capability seal can be implemented by user code

**Suggested labels:** `type: bug`, `comp: analyzer`

**Found:** 2026-11-19, while trying to make HARDSTOP's `Pay` handler unable to move tokens except
through one function. Removing `mut call` from `Pay`'s `uses` did not stop a transfer: a
user-defined type implementing `Call` made it. In `fe test` that edit moved 8 test dollars to the
caller instead of 4 to the shop.

**Duplicate search:** none found (2026-11-19). Searched issues and PRs, open and closed, for
`EvmCapabilitySeal`, `private trait visibility`, `private trait impl`, `sealed trait`,
`trait not visible`, `visibility trait bound`, `visibility`, `2-0003`, `is not visible`. Nearest:
#598 (closed, 2021, the original `pub` modifier) and PR #1345 (closed, "Fix trait bound diag",
about a different diagnostic). HARDSTOP's refusal script keeps the edit as a control under "NOT
covered by Fe 26.6".

**Fix ready:** [`fe-patches/2-private-trait-visibility.patch`](fe-patches/2-private-trait-visibility.patch),
against `master` at `6cd57cc`. Trait-ref lowering resolves the path without a visibility check;
the patch reports `2-0003` from `trait_ref_arg_diags`, which every place that names a trait
already calls: `impl` headers, generic-parameter bounds, `where` clauses, super-traits and
associated-type bounds. New uitest `name_resolution/trait_ref_visibility` (five refusals; a
private trait used in its own module or a child module, a `pub` trait and a `pub(super)` one
stay accepted). std still builds: its one `impl EvmCapabilitySeal for Evm` is in the trait's
module. With the patched compiler HARDSTOP passes `fe test` (92), and
`scripts/pay-cannot-loosen.sh` requires the forged `Call` and stand-in `Ctx` to be refused at
the seal. `cargo test --workspace --exclude fe-bench --no-fail-fast` on Windows, with both
patches: 2672 passed, 1 failed (`mock_lsp_checks_for_the_project_target`, which fails the same
way on unmodified `master` there). The diff touches no file the attribute patch touches, so it
applies to `6cd57cc` on its own (run alone there: the same 2672 passed, 1 failed). Posted as
[argotorg/fe#2042](https://github.com/argotorg/fe/pull/2042).

Reproduced on `fe 26.6.0 (5b3f96a)` and on a local build of `master` at `6cd57cc`
(`fe 26.6.0 (427588afb)`, master plus one unrelated attribute-diagnostics commit). `trait
EvmCapabilitySeal {}` is private in `ingots/std/src/evm/effects.fe` (line 201) in both.

````markdown
### What happened

Private functions and structs are refused outside their module:

```fe
mod inner {
    fn hidden() {}
    struct HiddenStruct {}
}
fn call_it() {
    inner::hidden()
}
fn use_it(_ s: inner::HiddenStruct) {}
```

```
error[2-0003]: `hidden` is not visible
error[2-0003]: `HiddenStruct` is not visible
```

A private trait is not. Each of these passes `fe check` with no diagnostic:

```fe
mod inner {
    trait Hidden {}
}
pub struct S {}
impl inner::Hidden for S {}
```

```fe
fn bound<T: std::evm::effects::EvmCapabilitySeal>(_ x: T) {}
```

The second matters because `std::evm::effects` uses the private `EvmCapabilitySeal` as a seal:
`pub trait Ctx: EvmCapabilitySeal`, and the same for `RawStorage`, `Log`, `Create` and `Call`.
User code can implement the seal and then the capability. `Call`'s methods have default bodies, so
the forged capability makes real calls:

```fe
use std::evm::{Call, Address}

pub struct Forged {}
impl std::evm::effects::EvmCapabilitySeal for Forged {}
impl Call for Forged {}

// No `Call` in this function's `uses`, yet it provides one to `reach`.
pub fn no_call_effect_declared(target: Address) {
    var forged = Forged {}
    with (Call = mut forged) {
        reach(target)
    }
}

fn reach(_ target: Address) uses (call: mut Call) {}
```

`fe check`: no output, exit 0. Without the `impl ... EvmCapabilitySeal` line it fails with
`error[6-0003]: trait bound is not satisfied`, so the seal is what is supposed to stop this.

### Expected

`2-0003` (`... is not visible`) for a private trait named in an `impl` header or a bound outside
its module, as for private functions and structs.

### Why it matters

A handler's `uses` clause reads as the complete list of what it may do. If any function can mint
its own `Call` (or `Log`, `Create`, `RawStorage`), a handler without `Call` in its `uses` can still
make external calls, so "this handler declares no `Call`, therefore it cannot move tokens" does
not hold. Contracts that rely on effects for authority get less than they appear to.

Version: `fe 26.6.0 (5b3f96a)`; also on `master` at `6cd57cc`.
````

---

## Optional draft (from candidate a, reduced): `const fn` error points at the trait, not the impl

Candidate a as stated did not reproduce: marking the impl method `const fn` makes the operator
usable in `const fn` and `static_assert` (verified, including a deliberately false
`static_assert` that reports `left: 3`). What is left is the diagnostic, which never mentions that
fix. Post only if the owner thinks it is worth it.

**Title:** "non-const call in `const fn`" for an operator should point at the impl and suggest `const fn`

**Suggested labels:** `type: ui/ux`, `comp: analyzer`

**Duplicate search:** none found. Searched `const fn trait`, `const fn operator`,
`non-const call`, `const impl`. Related but different: PR #1811 (merged, reports const-evaluation
errors at their source in trait references) and #1349 (open, `saturating_*` in `const fn`; in
26.6.0 `saturating_add` inside a `const fn` impl method did evaluate in `static_assert`).

````markdown
### What happened

```fe
pub struct Secs { v: u64 }

impl Copy for Secs {}

impl core::ops::Add<Secs> for Secs {
    fn add(own self, _ other: own Secs) -> Secs {
        Secs { v: self.v + other.v }
    }
}

const fn plus(_ a: Secs, _ b: Secs) -> Secs {
    a + b
}

static_assert(plus(Secs { v: 1 }, Secs { v: 2 }).v == 3)
```

`fe build`:

```
error[3-0024]: non-const function call in const context
   ┌─ src/lib.fe:12:5
   │
12 │     a + b
   │     ^^^^^ calls in const context must be `const fn`

error[8-0062]: non-const call in `const fn`
   ┌─ src/lib.fe:12:5
   │
12 │     a + b
   │     ^^^^^ `add` is not a `const fn`
   │
   ┌─ src/ops.fe:6:8
   │
 6 │     fn add(own self, _ other: own T) -> Self::Output
   │        --- callee defined here
```

Writing the impl method as `const fn add(own self, _ other: own Secs) -> Secs` fixes it (std does
this for `Timestamp`), but the error does not say so. The secondary label points at the trait
declaration in `core`, shown as `src/ops.fe`, which reads like a file in the user's ingot, rather
than at the `impl` that was selected.

### Expected

Point at the user's `impl core::ops::Add<Secs> for Secs` method and suggest marking it
`const fn`. The same applies to comparison operators (`Ord::lt` etc.).

### Why it matters

We wanted `static_assert`s over functions on time newtypes and first read the error as "operators
on user types cannot be used in `const fn`"; the actual fix is one keyword.

Version: `fe 26.6.0 (5b3f96a)`.
````
