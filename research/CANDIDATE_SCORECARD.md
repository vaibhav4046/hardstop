# CANDIDATE_SCORECARD

Scores are 1 to 10 and are my judgment, informed by PROBLEM_EVIDENCE.md. They are not measurements. Source IDs refer to SOURCE_REGISTER.md.

- A = HARDSTOP (agent spending policy kernel, one Fe source for chain and native simulator)
- B = Milestone escrow for freelancers
- C = Unit- and decimal-safe DeFi math library with native backtest

## Contest criteria (weights from S06)

| Criterion | Weight | A | B | C |
|---|---|---|---|---|
| Technical quality | 30% | 7 | 7 | 7 |
| Fe-specific value | 25% | 9 | 3 | 8 |
| Originality | 20% | 7 | 2 | 5 |
| Usefulness or insight | 15% | 7 | 4 | 6 |
| Documentation and demo | 10% | 8 | 7 | 6 |
| **Weighted total** | | **7.60** | **4.55** | **6.60** |

Arithmetic:
- A: 7×0.30 + 9×0.25 + 7×0.20 + 7×0.15 + 8×0.10 = 2.10 + 2.25 + 1.40 + 1.05 + 0.80 = 7.60
- B: 7×0.30 + 3×0.25 + 2×0.20 + 4×0.15 + 7×0.10 = 2.10 + 0.75 + 0.40 + 0.60 + 0.70 = 4.55
- C: 7×0.30 + 8×0.25 + 5×0.20 + 6×0.15 + 6×0.10 = 2.10 + 2.00 + 1.00 + 0.90 + 0.60 = 6.60

## Reasons

**Technical quality**
- A (7): small pure decision function, easy to test exhaustively; differential tests between EVM and native give a strong correctness story; rubric asks for "clear security assumptions" (S08), which a policy kernel states naturally. Held down by the experimental native backend (S09).
- B (7): simple and finishable, but little depth to show.
- C (7): pure math is testable; depth depends on Fe generics, which I did not verify (S34).

**Fe-specific value**
- A (9): uses both backends (S09), effects as a purity boundary (S11, S10), typed units (S09), exhaustive enums (S12). Matches two organiser ideas at once: "One codebase, on-chain and off-chain" and "Safe modules and guards for AI agents" (S07).
- B (3): nothing requires Fe.
- C (8): squarely a Fe type-system showcase and organiser-named (S07), but the std already ships `core::fixed`, `Wei`, `Timestamp`, `Duration` (S09).

**Originality**
- A (7): on-chain agent caps already exist (Safe allowance module S28, Polygon Sessions S29, ERC-7710 caveats S27). The original part is one source producing both the enforcing contract and the simulator, with typed deny reasons. Score assumes the pitch says exactly that and no more.
- B (2): standard contract pattern; not on the idea list.
- C (5): known idea, partly in std.

**Usefulness or insight**
- A (7): timely; the cap-bypass experiment was published 2026-11-01 (S02). Real dollar flows are small (October 2026 x402: $274,000, S14), so the value is insight and a reusable pattern more than market impact.
- B (4): real pain (S31, S32) but escrow addresses little of it and the dispute problem is untouched.
- C (6): useful to future Fe developers; one verified incident (S30).

**Documentation and demo**
- A (8): natural demo: replay incident-shaped requests (1,000x amount, unknown recipient, over-budget) and show DENY with a reason from both the native simulator and the contract.
- B (7): easy to demo, unremarkable.
- C (6): library demos are less vivid.

## Additional criteria (unweighted)

| Criterion | A | B | C | Reason |
|---|---|---|---|---|
| Implementation feasibility by Nov 24 | 6 | 9 | 7 | A needs two backends and a Linux or macOS build path (S09); B is trivial; C is library-only. |
| Customer value | 6 | 4 | 4 | A has documented failures and incidents (S02, S18, S20) but thin independent demand evidence (S25 and S26 share one author). B's data is about lateness, not escrow. C has no adopter while Fe is not production-ready (S12). |
| Differentiation | 7 | 2 | 5 | A differs from existing caps by shared kernel and typed reasons. B is undifferentiated. C overlaps std. |

## Recommendation

**Build A (HARDSTOP).** It has the highest weighted score, and its lead comes from the two criteria worth 45% together (Fe-specific value and originality).

Conditions:
1. **Register today.** Registration closes 2026-11-17 23:59 UTC (S06, S08).
2. **Test the riskiest assumption first:** compile one pure decision function to EVM and to native and confirm identical verdicts. Native executables build only on x86-64 Linux and AArch64 macOS (S09); on this Windows machine that means WSL2 or Linux CI. If this fails by day 2, fall back to C, which reuses the typed-unit work.
3. **Fold C in:** use `Wei`, `Timestamp`, `Duration` and `core::fixed` inside the kernel.
4. **Claim discipline:** do not claim "first on-chain agent spending limit"; do not cite ecosystem theft totals (S01) as agent losses or market size; state that the I-HITL results are controlled tests (S02) and that HARDSTOP does not help if the agent holds the owner key.

Do not build B.
