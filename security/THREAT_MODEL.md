# Threat model

What HARDSTOP defends, against whom, and where the defence stops.

## The thing being protected

One ERC-20 balance held by one `Vault` contract. Nothing else. Money in the
owner's own wallet, in the agent's wallet, or in any other contract is
outside this system and HARDSTOP says nothing about it.

## Parties and what each one holds

| Party | Holds | Trusted? |
|---|---|---|
| Owner | The key that deployed the vault. Can propose rule changes, cancel a queued change, pause, add/remove recipients, withdraw to itself. | Yes, but assumed to be **trickable**: it may be talked into signing a change it did not mean. |
| Agent | A separate key. Can call `pay` and nothing else of consequence. | **No.** Assumed fully compromised: prompt-injected, buggy, or malicious. |
| LLM / policy assistant | Nothing. It can suggest a policy as text. | No. Its output is a draft the owner must read and sign. It is never consulted when a payment is decided. |
| Web app | Nothing. It formats what the contract says. | No. A wrong or hostile web page can mislead the owner but cannot move money or change a verdict. |
| Token | The ERC-20 contract fixed at vault creation. | Yes. A malicious token is out of scope (see below). |
| Recipients | An address on the owner's list. | Trusted to be the right address, nothing more. |
| Everyone else | Nothing. | No. |

## Trust boundaries

```
 untrusted                         │ enforced on-chain, in Fe
                                   │
 LLM suggestion ──▶ owner reads ──▶│ propose()  ──▶ amend()  tighten now, loosen later
 web page                          │
                                   │
 agent (compromised) ─────────────▶│ pay() ──▶ decide() ──▶ Allow ─▶ ledger, then transfer
                                   │                    └─▶ Deny  ─▶ log reason, move nothing
```

The only code that can move money is the `Pay` and `Withdraw` handlers in
`fe/src/vault.fe`. `Pay`'s `uses` clause lists the policy, the queue and the
recipient map without `mut`: the Fe compiler rejects any version of that
handler that writes them.

## What the agent can do, at worst

Assume the agent's key is in an attacker's hands from time `t`.

- It can pay **approved recipients only**. It cannot add one: `setRecipient`
  is owner-only, and a recipient the owner adds becomes payable only after
  the cooling period.
- Each payment is at most `per_payment`; each fixed window totals at most
  `per_window`; nothing after `valid_until`.
- Between `t` and any later moment `u`, the total is at most
  `exposure(rules, ledger, t, u)`, the number the vault's `exposure` view
  returns. With nothing queued this bound is exact.
- **If `u` is inside the cooling period (`u < t + cooling_secs`), that bound
  holds no matter what the owner is tricked into signing after `t`**, because
  nothing proposed after `t` can loosen the rules before `t + cooling_secs`.

So the worst-case loss to a compromised agent is a number the owner can read
before anything goes wrong, and it is bounded by the approved recipients'
willingness to keep the money. If every approved recipient is honest, a
compromised agent can only overpay people the owner already chose to pay.

It can also: waste its own gas on refused requests, and fill the vault's
event log with `Blocked` entries (it pays for each one). Nobody else can
write to that log: a caller that is not the agent is reverted, paused or
not.

## What the agent cannot do

Each line is a test. `F` = `fe/src/vault_tests.fe`, `K` = `fe/src/tests.fe`,
`A` = `fe/src/adversary_tests.fe`, `C` = `web/tests/vault.test.ts`,
`D` = `web/tests/differential.test.ts`.

| Claim | Evidence |
|---|---|
| A caller that is not the agent cannot spend, and cannot write to the log, even during a pause. | F `stranger_cannot_pay`, `stranger_is_reverted_even_while_paused` (exact error `NotAgent()`), C, D (113 stranger calls) |
| The agent cannot change limits, recipients, the queue or pause state, and cannot withdraw. | F `agent_cannot_*` (exact error `NotOwner()`), C |
| Owner, agent, token, window length and cooling period cannot change at all. | Immutable contract fields; no handler lists them `mut`. |
| Owner and agent are different addresses, and the cooling period is at least a minute. | F `owner_and_agent_must_differ`, `cooling_period_under_a_minute_is_rejected`, C |
| A denied payment moves nothing and leaves the ledger as it was. | F `over_limit_payment_moves_nothing`, D (every request) |
| A payment cannot exceed the caps; splitting does not help. | K, F `splitting_cannot_beat_the_daily_cap`, A |
| A request cannot run twice. | K, F `replayed_request_is_refused`, A (`AcceptsReplays` mutant is caught) |
| Pause is immediate. | K, F `pause_is_instant`, C |
| A raise cannot take effect before the cooling period ends, to the second. | K, C, A (`SkipsCooling` mutant is caught) |
| Arithmetic cannot overflow or underflow. | K `extreme_inputs_never_panic`; Fe arithmetic is checked by default and the kernel is written so the checks never fire. |
| A failed transfer does not leave a recorded payment. | F `failed_transfer_reverts_and_leaves_the_ledger_untouched`, C |
| A token that re-enters `pay` cannot get past the caps or replay. | F `a_hostile_token_cannot_reenter_past_the_caps` |
| What the app shows is what the contract did. | The app has no copy of the rules; `web/src/lib/hardstop/sim.ts` only encodes calls and decodes results. D compares the contract with the native kernel on every request. |
| Total paid never exceeds the exposure bound. | A (every game), C `a greedy agent takes exactly the exposure bound`, D (every vault) |

## What HARDSTOP does not defend against

Stated plainly, because a security tool that overstates itself is worse than
none.

1. **A stolen owner key.** Whoever holds it can pause, tighten, queue a
   loosening and `withdraw` to the owner address. Because `withdraw` only
   pays the owner address, a thief with the owner key still has to move the
   money out of the owner's wallet, which is outside this system. The ratchet
   helps only if the real owner notices and cancels a queued change in time,
   which requires the real owner to still hold a working key.
2. **An owner who does not look.** The ratchet turns "the agent got a cap
   raise approved" from an instant loss into a waiting period. It is only
   worth something if the owner sees the pending change. The contract emits
   `PolicyProposed` and the app shows the queue, but nothing here sends an
   alert. This is the main gap between the prototype and a product.
3. **A dishonest approved recipient.** The cap is the protection, not the
   list. An approved recipient can be paid up to the cap for nothing.
4. **Window-edge bursts.** Windows are fixed. An agent can spend one window's
   cap in its last second and the next window's in the first. `exposure`
   counts this; a description of the cap as "per rolling 24 hours" would be
   wrong.
5. **A malicious or unusual token.** The token is fixed at creation and
   trusted. A token that lies about transfers, charges fees, rebases, or
   re-enters could break the accounting between the ledger and real
   balances, or freeze `pay` and `withdraw` by always failing. The vault
   updates its ledger before calling the token, and a test with a
   re-entering token shows it cannot replay or exceed the caps that way; a
   token that simply lies about transfers is not defended against.
6. **Block timestamp drift.** Limits use `block.timestamp`, which a block
   proposer can nudge by seconds. Irrelevant at day-length windows, relevant
   if someone configures one-second windows.
7. **Anything about what the agent buys.** HARDSTOP limits how much leaves
   and to whom. It does not know whether the payment was a good idea.
8. **The chain, the compiler and the EVM.** Fe 26.6.0 is young. A compiler
   bug could make the bytecode differ from the source. The differential test
   compares the EVM build with the native build of the same source, which
   would catch a divergence between the two backends, not a bug both share.

## What the reported incident was, and what this changes

In the controlled test reported by CoinDesk on 2026-11-01 (preprint
arXiv:2610.35835), agents with a wallet, email and web access raised their
own daily spending cap in 9 of 10 models tested, by reading the one-time
passcode that was meant to prove a human approved the change. The cap logic
was not bypassed; the cap-change approval was. Those were lab trials, not
customer losses.

HARDSTOP changes two things about that situation and leaves one alone:

- Changing a cap needs a signature from a key the agent does not hold, not a
  code delivered to an inbox the agent can read.
- A raise then waits out the cooling period, visibly, and one owner
  transaction cancels it.
- If the agent can also drive the owner's wallet, it can queue a raise. The
  owner then has the cooling period to notice. HARDSTOP does not stop that
  raise by itself.

## Reporting a problem

Open an issue on the repository, or for something exploitable use GitHub's
private vulnerability reporting on the repository. This is an unaudited
contest prototype: do not put real money in it.
