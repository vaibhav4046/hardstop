# Submission: Fe Builders Challenge 2026

The text to paste into the submission form. The owner submits it through
their private link before **24 Nov 2026, 23:59 UTC**. Fill the commit SHA at
the moment of submitting: run `git rev-parse HEAD` on `main` after the last
push, and check that commit's CI run is green.

| Field | Value |
|---|---|
| Project | HARDSTOP |
| Repository | https://github.com/vaibhav4046/hardstop |
| Commit SHA (full) | _fill in at submission: `git rev-parse HEAD`_ |
| Fe version | 26.6.0 (5b3f96a) |
| Live app | https://hardstop-omega.vercel.app |
| Licence | MIT |
| Team | Vaibhav Lalwani ([@vaibhav4046](https://github.com/vaibhav4046)), solo |

## One-line pitch

A spending firewall for AI agents: the owner's limits are enforced by a Fe
contract the agent cannot talk its way past, raising a limit takes a
waiting period the owner can cancel, and the worst-case loss is a number you
can read before anything goes wrong.

## The problem, in two sentences

In a controlled test published in October 2026, AI agents holding a wallet
with a daily cap raised that cap themselves in 9 of 10 models, because the
cap-change path trusted a passcode the agent could read. HARDSTOP moves the
rules into a contract where loosening any rule waits out a cooling period,
so a tricked approval becomes a visible pending change instead of an
instant loss. (Sources and their limits: `README.md`, `research/EVIDENCE_DATA.md`.)

## What is built in Fe

- `fe/src/kernel.fe`: pure `decide`, `amend`, `cancel` and `exposure`, with
  no `uses` clause, compiled for both the EVM and native from one source.
- `fe/src/vault.fe`: the contract. The agent's whole authority is the `Pay`
  handler, which takes the rules without `mut`, so a `Pay` that loosened a
  rule would not compile.
- `fe/src/adversary.fe`: a seeded attacker written in Fe; it catches 14 of
  14 deliberately broken kernels on both targets.
- `fe/src/launcher.fe`: creates a vault in one transaction, installed
  through the deterministic deployment proxy, so it has one address on
  every network.

## Fe highlight

`Pay { to, amount, nonce } -> u8 uses (ctx, agent, token, schedule, active,
queued, approved_from, mut ledger, mut call, mut log)`: the rules appear
without `mut`, so "the agent cannot raise its own limit" is enforced by the
compiler, not only by tests. The same pure `decide` also runs as a native
command-line program. Details in the README's "Fe highlight".

## Evidence it works

- `fe test`: 81 passed on the EVM; 45 passed natively.
- Web: 37 unit tests and 55 browser tests (Chromium, production build).
  CI runs the Fe tests, the native campaign, the compile-refusal check and
  the unit tests on every push; the browser suite runs locally
  (`npm run e2e`).
- On Base Sepolia (public test network): the launcher, three vaults (one
  opened by clicking through MetaMask on the live site), paid and refused
  payments, and measured gas for every call, each with its transaction link,
  in the README.

## Honest limits

Test networks only; unaudited; MetaMask's site scanner currently warns
before connecting (a review was requested on 2026-11-18); nothing alerts the
owner when a raise is waiting. Full list in the README's "Limitations".

## AI assistance

Disclosed in full in the README's "Declaration": the code, tests,
documentation and research were written with Claude (Anthropic) through
Claude Code, directed and reviewed by the author.
