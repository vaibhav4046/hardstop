# Progress

Updated 2026-11-19. Submission deadline: 2026-11-24 23:59 UTC. The README is
the reference; this page only says where things stand.

## Verified on 2026-11-19 (this commit's tree)

| Check | Result |
|---|---|
| `fe fmt --check` | clean |
| `fe test` (EVM) | 98 passed, 0 failed |
| `fe test --backend native` (WSL) | 52 passed, 0 failed |
| Native campaign, 20,000 games of 40 requests | `violation 0` |
| `scripts/pay-cannot-loosen.sh` | 47 lines starting `ok`: 26 compiler refusals, 7 controls that must compile, 14 source-check lines (3 checks, 11 edits they must catch) |
| Committed web artifacts vs a fresh build | identical |
| `npm test` (web) | 88 passed, 0 failed, 0 skipped |
| `npx tsc --noEmit` | clean |
| Browser suite | 61 tests; green in CI (GitHub Actions) |
| Live site | `web/e2e/live-check.mjs` passes against https://hardstop-omega.vercel.app |

## Done

- Policy kernel (`decide`, `amend`, `cancel`, `exposure`), vault, launcher,
  test token, a seeded attacker in Fe with 15 broken kernels it must catch,
  and a native CLI from the same source.
- The compiler enforces the rules: sealed `Terms` and `Approval` that only
  the kernel makes, a use-once `OwnerCall` bound to the real caller, and
  `static_assert`s that run `amend`, `cancel` and the ratchet's laws at
  compile time. CI proves each with an edit the compiler must refuse.
- Web app with a practice vault in the browser and real vaults on Base
  Sepolia or Sepolia through the visitor's wallet. The current contracts
  run on Base Sepolia (launcher, a vault, payments, a refusal, a cancelled
  raise and a pause, 2026-11-19; transactions in the README).
- MCP server for AI agents (five agent tools, no owner tools) and a 24/7
  watcher for the owner that catches up after a restart.
- A 2 min narrated demo film (1080p, synthetic voice, music and captions, with live-site screen recordings), and a 1 min 47 s silent walkthrough (built in HyperFrames from real site footage, compiler output and on-chain receipts).
- Three rounds of independent AI judge reviews; the findings that survived
  were fixed.
- Six Fe compiler issues filed upstream with reproductions (argotorg/fe
  #2035 to #2040), and two open pull requests (#2041, #2042; the patches are
  also in `research/fe-patches/`): unknown attributes become errors, and a
  private trait is visibility-checked in `impl` headers and bounds, which
  stops user code forging `std`'s `Call` and `Ctx`. With the second patch,
  `fe test` passes (98) and the refusal script requires both forgeries to be
  refused; the Fe suite passes 2672, with 1 failure that also happens on
  unmodified `master` on Windows. Posted 2026-11-19; not yet reviewed or merged.

## Needs the owner

See [`BLOCKERS.md`](BLOCKERS.md): the final submission, test ETH for
on-chain receipts of the current build, and the
MetaMask scanner review (ticket filed 2026-11-18).
