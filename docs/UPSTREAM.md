# HARDSTOP: Fe upstream work

Moved here from the [README](../README.md).

## Feedback to Fe

Building this turned up six compiler issues, filed
upstream with reproductions on 2026-11-19 (argotorg/fe
[#2035](https://github.com/argotorg/fe/issues/2035) to
[#2040](https://github.com/argotorg/fe/issues/2040); text in
[`research/UPSTREAM_ISSUES.md`](../research/UPSTREAM_ISSUES.md)), including
[one](https://github.com/argotorg/fe/issues/2036) where a private trait can be implemented
from any ingot, which lets user code forge `std`'s sealed `Call` and `Ctx`
capabilities. Three have fixes from this project:
[#2048](https://github.com/argotorg/fe/pull/2048), which lets `fe test` set
the block time and number, was merged into Fe on 2026-11-20;
[#2042](https://github.com/argotorg/fe/pull/2042), approved by micahscopes,
was merged on 2026-11-21 with a test commit sbillig added;
[#2041](https://github.com/argotorg/fe/pull/2041) is open. The nightly CI job `fe-master` builds unpatched Fe master (which includes the #2042 merge) every night, and HARDSTOP passes its tests there with the forged `Call` and stand-in `Ctx` refused. The
first two compiler patches are also in [`research/fe-patches/`](../research/fe-patches/):
`2-private-trait-visibility.patch` makes a private trait named outside its
module "not visible" (2-0003) in an `impl` header, a bound, a `where`
clause or a super-trait, which closes the forged `Call` and `Ctx`; and
`1-unknown-attributes.patch` makes an unknown attribute such as `#[mustuse]`
an error with a "did you mean `#[must_use]`?" hint. Each adds snapshot
tests; the compiler's own suite passes (2672) except one language-server
test that also fails on unmodified `master` on Windows. With the patched
compiler HARDSTOP passes `fe test`, and the refusal script requires the
forged `Call` and `Ctx` to be refused instead of compiling. CI job
`patched-fe` checks this on every push: it applies both patches to Fe
`master` at `6cd57cc`, runs their UI tests, then HARDSTOP's tests and the
refusal script on that compiler. The contracts are built and deployed with
the unpatched 26.6 release. (The nightly job `fe-master` builds unpatched
Fe master and passes HARDSTOP's
tests with the forged `Call` and stand-in `Ctx` refused.)
