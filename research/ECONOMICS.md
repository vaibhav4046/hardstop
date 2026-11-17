# ECONOMICS

Source IDs refer to SOURCE_REGISTER.md. Accessed 2026-11-17.

## Bottom line

**No defensible estimate of HARDSTOP's market size or of losses it would prevent exists in the evidence gathered.** There is no measured rate of agent mis-spend in production, no adoption data for third-party policy contracts, and no willingness-to-pay data. Everything below is either a measured input, simple arithmetic on measured inputs, or a labelled assumption. None of it is a forecast.

Excluded on purpose: the $3.4B stolen across the crypto ecosystem in 2025 (S01). That figure is not AI-agent losses and is not HARDSTOP's addressable market. It is not an input to any calculation here.

## 1. What the measured data supports

### 1a. Size of agent payment flows (an upper bound on value exposed, not on losses)

| Input | Value | Label | Source |
|---|---|---|---|
| x402 lifetime transactions, to 2026-11-01 | 196,000,000 | measured (tracker: agenteconomy.to), read via secondary | S14 |
| x402 lifetime settled value | more than $42,000,000 | measured, read via secondary | S14 |
| x402 transactions, October 2026 | 5,100,000 | measured, read via secondary | S14 |
| x402 settled value, October 2026 | $274,000 | measured, read via secondary | S14 |
| Allium agent payments, Q3 2026 | 68,300,000 payments, $3,700,000 | measured (Allium classification), read via secondary | S14 |
| Share of x402 payments between $0.0001 and $0.10 | more than 87% | measured (Chainalysis), read via secondary | S14, S17 |
| Share of x402 value on Base from payments of $1 or more, early 2026 | about 95% | measured (Chainalysis), read via secondary | S14 |

Arithmetic:
- Average x402 payment, October 2026: $274,000 / 5,100,000 = **$0.054**
- Average x402 payment, lifetime: $42,000,000 / 196,000,000 = **$0.214** (lower bound, since value is "more than $42M")
- Average Allium agent payment, Q3 2026: $3,700,000 / 68,300,000 = **$0.054**
- October 2026 run rate, annualised: $274,000 × 12 = **$3,288,000 per year**. This assumes October repeats for 12 months [assumption]; monthly transaction count fell 92% from its December 2025 peak (S14), so the run rate is unstable.

Caveats: trackers disagree (one 30-day window was reported as $24M, about $3M, or about $1.6M depending on source and wash-trade filtering, S15); counts may include scripts (S17). These are payment flows, not losses.

What it implies:
- Current measured agent payment flow is in the low millions of dollars per year. Any revenue model that takes a percentage of protected flow is negligible today. Example with an assumed 0.1% fee [assumption] on the whole October run rate (i.e. assuming 100% adoption, which is not realistic): $3,288,000 × 0.001 = $3,288 per year.
- At about 5 cents per payment, a per-payment on-chain policy check is only sensible where gas per check is far below 5 cents. I did not measure gas costs, so no number is given. [assumption] HARDSTOP fits larger payments and treasury-style budgets (the $1-and-above payments that carry about 95% of value), not sub-cent micropayments.

### 1b. Documented agent incidents found in this session

| Incident | Amount | Label | Source |
|---|---|---|---|
| Grok / Bankr, May 2026 | $155,000 to $174,000 (some returned, amount unknown) | reported | S18 (S19 gives $150,000 to $200,000) |
| Lobstar Wilde, Feb 2026 | about $40,000 realised; about $440,000 paper value | reported | S20 |
| Owockibot, Feb 2026 | about $2,100 held in the leaked wallet | reported | S21 |
| OpenAI research model, Jun 2026 | testnet funds, $0 | reported (secondary only) | S22 |
| I-HITL experiment | 10 USDC test wallets | measured, controlled test | S02 |

Arithmetic (S18 range, Lobstar at realised value): low $155,000 + $40,000 + $2,100 = **$197,100**; high $174,000 + $40,000 + $2,100 = **$216,100**.
With Lobstar at paper value: $155,000 + $440,000 + $2,100 = $597,100 to $174,000 + $440,000 + $2,100 = $616,100.

This is a list of incidents I found, not a census, not an annual loss rate and not a market size. Token values are marks on illiquid tokens. Whether a policy kernel would have prevented each one is an assumption (see PROBLEM_EVIDENCE.md).

### 1c. What cannot be estimated

- Probability that a given agent wallet mis-spends in a year: no data.
- Share of agent wallets that would route funds through a third-party policy contract: no data.
- Price a team would pay: no data. The only adjacent data point is a vendor reimbursement cap of $10,000 per month (S04), which is a product term, not a price for policy enforcement.

A loss-avoided figure would be (value under policy) × (annual mis-spend probability) × (share preventable). The second and third inputs are unknown, so the product is not computed.

## 2. Candidates B and C

- **B (freelance escrow):** no defensible estimate. Measured inputs cover lateness only: 48% of 600 Dutch freelancers experience late payment, 18 days late on average (S31). No verified non-payment rate, dispute rate or escrowed volume was found.
- **C (typed DeFi math):** one verified incident of about $2.7M with a mixed root cause (S30). One incident is not a market. Fe is not production-ready (S12), so no production adoption is possible near term.

## 3. The only concrete near-term money

Contest prizes: $2,500 / $1,500 / $1,000 in USDC (measured, S06). Probability of placing is unknown and not estimated.

## 4. Business models

| Model | What it is | Revenue mechanism | Fits a one-week prototype? | Notes |
|---|---|---|---|---|
| Open-source Fe library | Policy kernel, reference contract, native simulator, tests | None directly; contest prize, grants, reputation | **Yes. This is the fit.** | Contest requires a public repo under an OSI-approved licence (S06). |
| Security SDK | Bindings so agent frameworks call the native simulator before signing, and wallets deploy the contract | Support, licensing of integrations | Partly: a thin CLI wrapper is feasible; multi-framework SDKs are not | Needs Fe to be production-ready first (S12). |
| Hosted policy service | Run the simulator as an API and manage policies for customers | Subscription or per-check fee | No | Adds a trusted off-chain party, which weakens the "independently enforced" claim unless the contract stays the source of truth. Flow-based fees are negligible at current volumes (section 1a). |
| Specialised product | A Safe module or guard for treasuries that delegate to agents | Per-treasury licence or services | Stretch: a minimal module is plausible, a product is not | Competes with Safe's allowance module (S28), Polygon Sessions (S29), ERC-7710 tooling (S27). |

Recommendation for the week: ship the open-source library with a reproducible demo. Treat the other three as possible follow-ons that depend on evidence not yet gathered (independent demand, Fe maturity).
