# Assumptions

Everything HARDSTOP's safety claims depend on. If one of these is false, the
claim built on it is false.

| # | Assumption | Used by | What breaks if it is false |
|---|---|---|---|
| 1 | The owner key is held by the owner and is not available to the agent. | Every owner-only control. | The agent can queue a raise and, after the cooling period, spend under it. During the cooling period the exposure bound still holds. |
| 2 | The owner looks at pending changes at least once per cooling period. | The ratchet. | A raise the owner did not intend takes effect unnoticed. |
| 3 | The token behaves like a plain ERC-20: `transfer` moves exactly `amount` or fails. | Ledger equals money moved. | The ledger and real balances can disagree. |
| 4 | `block.timestamp` is within a few seconds of real time and never goes backwards. | Windows, expiry, cooling. | Limits shift by the same few seconds. |
| 5 | The vault was created with the cooling period and window length the owner intended. Both are immutable. | The ratchet, the exposure bound. | A short cooling period is a weak ratchet. The constructor rejects anything under 60 seconds, nothing more. |
| 6 | Approved recipients are the addresses the owner meant. | Allowlist. | Payments within the caps go to the wrong party. |
| 7 | The Fe 26.6.0 compiler translates the source faithfully for at least one of its two backends, and the EVM executes the bytecode faithfully. | Everything. | Tests that run on the affected backend may pass while behaviour is wrong; the cross-backend comparison would flag a one-sided bug. |
| 8 | The party reading a verdict (app, CLI) is the party who wrote this repository's code, or has checked it. | "What you see is what the contract did." | A modified front end can display anything. The contract's behaviour is unaffected. |

## Not assumed

- That the agent is honest, careful, or uncompromised.
- That the LLM's policy suggestion is correct. The owner signs numbers, not
  prose.
- That the web app or its host is trustworthy for safety. Only for display.
- That a database holds anything that matters. There is none.
