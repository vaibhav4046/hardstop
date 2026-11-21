# Blockers and things only the owner can do

## Needs the owner

1. **Final submission.** The submission form takes the private link from the
   registration email, the repository URL, and the full commit SHA. Only the
   owner has that link.
2. **Deploying the web app.** Done: https://hardstop-omega.vercel.app, on the
   owner's Vercel account. Redeploy with `npx vercel deploy --prod` in `web/`.
4. **On-chain receipts for the current contract build.** Done 2026-11-19:
   test ETH from the Coinbase faucet on the owner's account, and `web/scripts/base-sepolia-evidence.ts`
   installed the current launcher and re-ran the evidence (README).
5. **Fe compiler feedback.** Posted on 2026-11-19 with the owner's
   approval: six issues (argotorg/fe #2035 to #2040) and three pull requests
   (#2041, #2042, and #2048 on 2026-11-20). #2048 was merged on 2026-11-20 and #2042 on 2026-11-21. Replies and review comments go to the owner's GitHub
   account; answering them is the owner's call.
6. **MetaMask's site scanner** warns "Continue at your own risk" on connect.
   A review ticket was filed with MetaMask support on 2026-11-18; the reply
   goes to the owner's email.

## Technical limits found, with the workaround used

| Limit | Workaround |
|---|---|
| Fe links native executables on x86-64 Linux and AArch64 macOS only. | Native steps run in WSL2 locally and on Linux in CI. |
| `fe test` cannot move the block timestamp or impersonate a caller. | Time: kernel takes `now`; contract tested on a JS EVM with a controllable clock. Callers: `Actor` contracts forward calls. |
| `fe test` has no fuzzer. | Seeded campaign in `adversary.fe`, itself tested against mutants. |
| Fe's WebAssembly backend is not in the release binaries. | The browser runs the EVM bytecode in a JS EVM instead. |
| Node's type-stripping runner rejects some TypeScript syntax. | `web/src/lib/hardstop` avoids enums and parameter properties. |

## Open risk

Another entry (`devprashant19/Leash`) covers "one Fe policy, on-chain and
native". HARDSTOP's distinct parts are the ratchet, the exposure bound and
the Fe adversary; see `DECISIONS.md` D2. Whether judges see enough daylight
between the two is not something more code can settle.
