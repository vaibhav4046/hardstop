# Progress

Updated 2026-11-24. Submission deadline: 2026-11-24 23:59 UTC. The README is
the reference; this page only says where things stand.

## Verified on 2026-11-24 (main, current contracts v3)

| Check | Result |
|---|---|
| `fe fmt --check` | clean |
| `fe test` (EVM) | 113 passed, 0 failed |
| `fe test --backend native` (WSL) | 54 passed, 0 failed |
| `scripts/pay-cannot-loosen.sh` | 92 lines starting `ok`: 48 compiler refusals, 6 controls that must compile, 8 source checks, 23 edits they must catch, 7 edits a test must catch |
| `npm test` (web) | 125 tests, passing locally and in CI |
| `npx tsc --noEmit`, lint, `next build` | clean |
| Browser suite | 65 tests, passing locally and in CI |
| Live site | `web/e2e/live-check.mjs` passes against https://hardstop-omega.vercel.app, including `/mcp`, `/mcp/tricked` and `/alerts` |

The 2026-11-22 numbers this page held before (106 Fe tests, 80 `ok` lines,
108 web tests) are from that day's build.

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
  run on Base Sepolia (v3, 2026-11-24: launcher, vaults, payments,
  refusals, a cancelled raise, a pause, the agent's key replaced, a vault
  holding testnet USDC; transactions in `docs/EVIDENCE.md`).
- MCP server for AI agents (five agent tools, no owner tools), a hosted
  practice server at `/mcp`, a hosted alert feed per vault at `/alerts`, and
  a 24/7 watcher for the owner that catches up after a restart.
- AI assistants through their own MCP clients: Claude Code, Cursor and
  Antigravity on the 2026-11-22 contracts, Cursor's agent on v3.
- A 70 s narrated film of the compile-time laws (2026-11-23), a 43 s silent clip of the v3 runs (2026-11-24), an 85 s update film, a 2 min narrated demo film (1080p, synthetic voice, music and captions, with live-site screen recordings), and a 1 min 47 s silent walkthrough (built in HyperFrames from real site footage, compiler output and on-chain receipts).
- Three rounds of independent AI judge reviews; the findings that survived
  were fixed.
- Six Fe compiler issues filed upstream with reproductions (argotorg/fe
  #2035 to #2040), and three pull requests (#2041, #2042, #2048; the first two
  patches are also in `research/fe-patches/`): unknown attributes become errors, and a
  private trait is visibility-checked in `impl` headers and bounds, which
  stops user code forging `std`'s `Call` and `Ctx`. With the second patch,
  `fe test` passes (101) and the refusal script requires both forgeries to be
  refused; the Fe suite passes 2672, with 1 failure that also happens on
  unmodified `master` on Windows. Posted 2026-11-19 and 20. #2048 (block time
  and number in `fe test`) was merged on 2026-11-20 and #2042 (the
  capability-seal fix) on 2026-11-21; the nightly CI job on unpatched Fe
  master passes with the forgeries refused. #2041 is open.

## Needs the owner

See [`BLOCKERS.md`](BLOCKERS.md): the final submission and the
MetaMask scanner review (ticket filed 2026-11-18).
