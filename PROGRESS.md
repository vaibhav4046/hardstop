# Progress

Updated 2026-11-17. Submission deadline: 2026-11-24 23:59 UTC.

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

## In progress

- Launch film.

## Not started

- Optional: policy drafting from plain language (needs an LLM API key on the server).
- Optional: wallet mode against a public test network (needs a funded test key).
- `SUBMISSION.md` and the final submission through the owner's private link.

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
