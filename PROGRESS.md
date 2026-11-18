# Progress

Updated 2026-11-18. Submission deadline: 2026-11-24 23:59 UTC.

## Done and verified

| Item | Evidence |
|---|---|
| Contest registration | Done by the owner before the deadline (owner-reported). |
| Problem research, candidate scorecard, competitor matrix, economics, source register | `research/`; headline claim re-checked at source |
| Fe 26.6.0 toolchain, EVM + native | `EVIDENCE_LOG.md` |
| Policy kernel: `decide`, `amend`, `cancel`, `exposure` | `fe test` 68 passed; `fe test --backend native` 44 passed |
| Adversary campaign + 14 broken kernels | 14 of 14 caught, both targets |
| Vault contract + test token | 24 EVM tests, 15 tests on the compiled bytecode with a controllable clock |
| Native CLI | `decide`, `exposure`, `batch`, `campaign` |
| Contract vs native differential | 2,400 requests + 480 exposure queries, all agree |
| Independent adversarial review, all findings fixed | `security/AUDIT.md` |
| Threat model, assumptions, decisions | `security/`, `DECISIONS.md` |
| Web app, five routes, practice mode | checked by hand and by 51 browser tests |
| Persona, accessibility and performance suite | `qa/`, `npm run e2e`: 51 passed |
| CI | Green on Linux for Fe, native, differential, artifact reproducibility and type-check |
| Deployment | https://hardstop-omega.vercel.app; live journey verified by `web/e2e/live-check.mjs` |

## Where it stands against other entries

An independent review on 2026-11-18 (an AI reviewer acting as a sceptical
judge, not a person) found 22 public entries, read six in detail, and put
HARDSTOP at about 63 of 100 and roughly sixth. Its reasons: five entries
are agent spending limits, several others have more Fe code, the kernel
uses bare integers where typed units would show more of the language, there
are no gas figures, and the app is practice mode only. Its scores for other
entries rest on their READMEs and were not run. The work it recommends is
listed under "Not started".

## Done since the review

- Real vaults on Base Sepolia and Sepolia through the visitor's wallet, with
  a new Fe contract, `launcher.fe`. Run on Base Sepolia on 2026-11-18 with
  a throwaway test key: launcher installed, vault created, agent paid $4,
  refused $80, refused a self-raise (transactions in the README). The same
  again by clicking through MetaMask on the live site, same day.
- The vault rejects a zero owner, agent or token (`ZeroAddress`), and every
  page of the site shows a waiting loosening with a cancel button.
- CI proves `Pay` cannot be edited to change the rules: the compiler refuses
  each edit (`scripts/pay-cannot-loosen.sh`).
- Gas for install, create, `pay` (allowed and refused), `propose`,
  `cancelQueued` and `pause`, measured on Base Sepolia (table in the README).
- Wallet errors read plainly (they showed `[object Object]`), the balance is
  checked before the wallet is asked, and the agent's gas money on Base
  Sepolia is 0.00003 ETH so one faucet claim covers a launch.
- The landing page shows the evidence: the ten-model test, two other lab
  tests, four recorded losses and agent payment traffic, each with its
  source and what it does not show.

## Needs the owner

- MetaMask's scanner warns "Continue at your own risk" on connect. A review
  ticket was filed with MetaMask support on 2026-11-18 ("False positive:
  hardstop-omega.vercel.app flagged as phishing"); waiting for its reply,
  which goes to the owner's email.

## On hold

- Launch film. Stopped by the owner; working files are in `film/work/`
  (not committed). Not restarted.

## Not started

- Typed units in `kernel.fe` (seconds, amounts, nonces) instead of bare
  integers.

- Optional: policy drafting from plain language (needs an LLM API key on the server).
- The final submission through the owner's private link. The text is ready
  in `SUBMISSION.md`; the commit SHA is filled in at the moment of submitting.

## Commits

| SHA | What |
|---|---|
| 89ee829 | Kernel v1, vault v1, test token, research |
| 3720210 | Ratchet, exposure bound, adversary, native CLI, vault v2, CI |
| a6dc29f | JS-EVM harness, time-travel tests, differential test |
| 8637f43 | README, threat model, assumptions |
| 97c569a | Independent review findings applied |
| 9f0bd4f | Practice-mode web app |
| da1bd31 | Persona, accessibility and performance suite; fixes it found |
| e0058cc | Deployment and live check |
| 88ac30d | Frontend rebuilt in the dark, serif-and-gold direction |
| 33169e0 | Git-triggered Vercel builds turned off |
