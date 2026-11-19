# Blockers and things only the owner can do

## Needs the owner

1. **Final submission.** The submission form takes the private link from the
   registration email, the repository URL, and the full commit SHA. Only the
   owner has that link.
2. **Deploying the web app.** Done: https://hardstop-omega.vercel.app, on the
   owner's Vercel account. Redeploy with `npx vercel deploy --prod` in `web/`.
3. **Optional, plain-language policy drafting.** Needs an LLM API key set as
   a server environment variable. Without it the manual form is the only way
   to create a policy, which is the intended fallback.
4. **On-chain receipts for the current contract build.** Earlier builds ran
   on Base Sepolia (transactions in the README). The current build's
   launcher is installed by the site on first use; installing it ahead of
   time and re-running the evidence needs about 0.0001 test ETH on Base
   Sepolia for the throwaway test key, which is nearly empty.
5. **Posting the Fe compiler feedback.** Six issue drafts and one patch are
   in `research/UPSTREAM_ISSUES.md` and `research/fe-patches/`. Posting
   them is public, under the owner's name, so it waits for the owner.

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
