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

**Not done yet:** chain integration tests with time travel, the web app,
accessibility and persona testing, deployment, the film.
