# Progress

Updated 2026-11-17. Submission deadline: 2026-11-24 23:59 UTC.

## Done and verified

| Item | Evidence |
|---|---|
| Contest registration | Done by the owner before the deadline (owner-reported). |
| Problem research, candidate scorecard, competitor matrix, economics, source register | `research/` |
| Fe 26.6.0 toolchain, EVM + native | `EVIDENCE_LOG.md` |
| Policy kernel: `decide`, `amend`, `cancel`, `exposure` | `fe test` 50 passed; `fe test --backend native` 30 passed |
| Adversary campaign + 8 mutant kernels | caught 8 of 8, both targets |
| Vault contract + test token | 20 EVM tests, 12 time-travel tests on the compiled bytecode |
| Native CLI | `decide`, `exposure`, `batch`, `campaign` |
| Contract vs native differential | 2,400 requests + 480 exposure queries, all agree |
| CI | Green for the Fe and differential steps on Linux |
| Threat model, assumptions, decisions | `security/`, `DECISIONS.md` |

## In progress

- Web app (five routes, practice mode on the in-browser EVM).
- Independent adversarial review of the Fe code.

## Not started

- Persona and accessibility testing in a real browser (`qa/`).
- Performance measurements.
- Deployment of the web app.
- Optional: policy drafting from plain language (needs an LLM API key on the server).
- Optional: wallet mode against a public test network (needs a funded test key).
- Launch film.
- Final submission through the owner's private submission link.

## Commits

| SHA | What |
|---|---|
| 89ee829 | Kernel v1, vault v1, test token, research |
| 3720210 | Ratchet, exposure bound, adversary, native CLI, vault v2, CI |
| a6dc29f | JS-EVM harness, time-travel tests, differential test |
