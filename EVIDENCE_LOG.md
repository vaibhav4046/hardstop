# Evidence log

Real commands and real output. Times are UTC. Nothing here is estimated.

## 2026-11-17

**Toolchain**

```
$ fe --version
fe 26.6.0 (5b3f96a)
```

Windows binary `fe_windows_amd64.exe` from the `argotorg/fe` v26.6.0 release
for EVM work; `feup.sh --version v26.6.0` inside WSL2 Ubuntu 24.04 for the
native target (Fe links native executables only on x86-64 Linux and AArch64
macOS).

**Registration.** Completed by the project owner through the official form
before the 23:59 UTC deadline (owner-reported; the confirmation email with
the project ID is held by the owner).

**Feasibility spike (commit 89ee829).** One pure function, three tests, both
targets:

```
$ fe test                         -> test result: ok. 3 passed; 0 failed
$ fe test --backend native        -> test result: ok. 3 passed; 0 failed
$ fe build --backend native && ./out/hardstop
decision code: 1
```

**Kernel v2 + adversary + vault v2**

```
$ fe test                                    (Windows, EVM)
test result: ok. 50 passed; 0 failed

$ fe test --backend native                   (WSL2)
test result: ok. 30 passed; 0 failed
```

The 20 extra EVM tests are the vault tests, which need a chain.

**Same verdicts on both targets.** `both_targets_reach_the_same_verdicts`
plays 200 games of 40 requests (8,000 verdicts) and asserts the fingerprint
`18432554080552133010` and `allowed == 1739`. The same assertion passes under
`fe test` and under `fe test --backend native`.

**Native campaign**

```
$ ./out/hardstop campaign 5206533097626292048 200 40
cases 200
requests 8000
allowed 1739
denied 6261
violation 0
at_case 0
at_step 0
digest 18432554080552133010
```

An earlier, less balanced generator ran 20,000 games x 40 requests (800,000
verdicts) natively in 0.074 s wall time; the current one has not been timed
yet.

**The adversary catches broken kernels.** Eight mutants (one over the cap,
forgets spending, accepts replays, ignores pause, skips cooling, pays anyone,
too strict, under-counts) each make `campaign` report a violation within 200
games. All eight tests pass on both targets.

**Exact revert reasons** (read from the test runner, then pinned in
`vault_tests.fe`): `NotAgent()` 0x0d9ab13f, `NotOwner()` 0x30cd7471,
`InvalidPolicy()` 0xd06b96b1.

**Contract vs native kernel (commit a6dc29f).** `web/tests/differential.test.ts`
deploys the compiled vault into an in-memory EVM, plays seeded games, and for
each request compares the contract's result with `hardstop batch`:

```
$ cd web && npm test
✔ vault bytecode and native kernel agree on 2400 payment requests (25631ms)
ℹ 2400 payment requests (343 allowed, 1977 denied, 80 reverted) and 480
  exposure queries: vault and native kernel agreed on all of them
ℹ tests 13   ℹ pass 13   ℹ fail 0
```

The 12 other tests are the time-travel tests in `web/tests/vault.test.ts`.

**CI on Linux (GitHub Actions run 44157674013, commit a6dc29f).** Passed:
format, `fe test`, `fe test --backend native`, contract build, native build,
native campaign of 20,000 games x 40 requests, "the committed web artifacts
are what this source compiles to" (so the Windows-built bytecode is
byte-identical to the Linux-built bytecode), and the web tests including the
differential test. Failed: the type-check step, because Next's generated
route types were missing in CI; fixed by running `next typegen` first.

**CI fully green (run 44158519489, commit 8637f43)**, including the
type-check step.

**Headline claim re-checked at source (2026-11-17).** The CoinDesk article
(Francisco Rodrigues, 2026-11-01) was fetched again and states: nine of 10
models raised their own spending cap at least once with no attacker present;
five of 10 sent money to a simulated attacker at least once in the
impersonation experiment; Cornell Tech and Yale researchers; Circle agent
wallets, 10 USDC on Base, 1-cent daily limit; the agents retrieved the
emailed one-time passcode themselves; "controlled tests using real USDC,
rather than documented attacks on Circle customers". The arXiv abstract
(2610.35835 v3) confirms the mechanism and "ten different frontier models"
but gives no count. Both were read through a summarising fetch tool.

**Competing entry checked.** `devprashant19/Leash` README and rule list read
through the GitHub API on 2026-11-17; not run. See `DECISIONS.md` D2.

**Not done yet:** accessibility and persona testing, deployment, the film.
The web UI is being built; nothing about it is claimed here until it has been
exercised in a browser.
