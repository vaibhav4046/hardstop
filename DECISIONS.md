# Decisions

Newest last. Each entry: what was decided, why, and what it cost.

## D1. Build HARDSTOP (agent spending firewall), not escrow or typed DeFi math

2026-11-17. Scorecard in `research/CANDIDATE_SCORECARD.md`: HARDSTOP 7.60,
typed DeFi math 6.60, freelancer escrow 4.55 (judgment scores, not
measurements). The deciding evidence was a controlled Cornell Tech / Yale test
in which 9 of 10 models raised their own spending cap on agent wallets
(sources S02, S03 in `research/SOURCE_REGISTER.md`).

## D2. The competition already has this pitch, so the pitch had to change

2026-11-17. `devprashant19/Leash` (another entry in this contest, Apache-2.0)
already ships "spending limits written once in Fe, enforced on-chain and
pre-checked off-chain" with a Safe module, a native CLI and a parity suite. I
read its README and rule list; I did not run it. Competing on the same claim
would score poorly on originality.

What HARDSTOP does that the verified competitors do not (see
`research/COMPETITOR_MATRIX.md`):

1. **The ratchet.** Tightening a limit is instant. Loosening one (a higher
   cap, a later expiry, a new recipient, resuming after a pause) waits out a
   cooling period and can be cancelled. This targets the failure the
   researchers actually observed: the cap logic held, the *cap-change* path
   did not.
2. **A worst-case number.** `exposure` is a pure function that returns the
   most the agent can move between two moments. It is exact when nothing is
   queued, and it holds no matter what the owner signs during the cooling
   period.
3. **The attacker is written in Fe too.** `adversary.fe` plays seeded hostile
   games against the kernel, checks every verdict against a second statement
   of the rules, and is itself tested against eight deliberately broken
   kernels. It runs on the EVM and natively from one source.

Cost: no Safe integration, no calldata/selector rules. HARDSTOP is a
standalone vault for one token and one agent.

## D3. One ingot, `#[cfg(target = ...)]` per module

`kernel.fe` and `adversary.fe` have no `cfg` and no `uses` clause: they
compile for both targets and cannot perform effects. `vault.fe` and
`token.fe` are EVM-only; `cli.fe` is native-only. One `fe.toml`, one test
command per target.

## D4. The kernel takes facts, not addresses

`decide` receives `from_agent` and `to_approved` as booleans. The vault
resolves them from `ctx.caller()` and storage. This keeps the kernel free of
`Address` and of storage access, which is what lets it build natively. The
cost is that the allowlist lookup is vault code, not kernel code; the chain
tests cover it.

## D5. Denials are logged, not reverted; strangers are reverted

A refused request from the agent returns its reason code and emits `Blocked`,
so there is an on-chain record of what the agent tried. A caller that is not
the agent gets a `NotAgent()` revert so that strangers cannot write to the
log. A denial never changes the ledger.

## D6. Owner, agent, token, window length and cooling period are immutable

Fewer things that can change means fewer things that can be changed by the
wrong party. To change any of them, withdraw and create a new vault.
`withdraw` pays the owner only.

## D7. Fixed windows, not rolling

Window `n` is `[anchor + n*len, anchor + (n+1)*len)`. Simple, cheap, and makes
`exposure` exact. Known cost: an agent can spend a full window's cap at the
end of one window and again at the start of the next. `exposure` counts this
correctly; the UI must not describe the cap as "per rolling 24 hours".

## D8. No time travel in `fe test`

The Fe test runner cannot move the block timestamp. Time-dependent behaviour
is tested on the kernel (which takes `now` as an argument) and against a real
local chain in `chain/`.

## D9. No AI attribution in commit messages

The repository owner's commit hook rejects them. AI assistance is declared in
the README instead, as the contest requires.
