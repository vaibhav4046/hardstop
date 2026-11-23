# HARDSTOP: build, test and demo

The full command reference, moved here from the [README](../README.md).

## Build and test

Needs Fe 26.6.0. The native target needs x86-64 Linux or AArch64 macOS (on
Windows, use WSL2 for the native steps). The web tests need Node 24.

```sh
curl -fsSL https://raw.githubusercontent.com/argotorg/fe/master/feup/feup.sh | bash -s -- --version v26.6.0
fe --version                      # fe 26.6.0 (5b3f96a)

cd fe
fe fmt --check
fe test                           # 106 tests on the EVM
fe test --backend native          # the 54 kernel + adversary tests again, natively
fe build --emit bytecode,runtime-bytecode,abi
fe build --backend native         # writes out/hardstop
./out/hardstop campaign 5206533097626292048 20000 40
./out/hardstop decide 1000000 86400 86400  10 20 3592000 0  0 0 0 1 0  0 0 0  80 0 1 1  1000005
                                  # prints "10 10 0 0 0": code 10, over the per-payment limit of 10

cd ../web
npm ci
npm test                          # 108 tests: the contract, the launcher, the wallet path, the MCP server and watcher, the differential test, the session log

npx playwright install chromium   # once
npm run e2e                       # 64 browser tests against the production build
```

Every command above except the `decide` example, the browser suite included, runs in
[CI](../.github/workflows/ci.yml) on each push, together with a check that the bytecode committed in
`web/src/lib/hardstop/artifacts.ts` is exactly what the source compiles to.

## Demo

- **Reproducible CLI example:** the commands above; `./out/hardstop` prints
  usage with no arguments.
- **Live app:** https://hardstop-omega.vercel.app (static; no server-side
  state, no secrets). Open a vault on Base Sepolia or Sepolia with your own
  wallet, or in your browser with no wallet. `node web/e2e/live-check.mjs https://hardstop-omega.vercel.app`
  drives the whole journey against it and fails on any wrong verdict or
  console error.
- **Locally:** `cd web && npm run dev`, then open http://localhost:3000.
