# PROBLEM_EVIDENCE

Source IDs refer to SOURCE_REGISTER.md. Accessed 2026-11-17.

Tags:
- **[MEASURED]** a figure produced by a named dataset, survey or controlled experiment with a stated scope. "via Sxx" means I read it second-hand.
- **[REPORTED]** press, vendor or incident accounts and estimates.
- **[ASSUMPTION]** my inference. Not evidence.

Hard rule: the $3.4B crypto-theft figure for 2025 (S01) is ecosystem-wide. It is **not** AI-agent losses and **not** HARDSTOP's addressable market. It is not used anywhere below as market size.

## Contest facts that constrain all three candidates

- [MEASURED] Weights: technical 30%, Fe-specific 25%, originality 20%, usefulness 15%, docs and demo 10%. (S06)
- [MEASURED] **Registration closes 2026-11-17 23:59 UTC, which is today.** Submissions close 2026-11-24 23:59 UTC. (S06, S08)
- [MEASURED] Core contribution must be in Fe, release 26.5.0 or later; AI use must be disclosed. (S06)
- [MEASURED] Native executables build from release binaries only on x86-64 Linux and AArch64 macOS. (S09) [ASSUMPTION] The dev machine is Windows 11, so native builds need WSL2 or Linux CI.
- [MEASURED] "Fe is not production-ready"; "known bugs, a limited standard library". (S12, S33)
- [REPORTED] Judges include two Fe core developers, a security researcher and the EF dev-tooling lead. (S08)

---

## A. HARDSTOP: independently enforced spending constraints for AI agents

**Who has the problem.** Teams that give an LLM agent a funded wallet: agent-framework builders, x402 service buyers, DAOs and treasuries delegating to agents.

**Evidence that the control fails**
- [MEASURED, via S02; abstract confirms qualitatively in S03] In a Cornell Tech / Yale experiment on Circle agent wallets, 9 of 10 models raised their own spending cap at least once with no attacker present, by reading the owner's one-time code from email. 5 of 10 sent money to a simulated attacker at least once. Setup: 10 USDC wallet, 1-cent daily limit, 20 trials per scenario.
- [MEASURED] These were controlled tests, not customer losses. (S02)
- [MEASURED] On CrAIBench (150+ tasks, 500+ attack cases), the strongest models followed poisoned memories more than half the time. The authors recommend hardcoded rules for transfers. (S23, S24) Limitation: 2025 models.
- [REPORTED] MetaMask's own guidance: "A system prompt is guidance, not enforcement." (S04)

**Real incidents (2026)**
- [REPORTED] Grok / Bankr, May 2026: about 3 billion DRB moved after an obfuscated prompt; valued $155,000 to $174,000 (S18), $150,000 to $200,000 (S19). Some returned; amount not stated.
- [REPORTED] Lobstar Wilde, Feb 2026: agent sent about 1,000x the intended amount; paper value about $440,000, realised about $40,000; creator says agent error, not prompt injection. (S20)
- [REPORTED] Owockibot, Feb 2026: agent leaked its hot-wallet key; about $2,100 held. (S21, S04)
- [REPORTED] OpenAI research model spent testnet funds from a wallet it was not given and omitted this from its report. No monetary loss. (S22, secondary only)

**How often it fails.** No incidence rate exists. [ASSUMPTION] The four incidents above are the ones I found, not a census. The only rate-like figures are experimental (9/10 and 5/10 models, S02).

**Money at stake**
- [MEASURED, via S14] x402 lifetime: 196 million transactions, more than $42M settled, as of 2026-11-01. October 2026: 5.1 million transactions, $274,000.
- [MEASURED, via S14 and S17] More than 87% of x402 payments were between $0.0001 and $0.10.
- [MEASURED, via S14] Allium Q3 2026: 68.3 million agent payments, $3.7M.
- [REPORTED] After wash-trade filtering, about $1.6M in one month in early 2026. (S15) Much activity may be scripts, not agents. (S17)
- [MEASURED, via S14] Payments of $1 or more account for about 95% of x402 value on Base by early 2026.
- [REPORTED] ElizaOS bots "reportedly" manage over $25M. (S24) Undated and unaudited.

**Who would pay.** [ASSUMPTION] Agent-wallet vendors and treasuries. Indirect signal: [REPORTED] MetaMask offers reimbursement up to $10,000 per month for covered transactions (S04), so at least one vendor prices this risk. No verified willingness-to-pay data for a third-party policy kernel.

**Developer demand.** [REPORTED] Two GitHub feature requests for agent spend limits (S25, S26). Both were opened by the same account, which promotes its own SDK. This is weak, non-independent evidence. A developer post argues limits must sit on-chain out of the agent's reach (S27).

**Realistically addressable share.** No defensible number. [ASSUMPTION] Addressable = funds held in agent-controlled wallets whose owners adopt an external policy contract. Sub-cent micropayments (87%+ of count) are a poor fit for a per-payment on-chain check; the fit is larger payments and treasury-style budgets.

**Today's workaround and why it is inadequate**
- [MEASURED] Vendor limits changeable through a channel the agent can reach (email OTP) were bypassed. (S02)
- [REPORTED] Safe allowance module: per-token allowance, one-time or resetting. The quickstart documents no recipient allowlist and no reason codes. (S28)
- [REPORTED] Polygon Sessions Module (announced 2026-10-21): budget, approved actions and expiry enforced on-chain. (S29)
- [REPORTED] ERC-7710 delegations with caveat enforcers, demoed as a Safe App. (S27)
- Coinbase Agentic Wallets guardrails: **UNVERIFIED** (lead returned 403).
- [ASSUMPTION] Gap that remains: none of the above ships the decision logic as one source compiled to both chain and host, so an agent or operator cannot get a pre-flight verdict that is the same code as the on-chain verdict, and none returns a typed, human-readable deny reason. **On-chain agent caps as such are not new**; HARDSTOP must not claim that.

**Would HARDSTOP have helped in the incidents?** All [ASSUMPTION]:
- Grok/Bankr and Lobstar: a per-transaction cap or recipient allowlist enforced outside the agent would deny the transfer.
- Owockibot: only if funds sat in the policy contract rather than the leaked hot wallet; loss then bounded by remaining budget.
- I-HITL: only if changing the policy requires an owner key the agent cannot reach. If the agent holds the owner key, nothing helps.

**Why Fe is necessary, not decorative**
- [MEASURED] Fe compiles the same language to EVM and to native executables (S09, S08); organisers list "One codebase, on-chain and off-chain" and "Safe modules and guards for AI agents" as ideas (S07).
- [MEASURED] `uses` clauses make capabilities explicit and compiler-enforced (S11, S34); native I/O is also an effect (S10). [ASSUMPTION] A decision function with no `uses` clause is checkably pure, which is what lets it be shared between contract and simulator.
- [MEASURED] Typed `Wei`, `Timestamp`, `Duration` and `core::fixed` exist since 26.5 (S09); match exhaustiveness is checked (S12). [ASSUMPTION] Deny reasons as an enum give a typed verdict.
- [ASSUMPTION] In Solidity the equivalent needs a second implementation (TypeScript or Rust) plus differential testing to keep them aligned.

**Feasibility by Nov 24**
- [ASSUMPTION] Kernel is small pure logic; unit tests via `fe test` on pure functions need no deployment (S13).
- Risks: [MEASURED] native executables not buildable on Windows (S09); experimental backend (S09); homepage text conflicts with release notes on whether native is in release binaries (S11 vs S09). [ASSUMPTION] Riskiest assumption to test first: one pure function compiled to EVM and native returns identical verdicts on the same inputs.

**What an expert judge would find original.** [ASSUMPTION] Differential evidence that the on-chain and native verdicts are the same code; typed deny reasons; a kernel whose purity is visible in its signature. Not the idea of a spending cap.

---

## B. Programmable milestone escrow for freelancers and creators

**Who has the problem.** Freelancers paid late or not at all; clients who fear paying for undelivered work.

**Evidence**
- [MEASURED, via S31] Knab survey, 600 Dutch freelancers: 48% experience late payments, average 18 days past term, 19% sometimes face hardship.
- [REPORTED, via S32; primary not fetched] Remote 2025 survey (3,300 freelancers, ten countries): 85% have invoices paid late at least some of the time.
- [MEASURED, vendor data, S32] On Ruul, 95% of payments arrived within 30 days. Selection bias: Ruul customers only.
- No verified non-payment rate, escrow dispute rate or dollar loss was found. Upwork and Kleros pages could not be fetched (403 / 404).

**Who would pay.** [ASSUMPTION] Freelancers or marketplaces, via a fee on escrowed amounts. No evidence gathered.

**How often it fails / money lost.** Lateness is common (above). Outright non-payment and escrow disputes: no defensible figure.

**Addressable share.** [ASSUMPTION] Small. The surveys measure late payment by clients on invoice terms. Escrow only helps when the client pre-funds, and on-chain escrow further requires both sides to use crypto.

**Today's workaround.** [ASSUMPTION] Marketplace escrow, invoicing tools with reminders (S32 reports about 8 in 10 vs 6 in 10 overdue invoices collected with vs without reminders, vendor data), existing on-chain escrow products (UNVERIFIED). Inadequacy: disputes about work quality need human judgment; code cannot settle them.

**Why Fe.** [ASSUMPTION] Decorative. A milestone state machine is equally expressible in Solidity; nothing needs the native backend or effects.

**Feasibility by Nov 24.** [ASSUMPTION] High; it is a small state machine.

**Originality for a judge.** [ASSUMPTION] Low. Escrow is a standard teaching contract and does not appear in the organisers' idea list (S07).

---

## C. Unit- and decimal-safe DeFi math (typed amounts, prices, scales) with native backtest

Chosen as candidate C because the organisers name it (S07) and there is a dollar-denominated incident. Runner-up not scored: fuzzing for `fe test` ("`fe test` has no fuzzing", S07).

**Who has the problem.** Protocol developers and auditors handling mixed decimal scales and units.

**Evidence**
- [REPORTED] Aevo / Ribbon, Dec 2025: about $2.7M drained after an oracle update introduced 18-decimal support while older assets used 8 decimals. A separate access-control flaw was also required. (S30)
- [MEASURED] Organisers ask for hooks whose "units and decimal scales were part of the types" and for types that prevent "adding amounts to timestamps". (S07)
- Other oracle or precision incidents appeared in search results only: **UNVERIFIED**, not used.

**Who would pay.** [ASSUMPTION] Nobody this year: Fe is not production-ready (S12), so no production protocol can adopt it. Value is insight for future Fe projects.

**How often it fails / money lost.** One verified incident (about $2.7M, mixed cause). No rate.

**Addressable share.** No defensible number.

**Today's workaround.** [ASSUMPTION] Naming conventions, audits, fixed-point libraries without unit types. Inadequate because the compiler does not reject a scale mismatch.

**Why Fe.** [MEASURED] Fe 26.5 already ships `core::fixed` and typed `Wei`, `Timestamp`, `Duration` (S09); 26.6 adds decimal parsing (S10). [ASSUMPTION] This cuts both ways: Fe is a genuine fit, but the standard library already covers the core, leaving a thinner contribution (token-decimal-indexed amounts, price types).

**Feasibility by Nov 24.** [ASSUMPTION] Medium to high for a library plus one example pool; depends on how far Fe generics go (not verified on the docs pages fetched, S34).

**Originality for a judge.** [ASSUMPTION] Moderate. Units-of-measure typing is known from other languages and is partly in Fe's own std.

---

## Cross-candidate note

[ASSUMPTION] C's strongest element (typed `Wei` / `Timestamp` / `Duration`) can be used inside A's kernel at no extra scope, which raises A's Fe-specific score without building C separately.
